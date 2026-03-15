import type { LLMProviderType } from '../config/config-types.js';
import { AnthropicProvider } from './anthropic-provider.js';
import type { LLMProvider } from './llm-provider.js';

const PROVIDER_FACTORIES: Record<LLMProviderType, (apiKey: string) => LLMProvider> = {
  anthropic: (apiKey) => new AnthropicProvider(apiKey),
};

export function createLLMProvider(provider: LLMProviderType, apiKey: string): LLMProvider {
  return PROVIDER_FACTORIES[provider](apiKey);
}
