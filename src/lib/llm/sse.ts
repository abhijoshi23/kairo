/**
 * Every major LLM API streams over Server-Sent Events (SSE): a plain HTTP
 * response whose body is a series of lines like
 *
 *     data: {"type":"content_block_delta", ...}
 *     data: {"type":"message_stop"}
 *     data: [DONE]
 *
 * There is no magic here. We read the raw byte stream, decode it, split on
 * newlines, and hand back whatever followed `data:`. Writing this by hand
 * once is the fastest way to stop thinking of streaming as a black box.
 */
export async function* sseLines(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error("Response has no body to stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream: true keeps multi-byte characters intact across chunk edges.
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith("data:")) {
          yield line.slice("data:".length).trim();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Pull the most useful message out of a failed API response. */
export async function describeHttpError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message ?? parsed?.message ?? raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300) || response.statusText;
  }
}
