/**
 * One-time script to get a Google OAuth2 refresh token for Drive API.
 *
 * Run ONCE to get the refresh token, then add it to Vercel env vars.
 * After that, Drive upload works automatically every month.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com
 *   2. Create/select a project → Enable "Google Drive API"
 *   3. APIs & Services → Credentials → Create OAuth 2.0 Client ID
 *      - Application type: Desktop App
 *      - Name: "Fatura XP"
 *   4. Download the JSON or note the Client ID and Client Secret
 *   5. Set env vars: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
 *      (in .env.local or as shell exports)
 *   6. Share the Drive folder with your Google account (already done)
 *
 * Usage:
 *   node scripts/get-google-token.mjs
 */

import http from "http";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
  });
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:4242/callback";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.");
  process.exit(1);
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\n🔑 Opening browser for Google authorization...");
console.log("   If it doesn't open, visit:\n  ", authUrl, "\n");

try { execSync(`start "" "${authUrl}"`); } catch (_) {}

// Start local server to capture the redirect
await new Promise((resolve) => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:4242`);
    const code = url.searchParams.get("code");

    if (!code) {
      res.end("No code received.");
      return;
    }

    res.end("<h2>✅ Authorization complete! Check your terminal.</h2>");
    server.close();

    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResp.json();

    if (!tokens.refresh_token) {
      console.error("❌ No refresh_token received. Did you set prompt=consent? Tokens:", tokens);
    } else {
      console.log("\n✅ Success! Add these to Vercel env vars:\n");
      console.log(`   GOOGLE_CLIENT_ID     = ${CLIENT_ID}`);
      console.log(`   GOOGLE_CLIENT_SECRET = ${CLIENT_SECRET}`);
      console.log(`   GOOGLE_REFRESH_TOKEN = ${tokens.refresh_token}`);
      console.log(`   GOOGLE_DRIVE_FOLDER_ID = 1Myi01mch4_obVUIprfhl6tbUPGeMnbPN`);
      console.log("\n📋 Run these commands:");
      console.log(`   printf "${CLIENT_ID}" | npx vercel env add GOOGLE_CLIENT_ID production`);
      console.log(`   printf "${CLIENT_SECRET}" | npx vercel env add GOOGLE_CLIENT_SECRET production`);
      console.log(`   printf "${tokens.refresh_token}" | npx vercel env add GOOGLE_REFRESH_TOKEN production`);
      console.log(`   printf "1Myi01mch4_obVUIprfhl6tbUPGeMnbPN" | npx vercel env add GOOGLE_DRIVE_FOLDER_ID production`);
    }

    resolve();
  });

  server.listen(4242, () => console.log("⏳ Waiting for Google authorization on http://localhost:4242..."));
});
