import { createServer } from "node:http";

// Test-only transport: APIRequestContext pools HTTP sockets separately from
// Chromium. Keep its idle connections beyond the 30-second E2E test budget,
// rather than racing Node's default 5-second timeout plus its 1-second buffer.
export function createE2EHttpServer(requestListener) {
  return createServer({ keepAliveTimeout: 65_000, headersTimeout: 70_000 }, requestListener);
}
