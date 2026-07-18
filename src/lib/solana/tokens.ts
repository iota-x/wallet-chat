import {
  Connection,
  PublicKey,
  AccountInfo,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "./constants";

/**
 * SPL Token account layout (the base 165 bytes, identical for Token-2022 which
 * simply appends TLV extensions after it — so these offsets are always valid):
 *
 *   offset  size  field
 *   0       32    mint
 *   32      32    owner
 *   64      8     amount            (u64 LE)   ← the number that matters
 *   72      4+32  delegate          (COption<Pubkey>)
 *   108     1     state             (0=uninit,1=init,2=frozen)
 *   109     4+8   isNative          (COption<u64>)  ← rent-reserve for wSOL
 *   121     8     delegatedAmount   (u64 LE)
 *   129     4+32  closeAuthority    (COption<Pubkey>)
 *
 * We decode by hand rather than pulling spl-token's AccountLayout so the exact
 * byte math is auditable in one place — this is the correctness-critical path.
 */
export const TOKEN_ACCOUNT_LEN = 165;

export interface DecodedTokenAccount {
  mint: string;
  owner: string;
  /** Raw base-unit balance. bigint so u64 never lossily hits a JS number. */
  amount: bigint;
  state: number;
  /** For wSOL accounts, the lamports held as the rent reserve (COption<u64>). */
  isNativeReserve: bigint | null;
}

function readU64LE(buf: Uint8Array, offset: number): bigint {
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result |= BigInt(buf[offset + i]) << (8n * BigInt(i));
  }
  return result;
}

/**
 * Decode a raw token-account buffer. Returns null if it's obviously not a token
 * account (too short / uninitialized), which lets callers treat "no token
 * account" and "empty token account" distinctly — important for the diff.
 */
export function decodeTokenAccount(
  data: Uint8Array
): DecodedTokenAccount | null {
  if (data.length < TOKEN_ACCOUNT_LEN) return null;
  const state = data[108];
  if (state === 0) return null; // uninitialized

  const mint = new PublicKey(data.subarray(0, 32)).toBase58();
  const owner = new PublicKey(data.subarray(32, 64)).toBase58();
  const amount = readU64LE(data, 64);

  const isNativeTag =
    data[109] | (data[110] << 8) | (data[111] << 16) | (data[112] << 24);
  const isNativeReserve =
    isNativeTag === 1 ? readU64LE(data, 113) : null;

  return { mint, owner, amount, state, isNativeReserve };
}

/** True if this account is owned by a token program (classic or Token-2022). */
export function isTokenProgram(owner: PublicKey): boolean {
  return (
    owner.equals(TOKEN_PROGRAM_ID) || owner.equals(TOKEN_2022_PROGRAM_ID)
  );
}

/**
 * Derive the Associated Token Account address for (owner, mint). We implement
 * the PDA derivation directly to avoid a hard dependency on spl-token's async
 * helper and to keep it usable in the pure diff-decode path.
 */
export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

/** Decode a fetched AccountInfo into a token account, or null. */
export function decodeAccountInfo(
  info: AccountInfo<Buffer> | null
): DecodedTokenAccount | null {
  if (!info) return null;
  if (!isTokenProgram(info.owner)) return null;
  return decodeTokenAccount(info.data);
}

/** Live-read a single token account's balance (base units), 0n if absent. */
export async function readTokenBalance(
  connection: Connection,
  ata: PublicKey
): Promise<{ exists: boolean; amount: bigint }> {
  const info = await connection.getAccountInfo(ata, "confirmed");
  const decoded = decodeAccountInfo(info);
  if (!decoded) return { exists: false, amount: 0n };
  return { exists: true, amount: decoded.amount };
}
