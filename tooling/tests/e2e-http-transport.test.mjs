import test from "node:test";
import assert from "node:assert/strict";
import { Agent, request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { createE2EHttpServer } from "./e2e/http-transport.mjs";

async function fixture(t) {
  const connections = [];
  const server = createE2EHttpServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("transport fixture");
  });
  const agent = new Agent({ keepAlive: true });
  server.on("connection", socket => connections.push(socket));
  t.after(async () => {
    agent.destroy();
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const get = () => new Promise((resolve, reject) => {
    const outgoing = request({ hostname: "127.0.0.1", port: server.address().port, path: "/", agent }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
        socket: outgoing.socket,
        reusedSocket: outgoing.reusedSocket
      }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
  return { server, connections, get };
}

test("E2E HTTP transport configures and advertises the extended idle timeout", { timeout: 10_000 }, async t => {
  const { server, connections, get } = await fixture(t);
  assert.equal(server.keepAliveTimeout, 65_000);
  assert.equal(server.headersTimeout, 70_000);
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.body, "transport fixture");
  assert.equal(response.headers.connection, "keep-alive");
  assert.match(response.headers["keep-alive"], /^timeout=65(?:,|$)/u);
  assert.equal(connections.length, 1);
});

test("E2E HTTP transport reuses the same TCP connection beyond the old six-second idle boundary", { timeout: 30_000 }, async t => {
  const { connections, get } = await fixture(t);
  const first = await get();
  assert.equal(first.status, 200);
  assert.equal(first.reusedSocket, false);
  assert.equal(connections.length, 1);
  const idleStarted = performance.now();
  await delay(6_200);
  assert.ok(performance.now() - idleStarted >= 6_000, "Cross the former 5-second timeout plus 1-second buffer");
  const second = await get();
  assert.equal(second.status, 200);
  assert.equal(second.body, "transport fixture");
  assert.equal(second.reusedSocket, true);
  assert.equal(second.socket, first.socket);
  assert.equal(connections.length, 1, "A replacement TCP connection must not conceal an idle close");
});
