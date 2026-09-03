"use client";

/**
 * A one-time consent gate for voice features.
 *
 * Both the mic (speech-to-text) and the speaker icon (text-to-speech) send
 * data off this machine to whatever LLM_PROVIDER is configured - a voice
 * recording in one direction, reply text in the other. That is a materially
 * different privacy posture than typing into a text box, so it gets an
 * explicit acknowledgment before the first use rather than silently working
 * like everything else in the composer.
 *
 * Asked once per browser, not once ever and not on every click - a warning
 * you see every time stops being read.
 */
const ACK_KEY = "kairo:voice-warning-ack";

export function confirmVoiceUsage(detail: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (window.localStorage.getItem(ACK_KEY) === "1") return true;
  } catch {
    // Storage disabled (private browsing) - fall through and ask every time
    // rather than silently allow or silently block.
  }

  const ok = window.confirm(
    `${detail}\n\nThis sends data to Kairo's configured AI provider. You won't be asked again on this browser.`,
  );

  if (ok) {
    try {
      window.localStorage.setItem(ACK_KEY, "1");
    } catch {
      // Nothing to do - it'll just ask again next time, which is safe.
    }
  }

  return ok;
}
