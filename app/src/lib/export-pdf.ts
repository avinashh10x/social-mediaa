import { jsPDF } from "jspdf";
import type { Video } from "./types";

/**
 * Simple, readable PDF export — styled like a clean Google Docs document.
 * Black text, clear hierarchy, no colors or decorations.
 */

interface TextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

function parseInlineMarkdown(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      segments.push({ text: match[2], bold: true, italic: false });
    } else if (match[3]) {
      segments.push({ text: match[3], bold: false, italic: true });
    } else if (match[4]) {
      segments.push({ text: match[4], bold: false, italic: false });
    }
  }
  return segments.length > 0
    ? segments
    : [{ text, bold: false, italic: false }];
}



export function exportConceptPdf(video: Video) {
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792 like Google Docs
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 72; // 1 inch
  const marginR = 72;
  const contentW = pageW - marginL - marginR; // ~468pt
  const marginTop = 72;
  const marginBottom = 72;
  let y = marginTop;

  // ─── Helpers ───
  const black = [0, 0, 0] as const;
  const gray = [100, 100, 100] as const;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  /**
   * Renders an array of inline segments (bold/italic/normal) starting at xStart.
   * Handles word-wrapping across lines.
   */
  const renderSegments = (
    segments: TextSegment[],
    xStart: number,
    fontSize: number,
    lineHeight: number,
    indentX: number,
  ) => {
    doc.setFontSize(fontSize);
    let xPos = xStart;
    const maxX = pageW - marginR;

    for (const seg of segments) {
      const style = seg.bold ? "bold" : seg.italic ? "italic" : "normal";
      doc.setFont("helvetica", style);
      doc.setTextColor(...black);

      // Split into words for proper wrapping
      const words = seg.text.split(/( +)/);
      for (const word of words) {
        if (!word) continue;
        const wordW = doc.getTextWidth(word);
        if (xPos + wordW > maxX && xPos > indentX + 5) {
          // wrap to next line
          y += lineHeight;
          ensureSpace(lineHeight);
          xPos = indentX;
        }
        doc.text(word, xPos, y);
        xPos += wordW;
      }
    }
  };

  // ────────────────────────────────────────────
  // PARSE CONTENT — extract first heading as title
  // ────────────────────────────────────────────
  const content = video.newConcepts || "";
  const contentLines = content.split("\n");

  // Find and extract the first H1/H2 heading to use as the PDF title
  let title = "";
  let bodyStartIndex = 0;
  for (let i = 0; i < contentLines.length; i++) {
    const trimmed = contentLines[i].trim();
    if (!trimmed) continue; // skip leading blank lines
    if (trimmed.startsWith("# ")) {
      title = trimmed.replace(/^#+\s+/, "");
      bodyStartIndex = i + 1;
      
      // Also skip a horizontal rule if it appears immediately after the heading
      for (let j = i + 1; j < contentLines.length; j++) {
        if (!contentLines[j].trim()) continue;
        if (/^[-*_]{3,}$/.test(contentLines[j].trim())) {
          bodyStartIndex = j + 1;
        }
        break;
      }
    }
    break;
  }

  // Fallback title if the content has no heading
  if (!title) {
    const creator =
      video.source && video.creator === "manual-upload"
        ? video.source
        : video.creator;
    title = `3 Adapted Concepts for ${creator}`;
  }

  // ── Render title ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...black);
  const titleWrapped = doc.splitTextToSize(title, contentW);
  for (const line of titleWrapped) {
    doc.text(line, marginL, y);
    y += 24;
  }

  // Thin separator line
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(marginL, y, pageW - marginR, y);
  y += 24;

  // ────────────────────────────────────────────
  // BODY — render remaining markdown lines
  // ────────────────────────────────────────────
  const lines = contentLines.slice(bodyStartIndex);

  const BODY_SIZE = 11;
  const BODY_LINE = 16;
  const H1_SIZE = 16;
  const H2_SIZE = 13;
  const H3_SIZE = 11.5;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Skip empty lines
    if (!trimmed) {
      y += 8;
      continue;
    }

    // ── Horizontal rule ──
    if (/^[-*_]{3,}$/.test(trimmed)) {
      ensureSpace(20);
      y += 8;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(marginL, y, pageW - marginR, y);
      y += 12;
      continue;
    }

    // ── H1 ──
    if (trimmed.startsWith("# ")) {
      const text = trimmed.replace(/^# /, "");
      ensureSpace(30);
      y += 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(H1_SIZE);
      doc.setTextColor(...black);
      const wrapped = doc.splitTextToSize(text, contentW);
      for (const line of wrapped) {
        ensureSpace(22);
        doc.text(line, marginL, y);
        y += 22;
      }
      y += 4;
      continue;
    }

    // ── H2 ──
    if (trimmed.startsWith("## ")) {
      const text = trimmed.replace(/^## /, "");
      ensureSpace(26);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(H2_SIZE);
      doc.setTextColor(...black);
      const wrapped = doc.splitTextToSize(text, contentW);
      for (const line of wrapped) {
        ensureSpace(20);
        doc.text(line, marginL, y);
        y += 20;
      }
      y += 2;
      continue;
    }

    // ── H3 ──
    if (trimmed.startsWith("### ")) {
      const text = trimmed.replace(/^### /, "");
      ensureSpace(22);
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(H3_SIZE);
      doc.setTextColor(...black);
      const wrapped = doc.splitTextToSize(text, contentW);
      for (const line of wrapped) {
        ensureSpace(18);
        doc.text(line, marginL, y);
        y += 18;
      }
      y += 2;
      continue;
    }

    // ── Numbered list item ──
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      const num = numberedMatch[1] + ".";
      const itemText = numberedMatch[2];
      ensureSpace(BODY_LINE);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(BODY_SIZE);
      doc.setTextColor(...black);
      doc.text(num, marginL, y);

      const indentX = marginL + 22;
      const segments = parseInlineMarkdown(itemText);
      renderSegments(segments, indentX, BODY_SIZE, BODY_LINE, indentX);
      y += BODY_LINE;
      continue;
    }

    // ── Bullet list item ──
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const itemText = trimmed.replace(/^[-*]\s+/, "");
      ensureSpace(BODY_LINE);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(BODY_SIZE);
      doc.setTextColor(...black);
      // Simple bullet: •
      doc.text("•", marginL + 4, y);

      const indentX = marginL + 18;
      const segments = parseInlineMarkdown(itemText);
      renderSegments(segments, indentX, BODY_SIZE, BODY_LINE, indentX);
      y += BODY_LINE;
      continue;
    }

    // ── Blockquote ──
    if (trimmed.startsWith("> ")) {
      const quoteText = trimmed.replace(/^>\s*/, "");
      ensureSpace(BODY_LINE);

      doc.setFont("helvetica", "italic");
      doc.setFontSize(BODY_SIZE);
      doc.setTextColor(...gray);

      const indentX = marginL + 14;
      const wrapped = doc.splitTextToSize(quoteText, contentW - 14);
      // Left bar
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(1.5);
      const barTop = y - 10;
      for (const line of wrapped) {
        ensureSpace(BODY_LINE);
        doc.text(line, indentX, y);
        y += BODY_LINE;
      }
      doc.line(marginL + 4, barTop, marginL + 4, y - 6);
      y += 4;
      continue;
    }

    // ── Regular paragraph ──
    ensureSpace(BODY_LINE);
    const segments = parseInlineMarkdown(trimmed);
    renderSegments(segments, marginL, BODY_SIZE, BODY_LINE, marginL);
    y += BODY_LINE;
  }

  // ────────────────────────────────────────────
  // PAGE NUMBERS (bottom center, like Google Docs)
  // ────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text(String(p), pageW / 2, pageH - 40, { align: "center" });
  }

  // ────────────────────────────────────────────
  // SAVE
  // ────────────────────────────────────────────
  const safeName = title
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .substring(0, 60);
  doc.save(`${safeName}.pdf`);
}
