/**
 * PDF Parser for XP Credit Card Statements
 *
 * Unlocks a password-protected PDF and extracts transaction data.
 * Password = first 5 digits of CPF (stored in PDF_PASSWORD env var).
 *
 * XP statement layout (per page):
 *   - CARDHOLDER NAME header line
 *   - Transaction rows: DD/MM  MERCHANT NAME  [INSTALLMENT]  R$ X.XXX,XX
 *   - Payment rows:    DD/MM  PAGAMENTO ...   -R$ X.XXX,XX
 */

import { PDFDocument } from "pdf-lib";
import * as pdfParseModule from "pdf-parse";
// Handle both default and named exports
const pdfParse: (data: Buffer) => Promise<{ text: string }> =
  (pdfParseModule as any).default ?? (pdfParseModule as any);
import { classifyCategory } from "./categories";
import type { Transaction, Invoice, Installment } from "./types";

const KNOWN_CARDHOLDERS = ["RODRIGO COELHO", "FELIPE COELHO", "PEDRO COELHO"];

// Regex for a transaction line:
// date (DD/MM), optional spaces, merchant text, optional installment (NN/NN), amount
const TX_LINE = /^(\d{2}\/\d{2})\s+(.+?)\s{2,}([\d.]+,\d{2})\s*$/;
const INSTALLMENT_RE = /\s+(\d{2})\/(\d{2})\s*$/;
const AMOUNT_BR = /^([\d.]+),(\d{2})$/;

function parseBrAmount(raw: string): number {
  // "1.234,56" → 1234.56
  const cleaned = raw.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function parseMonth(dateStr: string, refYear: number, refMonth: number): string {
  // dateStr = "DD/MM", invoice may span year boundary
  const [, mm] = dateStr.split("/").map(Number);
  let year = refYear;
  // If invoice month is January and transaction month is December → previous year
  if (refMonth === 1 && mm === 12) year = refYear - 1;
  return `${year}-${String(mm).padStart(2, "0")}`;
}

/**
 * Unlock a password-protected PDF and return the raw bytes of the unlocked version.
 */
export async function unlockPdf(pdfBytes: Buffer, password: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes, { password } as any);
  // Re-save without password
  const unlocked = await doc.save({ useObjectStreams: false });
  return Buffer.from(unlocked);
}

/**
 * Extract all text from a PDF buffer using pdf-parse.
 */
export async function extractText(pdfBytes: Buffer): Promise<string> {
  const result = await pdfParse(pdfBytes);
  return result.text;
}

/**
 * Parse raw text from an XP statement into Transaction objects.
 */
export function parseTransactions(
  text: string,
  invoiceMonth: string // "YYYY-MM"
): Transaction[] {
  const transactions: Transaction[] = [];
  const [yearStr, monthStr] = invoiceMonth.split("-");
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let currentCardholder = KNOWN_CARDHOLDERS[0];

  for (const line of lines) {
    // Detect cardholder section header
    const foundHolder = KNOWN_CARDHOLDERS.find(
      (h) => line.toUpperCase().includes(h)
    );
    if (foundHolder) {
      currentCardholder = foundHolder;
      continue;
    }

    // Try to match a transaction line
    // Pattern: DD/MM  SOME MERCHANT [01/12]  1.234,56
    const dateMatch = line.match(/^(\d{2}\/\d{2})\s+(.+)$/);
    if (!dateMatch) continue;

    const [, dateRaw, rest] = dateMatch;

    // Find amount at the end: last token matching X.XXX,XX or XXX,XX
    const amountMatch = rest.match(/([\d.]+,\d{2})\s*$/);
    if (!amountMatch) continue;

    const amountRaw = amountMatch[1];
    const amount = parseBrAmount(amountRaw);
    if (isNaN(amount) || amount <= 0) continue;

    // Everything between date and amount is merchant + optional installment
    let merchantRaw = rest.slice(0, rest.lastIndexOf(amountRaw)).trim();

    // Check for installment marker at end of merchant: "01/12"
    let installment: Installment | null = null;
    const installMatch = merchantRaw.match(/\s+(\d{1,2})\/(\d{1,2})\s*$/);
    if (installMatch) {
      installment = {
        current: parseInt(installMatch[1]),
        total: parseInt(installMatch[2]),
      };
      merchantRaw = merchantRaw.slice(0, installMatch.index).trim();
    }

    const merchant = merchantRaw.toUpperCase();
    const isPayment =
      merchant.includes("PAGAMENTO") ||
      merchant.includes("PAYMENT") ||
      merchant.includes("CREDITO EM CONTA");

    // Determine the date for this transaction
    const txMonth = parseMonth(dateRaw, year, month);
    const [dayStr, mStr] = dateRaw.split("/");
    const txYear = txMonth.split("-")[0];
    const dateISO = `${txYear}-${mStr.padStart(2, "0")}-${dayStr.padStart(2, "0")}`;

    transactions.push({
      date: dateISO,
      merchant,
      cardholder: currentCardholder,
      amount,
      isPayment,
      installment,
      category: isPayment ? "Pagamento" : classifyCategory(merchant),
      invoiceMonth,
    });
  }

  return transactions;
}

/**
 * Detect the invoice month and label from the PDF text.
 * Looks for patterns like "Fatura com vencimento em DD/MM/AAAA"
 */
export function detectInvoiceMonth(text: string): { month: string; label: string } | null {
  // XP statement typically says "vencimento em 20/04/2026"
  const m = text.match(/vencimento\s+em\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (m) {
    const [, , mm, yyyy] = m;
    // Invoice month is one month before due date (typically)
    const dueDate = new Date(parseInt(yyyy), parseInt(mm) - 1, 1);
    dueDate.setMonth(dueDate.getMonth() - 1);
    const month = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`;
    const label = dueDate.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      .replace(/^\w/, (c) => c.toUpperCase())
      .replace(" de ", " ");
    return { month, label };
  }
  return null;
}

/**
 * Full pipeline: unlock PDF → extract text → parse transactions → return Invoice.
 */
export async function processPdfBuffer(
  pdfBytes: Buffer,
  password: string,
  fallbackMonth?: string // "YYYY-MM", used if detection fails
): Promise<Invoice> {
  // Step 1: unlock
  const unlocked = await unlockPdf(pdfBytes, password);

  // Step 2: extract text
  const text = await extractText(unlocked);

  // Step 3: detect invoice month
  const detected = detectInvoiceMonth(text);
  const invoiceMonth = detected?.month ?? fallbackMonth ?? getCurrentMonth();
  const label = detected?.label ?? monthToLabel(invoiceMonth);

  // Step 4: parse transactions
  const transactions = parseTransactions(text, invoiceMonth);

  // Step 5: calculate total
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
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
    .replace(/^\w/, (c) => c.toUpperCase())
    .replace(" de ", " ");
}
