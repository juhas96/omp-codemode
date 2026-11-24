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
      const exerciseRequested = context.messages.some(message => message.role === 'user' && (
        typeof message.content === 'string'
          ? message.content === 'exercise'
          : message.content.some(block => block.type === 'text' && block.text === 'exercise')
      ));
      const result = context.messages.findLast(message => message.role === 'toolResult')?.content;
      const system = String(context.systemPrompt);
      const guided = system.includes('## Code Mode') && system.includes('await tool.<name>(args)');
      const toolCall = exerciseRequested && !result && guided;
      const snapshot = {
        guided,
        keptBase: system.includes('codemode-test-base-sentinel'),
        tools: context.tools.map(tool => tool.name),
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
          ? [{ type: 'toolCall', id: 'test-eval-call', name: 'eval', arguments: { language: 'js', code: exercise } }]
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
