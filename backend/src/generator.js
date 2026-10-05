/**
 * SESSION 2 — GENERATION
 * -----------------------
 * Sends the augmented prompt to the Gemini model and returns the answer.
 */
import { GoogleGenAI } from "@google/genai";

const apiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.OPENAI_API_KEY;

const ai = new GoogleGenAI(apiKey ? { apiKey } : {});
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @returns {Promise<string>}
 */
export async function generateAnswer(messages) {
  let systemInstruction;
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = msg.content;
    } else {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  const modelCandidates = [
    CHAT_MODEL,
    "gemini-3.5-flash",
    "gemini-flash-latest",
  ].filter(Boolean);

  let lastError;
  for (const model of [...new Set(modelCandidates)]) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          temperature: 0.2, // low temperature: we want grounded, consistent answers
          ...(systemInstruction ? { systemInstruction } : {}),
        },
      });
      return response.text;
    } catch (err) {
      lastError = err;
      if (err?.status === 503 || err?.status === 404 || err?.status === 429) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
