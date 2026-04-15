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
  if (s.includes("dl*google") || s.includes("dl *google") || s.includes("dl * google") ||
      s.includes("dlocal *google") || s.includes("google tacit") ||
      (s.startsWith("dl") && s.includes("*google"))) return "Google Play";
  return merchant;
}

/** Classify a merchant name into a category. */
export function classifyCategory(merchant: string): string {
  const s = merchant.toLowerCase();

  // Payments / credits / taxes
  if (
    s.includes("pagamento") || s.includes("payment") || s.startsWith("credito ") ||
    s.includes("pix recebido") || s.startsWith("pix ") || s.includes("estorno") ||
    s.startsWith("iof ")  || s.includes("iof transacoes") || s.includes("iof transações") ||
    s.includes("prefeitura")
  ) return "Pagamento";

  // Subscriptions (must come before generic Amazon/Microsoft checks)
  if (
    s.includes("netflix") || s.includes("spotify") || s.includes("amazon prime") ||
    s.includes("amazon kindle") || s.includes("amazon digital") || s.includes("amazonprimebr") ||
    s.includes("apple.com/bill") || s.includes("applecombill") || s.includes("google one") || s.includes("youtubeprem") ||
    s.includes("google youtub") || s.includes("openai") || s.includes("chatgpt") ||
    s.includes("anthropic") || s.includes("claude.ai") || s.includes("notion") ||
    s.includes("microsoft") || s.includes("canva") || s.includes("zapier") ||
    s.includes("heygen") || s.includes("gamma") || s.includes("turboscribe") ||
    s.includes("abacus") || s.includes("sanebox") || s.includes("screenapp") ||
    s.includes("globoplay") || s.includes("cineflix") || s.includes("billy.*cineflix") ||
    s.includes("coursiv") || s.includes("headway") || s.includes("ifood club") ||
    s.includes("ifd*ifood club") || s.includes("manus ai") || s.includes("ppro") ||
    s.includes("ytscribe") || s.includes("buzzcrush") || s.includes("produtosuol") ||
    s.includes("produtos globo") || s.includes("gestaoagilvip") || s.includes("artcfgcertifica") ||
    s.includes("manus.ai") || s.includes("dlocal *google") || s.includes("dl*google") ||
    s.includes("dl *google") || s.includes("dl * google") || s.includes("google tacit") ||
    (s.startsWith("dl") && s.includes("*google")) ||
    s.includes("pb*samsung") || s.includes("pbadministradora") ||
    s.includes("disney plus") || s.includes("disney+") || s.includes("disneyplus") ||
    s.includes("hbo max") || s.includes("max.com") || s.includes("paramount") ||
    s.includes("crunchyroll") || s.includes("deezer") || s.includes("tidal") ||
    s.includes("adobe") || s.includes("figma") || s.includes("dropbox") ||
    s.includes("evernote") || s.includes("todoist") || s.includes("linear.app") ||
    s.includes("monday.com") || s.includes("hubspot") || s.includes("ticpay") ||
    s.includes("hostinger") || s.includes("google play pass") || s.includes("google play") ||
    s.includes("fireflies.ai") || s.includes("fireflies ai") ||
    s.includes("claude . ai") || s.includes("claude.ai")
  ) return "Assinaturas";

  // Phone
  if (
    s.includes("claro") || s.includes("telecel") || s.includes("conta vivo") ||
    s.includes("pag*telecel") || s.match(/\btim\b/) || s.match(/\boi\b/) ||
    (s.includes("vivo") && !s.includes("vivo saudavel") && !s.includes("decolar"))
  ) return "Telefone";

  // Health & Pharmacy
  if (
    s.includes("drogaria") || s.includes("farmacia") || s.includes("farmácia") ||
    s.includes("drogasil") || s.includes("drogaraia") || s.includes("droga") ||
    s.includes("ultrafarma") || s.includes("panvel") || s.includes("pague menos") ||
    s.includes("pacheco") || s.includes("onofre") ||
    s.startsWith("raia") || s.includes("drogaraia") || s.includes("drogaria raia") ||
    s.includes("farmacity") || s.includes("dra4") || s.includes("ce med") ||
    s.includes("drogal") || s.includes("laboratorio") ||
    s.includes("laborat") || s.includes("hospital") || s.includes("clinica") ||
    s.includes("medico") || s.includes("saude") || s.includes("dental") ||
    s.includes("odonto") || s.includes("otica") || s.includes("oculista") ||
    s.includes("psico") || s.includes("nutri") || s.includes("fisio")
  ) return "Farmácia & Saúde";

  // Food & Groceries
  if (
    s.includes("restaurante") || s.includes("lanchonete") || s.includes("pizzaria") ||
    s.includes("sushi") || s.includes("padaria") || s.includes("pao de queijo") ||
    s.includes("burger") || s.includes("mcdonalds") || s.includes("mc donald") ||
    s.includes("subway") || s.startsWith("ifood") || s.startsWith("ifd ") ||
    s.includes("ifd*") || s.includes("rappi") || s.includes("delivery") ||
    s.includes("churrascaria") || s.includes("cafeteria") || s.includes("supermercado") ||
    s.includes("pao de acucar") || s.includes("carrefour") || s.includes("atacadao") ||
    s.includes("assai") || s.includes("hortifruti") || s.includes("avenida jk") ||
    s.includes("rei do pao") || s.includes("flash distribuidora") || s.includes("madero") ||
    s.includes("outback") || s.includes("bobs") || s.includes("giraffas") ||
    s.includes("spoleto") || s.includes("divino fogao") || s.includes("coxinha") ||
    s.includes("taco bell") || s.includes("kfc ") || s.includes("popeyes") ||
    s.includes("habibs") || s.includes("china in box") || s.includes("jeronimo") ||
    s.includes("bahamas") || s.includes("emporio") || s.includes("hortifrutti") ||
    s.includes("minimercado") || (s.includes("mercado") && !s.includes("mercado livre")) ||
    (s.includes("bar ") && !s.includes("barb")) ||
    (s.includes("cafe ") && !s.includes("cafeteria")) ||
    (s.includes("extra ") && !s.includes("extraordin")) ||
    (s.includes("hiper") && !s.includes("hipertensao")) ||
    s.includes("panificadora") || s.includes("padoca") || s.includes("pao dourado") ||
    s.includes("amor gelado") || s.includes("sorvete") || s.includes("chiquinho") ||
    s.includes("conveniencia") || s.includes("marina conveniencia") ||
    s.includes("grill") || s.includes("steakhouse") || s.includes("meat") ||
    s.includes("montana grill") || s.includes("essencia goiana") ||
    s.includes("eixo monumental") || s.includes("pontual alimentos") ||
    s.includes("n s a foods") || s.includes("express viamonte") ||
    s.includes("the hot machine") || s.includes("hot machine") ||
    s.includes("alimentos") || s.includes("alimentacao") || s.includes("comida") ||
    s.includes("lanche") || s.includes("snack") || s.includes("doce ") ||
    s.includes("confeitaria") || s.includes("gelateria") || s.includes("acaiteria") ||
    s.includes("acai") || s.includes("crepe") || s.includes("tapioca") ||
    s.includes("sanduiche") || s.includes("wrap ") || s.includes("poké") ||
    s.includes("poke ") || s.includes("quiosque") || s.includes("feirinha") ||
    s.includes("feira ") || s.includes("mercearia") || s.includes("quitanda") ||
    s.includes("gastronomia") || s.includes("gastro") || s.includes("bistr") ||
    s.includes("boteco") || s.includes("brasserie") || s.includes("trattoria") ||
    s.includes("osteria") || s.includes("enoteca") || s.includes("frans cafe") ||
    s.includes("pao elite") || s.includes("real de 14") || s.includes("ponto 302") ||
    s.includes("prates foods") || s.includes("lindt") || s.includes("chocol") ||
    s.includes("delta expresso") || s.includes("deltaexpresso") ||
    s.includes("star 186") || s.includes("lago sul") ||
    s.includes("dunkin") || s.includes("rei do mate") || s.includes("milkymoo") ||
    s.includes("asa sul 114") || s.includes("bonasecco") ||
    s.includes("empada de minas") || s.includes("castanhas") || s.includes("cabana las lilas") ||
    s.includes("market 9 de julio") || s.includes("handy*") || s.includes("queseria") ||
    s.includes("merpago*crucer") || s.includes("merpago*cultura") ||
    s.includes("starbucks") || s.includes("parentela gourmet") || s.includes("l entrecote") ||
    s.includes("chez michou") || s.includes("fruto de goias") ||
    s.includes("rk pipoka") || s.includes("giraffa") || s.includes("republica da fruta") ||
    s.includes("coco bambu") || s.includes("fondue") ||
    s.includes("belmonte") || s.includes("fratello") || s.includes("acougue") ||
    s.includes("pizza") || s.includes("churrasquei") || s.includes("peixe") ||
    s.includes("comercio de alim") || s.includes("servicos aliment") ||
    s.includes("choperia") || s.includes("chopperia") || s.includes("kafe") ||
    s.includes("aerovino") || s.includes("restaura") ||
    s.includes("bsbblack") || s.includes("empadascafe") || s.includes("bella paulista") ||
    s.includes("frango") || s.includes("juice") || s.includes("pao da hora") ||
    s.includes("pause cafe") || s.includes("kibon") || s.includes("lanchone") ||
    s.includes("noar ") || s.includes("pipoca") || s.includes("armazene") ||
    s.includes("chale da") || s.includes("damici") || s.includes("mico loco") ||
    s.includes("quadratti") || s.includes("adega") || s.includes("reiko candies") ||
    s.includes("star 177") || s.includes("star 180") || s.includes("star 191") ||
    s.includes("miguelbrasas") || s.includes("fogo brasilia") || s.includes("ubud") ||
    s.includes("v18 servico") || s.includes("chopei") || s.includes("chale ") ||
    s.includes("peixaria") || s.includes("marisqueira") || s.includes("frutos do mar") ||
    s.includes("forno") || s.includes("du pain") || s.includes("bauducco") ||
    s.includes("ice cream") ||
    s.includes("embaixada carioca") || s.includes("arabian shop") ||
    s.includes("caxanga") || s.includes("let bali") || s.includes("santa luzia") ||
    s.includes("silmas") || s.includes("terra brasili") || s.includes("chalezinho") ||
    s.includes("casa bauducco") || s.includes("happy harry") || s.includes("brasilia sul") ||
    s.includes("frutos de goias 7") || s.includes("asmar") || s.includes("hn20") || s.includes("hn35")
  ) return "Alimentação";

  // Transport (parking, fuel, ride-hailing, auto services)
  if (
    s.includes("uber") || s.includes("99pop") || s.includes("cabify") ||
    s.includes("taxi") || s.includes("onibus") || s.includes("metro") ||
    s.includes("combustivel") || s.includes("combustiveis") || s.includes("cascol") ||
    s.includes("estacion") || s.includes("pedagio") ||
    s.includes("ipiranga") || s.includes("autopista") || s.includes("autoviacao") ||
    s.includes("allpark") || s.includes("mb parking") || s.includes("estapar") ||
    s.includes("parkshop") || s.includes("multipark") || s.includes("sem parar") ||
    s.includes("vaga certa") || s.includes("estpar") || s.includes("parking") ||
    s.includes("cpark") || s.includes("indigo park") || s.includes("bypark") ||
    s.includes("hora park") ||
    s.includes("veloe") || s.includes("conectcar") || s.includes("gollog") ||
    s.includes("correios") || s.includes("fedex") || s.includes("loggi") ||
    s.includes("jadlog") || s.includes("transportadora") ||
    s.includes("saga detroit") || s.includes("autoposto") || s.includes("autopostoviapraia") ||
    s.includes("oficina") || s.includes("mecanica") || s.includes("borracharia") ||
    s.includes("passaro marron") || s.includes("valet") || s.includes("concessionaria") ||
    s.match(/\b99\b/) || s.match(/\bshell\b/) || s.match(/\besso\b/) ||
    s.match(/\bbp\b/) || s.match(/\bposto\b/)
  ) return "Transporte";

  // Travel & Hotels
  if (
    s.includes("hotel") || s.includes("hostel") || s.includes("airbnb") ||
    s.includes("booking") || s.includes("expedia") || s.includes("decolar") ||
    s.includes("latam") || s.includes("aviacao") || s.includes("passagem") ||
    s.includes("viagem") || s.includes("turismo") || s.includes("cruzeiro") ||
    s.includes("msc ") || s.includes("msc cruzeiros") || s.includes("melia") ||
    s.includes("bondinho") || s.includes("cvc ") || s.includes("viajanet") ||
    s.includes("pousada") || s.includes("resort") || s.includes("intercity") ||
    s.includes("ibis") || s.includes("novotel") || s.includes("mercure") ||
    s.includes("hilton") || s.includes("marriott") || s.includes("wyndham") ||
    s.includes("wi-fi onboard") || s.includes("wifi onboard") || s.includes("wifionboard") ||
    s.includes("onboard glo") ||
    s.includes("marina tour") || s.includes("atrio hoteis") || s.includes("duty free") ||
    s.includes("duty paid") ||
    s.match(/\bgol\b/) || s.match(/\bazul\b/)
  ) return "Viagens & Hotéis";

  // Education & Events
  if (
    s.includes("escola") || s.includes("curso") || s.includes("faculdade") ||
    s.includes("universidade") || s.includes("educacao") || s.includes("piperacadem") ||
    s.includes("udemy") || s.includes("alura") || s.includes("rocketseat") ||
    s.includes("evento") || s.includes("ingresso") || s.includes("ticketmaster") ||
    s.includes("sympla") || s.includes("eventbrite") || s.includes("hotmart") ||
    s.startsWith("htm ") || s.includes("htm*") || s.includes("kiwify") ||
    s.includes("eduzz") || s.includes("ticto") || s.includes("monetizze") ||
    s.includes("livraria") || s.includes("leitura") || s.includes("cultura ") ||
    s.includes("saraiva") || s.includes("ri happy") || s.includes("brinquedos") ||
    s.includes("toys") || s.includes("mattel") || s.includes("artcfg") ||
    s.includes("pipefy") || s.includes("teatro") || s.includes("museu") ||
    s.includes("shows ") || s.includes("show ") || s.includes("concert") ||
    s.includes("festival") || s.includes("workshop") ||
    s.includes("_exame") || s.includes("exame_cfg") || s.includes("exame cfg") ||
    s.includes("cinemark") || s.includes("cinepolis") || s.includes("kinoplex") ||
    s.includes("uci cinema") || s.includes("cinesystem") ||
    s.includes("web summit") || s.includes("zig*ccr") || s.includes("zig*") ||
    s.includes("cdai") || s.includes("eliminatoria") || s.includes("entretenimento") ||
    s.includes("ticketfacil") || s.includes("purplevent") ||
    s.includes("criamigos") || s.includes("clubeaquarela") || s.includes("aquarelakids")
  ) return "Educação & Eventos";

  // Fashion & Clothing
  if (
    s.includes("riachuelo") || s.includes("renner") || s.includes("zara") ||
    s.includes("farm ") || s.includes("reserva") || s.includes("hering") ||
    s.includes("puma") || s.includes("adidas") || s.includes("nike") ||
    s.includes("jorgebischoff") || s.includes("jorge bischoff") ||
    s.includes("arezzo") || s.includes("anacapri") || s.includes("carrano") ||
    s.includes("schutz") || s.includes("loupen") || s.includes("dumond") ||
    s.includes("osklen") || s.includes("quiksilver") || s.includes("lacoste") ||
    s.includes("tommy") || s.includes("calvin klein") || s.includes("ralph lauren") ||
    s.includes("gap ") || s.includes("forever 21") || s.includes("cea ") ||
    s.includes("c&a ") || s.includes("shoulder") || s.includes("forum ") ||
    s.includes("ellus") || s.includes("levi") || s.includes("colcci") ||
    s.includes("animale") || s.includes("morena rosa") || s.includes("roupas") ||
    s.includes("vestuario") || s.includes("calcados") || s.includes("sapatos") ||
    s.includes("sao joao calca") || s.includes("king shoes") ||
    s.includes("terno") || s.includes("chemise") ||
    (s.includes("moda") && !s.includes("acomodacao"))
  ) return "Moda & Vestuário";

  // Wellbeing & Personal care / Sports
  if (
    s.includes("academia") || s.includes("crossfit") || s.includes("pilates") ||
    s.includes("yoga") || s.includes("barbearia") || s.includes("barba mia") ||
    s.includes("salao") || s.includes("beleza") || s.includes("massagem") ||
    s.includes("estetica") || s.includes("smart fit") || s.includes("bio ritmo") ||
    s.includes("ticiana werner") || s.includes("thaiswatrin") || s.includes("love pop thais") ||
    s.includes("suelenoliveira") || s.includes("luiz gonzaga") ||
    s.includes("decathlon") || s.includes("centauro") || s.includes("netshoes") ||
    s.includes("trilha") || s.includes("esportivo") || s.includes("esporte") ||
    s.includes("corrida") || s.includes("natacao") || s.includes("cabeleireiro") ||
    s.includes("manicure") || s.includes("pedicure") || s.includes("depilacao") ||
    s.includes("perfumaria") || s.includes("o boticario") || s.includes("natura ") ||
    s.includes("quem disse berenice") || s.includes("mercur") ||
    s.includes("corpometria") || s.includes("16personalities") ||
    s.includes("jacques janine") || s.includes("esbela") || s.includes("doctor feet") ||
    (s.includes("gym") && !s.includes("gympass")) ||
    (s.includes("spa ") && !s.includes("espaço")) ||
    s.includes("wow*")
  ) return "Bem-Estar & Pessoal";

  // Electronics & Games
  if (
    s.includes("samsung") || s.includes("fast shop") || s.includes("kabum") ||
    s.includes("supercell") || s.includes("supercellstore") || s.includes("oculus") ||
    s.includes("terabyte") || s.includes("pichau") || s.includes("fnac") ||
    s.includes("americanas") || s.includes("techzone") || s.includes("dell ") ||
    s.includes("lenovo") || s.includes("acer ") || s.includes("asus ") ||
    s.includes("logitech") || s.includes("razer") || s.includes("corsair") ||
    s.includes("steam") || s.includes("playstation") || s.includes("xbox") ||
    s.includes("nintendo") || s.includes("epic games") || s.includes("ubisoft") ||
    s.includes("nuuvem") || s.includes("green man") || s.includes("ledshopping") ||
    s.includes("informatica") || s.includes("computador") || s.includes("notebook") ||
    s.includes("smartphone") || s.includes("celular") || s.includes("tablet")
  ) return "Eletrônicos & Games";

  // Online Shopping (general / marketplaces — after more-specific categories)
  if (
    s.includes("amazon") || s.includes("mercado livre") || s.includes("shopee") ||
    s.includes("shein") || s.includes("aliexpress") || s.includes("magazineluiza") ||
    s.includes("submarino") || s.includes("shoptime") || s.includes("dafiti") ||
    s.includes("magalu") || s.includes("marketplace") || s.includes("wish.com") ||
    s.includes("elo7") || s.includes("enjoei") || s.includes("netfarma") ||
    s.includes("drogariasp") || s.includes("extra.com") ||
    s.includes("ebay") || s.includes("diamantesp") || s.includes("smart escrit") ||
    s.includes("patio brasil") || s.includes("patiobrasi") || s.includes("shop pier") ||
    s.includes("relojoaria") || s.includes("park shopping") ||
    s.includes("kalunga") || s.includes("shopping bossa") || s.includes("shopping certer")
  ) return "Compras Online";

  // Home & Condo
  if (
    s.includes("condominio") || s.includes("aluguel") || s.includes("energia") ||
    s.includes("iptu") || s.includes("reforma") || s.includes("leroy") ||
    s.includes("madeirense") || s.includes("casas bahia") || s.includes("tok stok") ||
    s.includes("tok&stok") || s.includes("etna ") || s.includes("westwing") ||
    s.includes("mobly") || s.includes("tramontina") || s.includes("eletrodomestico") ||
    s.includes("loja de materiais") || s.includes("material de construcao") ||
    s.includes("dona de casa") || s.includes("aquasul") || s.includes("cedae") ||
    s.includes("sabesp") || s.includes("copasa") || s.includes("cemig") ||
    s.includes("light sa") || s.includes("enel ") || s.includes("neoenergia") ||
    s.includes("ancar gestao") || s.includes("ancar gest") ||
    s.includes("multicoisas") || s.includes("playgarden") || s.includes("construasa") ||
    (s.includes("agua ") && !s.includes("agua mineral")) ||
    (s.includes("gas ") && !s.includes("gasolina"))
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
