import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [server, callLog] = process.argv.slice(2);
const tool = (name, description, properties = {}, required = []) => ({
  name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false },
});
const tools = server === 'roster' ? [
  tool('list_time_zones', 'List allowed time zones for the update window.', {
    region: { type: 'string' }, format: { type: 'string', enum: ['iana', 'windows'] },
  }, ['region']),
  tool('archive_probe', 'List allowed time zones for the update window.'),
  tool('time_zone_history', 'List historical time zone changes.'),
  tool('time_zone_rules', 'List time zone rules.'),
  tool('time_zone_aliases', 'List aliases for time zones.'),
  tool('hidden_lookup', 'Look up hidden entries. ' + 'Long fixture text. '.repeat(50)),
  tool('denied_probe', 'Print the synthetic denial marker.'),
  tool('huge_schema', 'Tool with a large input schema.', Object.fromEntries(
    Array.from({ length: 120 }, (_, i) => [`fixture_input_${i}`, { type: 'string' }]),
  )),
] : [tool('list_time_zones', 'List allowed time zones for the update window.')];

for await (const line of createInterface({ input: process.stdin })) {
  const { method, id, params } = JSON.parse(line);
  if (id == null) continue;
  let result;
  switch (method) {
    case 'initialize': result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: server, version: '1' } }; break;
    case 'tools/list': result = { tools }; break;
    case 'tools/call':
      appendFileSync(callLog, JSON.stringify({ server, name: params.name, args: params.arguments }) + '\n');
      result = { content: [{ type: 'text', text: params.name === 'list_time_zones' ? 'Europe/Bratislava' : 'DENY_REACHED' }] };
      break;
    case 'ping': result = {}; break;
    default:
      console.log(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unsupported method' } }));
      continue;
  }
  console.log(JSON.stringify({ jsonrpc: '2.0', id, result }));
}
