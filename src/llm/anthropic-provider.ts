import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlock, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages.js';

import { LLMApiError } from '../shared/errors.js';
import type {
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStopReason,
} from './llm-provider.js';

function toLLMContentBlock(block: ContentBlock): LLMContentBlock {
  if (block.type === 'text') {
    return { type: 'text', text: block.text };
  }
  if (block.type === 'tool_use') {
    return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
  }
  return { type: 'text', text: `[unsupported block type: ${block.type}]` };
}

function toMessageParam(message: LLMMessage): MessageParam {
  if (typeof message.content === 'string') {
    return { role: message.role, content: message.content };
  }

  const content = message.content.map((block) => {
    if (block.type === 'text') {
      return { type: 'text' as const, text: block.text };
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    }
    // tool_result
    return {
      type: 'tool_result' as const,
      tool_use_id: block.tool_use_id,
      content: block.content,
      is_error: block.is_error,
    };
  });

  return { role: message.role, content };
}

function toTool(def: {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}): Tool {
  return {
    name: def.name,
    description: def.description,
    input_schema: def.input_schema as Tool['input_schema'],
  };
}

export class AnthropicProvider implements LLMProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await this.client.messages.create({
        model: request.model,
        system: request.system,
        messages: request.messages.map(toMessageParam),
        tools: request.tools.map(toTool),
        max_tokens: request.max_tokens,
      });

      return {
        content: response.content.map(toLLMContentBlock),
        stop_reason: response.stop_reason as LLMStopReason,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (error: unknown) {
      if (error instanceof Anthropic.APIError) {
        throw new LLMApiError(`Anthropic API error (${String(error.status)}): ${error.message}`);
      }
      throw error;
    }
  }
}
