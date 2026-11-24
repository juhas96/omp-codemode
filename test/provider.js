import { AssistantMessageEventStream } from '@oh-my-pi/pi-ai';

export default function testProvider(omp) {
  omp.registerCommand('hide-fixture-method', {
    description: 'Disable a fixture tool without removing its registry metadata',
    async handler() {
      await omp.setActiveTools(omp.getActiveTools().filter(name => name !== 'mcp__roster_hidden_lookup'));
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
        request = texts.find(text => text.startsWith('fixture-call '));
        return request !== undefined;
      });
      const result = requestIndex === -1 ? undefined : context.messages.slice(requestIndex + 1)
        .findLast(message => message.role === 'toolResult')?.content;
      const toolCall = request && !result ? JSON.parse(request.slice('fixture-call '.length)) : undefined;
      const snapshot = {
        hasGenericGuidance: String(context.systemPrompt).includes('## Code Mode'),
        finderDescription: context.tools.find(tool => tool.name === 'mcp_find')?.description,
        tools: context.tools.map(tool => tool.name),
        enabled: omp.getActiveTools(),
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
