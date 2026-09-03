import { getProvider, LLMError } from "@/lib/llm";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generous but bounded - a few minutes of speech, not an uploaded podcast.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const { allowed, retryAfter } = await checkRateLimit(clientKey(request));
  if (!allowed) {
    return Response.json(
      { error: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  let file: File;
  try {
    const form = await request.formData();
    const entry = form.get("audio");
    if (!(entry instanceof File) || entry.size === 0) {
      return Response.json({ error: "No audio provided." }, { status: 400 });
    }
    file = entry;
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Recording is too long." }, { status: 413 });
  }

  const provider = getProvider();
  if (!provider.transcribe) {
    return Response.json(
      {
        error: `Voice input isn't supported by the "${provider.name}" provider. Switch LLM_PROVIDER to openai or groq to use it.`,
      },
      { status: 400 },
    );
  }

  try {
    const data = Buffer.from(await file.arrayBuffer());
    const text = await provider.transcribe({ data, mimeType: file.type || "audio/webm" });
    return Response.json({ text });
  } catch (error) {
    const message = error instanceof LLMError ? error.message : "Transcription failed.";
    const status = error instanceof LLMError ? error.status : 500;
    return Response.json({ error: message }, { status });
  }
}
