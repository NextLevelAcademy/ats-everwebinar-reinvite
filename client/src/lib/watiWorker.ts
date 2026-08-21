import type { WatiContact } from "../../../shared/schema";

// ============================================================================
// Shared WATI broadcast Cloudflare Worker.
//
// This is the SAME Worker already used by the Crypto Zoom app — it holds the
// WATI bearer token (tenant 321386) and proxies sendTemplateMessage calls so
// the token never has to live in this app's frontend OR its own backend.
//
// Request/response shape below is copied verbatim from the confirmed Crypto
// Zoom app calling code (provided directly), NOT guessed:
//   - Body is exactly { templateName, broadcastName, contacts } — no
//     `broadcastType` field and no `mediaUrl` field are sent. The earlier
//     draft of this file included both; they've been removed to match the
//     real contract.
//   - Error responses are read from `data.error` OR `data.details` where
//     `details` is an ARRAY of strings (`.join(", ")`), not the Zod
//     `flatten()` object shape ATS's own removed backend used to return.
// ============================================================================

const WATI_WORKER_BASE_URL =
  "https://nlp-wati-broadcast-worker.broad-rice-fca8.workers.dev";

export interface SendBroadcastPayload {
  templateName: string; // e.g. "atm_welcomewati_evergreen" / "ats_noshow_v1" — must exist & be approved under tenant 321386
  broadcastName: string;
  contacts: WatiContact[];
}

export interface SendBroadcastResult {
  ok: boolean;
  sentCount: number;
  failedCount: number;
  total: number;
  broadcastName: string;
  failures?: { whatsappNumber: string; name: string; error?: string }[];
  [key: string]: unknown;
}

export async function sendBroadcastViaWorker(
  payload: SendBroadcastPayload
): Promise<SendBroadcastResult> {
  const res = await fetch(`${WATI_WORKER_BASE_URL}/api/wati/send-broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      (data && (data.error || data.details?.join?.(", "))) ||
        `Worker returned HTTP ${res.status}`
    );
  }

  return data as SendBroadcastResult;
}
