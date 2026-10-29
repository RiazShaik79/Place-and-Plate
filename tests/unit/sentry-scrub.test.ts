import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { scrubBreadcrumb, scrubEvent, scrubText } from "@/lib/sentry-scrub";

describe("sentry-scrub", () => {
  test("text: emails, token params, database URLs and PEM blocks are masked", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nMIIabc\n-----END CERTIFICATE-----";
    const out = scrubText(`user ana@example.com /reset-password?token=abc123&x=1 mysql://u:p@db.host:3306/app ${pem}`);
    assert.ok(!out.includes("ana@example.com"));
    assert.ok(!out.includes("abc123"));
    assert.ok(!out.includes("u:p@db.host"));
    assert.ok(!out.includes("MIIabc"));
    assert.match(out, /\[email\]/);
    assert.match(out, /token=\[redacted\]&x=1/);
    assert.match(out, /mysql:\/\/\[redacted\]/);
  });

  test("events lose cookies, bodies, secret headers and user email", () => {
    const event = scrubEvent({
      message: "failed for bo@example.com",
      user: { id: "7", email: "bo@example.com", ip_address: "1.2.3.4" },
      request: {
        cookies: { ct_session: "s" },
        data: { password: "hunter2" },
        headers: { Cookie: "ct_session=s", Authorization: "Bearer t", "x-debug-token": "d", "user-agent": "ua" },
        url: "https://app/verify-email?token=zzz",
      },
      exception: { values: [{ value: "Duplicate entry 'bo@example.com'" }] },
    });
    assert.equal(event.request?.cookies, undefined);
    assert.equal(event.request?.data, undefined);
    assert.deepEqual(event.request?.headers, { "user-agent": "ua" });
    assert.equal(event.request?.url, "https://app/verify-email?token=[redacted]");
    assert.deepEqual(event.user, { id: "7" });
    assert.equal(event.message, "failed for [email]");
    assert.equal(event.exception?.values?.[0].value, "Duplicate entry '[email]'");
  });

  test("the console mailer's breadcrumbs are dropped; others are masked", () => {
    assert.equal(scrubBreadcrumb({ category: "console", message: "\n----\nEMAIL to a@example.com\nSubject: Reset" }), null);
    assert.equal(scrubBreadcrumb({ category: "console", message: "hi c@example.com" })?.message, "hi [email]");
    const event = scrubEvent({ breadcrumbs: [{ category: "console", message: "EMAIL to x@example.com" }, { category: "fetch", data: { url: "/api?token=1" } }] });
    assert.equal(event.breadcrumbs?.length, 1);
    assert.equal(event.breadcrumbs?.[0].data?.url, "/api?token=[redacted]");
  });
});
