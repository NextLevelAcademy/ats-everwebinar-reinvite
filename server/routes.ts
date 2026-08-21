import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';

// ====== WATI broadcasting ======
// WATI sends now go directly from the browser to the shared Cloudflare
// Worker (the same one the Crypto Zoom app uses) — see
// client/src/lib/watiWorker.ts. That Worker holds the WATI bearer token for
// tenant 321386, so this backend no longer needs its own copy of the token,
// the tenant base URL, or the per-contact send/retry/safety-mode logic that
// used to live here. Removing it avoids two independent places managing the
// same secret and the same "live vs QA-only" safety toggle getting out of
// sync with each other.
//
// If it turns out the shared Worker's request/response contract does NOT
// match what this app sends (see the flags in watiWorker.ts and routes.ts's
// git history for the previous implementation), reintroduce a route here —
// but confirm the mismatch first rather than assuming this file's old shape
// was correct.

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  return httpServer;
}
