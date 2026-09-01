"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UiMessage } from "@/lib/useChat";

export default function MessageBubble({
  message,
  isStreaming,
}: {
  message: UiMessage;
  isStreaming: boolean;
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

  return (
    <div className="flex gap-3">
      <div
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[0.7rem] font-semibold tracking-tight"
      >
        K
      </div>
      <div className="prose-chat min-w-0 max-w-[85%] text-[0.95rem]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        {isStreaming && message.content.length === 0 && (
          <span className="cursor-blink text-muted">Thinking…</span>
        )}
      </div>
    </div>
  );
}
