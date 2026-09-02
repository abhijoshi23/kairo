import { serperProvider } from "./serper";
import { tavilyProvider } from "./tavily";
import type { SearchProvider } from "./types";

export * from "./types";

const providers: Record<string, SearchProvider> = {
  tavily: tavilyProvider,
  serper: serperProvider,
};

/**
 * Returns null when search is switched off or unconfigured. Null is a normal
 * state, not an error: Kairo simply does not offer the tool to the model, and
 * behaves exactly as it did before search existed.
 */
export function getSearchProvider(): SearchProvider | null {
  const name = (process.env.SEARCH_PROVIDER ?? "none").trim().toLowerCase();
  if (name === "none" || name === "") return null;

  const provider = providers[name];
  if (!provider) return null;

  // A provider without its key is the same as no provider.
  const hasKey =
    (name === "tavily" && process.env.TAVILY_API_KEY) ||
    (name === "serper" && process.env.SERPER_API_KEY);

  return hasKey ? provider : null;
}
