import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from './anthropic-provider.js';
import { LLMApiError } from '../shared/errors.js';
import type { LLMRequest } from './llm-provider.js';

vi.mock('@anthropic-ai/sdk', () => {
  const createMock = vi.fn();

  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  }

  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));

  (MockAnthropic as Record<string, unknown>)['APIError'] = MockAPIError;

  return { default: MockAnthropic, __createMock: createMock, __APIError: MockAPIError };
});

async function getCreateMock(): Promise<ReturnType<typeof vi.fn>> {
  const mod = await import('@anthropic-ai/sdk');
  return (mod as unknown as { __createMock: ReturnType<typeof vi.fn> }).__createMock;
}

async function getAPIError(): Promise<
  new (status: number, message: string) => Error & { status: number }
> {
  const mod = await import('@anthropic-ai/sdk');
  return (
    mod as unknown as {
      __APIError: new (status: number, message: string) => Error & { status: number };
    }
  ).__APIError;
}

function makeRequest(overrides?: Partial<LLMRequest>): LLMRequest {
  return {
    model: 'claude-sonnet-4-6',
    system: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [
      {
        name: 'read_file',
        description: 'Read a file',
        input_schema: { type: 'object', properties: { path: { type: 'string' } } },
      },
    ],
    max_tokens: 1024,
    ...overrides,
  };
}

describe('AnthropicProvider', () => {
  let createMock: ReturnType<typeof vi.fn>;
  let provider: AnthropicProvider;

  beforeEach(async () => {
    createMock = await getCreateMock();
    createMock.mockReset();
    provider = new AnthropicProvider('test-api-key');
  });

  it('should map a text response correctly', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello there!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const response = await provider.createMessage(makeRequest());

    expect(response.content).toEqual([{ type: 'text', text: 'Hello there!' }]);
    expect(response.stop_reason).toBe('end_turn');
    expect(response.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it('should map a tool_use response correctly', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'text', text: 'Let me read that file.' },
        { type: 'tool_use', id: 'toolu_123', name: 'read_file', input: { path: 'src/index.ts' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 20, output_tokens: 15 },
    });

    const response = await provider.createMessage(makeRequest());

    expect(response.content).toHaveLength(2);
    expect(response.content[0]).toEqual({ type: 'text', text: 'Let me read that file.' });
    expect(response.content[1]).toEqual({
      type: 'tool_use',
      id: 'toolu_123',
      name: 'read_file',
      input: { path: 'src/index.ts' },
    });
    expect(response.stop_reason).toBe('tool_use');
  });

  it('should pass tool_result messages to the API', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'Got it.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 30, output_tokens: 5 },
    });

    const request = makeRequest({
      messages: [
        { role: 'user', content: 'Read index.ts' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'read_file',
              input: { path: 'src/index.ts' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_123', content: 'file contents here' },
          ],
        },
      ],
    });

    await provider.createMessage(request);

    const callArgs = createMock.mock.calls[0][0] as Record<string, unknown>;
    const messages = callArgs['messages'] as Array<{ content: Array<Record<string, unknown>> }>;
    expect(messages).toHaveLength(3);
    expect(messages[2].content[0]['type']).toBe('tool_result');
    expect(messages[2].content[0]['tool_use_id']).toBe('toolu_123');
  });

  it('should pass tools and system prompt to the API', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 2 },
    });

    await provider.createMessage(makeRequest());

    const callArgs = createMock.mock.calls[0][0] as Record<string, unknown>;
    const tools = callArgs['tools'] as Array<Record<string, unknown>>;
    expect(callArgs['model']).toBe('claude-sonnet-4-6');
    expect(callArgs['system']).toBe('You are a helpful assistant.');
    expect(tools).toHaveLength(1);
    expect(tools[0]['name']).toBe('read_file');
    expect(callArgs['max_tokens']).toBe(1024);
  });

  it('should wrap Anthropic API errors in LLMApiError', async () => {
    const APIError = await getAPIError();
    createMock.mockRejectedValue(new APIError(429, 'Rate limit exceeded'));

    await expect(provider.createMessage(makeRequest())).rejects.toThrow(LLMApiError);
    await expect(provider.createMessage(makeRequest())).rejects.toThrow(/429/);
  });

  it('should re-throw non-API errors', async () => {
    createMock.mockRejectedValue(new TypeError('Network failure'));

    await expect(provider.createMessage(makeRequest())).rejects.toThrow(TypeError);
  });
});
