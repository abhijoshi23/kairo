"use client";

import { useEffect, useRef, useState } from "react";
import { confirmVoiceUsage } from "@/lib/voiceWarning";

type VoiceState = "idle" | "recording" | "transcribing";

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
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Grow the textarea with its content, up to a cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function submit() {
    if (!value.trim() || isStreaming) return;
    onSend(value);
    setValue("");
  }

  async function startRecording() {
    if (
      !confirmVoiceUsage(
        "Voice input records your microphone and sends the audio to a third-party AI provider for transcription.",
      )
    ) {
      return;
    }

    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };

      recorder.start();
      recorderRef.current = recorder;
      setVoiceState("recording");
    } catch {
      setVoiceError("Couldn't access the microphone. Check your browser permissions.");
      setVoiceState("idle");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setVoiceState("transcribing");
  }

  async function transcribe(audio: Blob) {
    try {
      const form = new FormData();
      form.append("audio", audio, "voice-input.webm");
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Transcription failed.");

      const text = (body?.text ?? "").trim();
      if (text) {
        setValue((current) => (current.trim() ? `${current.trim()} ${text}` : text));
        textareaRef.current?.focus();
      }
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Transcription failed.");
    } finally {
      setVoiceState("idle");
    }
  }

  function toggleRecording() {
    if (voiceState === "recording") stopRecording();
    else if (voiceState === "idle") void startRecording();
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
            placeholder={
              voiceState === "recording"
                ? "Listening…"
                : voiceState === "transcribing"
                  ? "Transcribing…"
                  : "Ask Kairo anything…"
            }
            aria-label="Message"
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.95rem] outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isStreaming || voiceState === "transcribing"}
            aria-label={voiceState === "recording" ? "Stop recording" : "Record voice message"}
            aria-pressed={voiceState === "recording"}
            className={`shrink-0 rounded-xl border p-2 transition-colors disabled:opacity-35 ${
              voiceState === "recording"
                ? "border-red-500/40 bg-red-500/10 text-red-500"
                : "border-line text-muted hover:text-foreground"
            }`}
          >
            {voiceState === "transcribing" ? (
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] animate-spin" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
                <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
                <path
                  d="M5 11a7 7 0 0 0 14 0M12 18v3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            )}
          </button>
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
        {voiceError ? (
          <p className="mt-2 text-center text-[0.7rem] text-red-500">{voiceError}</p>
        ) : (
          <p className="mt-2 text-center text-[0.7rem] text-muted">
            Kairo can make mistakes. Verify anything that matters.
          </p>
        )}
      </div>
    </div>
  );
}
