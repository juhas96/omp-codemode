import { AssistantMessageEventStream } from '@oh-my-pi/pi-ai';

const exercise = `
const reads = await Promise.all(['a.txt', 'b.txt'].map(path =>
  tool.read({ path, i: 'Reading test fixture' })));
const lengths = reads.map(result => (typeof result === 'string' ? result : result.text).length);
try {
  await tool.write({ path: 'blocked.txt', content: 'should not exist', i: 'Checking denied test write' });
  print(JSON.stringify({ lengths, denied: false }));
} catch (error) {
  print(JSON.stringify({ lengths, denied: /blocked by user policy/.test(error.message) }));
}
`;

export default function testProvider(omp) {
  omp.on('before_agent_start', event => ({
    systemPrompt: [...event.systemPrompt, 'codemode-test-base-sentinel'],
  }));
  omp.registerCommand('hide-fixture-method', {
    description: 'Disable a fixture tool without removing its registry metadata',
    async handler(args) {
      const name = args.trim() || 'mcp__roster_hidden_lookup';
      await omp.setActiveTools(omp.getActiveTools().filter(tool => tool !== name));
    },
  });
  omp.registerTool({
    name: 'time_zone_local_fixture',
    label: 'Local time zone fixture',
    description: 'List time zones for the update window.',
    parameters: omp.zod.object({}),
    async execute() { return { content: [{ type: 'text', text: 'not MCP' }] }; },
  });

  omp.registerProvider('codemode-test', {
    baseUrl: 'http://127.0.0.1:1',
    apiKey: 'fixture-only',
    api: 'codemode-test',
    models: [{
      id: 'fixture', name: 'Fixture', reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 16384, maxTokens: 1024,
    }],
    streamSimple(model, context) {
      let request;
      const requestIndex = context.messages.findLastIndex(message => {
        if (message.role !== 'user') return false;
        const texts = typeof message.content === 'string' ? [message.content]
          : message.content.filter(block => block.type === 'text').map(block => block.text);
        request = texts.find(text => text === 'exercise' || text.startsWith('fixture-call '));
        return request !== undefined;
      });
      const exerciseRequested = request === 'exercise';
      const result = requestIndex === -1 ? undefined : context.messages.slice(requestIndex + 1)
        .findLast(message => message.role === 'toolResult')?.content;
      const system = String(context.systemPrompt);
      const guided = system.includes('## Code Mode') && system.includes('await tool.<name>(args)');
      const toolCall = result ? undefined : exerciseRequested && guided
        ? { name: 'eval', arguments: { language: 'js', code: exercise } }
        : request?.startsWith('fixture-call ') ? JSON.parse(request.slice('fixture-call '.length)) : undefined;
      const snapshot = {
        guided,
        discoveryGuidance: system.split('\n').find(line => /call mcp_find first/i.test(line)) ?? null,
        keptBase: system.includes('codemode-test-base-sentinel'),
        tools: context.tools.map(tool => tool.name),
        enabled: omp.getActiveTools(),
        transcript: exerciseRequested
          ? JSON.stringify(context.messages.map(({ role, content }) => ({ role, content })))
          : undefined,
        result,
      };
      const stopReason = toolCall ? 'toolUse' : 'stop';
      const message = {
        role: 'assistant', api: model.api, provider: model.provider, model: model.id,
        timestamp: Date.now(), stopReason,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: toolCall
          ? [{ type: 'toolCall', id: 'test-call-' + requestIndex, ...toolCall }]
          : [{ type: 'text', text: JSON.stringify(snapshot) }],
      };
      const stream = new AssistantMessageEventStream();
      stream.push({ type: 'start', partial: { ...message, content: [] } });
      if (toolCall) {
        stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: message.content[0], partial: message });
      }
      stream.push({ type: 'done', reason: stopReason, message });
      return stream;
    },
  });
}
