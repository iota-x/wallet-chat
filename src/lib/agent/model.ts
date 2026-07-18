import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

/**
 * Model selection.
 *
 * The showcase target is `anthropic/claude-opus-4-8` via the Vercel AI Gateway
 * (set AI_GATEWAY_API_KEY). But the gateway requires a card on file, so for a
 * no-card local run we fall back to a free provider if its key is present:
 *   • GOOGLE_GENERATIVE_AI_API_KEY → Gemini  (free, no card, good tool calling)
 *   • GROQ_API_KEY                 → Llama on Groq (free, no card, very fast)
 *
 * Precedence puts the free keys FIRST so dropping one into .env.local "just
 * works" without touching the gateway var. Remove them to go back to Opus.
 */
export function resolveModel(): { model: LanguageModel; label: string } {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const id = process.env.GOOGLE_MODEL || "gemini-2.0-flash";
    return { model: google(id), label: `google/${id}` };
  }
  if (process.env.GROQ_API_KEY) {
    const id = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    return { model: groq(id), label: `groq/${id}` };
  }
  // Default: Vercel AI Gateway string model (requires AI_GATEWAY_API_KEY).
  return {
    model: "anthropic/claude-opus-4-8",
    label: "anthropic/claude-opus-4-8",
  };
}

/** True if any usable model credential is configured. */
export function hasModelCredential(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.AI_GATEWAY_API_KEY
  );
}
