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
const extension = process.env.CODEMODE_EXTENSION ?? fileURLToPath(new URL('../codemode.js', import.meta.url));
const first = 'raw-apple-907';
const second = 'raw-blackberry-341';

async function rpc(t, { installed = false, tools = 'eval,read,write', js = true, mcp = false } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'omp-codemode-'));
  const args = ['--mode=rpc', '--no-session', '--offline', '--no-title'];
  const env = { ...process.env };
  if (!installed) {
    const config = join(cwd, 'test.yml');
    const profile = join(cwd, 'profile');
    const home = join(cwd, 'home');
    await Promise.all([mkdir(profile), mkdir(home)]);
    const approval = { eval: 'allow', read: 'allow', write: 'deny', mcp__roster_denied_probe: 'deny' };
    await Promise.all([
      writeFile(config, JSON.stringify({ eval: { js }, tools: { approval },
        mcp: { evalNamespaces: mcp, shared: false, startupTimeoutMs: 0 } })),
      writeFile(join(cwd, 'a.txt'), first),
      writeFile(join(cwd, 'b.txt'), second),
      ...(mcp ? [writeFile(join(profile, 'mcp.json'), JSON.stringify({
        mcpServers: Object.fromEntries(['roster', 'alternate-sample'].map(server => [server, {
          command: process.execPath, args: [mcpFixture, server, join(cwd, 'mcp-calls.jsonl')], instructions: false,
        }])),
      }))] : []),
    ]);
    env.HOME = home;
    env.PI_CODING_AGENT_DIR = profile;
    delete env.PI_CONFIG_DIR;
    delete env.PI_JS;
    args.push('--no-extensions', '--no-context-files', '--no-rules', '--no-skills', '--no-lsp',
      '--model=codemode-test/fixture', '--extension=' + provider, '--extension=' + extension,
      '--config=' + config, '--tools=' + tools);
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
    const notifications = [];
    let response;
    let result;
    while (!response || (response.data?.agentInvoked !== false && type === 'prompt' && !result)) {
      const line = await lines.next();
      assert.ok(!line.done, `OMP stopped before ${type}: ${stderr}`);
      const event = JSON.parse(line.value);
      if (event.type.startsWith('tool_execution_')) toolEvents.push(event);
      if (event.type === 'extension_ui_request' && event.method === 'notify') notifications.push(event.message);
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
    return { ...response.data, notifications, toolEvents };
  }

  return {
    cwd, send,
    command: message => send('prompt', { message }),
    async turn(message = 'inspect') {
      const { toolEvents } = await send('prompt', { message });
      const { text } = await send('get_last_assistant_text');
      assert.ok(text, `missing model response; native tool events: ${JSON.stringify(toolEvents)}`);
      return JSON.parse(text);
    },
  };
}

const timeout = 45_000;

test('fresh process guides a native Eval batch and preserves direct tools and nested approvals', { timeout }, async t => {
  const host = await rpc(t);
  const snapshot = await host.turn('exercise');
  assert.equal(snapshot.guided, true);
  assert.equal(snapshot.keptBase, true);
  for (const name of ['eval', 'read', 'write']) assert.ok(snapshot.tools.includes(name), `missing direct ${name}`);
  const text = snapshot.result?.map(block => block.text).join('\n');
  assert.ok(text, `no native Eval result: ${JSON.stringify(snapshot)}`);
  assert.deepEqual(JSON.parse(text), { lengths: [first.length, second.length], denied: true });
  const leakedAt = snapshot.transcript.indexOf(first);
  assert.ok(leakedAt < 0 && !snapshot.transcript.includes(second),
    `raw tool output reached the provider context: ${snapshot.transcript.slice(Math.max(0, leakedAt - 150), leakedAt + 150)}`);
  await assert.rejects(access(join(host.cwd, 'blocked.txt')), { code: 'ENOENT' });
});

test('slash command reports status, turns guidance off and on, and rejects invalid values', { timeout }, async t => {
  const host = await rpc(t);
  assert.deepEqual((await host.command('/codemode')).notifications, ['Code Mode is on.']);
  await host.command('/codemode off');
  assert.equal((await host.turn()).guided, false);
  assert.deepEqual((await host.command('/codemode invalid')).notifications, ['Usage: /codemode [on|off]']);
  assert.equal((await host.turn()).guided, false);
  await host.command('/codemode on');
  assert.equal((await host.turn()).guided, true);
});

for (const [description, options, evalActive] of [
  ['Eval excluded', { tools: 'read' }, false],
  ['JavaScript disabled', { js: false }, true],
]) {
  test(`leaves tools alone and does not suggest code mode with ${description}`, { timeout }, async t => {
    const host = await rpc(t, options);
    assert.deepEqual((await host.command('/codemode')).notifications, ['Code Mode is on, but JavaScript eval is unavailable.']);
    const snapshot = await host.turn();
    assert.equal(snapshot.guided, false);
    assert.ok(snapshot.tools.includes('read'));
    assert.equal(snapshot.tools.includes('eval'), evalActive);
  });
}

test('MCP discovery returns only matching enabled signatures without calling the server', { timeout }, async t => {
  const host = await rpc(t, { mcp: true, tools: 'eval,read,mcp_find,time_zone_local_fixture' });
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

test('installed discovery exposes the command without an explicit extension path', {
  timeout, skip: process.env.CODEMODE_TEST_INSTALLED !== '1',
}, async t => {
  const host = await rpc(t, { installed: true });
  const { commands } = await host.send('get_available_commands');
  assert.ok(commands.some(command => command.name === 'codemode'));
});
