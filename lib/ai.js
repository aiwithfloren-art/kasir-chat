// AI agent loop with tool calling, via OpenRouter (OpenAI-compatible API).
// Default model: Google Gemini 2.5 Flash Lite, with a fallback model.
const MODELS = (process.env.AI_MODELS || "google/gemini-2.5-flash,openai/gpt-4.1-mini").split(",");
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

async function complete(body) {
  let lastErr;
  for (const model of MODELS) {
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Kasir Chat",
        },
        body: JSON.stringify({ ...body, model: model.trim() }),
        signal: AbortSignal.timeout(25000),
      });
      if (r.ok) {
        const j = await r.json();
        if (j.choices?.[0]?.message) return j.choices[0].message;
        lastErr = new Error(`AI ${model}: empty response`);
      } else {
        lastErr = new Error(`AI ${model} ${r.status}: ${(await r.text()).slice(0, 300)}`);
      }
    } catch (e) {
      lastErr = new Error(`AI ${model}: ${e.message}`);
    }
    console.error(String(lastErr));
  }
  throw lastErr;
}

// Speech to text for voice notes. Only audio-capable models.
const AUDIO_MODELS = ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"];
export async function transcribe(wavBase64) {
  let lastErr;
  for (const model of AUDIO_MODELS) {
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-Title": "Kasir Chat" },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Transcribe this voice message from a shop customer exactly, in its original language. Output only the transcript. If there is no speech, output nothing.",
                },
                { type: "input_audio", input_audio: { data: wavBase64, format: "wav" } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (r.ok) return ((await r.json()).choices?.[0]?.message?.content || "").trim();
      lastErr = new Error(`STT ${model} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } catch (e) {
      lastErr = e;
    }
    console.error(String(lastErr));
  }
  throw lastErr;
}

/**
 * history: [{role:'user'|'model', text}]
 * tools: { name: { description, parameters, run: async(args) => object } }
 * Returns { text, events } where events are tool results the UI may render.
 */
const LANG_NAMES = { en: "English", es: "Spanish", pt: "Portuguese", fr: "French", id: "Indonesian", zh: "Simplified Chinese", ja: "Japanese", hi: "Hindi" };

// Shared style rules for every agent: plain chat text, and always the language of the newest message.
function styleRules(lang) {
  const ui = LANG_NAMES[lang] || "English";
  return `

LANGUAGE
- Reply in the language of the user's MOST RECENT message, even if earlier messages used another language.
- Lines starting with "[" are system notes, not the user: for those, use the language of the user's last real message.
- If the language of the latest message is unclear (only a name, a number, "ok"), reply in ${ui} (the page language).

FORMAT
- This is a chat bubble that shows plain text. Never use markdown: no asterisks, no bold, no headings, no tables.
- For a list, put each item on its own line starting with "• ". Keep it short.`;
}

// Safety net in case a model still sends markdown.
export function plain(s) {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[*\-]\s+/gm, "• ")
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,!?]|$)/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function runAgent({ system, history, tools, lang }) {
  const messages = [
    { role: "system", content: system + styleRules(lang) },
    ...history
      .filter((m) => m.text)
      .slice(-20)
      .map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: String(m.text).slice(0, 2000) })),
  ];
  const toolDefs = Object.entries(tools).map(([name, t]) => ({
    type: "function",
    function: { name, description: t.description, parameters: lower(t.parameters) },
  }));
  const events = [];

  for (let step = 0; step < 5; step++) {
    const msg = await complete({ messages, tools: toolDefs, temperature: 0.3 });
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });

    if (!msg.tool_calls?.length) {
      return { text: plain(msg.content || "") || "Sorry, could you say that again?", events };
    }
    for (const call of msg.tool_calls) {
      const tool = tools[call.function.name];
      let result;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result = tool ? await tool.run(args) : { error: "unknown tool" };
      } catch (e) {
        result = { error: e.message };
      }
      events.push({ tool: call.function.name, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { text: "Done.", events };
}

// Tool schemas are written Gemini-style (OBJECT/STRING); JSON Schema wants lowercase types.
function lower(s) {
  if (Array.isArray(s)) return s.map(lower);
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) out[k] = k === "type" && typeof v === "string" ? v.toLowerCase() : lower(v);
  return out;
}

// Very small per-IP limiter to protect the AI budget.
const hits = new Map();
export function rateLimited(req, max = 40, windowMs = 10 * 60 * 1000) {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}
