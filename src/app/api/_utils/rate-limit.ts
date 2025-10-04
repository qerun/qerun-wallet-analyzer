import { NextRequest, NextResponse } from "next/server";

const DEFAULT_LIMIT = Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "60", 10);
const DEFAULT_WINDOW_MS = Number.parseInt(
  process.env.RATE_LIMIT_WINDOW_MS ?? `${60_000}`,
  10,
);

const buckets = new Map<string, { count: number; expiresAt: number }>();

function getClientIdentifier(request: NextRequest, fallback?: string) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) {
      return ip;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return fallback ?? "unknown";
}

export type RateLimitOptions = {
  limit?: number;
  windowMs?: number;
  scope?: string;
  identifier?: string;
};

export function applyRateLimit(
  request: NextRequest,
  options: RateLimitOptions = {},
): { ok: boolean; responseHeaders: Headers; limit: number; remaining: number } {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  const identifier = options.identifier ?? getClientIdentifier(request);
  const scope = options.scope ?? "global";
  const key = `${scope}:${identifier}`;

  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
  } else {
    bucket.count += 1;
  }

  const current = buckets.get(key)!;
  const remaining = Math.max(0, limit - current.count);

  const headers = new Headers();
  headers.set("X-RateLimit-Limit", `${limit}`);
  headers.set("X-RateLimit-Remaining", `${Math.max(0, remaining)}`);
  headers.set("X-RateLimit-Reset", `${Math.ceil(current.expiresAt / 1000)}`);

  if (current.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.expiresAt - now) / 1000));
    headers.set("Retry-After", `${retryAfterSeconds}`);
    return { ok: false, responseHeaders: headers, limit, remaining: 0 };
  }

  return { ok: true, responseHeaders: headers, limit, remaining };
}

export function denyRateLimit(message: string, headers: Headers) {
  return NextResponse.json({ error: message }, { status: 429, headers });
}
