import type { Transaction, CategoryStat } from "./types";

export const CATEGORY_COLORS: Record<string, string> = {
  Assinaturas: "#6366f1",
  "Farmácia & Saúde": "#10b981",
  Alimentação: "#f59e0b",
  Transporte: "#3b82f6",
  "Compras Online": "#ec4899",
  "Moda & Vestuário": "#f43f5e",
  "Eletrônicos & Games": "#0ea5e9",
  "Viagens & Hotéis": "#8b5cf6",
  "Bem-Estar & Pessoal": "#14b8a6",
  "Educação & Eventos": "#f97316",
  "Casa & Condomínio": "#84cc16",
  Telefone: "#06b6d4",
  Outros: "#9ca3af",
  Pagamento: "#22c55e",
};

export const CARDHOLDER_LABELS: Record<string, string> = {
  "RODRIGO COELHO": "Rodrigo",
  "FELIPE COELHO": "Felipe",
  "PEDRO COELHO": "Pedro",
};

export function normalizeSubscriptionName(merchant: string): string {
  const s = merchant.toLowerCase();
  if (s.includes("netflix")) return "Netflix";
  if (s.includes("amazon prime") || s.includes("amazonprimebr")) return "Amazon Prime";
  if (s.includes("amazon kindle")) return "Amazon Kindle Unlimited";
  if (s.includes("amazon digital")) return "Amazon Digital";
  if (s.includes("amazon servicos")) return "Amazon Services";
  if (s.includes("amazon ad free")) return "Amazon Ad-Free";
  if (s.includes("apple.com/bill")) return "Apple Services";
  if (s.includes("google one")) return "Google One";
  if (s.includes("google youtub") || s.includes("youtubeprem")) return "YouTube Premium";
  if (s.includes("openai") || s.includes("chatgpt")) return "ChatGPT / OpenAI";
  if (s.includes("claude.ai") || s.includes("anthropic")) return "Claude.ai / Anthropic";
  if (s.includes("notion")) return "Notion";
  if (s.includes("microsoft") || s.includes("ppro")) return "Microsoft 365";
  if (s.includes("turboscribe")) return "TurboScribe";
  if (s.includes("zapier")) return "Zapier";
  if (s.includes("heygen")) return "HeyGen";
  if (s.includes("ytscribe")) return "YTScribe";
  if (s.includes("sanebox")) return "SaneBox";
  if (s.includes("screenapp")) return "ScreenApp";
  if (s.includes("abacus")) return "Abacus.AI";
  if (s.includes("gamma")) return "Gamma.app";
  if (s.includes("canva")) return "Canva";
  if (s.includes("produtosuol")) return "UOL";
  if (s.includes("conta vivo")) return "Vivo";
  if (s.includes("pag*telecel")) return "Telecel";
  if (s.includes("buzzcrush")) return "BuzzCrush";
  if (s.includes("globoplay") || s.includes("globo*")) return "Globoplay";
  if (s.includes("ifood club") || s.includes("ifd*ifood club")) return "iFood Club";
  if (s.includes("artcfgcertifica")) return "Cert. CFG";
  if (s.includes("manus ai")) return "Manus AI";
  if (s.includes("pb*samsung") || s.includes("pbadministradora")) return "Samsung Pay";
  if (s.includes("produtos globo")) return "Produtos Globo";
  if (s.includes("cineflix") || s.includes("billy.*cineflix")) return "CineFlix";
  if (s.includes("coursiv")) return "Coursiv";
  if (s.includes("headway")) return "Headway";
  if (s.includes("gestaoagilvip")) return "Gestão Ágil VIP";
  if (s.includes("dl*google brawl") || s.includes("dl *google brawl") || s.includes("dl*google") || s.includes("dl *google") || s.includes("dlocal *google")) return "Google Play";
  return merchant;
}

/** Classify a merchant name into a category. */
export function classifyCategory(merchant: string): string {
  const s = merchant.toLowerCase();

  // Payments / credits
  if (s.includes("pagamento") || s.includes("payment") || s.includes("credito") || s.includes("pix ")) return "Pagamento";

  // Subscriptions
  if (
    s.includes("netflix") || s.includes("spotify") || s.includes("amazon prime") ||
    s.includes("apple.com/bill") || s.includes("google one") || s.includes("youtubeprem") ||
    s.includes("openai") || s.includes("chatgpt") || s.includes("anthropic") || s.includes("claude.ai") ||
    s.includes("notion") || s.includes("microsoft") || s.includes("canva") || s.includes("zapier") ||
    s.includes("heygen") || s.includes("gamma") || s.includes("turboscribe") || s.includes("abacus") ||
    s.includes("sanebox") || s.includes("screenapp") || s.includes("globoplay") || s.includes("cineflix") ||
    s.includes("coursiv") || s.includes("headway") || s.includes("ifood club") || s.includes("manus ai") ||
    s.includes("ppro") || s.includes("ytscribe") || s.includes("buzzcrush") || s.includes("products globo") ||
    s.includes("gestaoagilvip")
  ) return "Assinaturas";

  // Phone
  if (s.includes("vivo") || s.includes("claro") || s.includes("tim ") || s.includes("oi ") || s.includes("telecel") || s.includes("conta vivo")) return "Telefone";

  // Health & Pharmacy
  if (
    s.includes("drogaria") || s.includes("farmacia") || s.includes("farmácia") ||
    s.includes("droga") || s.includes("ultrafarma") || s.includes("panvel") ||
    s.includes("laboratorio") || s.includes("hospital") || s.includes("clinica") ||
    s.includes("medico") || s.includes("saude") || s.includes("dental") || s.includes("otica")
  ) return "Farmácia & Saúde";

  // Food
  if (
    s.includes("restaurante") || s.includes("lanchonete") || s.includes("pizzaria") ||
    s.includes("sushi") || s.includes("padaria") || s.includes("pao de queijo") ||
    s.includes("burger") || s.includes("mcdonalds") || s.includes("mc donald") ||
    s.includes("subway") || s.includes("ifood") || s.includes("rappi") ||
    s.includes("delivery") || s.includes("churrascaria") || s.includes("bar ") ||
    s.includes("cafe ") || s.includes("cafeteria") || s.includes("mercado") ||
    s.includes("supermercado") || s.includes("pao de acucar") || s.includes("carrefour") ||
    s.includes("extra ") || s.includes("atacadao") || s.includes("assai") ||
    s.includes("hiper") || s.includes("hortifruti") || s.includes("avenida jk") ||
    s.includes("rei do pao") || s.includes("flash distribuidora")
  ) return "Alimentação";

  // Transport
  if (
    s.includes("uber") || s.includes("99 ") || s.includes("99pop") ||
    s.includes("cabify") || s.includes("taxi") || s.includes("onibus") ||
    s.includes("metro") || s.includes("combustivel") || s.includes("posto ") ||
    s.includes("estacion") || s.includes("pedagio") || s.includes("shell ") ||
    s.includes("ipiranga") || s.includes("bp ") || s.includes("esso ") ||
    s.includes("autopista") || s.includes("autoviacao")
  ) return "Transporte";

  // Travel & Hotels
  if (
    s.includes("hotel") || s.includes("hostel") || s.includes("airbnb") ||
    s.includes("booking") || s.includes("expedia") || s.includes("decolar") ||
    s.includes("latam") || s.includes("gol ") || s.includes("azul ") ||
    s.includes("aviacao") || s.includes("passagem") || s.includes("viagem")
  ) return "Viagens & Hotéis";

  // Education & Events
  if (
    s.includes("escola") || s.includes("curso") || s.includes("faculdade") ||
    s.includes("universidade") || s.includes("educacao") || s.includes("piperacadem") ||
    s.includes("artcfg") || s.includes("udemy") || s.includes("alura") ||
    s.includes("rocketseat") || s.includes("evento") || s.includes("ingresso") ||
    s.includes("ticketmaster") || s.includes("sympla")
  ) return "Educação & Eventos";

  // Wellbeing & Personal
  if (
    s.includes("academia") || s.includes("gym") || s.includes("crossfit") ||
    s.includes("pilates") || s.includes("yoga") || s.includes("barbearia") ||
    s.includes("barba mia") || s.includes("salao") || s.includes("beleza") ||
    s.includes("spa ") || s.includes("massagem") || s.includes("wow*") ||
    s.includes("estetica")
  ) return "Bem-Estar & Pessoal";

  // Online Shopping
  if (
    s.includes("amazon") || s.includes("mercado livre") || s.includes("shopee") ||
    s.includes("shein") || s.includes("aliexpress") || s.includes("magazineluiza") ||
    s.includes("americanas") || s.includes("submarino") || s.includes("shoptime") ||
    s.includes("dafiti") || s.includes("magalu") || s.includes("marketplace")
  ) return "Compras Online";

  // Home & Condo
  if (
    s.includes("condominio") || s.includes("aluguel") || s.includes("energia") ||
    s.includes("agua ") || s.includes("gas ") || s.includes("iptu") ||
    s.includes("reforma") || s.includes("leroy") || s.includes("madeirense") ||
    s.includes("casas bahia") || s.includes("loja de materiais")
  ) return "Casa & Condomínio";

  return "Outros";
}

export function getCategoryStats(transactions: Transaction[]): CategoryStat[] {
  const spending = transactions.filter((t) => !t.isPayment);
  const total = spending.reduce((sum, t) => sum + t.amount, 0);
  const map = new Map<string, { amount: number; count: number }>();

  for (const t of spending) {
    const existing = map.get(t.category) ?? { amount: 0, count: 0 };
    map.set(t.category, { amount: existing.amount + t.amount, count: existing.count + 1 });
  }

  return Array.from(map.entries())
    .map(([name, { amount, count }]) => ({
      name,
      amount,
      count,
      percentage: total > 0 ? (amount / total) * 100 : 0,
      color: CATEGORY_COLORS[name] ?? "#9ca3af",
    }))
    .sort((a, b) => b.amount - a.amount);
}
