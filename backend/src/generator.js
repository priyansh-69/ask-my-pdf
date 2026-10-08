/**
 * SESSION 2 — GENERATION
 * -----------------------
 * Sends the augmented prompt to the Gemini model and returns the answer.
 * Includes automatic retry on temporary high-demand spikes (503/429).
 */
import { GoogleGenAI } from "@google/genai";
import logger from "./logger.js";

const apiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.OPENAI_API_KEY;

const ai = new GoogleGenAI(apiKey ? { apiKey } : {});
const CHAT_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    "gemini-3.8-flash",
  ].filter(Boolean);

  let lastError;
  for (const model of [...new Set(modelCandidates)]) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            temperature: 0.2, // low temperature: grounded, consistent answers
            ...(systemInstruction ? { systemInstruction } : {}),
          },
        });
        return response.text;
      } catch (err) {
        lastError = err;
        const isTransient = err?.status === 503 || err?.status === 429 || err?.message?.includes("503") || err?.message?.includes("high demand");
        if (isTransient && attempt < 3) {
          logger.warn(`Gemini generation 503/429 spike. Retrying attempt ${attempt}/3 in ${attempt * 1200}ms...`);
          await sleep(attempt * 1200);
          continue;
        }
        break;
      }
    }
  }

  throw lastError;
}
