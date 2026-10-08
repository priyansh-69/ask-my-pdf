/**
 * SESSION 1 — EMBEDDINGS
 * -----------------------
 * Turns text into vectors using Gemini's embedding models.
 * Includes automatic rate-limit retry with exponential backoff.
 */
import { GoogleGenAI } from "@google/genai";
import logger from "./logger.js";

const apiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.OPENAI_API_KEY;

const ai = new GoogleGenAI(apiKey ? { apiKey } : {});
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Embeds a batch of text strings with automatic retry on rate limits (429).
 *
 * @param {string[]} texts
 * @param {number} maxRetries
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, maxRetries = 3) {
  if (!texts || texts.length === 0) return [];

  let delay = 1500;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts,
      });

      if (response.embeddings && Array.isArray(response.embeddings)) {
        return response.embeddings.map((item) => item.values);
      }

      if (response.embedding && response.embedding.values) {
        return [response.embedding.values];
      }

      throw new Error("No embeddings returned by Gemini API");
    } catch (err) {
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.includes("quota") ||
        err?.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < maxRetries) {
        logger.warn(`Gemini embedding rate limit hit (429). Retrying attempt ${attempt}/${maxRetries} after ${delay}ms...`);
        await sleep(delay);
        delay *= 2;
        continue;
      }

      throw err;
    }
  }
}

/**
 * Convenience wrapper for embedding a single string.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
