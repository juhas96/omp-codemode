import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const provider = fileURLToPath(new URL('./provider.js', import.meta.url));
const mcpFixture = fileURLToPath(new URL('./mcp-fixture.mjs', import.meta.url));
const extension = process.env.MCP_FIND_EXTENSION ?? fileURLToPath(new URL('../mcp-find.js', import.meta.url));

async function rpc(t, { installed = false } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'omp-codemode-'));
  const args = ['--mode=rpc', '--no-session', '--offline', '--no-title'];
  const env = { ...process.env };
  if (!installed) {
    const config = join(cwd, 'test.yml');
    const profile = join(cwd, 'profile');
    const home = join(cwd, 'home');
    await Promise.all([mkdir(profile), mkdir(home)]);
    const approval = { eval: 'allow', read: 'allow', mcp__roster_denied_probe: 'deny' };
    await Promise.all([
      writeFile(config, JSON.stringify({ tools: { approval },
        mcp: { evalNamespaces: true, shared: false, startupTimeoutMs: 0 } })),
      writeFile(join(profile, 'mcp.json'), JSON.stringify({
        mcpServers: Object.fromEntries(['roster', 'alternate-sample'].map(server => [server, {
          command: process.execPath, args: [mcpFixture, server, join(cwd, 'mcp-calls.jsonl')], instructions: false,
        }])),
      })),
    ]);
    env.HOME = home;
    env.PI_CODING_AGENT_DIR = profile;
    delete env.PI_CONFIG_DIR;
    args.push('--no-extensions', '--no-context-files', '--no-rules', '--no-skills', '--no-lsp',
      '--model=codemode-test/fixture', '--extension=' + provider, '--extension=' + extension,
      '--config=' + config, '--tools=eval,read,mcp_find,time_zone_local_fixture');
  }

  const child = spawn('omp', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  child.stdin.on('error', error => { stderr += error.message; });
  const terminate = () => child.kill('SIGTERM');
  t.signal.addEventListener('abort', terminate, { once: true });
  t.after(async () => {
    child.stdin.end();
    await closed;
    await rm(cwd, { recursive: true, force: true });
  });

  let nextId = 0;
  async function send(type, fields = {}) {
    const toolEvents = [];
    const id = String(++nextId);
    child.stdin.write(JSON.stringify({ type, id, ...fields }) + '\n');
    let response;
    let result;
    while (!response || (response.data?.agentInvoked !== false && type === 'prompt' && !result)) {
      const line = await lines.next();
      assert.ok(!line.done, `OMP stopped before ${type}: ${stderr}`);
      const event = JSON.parse(line.value);
      if (event.type.startsWith('tool_execution_')) toolEvents.push(event);
      if (event.id !== id) continue;
      if (event.type === 'response') {
        assert.equal(event.success, true, JSON.stringify(event));
        response = event;
      }
      if (event.type === 'prompt_result') {
        assert.equal(event.status, 'completed', JSON.stringify(event));
        result = event;
      }
    }
    return { ...response.data, toolEvents };
  }

  return {
    cwd, send,
    command: message => send('prompt', { message }),
    async turn(message = 'inspect') {
      const { toolEvents } = await send('prompt', { message });
      const { text } = await send('get_last_assistant_text');
      assert.ok(text, `missing model response; native tool events: ${JSON.stringify(toolEvents)}`);
      return { ...JSON.parse(text), toolEvents };
    },
  };
}

const timeout = 45_000;

test('finder publishes one-lookup guidance without changing the system prompt or adding a command', { timeout }, async t => {
  const host = await rpc(t);
  const snapshot = await host.turn();
  assert.ok(snapshot.tools.includes('eval') && snapshot.tools.includes('read'));
  assert.match(snapshot.finderDescription, /try one focused lookup/i);
  assert.match(snapshot.finderDescription, /read help:\/\/eval\/<namespace> instead of searching again/i);
  assert.match(snapshot.finderDescription, /skip lookup when the signature is known/i);
  assert.equal(snapshot.hasGenericGuidance, false);
  assert.deepEqual(snapshot.toolEvents, []);
  const { commands } = await host.send('get_available_commands');
  assert.ok(!commands.some(command => command.name === 'codemode'));
});

test('MCP discovery returns only matching enabled signatures without calling the server', { timeout }, async t => {
  const host = await rpc(t);
  const call = (name, args) => host.turn('fixture-call ' + JSON.stringify({ name, arguments: args }));
  const show = snapshot => JSON.parse(snapshot.result.map(block => block.text).join('\n'));
  const list = 'mcp__roster_list_time_zones';
  const hidden = 'mcp__roster_hidden_lookup';
  const callLog = join(host.cwd, 'mcp-calls.jsonl');

  const before = await host.turn();
  assert.ok(before.enabled.includes(hidden), 'fixture method did not connect');
  assert.ok(before.tools.includes('time_zone_local_fixture'));
  assert.ok(!before.tools.includes(list), 'fixture method should be namespaced, not direct');
  const first = await call('mcp_find', { query: 'time zones update window', server: 'ROSTER' });
  assert.deepEqual(first.enabled, before.enabled);
  const { matches } = show(first);
  assert.deepEqual(matches.map(hit => hit.name), [list]);
  assert.equal(matches[0].server, 'roster');
  assert.equal(matches[0].method, 'list_time_zones');
  assert.deepEqual(matches[0].arguments.required, ['region']);
  assert.deepEqual(matches[0].arguments.properties.format.enum, ['iana', 'windows']);
  const unscoped = show(await call('mcp_find', { query: 'time zones update window', limit: 3 })).matches;
  assert.ok(unscoped.some(hit => hit.server === 'alternate-sample'));
  assert.ok(unscoped.every(hit => hit.name.startsWith('mcp__')));
  const description = show(await call('mcp_find', { query: hidden })).matches[0].description;
  assert.ok(description.startsWith('Look up hidden entries.') && description.length <= 240 && description.endsWith('…'));

  const tied = show(await call('mcp_find', { query: 'time', server: 'roster', limit: 3 })).matches;
  assert.deepEqual(tied.map(hit => hit.method), ['list_time_zones', 'time_zone_aliases', 'time_zone_history']);
  const invalid = await call('mcp_find', { query: 'time', limit: 4 });
  assert.match(invalid.result.map(block => block.text).join('\n'), /limit\b/i);
  const blank = await call('mcp_find', { query: '   ' });
  assert.match(blank.result.map(block => block.text).join('\n'), /query\b/i);
  assert.deepEqual(show(await call('mcp_find', { query: list.toUpperCase(), server: 'ROSTER' })).matches.map(hit => hit.name), [list]);
  const alias = show(await call('mcp_find', { query: 'time zones update window', server: 'alternate_sample' })).matches;
  assert.deepEqual(alias.map(hit => hit.server), ['alternate-sample']);
  assert.deepEqual(show(await call('mcp_find', { query: list, server: 'alternate-sample' })).matches, []);
  assert.deepEqual(show(await call('mcp_find', { query: 'photosynthesis' })).matches, []);
  const oversized = show(await call('mcp_find', { query: 'mcp__roster_huge_schema' })).matches[0];
  assert.ok(!('arguments' in oversized) && oversized.schemaOmitted.includes('help://eval/'));
  await host.command('/hide-fixture-method');
  assert.deepEqual(show(await call('mcp_find', { query: hidden })).matches, []);
  await assert.rejects(access(callLog), { code: 'ENOENT' });

  const denied = show(await call('mcp_find', { query: 'mcp__roster_denied_probe' })).matches[0].name;
  const evaluated = await call('eval', { language: 'js', code: `
    print(await tool[${JSON.stringify(matches[0].name)}]({ region: 'eu', format: 'iana' }));
    try { await tool[${JSON.stringify(denied)}]({}); }
    catch (error) { print(error.message); }
  ` });
  const result = evaluated.result.map(block => block.text).join('\n');
  assert.match(result, /Europe\/Bratislava/);
  assert.match(result, /blocked by user policy/);
  assert.deepEqual((await readFile(callLog, 'utf8')).trim().split('\n').map(JSON.parse),
    [{ server: 'roster', name: 'list_time_zones', args: { region: 'eu', format: 'iana' } }]);
});

test('default profile no longer exposes the generic Code Mode command', {
  timeout, skip: process.env.MCP_FIND_TEST_INSTALLED !== '1',
}, async t => {
  const host = await rpc(t, { installed: true });
  const { commands } = await host.send('get_available_commands');
  assert.ok(!commands.some(command => command.name === 'codemode'));
});
