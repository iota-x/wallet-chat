import {
  Connection,
  VersionedTransaction,
  AddressLookupTableAccount,
  PublicKey,
} from "@solana/web3.js";
import type { AssetDelta, FeeBreakdown } from "@/lib/types";
import { TOKEN_ACCOUNT_RENT_LAMPORTS } from "./constants";

/**
 * Resolve EVERY program id a transaction invokes — including those reachable
 * only through address lookup tables. This matters for the guardrail allowlist:
 * a Jupiter swap carries its program ids in LUTs, and a naive scan of the static
 * keys would miss them (and could be tricked into thinking an unknown program is
 * absent). We resolve the full account-key set before checking the allowlist.
 */
export async function extractProgramIds(
  connection: Connection,
  tx: VersionedTransaction
): Promise<string[]> {
  const message = tx.message;
  const lookups = message.addressTableLookups ?? [];

  const lutAccounts: AddressLookupTableAccount[] = [];
  for (const lookup of lookups) {
    const res = await connection.getAddressLookupTable(lookup.accountKey, {
      commitment: "confirmed",
    });
    if (res.value) lutAccounts.push(res.value);
  }

  const accountKeys = message.getAccountKeys({
    addressLookupTableAccounts: lutAccounts,
  });

  const programIds = new Set<string>();
  for (const ix of message.compiledInstructions) {
    const key: PublicKey | undefined = accountKeys.get(ix.programIdIndex);
    if (key) programIds.add(key.toBase58());
  }
  return Array.from(programIds);
}

/**
 * Itemize transaction cost. The network fee comes from getFeeForMessage (base +
 * any priority set by compute-budget instructions). Rent is derived from the
 * simulated diff — a token account we saw get created costs one rent-exempt
 * reserve. This is display-only; the authoritative SOL cost is the simulated
 * native delta, which already folds all of this in.
 */
export async function computeFeeBreakdown(
  connection: Connection,
  tx: VersionedTransaction,
  diff: AssetDelta[]
): Promise<FeeBreakdown> {
  let networkFee = 5000; // conservative fallback
  try {
    const res = await connection.getFeeForMessage(tx.message, "confirmed");
    if (res.value != null) networkFee = res.value;
  } catch {
    /* keep fallback */
  }

  const numSigs = tx.message.header.numRequiredSignatures;
  const baseLamports = 5000 * numSigs;
  const priorityLamports = Math.max(networkFee - baseLamports, 0);
  const createdAtas = diff.filter((d) => d.ataCreated).length;
  const rentLamports = createdAtas * TOKEN_ACCOUNT_RENT_LAMPORTS;

  return {
    baseLamports,
    priorityLamports,
    rentLamports,
    totalLamports: baseLamports + priorityLamports + rentLamports,
  };
}
