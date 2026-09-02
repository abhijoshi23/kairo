export interface SearchResult {
  title: string;
  url: string;
  /** A snippet or extract. Untrusted text from the open internet. */
  content: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult[]>;
}

export class SearchError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = "SearchError";
  }
}
