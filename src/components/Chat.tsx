"use client";

import { useEffect, useRef, useState } from "react";
import Composer from "./Composer";
import MessageBubble from "./MessageBubble";
import { useChat } from "@/lib/useChat";

const SUGGESTIONS = [
  { icon: "👋", text: "Who are you and what can you help me with?" },
  { icon: "📄", text: "Summarise my background for a recruiter." },
  { icon: "🛠️", text: "What am I currently working on?" },
  { icon: "📰", text: "What happened in AI news this week?" },
];

// How close to the bottom (in px) still counts as "at the bottom" - close
// enough that auto-scrolling on a new message won't feel like a jump.
const NEAR_BOTTOM_THRESHOLD = 120;

export default function Chat() {
  const { messages, isStreaming, activity, error, send, stop, reset } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
      stickToBottomRef.current = near;
      if (near) setShowJump(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    } else if (messages.length > 0) {
      // The user scrolled up to reread something - don't yank them back down,
      // just let them know there's more below.
      setShowJump(true);
    }
  }, [messages]);

  function jumpToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setShowJump(false);
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-line px-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            <span className="kairo-mark flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold text-accent-fg shadow-sm">
              K
            </span>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold">Kairo</h1>
              <p className="text-[0.7rem] text-muted">Personal assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={reset}
                className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-all hover:border-accent/50 hover:text-foreground active:scale-95"
              >
                New chat
              </button>
            )}
            <button
              onClick={async () => {
                // Clear the conversation before navigating away - it lives in
                // localStorage, not the session, so signing out alone would
                // otherwise leave it sitting there for whoever signs in next.
                reset();
                await fetch("/api/login", { method: "DELETE" });
                window.location.href = "/login";
              }}
              className="rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:text-foreground active:scale-95"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <main ref={mainRef} className="kairo-scroll absolute inset-0 overflow-y-auto px-4">
          <div className="mx-auto w-full max-w-3xl py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-6 pt-[10vh] text-center">
                <span className="kairo-mark flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-accent-fg shadow-md">
                  K
                </span>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Hi, I&apos;m Kairo. 👋</h2>
                  <p className="mt-1.5 text-sm text-muted">
                    Ask me about Abhi, or anything else you need a hand with.
                  </p>
                </div>
                <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion, index) => (
                    <button
                      key={suggestion.text}
                      onClick={() => send(suggestion.text)}
                      style={{ animationDelay: `${index * 60}ms` }}
                      className="kairo-rise flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-[0.82rem] text-muted transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:text-foreground hover:shadow-md active:translate-y-0"
                    >
                      <span aria-hidden className="text-base leading-none">
                        {suggestion.icon}
                      </span>
                      <span>{suggestion.text}</span>
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
                    activity={index === messages.length - 1 ? activity : null}
                  />
                ))}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="kairo-rise mt-5 rounded-xl border border-red-500/35 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-500"
              >
                {error}
              </div>
            )}

            <div ref={bottomRef} className="h-px" />
          </div>
        </main>

        {showJump && (
          <button
            onClick={jumpToBottom}
            className="kairo-pop-in absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none">
              <path d="M12 5v14m0 0l-6-6m6 6l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            New messages
          </button>
        )}
      </div>

      <Composer onSend={send} onStop={stop} isStreaming={isStreaming} />
    </div>
  );
}
