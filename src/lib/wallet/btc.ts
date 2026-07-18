/** Thin Unisat wallet helpers for Bitcoin (client-side signing). */

interface Unisat {
  requestAccounts(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
  getPublicKey(): Promise<string>;
  signPsbt(psbtHex: string, opts?: { autoFinalized?: boolean }): Promise<string>;
  pushPsbt(signedPsbtHex: string): Promise<string>;
}

export function getUnisat(): Unisat | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { unisat?: Unisat }).unisat ?? null;
}

export async function connectBtc(): Promise<string | null> {
  const u = getUnisat();
  if (!u) throw new Error("No Bitcoin wallet found. Install Unisat.");
  const accts = await u.requestAccounts();
  return accts?.[0] ?? null;
}

export async function getBtcAccount(): Promise<string | null> {
  const u = getUnisat();
  if (!u) return null;
  try {
    const accts = await u.getAccounts();
    return accts?.[0] ?? null;
  } catch {
    return null;
  }
}

/** The connected account's public key (hex) — needed for Taproot PSBTs. */
export async function getBtcPublicKey(): Promise<string | null> {
  const u = getUnisat();
  if (!u) return null;
  try {
    return (await u.getPublicKey()) ?? null;
  } catch {
    return null;
  }
}

function base64ToHex(b64: string): string {
  const bin = atob(b64);
  let hex = "";
  for (let i = 0; i < bin.length; i++) {
    hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

/** Sign the PSBT (Unisat wants hex) and broadcast. Returns the txid. */
export async function signAndPushPsbt(psbtBase64: string): Promise<string> {
  const u = getUnisat();
  if (!u) throw new Error("No Bitcoin wallet.");
  const psbtHex = base64ToHex(psbtBase64);
  const signedHex = await u.signPsbt(psbtHex, { autoFinalized: true });
  return u.pushPsbt(signedHex);
}
