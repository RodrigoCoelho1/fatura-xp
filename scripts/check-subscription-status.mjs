/**
 * check-subscription-status.mjs
 *
 * Pesquisa o Gmail por e-mails de cancelamento de cada assinatura
 * e atualiza data/subscription-status.json com o resultado.
 *
 * Variáveis de ambiente necessárias (salvar como GitHub Secrets):
 *   GMAIL_CLIENT_ID       — Client ID do Google OAuth
 *   GMAIL_CLIENT_SECRET   — Client Secret do Google OAuth
 *   GMAIL_REFRESH_TOKEN   — Refresh Token (obtido via setup-gmail-oauth.mjs)
 *
 * Para obter as credenciais pela primeira vez:
 *   node scripts/setup-gmail-oauth.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATUS_FILE = path.join(__dirname, "../data/subscription-status.json");
const TODAY = new Date().toISOString().slice(0, 10);

// ── Assinaturas a verificar ────────────────────────────────────────────────────
const CHECKS = [
  {
    name: "Netflix",
    query: 'from:account.netflix.com ("até a próxima" OR "cancelamos" OR "cancelamento") after:2025/1/1',
    cancelKeywords: ["cancelamos sua assinatura", "até a próxima"],
    accessUntilPattern: /continuar assistindo até .+?, (\d+ de \w+ de \d{4})/i,
  },
  {
    name: "Disney+",
    query: 'from:disneyplus.com ("vai embora" OR "cancelado" OR "assinatura cancelada") after:2025/1/1',
    cancelKeywords: ["cancelou a assinatura", "vai embora", "cancelada", "você cancelou"],
    accessUntilPattern: null,
  },
  {
    name: "Globoplay",
    query: 'from:comunicados.globo.com ("cancelado" OR "cancelamento" OR "solicitação de cancelamento") after:2025/1/1',
    cancelKeywords: ["foi cancelado", "solicitação de cancelamento", "plano foi cancelado"],
    accessUntilPattern: null,
  },
  {
    name: "Hostinger",
    query: 'from:hostinger.com (cancelled OR cancelado OR cancelamento OR "subscription cancelled") after:2025/1/1',
    cancelKeywords: ["cancelled", "cancelado", "has been cancelled"],
    accessUntilPattern: null,
  },
  {
    name: "Google Play",
    query: 'from:(play-noreply@google.com OR no-reply@accounts.google.com) ("subscription cancelled" OR "assinatura cancelada" OR "seu acesso terminou") after:2025/1/1',
    cancelKeywords: ["subscription cancelled", "assinatura cancelada", "seu acesso terminou"],
    accessUntilPattern: null,
  },
  {
    name: "Samsung Pay",
    query: 'from:(samsung.com) (cancelled OR cancelado OR cancelamento) after:2025/1/1',
    cancelKeywords: ["cancelled", "cancelado"],
    accessUntilPattern: null,
  },
  {
    name: "TicPay",
    query: 'from:(ticpay.com) (cancelled OR cancelado OR cancelamento) after:2025/1/1',
    cancelKeywords: ["cancelled", "cancelado"],
    accessUntilPattern: null,
  },
];

// ── OAuth helpers ─────────────────────────────────────────────────────────────

async function getAccessToken() {
  // Permite uso direto de access token (local/dev)
  if (process.env.GMAIL_ACCESS_TOKEN) return process.env.GMAIL_ACCESS_TOKEN;

  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    console.error("❌  Credenciais faltando. Defina:");
    console.error("    GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN");
    console.error("    → Execute: node scripts/setup-gmail-oauth.mjs");
    process.exit(1);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    console.error("❌  Falha ao obter access token:", JSON.stringify(data));
    process.exit(1);
  }
  return data.access_token;
}

// ── Gmail helpers ─────────────────────────────────────────────────────────────

async function searchGmail(query, token) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=3`;
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
  const flatten = (parts) => {
    let text = "";
    for (const part of parts ?? []) {
      if (part?.mimeType === "text/plain" && part.body?.data) {
        text += Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      if (part?.parts) text += flatten(part.parts);
    }
    return text;
  };
  return flatten(msg.payload?.parts ?? [msg.payload]);
}

// ── Core check logic ──────────────────────────────────────────────────────────

async function checkSubscription(check, token) {
  const messages = await searchGmail(check.query, token);
  if (messages.length === 0) {
    return { status: "active", checkedAt: TODAY };
  }

  const msg = await getMessage(messages[0].id, token);
  const headers = Object.fromEntries((msg.payload?.headers ?? []).map(h => [h.name, h.value]));
  const body    = decodeBody(msg);
  const bodyLow = body.toLowerCase();
  const subject = headers["Subject"] ?? "";
  const dateStr = headers["Date"]
    ? new Date(headers["Date"]).toISOString().slice(0, 10)
    : TODAY;

  const isCancelled = check.cancelKeywords.some(k =>
    bodyLow.includes(k.toLowerCase()) || subject.toLowerCase().includes(k.toLowerCase())
  );

  if (!isCancelled) return { status: "active", checkedAt: TODAY };

  let accessUntil = null;
  if (check.accessUntilPattern) {
    const match = body.match(check.accessUntilPattern);
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Verificando status de assinaturas via Gmail...\n");

  const token = await getAccessToken();

  let current = {};
  try { current = JSON.parse(readFileSync(STATUS_FILE, "utf-8")); } catch {}

  let changed = false;

  for (const check of CHECKS) {
    process.stdout.write(`  ${check.name.padEnd(14)}`);
    try {
      const result = await checkSubscription(check, token);

      // Só atualiza se mudou algo relevante (não sobrescreve cancelledAt com dados antigos)
      const prev = current[check.name] ?? {};
      if (result.status === "cancelled" || prev.status !== "cancelled") {
        const merged = { ...prev, ...result };
        if (JSON.stringify(merged) !== JSON.stringify(prev)) {
          current[check.name] = merged;
          changed = true;
        }
      }

      const icon = result.status === "cancelled"
        ? `✅  Cancelado (${result.cancelledAt ?? "?"})`
        : result.status === "active"
        ? "🔴  Ativo"
        : "❓  Desconhecido";
      console.log(icon);
    } catch (e) {
      console.log(`⚠️   Erro: ${e.message}`);
    }
  }

  if (changed) {
    writeFileSync(STATUS_FILE, JSON.stringify(current, null, 2));
    console.log("\n✅ data/subscription-status.json atualizado.");
  } else {
    console.log("\n✔  Nenhuma mudança detectada.");
  }
}

main();
