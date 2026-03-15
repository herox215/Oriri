export interface LLMTextBlock {
  type: 'text';
  text: string;
}

export interface LLMToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface LLMToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type LLMContentBlock = LLMTextBlock | LLMToolUseBlock | LLMToolResultBlock;

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | LLMContentBlock[];
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMRequest {
  model: string;
  system: string;
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
  max_tokens: number;
}

export type LLMStopReason = 'end_turn' | 'tool_use' | 'max_tokens';

export interface LLMUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface LLMResponse {
  content: LLMContentBlock[];
  stop_reason: LLMStopReason;
  usage: LLMUsage;
}

export interface LLMProvider {
  createMessage(request: LLMRequest): Promise<LLMResponse>;
}
