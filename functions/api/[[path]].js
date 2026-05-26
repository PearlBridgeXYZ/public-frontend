// CF Pages Function: proxy /api/* on pearlbridge.xyz → api.pearlbridge.xyz.
//
// Why this exists: SIWE uses a session cookie. If the relay is on a
// different origin than the SPA, Chrome treats it as a third-party cookie
// and (with 3PC blocking enabled — default for many Chrome 124+ users)
// silently drops it. Same-origin via this Function makes the cookie
// first-party — the only path that works reliably across browsers.
//
// SWR layer (added 2026-05-26 after a relay 502 incident): for a small
// whitelist of public read endpoints, this Function keeps a stale copy at
// the edge (CF Cache API). When the origin returns 5xx or fails to
// respond, we serve the last successful body with `X-SWR-Stale: 1` so
// the audit page / supply API don't go dark while the relay restarts.
// Writes, SIWE, mint/burn submit — all pass through uncached.

// Verified against relay route table 2026-05-26 — only real GET endpoints
// that are safe to share across anonymous viewers (no per-user state).
const SWR_CACHEABLE_PATHS = new Set([
  "/api/supply",
  "/api/custody",
  "/api/custody/addresses",
  "/api/stuck-deposits",
  "/api/relayers",
]);

// Fresh TTL: how long a 2xx response is considered "fresh" enough that we
// don't even check the origin. Kept short so updates propagate quickly.
const FRESH_TTL_SECS = 15;

// Stale TTL: how long we'll serve a cached body when the origin is down.
// Long enough to ride out a relay restart cycle without the audit page
// breaking, short enough that we don't keep showing wildly stale data
// during a multi-hour outage.
const STALE_TTL_SECS = 3600;

// Origin fetch timeout for cacheable GETs. If the origin is wedged we
// want to fail over to stale fast, not wait the default 30s.
const ORIGIN_TIMEOUT_MS = 6000;

function buildUpstreamUrl(reqUrl) {
  const url = new URL(reqUrl);
  url.protocol = "https:";
  url.hostname = "api.pearlbridge.xyz";
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

async function handleSWR(ctx, upstream) {
  const cache = caches.default;
  const key = cacheKeyFor(ctx.request.url);

  // Try fresh fetch with bounded timeout.
  let originResp = null;
  let originErr = null;
  try {
    originResp = await fetchWithTimeout(
      upstream.toString(),
      { method: "GET", headers: { accept: "application/json" } },
      ORIGIN_TIMEOUT_MS,
    );
  } catch (e) {
    originErr = e;
  }

  if (originResp && originResp.ok) {
    // 2xx — cache a clone, return fresh. We store with a Cache-Control
    // override so the edge keeps it for STALE_TTL_SECS independent of
    // whatever the origin said.
    const cloned = new Response(originResp.clone().body, {
      status: originResp.status,
      statusText: originResp.statusText,
      headers: originResp.headers,
    });
    cloned.headers.set(
      "cache-control",
      `public, max-age=${FRESH_TTL_SECS}, s-maxage=${STALE_TTL_SECS}`,
    );
    cloned.headers.set("x-swr-cached-at", new Date().toISOString());
    ctx.waitUntil(cache.put(key, cloned));

    const out = new Response(originResp.body, {
      status: originResp.status,
      statusText: originResp.statusText,
      headers: originResp.headers,
    });
    out.headers.set("x-swr-source", "origin");
    return out;
  }

  // Origin failed or returned 5xx. Try the cache.
  const cached = await cache.match(key);
  if (cached) {
    const out = new Response(cached.body, {
      status: 200,
      statusText: "OK",
      headers: cached.headers,
    });
    out.headers.set("x-swr-stale", "1");
    out.headers.set("x-swr-source", "cache");
    out.headers.set(
      "x-swr-origin-status",
      originResp ? String(originResp.status) : "fetch-error",
    );
    return out;
  }

  // No cache, no origin. Surface whichever error we have.
  if (originResp) {
    return originResp;
  }
  return new Response(
    JSON.stringify({
      error: "upstream unreachable",
      detail: originErr ? String(originErr) : "unknown",
    }),
    { status: 502, headers: { "content-type": "application/json" } },
  );
}

export async function onRequest(ctx) {
  const upstream = buildUpstreamUrl(ctx.request.url);
  const method = ctx.request.method;

  // Fast path: public read endpoint, GET — go through SWR.
  if (isSWRCacheable(ctx.request.url, method)) {
    return handleSWR(ctx, upstream);
  }

  // Default path: transparent proxy (writes, SIWE, mint/burn, anything
  // that needs cookies and the unmodified request).
  const headers = new Headers(ctx.request.headers);
  headers.delete("host");

  let body;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    body = await ctx.request.arrayBuffer();
  }

  let originResp;
  try {
    originResp = await fetch(upstream.toString(), { method, headers, body });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "upstream unreachable" }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(originResp.body, {
    status: originResp.status,
    statusText: originResp.statusText,
    headers: originResp.headers,
  });
}
