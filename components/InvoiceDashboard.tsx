"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, LineChart, Line, Legend,
} from "recharts";
import type {
  Invoice, Transaction, CategoryStat, Subscription, ActiveInstallment, MonthlySummary,
} from "@/lib/types";
import {
  CATEGORY_COLORS, CARDHOLDER_LABELS, getCategoryStats, normalizeSubscriptionName,
} from "@/lib/categories";

// ─── Formatters ────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}
function fmtShort(v: number) {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

const CAT_ICON: Record<string, string> = {
  Assinaturas: "🔔", "Farmácia & Saúde": "💊", Alimentação: "🍽️",
  Transporte: "🚗", "Compras Online": "🛒", "Moda & Vestuário": "👗",
  "Eletrônicos & Games": "🎮", "Viagens & Hotéis": "✈️",
  "Bem-Estar & Pessoal": "💆", "Educação & Eventos": "📚",
  "Casa & Condomínio": "🏠", Telefone: "📱", Outros: "📌",
};

const ESSENTIAL_SUBS = ["vivo", "claude", "chatgpt", "openai", "anthropic", "microsoft", "notion", "google one", "youtube", "amazon prime", "apple service", "conta vivo", "telecel"];

// ─── Derived data ──────────────────────────────────────────────────────────────

function getSubscriptions(invoices: Invoice[]): Subscription[] {
  const map = new Map<string, { months: Set<string>; amounts: number[]; category: string; lastSeen: string }>();
  for (const inv of invoices) {
    for (const t of inv.transactions) {
      if (t.isPayment || !["Assinaturas", "Telefone"].includes(t.category)) continue;
      const name = normalizeSubscriptionName(t.merchant);
      const e = map.get(name) ?? { months: new Set(), amounts: [], category: t.category, lastSeen: "" };
      e.months.add(inv.month);
      e.amounts.push(t.amount);
      if (inv.month > e.lastSeen) e.lastSeen = inv.month;
      map.set(name, e);
    }
  }
  return Array.from(map.entries())
    .map(([merchant, { months, amounts, category, lastSeen }]) => ({
      merchant, avgMonthly: amounts.reduce((a, b) => a + b, 0) / amounts.length,
      monthsPresent: months.size, lastSeen, category,
    }))
    .sort((a, b) => b.avgMonthly - a.avgMonthly);
}

function getInstallments(invoices: Invoice[]): ActiveInstallment[] {
  const map = new Map<string, { merchant: string; maxCurrent: number; total: number; amounts: number[] }>();
  for (const inv of invoices) {
    for (const t of inv.transactions) {
      if (!t.installment) continue;
      const key = `${normalizeSubscriptionName(t.merchant).toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 25)}_${t.installment.total}`;
      const e = map.get(key) ?? { merchant: t.merchant, maxCurrent: 0, total: t.installment.total, amounts: [] };
      if (t.installment.current > e.maxCurrent) e.maxCurrent = t.installment.current;
      e.amounts.push(t.amount);
      map.set(key, e);
    }
  }
  return Array.from(map.values())
    .filter((e) => e.maxCurrent < e.total)
    .map((e) => {
      const monthly = e.amounts.length > 0 ? e.amounts.reduce((a, b) => a + b, 0) / e.amounts.length : 0;
      return { merchant: e.merchant, current: e.maxCurrent, total: e.total, monthlyAmount: monthly, remainingAmount: (e.total - e.maxCurrent) * monthly };
    })
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}

function getTopMerchants(transactions: Transaction[], n = 8) {
  const map = new Map<string, number>();
  for (const t of transactions.filter((t) => !t.isPayment)) {
    const name = normalizeSubscriptionName(t.merchant);
    map.set(name, (map.get(name) ?? 0) + t.amount);
  }
  return Array.from(map.entries()).map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount).slice(0, n);
}

// ─── Auto-generated insights ───────────────────────────────────────────────────

type Insight = { icon: string; text: string; kind: "good" | "bad" | "neutral" };

function buildInsights(
  invoices: Invoice[],
  subscriptions: Subscription[],
  installments: ActiveInstallment[],
  avg: number,
): Insight[] {
  const out: Insight[] = [];
  const latest = invoices.at(-1);
  const prev = invoices.at(-2);

  // vs average
  if (latest && avg > 0) {
    const pct = ((latest.totalSpent - avg) / avg) * 100;
    if (pct > 10)
      out.push({ icon: "⚠️", text: `Fatura ${pct.toFixed(0)}% acima da sua média histórica`, kind: "bad" });
    else if (pct < -10)
      out.push({ icon: "✅", text: `Fatura ${Math.abs(pct).toFixed(0)}% abaixo da média — ótimo mês!`, kind: "good" });
  }

  // biggest category jump
  if (latest && prev) {
    const cats = new Set<string>();
    [...latest.transactions, ...prev.transactions].filter((t) => !t.isPayment).forEach((t) => cats.add(t.category));
    const deltas = Array.from(cats)
      .map((cat) => {
        const curr = latest.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
        const ante = prev.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
        return { cat, curr, ante, pct: ante > 0 ? ((curr - ante) / ante) * 100 : null };
      })
      .filter((x) => x.pct !== null && x.curr > 80);

    const biggest = [...deltas].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
    if (biggest && biggest.pct! > 25)
      out.push({ icon: "📈", text: `${biggest.cat} subiu ${biggest.pct!.toFixed(0)}% vs mês anterior (${fmtBRL(biggest.ante)} → ${fmtBRL(biggest.curr)})`, kind: "bad" });

    const best = [...deltas].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0];
    if (best && best.pct! < -25)
      out.push({ icon: "📉", text: `${best.cat} caiu ${Math.abs(best.pct!).toFixed(0)}% — economia real`, kind: "good" });
  }

  // subscriptions
  const subTotal = subscriptions.reduce((s, sub) => s + sub.avgMonthly, 0);
  if (subTotal > 0) {
    const anual = 12 * subTotal;
    out.push({ icon: "🔔", text: `${fmtBRL(subTotal)}/mês em assinaturas — ${fmtBRL(anual)} por ano`, kind: "neutral" });
  }

  // installments
  if (installments.length > 0) {
    const instTotal = installments.reduce((s, i) => s + i.monthlyAmount, 0);
    out.push({ icon: "💳", text: `${installments.length} parcelamentos ativos · ${fmtBRL(instTotal)}/mês comprometidos`, kind: "neutral" });
  }

  return out.slice(0, 4);
}

// ─── Micro components ──────────────────────────────────────────────────────────

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const pos = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${pos ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"}`}>
      {pos ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function InsightCard({ ins }: { ins: Insight }) {
  const styles: Record<Insight["kind"], string> = {
    good: "bg-emerald-50 border-emerald-200 text-emerald-800",
    bad: "bg-rose-50 border-rose-200 text-rose-800",
    neutral: "bg-blue-50 border-blue-100 text-blue-800",
  };
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles[ins.kind]}`}>
      <span className="flex-shrink-0 mt-0.5">{ins.icon}</span>
      <span>{ins.text}</span>
    </div>
  );
}

function CatRow({ c, max }: { c: CategoryStat; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-base w-5 text-center flex-shrink-0">{CAT_ICON[c.name] ?? "📌"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-xs font-medium truncate ${c.name === "Outros" ? "text-slate-400" : "text-slate-700"}`}>{c.name}</span>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            <span className={`text-xs font-bold ${c.name === "Outros" ? "text-slate-400" : "text-slate-800"}`}>{fmtBRL(c.amount)}</span>
            <span className="text-xs text-slate-400 w-8 text-right">{c.percentage.toFixed(0)}%</span>
          </div>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${(c.amount / max) * 100}%`, background: c.name === "Outros" ? "#d1d5db" : c.color }}
          />
        </div>
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-slate-600">{p.name}: <strong>{fmtBRL(p.value)}</strong></p>
      ))}
    </div>
  );
}

// ─── Tab 1: Resumo ─────────────────────────────────────────────────────────────

function ResumoTab({
  invoices, avg, monthlySummaries, subscriptions, installments,
}: {
  invoices: Invoice[]; avg: number; monthlySummaries: MonthlySummary[];
  subscriptions: Subscription[]; installments: ActiveInstallment[];
}) {
  const [selectedBar, setSelectedBar] = useState<string | null>(null);

  const latest = invoices.at(-1);
  const prev = invoices.at(-2);

  const displayInvoice = selectedBar ? invoices.find((i) => i.month === selectedBar) ?? latest : latest;
  const displayTxns = displayInvoice?.transactions.filter((t) => !t.isPayment) ?? [];

  const rawCats = getCategoryStats(displayTxns);
  const cats = [...rawCats.filter((c) => c.name !== "Outros"), ...rawCats.filter((c) => c.name === "Outros")];
  const maxCat = cats[0]?.amount ?? 1;

  const subTotal = subscriptions.reduce((s, sub) => s + sub.avgMonthly, 0);
  const instTotal = installments.reduce((s, i) => s + i.monthlyAmount, 0);
  const variation = latest && prev && prev.totalSpent > 0 ? ((latest.totalSpent - prev.totalSpent) / prev.totalSpent) * 100 : 0;
  const vsAvg = avg > 0 && latest ? ((latest.totalSpent - avg) / avg) * 100 : 0;

  const insights = useMemo(
    () => buildInsights(invoices, subscriptions, installments, avg),
    [invoices, subscriptions, installments, avg],
  );

  return (
    <div className="space-y-4">
      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-5 text-white">
        <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-2">
          Fatura atual · {latest?.label ?? "—"}
        </p>
        <p className="text-5xl font-black tracking-tight leading-none">
          {latest ? fmtBRL(latest.totalSpent) : "—"}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <DeltaBadge value={variation} />
          <span className="text-blue-300 text-xs">vs mês anterior</span>
          <DeltaBadge value={vsAvg} />
          <span className="text-blue-300 text-xs">vs média</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10">
          <div>
            <p className="text-xs text-blue-400">Média histórica</p>
            <p className="text-sm font-bold mt-0.5">{fmtBRL(avg)}</p>
          </div>
          <div>
            <p className="text-xs text-blue-400">Assinaturas</p>
            <p className="text-sm font-bold mt-0.5">{fmtBRL(subTotal)}<span className="text-xs font-normal text-blue-400">/mês</span></p>
          </div>
          <div>
            <p className="text-xs text-blue-400">Parcelamentos</p>
            <p className="text-sm font-bold mt-0.5">{fmtBRL(instTotal)}<span className="text-xs font-normal text-blue-400">/mês</span></p>
          </div>
        </div>
      </div>

      {/* ── Insight chips ── */}
      {insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((ins, i) => <InsightCard key={i} ins={ins} />)}
        </div>
      )}

      {/* ── Monthly chart ── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-700">Evolução mensal</h2>
          {selectedBar && (
            <button onClick={() => setSelectedBar(null)} className="text-xs text-blue-500 hover:underline">
              ← ver tudo
            </button>
          )}
        </div>
        {selectedBar && (
          <p className="text-xs text-blue-500 mb-2">
            Categorias: <strong>{monthlySummaries.find((m) => m.month === selectedBar)?.label}</strong>
          </p>
        )}
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={monthlySummaries} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(59,130,246,0.04)" }} />
            <Bar
              dataKey="total" name="Total" radius={[6, 6, 0, 0]}
              style={{ cursor: "pointer" }}
              onClick={(data: any) => setSelectedBar((p) => p === data.month ? null : data.month)}
            >
              {monthlySummaries.map((entry) => (
                <Cell
                  key={entry.month}
                  fill={selectedBar === null ? "#3b82f6" : selectedBar === entry.month ? "#1d4ed8" : "#bfdbfe"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {!selectedBar && (
          <p className="text-xs text-slate-400 text-center mt-1">Toque em uma barra para filtrar as categorias</p>
        )}
      </div>

      {/* ── Category breakdown ── */}
      {cats.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Gastos por categoria</h2>
          <div className="space-y-3">
            {cats.map((c) => <CatRow key={c.name} c={c} max={maxCat} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Faturas ────────────────────────────────────────────────────────────

function FaturasTab({
  invoices,
}: {
  invoices: Invoice[];
}) {
  const [selectedMonth, setSelectedMonth] = useState(invoices.at(-1)?.month ?? "");
  const [txSearch, setTxSearch] = useState("");

  const selectedInvoice = invoices.find((i) => i.month === selectedMonth) ?? invoices.at(-1);
  const prev = selectedInvoice ? invoices[invoices.indexOf(selectedInvoice) - 1] : undefined;

  const txns = selectedInvoice?.transactions.filter((t) => !t.isPayment) ?? [];
  const filtered = txSearch.trim()
    ? txns.filter((t) => t.merchant.toLowerCase().includes(txSearch.toLowerCase()) || t.category.toLowerCase().includes(txSearch.toLowerCase()))
    : txns;

  const topMerchants = useMemo(() => getTopMerchants(selectedInvoice?.transactions ?? []), [selectedInvoice]);

  const variation = selectedInvoice && prev && prev.totalSpent > 0
    ? ((selectedInvoice.totalSpent - prev.totalSpent) / prev.totalSpent) * 100
    : null;

  return (
    <div className="space-y-4">
      {/* Month picker */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {[...invoices].reverse().map((inv) => (
          <button
            key={inv.month}
            onClick={() => setSelectedMonth(inv.month)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${selectedMonth === inv.month
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:border-blue-300"}`}
          >
            {inv.label}
          </button>
        ))}
      </div>

      {selectedInvoice && (
        <>
          {/* Total card */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-5 text-white">
            <p className="text-blue-100 text-xs mb-1">{selectedInvoice.label}</p>
            <p className="text-4xl font-black">{fmtBRL(selectedInvoice.totalSpent)}</p>
            <div className="flex items-center justify-between mt-3">
              <p className="text-blue-100 text-xs">
                {selectedInvoice.transactions.filter((t) => !t.isPayment).length} lançamentos
              </p>
              {variation !== null && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${variation > 0 ? "bg-red-500/30 text-red-100" : "bg-emerald-500/30 text-emerald-100"}`}>
                  {variation > 0 ? "▲" : "▼"} {Math.abs(variation).toFixed(1)}% vs {prev?.label}
                </span>
              )}
            </div>
          </div>

          {/* Top merchants */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Maiores gastos</h2>
            <div className="space-y-2.5">
              {topMerchants.map((m, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono w-4 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700 truncate">{m.name}</span>
                      <span className="text-xs font-bold text-slate-800 ml-2 flex-shrink-0">{fmtBRL(m.amount)}</span>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${(m.amount / (topMerchants[0]?.amount ?? 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Transaction list */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Lançamentos</h2>
              <input
                type="search"
                placeholder="Buscar por estabelecimento ou categoria…"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
              />
            </div>
            <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
              {filtered.map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span className="text-lg flex-shrink-0">{CAT_ICON[t.category] ?? "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{t.merchant}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t.date.slice(8, 10)}/{t.date.slice(5, 7)} · {t.category}
                      {t.cardholder !== "RODRIGO COELHO" && ` · ${CARDHOLDER_LABELS[t.cardholder] ?? t.cardholder}`}
                      {t.installment && ` · ${t.installment.current}/${t.installment.total}x`}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-800 flex-shrink-0">{fmtBRL(t.amount)}</span>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-10">Nenhum lançamento encontrado</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab 3: Compromissos ───────────────────────────────────────────────────────

function CompromissosTab({
  subscriptions, installments,
}: {
  subscriptions: Subscription[]; installments: ActiveInstallment[];
}) {
  const subTotal = subscriptions.reduce((s, sub) => s + sub.avgMonthly, 0);
  const instTotal = installments.reduce((s, i) => s + i.monthlyAmount, 0);
  const total = subTotal + instTotal;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="bg-gradient-to-br from-violet-900 via-indigo-900 to-violet-900 rounded-2xl p-5 text-white">
        <p className="text-violet-300 text-xs font-semibold uppercase tracking-widest mb-2">Compromissos mensais</p>
        <p className="text-5xl font-black leading-none">
          {fmtBRL(total)}
          <span className="text-lg font-normal text-violet-400">/mês</span>
        </p>
        <p className="text-violet-300 text-sm mt-1">{fmtBRL(12 * total)} comprometidos no ano</p>
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
          <div>
            <p className="text-xs text-violet-400">Assinaturas · {subscriptions.length}</p>
            <p className="text-sm font-bold mt-0.5">{fmtBRL(subTotal)}<span className="text-xs font-normal text-violet-400">/mês</span></p>
          </div>
          <div>
            <p className="text-xs text-violet-400">Parcelamentos · {installments.length}</p>
            <p className="text-sm font-bold mt-0.5">{fmtBRL(instTotal)}<span className="text-xs font-normal text-violet-400">/mês</span></p>
          </div>
        </div>
      </div>

      {/* Subscriptions */}
      {subscriptions.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Assinaturas</p>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50 overflow-hidden">
            {subscriptions.map((s, i) => {
              const isEssential = ESSENTIAL_SUBS.some((k) => s.merchant.toLowerCase().includes(k));
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">🔔</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-slate-800">{s.merchant}</p>
                      {!isEssential && (
                        <span className="text-xs bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-medium">revise</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.category} · {s.monthsPresent} {s.monthsPresent === 1 ? "mês" : "meses"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-800">{fmtBRL(s.avgMonthly)}<span className="text-xs font-normal text-slate-400">/mês</span></p>
                    <p className="text-xs text-slate-400">{fmtBRL(12 * s.avgMonthly)}/ano</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Installments */}
      {installments.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Parcelamentos ativos</p>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50 overflow-hidden">
            {installments.map((inst, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{normalizeSubscriptionName(inst.merchant)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Parcela {inst.current}/{inst.total} · {inst.total - inst.current} restantes
                    </p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="text-sm font-bold text-slate-800">{fmtBRL(inst.monthlyAmount)}<span className="text-xs font-normal text-slate-400">/mês</span></p>
                    <p className="text-xs text-slate-400">Restante: {fmtBRL(inst.remainingAmount)}</p>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-400 h-2 rounded-full transition-all"
                    style={{ width: `${(inst.current / inst.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">{Math.round((inst.current / inst.total) * 100)}% concluído</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {installments.length === 0 && (
        <div className="text-center py-10">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-sm text-slate-500">Nenhum parcelamento ativo</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Insights ───────────────────────────────────────────────────────────

const DEFAULT_CATS = ["Alimentação", "Farmácia & Saúde", "Assinaturas", "Transporte", "Compras Online"];

function InsightsTab({
  invoices, subscriptions, avg,
}: {
  invoices: Invoice[]; subscriptions: Subscription[]; avg: number;
}) {
  const latest = invoices.at(-1);
  const prev = invoices.at(-2);

  // Category comparison latest vs prev
  const comparison = useMemo(() => {
    if (!latest || !prev) return [];
    const cats = new Set<string>();
    [...latest.transactions, ...prev.transactions].filter((t) => !t.isPayment).forEach((t) => cats.add(t.category));
    return Array.from(cats).map((cat) => {
      const curr = latest.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
      const ante = prev.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
      return { cat, curr, ante, diff: curr - ante, pct: ante > 0 ? ((curr - ante) / ante) * 100 : null };
    }).filter((x) => x.curr > 0 || x.ante > 0).sort((a, b) => b.curr - a.curr);
  }, [latest, prev]);

  // Non-essential subscriptions for savings
  const nonEssential = subscriptions.filter(
    (s) => !ESSENTIAL_SUBS.some((k) => s.merchant.toLowerCase().includes(k)),
  );
  const savingsMonthly = nonEssential.reduce((s, sub) => s + sub.avgMonthly, 0);

  // Line chart
  const allCats = useMemo(() => {
    const s = new Set<string>();
    invoices.forEach((inv) => inv.transactions.forEach((t) => { if (!t.isPayment) s.add(t.category); }));
    return Array.from(s).filter((c) => c !== "Pagamento").sort();
  }, [invoices]);

  const [selectedCats, setSelectedCats] = useState<string[]>(
    DEFAULT_CATS.filter((c) => allCats.includes(c)),
  );

  const chartData = useMemo(() =>
    invoices.map((inv) => {
      const row: Record<string, any> = { label: inv.label };
      for (const cat of selectedCats) {
        row[cat] = inv.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
      }
      return row;
    }), [invoices, selectedCats]);

  return (
    <div className="space-y-5">
      {/* Savings panel */}
      {nonEssential.length > 0 && (
        <div className="bg-gradient-to-br from-emerald-900 to-teal-900 rounded-2xl p-5 text-white">
          <p className="text-emerald-300 text-xs font-semibold uppercase tracking-widest mb-2">Oportunidade de economia</p>
          <p className="text-3xl font-black leading-none">
            {fmtBRL(savingsMonthly)}
            <span className="text-base font-normal text-emerald-400">/mês</span>
          </p>
          <p className="text-emerald-300 text-sm mt-1">
            = {fmtBRL(12 * savingsMonthly)}/ano cancelando {nonEssential.length} assinatura{nonEssential.length !== 1 ? "s" : ""} não-essencial{nonEssential.length !== 1 ? "is" : ""}
          </p>
          <div className="mt-4 space-y-2">
            {nonEssential.slice(0, 4).map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2">
                <span className="text-sm text-white">{s.merchant}</span>
                <span className="text-sm font-bold text-emerald-200">{fmtBRL(s.avgMonthly)}/mês</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Month comparison */}
      {latest && prev && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Comparativo por categoria</h2>
          <p className="text-xs text-slate-400 mb-4">{prev.label} vs {latest.label}</p>
          <div className="space-y-3">
            {comparison.map(({ cat, curr, ante, diff, pct }) => {
              const color = CATEGORY_COLORS[cat] ?? "#9ca3af";
              const max = Math.max(curr, ante, 1);
              const isUp = diff > 0;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-xs text-slate-700 truncate">{cat}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                      <span className="text-slate-400">{fmtBRL(ante)}</span>
                      <span className="font-bold text-slate-800">{fmtBRL(curr)}</span>
                      {pct !== null && (
                        <span className={`font-semibold w-12 text-right ${isUp ? "text-red-500" : "text-emerald-500"}`}>
                          {isUp ? "+" : ""}{pct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full opacity-40" style={{ width: `${(ante / max) * 100}%`, background: color }} />
                    </div>
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${(curr / max) * 100}%`, background: color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3 text-center">Barra esquerda = {prev.label} · direita = {latest.label}</p>
        </div>
      )}

      {/* Category trend line chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Evolução por categoria</h2>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allCats.map((cat) => {
            const color = CATEGORY_COLORS[cat] ?? "#9ca3af";
            const active = selectedCats.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => setSelectedCats((s) => s.includes(cat) ? s.filter((c) => c !== cat) : [...s, cat])}
                className="text-xs px-2.5 py-1 rounded-full border transition-all font-medium"
                style={active
                  ? { background: color, borderColor: color, color: "#fff" }
                  : { background: "#fff", borderColor: "#e2e8f0", color: "#64748b" }}
              >
                {cat}
              </button>
            );
          })}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: any) => fmtBRL(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.08)" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {selectedCats.map((cat) => (
              <Line
                key={cat} type="monotone" dataKey={cat}
                stroke={CATEGORY_COLORS[cat] ?? "#9ca3af"}
                strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

const TABS = [
  { id: "resumo",       label: "Resumo",       icon: "📊" },
  { id: "faturas",      label: "Faturas",       icon: "📅" },
  { id: "compromissos", label: "Compromissos",  icon: "💳" },
  { id: "insights",     label: "Insights",      icon: "💡" },
];

export default function InvoiceDashboard({ invoices }: { invoices: Invoice[] }) {
  const [tab, setTab] = useState("resumo");
  const [cardholder, setCardholder] = useState("all");

  const filteredInvoices = useMemo(() =>
    cardholder === "all" ? invoices : invoices.map((inv) => ({
      ...inv,
      transactions: inv.transactions.filter((t) => t.cardholder === cardholder),
      totalSpent: inv.transactions.filter((t) => !t.isPayment && t.cardholder === cardholder).reduce((s, t) => s + t.amount, 0),
    })), [invoices, cardholder]);

  const monthlySummaries: MonthlySummary[] = filteredInvoices.map((inv) => {
    const byCategory: Record<string, number> = {};
    for (const t of inv.transactions.filter((t) => !t.isPayment)) byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
    return { month: inv.month, label: inv.label, total: inv.totalSpent, byCategory };
  });

  const subscriptions = useMemo(() => getSubscriptions(invoices), [invoices]);
  const installments  = useMemo(() => getInstallments(invoices),  [invoices]);
  const avg = filteredInvoices.length > 0 ? filteredInvoices.reduce((s, i) => s + i.totalSpent, 0) / filteredInvoices.length : 0;

  const latest = filteredInvoices.at(-1);

  const cardholders = useMemo(() => {
    const s = new Set<string>();
    invoices.forEach((inv) => inv.transactions.forEach((t) => { if (t.cardholder) s.add(t.cardholder); }));
    return Array.from(s);
  }, [invoices]);

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f8" }}>
      {/* ── Header ── */}
      <header style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)" }} className="text-white">
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-black tracking-tight">Fatura XP</h1>
              <p className="text-blue-400 text-xs mt-0.5">Controle inteligente de gastos</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-400">Última fatura</p>
              <p className="text-xl font-black">{latest ? fmtBRL(latest.totalSpent) : "—"}</p>
              <p className="text-xs text-blue-400">{latest?.label}</p>
            </div>
          </div>
          {/* Cardholder filter */}
          {cardholders.length > 1 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <button
                onClick={() => setCardholder("all")}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-all ${cardholder === "all" ? "bg-white text-slate-900" : "bg-white/10 text-blue-200 hover:bg-white/20"}`}
              >
                Todos
              </button>
              {cardholders.map((ch) => (
                <button
                  key={ch}
                  onClick={() => setCardholder(ch)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold transition-all ${cardholder === ch ? "bg-white text-slate-900" : "bg-white/10 text-blue-200 hover:bg-white/20"}`}
                >
                  {CARDHOLDER_LABELS[ch] ?? ch}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Tab nav ── */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-0">
          <div className="flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab === t.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-400 hover:text-slate-600"}`}
              >
                <span className="text-base">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="max-w-2xl mx-auto px-4 py-5 pb-10">
        {tab === "resumo" && (
          <ResumoTab
            invoices={filteredInvoices} avg={avg}
            monthlySummaries={monthlySummaries}
            subscriptions={subscriptions} installments={installments}
          />
        )}
        {tab === "faturas" && (
          <FaturasTab invoices={filteredInvoices} />
        )}
        {tab === "compromissos" && (
          <CompromissosTab subscriptions={subscriptions} installments={installments} />
        )}
        {tab === "insights" && (
          <InsightsTab invoices={filteredInvoices} subscriptions={subscriptions} avg={avg} />
        )}
      </main>
    </div>
  );
}
