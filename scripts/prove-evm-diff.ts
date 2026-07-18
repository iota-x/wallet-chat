/**
 * EVM PROOF — the balance-diff decode is EXACTLY right, the same way we proved
 * it for Solana. Self-contained: uses eth_simulateV1 state overrides + the real
 * WETH contract, so it needs no faucet, no funded account, and no private key
 * (simulation doesn't verify signatures).
 *
 * It runs one block with three calls:
 *   [0] read balances (native + WETH) BEFORE, from a throwaway reader address
 *   [1] WETH.deposit{value: X}()  sent from the owner  (wraps ETH → WETH)
 *   [2] read balances AFTER, from the reader
 * and asserts two exact facts:
 *   • WETH(owner) delta == +X                    → ERC-20 balance decode is exact
 *   • ETH(owner)  delta == -(X + gasUsed*price)  → native decode folds in gas
 *     (this proves validation:true charges gas to the sender — the assumption
 *      decodeEvmDiff relies on for exactness)
 *
 * Run: npm run proof:evm   (defaults to the Sepolia tier; EVM_PROOF_MODE=mainnet
 * to run against mainnet WETH).
 */
import { encodeFunctionData, numberToHex, type Address, type Hex } from "viem";
import { buildBalanceReader } from "../src/lib/evm/rpc.ts";
import { EVM_TOKENS } from "../src/lib/evm/constants.ts";
import { evmRpc } from "../src/lib/chains.ts";
import type { Mode } from "../src/lib/types.ts";

const MODE: Mode = process.env.EVM_PROOF_MODE === "mainnet" ? "mainnet" : "devnet";
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const READER = "0x000000000000000000000000000000000000dEaD" as Address;
const WETH = (EVM_TOKENS.WETH.addresses[MODE] ??
  EVM_TOKENS.WETH.addresses.mainnet!) as Address;

let failures = 0;
function assertEq(actual: bigint, expected: bigint, label: string) {
  const ok = actual === expected;
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}`);
  if (!ok) {
    console.log(`      expected: ${expected}`);
    console.log(`      actual:   ${actual}`);
    failures++;
  }
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(evmRpc(MODE), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}

async function main() {
  console.log(`\nWalletChat — EVM diff-decode proof`);
  console.log(`RPC: ${evmRpc(MODE)}  (WETH ${WETH})\n`);

  const X = 10n ** 17n; // 0.1 ETH
  const priority = 1_000_000_000n; // 1 gwei
  const maxFee = 200_000_000_000n; // 200 gwei ceiling

  const reader = buildBalanceReader(OWNER, [WETH]);
  const depositData = encodeFunctionData({
    abi: [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] }],
    functionName: "deposit",
    args: [],
  });

  const params = [
    {
      blockStateCalls: [
        {
          stateOverrides: {
            [OWNER]: { balance: numberToHex(10n ** 18n) },
            [READER]: { balance: numberToHex(10n ** 18n) },
          },
          calls: [
            {
              from: READER,
              to: reader.to,
              data: reader.data,
              gas: numberToHex(3_000_000n),
              maxFeePerGas: numberToHex(maxFee),
              maxPriorityFeePerGas: numberToHex(priority),
            },
            {
              from: OWNER,
              to: WETH,
              data: depositData,
              value: numberToHex(X),
              gas: numberToHex(120_000n),
              maxFeePerGas: numberToHex(maxFee),
              maxPriorityFeePerGas: numberToHex(priority),
            },
            {
              from: READER,
              to: reader.to,
              data: reader.data,
              gas: numberToHex(3_000_000n),
              maxFeePerGas: numberToHex(maxFee),
              maxPriorityFeePerGas: numberToHex(priority),
            },
          ],
        },
      ],
      validation: true,
      traceTransfers: false,
    },
    "latest",
  ];

  const blocks = await rpc<
    {
      baseFeePerGas?: Hex;
      calls?: { status?: Hex; returnData?: Hex; gasUsed?: Hex; error?: { message?: string } }[];
    }[]
  >("eth_simulateV1", params);

  const block = blocks[0];
  const calls = block.calls ?? [];
  if (calls[1]?.status !== "0x1") {
    console.log(`  \x1b[31m✗ deposit call failed: ${calls[1]?.error?.message}\x1b[0m`);
    process.exit(1);
  }

  const before = reader.decode(calls[0]!.returnData!);
  const after = reader.decode(calls[2]!.returnData!);
  const gasUsed = BigInt(calls[1]!.gasUsed!);
  const baseFee = BigInt(block.baseFeePerGas ?? "0x0");
  const effectivePrice = baseFee + priority; // maxFee is well above base+priority
  const gasCost = gasUsed * effectivePrice;

  const wethKey = WETH.toLowerCase();
  const wethDelta = (after.tokens[wethKey] ?? 0n) - (before.tokens[wethKey] ?? 0n);
  const ethDelta = after.native - before.native;

  console.log(`  gasUsed ${gasUsed}  baseFee ${baseFee}  gasCost ${gasCost}`);
  assertEq(wethDelta, X, `WETH(owner) delta == +${X} (wrapped)`);
  assertEq(ethDelta, -(X + gasCost), `ETH(owner) delta == -(X + gas) = -(${X} + ${gasCost})`);

  console.log(
    failures === 0
      ? "\n\x1b[32mEVM PROOF PASSED — diff decode is exact, gas folded into native delta.\x1b[0m\n"
      : `\n\x1b[31m${failures} EVM PROOF(S) FAILED.\x1b[0m\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\n\x1b[31mEVM proof errored:\x1b[0m", e.message);
  console.error("(the RPC may not support eth_simulateV1 — set NEXT_PUBLIC_ETH_* to an Alchemy/Infura URL)");
  process.exit(1);
});
