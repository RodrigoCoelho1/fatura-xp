/**
 * Google Drive upload helper — uses Drive API v3 directly (no googleapis SDK).
 *
 * Required env vars (all optional — upload is silently skipped if missing):
 *   GOOGLE_CLIENT_ID      – OAuth2 client ID (Google Cloud Console)
 *   GOOGLE_CLIENT_SECRET  – OAuth2 client secret
 *   GOOGLE_REFRESH_TOKEN  – Long-lived refresh token (run scripts/get-google-token.mjs once)
 *   GOOGLE_DRIVE_FOLDER_ID – Target folder ID in Google Drive
 *
 * File naming convention: "YYYY MM Fatura.pdf"  (e.g. "2026 04 Fatura.pdf")
 */

async function getAccessToken(): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to get Google access token: ${err}`);
  }
  const data = await resp.json();
  return data.access_token as string;
}

/**
 * Upload a PDF buffer to Google Drive.
 * Returns the Drive file ID on success, or null if credentials are not configured.
 */
export async function uploadInvoiceToDrive(
  pdfBytes: Buffer,
  invoiceMonth: string // "YYYY-MM"
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    // Credentials not configured — silently skip Drive upload
    return null;
  }

  const [yyyy, mm] = invoiceMonth.split("-");
  const filename = `${yyyy} ${mm} Fatura.pdf`;

  try {
    const accessToken = await getAccessToken();

    // Build multipart/related body (metadata + PDF bytes)
    const boundary = "fatura_xp_drive_boundary";
    const metadata = JSON.stringify({
      name: filename,
      parents: [folderId],
      mimeType: "application/pdf",
    });

    const parts: (string | Uint8Array)[] = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
      new Uint8Array(pdfBytes),
      `\r\n--${boundary}--`,
    ];

    // Assemble into a single Buffer
    const textEncoder = new TextEncoder();
    const chunks = parts.map((p) =>
      typeof p === "string" ? textEncoder.encode(p) : p
    );
    const totalLen = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const body = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const uploadResp = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary="${boundary}"`,
          "Content-Length": String(body.byteLength),
        },
        body: body,
      }
    );

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      throw new Error(`Drive upload failed (${uploadResp.status}): ${errText}`);
    }

    const result = await uploadResp.json();
    console.log(`✅ Drive upload: "${filename}" → ID ${result.id}`);
    return result.id as string;
  } catch (err: any) {
    console.error("Drive upload error:", err.message);
    return null; // Don't break the main flow if Drive upload fails
  }
}
