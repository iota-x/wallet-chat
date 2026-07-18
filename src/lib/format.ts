/** Display formatting. Numbers render in mono/tabular everywhere they appear. */

const MINUS = "−"; // real minus sign, not hyphen — aligns in tabular mono

export function formatUi(value: number, maxFrac = 6): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  // Choose a sensible precision: big numbers get fewer decimals.
  const frac = abs >= 1000 ? 2 : abs >= 1 ? 4 : maxFrac;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: frac,
  });
}

export function formatSigned(value: number, maxFrac = 6): string {
  const s = formatUi(Math.abs(value), maxFrac);
  if (value > 0) return `+${s}`;
  if (value < 0) return `${MINUS}${s}`;
  return s;
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? MINUS : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSol(lamports: number): string {
  return formatUi(lamports / 1e9, 6);
}

export function shortAddr(addr: string, n = 4): string {
  if (addr.length <= n * 2 + 1) return addr;
  return `${addr.slice(0, n)}…${addr.slice(-n)}`;
}

export function pct(value: number, frac = 2): string {
  return `${value.toFixed(frac)}%`;
}
