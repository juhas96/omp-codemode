import { toolWireSchema } from '@oh-my-pi/pi-ai';

const maxDescription = 240;
const maxSchema = 4096;

function words(text) {
  return new Set(text.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().match(/[\p{L}\p{N}]+/gu));
}

const normalizeServer = name => name.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function resolveServer(methods, server) {
  const name = server.toLowerCase();
  const alias = normalizeServer(name);
  const candidates = new Set();
  for (const method of methods) {
    const original = method.mcpServerName.toLowerCase();
    if (original === name) return original;
    if (alias && normalizeServer(original) === alias) candidates.add(original);
  }
  return candidates.size === 1 ? candidates.values().next().value : undefined;
}

function findMethods(omp, { query, server, limit = 1 }) {
  const enabled = new Set(omp.getActiveTools());
  const methods = omp.getAllTools().filter(tool => tool.mcpServerName && tool.mcpToolName && enabled.has(tool.name));
  const serverName = server && resolveServer(methods, server);
  if (server && !serverName) return [];
  const needle = query.toLowerCase();
  const exact = needle.startsWith('mcp__');
  const terms = exact ? undefined : words(query);
  const hits = [];

  for (const tool of methods) {
    if (serverName && tool.mcpServerName.toLowerCase() !== serverName) continue;
    if (exact) {
      if (tool.name.toLowerCase() !== needle) continue;
      return [tool];
    }

    const nameWords = words(tool.mcpToolName);
    const descriptionWords = words(tool.description);
    let nameHits = 0;
    let descriptionHits = 0;
    for (const term of terms) {
      if (nameWords.has(term)) nameHits++;
      if (descriptionWords.has(term)) descriptionHits++;
    }
    if (nameHits || descriptionHits) hits.push({ tool, nameHits, descriptionHits });
  }

  hits.sort((a, b) => b.nameHits - a.nameHits || b.descriptionHits - a.descriptionHits
    || (a.tool.name < b.tool.name ? -1 : a.tool.name > b.tool.name ? 1 : 0));
  return hits.slice(0, limit).map(hit => hit.tool);
}

function describeMethod(tool) {
  const description = tool.description.replace(/\s+/g, ' ').trim();
  const hit = {
    name: tool.name,
    server: tool.mcpServerName,
    method: tool.mcpToolName,
    description: description.length <= maxDescription ? description : description.slice(0, maxDescription - 1) + '…',
  };
  const schema = toolWireSchema(tool);
  return JSON.stringify(schema).length <= maxSchema
    ? { ...hit, arguments: schema }
    : { ...hit, schemaOmitted: 'Argument schema too large. Use native help://eval/<namespace> for the full signature.' };
}

export function registerMcpFind(omp) {
  const z = omp.zod;
  omp.registerTool({
    name: 'mcp_find',
    label: 'MCP Find',
    description: 'Find enabled MCP methods and their argument schemas before opening full namespace help. In native Eval use await tool[name](args) with the returned name.',
    loadMode: 'essential',
    approval: 'read',
    parameters: z.object({
      query: z.string().trim().min(1).max(240).describe('Keywords or exact registered MCP tool name'),
      server: z.string().trim().min(1).max(160).optional().describe('MCP server name or its namespace spelling, if known'),
      limit: z.number().int().min(1).max(3).optional().describe('Maximum matches; defaults to one'),
    }),
    async execute(_id, params) {
      const matches = findMethods(omp, params).map(describeMethod);
      return { content: [{ type: 'text', text: JSON.stringify({ matches }) }] };
    },
  });
}
