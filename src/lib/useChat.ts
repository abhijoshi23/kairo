"use client";

import { useCallback, useRef, useState } from "react";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/**
 * All the client-side chat logic in one hook, so the components stay dumb.
 *
 * The interesting part is `readStream`: we read the response body chunk by
 * chunk, split it on newlines, and append each text delta to the last message.
 * That append-as-you-go loop is the entire trick behind a typing effect.
 */
export function useChat() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
  }, [stop]);

  const send = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text || isStreaming) return;

      setError(null);
      const userMessage: UiMessage = { id: newId(), role: "user", content: text };
      const assistantMessage: UiMessage = { id: newId(), role: "assistant", content: "" };

      // Snapshot the history we are about to send, before React state updates.
      const history = [...messages, userMessage].map(({ role, content }) => ({
        role,
        content,
      }));

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const appendToAssistant = (chunk: string) =>
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: message.content + chunk }
              : message,
          ),
        );

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });

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
            if (event.type === "delta") appendToAssistant(event.text);
            else if (event.type === "error") throw new Error(event.message);
          }
        }
      } catch (caught) {
        if ((caught as Error).name === "AbortError") return;
        const message = caught instanceof Error ? caught.message : "Something went wrong.";
        setError(message);
        // Drop an empty assistant bubble so the UI does not show a blank turn.
        setMessages((current) =>
          current.filter((m) => !(m.id === assistantMessage.id && m.content === "")),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, messages],
  );

  return { messages, isStreaming, error, send, stop, reset };
}
