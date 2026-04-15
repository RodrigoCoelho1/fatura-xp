export interface Installment {
  current: number;
  total: number;
}

export interface Transaction {
  date: string;
  merchant: string;
  cardholder: string;
  amount: number;
  isPayment: boolean;
  installment: Installment | null;
  category: string;
  invoiceMonth: string;
}

export interface Invoice {
  month: string;   // "2024-11"
  label: string;   // "Nov 2024"
  transactions: Transaction[];
  totalSpent: number;
}

export interface MonthlySummary {
  month: string;
  label: string;
  total: number;
  byCategory: Record<string, number>;
}

export interface CategoryStat {
  name: string;
  amount: number;
  count: number;
  percentage: number;
  color: string;
}

export interface Subscription {
  merchant: string;
  avgMonthly: number;
  monthsPresent: number;
  lastSeen: string;
  category: string;
}

export interface ActiveInstallment {
  merchant: string;
  current: number;
  total: number;
  monthlyAmount: number;
  remainingAmount: number;
}

export interface SubStatus {
  status: "active" | "cancelled" | "unknown";
  cancelledAt: string | null;
  accessUntil: string | null;
  emailSubject: string | null;
  emailDate: string | null;
  checkedAt: string;
}

export type SubscriptionStatusMap = Record<string, SubStatus>;
