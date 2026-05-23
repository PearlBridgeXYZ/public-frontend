// CF Pages Function: proxy /api/* on pearlbridge.xyz → api.pearlbridge.xyz.
//
// Why this exists: SIWE uses a session cookie. If the relay is on a
// different origin than the SPA, Chrome treats it as a third-party cookie
// and (with 3PC blocking enabled — default for many Chrome 124+ users)
// silently drops it. Same-origin via this Function makes the cookie
// first-party — the only path that works reliably across browsers.
export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  url.protocol = "https:";
  url.hostname = "api.pearlbridge.xyz";
  url.port = "";

  const method = ctx.request.method;
  const headers = new Headers(ctx.request.headers);
  // Let fetch set the upstream Host header itself.
  headers.delete("host");

  // Buffer the body so we don't depend on ReadableStream duplex semantics
  // in the Workers runtime. Relay request bodies are small JSON payloads.
  let body;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    body = await ctx.request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(url.toString(), { method, headers, body });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "upstream unreachable" }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  // Forward upstream response as-is. Cookies set by the relay are now
  // attributed to pearlbridge.xyz (same-origin) — no SameSite issues.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
