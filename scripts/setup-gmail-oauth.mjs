/**
 * setup-gmail-oauth.mjs
 *
 * Roda UMA VEZ para gerar o refresh token do Gmail.
 * Depois disso tudo é automático via GitHub Actions.
 *
 * Uso:
 *   node scripts/setup-gmail-oauth.mjs
 *
 * Pré-requisitos (5 minutos, uma única vez):
 *   1. Acesse: https://console.cloud.google.com/
 *   2. Crie um projeto (ou use um existente)
 *   3. Ative a Gmail API: APIs & Services → Enable APIs → Gmail API
 *   4. Crie credenciais: APIs & Services → Credentials
 *      → Create credentials → OAuth 2.0 Client ID
 *      → Application type: Desktop app
 *      → Download o JSON e copie o client_id e client_secret abaixo
 */

import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// PASSO 1 — Cole aqui suas credenciais do Google Cloud Console
// ─────────────────────────────────────────────────────────────────────────────
const CLIENT_ID     = process.env.GMAIL_CLIENT_ID     ?? "COLE_SEU_CLIENT_ID_AQUI";
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET ?? "COLE_SEU_CLIENT_SECRET_AQUI";
// ─────────────────────────────────────────────────────────────────────────────

const REDIRECT_URI = "http://localhost:3333/callback";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOKEN_FILE = path.join(__dirname, "../.gmail-tokens.json");

function buildAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",   // força geração de refresh_token
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  return res.json();
}

async function main() {
  if (CLIENT_ID === "COLE_SEU_CLIENT_ID_AQUI") {
    console.log(`
❌  Credenciais não configuradas!

Por favor edite este arquivo e preencha:
  CLIENT_ID     → seu client_id do Google Cloud
  CLIENT_SECRET → seu client_secret do Google Cloud

Ou defina as variáveis de ambiente:
  GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/setup-gmail-oauth.mjs

📖 Como obter as credenciais (5 min):
   1. https://console.cloud.google.com/
   2. Crie/selecione um projeto
   3. APIs & Services → Library → Gmail API → Enable
   4. APIs & Services → Credentials → Create Credentials
      → OAuth 2.0 Client ID → Desktop app → Create
   5. Copie o Client ID e Client Secret
`);
    process.exit(1);
  }

  console.log("\n🔑 Setup OAuth Gmail — executar apenas uma vez\n");
  console.log("Iniciando servidor local na porta 3333...");

  const authUrl = buildAuthUrl();

  // Tenta abrir o browser automaticamente
  const { exec } = await import("child_process");
  const open = (url) => {
    const cmd = process.platform === "win32" ? `start "" "${url}"`
              : process.platform === "darwin" ? `open "${url}"`
              : `xdg-open "${url}"`;
    exec(cmd);
  };

  await new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (!req.url?.startsWith("/callback")) return;

      const url    = new URL(req.url, "http://localhost:3333");
      const code   = url.searchParams.get("code");
      const error  = url.searchParams.get("error");

      if (error) {
        res.end(`<h2>❌ Erro: ${error}</h2><p>Feche esta aba e tente novamente.</p>`);
        server.close();
        reject(new Error(error));
        return;
      }

      res.end(`
        <h2>✅ Autorização concluída!</h2>
        <p>Pode fechar esta aba e voltar ao terminal.</p>
        <style>body{font-family:sans-serif;padding:40px;}</style>
      `);
      server.close();

      console.log("\n✅ Código recebido! Trocando por tokens...");
      const tokens = await exchangeCode(code);

      if (!tokens.refresh_token) {
        console.error("❌  refresh_token não recebido. Tente revogar o acesso em:");
        console.error("    https://myaccount.google.com/permissions");
        console.error("   e rode o script novamente.");
        reject(new Error("no refresh_token"));
        return;
      }

      // Salva tokens localmente
      writeFileSync(TOKEN_FILE, JSON.stringify({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        access_token:  tokens.access_token,
        savedAt:       new Date().toISOString(),
      }, null, 2));

      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  TOKENS SALVOS em .gmail-tokens.json

Agora adicione os 3 secrets no seu repositório GitHub:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Acesse: https://github.com/RodrigoCoelho1/fatura-xp/settings/secrets/actions/new

┌─ GMAIL_CLIENT_ID ─────────────────────────────────┐
│ ${CLIENT_ID}
└───────────────────────────────────────────────────┘

┌─ GMAIL_CLIENT_SECRET ─────────────────────────────┐
│ ${CLIENT_SECRET}
└───────────────────────────────────────────────────┘

┌─ GMAIL_REFRESH_TOKEN ─────────────────────────────┐
│ ${tokens.refresh_token}
└───────────────────────────────────────────────────┘

Após adicionar os 3 secrets, o GitHub Actions vai rodar
automaticamente todo dia às 03:00 (horário de Brasília).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
      resolve();
    });

    server.listen(3333, () => {
      console.log(`\n🌐 Abrindo seu browser para autorização do Gmail...`);
      console.log(`   (Se não abrir automaticamente, acesse: ${authUrl})\n`);
      open(authUrl);
    });

    server.on("error", reject);
    setTimeout(() => { server.close(); reject(new Error("timeout")); }, 5 * 60 * 1000);
  });
}

main().catch(e => {
  console.error("Erro:", e.message);
  process.exit(1);
});
