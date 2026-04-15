import { readFileSync } from "fs";
import path from "path";
import InvoiceDashboard from "@/components/InvoiceDashboard";
import type { Invoice, SubscriptionStatusMap } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function loadInvoices(): Invoice[] {
  try {
    const filePath = path.join(process.cwd(), "data", "invoices.json");
    return JSON.parse(readFileSync(filePath, "utf-8")) as Invoice[];
  } catch {
    return [];
  }
}

function loadSubscriptionStatuses(): SubscriptionStatusMap {
  try {
    const filePath = path.join(process.cwd(), "data", "subscription-status.json");
    return JSON.parse(readFileSync(filePath, "utf-8")) as SubscriptionStatusMap;
  } catch {
    return {};
  }
}

export default function Home() {
  const invoices = loadInvoices();
  const subStatuses = loadSubscriptionStatuses();
  return <InvoiceDashboard invoices={invoices} subStatuses={subStatuses} />;
}
