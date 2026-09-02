import { SearchError, type SearchProvider, type SearchResult } from "./types";

/**
 * Serper wraps Google's result page as JSON. Snippets are shorter than
 * Tavily's extracts, but the free allowance is larger (2,500/month at the
 * time of writing) and the results are Google's.
 */
export const serperProvider: SearchProvider = {
  name: "serper",

  async search(query, maxResults, signal) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new SearchError("SERPER_API_KEY is not set", 500);

    const baseUrl = (process.env.SERPER_BASE_URL ?? "https://google.serper.dev").replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ q: query, num: maxResults }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SearchError(
        `Serper returned ${response.status}: ${body.slice(0, 200)}`,
        response.status,
      );
    }

    const json = await response.json();
    const results: SearchResult[] = [];

    // Google's answer box, when present, is usually the best single result.
    if (json.answerBox?.snippet || json.answerBox?.answer) {
      results.push({
        title: String(json.answerBox.title ?? "Answer"),
        url: String(json.answerBox.link ?? ""),
        content: String(json.answerBox.answer ?? json.answerBox.snippet ?? ""),
      });
    }

    for (const item of json.organic ?? []) {
      results.push({
        title: String(item.title ?? "Untitled"),
        url: String(item.link ?? ""),
        content: String(item.snippet ?? ""),
      });
    }

    return results.slice(0, maxResults);
  },
};
