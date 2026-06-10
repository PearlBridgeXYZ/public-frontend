// CF Pages Function: proxy /api/* on pearlbridge.xyz → primary relay,
// with automatic failover to EU hot-standby + SWR edge cache.
//
// Why same-origin proxy: SIWE uses a session cookie. If the relay is on a
// different origin than the SPA, Chrome treats it as a third-party cookie
// and (with 3PC blocking enabled — default for many Chrome 124+ users)
// silently drops it. Same-origin via this Function makes the cookie
// first-party — the only path that works reliably across browsers.
//
// Failover tiers (added 2026-05-26 after relay 502 incident):
//   1. PRIMARY = api.pearlbridge.xyz (active)
//   2. EU      = api-eu.pearlbridge.xyz (passive hot-standby)
//   3. CACHE   = CF edge SWR (whitelisted public GETs only)
//
// Reads (whitelist): try PRIMARY → EU → cache, return whichever responds 2xx.
// Writes (everything else): try PRIMARY → EU, surface 502 if both down.
//
// User-initiated POSTs (SIWE, intents) never trigger on-chain broadcasts on
// the relay directly — broadcasts come from on-chain watchers — so it is
// safe to route a write to the EU passive relay. The passive flag only
// gates the broadcast paths inside the watcher pipeline.

// Verified against relay route table 2026-05-26 — only real GET endpoints
// that are safe to share across anonymous viewers (no per-user state).
//
// burn-status / mint-status added 2026-06-10: per-tx public lookups keyed
// by the query string (the cache key includes the full URL, so distinct
// hashes never collide). They carry no per-user state — anyone with the
// tx hash sees the same answer. Caching them means the unwrap/mint status
// pages degrade to last-known-state instead of 502 when the relay origin
// is unreachable.
const SWR_CACHEABLE_PATHS = new Set([
  "/api/supply",
  "/api/custody",
  "/api/custody/addresses",
  "/api/stuck-deposits",
  "/api/relayers",
  "/api/burn-status",
  "/api/mint-status",
]);

const PRIMARY_HOST = "api.pearlbridge.xyz";
const EU_HOST = "api-eu.pearlbridge.xyz";

// Fresh TTL: how long a 2xx response is considered "fresh" enough that we
// don't even check the origin. Kept short so updates propagate quickly.
const FRESH_TTL_SECS = 15;

// Stale TTL: how long we'll serve a cached body when both origins are down.
// Long enough to ride out a relay restart cycle without the audit page
// breaking, short enough that we don't keep showing wildly stale data
// during a multi-hour outage.
const STALE_TTL_SECS = 3600;

// Origin fetch timeout. If an origin is wedged we want to fail over fast.
const ORIGIN_TIMEOUT_MS = 6000;

function buildUpstreamUrl(reqUrl, host) {
  const url = new URL(reqUrl);
  url.protocol = "https:";
  url.hostname = host;
  url.port = "";
  return url;
}

async function fetchWithTimeout(url, init, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isSWRCacheable(reqUrl, method) {
  if (method !== "GET") return false;
  const path = new URL(reqUrl).pathname;
  return SWR_CACHEABLE_PATHS.has(path);
}

// Cache key strips Cookie / Authorization so SWR is shared across all
// anonymous viewers. These endpoints are public-by-design.
function cacheKeyFor(reqUrl) {
  return new Request(reqUrl, { method: "GET" });
}

// Try an origin host. Returns the Response if it answers 2xx/3xx/4xx
// (anything that means the origin is up and gave us a real answer);
// returns null if it 5xx'd or threw (so the caller can try the next tier).
async function tryOrigin(reqUrl, host, init, timeoutMs) {
  const upstream = buildUpstreamUrl(reqUrl, host);
  try {
    const resp = await fetchWithTimeout(upstream.toString(), init, timeoutMs);
    // Treat 5xx as "origin failed" so we fail over. 4xx is a real answer
    // (auth, validation, etc.) — pass that straight through.
    if (resp.status >= 500) return null;
    return resp;
  } catch (_e) {
    return null;
  }
}

async function handleSWR(ctx) {
  const cache = caches.default;
  const key = cacheKeyFor(ctx.request.url);
  const init = { method: "GET", headers: { accept: "application/json" } };

  // Try PRIMARY first.
  let resp = await tryOrigin(ctx.request.url, PRIMARY_HOST, init, ORIGIN_TIMEOUT_MS);
  let source = "primary";

  // Fall over to EU.
  if (!resp) {
    resp = await tryOrigin(ctx.request.url, EU_HOST, init, ORIGIN_TIMEOUT_MS);
    if (resp) source = "eu";
  }

  if (resp && resp.ok) {
    // 2xx — cache a clone, return fresh. We store with a Cache-Control
    // override so the edge keeps it for STALE_TTL_SECS independent of
    // whatever the origin said.
    const cloned = new Response(resp.clone().body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
    cloned.headers.set(
      "cache-control",
      `public, max-age=${FRESH_TTL_SECS}, s-maxage=${STALE_TTL_SECS}`,
    );
    // The cache is shared across anonymous viewers — never let a session
    // cookie ride along into it, even if an origin misbehaves one day.
    cloned.headers.delete("set-cookie");
    cloned.headers.set("x-swr-cached-at", new Date().toISOString());
    ctx.waitUntil(cache.put(key, cloned));

    const out = new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
    out.headers.set("x-swr-source", source);
    return out;
  }

  // Both origins down or returned non-2xx. Try the cache.
  const cached = await cache.match(key);
  if (cached) {
    const out = new Response(cached.body, {
      status: 200,
      statusText: "OK",
      headers: cached.headers,
    });
    out.headers.set("x-swr-stale", "1");
    out.headers.set("x-swr-source", "cache");
    return out;
  }

  // No cache, no origin. Surface whatever the last origin gave us, or 502.
  if (resp) return resp;
  return new Response(
    JSON.stringify({ error: "upstream unreachable", primary: PRIMARY_HOST, eu: EU_HOST }),
    { status: 502, headers: { "content-type": "application/json" } },
  );
}

async function proxyWithFailover(ctx) {
  // Pass-through proxy for non-cacheable traffic (SIWE, mint/burn intents,
  // any write that needs cookies + original headers + body). PRIMARY → EU.
  const method = ctx.request.method;
  const headers = new Headers(ctx.request.headers);
  headers.delete("host");

  let body;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    body = await ctx.request.arrayBuffer();
  }

  const init = { method, headers, body };

  let resp = await tryOrigin(ctx.request.url, PRIMARY_HOST, init, ORIGIN_TIMEOUT_MS);
  if (!resp) {
    resp = await tryOrigin(ctx.request.url, EU_HOST, init, ORIGIN_TIMEOUT_MS);
    if (resp) {
      // Surface that we failed over so the frontend / client can log it.
      // Doesn't change the body — just adds a header.
      const out = new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
      });
      out.headers.set("x-failover", "eu");
      return out;
    }
  }

  if (resp) return resp;
  return new Response(
    JSON.stringify({ error: "upstream unreachable", primary: PRIMARY_HOST, eu: EU_HOST }),
    { status: 502, headers: { "content-type": "application/json" } },
  );
}

export async function onRequest(ctx) {
  if (isSWRCacheable(ctx.request.url, ctx.request.method)) {
    return handleSWR(ctx);
  }
  return proxyWithFailover(ctx);
}
