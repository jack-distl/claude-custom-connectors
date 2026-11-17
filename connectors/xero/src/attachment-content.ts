import type { AttachmentInfo } from "./api.js";

/**
 * Turn a downloaded attachment into MCP tool content Claude can read:
 * PDFs become their text (page by page), images are shown as images, and
 * plain-text files come back as text. Anything else is described, not sent.
 */

type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** Claude's image input limit is about 5 MB. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Keep a single result to a size Claude can take in. */
const MAX_TEXT_CHARS = 150_000;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
const TEXT_TYPES = /^(text\/|application\/(json|xml|csv))/i;

function mimeOf(attachment: AttachmentInfo): string {
  const mime = (attachment.MimeType || "").toLowerCase();
  if (mime && mime !== "application/octet-stream") return mime;
  const ext = attachment.FileName.toLowerCase().split(".").pop() ?? "";
  const byExt: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    csv: "text/csv",
    txt: "text/plain",
    json: "application/json",
    xml: "application/xml",
  };
  return byExt[ext] ?? mime;
}

function header(attachment: AttachmentInfo, bytes: Buffer): string {
  return `File: ${attachment.FileName} (${attachment.MimeType || "unknown type"}, ${Math.max(1, Math.round(bytes.length / 1024))} KB)`;
}

function capped(text: string): string {
  return text.length > MAX_TEXT_CHARS
    ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n[Cut off at ${MAX_TEXT_CHARS.toLocaleString()} characters. Ask for a page range to read the rest.]`
    : text;
}

async function pdfContent(
  attachment: AttachmentInfo,
  bytes: Buffer,
  pages?: { from?: number; to?: number }
): Promise<ToolContent[]> {
  // unpdf is ESM-only; this package compiles to CommonJS, so load it dynamically.
  const { getDocumentProxy, extractText } = await import("unpdf");
  // Text extraction only: nothing is rendered, and the bundled pdf.js no
  // longer evaluates code from fonts (the old isEvalSupported hole is gone).
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const from = Math.max(1, pages?.from ?? 1);
  const to = Math.min(totalPages, pages?.to ?? totalPages);
  const body = text
    .slice(from - 1, to)
    .map((t, i) => `--- Page ${from + i} ---\n${t.trim()}`)
    .join("\n\n");

  const range = from === 1 && to === totalPages ? `${totalPages} pages` : `pages ${from}-${to} of ${totalPages}`;
  if (!body.replace(/--- Page \d+ ---/g, "").trim()) {
    return [
      {
        type: "text",
        text:
          `${header(attachment, bytes)}, ${range}.\n\n` +
          "This PDF has no text layer, so it's probably a scan or photo. The connector can't read scans yet. Open it in Xero to see it.",
      },
    ];
  }
  return [{ type: "text", text: capped(`${header(attachment, bytes)}, ${range}.\n\n${body}`) }];
}

export async function attachmentToContent(
  attachment: AttachmentInfo,
  bytes: Buffer,
  pages?: { from?: number; to?: number }
): Promise<ToolContent[]> {
  const mime = mimeOf(attachment);

  if (mime === "application/pdf") return pdfContent(attachment, bytes, pages);

  if (IMAGE_TYPES.has(mime)) {
    if (bytes.length > MAX_IMAGE_BYTES) {
      return [
        {
          type: "text",
          text: `${header(attachment, bytes)}. The image is over 5 MB, too big to show here. Open it in Xero instead.`,
        },
      ];
    }
    return [
      { type: "text", text: header(attachment, bytes) },
      { type: "image", data: bytes.toString("base64"), mimeType: mime === "image/jpg" ? "image/jpeg" : mime },
    ];
  }

  if (TEXT_TYPES.test(mime)) {
    return [{ type: "text", text: capped(`${header(attachment, bytes)}\n\n${bytes.toString("utf8")}`) }];
  }

  return [
    {
      type: "text",
      text:
        `${header(attachment, bytes)}. The connector can read PDFs, images and text files, but not this type yet. ` +
        "Open it in Xero instead.",
    },
  ];
}
