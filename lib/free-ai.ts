import type { z } from "zod";

/**
 * Free AI through Google's Gemini API free tier (key from aistudio.google.com,
 * no card needed). Used by the autopilot's writer and idea agents. Everything
 * still works without it, using templates instead.
 */
export function freeAiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/** The "-latest" alias follows Google's current free Flash model, so it keeps working as models change. */
export function freeModel(): string {
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

export async function geminiJson<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Plain description of the JSON shape, shown to the model. */
  shape: string;
  temperature?: number;
}): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(freeModel())}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: `${opts.prompt}\n\nReply with JSON only, in this shape:\n${opts.shape}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: opts.temperature ?? 0.9 },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(res.status === 429 ? "The free AI limit for today is used up. It resets tomorrow." : `Gemini error ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const json = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return opts.schema.parse(JSON.parse(json));
}
