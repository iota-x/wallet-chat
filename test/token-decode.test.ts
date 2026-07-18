import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  decodeTokenAccount,
  TOKEN_ACCOUNT_LEN,
} from "@/lib/solana/tokens";

/**
 * Offline proof of the byte-layout decode. The devnet proof shows it's exact
 * end-to-end; this pins the layout math itself so a regression is caught in CI
 * without a network round-trip.
 */
function buildTokenAccount(opts: {
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  state?: number;
  isNativeReserve?: bigint | null;
}): Uint8Array {
  const buf = new Uint8Array(TOKEN_ACCOUNT_LEN);
  buf.set(opts.mint.toBytes(), 0);
  buf.set(opts.owner.toBytes(), 32);
  // amount u64 LE at offset 64
  let a = opts.amount;
  for (let i = 0; i < 8; i++) {
    buf[64 + i] = Number(a & 0xffn);
    a >>= 8n;
  }
  buf[108] = opts.state ?? 1; // initialized
  if (opts.isNativeReserve != null) {
    // COption tag = 1 at offset 109, u64 at 113
    buf[109] = 1;
    let r = opts.isNativeReserve;
    for (let i = 0; i < 8; i++) {
      buf[113 + i] = Number(r & 0xffn);
      r >>= 8n;
    }
  }
  return buf;
}

describe("token account byte-layout decode", () => {
  const mint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const owner = new PublicKey("11111111111111111111111111111111");

  it("decodes mint, owner, and a large u64 amount without precision loss", () => {
    const amount = 18_446_744_073_709_551_000n; // near u64 max — must stay exact
    const decoded = decodeTokenAccount(
      buildTokenAccount({ mint, owner, amount })
    );
    expect(decoded).not.toBeNull();
    expect(decoded!.mint).toBe(mint.toBase58());
    expect(decoded!.owner).toBe(owner.toBase58());
    expect(decoded!.amount).toBe(amount);
  });

  it("decodes a zero balance as 0n (not null)", () => {
    const decoded = decodeTokenAccount(
      buildTokenAccount({ mint, owner, amount: 0n })
    );
    expect(decoded!.amount).toBe(0n);
  });

  it("returns null for an uninitialized (state=0) account", () => {
    const decoded = decodeTokenAccount(
      buildTokenAccount({ mint, owner, amount: 5n, state: 0 })
    );
    expect(decoded).toBeNull();
  });

  it("returns null for a too-short buffer", () => {
    expect(decodeTokenAccount(new Uint8Array(64))).toBeNull();
  });

  it("reads the wSOL native rent reserve (COption<u64>)", () => {
    const decoded = decodeTokenAccount(
      buildTokenAccount({
        mint,
        owner,
        amount: 1_000_000_000n,
        isNativeReserve: 2_039_280n,
      })
    );
    expect(decoded!.isNativeReserve).toBe(2_039_280n);
  });
});
