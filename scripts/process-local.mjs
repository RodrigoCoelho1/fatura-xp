/**
 * Local PDF processing script — uses pdfjs-dist (supports encrypted PDFs).
 * Usage: node scripts/process-local.mjs [pdf-path]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Octokit } from "@octokit/rest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach(line => {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
  });
}

// Auto-detect latest XP invoice PDF from Downloads if no path given
function findLatestXpPdf() {
  const downloadsDir = "C:/Users/rodri/Downloads";
  try {
    const files = fs.readdirSync(downloadsDir)
      .filter(f => f.match(/xp.*\.pdf$/i) || f.match(/\d{7}-xp-.*\.pdf$/i))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(downloadsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? path.join(downloadsDir, files[0].name) : null;
  } catch { return null; }
}

const PDF_PATH = process.argv[2] || findLatestXpPdf() || "C:/Users/rodri/Downloads/4340488-Xp-20-04-2026.pdf";
const PDF_PASSWORD = process.env.PDF_PASSWORD;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? "master";

if (!PDF_PASSWORD) { console.error("❌ PDF_PASSWORD not set"); process.exit(1); }
if (!GITHUB_TOKEN) { console.error("❌ GITHUB_TOKEN not set"); process.exit(1); }

const KNOWN_CARDHOLDERS = ["RODRIGO COELHO", "FELIPE COELHO", "PEDRO COELHO"];

function parseBrAmount(raw) {
  return parseFloat(raw.replace(/\./g, "").replace(",", "."));
}

function detectInvoiceMonth(text) {
  // Normalize spaces around numeric separators (pdfjs artifact)
  const normalized = text
    .replace(/(\d)\s*\/\s*(\d)/g, "$1/$2")
    .replace(/(\d)\s*,\s*(\d)/g, "$1,$2")
    .replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");

  // Pattern 1: "Vencimento … DD/MM/YYYY" (boleto area, possibly multi-line)
  const numericMatch = normalized.match(/Vencimento[\s\S]{0,120}?(\d{2})\/(\d{2})\/(\d{4})/i);
  if (numericMatch) {
    const [, dd, mm, yyyy] = numericMatch;
    const month = `${yyyy}-${mm}`;
    const label = new Date(parseInt(yyyy), parseInt(mm) - 1, 1)
      .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      .replace(/^\w/, c => c.toUpperCase()).replace(" de ", " ");
    return { month, label };
  }

  // Pattern 2: "com vencimento em Abril" (cover page, Portuguese month name)
  const ptMonths = {
    janeiro: "01", fevereiro: "02", março: "03", abril: "04",
    maio: "05", junho: "06", julho: "07", agosto: "08",
    setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };
  const nameMatch = normalized.match(
    /vencimento\s+em\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i
  );
  if (nameMatch) {
    const mm = ptMonths[nameMatch[1].toLowerCase()];
    const now = new Date();
    const curMM = now.getMonth() + 1;
    const yyyy = parseInt(mm) < curMM ? String(now.getFullYear() + 1) : String(now.getFullYear());
    const month = `${yyyy}-${mm}`;
    const label = new Date(parseInt(yyyy), parseInt(mm) - 1, 1)
      .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      .replace(/^\w/, c => c.toUpperCase()).replace(" de ", " ");
    return { month, label };
  }

  return null;
}

function parseTransactions(text, invoiceMonth) {
  const transactions = [];

  // Normalize spaces around numeric separators (artifact of pdfjs text extraction)
  const normalized = text
    .replace(/(\d)\s*\/\s*(\d)/g, "$1/$2")
    .replace(/(\d)\s*,\s*(\d)/g, "$1,$2")
    .replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");

  const lines = normalized.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let currentCardholder = KNOWN_CARDHOLDERS[0];

  for (const line of lines) {
    // Detect cardholder section header (e.g. "RODRIGO COELHO   -   4998 *** 4218")
    const foundHolder = KNOWN_CARDHOLDERS.find(h => line.toUpperCase().includes(h));
    if (foundHolder) { currentCardholder = foundHolder; continue; }

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
    let installment = null;
    const installMatch = merchantClean.match(/\s+-\s+Parcela\s+(\d+)\/(\d+)\s*$/i);
    if (installMatch) {
      installment = { current: parseInt(installMatch[1]), total: parseInt(installMatch[2]) };
      merchantClean = merchantClean.slice(0, installMatch.index).trim();
    }
    // Strip trailing " -"
    merchantClean = merchantClean.replace(/\s+-\s*$/, "").trim().toUpperCase();

    const isPayment = merchantClean.includes("PAGAMENTO") || merchantClean.includes("PAYMENT") || merchantClean.includes("CREDITO EM CONTA");

    let category = "Outros";
    if (isPayment) category = "Pagamento";
    else if (/MERCADO|SUPERMER|CARREFOUR|EXTRA|PAO DE ACUCAR|ATACADAO/.test(merchantClean)) category = "Supermercado";
    else if (/RESTAURANTE|LANCHE|BURGER|PIZZA|SUBWAY|MCDONALDS|IFOOD|RAPPI|DELIVERY|IFD\s*\*/.test(merchantClean)) category = "Alimentação";
    else if (/POSTO|COMBUSTIV|SHELL|IPIRANGA|PETROBRAS/.test(merchantClean)) category = "Combustível";
    else if (/FARMACIA|DROGARIA|DROGA/.test(merchantClean)) category = "Farmácia";
    else if (/UBER|99POP|CABIFY|TRANSFER/.test(merchantClean)) category = "Transporte";
    else if (/AMAZON|MAGAZINE|MERCADOLIV|AMERICANAS|CASASBAHIA|ALIEXPRESS|SHOPEE/.test(merchantClean)) category = "Compras Online";
    else if (/NETFLIX|SPOTIFY|APPLE|GOOGLE|DISNEY|YOUTUBE|GLOBO/.test(merchantClean)) category = "Streaming";

    transactions.push({ date: dateISO, merchant: merchantClean, cardholder: currentCardholder, amount, isPayment, installment, category, invoiceMonth });
  }
  return transactions;
}

async function extractTextWithPdfJs(pdfBytes, password) {
  const pdfjsLib = await import("../node_modules/pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes),
    password: password,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;

  console.log(`   PDF has ${pdf.numPages} pages`);

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group items by Y position to reconstruct lines
    const lineMap = new Map();
    for (const item of textContent.items) {
      if (!item.str) continue;
      // Y position rounded to nearest 2px to group same-line items
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], str: item.str });
    }

    // Sort lines top-to-bottom (descending Y in PDF coords = ascending visual order)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = lineMap.get(y).sort((a, b) => a.x - b.x);
      fullText += items.map(it => it.str).join(" ") + "\n";
    }
  }
  return fullText;
}

async function main() {
  console.log("📄 Reading PDF:", PDF_PATH);
  const pdfBytes = fs.readFileSync(PDF_PATH);
  console.log(`   Size: ${pdfBytes.length} bytes`);

  console.log("🔓 Extracting text with password...");
  const text = await extractTextWithPdfJs(pdfBytes, PDF_PASSWORD);
  console.log(`   Extracted ${text.length} chars`);

  // Show a snippet for debugging
  const snippet = text.replace(/\s+/g, " ").substring(0, 300);
  console.log("   Preview:", snippet);

  const detected = detectInvoiceMonth(text);
  const invoiceMonth = detected?.month ?? "2026-04";
  const label = detected?.label ?? "Abr 2026";
  console.log(`📅 Invoice: ${invoiceMonth} (${label})`);

  const transactions = parseTransactions(text, invoiceMonth);
  const totalSpent = transactions.filter(t => !t.isPayment).reduce((s, t) => s + t.amount, 0);
  console.log(`💳 ${transactions.length} transactions, total R$ ${totalSpent.toFixed(2)}`);

  if (transactions.length > 0) {
    console.log("   Sample transactions:");
    transactions.slice(0, 5).forEach(t =>
      console.log(`   ${t.date} | ${t.cardholder.split(" ")[0].padEnd(8)} | ${t.merchant.substring(0, 30).padEnd(30)} | R$ ${t.amount.toFixed(2)}`)
    );
  }

  const newInvoice = { month: invoiceMonth, label, transactions, totalSpent };

  // Load existing invoices.json from GitHub
  console.log("\n📦 Loading invoices.json from GitHub...");
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  let existingInvoices = [], existingFileSha;
  try {
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER, repo: GITHUB_REPO, path: "data/invoices.json", ref: GITHUB_BRANCH
    });
    if ("content" in data) {
      existingFileSha = data.sha;
      existingInvoices = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
    }
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  console.log(`   Found ${existingInvoices.length} existing invoices`);

  const idx = existingInvoices.findIndex(inv => inv.month === newInvoice.month);
  if (idx >= 0) {
    existingInvoices[idx] = newInvoice;
    console.log("   ↺ Replaced existing invoice for", invoiceMonth);
  } else {
    existingInvoices.push(newInvoice);
    existingInvoices.sort((a, b) => a.month.localeCompare(b.month));
    console.log("   + Added new invoice for", invoiceMonth);
  }

  console.log("\n🚀 Committing to GitHub...");
  const updatedContent = Buffer.from(JSON.stringify(existingInvoices, null, 2)).toString("base64");
  const result = await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER, repo: GITHUB_REPO, path: "data/invoices.json", branch: GITHUB_BRANCH,
    message: `feat: add invoice ${newInvoice.label} (${newInvoice.transactions.length} transactions)`,
    content: updatedContent, sha: existingFileSha,
  });
  console.log("✅ Committed! SHA:", result.data.commit.sha.substring(0, 7));
  console.log("   Vercel will redeploy automatically in ~30s.");
  console.log("\n📁 Unlocked PDF path:", PDF_PATH.replace(".pdf", "-unlocked.pdf"));
}

main().catch(e => { console.error("❌ Error:", e.message, e.stack?.split("\n")[1]); process.exit(1); });
