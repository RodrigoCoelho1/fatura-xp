"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, LineChart, Line, Legend,
} from "recharts";
import type {
  Invoice, Transaction, CategoryStat, Subscription, ActiveInstallment, MonthlySummary,
  SubscriptionStatusMap, SubStatus,
} from "@/lib/types";
import {
  CATEGORY_COLORS, CARDHOLDER_LABELS, getCategoryStats, normalizeSubscriptionName,
} from "@/lib/categories";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}
function fmtShort(v: number) {
  return v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CAT_ICON: Record<string, string> = {
  Assinaturas: "🔔", "Farmácia & Saúde": "💊", Alimentação: "🍽️",
  Transporte: "🚗", "Compras Online": "🛒", "Moda & Vestuário": "👗",
  "Eletrônicos & Games": "🎮", "Viagens & Hotéis": "✈️",
  "Bem-Estar & Pessoal": "💆", "Educação & Eventos": "📚",
  "Casa & Condomínio": "🏠", Telefone: "📱", Outros: "📌", Pagamento: "✅",
};

const ESSENTIAL_SUBS = [
  "vivo", "claude", "chatgpt", "openai", "anthropic", "microsoft",
  "notion", "google one", "youtube", "amazon prime", "apple", "conta vivo", "telecel",
];

// Info + cancellation links for known subscription services
type SubInfo = { service: string; description: string; cancelUrl: string };
const SUB_INFO: Record<string, SubInfo> = {
  "Netflix": {
    service: "Streaming de vídeo",
    description: "Filmes, séries e documentários. Concorre diretamente com Disney+ e Globoplay.",
    cancelUrl: "https://www.netflix.com/cancelplan",
  },
  "Globoplay": {
    service: "Streaming de vídeo",
    description: "Conteúdo da TV Globo: novelas, telejornais, reality shows e futebol brasileiro.",
    cancelUrl: "https://globoplay.globo.com/minha-conta/assinatura/",
  },
  "Disney+": {
    service: "Streaming de vídeo",
    description: "Filmes e séries da Disney, Marvel, Star Wars, Pixar e National Geographic.",
    cancelUrl: "https://www.disneyplus.com/pt-br/account/subscription",
  },
  "Hostinger": {
    service: "Hospedagem de sites",
    description: "Hospedagem web, domínios e e-mails profissionais. Verifique se os sites ainda estão ativos.",
    cancelUrl: "https://hpanel.hostinger.com/billing",
  },
  "Google Play": {
    service: "Marketplace Android / Google",
    description: "Assinaturas de apps, jogos ou serviços cobrados via Google Play. Veja quais estão ativos.",
    cancelUrl: "https://play.google.com/store/account/subscriptions",
  },
  "Samsung Pay": {
    service: "Carteira digital / taxa administrativa",
    description: "Taxa associada ao Samsung Pay ou serviço da administradora. Verifique o extrato para detalhe.",
    cancelUrl: "https://www.samsung.com/br/samsung-pay/",
  },
  "TicPay": {
    service: "Processamento de pagamentos",
    description: "Plataforma de pagamentos internacionais. Verifique qual serviço está vinculado a esta cobrança.",
    cancelUrl: "https://ticpay.com/account",
  },
  "iFood Club": {
    service: "Programa de fidelidade",
    description: "Clube de assinatura do iFood com desconto em pedidos de comida.",
    cancelUrl: "https://www.ifood.com.br/clube",
  },
  "CineFlix": {
    service: "Streaming de cinema",
    description: "Plataforma de streaming focada em filmes.",
    cancelUrl: "https://cineflix.com.br/conta",
  },
  "Coursiv": {
    service: "Plataforma de cursos online",
    description: "Cursos e treinamentos online. Verifique se ainda está usando o conteúdo.",
    cancelUrl: "https://coursiv.io/account",
  },
  "Headway": {
    service: "App de resumos de livros",
    description: "Resumos de livros de não-ficção em formato de microlearning.",
    cancelUrl: "https://app.headwayapp.co/settings/subscription",
  },
  "Canva": {
    service: "Design gráfico online",
    description: "Ferramenta de design para criar apresentações, posts e materiais visuais.",
    cancelUrl: "https://www.canva.com/account/billing/",
  },
  "Zapier": {
    service: "Automação de tarefas",
    description: "Conecta apps e automatiza fluxos de trabalho sem código.",
    cancelUrl: "https://zapier.com/app/billing",
  },
  "Cert. CFG": {
    service: "Certificação financeira",
    description: "Certificação CFG (CFA Institute) — certificado em gestão financeira global.",
    cancelUrl: "https://www.cfainstitute.org/en/programs/cfg",
  },
  "HeyGen": {
    service: "IA para vídeos",
    description: "Criação de vídeos com avatares gerados por inteligência artificial.",
    cancelUrl: "https://app.heygen.com/settings?tab=billing",
  },
  "ScreenApp": {
    service: "Gravação e transcrição de tela",
    description: "Gravação de tela com transcrição automática por IA.",
    cancelUrl: "https://screenapp.io/app/billing",
  },
  "TurboScribe": {
    service: "Transcrição por IA",
    description: "Transcrição automática de áudios e vídeos com IA.",
    cancelUrl: "https://turboscribe.ai/subscription",
  },
  "Gamma.app": {
    service: "Apresentações com IA",
    description: "Criação de slides, documentos e sites com inteligência artificial.",
    cancelUrl: "https://gamma.app/settings/billing",
  },
  "Manus AI": {
    service: "Agente de IA",
    description: "Plataforma de agentes autônomos com IA para execução de tarefas complexas.",
    cancelUrl: "https://manus.im/account",
  },
  "Gestão Ágil VIP": {
    service: "Ferramenta de gestão",
    description: "Software de gestão de projetos e equipes com metodologias ágeis.",
    cancelUrl: "https://gestaoagil.com.br/conta",
  },
};

// ── Data helpers ──────────────────────────────────────────────────────────────

function getSubscriptions(invoices: Invoice[]): Subscription[] {
  // Only consider subscriptions active in the LATEST invoice
  const latestMonth = invoices.at(-1)?.month ?? "";
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
      merchant,
      avgMonthly: amounts.reduce((a, b) => a + b, 0) / amounts.length,
      monthsPresent: months.size, lastSeen, category,
    }))
    // ← KEY FIX: only subscriptions present in the latest invoice
    .filter((s) => s.lastSeen === latestMonth)
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

function getTopMerchants(transactions: Transaction[], n = 8) {
  const map = new Map<string, number>();
  for (const t of transactions.filter((t) => !t.isPayment)) {
    const name = normalizeSubscriptionName(t.merchant);
    map.set(name, (map.get(name) ?? 0) + t.amount);
  }
  return Array.from(map.entries()).map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount).slice(0, n);
}

// ── Insights generator ────────────────────────────────────────────────────────

type Insight = { icon: string; text: string; kind: "good" | "bad" | "neutral" };

function buildInsights(
  invoices: Invoice[],
  subscriptions: Subscription[],
  installments: ActiveInstallment[],
  avg: number,
  avgPerCat: Record<string, number>,
): Insight[] {
  const out: Insight[] = [];
  const latest = invoices.at(-1);
  const prev = invoices.at(-2);

  if (latest && avg > 0) {
    const pct = ((latest.totalSpent - avg) / avg) * 100;
    if (pct > 10)
      out.push({ icon: "⚠️", text: `Fatura ${pct.toFixed(0)}% acima da sua média histórica (${fmtBRL(avg)})`, kind: "bad" });
    else if (pct < -10)
      out.push({ icon: "✅", text: `Fatura ${Math.abs(pct).toFixed(0)}% abaixo da média — ótimo mês!`, kind: "good" });
  }

  if (latest) {
    const latestCatMap = new Map<string, number>();
    for (const t of latest.transactions.filter((t) => !t.isPayment)) {
      latestCatMap.set(t.category, (latestCatMap.get(t.category) ?? 0) + t.amount);
    }
    const overSpend = Array.from(latestCatMap.entries())
      .map(([cat, amount]) => {
        const avg = avgPerCat[cat];
        return { cat, amount, avg, pct: avg && avg > 0 ? ((amount - avg) / avg) * 100 : null };
      })
      .filter((x) => x.pct !== null && x.pct > 20 && x.amount > 200)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

    overSpend.slice(0, 2).forEach(({ cat, amount, avg: catAvg, pct }) => {
      out.push({
        icon: CAT_ICON[cat] ?? "📈",
        text: `${cat}: ${fmtBRL(amount)} este mês — ${pct!.toFixed(0)}% acima do usual (média ${fmtBRL(catAvg!)})`,
        kind: "bad",
      });
    });

    const underSpend = Array.from(latestCatMap.entries())
      .map(([cat, amount]) => {
        const avg = avgPerCat[cat];
        return { cat, amount, avg, pct: avg && avg > 0 ? ((amount - avg) / avg) * 100 : null };
      })
      .filter((x) => x.pct !== null && x.pct < -25 && x.amount > 100)
      .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));

    if (underSpend[0]) {
      const { cat, amount, avg: catAvg, pct } = underSpend[0];
      out.push({
        icon: "📉",
        text: `${cat} ${Math.abs(pct!).toFixed(0)}% abaixo do normal — economia real (${fmtBRL(amount)} vs ${fmtBRL(catAvg!)} usual)`,
        kind: "good",
      });
    }
  }

  if (latest && prev) {
    const cats = new Set<string>();
    [...latest.transactions, ...prev.transactions].filter((t) => !t.isPayment).forEach((t) => cats.add(t.category));
    const deltas = Array.from(cats).map((cat) => {
      const curr = latest.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
      const ante = prev.transactions.filter((t) => !t.isPayment && t.category === cat).reduce((s, t) => s + t.amount, 0);
      return { cat, curr, ante, pct: ante > 0 ? ((curr - ante) / ante) * 100 : null };
    }).filter((x) => x.pct !== null && x.curr > 80);

    const biggest = [...deltas].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
    if (biggest && biggest.pct! > 40 && out.length < 4)
      out.push({ icon: "📈", text: `${biggest.cat} subiu ${biggest.pct!.toFixed(0)}% vs ${prev.label} (${fmtBRL(biggest.ante)} → ${fmtBRL(biggest.curr)})`, kind: "bad" });
  }

  const subTotal = subscriptions.reduce((s, sub) => s + sub.avgMonthly, 0);
  const nonEssential = subscriptions.filter((s) => !ESSENTIAL_SUBS.some((k) => s.merchant.toLowerCase().includes(k)));
  const savingsPossible = nonEssential.reduce((s, sub) => s + sub.avgMonthly, 0);

  if (savingsPossible > 50 && out.length < 4)
    out.push({ icon: "✂️", text: `${nonEssential.length} assinatura${nonEssential.length > 1 ? "s" : ""} para revisar: ${fmtBRL(savingsPossible)}/mês (${fmtBRL(12 * savingsPossible)}/ano)`, kind: "neutral" });
  else if (subTotal > 0 && out.length < 4)
    out.push({ icon: "🔔", text: `${fmtBRL(subTotal)}/mês em assinaturas — ${fmtBRL(12 * subTotal)} por ano`, kind: "neutral" });

  if (installments.length > 0 && out.length < 4) {
    const instTotal = installments.reduce((s, i) => s + i.monthlyAmount, 0);
    out.push({ icon: "💳", text: `${installments.length} parcelamento${installments.length > 1 ? "s" : ""} ativo${installments.length > 1 ? "s" : ""} · ${fmtBRL(instTotal)}/mês comprometidos`, kind: "neutral" });
  }

  return out.slice(0, 4);
}

// ── Micro components ──────────────────────────────────────────────────────────

function DeltaBadge({ value, label }: { value: number; label: string }) {
  if (Math.abs(value) < 0.5) return null;
  const pos = value > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${pos ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"}`}>
      {pos ? "▲" : "▼"} {Math.abs(value).toFixed(1)}% <span className="font-normal opacity-75">{label}</span>
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

function CatRow({ c, max, avgForCat }: { c: CategoryStat; max: number; avgForCat?: number }) {
  const diff = avgForCat && avgForCat > 0 ? ((c.amount - avgForCat) / avgForCat) * 100 : null;
  const showDiff = diff !== null && Math.abs(diff) > 8;
  const isOther = c.name === "Outros";

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base w-5 text-center flex-shrink-0">{CAT_ICON[c.name] ?? "📌"}</span>
        <span className={`text-xs font-medium flex-1 truncate ${isOther ? "text-slate-400" : "text-slate-700"}`}>{c.name}</span>
        {showDiff && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${diff! > 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}>
            {diff! > 0 ? "▲" : "▼"}{Math.abs(diff!).toFixed(0)}%
          </span>
        )}
        <span className={`text-xs font-bold flex-shrink-0 ${isOther ? "text-slate-400" : "text-slate-800"}`}>{fmtBRL(c.amount)}</span>
        <span className="text-xs text-slate-400 w-7 text-right flex-shrink-0">{c.percentage.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden ml-7">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${(c.amount / max) * 100}%`, background: isOther ? "#d1d5db" : c.color }}
        />
      </div>
      {avgForCat && avgForCat > 0 && (
        <p className="text-xs text-slate-400 mt-0.5 ml-7">Sua média: {fmtBRL(avgForCat)}</p>
      )}
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

// ── Tab 1: INÍCIO ─────────────────────────────────────────────────────────────

function InicioTab({
  invoices, avg, monthlySummaries, subscriptions, installments,
}: {
  invoices: Invoice[]; avg: number; monthlySummaries: MonthlySummary[];
  subscriptions: Subscription[]; installments: ActiveInstallment[];
}) {
  const [selectedBar, setSelectedBar] = useState<string | null>(null);

  const latest = invoices.at(-1);
  const prev = invoices.at(-2);

  const subTotal = subscriptions.reduce((s, sub) => s + sub.avgMonthly, 0);
  const instTotal = installments.reduce((s, i) => s + i.monthlyAmount, 0);
  const fixedTotal = subTotal + instTotal;
  const fixedPct = latest && latest.totalSpent > 0 ? (fixedTotal / latest.totalSpent) * 100 : 0;
  const variableTotal = latest ? Math.max(0, latest.totalSpent - fixedTotal) : 0;

  const variation = latest && prev && prev.totalSpent > 0
    ? ((latest.totalSpent - prev.totalSpent) / prev.totalSpent) * 100 : 0;
  const vsAvg = avg > 0 && latest ? ((latest.totalSpent - avg) / avg) * 100 : 0;

  const avgPerCat = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const inv of invoices.slice(0, -1)) {
      const monthCats = new Map<string, number>();
      for (const t of inv.transactions.filter((t) => !t.isPayment)) {
        monthCats.set(t.category, (monthCats.get(t.category) ?? 0) + t.amount);
      }
      monthCats.forEach((amount, cat) => {
        const e = map.get(cat) ?? { total: 0, count: 0 };
        map.set(cat, { total: e.total + amount, count: e.count + 1 });
      });
    }
    const result: Record<string, number> = {};
    map.forEach((v, k) => { result[k] = v.count > 0 ? v.total / v.count : 0; });
    return result;
  }, [invoices]);

  const displayInvoice = selectedBar ? (invoices.find((i) => i.month === selectedBar) ?? latest) : latest;
  const isLatest = !selectedBar || selectedBar === latest?.month;
  const displayTxns = displayInvoice?.transactions.filter((t) => !t.isPayment) ?? [];
  const rawCats = getCategoryStats(displayTxns);
  const cats = [...rawCats.filter((c) => c.name !== "Outros"), ...rawCats.filter((c) => c.name === "Outros")];
  const maxCat = cats[0]?.amount ?? 1;

  const insights = useMemo(
    () => buildInsights(invoices, subscriptions, installments, avg, avgPerCat),
    [invoices, subscriptions, installments, avg, avgPerCat],
  );

  return (
    // Desktop: 2-column grid. Mobile: stacked.
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">

      {/* ── Left column ── */}
      <div className="space-y-4 mb-4 lg:mb-0">

        {/* Hero */}
        <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-5 text-white">
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-2">
            Última fatura · {latest?.label ?? "—"}
          </p>
          <p className="text-5xl font-black tracking-tight leading-none">
            {latest ? fmtBRL(latest.totalSpent) : "—"}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <DeltaBadge value={variation} label="vs mês anterior" />
            <DeltaBadge value={vsAvg} label="vs média" />
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <p className="text-blue-300 text-xs font-medium">Compromissos fixos vs variável</p>
              <p className="text-xs text-blue-200 font-semibold">{fixedPct.toFixed(0)}% fixo</p>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-l-full transition-all"
                style={{ width: `${Math.min(fixedPct, 100)}%`, background: fixedPct > 80 ? "#f87171" : "#fbbf24" }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-amber-300">💳 Fixo: {fmtBRL(fixedTotal)}</span>
              <span className="text-blue-200">🔀 Variável: {fmtBRL(variableTotal)}</span>
            </div>
            <p className="text-xs text-blue-400 mt-1.5">Subs {fmtBRL(subTotal)} + Parcelas {fmtBRL(instTotal)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10 text-center">
            <div>
              <p className="text-xs text-blue-400">Média histórica</p>
              <p className="text-sm font-bold">{fmtBRL(avg)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-400">Assinaturas</p>
              <p className="text-sm font-bold">{fmtBRL(subTotal)}<span className="text-xs font-normal text-blue-400">/mês</span></p>
            </div>
            <div>
              <p className="text-xs text-blue-400">Parcelas</p>
              <p className="text-sm font-bold">{fmtBRL(instTotal)}<span className="text-xs font-normal text-blue-400">/mês</span></p>
            </div>
          </div>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="space-y-2">
            {insights.map((ins, i) => <InsightCard key={i} ins={ins} />)}
          </div>
        )}
      </div>

      {/* ── Right column ── */}
      <div className="space-y-4">

        {/* Monthly chart */}
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
              Mostrando: <strong>{monthlySummaries.find((m) => m.month === selectedBar)?.label}</strong>
            </p>
          )}
          <ResponsiveContainer width="100%" height={160}>
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
            <p className="text-xs text-slate-400 text-center mt-1">Clique em uma barra para filtrar as categorias abaixo</p>
          )}
        </div>

        {/* Category breakdown */}
        {cats.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-sm font-semibold text-slate-700">
                Gastos por categoria
                {selectedBar && <span className="text-blue-500 font-normal"> · {displayInvoice?.label}</span>}
              </h2>
            </div>
            {isLatest && (
              <p className="text-xs text-slate-400 mb-4">▲ vermelho = acima da sua média · ▼ verde = abaixo</p>
            )}
            <div className="space-y-4">
              {cats.map((c) => (
                <CatRow
                  key={c.name}
                  c={c}
                  max={maxCat}
                  avgForCat={isLatest ? avgPerCat[c.name] : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 2: FATURAS ────────────────────────────────────────────────────────────

function FaturasTab({ invoices }: { invoices: Invoice[] }) {
  const [selectedMonth, setSelectedMonth] = useState(invoices.at(-1)?.month ?? "");
  const [txSearch, setTxSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const selectedInvoice = invoices.find((i) => i.month === selectedMonth) ?? invoices.at(-1);
  const prev = selectedInvoice ? invoices[invoices.indexOf(selectedInvoice) - 1] : undefined;

  const txns = selectedInvoice?.transactions.filter((t) => !t.isPayment) ?? [];
  const filtered = useMemo(() => {
    let result = txns;
    if (selectedCat) result = result.filter((t) => t.category === selectedCat);
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      result = result.filter((t) => t.merchant.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    }
    return result;
  }, [txns, txSearch, selectedCat]);

  const topMerchants = useMemo(() => getTopMerchants(selectedInvoice?.transactions ?? []), [selectedInvoice]);
  const cats = useMemo(() => getCategoryStats(txns), [txns]);

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
            onClick={() => { setSelectedMonth(inv.month); setSelectedCat(null); setTxSearch(""); }}
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
          <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-2xl p-5 text-white">
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

          {/* Category filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedCat(null)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${!selectedCat ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              Todas
            </button>
            {cats.map((c) => (
              <button
                key={c.name}
                onClick={() => setSelectedCat((prev) => prev === c.name ? null : c.name)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${selectedCat === c.name ? "text-white" : "bg-white text-slate-500 border border-slate-200"}`}
                style={selectedCat === c.name ? { background: CATEGORY_COLORS[c.name] ?? "#3b82f6" } : undefined}
              >
                {CAT_ICON[c.name] ?? "📌"} {c.name}
              </button>
            ))}
          </div>

          {/* Desktop: 2-col (merchants left, transactions right) */}
          <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">

            {/* Top merchants */}
            {!selectedCat && (
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
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(m.amount / (topMerchants[0]?.amount ?? 1)) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transaction list */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-slate-700">
                    Lançamentos{selectedCat ? ` · ${selectedCat}` : ""}
                  </h2>
                  <span className="text-xs text-slate-400">{filtered.length} itens · {fmtBRL(filtered.reduce((s, t) => s + t.amount, 0))}</span>
                </div>
                <input
                  type="search"
                  placeholder="Buscar estabelecimento ou categoria…"
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
                />
              </div>
              <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                {filtered.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="text-lg flex-shrink-0">{CAT_ICON[t.category] ?? "📌"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{t.merchant}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t.date.slice(8, 10)}/{t.date.slice(5, 7)}
                        {" · "}{t.category}
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
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab 3: FIXOS ──────────────────────────────────────────────────────────────

function FixosTab({
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
        <p className="text-violet-300 text-xs font-semibold uppercase tracking-widest mb-2">Comprometido mensalmente</p>
        <p className="text-5xl font-black leading-none">
          {fmtBRL(total)}
          <span className="text-lg font-normal text-violet-400">/mês</span>
        </p>
        <p className="text-violet-300 text-sm mt-1">{fmtBRL(12 * total)} por ano em compromissos fixos</p>
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
          <div>
            <p className="text-xs text-violet-400">Assinaturas · {subscriptions.length}</p>
            <p className="text-lg font-bold mt-0.5">{fmtBRL(subTotal)}<span className="text-xs font-normal text-violet-400">/mês</span></p>
            <p className="text-xs text-violet-400">{fmtBRL(12 * subTotal)}/ano</p>
          </div>
          <div>
            <p className="text-xs text-violet-400">Parcelamentos · {installments.length}</p>
            <p className="text-lg font-bold mt-0.5">{fmtBRL(instTotal)}<span className="text-xs font-normal text-violet-400">/mês</span></p>
            <p className="text-xs text-violet-400">{fmtBRL(12 * instTotal)}/ano</p>
          </div>
        </div>
      </div>

      {/* Desktop: 2-col */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-4 lg:space-y-0">

        {/* Subscriptions */}
        {subscriptions.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
              Assinaturas ativas · fatura atual
            </p>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50 overflow-hidden">
              {subscriptions.map((s, i) => {
                const isEssential = ESSENTIAL_SUBS.some((k) => s.merchant.toLowerCase().includes(k));
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-lg">🔔</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-slate-800">{s.merchant}</p>
                        {!isEssential && (
                          <span className="text-xs bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-medium">revisar</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{s.category} · {s.monthsPresent} {s.monthsPresent === 1 ? "mês" : "meses"} no histórico</p>
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
        <div>
          {installments.length > 0 ? (
            <>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Parcelamentos ativos</p>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50 overflow-hidden">
                {installments.map((inst, i) => {
                  const pct = (inst.current / inst.total) * 100;
                  const remaining = inst.total - inst.current;
                  return (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{normalizeSubscriptionName(inst.merchant)}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Parcela {inst.current}/{inst.total} · ainda {remaining} {remaining === 1 ? "mês" : "meses"}
                          </p>
                        </div>
                        <div className="text-right ml-3 flex-shrink-0">
                          <p className="text-sm font-bold text-slate-800">{fmtBRL(inst.monthlyAmount)}<span className="text-xs font-normal text-slate-400">/mês</span></p>
                          <p className="text-xs text-slate-400">Restante: {fmtBRL(inst.remainingAmount)}</p>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-amber-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{pct.toFixed(0)}% pago</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm text-slate-500">Nenhum parcelamento ativo</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab 4: ANÁLISE ────────────────────────────────────────────────────────────

const DEFAULT_CATS = ["Alimentação", "Farmácia & Saúde", "Assinaturas", "Transporte", "Compras Online"];

function StatusBadge({ s }: { s: SubStatus }) {
  if (s.status === "cancelled") {
    const until = s.accessUntil
      ? ` · acesso até ${s.accessUntil.slice(8, 10)}/${s.accessUntil.slice(5, 7)}`
      : "";
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
        ✅ Cancelado{until}
      </span>
    );
  }
  if (s.status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
        🔴 Ativo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
      ❓ Não verificado
    </span>
  );
}

function AnaliseTab({
  invoices, subscriptions, avg, subStatuses,
}: {
  invoices: Invoice[]; subscriptions: Subscription[]; avg: number;
  subStatuses: SubscriptionStatusMap;
}) {
  const latest = invoices.at(-1);
  const prev = invoices.at(-2);

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

  const nonEssential = subscriptions.filter((s) => !ESSENTIAL_SUBS.some((k) => s.merchant.toLowerCase().includes(k)));
  const savingsMonthly = nonEssential.reduce((s, sub) => s + sub.avgMonthly, 0);

  const allCats = useMemo(() => {
    const s = new Set<string>();
    invoices.forEach((inv) => inv.transactions.forEach((t) => { if (!t.isPayment && t.category !== "Pagamento") s.add(t.category); }));
    return Array.from(s).sort();
  }, [invoices]);

  const [selectedCats, setSelectedCats] = useState<string[]>(DEFAULT_CATS.filter((c) => allCats.includes(c)));

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
      {/* Desktop: 2-col layout */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

        {/* Left col: savings + comparison */}
        <div className="space-y-5">
          {/* Savings card — split by status */}
          {nonEssential.length > 0 && (() => {
            const alreadyCancelled = nonEssential.filter(s => subStatuses[s.merchant]?.status === "cancelled");
            const stillActive     = nonEssential.filter(s => subStatuses[s.merchant]?.status !== "cancelled");
            const savedMonthly    = alreadyCancelled.reduce((t, s) => t + s.avgMonthly, 0);
            const remainingMonthly= stillActive.reduce((t, s) => t + s.avgMonthly, 0);
            const checkedAt       = Object.values(subStatuses)[0]?.checkedAt ?? null;

            return (
              <div className="bg-gradient-to-br from-emerald-900 to-teal-900 rounded-2xl p-5 text-white space-y-5">
                {/* Header */}
                <div>
                  <p className="text-emerald-300 text-xs font-semibold uppercase tracking-widest mb-1">
                    Assinaturas não-essenciais · fatura atual
                  </p>
                  {checkedAt && (
                    <p className="text-emerald-500 text-xs">
                      🔍 Verificado via Gmail em {checkedAt.slice(8, 10)}/{checkedAt.slice(5, 7)}/{checkedAt.slice(0, 4)}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="bg-emerald-800/50 rounded-xl px-3 py-2.5">
                      <p className="text-emerald-400 text-xs mb-0.5">✅ Já economizando</p>
                      <p className="text-xl font-black text-white">{fmtBRL(savedMonthly)}<span className="text-xs font-normal text-emerald-400">/mês</span></p>
                      <p className="text-xs text-emerald-400">{fmtBRL(savedMonthly * 12)}/ano</p>
                    </div>
                    <div className={`rounded-xl px-3 py-2.5 ${remainingMonthly > 0 ? "bg-rose-900/40" : "bg-emerald-800/50"}`}>
                      <p className="text-emerald-400 text-xs mb-0.5">⚠️ Ainda a cancelar</p>
                      <p className="text-xl font-black text-white">{fmtBRL(remainingMonthly)}<span className="text-xs font-normal text-emerald-400">/mês</span></p>
                      <p className="text-xs text-emerald-400">{fmtBRL(remainingMonthly * 12)}/ano</p>
                    </div>
                  </div>
                </div>

                {/* Already cancelled */}
                {alreadyCancelled.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">✅ Cancelados — economia confirmada</p>
                    <div className="space-y-2">
                      {alreadyCancelled.map((s, i) => {
                        const info = SUB_INFO[s.merchant];
                        const st   = subStatuses[s.merchant];
                        return (
                          <div key={i} className="bg-emerald-800/40 rounded-xl px-3 py-2.5 opacity-80">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-white">{s.merchant}</span>
                                  {info && <span className="text-xs bg-white/10 text-emerald-200 px-1.5 py-0.5 rounded-full">{info.service}</span>}
                                </div>
                                <p className="text-xs text-emerald-400 mt-0.5">
                                  Cancelado em {st?.cancelledAt ? `${st.cancelledAt.slice(8, 10)}/${st.cancelledAt.slice(5, 7)}` : "—"}
                                  {st?.accessUntil ? ` · acesso até ${st.accessUntil.slice(8, 10)}/${st.accessUntil.slice(5, 7)}` : ""}
                                  {st?.emailSubject ? ` · "${st.emailSubject}"` : ""}
                                </p>
                              </div>
                              <span className="text-sm font-bold text-emerald-300 line-through opacity-60 flex-shrink-0">{fmtBRL(s.avgMonthly)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Still active — action needed */}
                {stillActive.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-rose-300 uppercase tracking-wider mb-2">⚠️ Ainda ativos — considere cancelar</p>
                    <div className="space-y-3">
                      {stillActive.map((s, i) => {
                        const info = SUB_INFO[s.merchant];
                        const st   = subStatuses[s.merchant];
                        return (
                          <div key={i} className="bg-white/10 rounded-xl px-3 py-3 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-white">{s.merchant}</span>
                                  {info && <span className="text-xs bg-white/20 text-emerald-100 px-2 py-0.5 rounded-full">{info.service}</span>}
                                  {st && <StatusBadge s={st} />}
                                </div>
                              </div>
                              <span className="text-sm font-bold text-emerald-200 flex-shrink-0 mt-0.5">{fmtBRL(s.avgMonthly)}/mês</span>
                            </div>
                            {info && <p className="text-xs text-emerald-200/80 leading-relaxed">{info.description}</p>}
                            <div className="flex items-center justify-between pt-0.5">
                              <span className="text-xs text-emerald-400">
                                {s.monthsPresent} {s.monthsPresent === 1 ? "mês" : "meses"} · {fmtBRL(s.avgMonthly * 12)}/ano
                              </span>
                              {info?.cancelUrl ? (
                                <a href={info.cancelUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-xs font-semibold text-white bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg transition-all">
                                  Cancelar →
                                </a>
                              ) : (
                                <span className="text-xs text-emerald-400/60 italic">link não mapeado</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Month comparison */}
          {latest && prev && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700 mb-1">Comparativo por categoria</h2>
              <p className="text-xs text-slate-400 mb-4">{prev.label} → {latest.label}</p>
              <div className="space-y-3">
                {comparison.map(({ cat, curr, ante, diff, pct }) => {
                  const color = CATEGORY_COLORS[cat] ?? "#9ca3af";
                  const max = Math.max(curr, ante, 1);
                  const isUp = diff > 0;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-base w-5 text-center flex-shrink-0">{CAT_ICON[cat] ?? "📌"}</span>
                          <span className="text-xs text-slate-700 truncate">{cat}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                          <span className="text-slate-400">{fmtBRL(ante)}</span>
                          <span className="text-slate-300">→</span>
                          <span className="font-bold text-slate-800">{fmtBRL(curr)}</span>
                          {pct !== null && Math.abs(pct) > 3 && (
                            <span className={`font-bold px-1.5 py-0.5 rounded-full ${isUp ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}>
                              {isUp ? "▲" : "▼"}{Math.abs(pct).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden ml-7">
                        <div className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${(ante / max) * 100}%`, background: color }} />
                        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(curr / max) * 100}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right col: line chart */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Tendência por categoria (14 meses)</h2>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {allCats.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCats((prev) =>
                  prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                )}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border ${
                  selectedCats.includes(cat)
                    ? "text-white border-transparent"
                    : "bg-white text-slate-500 border-slate-200"
                }`}
                style={selectedCats.includes(cat) ? { background: CATEGORY_COLORS[cat] ?? "#3b82f6", borderColor: CATEGORY_COLORS[cat] ?? "#3b82f6" } : undefined}
              >
                {CAT_ICON[cat] ?? "📌"} {cat}
              </button>
            ))}
          </div>
          {selectedCats.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => fmtBRL(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.08)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selectedCats.map((cat) => (
                  <Line key={cat} type="monotone" dataKey={cat} stroke={CATEGORY_COLORS[cat] ?? "#9ca3af"} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">Selecione uma ou mais categorias acima</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

const TABS = [
  { id: "inicio",   label: "Início",    icon: "🏠" },
  { id: "faturas",  label: "Faturas",   icon: "📅" },
  { id: "fixos",    label: "Fixos",     icon: "💳" },
  { id: "analise",  label: "Análise",   icon: "📊" },
];

export default function InvoiceDashboard({ invoices, subStatuses }: { invoices: Invoice[]; subStatuses: SubscriptionStatusMap }) {
  const [tab, setTab] = useState("inicio");
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
        <div className="max-w-screen-xl mx-auto px-4 lg:px-8 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-black tracking-tight">💳 Fatura XP</h1>
              <p className="text-blue-400 text-xs mt-0.5">Controle inteligente de gastos</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-400">Última fatura</p>
              <p className="text-xl font-black">{latest ? fmtBRL(latest.totalSpent) : "—"}</p>
              <p className="text-xs text-blue-400">{latest?.label}</p>
            </div>
          </div>
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

      {/* ── Body: sidebar on desktop, top-nav on mobile ── */}
      <div className="max-w-screen-xl mx-auto lg:flex">

        {/* Sidebar nav (desktop only) */}
        <aside className="hidden lg:flex lg:flex-col lg:w-52 lg:shrink-0 lg:sticky lg:top-0 lg:self-start lg:pt-6 lg:px-3 lg:pb-10">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold mb-1 transition-all text-left ${
                tab === t.id
                  ? "bg-white text-blue-700 shadow-sm border border-blue-100"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
              }`}
            >
              <span className="text-xl w-6 text-center">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </aside>

        {/* Mobile tab nav (top, sticky) */}
        <nav className="lg:hidden bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
          <div className="flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <span className="text-base">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0 px-4 lg:px-6 py-5 pb-10">
          {tab === "inicio" && (
            <InicioTab
              invoices={filteredInvoices} avg={avg}
              monthlySummaries={monthlySummaries}
              subscriptions={subscriptions} installments={installments}
            />
          )}
          {tab === "faturas" && <FaturasTab invoices={filteredInvoices} />}
          {tab === "fixos" && <FixosTab subscriptions={subscriptions} installments={installments} />}
          {tab === "analise" && <AnaliseTab invoices={filteredInvoices} subscriptions={subscriptions} avg={avg} subStatuses={subStatuses} />}
        </main>
      </div>
    </div>
  );
}
