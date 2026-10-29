import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { freshPrecisionReport } from "./browser-checks-translation-precision-0014.mjs";
import { watchAnonymousStaticContext, assertClassroomTraffic } from "./browser-checks-classroom-0009.mjs";
import { verifyFriendlyExampleSources } from "./browser-checks-friendly-example-source.mjs";
const bytes = await readFile(new URL("../../dictionary/examples/corrections/translation-precision-0014-fixture.json", import.meta.url));
expect(createHash("sha256").update(bytes).digest("hex")).toBe("0d0e769d8f68d2737becd96bf9a153f440b2cf6fe1fdcf86570cac47fa5d313c");
const fixture = JSON.parse(bytes);
test.use({ serviceWorkers: "block", storageState: { cookies: [], origins: [] } });
for (const width of [390, 1280]) test(`friendly example sources preserve five real DTOs and saved cards at ${width}px`, async ({ context }, info) => {
  const base = "http://127.0.0.1:4187/", report = { ...freshPrecisionReport(), labels: [] };
  try {
    await watchAnonymousStaticContext(context, base, report, expect);
    await verifyFriendlyExampleSources({ context, base, fixture, expect, report, width });
    assertClassroomTraffic(expect, report);
  } finally { await info.attach("friendly-source-labels.json", { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: "application/json" }); }
});
