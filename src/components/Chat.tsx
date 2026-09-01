"use client";

import { useEffect, useRef } from "react";
import Composer from "./Composer";
import MessageBubble from "./MessageBubble";
import { useChat } from "@/lib/useChat";

const SUGGESTIONS = [
  "Who are you and what can you help me with?",
  "Summarise my background for a recruiter.",
  "What am I currently working on?",
  "Help me draft a short intro email.",
];

export default function Chat() {
  const { messages, isStreaming, error, send, stop, reset } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-line px-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-fg">
              K
            </span>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold">Kairo</h1>
              <p className="text-[0.7rem] text-muted">Personal assistant</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
            >
              New chat
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4">
        <div className="mx-auto w-full max-w-3xl py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-6 pt-[12vh] text-center">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Hi, I&apos;m Kairo.</h2>
                <p className="mt-1.5 text-sm text-muted">
                  Ask me about Abhi, or anything else you need a hand with.
                </p>
              </div>
              <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => send(suggestion)}
                    className="rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-[0.82rem] text-muted transition-colors hover:border-accent hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isStreaming={isStreaming && index === messages.length - 1}
                />
              ))}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-500/35 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-500"
            >
              {error}
            </div>
          )}

          <div ref={bottomRef} className="h-px" />
        </div>
      </main>

      <Composer onSend={send} onStop={stop} isStreaming={isStreaming} />
    </div>
  );
}
