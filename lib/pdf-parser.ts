/**
 * PDF Parser for XP Credit Card Statements
 *
 * Uses pdfjs-dist (supports encrypted PDFs with password).
 * Password = first 5 digits of CPF (stored in PDF_PASSWORD env var).
 *
 * XP statement layout (per page):
 *   - CARDHOLDER NAME   -   XXXX *** XXXX  (section header)
 *   - Transaction rows: DD/MM/YY  MERCHANT NAME  [-  Parcela N/M]  R$ X.XXX,XX  0,00
 */

import { classifyCategory } from "./categories";
import type { Transaction, Invoice, Installment } from "./types";

const KNOWN_CARDHOLDERS = ["RODRIGO COELHO", "FELIPE COELHO", "PEDRO COELHO"];

function parseBrAmount(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", "."));
}

/**
 * Extract all text from a password-protected PDF using pdfjs-dist.
 * Groups text items by Y position to reconstruct lines.
 */
export async function extractText(pdfBytes: Buffer, password?: string): Promise<string> {
  // Polyfill browser APIs that pdfjs-dist needs but aren't in Node.js
  if (typeof (globalThis as any).DOMMatrix === "undefined") {
    (globalThis as any).DOMMatrix = class DOMMatrix {
      a=1; b=0; c=0; d=1; e=0; f=0;
      constructor(init?: any) {}
      static fromMatrix(m: any) { return new (globalThis as any).DOMMatrix(); }
    };
  }
  if (typeof (globalThis as any).Path2D === "undefined") {
    (globalThis as any).Path2D = class Path2D {};
  }
  if (typeof (globalThis as any).OffscreenCanvas === "undefined") {
    (globalThis as any).OffscreenCanvas = class OffscreenCanvas {
      constructor(w: number, h: number) {}
      getContext() { return null; }
    };
  }

  // Dynamic import — pdfjs-dist must be imported as ESM
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as any);

  // Disable web worker — not available in Vercel's Node.js serverless runtime
  if ((pdfjsLib as any).GlobalWorkerOptions) {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = "";
  }

  const loadingTask = (pdfjsLib as any).getDocument({
    data: new Uint8Array(pdfBytes),
    password: password ?? "",
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group items by Y coordinate to reconstruct visual lines
    const lineMap = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of textContent.items as any[]) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x: item.transform[4], str: item.str });
    }

    // Sort lines top-to-bottom (descending Y in PDF coordinates)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      fullText += items.map((it) => it.str).join(" ") + "\n";
    }
  }

  return fullText;
}

/**
 * Parse raw text from an XP statement into Transaction objects.
 */
export function parseTransactions(
  text: string,
  invoiceMonth: string // "YYYY-MM"
): Transaction[] {
  const transactions: Transaction[] = [];

  // Normalize spaces around numeric separators (pdfjs-dist artifact)
  const normalized = text
    .replace(/(\d)\s*\/\s*(\d)/g, "$1/$2")
    .replace(/(\d)\s*,\s*(\d)/g, "$1,$2")
    .replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");

  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let currentCardholder = KNOWN_CARDHOLDERS[0];

  for (const line of lines) {
    // Detect cardholder section header (e.g. "RODRIGO COELHO   -   4998 *** 4218")
    const foundHolder = KNOWN_CARDHOLDERS.find((h) => line.toUpperCase().includes(h));
    if (foundHolder) {
      currentCardholder = foundHolder;
      continue;
    }

    // XP statement format: DD/MM/YY(YY)  MERCHANT [-  Parcela N/M]  AMOUNT,XX  0,XX
    const txMatch = line.match(
      /^(\d{2}\/\d{2}\/(\d{2}|\d{4}))\s{2,}(.+?)\s{2,}([\d.]+,\d{2})(?:\s{2,}[\d.]+,\d{2})?\s*$/
    );
    if (!txMatch) continue;

    const [, dateFull, yearPart, merchantRaw, amountStr] = txMatch;
    const amount = parseBrAmount(amountStr);
    if (isNaN(amount) || amount <= 0) continue;

    // Parse date — support 2-digit years (25 → 2025, 26 → 2026)
    const [dd, mm] = dateFull.split("/");
    const txYear = parseInt(yearPart) < 100 ? 2000 + parseInt(yearPart) : parseInt(yearPart);
    const dateISO = `${txYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

    // Extract installment: "   -   Parcela N/M" at end of merchant field
    let merchantClean = merchantRaw;
    let installment: Installment | null = null;
    const installMatch = merchantClean.match(/\s+-\s+Parcela\s+(\d+)\/(\d+)\s*$/i);
    if (installMatch) {
      installment = {
        current: parseInt(installMatch[1]),
        total: parseInt(installMatch[2]),
      };
      merchantClean = merchantClean.slice(0, installMatch.index).trim();
    }
    merchantClean = merchantClean.replace(/\s+-\s*$/, "").trim().toUpperCase();

    const isPayment =
      merchantClean.includes("PAGAMENTO") ||
      merchantClean.includes("PAYMENT") ||
      merchantClean.includes("CREDITO EM CONTA");

    transactions.push({
      date: dateISO,
      merchant: merchantClean,
      cardholder: currentCardholder,
      amount,
      isPayment,
      installment,
      category: isPayment ? "Pagamento" : classifyCategory(merchantClean),
      invoiceMonth,
    });
  }

  return transactions;
}

/**
 * Detect the invoice month and label from the PDF text.
 * Looks for patterns like "vencimento em DD/MM/AAAA"
 */
export function detectInvoiceMonth(text: string): { month: string; label: string } | null {
  const m = text.match(/vencimento\s+em\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (m) {
    const [, , mm, yyyy] = m;
    const dueDate = new Date(parseInt(yyyy), parseInt(mm) - 1, 1);
    dueDate.setMonth(dueDate.getMonth() - 1);
    const month = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`;
    const label = dueDate
      .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      .replace(/^\w/, (c) => c.toUpperCase())
      .replace(" de ", " ");
    return { month, label };
  }
  return null;
}

/**
 * Full pipeline: extract text with password → parse transactions → return Invoice.
 */
export async function processPdfBuffer(
  pdfBytes: Buffer,
  password: string,
  fallbackMonth?: string
): Promise<Invoice> {
  const text = await extractText(pdfBytes, password);

  const detected = detectInvoiceMonth(text);
  const invoiceMonth = detected?.month ?? fallbackMonth ?? getCurrentMonth();
  const label = detected?.label ?? monthToLabel(invoiceMonth);

  const transactions = parseTransactions(text, invoiceMonth);

  const totalSpent = transactions
    .filter((t) => !t.isPayment)
    .reduce((sum, t) => sum + t.amount, 0);

  return { month: invoiceMonth, label, transactions, totalSpent };
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthToLabel(month: string): string {
  const [yyyy, mm] = month.split("-");
  const date = new Date(parseInt(yyyy), parseInt(mm) - 1, 1);
  return date
    .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
    .replace(/^\w/, (c) => c.toUpperCase())
    .replace(" de ", " ");
}
