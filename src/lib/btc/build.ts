import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import type { Mode, BtcPayload, BtcIo } from "@/lib/types";
import { getUtxos, type Utxo } from "./api";

// Taproot math (tapInternalKey handling) needs an ECC backend.
bitcoin.initEccLib(ecc);

/**
 * Bitcoin transaction builder — the "lighter" path. UTXO chains have no on-chain
 * simulation or DEX, so there is no exact post-state diff. What we CAN do safely:
 * select coins, build a real PSBT, and show precisely which UTXOs are spent and
 * which outputs (recipient + change) are created, with the fee. Supports native
 * SegWit (bc1q/tb1q, P2WPKH) and Taproot (bc1p/tb1p, P2TR key-path) senders.
 * Nothing here signs.
 */

const DUST_SAT = 330; // conservative dust threshold covering P2TR & P2WPKH

function network(mode: Mode) {
  return mode === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
}

type AddrType = "p2wpkh" | "p2tr";

/** Classify a sender output script. Only key-path P2WPKH / P2TR are supported. */
function classifyScript(script: Uint8Array): AddrType {
  if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14)
    return "p2wpkh";
  if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20)
    return "p2tr";
  throw new Error(
    "Unsupported sender address type. Use a native SegWit (bc1q…) or Taproot (bc1p…) address."
  );
}

/** x-only (32-byte) key from a 32- or 33-byte public key. */
function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.length === 32 ? pubkey : pubkey.subarray(1, 33);
}

/** Per-type input vbytes (key-path): P2TR ~57.5, P2WPKH ~68. Outputs ~43 (max). */
function estimateVsize(numInputs: number, numOutputs: number, inputVb: number): number {
  return Math.ceil(10.5 + numInputs * inputVb + numOutputs * 43);
}

export interface BuiltBtcTx {
  payload: BtcPayload;
  totalInputSat: number;
  sendSat: number;
}

export async function buildBtcTransfer(params: {
  mode: Mode;
  fromAddress: string;
  toAddress: string;
  amountSat: number;
  feeRateSatVb: number;
  /** Sender public key (hex). Required for Taproot (bc1p) senders. */
  senderPublicKey?: string | null;
}): Promise<BuiltBtcTx> {
  const { mode, fromAddress, toAddress, amountSat, feeRateSatVb, senderPublicKey } =
    params;
  const net = network(mode);

  // Validate addresses up front (throws on malformed).
  const fromScript = bitcoin.address.toOutputScript(fromAddress, net);
  bitcoin.address.toOutputScript(toAddress, net);
  const addrType = classifyScript(fromScript);

  // Taproot key-path inputs need the internal key; it can't come from the address.
  let tapInternalKey: Buffer | undefined;
  if (addrType === "p2tr") {
    if (!senderPublicKey)
      throw new Error(
        "Taproot (bc1p) sender requires its public key — reconnect the wallet so it can be captured."
      );
    tapInternalKey = toXOnly(Buffer.from(senderPublicKey, "hex"));
  }
  const inputVb = addrType === "p2tr" ? 58 : 68;

  const utxos = (await getUtxos(mode, fromAddress))
    .filter((u) => u.status.confirmed)
    .sort((a, b) => b.value - a.value);
  if (utxos.length === 0) throw new Error("No confirmed UTXOs at this address.");

  // Greedy coin selection, recomputing fee as inputs are added.
  const selected: Utxo[] = [];
  let total = 0;
  let fee = 0;
  let change = 0;
  let hasChange = true;
  let funded = false;
  for (const u of utxos) {
    selected.push(u);
    total += u.value;
    fee = Math.ceil(estimateVsize(selected.length, 2, inputVb) * feeRateSatVb);
    if (total >= amountSat + fee) {
      change = total - amountSat - fee;
      if (change < DUST_SAT) {
        // Drop change; the dust rolls into the fee. Recompute with 1 output.
        fee = Math.ceil(estimateVsize(selected.length, 1, inputVb) * feeRateSatVb);
        change = 0;
        hasChange = false;
        if (total < amountSat + fee) continue; // need more after re-fee
      }
      funded = true;
      break;
    }
  }
  if (!funded) throw new Error("Insufficient confirmed balance for amount + fee.");

  const psbt = new bitcoin.Psbt({ network: net });
  for (const u of selected) {
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: { script: fromScript, value: u.value },
      ...(tapInternalKey ? { tapInternalKey } : {}),
    });
  }
  psbt.addOutput({ address: toAddress, value: amountSat });
  if (hasChange) psbt.addOutput({ address: fromAddress, value: change });

  const inputs: BtcIo[] = selected.map((u) => ({
    address: fromAddress,
    valueSat: u.value,
  }));
  const outputs: BtcIo[] = [
    { address: toAddress, valueSat: amountSat, isChange: false },
    ...(hasChange ? [{ address: fromAddress, valueSat: change, isChange: true }] : []),
  ];

  const payload: BtcPayload = {
    psbtBase64: psbt.toBase64(),
    inputs,
    outputs,
    feeSat: fee,
    feeRateSatVb,
    addressType: addrType,
    senderPublicKey: senderPublicKey ?? null,
  };

  return { payload, totalInputSat: total, sendSat: amountSat };
}
