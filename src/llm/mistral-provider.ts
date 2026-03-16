import { LLMApiError } from '../shared/errors.js';
import type {
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStopReason,
  LLMToolDefinition,
} from './llm-provider.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

interface MistralToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface MistralChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: MistralToolCall[];
  };
  finish_reason: 'stop' | 'tool_calls' | 'length';
}

interface MistralResponse {
  id: string;
  choices: MistralChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface MistralMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: MistralToolCall[];
  tool_call_id?: string;
}

interface MistralTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function toMistralMessages(system: string, messages: LLMMessage[]): MistralMessage[] {
  const result: MistralMessage[] = [{ role: 'system', content: system }];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      const textParts: string[] = [];
      const toolCalls: MistralToolCall[] = [];

      for (const block of msg.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        }
      }

      const assistantMsg: MistralMessage = {
        role: 'assistant',
        content: textParts.length > 0 ? textParts.join('\n') : null,
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      result.push(assistantMsg);
    } else {
      // user messages — may contain tool_result blocks
      const toolResults: LLMContentBlock[] = [];
      const textBlocks: LLMContentBlock[] = [];

      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          toolResults.push(block);
        } else if (block.type === 'text') {
          textBlocks.push(block);
        }
      }

      // Tool results become separate "tool" role messages
      for (const block of toolResults) {
        if (block.type !== 'tool_result') continue;
        result.push({
          role: 'tool',
          content: block.content,
          tool_call_id: block.tool_use_id,
        });
      }

      // Plain text from user
      if (textBlocks.length > 0) {
        const parts: string[] = [];
        for (const b of textBlocks) {
          if (b.type === 'text') parts.push(b.text);
        }
        const text = parts.join('\n');
        if (text.trim()) {
          result.push({ role: 'user', content: text });
        }
      }
    }
  }

  return result;
}

function toMistralTools(tools: LLMToolDefinition[]): MistralTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

function toStopReason(finishReason: string): LLMStopReason {
  switch (finishReason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return 'end_turn';
  }
}

function toContentBlocks(choice: MistralChoice): LLMContentBlock[] {
  const blocks: LLMContentBlock[] = [];

  if (choice.message.content) {
    blocks.push({ type: 'text', text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: unknown;
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        input = {};
      }
      blocks.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input,
      });
    }
  }

  return blocks;
}

export class MistralProvider implements LLMProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    const body = {
      model: request.model,
      messages: toMistralMessages(request.system, request.messages),
      tools: request.tools.length > 0 ? toMistralTools(request.tools) : undefined,
      max_tokens: request.max_tokens,
    };

    let res: Response;
    try {
      res = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error: unknown) {
      throw new LLMApiError(
        `Mistral API request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'unknown');
      throw new LLMApiError(`Mistral API error (${String(res.status)}): ${errorBody}`);
    }

    const data = (await res.json()) as MistralResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new LLMApiError('Mistral API returned no choices');
    }

    return {
      content: toContentBlocks(choice),
      stop_reason: toStopReason(choice.finish_reason),
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      },
    };
  }
}
