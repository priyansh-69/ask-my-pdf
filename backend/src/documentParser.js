/**
 * Dispatcher for all supported upload types (PDF, Word DOC/DOCX, Excel/Spreadsheet XLS/XLSX/CSV).
 */
import { extractPagesFromPdf } from "./pdfParser.js";
import { extractPagesFromDocx } from "./docxParser.js";
import { extractPagesFromSpreadsheet } from "./csvParser.js";

export function getDocumentType(fileName = "", mimeType = "") {
  const name = fileName.toLowerCase();
  const type = mimeType.toLowerCase();

  if (name.endsWith(".pdf") || type.includes("pdf")) return "pdf";
  if (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    name.endsWith(".rtf") ||
    name.endsWith(".odt") ||
    type.includes("word") ||
    type.includes("docx") ||
    type.includes("msword") ||
    type.includes("wordprocessingml")
  ) {
    return "docx";
  }
  if (
    name.endsWith(".csv") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".tsv") ||
    name.endsWith(".ods") ||
    type.includes("csv") ||
    type.includes("excel") ||
    type.includes("sheet") ||
    type.includes("spreadsheet") ||
    type.includes("spreadsheetml")
  ) {
    return "spreadsheet";
  }

  return "unknown";
}

export async function extractPagesFromDocument(fileBuffer, fileName = "", mimeType = "") {
  const documentType = getDocumentType(fileName, mimeType);

  if (documentType === "pdf") {
    return extractPagesFromPdf(fileBuffer);
  }

  if (documentType === "docx") {
    return extractPagesFromDocx(fileBuffer);
  }

  if (documentType === "spreadsheet") {
    return extractPagesFromSpreadsheet(fileBuffer, fileName);
  }

  throw new Error(`Unsupported file type: ${fileName || mimeType || "unknown"}`);
}
