import * as bitcoin from "bitcoinjs-lib";
import type { Mode, BtcPayload, BtcIo } from "@/lib/types";
import { getUtxos, type Utxo } from "./api";

/**
 * Bitcoin transaction builder — the "lighter" path. UTXO chains have no on-chain
 * simulation or DEX, so there is no exact post-state diff. What we CAN do safely:
 * select coins, build a real PSBT, and show precisely which UTXOs are spent and
 * which outputs (recipient + change) are created, with the fee. Supports native
 * SegWit (bech32, bc1q/tb1q) sender addresses. Nothing here signs.
 */

const DUST_SAT = 294; // P2WPKH dust threshold

function network(mode: Mode) {
  return mode === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
}

/** Virtual-size estimate for a P2WPKH tx: overhead + inputs + outputs. */
function estimateVsize(numInputs: number, numOutputs: number): number {
  return Math.ceil(10.5 + numInputs * 68 + numOutputs * 31);
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
}): Promise<BuiltBtcTx> {
  const { mode, fromAddress, toAddress, amountSat, feeRateSatVb } = params;
  const net = network(mode);

  // Validate addresses up front (throws on malformed).
  const fromScript = bitcoin.address.toOutputScript(fromAddress, net);
  bitcoin.address.toOutputScript(toAddress, net);

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
    fee = Math.ceil(estimateVsize(selected.length, 2) * feeRateSatVb);
    if (total >= amountSat + fee) {
      change = total - amountSat - fee;
      if (change < DUST_SAT) {
        // Drop change; the dust rolls into the fee. Recompute with 1 output.
        fee = Math.ceil(estimateVsize(selected.length, 1) * feeRateSatVb);
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
  };

  return { payload, totalInputSat: total, sendSat: amountSat };
}
