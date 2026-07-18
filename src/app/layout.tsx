import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// The human voice: a warm, legible grotesque for conversation and prose.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// The machine voice: an institutional monospace for the wordmark, every
// numeral, and the verification slip. The ledger/instrument reports in mono.
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WalletChat — the transaction verifier",
  description:
    "State an intent in plain language across Solana, Ethereum, and Bitcoin. The agent plans it, simulates against live chain state, and prints a verification slip with the exact balance diff. Nothing signs until guardrails pass and you arm it.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
