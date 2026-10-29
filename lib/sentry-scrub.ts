// What the app sends to Sentry, minus personal data and secrets. Pure functions (no Sentry import),
// used by beforeSend / beforeBreadcrumb in the Sentry configs and covered by tests/unit.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TOKEN_PARAM_RE = /([?&](?:token|code|key|password|secret)=)[^&\s"']+/gi;
const DB_URL_RE = /\b(mysql|postgres(?:ql)?|redis):\/\/[^\s"']+/gi;
const PEM_RE = /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g;
const SECRET_HEADERS = new Set(["cookie", "authorization", "x-debug-token", "x-chaos-token"]);

/** Sentry `dataCollection` for every runtime: no user info, cookies, bodies or secret headers. */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpBodies: [],
  httpHeaders: { request: { deny: [...SECRET_HEADERS] }, response: false },
};

/** Mask emails, token-like query values, database URLs and PEM blocks in free text. */
export function scrubText(text: string): string {
  return text
    .replace(PEM_RE, "[pem]")
    .replace(DB_URL_RE, "$1://[redacted]")
    .replace(TOKEN_PARAM_RE, "$1[redacted]")
    .replace(EMAIL_RE, "[email]");
}

interface EventLike {
  message?: string;
  user?: Record<string, unknown>;
  request?: { cookies?: unknown; headers?: Record<string, unknown>; query_string?: unknown; url?: string; data?: unknown };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: BreadcrumbLike[];
}

interface BreadcrumbLike {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/** Remove cookies, auth headers, user emails and secrets from an event. Mutates and returns it. */
export function scrubEvent<T extends EventLike>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data; // request bodies can hold passwords
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (SECRET_HEADERS.has(name.toLowerCase())) delete event.request.headers[name];
      }
    }
    if (typeof event.request.query_string === "string") event.request.query_string = scrubText(event.request.query_string);
    if (event.request.url) event.request.url = scrubText(event.request.url);
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrubText(ex.value);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter((b): b is BreadcrumbLike => b !== null);
  }
  return event;
}

/** Drop the console mailer's output (it prints reset and verification links); mask the rest. */
export function scrubBreadcrumb<T extends BreadcrumbLike>(crumb: T): T | null {
  if (crumb.category === "console" && crumb.message?.includes("EMAIL to")) return null;
  if (crumb.message) crumb.message = scrubText(crumb.message);
  if (crumb.data && typeof crumb.data.url === "string") crumb.data.url = scrubText(crumb.data.url);
  return crumb;
}
