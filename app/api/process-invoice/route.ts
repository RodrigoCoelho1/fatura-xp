/**
 * POST /api/process-invoice
 *
 * Receives a password-protected PDF from Make.com, unlocks it,
 * parses the transactions, saves the unlocked PDF to Google Drive,
 * and commits the updated invoices.json to GitHub (triggering Vercel redeploy).
 *
 * Required env vars:
 *   PDF_PASSWORD       – first 5 digits of CPF
 *   API_SECRET         – any random string to secure this endpoint
 *   GITHUB_TOKEN       – GitHub personal access token (repo write scope)
 *   GITHUB_OWNER       – GitHub username (e.g. "rodrigogomescoelho")
 *   GITHUB_REPO        – Repository name (e.g. "fatura-xp")
 *   GITHUB_BRANCH      – Branch to commit to (default: "main")
 *
 * Request body (multipart/form-data):
 *   file  – the PDF binary
 *   month – optional override for invoice month "YYYY-MM"
 *
 * OR application/json:
 *   { "pdf_base64": "<base64>", "month": "2026-04", "filename": "..." }
 */

import { NextRequest, NextResponse } from "next/server";
import { processPdfBuffer } from "@/lib/pdf-parser";
import { uploadInvoiceToDrive } from "@/lib/google-drive";
import { Octokit } from "@octokit/rest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const apiSecret = process.env.API_SECRET;
  const authHeader = req.headers.get("x-api-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (apiSecret && authHeader !== apiSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Read PDF bytes ───────────────────────────────────────────────────────────
  let pdfBytes: Buffer;
  let fallbackMonth: string | undefined;
  let filename = "fatura.pdf";

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
    const ab = await file.arrayBuffer();
    pdfBytes = Buffer.from(ab);
    filename = file.name || filename;
    fallbackMonth = formData.get("month") as string | undefined;
  } else {
    // JSON with base64
    const body = await req.json().catch(() => null);
    if (!body?.pdf_base64) return NextResponse.json({ error: "Missing 'pdf_base64' field" }, { status: 400 });
    pdfBytes = Buffer.from(body.pdf_base64, "base64");
    fallbackMonth = body.month;
    filename = body.filename || filename;
  }

  // ── Process PDF ──────────────────────────────────────────────────────────────
  const pdfPassword = process.env.PDF_PASSWORD;
  if (!pdfPassword) return NextResponse.json({ error: "PDF_PASSWORD env var not set" }, { status: 500 });

  let newInvoice;
  try {
    newInvoice = await processPdfBuffer(pdfBytes, pdfPassword, fallbackMonth);
  } catch (err: any) {
    console.error("PDF processing error:", err);
    return NextResponse.json({ error: "Failed to process PDF", detail: err?.message }, { status: 422 });
  }

  // ── Load existing data from GitHub ──────────────────────────────────────────
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const branch = process.env.GITHUB_BRANCH ?? "master";

  let existingInvoices: any[] = [];
  let existingFileSha: string | undefined;

  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: "data/invoices.json", ref: branch });
    if ("content" in data) {
      existingFileSha = data.sha;
      existingInvoices = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
    }
  } catch (err: any) {
    if (err.status !== 404) throw err;
    // File doesn't exist yet — start fresh
  }

  // ── Merge new invoice ────────────────────────────────────────────────────────
  const idx = existingInvoices.findIndex((inv) => inv.month === newInvoice.month);
  if (idx >= 0) {
    existingInvoices[idx] = newInvoice; // replace existing month
  } else {
    existingInvoices.push(newInvoice);
    existingInvoices.sort((a, b) => a.month.localeCompare(b.month));
  }

  // ── Commit updated invoices.json to GitHub ───────────────────────────────────
  const updatedContent = Buffer.from(JSON.stringify(existingInvoices, null, 2)).toString("base64");
  const commitMessage = `feat: add invoice ${newInvoice.label} (${newInvoice.transactions.length} transactions)`;

  await octokit.repos.createOrUpdateFileContents({
    owner, repo, path: "data/invoices.json", branch,
    message: commitMessage,
    content: updatedContent,
    sha: existingFileSha,
  });

  // ── Upload PDF to Google Drive ───────────────────────────────────────────────
  // File name format: "YYYY MM Fatura.pdf"  (e.g. "2026 04 Fatura.pdf")
  // Silently skipped if GOOGLE_* env vars are not set.
  const driveFileId = await uploadInvoiceToDrive(pdfBytes, newInvoice.month);

  return NextResponse.json({
    success: true,
    invoice: {
      month: newInvoice.month,
      label: newInvoice.label,
      totalSpent: newInvoice.totalSpent,
      transactionCount: newInvoice.transactions.length,
    },
    driveFileId: driveFileId ?? undefined,
    message: `Invoice ${newInvoice.label} committed to GitHub. Vercel will redeploy automatically.`,
  });
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "POST a PDF to process a new invoice" });
}
