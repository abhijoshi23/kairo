import { anthropicProvider } from "./anthropic";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import { LLMError, type LLMProvider } from "./types";

export * from "./types";

const providers: Record<string, LLMProvider> = {
  anthropic: anthropicProvider,

  openai: createOpenAICompatibleProvider({
    name: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: () => process.env.OPENAI_API_KEY,
    defaultModel: "gpt-4o-mini",
  }),

  groq: createOpenAICompatibleProvider({
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: () => process.env.GROQ_API_KEY,
    defaultModel: "llama-3.3-70b-versatile",
  }),

  ollama: createOpenAICompatibleProvider({
    name: "ollama",
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    apiKey: () => undefined,
    requiresKey: false,
    defaultModel: "llama3.2",
  }),
};

/** Resolve the provider named by LLM_PROVIDER (default: anthropic). */
export function getProvider(): LLMProvider {
  const name = (process.env.LLM_PROVIDER ?? "anthropic").trim().toLowerCase();
  const provider = providers[name];
  if (!provider) {
    throw new LLMError(
      `Unknown LLM_PROVIDER "${name}". Valid values: ${Object.keys(providers).join(", ")}`,
      500,
    );
  }
  return provider;
}

/** LLM_MODEL wins if set, otherwise the provider's sensible default. */
export function getModel(provider: LLMProvider): string {
  const override = process.env.LLM_MODEL?.trim();
  return override && override.length > 0 ? override : provider.defaultModel;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getGenerationSettings() {
  return {
    temperature: num(process.env.LLM_TEMPERATURE, 0.7),
    maxTokens: num(process.env.LLM_MAX_TOKENS, 1024),
  };
}
