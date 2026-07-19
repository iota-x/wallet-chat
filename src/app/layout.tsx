import type { Metadata } from "next";
import { Schibsted_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// The editorial voice: a clean grotesque that carries huge, tight display type.
const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800", "900"],
  variable: "--font-sans",
  display: "swap",
});

// The technical voice: monospace for annotations, labels, and every numeral —
// the callout tags that inspect the glass.
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
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* Set the theme before paint to avoid a flash. Defaults to the light
            (inspiration) look unless the visitor previously chose dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('wc-theme')||'light'}catch(e){}",
          }}
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
