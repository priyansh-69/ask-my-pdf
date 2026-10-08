/**
 * VECTOR STORE (Qdrant)
 * ---------------------
 * Qdrant is used for persistent vector storage and similarity search.
 * Uses standard HTTP REST requests for universal Node.js compatibility (Node 18 - 26+).
 */
import { randomUUID } from "crypto";
import logger from "./logger.js";

const QDRANT_URL = (process.env.QDRANT_URL || "http://localhost:6333").replace(/\/$/, "");
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || "chunk1";
const VECTOR_SIZE = Number(process.env.QDRANT_VECTOR_SIZE || 3072);
const DISTANCE = process.env.QDRANT_DISTANCE || "Cosine";

function getHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };
  if (QDRANT_API_KEY) {
    headers["api-key"] = QDRANT_API_KEY;
  }
  return headers;
}

let collectionReadyPromise = null;

async function ensureCollection() {
  if (!collectionReadyPromise) {
    collectionReadyPromise = (async () => {
      // 1. Check if collection exists
      const existsRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        headers: getHeaders(),
      }).catch((err) => {
        logger.error("Qdrant collection existence check failed", {
          error: err.message,
          collectionName: COLLECTION_NAME,
        });
        throw err;
      });

      if (existsRes.status === 404) {
        // Create collection
        const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
          method: "PUT",
          headers: getHeaders(),
          body: JSON.stringify({
            vectors: {
              size: VECTOR_SIZE,
              distance: DISTANCE,
            },
          }),
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Failed to create Qdrant collection: ${errText}`);
        }
        logger.info("Qdrant collection created", {
          collectionName: COLLECTION_NAME,
          vectorSize: VECTOR_SIZE,
          distance: DISTANCE,
        });
      } else if (existsRes.ok) {
        const collectionInfo = await existsRes.json();
        const existingVectorSize = Number(
          collectionInfo?.result?.config?.params?.vectors?.size ??
            collectionInfo?.result?.config?.params?.vectors?.params?.size ??
            0
        );

        if (existingVectorSize && existingVectorSize !== VECTOR_SIZE) {
          throw new Error(
            `Qdrant collection "${COLLECTION_NAME}" already exists with vector size ${existingVectorSize}, but this app is configured for ${VECTOR_SIZE}. Delete the collection or update QDRANT_VECTOR_SIZE / QDRANT_COLLECTION.`
          );
        }
      } else {
        const errText = await existsRes.text();
        throw new Error(`Failed to check Qdrant collection: ${errText}`);
      }

      // 2. Ensure payload index for documentId
      try {
        await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/index?wait=true`, {
          method: "PUT",
          headers: getHeaders(),
          body: JSON.stringify({
            field_name: "documentId",
            field_schema: "keyword",
          }),
        });
        logger.info("Qdrant payload index ensured for documentId", {
          collectionName: COLLECTION_NAME,
        });
      } catch (indexErr) {
        logger.warn("Qdrant payload index check warning", { error: indexErr.message });
      }
    })();
  }

  return collectionReadyPromise;
}

/**
 * Stores chunks + their embeddings + metadata for a given document.
 *
 * @param {string} documentId - unique id for this uploaded PDF
 * @param {Array<{ text: string, pageNumber: number, chunkIndex: number }>} chunks
 * @param {number[][]} embeddings - same order/length as chunks
 */
export async function storeChunks(documentId, chunks, embeddings) {
  await ensureCollection();

  const points = chunks.map((chunk, index) => ({
    id: randomUUID(),
    vector: embeddings[index],
    payload: {
      documentId,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
    },
  }));

  logger.debug("Upserting chunks into Qdrant", { documentId, chunkCount: points.length });

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ points }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to store chunks in Qdrant: ${errText}`);
  }

  return chunks.length;
}

/**
 * Finds the top-k most similar chunks to a query embedding.
 * Optionally restricts the search to one document.
 *
 * @param {number[]} queryEmbedding
 * @param {object} options
 * @param {string} [options.documentId]
 * @param {number} [options.topK]
 */
export async function queryChunks(queryEmbedding, { documentId, topK = 4 } = {}) {
  await ensureCollection();

  const filter = documentId
    ? {
        must: [{ key: "documentId", match: { value: documentId } }],
      }
    : undefined;

  const searchBody = {
    vector: queryEmbedding,
    limit: topK,
    with_payload: true,
    with_vector: false,
  };

  if (filter) {
    searchBody.filter = filter;
  }

  logger.debug("Executing Qdrant similarity search", {
    documentId,
    topK,
  });

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(searchBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to query Qdrant points: ${errText}`);
  }

  const data = await res.json();
  const results = data.result || [];

  return results.map((hit) => ({
    text: hit.payload?.text || "",
    pageNumber: hit.payload?.pageNumber,
    score: hit.score,
    distance: typeof hit.score === "number" ? 1 - hit.score : null,
  }));
}
