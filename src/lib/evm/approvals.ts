import type { ApprovalInfo } from "@/lib/types";

/**
 * APPROVAL DECODING — the counter to simulation's biggest blind spot.
 *
 * An ERC-20 `approve` / `setApprovalForAll` / `permit` grants a spender the
 * right to move your tokens later. It moves ZERO balance now, so a balance-diff
 * simulation reports no change and a diff-only guardrail waves it through — yet
 * you may have just handed an attacker unlimited access. Real wallets (Rabby,
 * Blockaid) decode these from calldata and warn; so do we, here, with a pure
 * function that reads the 4-byte selector + ABI-packed args directly. No ABI
 * decoder, no I/O — trivially unit-testable.
 */

// 4-byte selectors of the allowance-granting methods we recognize.
const SELECTORS = {
  approve: "095ea7b3", // approve(address,uint256)
  increaseAllowance: "39509351", // increaseAllowance(address,uint256)
  setApprovalForAll: "a22cb465", // setApprovalForAll(address,bool)
  permit2612: "d505accf", // permit(owner,spender,value,deadline,v,r,s)
  permitDai: "8fcbaf0c", // permit(holder,spender,nonce,expiry,allowed,v,r,s)
} as const;

/** Anything at/above this is treated as "unlimited" for risk purposes. */
const UNLIMITED_THRESHOLD = 2n ** 255n;

/** Read the i-th 32-byte word (0-indexed) from calldata after the selector. */
function word(body: string, i: number): string {
  const start = i * 64;
  return body.slice(start, start + 64);
}
function wordToAddress(w: string): string {
  return ("0x" + w.slice(24)).toLowerCase(); // last 20 bytes
}
function wordToBigInt(w: string): bigint {
  return w ? BigInt("0x" + w) : 0n;
}

/**
 * Decode an approval from EVM calldata, or return null if the calldata is not
 * one of the recognized allowance grants (e.g. a plain transfer or swap call).
 */
export function decodeApproval(data: string | null | undefined): ApprovalInfo | null {
  if (!data) return null;
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (hex.length < 8) return null;
  const selector = hex.slice(0, 8).toLowerCase();
  const body = hex.slice(8).toLowerCase();

  switch (selector) {
    case SELECTORS.approve: {
      const amount = wordToBigInt(word(body, 1));
      return {
        kind: "erc20-approve",
        spender: wordToAddress(word(body, 0)),
        amount: amount.toString(),
        unlimited: amount >= UNLIMITED_THRESHOLD,
        approved: amount > 0n,
      };
    }
    case SELECTORS.increaseAllowance: {
      const amount = wordToBigInt(word(body, 1));
      return {
        kind: "erc20-increaseAllowance",
        spender: wordToAddress(word(body, 0)),
        amount: amount.toString(),
        unlimited: amount >= UNLIMITED_THRESHOLD,
        approved: true,
      };
    }
    case SELECTORS.setApprovalForAll: {
      const approved = wordToBigInt(word(body, 1)) !== 0n;
      return {
        kind: "setApprovalForAll",
        spender: wordToAddress(word(body, 0)),
        amount: null,
        unlimited: approved, // "all NFTs" is inherently unlimited when true
        approved,
      };
    }
    case SELECTORS.permit2612: {
      // permit(owner, spender, value, ...) — spender is word 1, value word 2.
      const amount = wordToBigInt(word(body, 2));
      return {
        kind: "permit",
        spender: wordToAddress(word(body, 1)),
        amount: amount.toString(),
        unlimited: amount >= UNLIMITED_THRESHOLD,
        approved: amount > 0n,
      };
    }
    case SELECTORS.permitDai: {
      // permit(holder, spender, nonce, expiry, allowed, ...) — allowed is word 4.
      const allowed = wordToBigInt(word(body, 4)) !== 0n;
      return {
        kind: "permit",
        spender: wordToAddress(word(body, 1)),
        amount: null,
        unlimited: allowed,
        approved: allowed,
      };
    }
    default:
      return null;
  }
}
