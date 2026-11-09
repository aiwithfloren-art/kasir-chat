import { transcribe, rateLimited } from "@/lib/ai";

// Voice notes: the browser records, converts to a small 16 kHz WAV, and sends it here as base64.
export async function POST(req) {
  if (rateLimited(req)) return Response.json({ error: "Too many requests" }, { status: 429 });
  const { audio } = await req.json();
  if (typeof audio !== "string" || !audio.length) return Response.json({ error: "No audio" }, { status: 400 });
  if (audio.length > 3_000_000) return Response.json({ error: "Voice note too long" }, { status: 413 });
  try {
    return Response.json({ text: await transcribe(audio) });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not understand the voice note" }, { status: 500 });
  }
}
