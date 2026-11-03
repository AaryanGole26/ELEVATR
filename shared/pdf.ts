export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Extracts text with pdf.js. Throws for files that aren't valid PDFs. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Loaded on demand because it is a large, Node-only ES module.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const task = getDocument({
    data: new Uint8Array(buffer),
    // Resumes are untrusted files: never evaluate code embedded in them.
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0
  });

  try {
    const document = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
          .join("")
      );
    }
    return pages.join("\n").trim();
  } finally {
    await task.destroy();
  }
}
