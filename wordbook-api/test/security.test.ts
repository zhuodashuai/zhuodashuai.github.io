import { describe, expect, it } from "vitest";
import {
  ApiError,
  assertSameOriginWrite,
  clearOauthStateCookie,
  decryptSecret,
  encryptSecret,
  oauthStateCookie,
  readJsonBody,
  sessionCookie,
  signedCookieValue,
  verifySignedCookie
} from "../src/security";

const SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("security helpers", () => {
  it("encrypts GitHub tokens with authenticated encryption", async () => {
    const cipher = await encryptSecret("github-token-value", SECRET);
    expect(cipher).not.toContain("github-token-value");
    expect(await decryptSecret(cipher, SECRET)).toBe("github-token-value");
    const tampered = `${cipher[0] === "A" ? "B" : "A"}${cipher.slice(1)}`;
    await expect(decryptSecret(tampered, SECRET)).rejects.toBeInstanceOf(ApiError);
  });

  it("signs and verifies the OAuth transaction cookie", async () => {
    const signed = await signedCookieValue("oauth-state", SECRET);
    expect(await verifySignedCookie(signed, "oauth-state", SECRET)).toBe(true);
    expect(await verifySignedCookie(signed, "other-state", SECRET)).toBe(false);
  });

  it("uses __Host cookies with Secure, HttpOnly, SameSite and Path=/", () => {
    expect(oauthStateCookie("value", 600)).toContain("__Host-zhuo_oauth=value; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax");
    expect(sessionCookie("value", 3600)).toContain("__Host-zhuo_session=value; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax");
    expect(clearOauthStateCookie()).toContain("Path=/; Max-Age=0");
  });

  it("rejects cross-origin and simple-content-type write requests", () => {
    expect(() => assertSameOriginWrite(new Request("https://admin.example/api", {
      method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }
    }))).toThrow(/同源/);
    expect(() => assertSameOriginWrite(new Request("https://admin.example/api", {
      method: "POST", headers: { Origin: "https://admin.example", "Content-Type": "text/plain" }
    }))).toThrow(/application\/json/);
    expect(assertSameOriginWrite(new Request("https://admin.example/api", {
      method: "POST", headers: { Origin: "https://admin.example", "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }
    }))).toBe("https://admin.example");
  });

  it("enforces JSON body size and syntax", async () => {
    await expect(readJsonBody(new Request("https://example.test", { method: "POST", body: "not-json" }))).rejects.toMatchObject({ code: "invalid_json" });
    await expect(readJsonBody(new Request("https://example.test", { method: "POST", body: JSON.stringify({ data: "x".repeat(200) }) }), 20)).rejects.toMatchObject({ code: "payload_too_large" });
  });
});
