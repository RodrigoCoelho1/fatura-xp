"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import type {
  Invoice, Transaction, CategoryStat, Subscription, ActiveInstallment, MonthlySummary,
} from "@/lib/types";
import {
  CATEGORY_COLORS, CARDHOLDER_LABELS, getCategoryStats, normalizeSubscriptionName,
} from "@/lib/categories";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}
function fmtShort(v: number) {
  return v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

const CAT_ICON: Record<string, string> = {
  Assinaturas: "🔔", "Farmácia & Saúde": "💊", "Alimentação": "🍽️",
  Transporte: "🚗", "Compras Online": "🛒", "Moda & Vestuário": "👗",
  "Eletrônicos & Games": "🎮", "Viagens & Hotéis": "✈️",
  "Bem-Estar & Pessoal": "💆", "Educação & Eventos": "📚",
  "Casa & Condomínio": "🏠", Telefone: "📱", Outros: "📌",
};

// ─── Derived data helpers ──────────────────────────────────────────────────────

function getSubscriptions(invoices: Invoice[]): Subscription[] {
  const map = new Map<string, { months: Set<string>; amounts: number[]; category: string; lastSeen: string }>();
  for (const inv of invoices) {
    for (const t of inv.transactions) {
      if (t.isPayment || !["Assinaturas", "Telefone"].includes(t.category)) continue;
      const name = normalizeSubscriptionName(t.merchant);
      const existing = map.get(name) ?? { months: new Set(), amounts: [], category: t.category, lastSeen: "" };
      existing.months.add(inv.month);
      existing.amounts.push(t.amount);
      if (inv.month > existing.lastSeen) existing.lastSeen = inv.month;
      map.set(name, existing);
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
      const existing = map.get(key) ?? { merchant: t.merchant, maxCurrent: 0, total: t.installment.total, amounts: [] };
      if (t.installment.current > existing.maxCurrent) existing.maxCurrent = t.installment.current;
      existing.amounts.push(t.amount);
      map.set(key, existing);
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

function getTopMerchants(transactions: Transaction[], n = 10) {
  const map = new Map<string, number>();
  for (const t of transactions.filter((t) => !t.isPayment)) {
    const name = normalizeSubscriptionName(t.merchant);
    map.set(name, (map.get(name) ?? 0) + t.amount);
  }
  return Array.from(map.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, n);
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? "text-slate-800"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.name === "Total" ? "#2563eb" : undefined }}>
          {p.name}: {fmtBRL(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  invoices, latest, monthlySummaries, variation, totalSubscriptions, totalInstallments, allTxns,
}: {
  invoices: Invoice[]; latest?: Invoice; monthlySummaries: MonthlySummary[];
  variation: number; totalSubscriptions: number; totalInstallments: number; allTxns: Transaction[];
}) {
  const avg = invoices.length > 0 ? invoices.reduce((s, i) => s + i.totalSpent, 0) / invoices.length : 0;
  const allCats = getCategoryStats(allTxns.filter((t) => !t.isPayment));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Fatura Atual" value={latest ? fmtBRL(latest.totalSpent) : "—"} sub={latest?.label} color="text-blue-700" />
        <StatCard
          label="Variação" value={`${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`}
          sub="vs mês anterior" color={variation > 5 ? "text-red-600" : variation < -5 ? "text-green-600" : "text-slate-700"}
        />
        <StatCard label="Assinaturas/mês" value={fmtBRL(totalSubscriptions)} sub={`${fmtBRL(12 * totalSubscriptions)}/ano`} color="text-indigo-600" />
        <StatCard label="Média Mensal" value={fmtBRL(avg)} sub={`${invoices.length} faturas`} />
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">📈 Evolução Mensal</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlySummaries} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">🏷️ Categorias (todas as faturas)</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-shrink-0">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={allCats} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="amount" paddingAngle={2}>
                  {allCats.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-48">
            {allCats.slice(0, 10).map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
                <span className="text-xs text-slate-600 flex-1 truncate">{c.name}</span>
                <span className="text-xs font-semibold text-slate-700 flex-shrink-0">{fmtBRL(c.amount)}</span>
                <span className="text-xs text-slate-400 w-10 text-right flex-shrink-0">{c.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {totalInstallments > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800">💳 Parcelamentos ativos</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{fmtBRL(totalInstallments)}<span className="text-sm font-normal">/mês</span></p>
          <p className="text-xs text-amber-600 mt-1">Este valor já está incluído nas faturas acima</p>
        </div>
      )}
    </div>
  );
}

// ─── Monthly Tab ──────────────────────────────────────────────────────────────

function MonthlyTab({
  invoices, selectedMonth, setSelectedMonth, selectedInvoice, categories, filteredTxns, txSearch, setTxSearch, topMerchants,
}: {
  invoices: Invoice[]; selectedMonth: string; setSelectedMonth: (m: string) => void;
  selectedInvoice?: Invoice; categories: CategoryStat[]; filteredTxns: Transaction[];
  txSearch: string; setTxSearch: (s: string) => void; topMerchants: { name: string; amount: number }[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[...invoices].reverse().map((inv) => (
          <button key={inv.month} onClick={() => setSelectedMonth(inv.month)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedMonth === inv.month ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
            {inv.label}
          </button>
        ))}
      </div>

      {selectedInvoice && (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total — {selectedInvoice.label}</p>
              <p className="text-3xl font-bold text-blue-700 mt-1">{fmtBRL(selectedInvoice.totalSpent)}</p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <p>{selectedInvoice.transactions.filter((t) => !t.isPayment).length} lançamentos</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Categorias</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categories.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} width={120} />
                <Tooltip formatter={(v: any) => fmtBRL(v)} />
                <Bar dataKey="amount" name="Valor" radius={[0, 4, 4, 0]}>
                  {categories.slice(0, 8).map((c, i) => <Cell key={i} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">🏪 Maiores gastos</h2>
            <div className="space-y-2">
              {topMerchants.slice(0, 8).map((m, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-5 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm text-slate-700 truncate">{m.name}</span>
                      <span className="text-sm font-semibold text-slate-800 ml-2 flex-shrink-0">{fmtBRL(m.amount)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1">
                      <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${(m.amount / (topMerchants[0]?.amount || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">📋 Lançamentos</h2>
              <input type="search" placeholder="Buscar estabelecimento ou categoria..." value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {filteredTxns.map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span className="text-lg flex-shrink-0">{CAT_ICON[t.category] ?? "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate font-medium">{t.merchant}</p>
                    <p className="text-xs text-slate-400">
                      {t.date.slice(8, 10)}/{t.date.slice(5, 7)} · {t.category}
                      {t.cardholder !== "RODRIGO COELHO" && ` · ${CARDHOLDER_LABELS[t.cardholder] ?? t.cardholder}`}
                      {t.installment && ` · ${t.installment.current}/${t.installment.total}x`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-800 flex-shrink-0">{fmtBRL(t.amount)}</span>
                </div>
              ))}
              {filteredTxns.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhum lançamento encontrado</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Trends Tab ───────────────────────────────────────────────────────────────

const DEFAULT_CATS = ["Alimentação", "Farmácia & Saúde", "Assinaturas", "Transporte", "Compras Online"];

function TrendsTab({ invoices }: { invoices: Invoice[] }) {
  const allCats = useMemo(() => {
    const s = new Set<string>();
    invoices.forEach((inv) => inv.transactions.forEach((t) => { if (!t.isPayment) s.add(t.category); }));
    return Array.from(s).filter((c) => c !== "Pagamento").sort();
  }, [invoices]);

  const [selected, setSelected] = useState<string[]>(DEFAULT_CATS.filter((c) => allCats.includes(c)));

  const chartData = useMemo(() =>
    invoices.map((inv) => {
      const row: Record<string, any> = { label: inv.label };
      for (const cat of selected) {
        row[cat] = inv.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
      }
      return row;
    }), [invoices, selected]);

  const latest = invoices.at(-1);
  const prev = invoices.at(-2);

  const comparison = useMemo(() => {
    if (!latest || !prev) return [];
    const cats = new Set<string>();
    [...latest.transactions, ...prev.transactions].forEach((t) => { if (!t.isPayment) cats.add(t.category); });
    return Array.from(cats).map((cat) => {
      const curr = latest.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
      const ante = prev.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
      return { cat, curr, ante, diff: curr - ante };
    }).filter((x) => x.curr > 0 || x.ante > 0).sort((a, b) => b.curr - a.curr);
  }, [latest, prev]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">📈 Evolução por Categoria</h2>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allCats.map((cat) => {
            const color = CATEGORY_COLORS[cat] ?? "#9ca3af";
            const active = selected.includes(cat);
            return (
              <button key={cat} onClick={() => setSelected((s) => s.includes(cat) ? s.filter((c) => c !== cat) : [...s, cat])}
                className={`text-xs px-2 py-1 rounded-full border transition-all ${active ? "text-white" : "bg-white text-slate-500 border-slate-200"}`}
                style={active ? { background: color, borderColor: color } : {}}>
                {cat}
              </button>
            );
          })}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <Tooltip formatter={(v: any) => fmtBRL(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {selected.map((cat) => (
              <Line key={cat} type="monotone" dataKey={cat} stroke={CATEGORY_COLORS[cat] ?? "#9ca3af"} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {latest && prev && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">🔄 Comparativo Mês a Mês</h2>
          <p className="text-xs text-slate-400 mb-4">{prev.label} → {latest.label}</p>
          <div className="space-y-3">
            {comparison.map(({ cat, curr, ante, diff }) => {
              const color = CATEGORY_COLORS[cat] ?? "#9ca3af";
              const max = Math.max(curr, ante, 1);
              const pct = ante > 0 ? ((curr - ante) / ante) * 100 : null;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-xs text-slate-700 truncate">{cat}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                      <span className="text-slate-400">{fmtBRL(ante)}</span>
                      <span className="font-semibold text-slate-800">{fmtBRL(curr)}</span>
                      {pct !== null && <span className={`font-medium w-14 text-right ${diff > 0 ? "text-red-500" : "text-green-500"}`}>{diff > 0 ? "+" : ""}{pct.toFixed(1)}%</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full opacity-50" style={{ width: `${(ante / max) * 100}%`, background: color }} />
                    </div>
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${(curr / max) * 100}%`, background: color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3">Barra esquerda = {prev.label} · Barra direita = {latest.label}</p>
        </div>
      )}
    </div>
  );
}

// ─── Subscriptions Tab ────────────────────────────────────────────────────────

function SubscriptionsTab({ subscriptions, total }: { subscriptions: Subscription[]; total: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total Mensal" value={fmtBRL(total)} color="text-indigo-600" />
        <StatCard label="Total Anual" value={fmtBRL(12 * total)} sub="projeção" color="text-red-600" />
        <StatCard label="Qtd. Serviços" value={String(subscriptions.length)} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">🔔 Todas as assinaturas detectadas</h2>
          <p className="text-xs text-slate-400 mt-0.5">Ordenadas por custo mensal médio</p>
        </div>
        <div className="divide-y divide-slate-50">
          {subscriptions.map((s, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{s.merchant}</p>
                <p className="text-xs text-slate-400">{s.monthsPresent} {s.monthsPresent === 1 ? "mês" : "meses"} registrado(s)</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-slate-800">{fmtBRL(s.avgMonthly)}<span className="text-xs font-normal text-slate-400">/mês</span></p>
                <p className="text-xs text-slate-400">{fmtBRL(12 * s.avgMonthly)}/ano</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Installments Tab ─────────────────────────────────────────────────────────

function InstallmentsTab({ installments, total }: { installments: ActiveInstallment[]; total: number }) {
  if (installments.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3">✅</p>
        <p className="text-slate-600 font-medium">Nenhum parcelamento ativo detectado</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Compromisso Mensal" value={fmtBRL(total)} color="text-amber-600" />
        <StatCard label="Parcelamentos Ativos" value={String(installments.length)} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">💳 Parcelamentos em andamento</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {installments.map((inst, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{inst.merchant}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Parcela {inst.current} de {inst.total} · {inst.total - inst.current} restantes</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-slate-800">{fmtBRL(inst.monthlyAmount)}<span className="text-xs font-normal text-slate-400">/mês</span></p>
                  <p className="text-xs text-slate-400">Total restante: {fmtBRL(inst.remainingAmount)}</p>
                </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-amber-400 h-2 rounded-full transition-all" style={{ width: `${(inst.current / inst.total) * 100}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1 text-right">{Math.round((inst.current / inst.total) * 100)}% pago</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Savings Tab ──────────────────────────────────────────────────────────────

const ESSENTIAL_KEYWORDS = ["vivo", "claude", "chatgpt", "openai", "anthropic", "microsoft", "notion", "google one", "youtube", "amazon prime", "apple service"];

function SavingsTab({
  invoices, subscriptions, installments, totalSubscriptions, totalInstallments,
}: {
  invoices: Invoice[]; subscriptions: Subscription[]; installments: ActiveInstallment[];
  totalSubscriptions: number; totalInstallments: number;
}) {
  const allTxns = invoices.flatMap((inv) => inv.transactions).filter((t) => !t.isPayment);
  const avg = invoices.length > 0 ? invoices.reduce((s, i) => s + i.totalSpent, 0) / invoices.length : 0;
  const allCats = getCategoryStats(allTxns);
  const nonEssential = subscriptions.filter((s) => !ESSENTIAL_KEYWORDS.some((k) => s.merchant.toLowerCase().includes(k)));
  const savingsTotal = nonEssential.reduce((s, sub) => s + sub.avgMonthly, 0);
  const topCat = allCats[0];
  const healthCat = allCats.find((c) => c.name === "Farmácia & Saúde");

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-br from-green-50 to-teal-50 border border-green-200 rounded-xl p-5">
        <h2 className="text-base font-bold text-green-800 mb-3">💡 Análise de Redução</h2>
        <div className="space-y-2 text-sm text-green-700">
          <p>📊 Média mensal: <strong>{fmtBRL(avg)}</strong></p>
          <p>🔔 Assinaturas: <strong>{fmtBRL(totalSubscriptions)}/mês</strong> ({((totalSubscriptions / avg) * 100).toFixed(1)}% da fatura)</p>
          <p>💳 Parcelamentos: <strong>{fmtBRL(totalInstallments)}/mês</strong></p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">⚡ Oportunidades Rápidas</h2>
        <div className="space-y-3">
          {nonEssential.slice(0, 5).map((sub, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-700">{sub.merchant}</p>
                <p className="text-xs text-slate-400">Assinatura · {sub.monthsPresent} meses detectados</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-red-600">{fmtBRL(sub.avgMonthly)}/mês</p>
                <p className="text-xs text-red-400">= {fmtBRL(12 * sub.avgMonthly)}/ano</p>
              </div>
            </div>
          ))}
          {nonEssential.length > 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-semibold text-green-700">Cancelando estas assinaturas: <strong>economia de {fmtBRL(savingsTotal)}/mês</strong></p>
              <p className="text-xs text-green-600">{fmtBRL(12 * savingsTotal)} por ano</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">🏷️ Por Categoria (histórico)</h2>
        <div className="space-y-3">
          {allCats.slice(0, 8).map((c) => (
            <div key={c.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c.color }} />{c.name}
                </span>
                <span className="text-sm font-medium text-slate-700">{fmtBRL(c.amount)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full" style={{ width: `${c.percentage}%`, background: c.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">📌 Dicas Personalizadas</h2>
        <div className="space-y-2 text-sm text-slate-600">
          {topCat && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="font-medium">🔍 Maior categoria: {topCat.name}</p>
              <p className="text-slate-500 text-xs mt-1">{topCat.percentage.toFixed(1)}% do total histórico ({fmtBRL(topCat.amount)})</p>
            </div>
          )}
          {healthCat && healthCat.amount > 5000 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="font-medium text-blue-700">💊 Farmácia: {fmtBRL(healthCat.amount)} no histórico</p>
              <p className="text-blue-500 text-xs mt-1">Considere comprar em atacadistas ou verificar genéricos</p>
            </div>
          )}
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="font-medium">💡 Assinaturas digitais = {fmtBRL(totalSubscriptions)}/mês</p>
            <p className="text-slate-500 text-xs mt-1">Revise regularmente — serviços que você não usa mais valem a pena cancelar</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="font-medium">📱 Alimentação frequente no cartão</p>
            <p className="text-slate-500 text-xs mt-1">iFood, delivery e restaurantes são recorrentes — defina um orçamento mensal</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Visão Geral", icon: "📊" },
  { id: "monthly", label: "Por Mês", icon: "📅" },
  { id: "trends", label: "Tendências", icon: "📈" },
  { id: "subscriptions", label: "Assinaturas", icon: "🔔" },
  { id: "installments", label: "Parcelamentos", icon: "💳" },
  { id: "savings", label: "Economize", icon: "🎯" },
];

export default function InvoiceDashboard({ invoices }: { invoices: Invoice[] }) {
  const [tab, setTab] = useState("overview");
  const [selectedMonth, setSelectedMonth] = useState(invoices.at(-1)?.month ?? "");
  const [cardholder, setCardholder] = useState<string>("all");
  const [txSearch, setTxSearch] = useState("");

  const filteredInvoices = useMemo(() =>
    cardholder === "all" ? invoices : invoices.map((inv) => ({
      ...inv,
      transactions: inv.transactions.filter((t) => t.cardholder === cardholder),
      totalSpent: inv.transactions.filter((t) => !t.isPayment && t.cardholder === cardholder).reduce((s, t) => s + t.amount, 0),
    })), [invoices, cardholder]);

  const selectedInvoice = filteredInvoices.find((i) => i.month === selectedMonth) ?? filteredInvoices.at(-1);
  const latest = filteredInvoices.at(-1);
  const prev = filteredInvoices.at(-2);

  const monthlySummaries: MonthlySummary[] = filteredInvoices.map((inv) => {
    const byCategory: Record<string, number> = {};
    for (const t of inv.transactions.filter((t) => !t.isPayment)) byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
    return { month: inv.month, label: inv.label, total: inv.totalSpent, byCategory };
  });

  const allTxns = filteredInvoices.flatMap((inv) => inv.transactions);
  const categories = getCategoryStats(selectedInvoice?.transactions ?? []);
  const subscriptions = getSubscriptions(invoices);
  const installments = getInstallments(invoices);
  const totalSubscriptions = subscriptions.reduce((s, sub) => s + sub.avgMonthly, 0);
  const totalInstallments = installments.reduce((s, inst) => s + inst.monthlyAmount, 0);
  const variation = latest && prev && prev.totalSpent > 0 ? ((latest.totalSpent - prev.totalSpent) / prev.totalSpent) * 100 : 0;

  const filteredTxns = useMemo(() => {
    const txns = (selectedInvoice?.transactions ?? []).filter((t) => !t.isPayment);
    if (!txSearch.trim()) return txns;
    const q = txSearch.toLowerCase();
    return txns.filter((t) => t.merchant.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [selectedInvoice, txSearch]);

  const topMerchants = useMemo(() => getTopMerchants(selectedInvoice?.transactions ?? []), [selectedInvoice]);

  const cardholders = useMemo(() => {
    const s = new Set<string>();
    invoices.forEach((inv) => inv.transactions.forEach((t) => { if (t.cardholder) s.add(t.cardholder); }));
    return Array.from(s);
  }, [invoices]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">💳 Fatura XP</h1>
              <p className="text-blue-200 text-xs mt-0.5">Controle inteligente de gastos</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-200">Última fatura</p>
              <p className="text-lg font-bold">{latest ? fmtBRL(latest.totalSpent) : "—"}</p>
              <p className="text-xs text-blue-300">{latest?.label}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={() => setCardholder("all")}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${cardholder === "all" ? "bg-white text-blue-800" : "bg-blue-800 text-blue-100 hover:bg-blue-700"}`}>
              Todos
            </button>
            {cardholders.map((ch) => (
              <button key={ch} onClick={() => setCardholder(ch)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${cardholder === ch ? "bg-white text-blue-800" : "bg-blue-800 text-blue-100 hover:bg-blue-700"}`}>
                {CARDHOLDER_LABELS[ch] ?? ch}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-2">
          <div className="flex overflow-x-auto scrollbar-hide">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                <span>{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === "overview" && (
          <OverviewTab invoices={filteredInvoices} latest={latest} monthlySummaries={monthlySummaries}
            variation={variation} totalSubscriptions={totalSubscriptions} totalInstallments={totalInstallments} allTxns={allTxns} />
        )}
        {tab === "monthly" && (
          <MonthlyTab invoices={filteredInvoices} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
            selectedInvoice={selectedInvoice} categories={categories} filteredTxns={filteredTxns}
            txSearch={txSearch} setTxSearch={setTxSearch} topMerchants={topMerchants} />
        )}
        {tab === "trends" && <TrendsTab invoices={filteredInvoices} />}
        {tab === "subscriptions" && <SubscriptionsTab subscriptions={subscriptions} total={totalSubscriptions} />}
        {tab === "installments" && <InstallmentsTab installments={installments} total={totalInstallments} />}
        {tab === "savings" && (
          <SavingsTab invoices={filteredInvoices} subscriptions={subscriptions} installments={installments}
            totalSubscriptions={totalSubscriptions} totalInstallments={totalInstallments} />
        )}
      </main>
    </div>
  );
}
