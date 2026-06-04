import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";

function clientIp(request: NextRequest): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

function makeLimiter(
  prefix: string,
  requests: number,
  window: `${number} m` | `${number} s`
): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const redis = new Redis({ url, token });
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(requests, window),
      prefix,
      analytics: true,
    });
  } catch (e) {
    console.warn("[rate-limit] Upstash init failed:", e);
    return null;
  }
}

const loginLimiter = makeLimiter("rl:login", 5, "1 m");
const registerLimiter = makeLimiter("rl:register", 5, "1 m");
const syncApiLimiter = makeLimiter("rl:sync-api", 60, "1 m");
const offlineQueueLimiter = makeLimiter("rl:offline-queue", 40, "1 m");
const evaluateLimiter = makeLimiter("rl:evaluate", 30, "1 m");

export async function limitOrPass(
  limiter: Ratelimit | null,
  request: NextRequest,
  keySuffix: string
): Promise<{ ok: true } | { ok: false }> {
  if (!limiter) return { ok: true };
  const id = `${clientIp(request)}:${keySuffix}`;
  const { success } = await limiter.limit(id);
  return success ? { ok: true } : { ok: false };
}

export function getClientIp(request: NextRequest): string {
  return clientIp(request);
}

export { loginLimiter, registerLimiter, syncApiLimiter, offlineQueueLimiter, evaluateLimiter };
