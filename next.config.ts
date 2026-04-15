import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling pdfjs-dist — it must resolve at runtime
  // so Node.js can locate pdf.worker.mjs via normal module resolution.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
