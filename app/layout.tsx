import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fatura XP – Controle de Gastos",
  description: "Painel de controle e redução de despesas no cartão de crédito",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
