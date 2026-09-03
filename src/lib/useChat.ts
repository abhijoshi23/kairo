"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Source {
  title: string;
  url: string;
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Pages the assistant consulted, shown so you can check its homework. */
  sources?: Source[];
}

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

// Local only, on purpose - no account system exists yet to key a server-side
// history by. Swap this for a database write once one does.
const STORAGE_KEY = "kairo:messages";

function loadStoredMessages(): UiMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * All the client-side chat logic in one hook, so the components stay dumb.
 *
 * The core trick is `readStream`: read the body chunk by chunk, split on
 * newlines, and act on each event. Text deltas append to the last message -
 * that append-in-a-loop IS the typing effect. Tool events update a status
 * line, because a search takes a second or two and silence reads as broken.
 */
export function useChat() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restored after mount, not in the initial useState, so the server-rendered
  // empty state and the client's first render still match - hydration would
  // otherwise fail the moment a browser actually has something stored.
  useEffect(() => {
    const stored = loadStoredMessages();
    if (stored.length > 0) setMessages(stored);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (messages.length > 0) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage full or disabled (private browsing) - conversation still
      // works for the session, it just won't survive a reload.
    }
  }, [messages]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setActivity(null);
  }, []);

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
    // Clear storage here too, synchronously, rather than relying only on the
    // effect above - a caller that navigates away right after reset() (sign
    // out redirects immediately) can't count on React having flushed that
    // effect first.
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Storage disabled - nothing was persisted to clear anyway.
      }
    }
  }, [stop]);

  const send = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text || isStreaming) return;

      setError(null);
      const userMessage: UiMessage = { id: newId(), role: "user", content: text };
      const assistantMessage: UiMessage = { id: newId(), role: "assistant", content: "" };

      // Only role + content go to the server; sources are display-only.
      const history = [...messages, userMessage].map(({ role, content }) => ({ role, content }));

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const updateAssistant = (update: (message: UiMessage) => UiMessage) =>
        setMessages((current) =>
          current.map((message) => (message.id === assistantMessage.id ? update(message) : message)),
        );

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });

        // The session cookie expires after 7 days. Send them back to login
        // rather than showing a cryptic error.
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${response.status})`);
        }
        if (!response.body) throw new Error("No response stream");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const raw = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!raw) continue;

            const event = JSON.parse(raw);

            switch (event.type) {
              case "delta":
                setActivity(null);
                updateAssistant((message) => ({
                  ...message,
                  content: message.content + event.text,
                }));
                break;

              case "tool_start":
                setActivity(
                  event.query ? `Searching the web for "${event.query}"` : "Searching the web",
                );
                break;

              case "tool_end":
                setActivity(null);
                if (Array.isArray(event.sources) && event.sources.length > 0) {
                  updateAssistant((message) => ({
                    ...message,
                    // Merge across rounds, de-duplicated by URL.
                    sources: [
                      ...(message.sources ?? []),
                      ...event.sources.filter(
                        (source: Source) =>
                          !(message.sources ?? []).some((existing) => existing.url === source.url),
                      ),
                    ],
                  }));
                }
                break;

              case "error":
                throw new Error(event.message);
            }
          }
        }
      } catch (caught) {
        if ((caught as Error).name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Something went wrong.");
        setMessages((current) =>
          current.filter((m) => !(m.id === assistantMessage.id && m.content === "")),
        );
      } finally {
        setIsStreaming(false);
        setActivity(null);
        abortRef.current = null;
      }
    },
    [isStreaming, messages],
  );

  return { messages, isStreaming, activity, error, send, stop, reset };
}
