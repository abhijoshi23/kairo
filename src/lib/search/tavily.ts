import { SearchError, type SearchProvider, type SearchResult } from "./types";

/**
 * Tavily is built for LLM use: it returns cleaned, extracted page content
 * rather than raw SERP snippets, which is what makes answers readable.
 * Free tier at the time of writing: 1,000 credits/month.
 */
export const tavilyProvider: SearchProvider = {
  name: "tavily",

  async search(query, maxResults, signal) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new SearchError("TAVILY_API_KEY is not set", 500);

    const baseUrl = (process.env.TAVILY_BASE_URL ?? "https://api.tavily.com").replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
      }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SearchError(
        `Tavily returned ${response.status}: ${body.slice(0, 200)}`,
        response.status,
      );
    }

    const json = await response.json();
    return (json.results ?? []).map(
      (result: any): SearchResult => ({
        title: String(result.title ?? "Untitled"),
        url: String(result.url ?? ""),
        content: String(result.content ?? ""),
      }),
    );
  },
};
