import { Connection, PublicKey } from "@solana/web3.js";
import type { BalanceLine, Mode } from "@/lib/types";
import {
  NATIVE_SOL,
  SOL_DECIMALS,
  LAMPORTS_PER_SOL,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  tokenByMint,
} from "@/lib/solana/constants";
import { getUsdPrices } from "@/lib/pricing";

/**
 * Read every balance the wallet holds: native SOL plus all SPL token accounts
 * (classic and Token-2022), priced in USD best-effort. Read-only — no keys, no
 * signing. Works identically on devnet and mainnet.
 */
export async function readBalances(
  connection: Connection,
  mode: Mode,
  owner: PublicKey
): Promise<BalanceLine[]> {
  const [lamports, classic, token22] = await Promise.all([
    connection.getBalance(owner, "confirmed"),
    connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID },
      "confirmed"
    ),
    connection
      .getParsedTokenAccountsByOwner(
        owner,
        { programId: TOKEN_2022_PROGRAM_ID },
        "confirmed"
      )
      .catch(() => ({ value: [] as never[] })),
  ]);

  const lines: BalanceLine[] = [];
  lines.push({
    mint: NATIVE_SOL,
    symbol: "SOL",
    decimals: SOL_DECIMALS,
    amount: lamports.toString(),
    uiAmount: lamports / LAMPORTS_PER_SOL,
    usd: null,
    isNative: true,
  });

  for (const { account } of [...classic.value, ...token22.value]) {
    const info = account.data.parsed?.info;
    if (!info) continue;
    const mint: string = info.mint;
    const amountRaw: string = info.tokenAmount?.amount ?? "0";
    const decimals: number = info.tokenAmount?.decimals ?? 0;
    const uiAmount: number = info.tokenAmount?.uiAmount ?? 0;
    if (amountRaw === "0") continue; // hide dust/empty accounts
    const meta = tokenByMint(mint, mode);
    lines.push({
      mint,
      symbol: meta?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`,
      decimals,
      amount: amountRaw,
      uiAmount,
      usd: null,
      isNative: false,
    });
  }

  // Price everything in one call. Missing prices stay null (never fabricated).
  const prices = await getUsdPrices(lines.map((l) => l.mint));
  for (const line of lines) {
    const p = prices[line.mint];
    if (p != null) line.usd = line.uiAmount * p;
  }

  lines.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  return lines;
}
