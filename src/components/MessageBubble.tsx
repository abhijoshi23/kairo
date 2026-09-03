"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UiMessage } from "@/lib/useChat";
import { confirmVoiceUsage } from "@/lib/voiceWarning";

// Only one clip plays at a time - starting another pauses whatever bubble
// was mid-playback, module-scoped since bubbles don't otherwise know about
// each other.
let activeAudio: HTMLAudioElement | null = null;

type SpeechState = "idle" | "loading" | "playing";

/**
 * Belt-and-suspenders against leaked tool-citation syntax.
 *
 * The system prompt tells the model to cite as plain markdown links, but
 * that is a request, not a guarantee - some models (observed: gpt-oss via
 * Groq, after a web_search round) emit their own training-time citation
 * format instead, e.g. 【1†L1-L2】. There is no renderer for that here, so
 * it would otherwise show up as literal garbage in the reply.
 */
function stripCitationArtifacts(text: string): string {
  return text.replace(/【[^】]*】/g, "").replace(/\s+([.,;:!?])/g, "$1");
}

export default function MessageBubble({
  message,
  isStreaming,
  activity,
}: {
  message: UiMessage;
  isStreaming: boolean;
  activity?: string | null;
}) {
  const isUser = message.role === "user";
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [speechError, setSpeechError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanupAudio = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    audioRef.current = null;
  };

  // Stop this bubble's own playback if it unmounts - "New chat" while a
  // reply is still being read aloud should not keep talking.
  useEffect(() => {
    return () => {
      if (activeAudio === audioRef.current) activeAudio?.pause();
      cleanupAudio();
    };
  }, []);

  async function toggleSpeech() {
    if (speechState === "playing" || speechState === "loading") {
      activeAudio?.pause();
      cleanupAudio();
      setSpeechState("idle");
      return;
    }

    if (
      !confirmVoiceUsage(
        "Reading aloud sends this reply's text to a third-party AI provider to generate speech.",
      )
    ) {
      return;
    }

    setSpeechError(null);
    setSpeechState("loading");
    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: stripCitationArtifacts(message.content) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Couldn't generate audio.");
      }

      const url = URL.createObjectURL(await response.blob());
      activeAudio?.pause();

      const audio = new Audio(url);
      audioRef.current = audio;
      objectUrlRef.current = url;
      activeAudio = audio;

      audio.onended = () => {
        setSpeechState("idle");
        cleanupAudio();
      };
      audio.onerror = () => {
        setSpeechState("idle");
        setSpeechError("Playback failed.");
        cleanupAudio();
      };

      await audio.play();
      setSpeechState("playing");
    } catch (error) {
      setSpeechState("idle");
      setSpeechError(error instanceof Error ? error.message : "Couldn't generate audio.");
    }
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[0.95rem] leading-relaxed text-accent-fg whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  const showPlaceholder = isStreaming && message.content.length === 0;

  return (
    <div className="flex gap-3">
      <div
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[0.7rem] font-semibold tracking-tight"
      >
        K
      </div>

      <div className="min-w-0 max-w-[85%]">
        {isStreaming && activity && (
          <div className="mb-2 flex items-center gap-2 text-[0.8rem] text-muted">
            <span className="cursor-blink">◆</span>
            <span>{activity}…</span>
          </div>
        )}

        <div className="prose-chat text-[0.95rem]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Links may come from search results, i.e. from strangers.
              // noopener/noreferrer stops the opened page from reaching back
              // into this tab via window.opener.
              a: ({ ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
              ),
            }}
          >
            {stripCitationArtifacts(message.content)}
          </ReactMarkdown>
          {showPlaceholder && !activity && (
            <span className="cursor-blink text-muted">Thinking…</span>
          )}
        </div>

        {!isStreaming && message.content.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSpeech}
              aria-label={speechState === "playing" ? "Stop reading aloud" : "Read aloud"}
              aria-pressed={speechState === "playing"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground"
            >
              {speechState === "loading" ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : speechState === "playing" ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                  <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
                  <path
                    d="M17 8a5 5 0 0 1 0 8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              )}
            </button>
            {speechError && <span className="text-[0.7rem] text-red-500">{speechError}</span>}
          </div>
        )}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-line pt-2.5">
            <p className="mb-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-muted">
              Sources
            </p>
            <ol className="flex flex-col gap-1">
              {message.sources.map((source, index) => (
                <li key={source.url} className="flex gap-1.5 text-[0.8rem]">
                  <span className="shrink-0 text-muted">{index + 1}.</span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="truncate text-muted underline underline-offset-2 transition-colors hover:text-foreground"
                    title={source.url}
                  >
                    {source.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
