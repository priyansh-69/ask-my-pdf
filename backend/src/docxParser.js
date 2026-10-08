/**
 * Handles Microsoft Word (.docx and .doc) documents.
 * Extracts raw text cleanly.
 */
import mammoth from "mammoth";

export async function extractPagesFromDocx(fileBuffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    const text = result.value
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text) {
      return [{ pageNumber: 1, text }];
    }
  } catch (err) {
    // Fallback for legacy .doc binary files or formatted plain text buffers
    const rawString = fileBuffer.toString("utf8");
    const cleaned = rawString
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.length > 20) {
      return [{ pageNumber: 1, text: cleaned }];
    }
    throw err;
  }

  return [];
}
