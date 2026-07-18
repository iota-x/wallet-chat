/**
 * DEVNET PROOF — the balance-diff decode is EXACTLY right.
 *
 * The brief's #1 red flag is "no devnet proof that the balance-diff decode is
 * exactly right." This script is that proof. It builds real transactions
 * against devnet, simulates them through the exact same `decodeBalanceDiff`
 * the app uses, and asserts the decoded deltas equal the expected values to the
 * lamport / base-unit — including network fee and ATA-creation rent.
 *
 * Run: npm run proof   (optionally PROOF_PAYER_SECRET=<json array|base58> to
 * skip the airdrop if the faucet is rate-limited).
 *
 * It proves four exact facts:
 *   1. Native SOL transfer: fee payer's lamports delta == -(amount + fee).
 *      → proves the sim deducts fees and we read the fee payer's post-state right.
 *   2. SPL transfer, sender side: token delta == -amount exactly (u64 layout).
 *   3. SPL transfer, receiver side: token delta == +amount AND ataCreated flagged.
 *   4. Fee payer funding a new ATA: SOL delta == -(fee + rent) exactly.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { decodeBalanceDiff } from "../src/lib/solana/simulate.ts";
import { NATIVE_SOL, SOL_DECIMALS } from "../src/lib/solana/constants.ts";

const RPC = process.env.NEXT_PUBLIC_DEVNET_RPC || "https://api.devnet.solana.com";

// ── tiny assertion harness ──────────────────────────────────────────────────
let failures = 0;
function assertEq(actual: bigint | boolean, expected: bigint | boolean, label: string) {
  const ok = actual === expected;
  const mark = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark} ${label}`);
  if (!ok) {
    console.log(`      expected: ${expected}`);
    console.log(`      actual:   ${actual}`);
    failures++;
  }
}

function loadPayerFromEnv(): Keypair | null {
  const raw = process.env.PROOF_PAYER_SECRET;
  if (!raw) return null;
  try {
    if (raw.trim().startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    }
    // base58
    const bs58 = require("bs58");
    return Keypair.fromSecretKey(bs58.decode(raw.trim()));
  } catch {
    return null;
  }
}

async function ensureFunded(conn: Connection): Promise<Keypair> {
  const fromEnv = loadPayerFromEnv();
  if (fromEnv) {
    const bal = await conn.getBalance(fromEnv.publicKey);
    console.log(`Using PROOF_PAYER_SECRET (${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL)`);
    if (bal < 0.03 * LAMPORTS_PER_SOL) throw new Error("payer underfunded (<0.03 SOL)");
    return fromEnv;
  }
  const payer = Keypair.generate();
  console.log(`Airdropping 2 SOL to ephemeral payer ${payer.publicKey.toBase58()} …`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sig = await conn.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
      const bh = await conn.getLatestBlockhash();
      await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      const bal = await conn.getBalance(payer.publicKey);
      if (bal > 0) {
        console.log(`  funded: ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
        return payer;
      }
    } catch (e) {
      console.log(`  airdrop attempt ${attempt} failed: ${(e as Error).message}`);
    }
  }
  throw new Error(
    "Devnet faucet unavailable. Fund a keypair and pass PROOF_PAYER_SECRET=<json array>."
  );
}

/** Fee for a message (base + signature), the number sim also deducts. */
async function feeFor(conn: Connection, tx: VersionedTransaction): Promise<bigint> {
  const fee = await conn.getFeeForMessage(tx.message, "confirmed");
  if (fee.value == null) throw new Error("getFeeForMessage returned null");
  return BigInt(fee.value);
}

async function buildV0(
  conn: Connection,
  payer: PublicKey,
  ixs: TransactionInstruction[]
): Promise<VersionedTransaction> {
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  console.log(`\nWalletChat — devnet diff-decode proof`);
  console.log(`RPC: ${RPC}\n`);

  const payer = await ensureFunded(conn);
  const rentExempt = BigInt(
    await conn.getMinimumBalanceForRentExemption(165)
  );

  // ── TEST 1: native SOL transfer ────────────────────────────────────────────
  console.log("\nTEST 1 — native SOL transfer (fee + amount exact)");
  {
    const dest = Keypair.generate();
    const amount = BigInt(0.1 * LAMPORTS_PER_SOL);
    const tx = await buildV0(conn, payer.publicKey, [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: dest.publicKey,
        lamports: Number(amount),
      }),
    ]);
    const fee = await feeFor(conn, tx);
    const { simulation, diff } = await decodeBalanceDiff(
      conn,
      payer.publicKey,
      [{ mint: NATIVE_SOL, symbol: "SOL", decimals: SOL_DECIMALS }],
      tx,
      "devnet"
    );
    assertEq(simulation.success, true, "simulation succeeded");
    const sol = diff.find((d) => d.isNative);
    assertEq(BigInt(sol?.delta ?? "999"), -(amount + fee), `SOL delta == -(amount + fee) = -(${amount} + ${fee})`);
  }

  // ── SPL setup: mint a throwaway token, fund payer's ATA ─────────────────────
  console.log("\nSetting up throwaway SPL mint (decimals 6) …");
  const mint = await createMint(conn, payer, payer.publicKey, null, 6);
  const payerAta = await getOrCreateAssociatedTokenAccount(
    conn,
    payer,
    mint,
    payer.publicKey
  );
  await mintTo(conn, payer, mint, payerAta.address, payer, 1_000_000_000n); // 1000.000000
  console.log(`  mint ${mint.toBase58()} — payer holds 1000.000000`);

  // ── TEST 2 & 3 & 4: SPL transfer with receiver ATA creation ─────────────────
  console.log("\nTEST 2–4 — SPL transfer + ATA creation (sender, receiver, rent)");
  {
    const dest = Keypair.generate();
    const destAta = getAssociatedTokenAddressSync(mint, dest.publicKey);
    const amount = 250_000_000n; // 250.000000

    const tx = await buildV0(conn, payer.publicKey, [
      createAssociatedTokenAccountInstruction(
        payer.publicKey, // payer funds the new ATA (pays rent)
        destAta,
        dest.publicKey,
        mint
      ),
      createTransferInstruction(
        payerAta.address,
        destAta,
        payer.publicKey,
        Number(amount)
      ),
    ]);
    const fee = await feeFor(conn, tx);

    // Sender (payer) perspective: token -amount, SOL -(fee + rent).
    const senderView = await decodeBalanceDiff(
      conn,
      payer.publicKey,
      [
        { mint: NATIVE_SOL, symbol: "SOL", decimals: SOL_DECIMALS },
        { mint: mint.toBase58(), symbol: "TEST", decimals: 6 },
      ],
      tx,
      "devnet"
    );
    assertEq(senderView.simulation.success, true, "simulation succeeded");
    const senderTok = senderView.diff.find((d) => !d.isNative);
    const senderSol = senderView.diff.find((d) => d.isNative);
    assertEq(BigInt(senderTok?.delta ?? "999"), -amount, "sender token delta == -amount");
    assertEq(
      BigInt(senderSol?.delta ?? "999"),
      -(fee + rentExempt),
      `sender SOL delta == -(fee + rent) = -(${fee} + ${rentExempt})`
    );

    // Receiver (dest) perspective: token +amount, ataCreated flagged, SOL 0.
    const recvView = await decodeBalanceDiff(
      conn,
      dest.publicKey,
      [{ mint: mint.toBase58(), symbol: "TEST", decimals: 6 }],
      tx,
      "devnet"
    );
    const recvTok = recvView.diff.find((d) => !d.isNative);
    assertEq(BigInt(recvTok?.delta ?? "0"), amount, "receiver token delta == +amount");
    assertEq(recvTok?.ataCreated ?? false, true, "receiver ATA creation detected");
  }

  console.log(
    failures === 0
      ? "\n\x1b[32mALL PROOFS PASSED — the diff decode is exact.\x1b[0m\n"
      : `\n\x1b[31m${failures} PROOF(S) FAILED.\x1b[0m\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\n\x1b[31mProof run errored:\x1b[0m", e);
  process.exit(1);
});
