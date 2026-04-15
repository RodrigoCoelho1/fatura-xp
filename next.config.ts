import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling pdfjs-dist — it must resolve at runtime
  // so Node.js can locate pdf.worker.mjs via normal module resolution.
  serverExternalPackages: ["pdfjs-dist"],

  // Include the pdfjs worker file in the Vercel deployment bundle.
  // Vercel's file tracer can't detect it because pdfjs loads it dynamically.
  outputFileTracingIncludes: {
    "/api/process-invoice": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
