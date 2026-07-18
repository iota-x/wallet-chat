import { describe, it, expect } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { buildBtcTransfer } from "@/lib/btc/build";

bitcoin.initEccLib(ecc);

/**
 * Offline checks for the Bitcoin builder's address handling. These run before
 * any network call (address validation + Taproot pubkey requirement happen
 * first), so they need no funded UTXOs.
 */
describe("btc build — address types", () => {
  // A valid mainnet P2TR (bc1p…) address from a deterministic internal key.
  // secp256k1 generator x-coordinate — a valid x-only internal key.
  const internalPubkey = Buffer.from(
    "79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798",
    "hex"
  );
  const p2tr = bitcoin.payments.p2tr({
    internalPubkey,
    network: bitcoin.networks.bitcoin,
  });
  const taprootAddress = p2tr.address!;
  const p2wpkhDest = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";

  it("produces a valid bc1p Taproot address for the test vector", () => {
    expect(taprootAddress.startsWith("bc1p")).toBe(true);
  });

  it("rejects a Taproot sender with no public key (can't build key-path input)", async () => {
    await expect(
      buildBtcTransfer({
        mode: "mainnet",
        fromAddress: taprootAddress,
        toAddress: p2wpkhDest,
        amountSat: 10_000,
        feeRateSatVb: 5,
        // senderPublicKey intentionally omitted
      })
    ).rejects.toThrow(/public key/i);
  });

  it("rejects an unsupported (legacy P2PKH) sender address", async () => {
    await expect(
      buildBtcTransfer({
        mode: "mainnet",
        fromAddress: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", // P2PKH
        toAddress: p2wpkhDest,
        amountSat: 10_000,
        feeRateSatVb: 5,
      })
    ).rejects.toThrow(/Unsupported sender address type/i);
  });
});
