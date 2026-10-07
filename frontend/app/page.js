"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  UploadCloud,
  Send,
  Copy,
  Check,
  RotateCcw,
  Bot,
  User,
  Database,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

const API_BASE = "http://localhost:4000";

const QUICK_QUERIES = [
  {
    title: "Executive Summary",
    prompt: "Provide an executive summary of this document covering the main themes and conclusions.",
  },
  {
    title: "Key Data & Metrics",
    prompt: "Extract all key numbers, metrics, dates, and measurable figures mentioned in this document.",
  },
  {
    title: "Section & Structure Audit",
    prompt: "Audit the document structure: list all major sections, topics covered, and note any obvious gaps.",
  },
];

export default function DocumentWorkstation() {
  const [file, setFile] = useState(null);
  const [documentId, setDocumentId] = useState("");
  const [docMeta, setDocMeta] = useState(null);
  const [question, setQuestion] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [chatLog, setChatLog] = useState([
    {
      id: "initial-assistant-msg",
      role: "assistant",
      text: "Upload a PDF, Word document (`.doc`, `.docx`), or Excel spreadsheet (`.xlsx`, `.xls`, `.csv`) in the left inspector. I will answer queries strictly grounded in its contents with page/sheet citations.",
      sources: [],
    },
  ]);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog, isAsking]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      uploadDocument(droppedFile);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      uploadDocument(selectedFile);
    }
  };

  const uploadDocument = async (fileToUpload) => {
    if (!fileToUpload) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", fileToUpload);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setDocumentId(data.documentId);
      setDocMeta({
        filename: data.filename,
        fileType: data.fileType || "document",
        pageCount: data.pageCount,
        chunkCount: data.chunkCount,
        fileSize: (fileToUpload.size / 1024).toFixed(1) + " KB",
      });

      setChatLog((prev) => [
        ...prev,
        {
          id: `upload-${Date.now()}`,
          role: "assistant",
          text: `**Document Indexed Successfully**\n\n* **Filename:** \`${data.filename}\`\n* **Document Type:** \`${data.fileType?.toUpperCase() || "DOCUMENT"}\`\n* **Structure:** ${data.pageCount} page(s) / sheet(s)\n* **Index:** ${data.chunkCount} vector chunk(s) stored in Qdrant with 3072-dimensional embeddings.\n\nYou can now query any data, facts, summaries, or audits from this document.`,
          sources: [],
        },
      ]);
    } catch (error) {
      setChatLog((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: `**Upload Error:** ${error.message}\n\nPlease verify that the backend is active on \`${API_BASE}\` and the document format is supported.`,
          sources: [],
        },
      ]);
    } finally {
      setIsUploading(false);
    }
  };

  const executeAsk = async (queryText) => {
    const trimmed = queryText.trim();
    if (!trimmed || !documentId || isAsking) return;

    const userMessageId = `user-${Date.now()}`;
    setChatLog((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: "user",
        text: trimmed,
        sources: [],
      },
    ]);
    setQuestion("");
    setIsAsking(true);

    try {
      const response = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, question: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to answer question");
      }

      setChatLog((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: data.answer,
          sources: data.sources || [],
        },
      ]);
    } catch (error) {
      setChatLog((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: `**Query Execution Error:** ${error.message}`,
          sources: [],
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeAsk(question);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeAsk(question);
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReset = () => {
    setFile(null);
    setDocumentId("");
    setDocMeta(null);
    setQuestion("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setChatLog([
      {
        id: "reset-msg",
        role: "assistant",
        text: "Session cleared. Ready for a new document upload.",
        sources: [],
      },
    ]);
  };

  return (
    <div className="app-container">
      {/* Top Application Bar */}
      <header className="top-nav">
        <div className="brand-section">
          <div className="brand-icon">
            <Database size={16} />
          </div>
          <div>
            <div className="brand-title">Ask My PDF</div>
          </div>
          <span className="brand-subtitle">Document Intelligence Workstation</span>
        </div>

        <div className="system-status-group">
          <div className="status-pill">
            <span className={`status-dot ${isUploading || isAsking ? "busy" : ""}`} />
            <span>{isUploading ? "Indexing Vector Store..." : isAsking ? "Gemini Synthesizing..." : "Qdrant Ready"}</span>
          </div>
          <div className="status-pill">
            <Layers size={11} />
            <span>3072-D Cosine</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="workspace">
        {/* Left Inspector Sidebar */}
        <aside className="inspector-sidebar">
          {/* Upload Dropzone */}
          <div className="sidebar-section">
            <div className="sidebar-title">
              <span>Document Source</span>
              {docMeta && (
                <button className="btn-icon" onClick={handleReset} title="Clear document">
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <div
              className={`dropzone ${dragActive ? "drag-active" : ""}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.csv,.xls,.xlsx,.tsv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={handleFileChange}
                disabled={isUploading}
              />
              <div className="dropzone-icon">
                <UploadCloud size={24} />
              </div>
              <div className="dropzone-text">
                {isUploading ? "Processing & Chunking..." : "Choose or drop file"}
              </div>
              <div className="dropzone-subtext">PDF, DOC, DOCX, XLS, XLSX, CSV (Up to 25MB)</div>
            </div>
          </div>

          {/* Active Document Details */}
          {docMeta ? (
            <div className="sidebar-section">
              <div className="sidebar-title">
                <span>Active Document</span>
                <span className="doc-type-badge">{docMeta.fileType}</span>
              </div>
              <div className="doc-card">
                <div className="doc-card-header">
                  <FileText size={18} color="#93c5fd" />
                  <div className="doc-filename">{docMeta.filename}</div>
                </div>
                <div className="doc-metrics-grid">
                  <div className="doc-metric-item">
                    <div className="metric-label">PAGES / SHEETS</div>
                    <div className="metric-value">{docMeta.pageCount}</div>
                  </div>
                  <div className="doc-metric-item">
                    <div className="metric-label">INDEXED CHUNKS</div>
                    <div className="metric-value">{docMeta.chunkCount}</div>
                  </div>
                  <div className="doc-metric-item">
                    <div className="metric-label">FILE SIZE</div>
                    <div className="metric-value">{docMeta.fileSize}</div>
                  </div>
                  <div className="doc-metric-item">
                    <div className="metric-label">STATUS</div>
                    <div className="metric-value" style={{ color: "#34d399" }}>
                      SYNCHRONIZED
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="sidebar-section">
              <div className="sidebar-title">Document Inspection</div>
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: "1.5" }}>
                No active document selected. Upload a file above to inspect extracted metadata, page boundaries, and vector chunks.
              </div>
            </div>
          )}

          {/* Structured Document Queries */}
          <div className="sidebar-section">
            <div className="sidebar-title">
              <span>Standard Queries</span>
            </div>
            <div className="quick-queries-list">
              {QUICK_QUERIES.map((q, idx) => (
                <button
                  key={idx}
                  className="query-chip"
                  onClick={() => executeAsk(q.prompt)}
                  disabled={!documentId || isAsking}
                >
                  <span>{q.title}</span>
                  <ArrowRight size={12} color="var(--text-tertiary)" />
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="sidebar-footer">
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-tertiary)" }}>
              <ShieldCheck size={14} color="#10b981" />
              <span>Strict Document Grounding Enabled</span>
            </div>
          </div>
        </aside>

        {/* Main Stage: Conversation & Analysis Area */}
        <section className="chat-stage">
          {/* Stage Header */}
          <div className="stage-header">
            <div className="stage-header-title">
              <Layers size={13} color="var(--text-secondary)" />
              <span>
                {docMeta ? `Context: ${docMeta.filename}` : "No Active Context"}
              </span>
            </div>
            {chatLog.length > 1 && (
              <button
                className="btn-icon"
                onClick={() =>
                  setChatLog([
                    {
                      id: "cleared-msg",
                      role: "assistant",
                      text: "Conversation cleared. Document index is still active.",
                      sources: [],
                    },
                  ])
                }
              >
                Clear Messages
              </button>
            )}
          </div>

          {/* Messages Stream */}
          <div className="messages-container">
            {chatLog.map((message) => (
              <div
                key={message.id}
                className={`message-item ${message.role === "user" ? "user" : "assistant"}`}
              >
                <div className="avatar">
                  {message.role === "user" ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className="message-bubble">
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.text}
                    </ReactMarkdown>
                  </div>

                  {/* Metadata & Actions for Assistant Messages */}
                  {message.role === "assistant" && (
                    <div className="message-footer">
                      <div className="sources-row">
                        {message.sources && message.sources.length > 0 ? (
                          <>
                            <span className="sources-label">Document Sources:</span>
                            {message.sources.map((page) => (
                              <span key={page} className="source-badge">
                                Page {page}
                              </span>
                            ))}
                          </>
                        ) : (
                          <span style={{ color: "var(--text-tertiary)" }}>
                            Grounded System Response
                          </span>
                        )}
                      </div>

                      <button
                        className="btn-icon"
                        onClick={() => handleCopy(message.id, message.text)}
                        title="Copy to clipboard"
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check size={11} color="#34d399" />
                            <span style={{ color: "#34d399" }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking / Searching Indicator */}
            {isAsking && (
              <div className="message-item assistant">
                <div className="avatar">
                  <Bot size={14} />
                </div>
                <div className="message-bubble">
                  <div className="thinking-indicator">
                    <div className="spinner" />
                    <span>Searching Qdrant vectors & synthesizing response...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Command / Input Stage */}
          <div className="input-stage">
            <form onSubmit={handleSubmit}>
              <div className="input-wrapper">
                <textarea
                  className="chat-input"
                  rows={1}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    documentId
                      ? "Ask any question, request a summary, or audit data from this document..."
                      : "Upload a document in the left inspector to begin..."
                  }
                  disabled={!documentId || isAsking}
                />
                <button
                  type="submit"
                  className="btn-send"
                  disabled={!documentId || isAsking || !question.trim()}
                  title="Send query"
                >
                  <Send size={14} />
                </button>
              </div>
              <div className="input-hint">
                [Enter] send • [Shift+Enter] new line
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
