import { isAddress, getAddress, type Address } from "viem";
import type { Mode } from "@/lib/types";
import { getAllowances } from "@/lib/evm/allowances";

export const runtime = "nodejs";
export const maxDuration = 20;

/** GET /api/allowances?owner=0x…&mode=mainnet — standing ERC-20 allowances the
 * connected EVM wallet has granted to the known spender set. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner") ?? "";
  const mode: Mode = url.searchParams.get("mode") === "mainnet" ? "mainnet" : "devnet";
  if (!isAddress(owner)) {
    return Response.json({ error: "Invalid or missing owner address." }, { status: 400 });
  }
  try {
    const allowances = await getAllowances(mode, getAddress(owner) as Address);
    return Response.json({ allowances });
  } catch (e) {
    return Response.json(
      { error: `Could not read allowances: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
