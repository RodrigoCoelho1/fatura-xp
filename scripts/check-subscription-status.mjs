/**
 * check-subscription-status.mjs
 *
 * Pesquisa o Gmail por e-mails de cancelamento de cada assinatura
 * e atualiza data/subscription-status.json com o resultado.
 *
 * Uso:
 *   node scripts/check-subscription-status.mjs
 *
 * Requer: GMAIL_ACCESS_TOKEN no ambiente (OAuth2)
 * Após rodar, faça git commit + push para atualizar o deploy.
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATUS_FILE = path.join(__dirname, "../data/subscription-status.json");
const TODAY = new Date().toISOString().slice(0, 10);

// Assinaturas a verificar com padrões de busca no Gmail
const CHECKS = [
  {
    name: "Netflix",
    query: 'from:account.netflix.com (cancelamos OR "cancelamento" OR "até a próxima") after:2025/1/1',
    cancelKeywords: ["cancelamos sua assinatura", "até a próxima", "cancelamento"],
    accessUntilPattern: /continuar assistindo até (.+?)\./i,
  },
  {
    name: "Disney+",
    query: 'from:disneyplus.com ("cancelado" OR "vai embora" OR "cancelamento") after:2025/1/1',
    cancelKeywords: ["cancelou a assinatura", "vai embora", "cancelado"],
    accessUntilPattern: null,
  },
  {
    name: "Globoplay",
    query: 'from:comunicados.globo.com ("cancelado" OR "cancelamento") after:2025/1/1',
    cancelKeywords: ["globoplay premium foi cancelado", "solicitação de cancelamento"],
    accessUntilPattern: null,
  },
  {
    name: "Hostinger",
    query: 'from:hostinger.com (cancelled OR cancelado OR cancelamento) after:2025/1/1',
    cancelKeywords: ["cancelled", "cancelado", "cancelamento"],
    accessUntilPattern: null,
  },
  {
    name: "Google Play",
    query: 'from:google.com ("subscription cancelled" OR "assinatura cancelada") after:2025/1/1',
    cancelKeywords: ["subscription cancelled", "assinatura cancelada"],
    accessUntilPattern: null,
  },
  {
    name: "Samsung Pay",
    query: 'from:(samsung.com OR pbadministradora) (cancelado OR cancelled) after:2025/1/1',
    cancelKeywords: ["cancelado", "cancelled"],
    accessUntilPattern: null,
  },
  {
    name: "TicPay",
    query: 'from:ticpay.com (cancelled OR cancelado) after:2025/1/1',
    cancelKeywords: ["cancelled", "cancelado"],
    accessUntilPattern: null,
  },
];

async function searchGmail(query, token) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.messages ?? [];
}

async function getMessage(id, token) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

function decodeBody(msg) {
  const parts = msg.payload?.parts ?? [msg.payload];
  for (const part of parts) {
    if (part?.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
  }
  return "";
}

async function checkSubscription(check, token) {
  const messages = await searchGmail(check.query, token);
  if (messages.length === 0) return { status: "active", checkedAt: TODAY };

  // Get the most recent message
  const msg = await getMessage(messages[0].id, token);
  const headers = Object.fromEntries((msg.payload?.headers ?? []).map(h => [h.name, h.value]));
  const body = decodeBody(msg).toLowerCase();
  const subject = headers["Subject"] ?? "";
  const dateStr = headers["Date"] ? new Date(headers["Date"]).toISOString().slice(0, 10) : TODAY;

  const isCancelled = check.cancelKeywords.some(k => body.includes(k.toLowerCase()) || subject.toLowerCase().includes(k.toLowerCase()));
  if (!isCancelled) return { status: "active", checkedAt: TODAY };

  let accessUntil = null;
  if (check.accessUntilPattern) {
    const match = decodeBody(msg).match(check.accessUntilPattern);
    if (match) accessUntil = match[1].trim();
  }

  return {
    status: "cancelled",
    cancelledAt: dateStr,
    accessUntil,
    emailSubject: subject,
    emailDate: dateStr,
    checkedAt: TODAY,
  };
}

async function main() {
  const token = process.env.GMAIL_ACCESS_TOKEN;
  if (!token) {
    console.error("❌  Defina GMAIL_ACCESS_TOKEN no ambiente antes de rodar.");
    console.error("    export GMAIL_ACCESS_TOKEN=ya29...");
    process.exit(1);
  }

  let current = {};
  try { current = JSON.parse(readFileSync(STATUS_FILE, "utf-8")); } catch {}

  console.log("🔍 Verificando status de assinaturas via Gmail...\n");

  for (const check of CHECKS) {
    process.stdout.write(`  ${check.name}... `);
    try {
      const result = await checkSubscription(check, token);
      current[check.name] = { ...current[check.name], ...result };
      const icon = result.status === "cancelled" ? "✅ Cancelado" : result.status === "active" ? "🔴 Ativo" : "❓";
      console.log(icon);
    } catch (e) {
      console.log(`⚠️  Erro: ${e.message}`);
    }
  }

  writeFileSync(STATUS_FILE, JSON.stringify(current, null, 2));
  console.log(`\n✅ Atualizado: data/subscription-status.json`);
  console.log(`   Faça git add + commit + push para refletir no site.`);
}

main();
