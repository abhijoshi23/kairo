"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UiMessage } from "@/lib/useChat";

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
            {message.content}
          </ReactMarkdown>
          {showPlaceholder && !activity && (
            <span className="cursor-blink text-muted">Thinking…</span>
          )}
        </div>

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
