/**
 * SESSIONS 1-2 — THE FULL BACKEND PIPELINE
 * ------------------------------------------
 * Two endpoints, matching the two flows in the architecture diagram:
 *
 *   POST /upload  -> indexing flow (parse -> chunk -> embed -> store)
 *   POST /ask     -> query flow    (embed -> retrieve -> augment -> generate)
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "crypto";

import { extractPagesFromDocument, getDocumentType } from "./documentParser.js";
import { chunkPages } from "./chunker.js";
import { embedTexts, embedText } from "./embeddings.js";
import { storeChunks, queryChunks } from "./vectorStore.js";
import { buildMessages } from "./promptBuilder.js";
import { generateAnswer } from "./generator.js";
import logger from "./logger.js";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// In-memory record of uploaded documents, for demo purposes.
// A real app would persist this in a database.
const documents = new Map(); // documentId -> { filename, pageCount, chunkCount }

/**
 * INDEXING FLOW
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      logger.warn("Upload request without file");
      return res.status(400).json({ error: "No file uploaded" });
    }

    const documentId = randomUUID();
    const documentType = getDocumentType(req.file.originalname, req.file.mimetype);
    logger.info("Starting document upload", {
      documentId,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      fileSize: req.file.size,
      documentType,
    });

    if (documentType === "unknown") {
      logger.warn("Rejected unsupported upload type", {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
      });
      return res.status(415).json({
        error: "Unsupported file type. Upload a PDF, Word document (.doc, .docx), or spreadsheet (.csv, .xls, .xlsx).",
      });
    }

    // 1. Parse according to file type
    const pages = await extractPagesFromDocument(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    if (pages.length === 0) {
      logger.warn("No extractable text found in uploaded file", {
        documentId,
        filename: req.file.originalname,
      });
      return res.status(422).json({
        error: "No extractable text found in the uploaded file.",
      });
    }

    // 2. Chunk
    const chunks = chunkPages(pages);
    logger.debug("Document chunked for indexing", {
      documentId,
      pageCount: pages.length,
      chunkCount: chunks.length,
    });

    // 3. Embed (batch, in smaller groups to stay under Gemini rate & token limits)
    const BATCH_SIZE = 20;
    const allEmbeddings = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map((c) => c.text);
      logger.debug("Embedding batch", {
        documentId,
        batchIndex: Math.floor(i / BATCH_SIZE) + 1,
        totalBatches: Math.ceil(chunks.length / BATCH_SIZE),
        batchSize: batch.length,
      });
      const embeddings = await embedTexts(batch);
      allEmbeddings.push(...embeddings);
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise((r) => setTimeout(r, 200)); // small delay between batches to respect RPM
      }
    }

    // 4. Store
    await storeChunks(documentId, chunks, allEmbeddings);

    documents.set(documentId, {
      filename: req.file.originalname,
      pageCount: pages.length,
      chunkCount: chunks.length,
      type: documentType,
    });

    logger.info("Upload processed successfully", {
      documentId,
      filename: req.file.originalname,
      pageCount: pages.length,
      chunkCount: chunks.length,
    });

    res.json({
      documentId,
      filename: req.file.originalname,
      fileType: documentType,
      pageCount: pages.length,
      chunkCount: chunks.length,
    });
  } catch (err) {
    logger.error("Upload error", { error: err.message, details: err.stack, filename: req.file?.originalname });
    res.status(500).json({ error: `Failed to process ${req.file?.originalname || "file"}` });
  }
});

/**
 * QUERY FLOW
 */
app.post("/ask", async (req, res) => {
  try {
    const { documentId, question } = req.body;

    if (!documentId || !question) {
      logger.warn("Ask request missing required fields", { documentId, questionProvided: Boolean(question) });
      return res.status(400).json({ error: "documentId and question are required" });
    }
    if (!documents.has(documentId)) {
      logger.info("Document not in server memory (e.g. server restarted), querying Qdrant directly", { documentId });
    }

    logger.info("Processing ask request", { documentId, questionLength: question.length });

    // 1. Embed the query (same model as the chunks!)
    const queryEmbedding = await embedText(question);

    // 2. Retrieve top-k similar chunks
    const retrievedChunks = await queryChunks(queryEmbedding, {
      documentId,
      topK: 4,
    });

    if (retrievedChunks.length === 0) {
      logger.warn("No matching chunks found for document", { documentId });
      return res.status(404).json({ error: "Unknown or empty document. Please upload your document first." });
    }
    logger.debug("Retrieved matching chunks", {
      documentId,
      resultCount: retrievedChunks.length,
      pageNumbers: retrievedChunks.map((c) => c.pageNumber),
    });

    // 3. Augment: build the prompt
    const messages = buildMessages(question, retrievedChunks);

    // 4. Generate
    const answer = await generateAnswer(messages);
    logger.info("Answer generated successfully", {
      documentId,
      answerLength: answer.length,
      sourcePages: [...new Set(retrievedChunks.map((c) => c.pageNumber))].sort((a, b) => a - b),
    });

    res.json({
      answer,
      sources: [...new Set(retrievedChunks.map((c) => c.pageNumber))].sort(
        (a, b) => a - b
      ),
    });
  } catch (err) {
    logger.error("Ask error", { error: err.message, details: err.stack, documentId: req.body?.documentId });
    res.status(500).json({ error: "Failed to answer question" });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`Ask My PDF backend running on http://localhost:${PORT}`);
});
