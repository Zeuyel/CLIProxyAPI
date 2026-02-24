const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "x-worker-token",
]);

const DEFAULT_ALLOWED_SUFFIXES = [".deno.net", ".deno.dev"];
const HOSTNAME_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i;

function joinPath(basePath, reqPath) {
  const left = (basePath || "/").replace(/\/+$/, "");
  const right = (reqPath || "/").replace(/^\/+/, "");
  if (!right) {
    return left || "/";
  }
  return (left ? left + "/" : "/") + right;
}

function getWorkerAuthToken(request) {
  const xToken = request.headers.get("x-worker-token");
  return xToken ? xToken.trim() : "";
}

function sanitizeRequestHeaders(incomingHeaders) {
  const headers = new Headers(incomingHeaders);
  for (const [key] of headers.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || lower.startsWith("cf-")) {
      headers.delete(key);
    }
  }
  return headers;
}

function sanitizeResponseHeaders(incomingHeaders) {
  const headers = new Headers(incomingHeaders);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return headers;
}

function ensureCodexBrowserHeaders(headers) {
  if (!headers.has("accept-language")) {
    headers.set("accept-language", "en-US,en;q=0.9");
  }
  if (!headers.has("sec-fetch-site")) {
    headers.set("sec-fetch-site", "same-origin");
  }
  if (!headers.has("sec-fetch-mode")) {
    headers.set("sec-fetch-mode", "cors");
  }
  if (!headers.has("sec-fetch-dest")) {
    headers.set("sec-fetch-dest", "empty");
  }
  if (!headers.has("sec-ch-ua")) {
    headers.set("sec-ch-ua", "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\"");
  }
  if (!headers.has("sec-ch-ua-mobile")) {
    headers.set("sec-ch-ua-mobile", "?0");
  }
  if (!headers.has("sec-ch-ua-platform")) {
    headers.set("sec-ch-ua-platform", "\"Windows\"");
  }
  if (!headers.has("origin")) {
    headers.set("origin", "https://chatgpt.com");
  }
  if (!headers.has("referer")) {
    headers.set("referer", "https://chatgpt.com/");
  }
}

function normalizeAllowedSuffixes(raw) {
  const source = (raw || "").trim();
  const list = source ? source.split(",") : DEFAULT_ALLOWED_SUFFIXES;
  const normalized = [];
  for (const item of list) {
    const v = item.trim().toLowerCase();
    if (!v) continue;
    normalized.push(v.startsWith(".") ? v : "." + v);
  }
  return normalized.length > 0 ? normalized : DEFAULT_ALLOWED_SUFFIXES;
}

function isAllowedDenoHost(hostname, allowedSuffixes) {
  const host = (hostname || "").trim().toLowerCase();
  if (!host || !HOSTNAME_RE.test(host)) return false;
  if (host.includes("..")) return false;
  return allowedSuffixes.some((suffix) => host.endsWith(suffix));
}

function parseUpstreamCandidate(rawCandidate, allowedSuffixes) {
  const candidate = decodeURIComponent((rawCandidate || "").trim());
  if (!candidate) return null;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    parsed = null;
  }

  if (parsed) {
    if (parsed.protocol !== "https:") return null;
    if (!isAllowedDenoHost(parsed.hostname, allowedSuffixes)) return null;
    return parsed;
  }

  if (!isAllowedDenoHost(candidate, allowedSuffixes)) return null;
  return new URL("https://" + candidate);
}

function buildDynamicRouting(reqUrl, allowedSuffixes) {
  const upstreamFromQuery = reqUrl.searchParams.get("upstream");
  if (upstreamFromQuery) {
    const upstreamUrl = parseUpstreamCandidate(upstreamFromQuery, allowedSuffixes);
    if (!upstreamUrl) {
      return { error: "invalid upstream query value; only allowed deno hosts are accepted" };
    }
    const query = new URLSearchParams(reqUrl.searchParams);
    query.delete("upstream");
    return {
      upstreamUrl,
      forwardPath: reqUrl.pathname || "/",
      forwardQuery: query.toString(),
      mode: "query",
    };
  }

  const parts = reqUrl.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const upstreamUrl = parseUpstreamCandidate(parts[parts.length - 1], allowedSuffixes);
  if (!upstreamUrl) return null;

  const stripped = "/" + parts.slice(0, -1).join("/");
  return {
    upstreamUrl,
    forwardPath: stripped === "/" || stripped === "" ? "/" : stripped,
    forwardQuery: reqUrl.searchParams.toString(),
    mode: "path",
  };
}

function resolveRouting(reqUrl, env, allowedSuffixes) {
  const dynamic = buildDynamicRouting(reqUrl, allowedSuffixes);
  if (dynamic && dynamic.error) {
    return dynamic;
  }
  if (dynamic) {
    return dynamic;
  }

  const upstreamRaw = (env.UPSTREAM_BASE_URL || "").trim();
  if (!upstreamRaw) {
    return {
      error: "no upstream found; use /<path>/<deno-host> or ?upstream=<deno-host>",
    };
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(upstreamRaw);
  } catch {
    return { error: "UPSTREAM_BASE_URL is invalid" };
  }
  if (upstreamUrl.protocol !== "https:") {
    return { error: "UPSTREAM_BASE_URL must use https" };
  }

  return {
    upstreamUrl,
    forwardPath: reqUrl.pathname || "/",
    forwardQuery: reqUrl.searchParams.toString(),
    mode: "fixed",
  };
}

export default {
  async fetch(request, env) {
    const requiredToken = (env.WORKER_AUTH_TOKEN || "").trim();
    if (requiredToken) {
      const gotToken = getWorkerAuthToken(request);
      if (gotToken !== requiredToken) {
        return new Response(
          JSON.stringify({ error: "unauthorized: missing or invalid x-worker-token" }),
          { status: 401, headers: { "content-type": "application/json; charset=utf-8" } },
        );
      }
    }

    const reqUrl = new URL(request.url);
    const allowedSuffixes = normalizeAllowedSuffixes(env.ALLOWED_UPSTREAM_SUFFIXES);
    const routing = resolveRouting(reqUrl, env, allowedSuffixes);
    if (routing.error) {
      return new Response(
        JSON.stringify({ error: routing.error, allowed_suffixes: allowedSuffixes }, null, 2),
        { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }

    const upstreamUrl = routing.upstreamUrl;
    const targetUrl = new URL(upstreamUrl.toString());
    targetUrl.pathname = joinPath(upstreamUrl.pathname, routing.forwardPath);
    targetUrl.search = routing.forwardQuery ? "?" + routing.forwardQuery : "";

    const headers = sanitizeRequestHeaders(request.headers);
    if (routing.forwardPath.startsWith("/codex/") || routing.forwardPath === "/codex") {
      ensureCodexBrowserHeaders(headers);
    }
    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    const upstreamRes = await fetch(targetUrl.toString(), init);
    const responseHeaders = sanitizeResponseHeaders(upstreamRes.headers);
    responseHeaders.set("x-worker-upstream", upstreamUrl.host);
    responseHeaders.set("x-worker-routing-mode", routing.mode);
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  },
};
