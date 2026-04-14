import { readFileSync } from "fs";
import path from "path";
import InvoiceDashboard from "@/components/InvoiceDashboard";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function loadInvoices(): Invoice[] {
  try {
    const filePath = path.join(process.cwd(), "data", "invoices.json");
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Invoice[];
  } catch {
    return [];
  }
}

export default function Home() {
  const invoices = loadInvoices();
  return <InvoiceDashboard invoices={invoices} />;
}
