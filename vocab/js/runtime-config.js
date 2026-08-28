// Set this to the deployed Cloudflare Worker origin after the one-time backend setup.
// It is a public URL, never a secret. Leave empty until the exact workers.dev URL is known.
export const OWNER_ADMIN_URL = "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/";

export function ownerAdminUrl(targetLocation = globalThis.location) {
  const hostname = targetLocation?.hostname || "";
  if (hostname && hostname !== "zhuodashuai.github.io") {
    return new URL("owner.html", targetLocation.href).href;
  }
  return OWNER_ADMIN_URL ? new URL("owner.html", OWNER_ADMIN_URL).href : "";
}
