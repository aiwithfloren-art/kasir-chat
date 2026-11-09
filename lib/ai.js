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

/**
 * history: [{role:'user'|'model', text}]
 * tools: { name: { description, parameters, run: async(args) => object } }
 * Returns { text, events } where events are tool results the UI may render.
 */
export async function runAgent({ system, history, tools }) {
  const messages = [
    { role: "system", content: system },
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
      return { text: (msg.content || "").trim() || "Sorry, could you say that again?", events };
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
