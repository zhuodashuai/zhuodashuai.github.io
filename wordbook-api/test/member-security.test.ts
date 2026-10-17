import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  hashMemberPassword, MEMBER_BODY_BYTES, MEMBER_SCRYPT, memberAuthStub, memberCookie,
  memberFields, memberPassword, memberUsername, readMemberJson, verifyMemberPassword
} from "../src/member-security";

const testEnv = env as unknown as Env;
describe("member credential/runtime boundaries", () => {
  beforeEach(async () => { await reset(); });

  it("runs the real native scrypt contract inside workerd's Durable Object runtime", async () => {
    const result = await runInDurableObject(memberAuthStub(testEnv), async () => {
      const password = "  密码 with unicode 😀 spaces  ";
      const first = await hashMemberPassword(password, testEnv);
      const second = await hashMemberPassword(password, testEnv);
      return { first, second, good: await verifyMemberPassword(password, first, testEnv),
        wrong: await verifyMemberPassword(password.trim(), first, testEnv) };
    });
    expect(result.first).toMatchObject({ version: 1, algorithm: "scrypt-hmac-sha256", N: 16384, r: 8, p: 5 });
    expect(MEMBER_SCRYPT.maxmem).toBe(32 * 1024 * 1024);
    expect(result.first.hash).not.toBe(result.second.hash);
    expect(result.first.salt).not.toBe(result.second.salt);
    expect(result.good).toBe(true); expect(result.wrong).toBe(false);
    expect(JSON.stringify(result.first)).not.toContain("spaces");
  });

  it("refuses algorithm/parameter tampering rather than choosing weaker hashes", async () => {
    const hash = await hashMemberPassword("a long enough test password", testEnv);
    await expect(verifyMemberPassword("a long enough test password", { ...hash, N: 1 } as never, testEnv)).rejects.toMatchObject({ code: "password_hash_unavailable" });
    await expect(hashMemberPassword("a long enough test password", { ...testEnv, SESSION_SECRET: undefined })).rejects.toMatchObject({ code: "member_auth_unavailable" });
  });

  it("casefolds only valid ASCII usernames and reserves owner-looking names", () => {
    expect(memberUsername("Alice_123")).toBe("alice_123");
    for (const value of ["ab", "x".repeat(25), "a-b", "a b", "123alice", "_alice", "张同学", "ＺＨＵＯ", "Admin", "OWNER", "zhuo", "zhuodashuai"]) {
      expect(() => memberUsername(value)).toThrow();
    }
  });

  it("counts Unicode code points and never trims passwords", () => {
    expect(memberPassword(" ".repeat(15))).toBe(" ".repeat(15));
    expect(memberPassword("😀".repeat(15))).toBe("😀".repeat(15));
    expect(memberPassword("密".repeat(128))).toHaveLength(128);
    for (const value of ["a".repeat(14), "😀".repeat(14), "a".repeat(129), "abcdefghijklmno\u0000", "abcdefghijklmno\n", "abcdefghijklmno\ud800", "abcdefghijklmno\udfff"]) expect(() => memberPassword(value)).toThrow();
  });

  it("uses a separate host-only Strict HttpOnly cookie", () => {
    expect(memberCookie("example")).toContain("__Host-zhuo_member=example; Path=/;");
    expect(memberCookie("example")).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(memberCookie("example")).not.toMatch(/Domain=/i);
  });

  it("rejects oversized streamed/chunked JSON without trusting Content-Length", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(MEMBER_BODY_BYTES + 1)); },
      cancel() { cancelled = true; }
    });
    await expect(readMemberJson(new Request("https://member.test", { method: "POST", body }))).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
    await expect(readMemberJson(new Request("https://member.test", { method: "POST", headers: { "Content-Length": "999999" }, body: "{}" }))).rejects.toMatchObject({ status: 413 });
    await expect(readMemberJson(new Request("https://member.test", { method: "POST", body: "[]" }))).rejects.toMatchObject({ code: "invalid_json" });
    await expect(readMemberJson(new Request("https://member.test", { method: "POST", body: "{invalid}" }))).rejects.toMatchObject({ code: "invalid_json" });
  });

  it("does not accept extra identity or role fields", () => {
    expect(() => memberFields({ username: "alice", password: "abcdefghijklmno", role: "owner" }, ["username", "password"])).toThrow();
  });

  it("serializes credential work and bounds the total running plus queued KDF tasks", async () => {
    const result = await runInDurableObject(memberAuthStub(testEnv), async (instance) => {
      const control = instance as { pendingCrypto: number; withCrypto<T>(work: () => Promise<T>): Promise<T> };
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      const order: number[] = [];
      const first = control.withCrypto(async () => { order.push(0); await barrier; return 0; });
      const later = [1, 2, 3].map(index => control.withCrypto(async () => { order.push(index); return index; }));
      let rejection = "";
      try { await control.withCrypto(async () => 4); } catch (error) { rejection = (error as { code: string }).code; }
      const waiting = control.pendingCrypto;
      release();
      await Promise.all([first, ...later]);
      return { order, waiting, rejection, after: control.pendingCrypto };
    });
    expect(result).toEqual({ order: [0, 1, 2, 3], waiting: 4, rejection: "member_auth_busy", after: 0 });
  });
});
