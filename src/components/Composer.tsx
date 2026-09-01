"use client";

import { useEffect, useRef, useState } from "react";

export default function Composer({
  onSend,
  onStop,
  isStreaming,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea with its content, up to a cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function submit() {
    if (!value.trim() || isStreaming) return;
    onSend(value);
    setValue("");
  }

  return (
    <div className="border-t border-line bg-background/85 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl px-4 py-3">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-accent transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask Kairo anything…"
            aria-label="Message"
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.95rem] outline-none placeholder:text-muted"
          />
          {isStreaming ? (
            <button
              onClick={onStop}
              className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!value.trim()}
              className="shrink-0 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-opacity disabled:opacity-35"
            >
              Send
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[0.7rem] text-muted">
          Kairo can make mistakes. Verify anything that matters.
        </p>
      </div>
    </div>
  );
}
