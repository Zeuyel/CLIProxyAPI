// Deno debug probe for CPA -> Worker -> Deno chain.
// It does NOT forward upstream; it only reports what Deno actually receives.
//
// Deploy this file to Deno, point reverse-proxies[].base-url to this debug service,
// keep reverse-proxy-worker-url pointing to your Worker, then send one real request.
// The response JSON will show incoming headers/body and computed forward headers.

const apiMapping = {
  "/antigravity-sandbox": "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "/antigravity-daily": "https://daily-cloudcode-pa.googleapis.com",
  "/antigravity-cloudcode": "https://cloudcode-pa.googleapis.com",
  "/codex": "https://chatgpt.com",
  "/openai": "https://api.openai.com",
};

const FORWARD_ALLOW_HEADERS = [
  "accept",
  "content-type",
  "authorization",
  "user-agent",
  "x-goog-api-client",
  "x-goog-api-key",
  "openai-organization",
  "openai-project",
];

const HOP_BY_HOP_HEADERS = new Set([
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-forwarded-host",
  "x-real-ip",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function normalizePath(pathname, prefixes) {
  if (pathname.startsWith("/functions/v1/")) {
    const rest = pathname.replace(/^\/functions\/v1\/[^/]+/, "");
    return rest === "" ? "/" : rest;
  }
  if (prefixes.some((p) => pathname.startsWith(p))) {
    return pathname;
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 1) {
    const rest = "/" + parts.slice(1).join("/");
    if (rest === "/" || prefixes.some((p) => rest.startsWith(p))) {
      return rest;
    }
  }
  if (parts.length === 1) {
    return "/";
  }
  return pathname;
}

function extractPrefixAndRest(pathname, prefixes) {
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      return [prefix, pathname.slice(prefix.length) || "/"];
    }
  }
  return [null, null];
}

function stripProxyInjectedHeaders(headers) {
  for (const [key] of headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith("cf-") ||
      lower === "cdn-loop" ||
      lower === "true-client-ip" ||
      lower.startsWith("x-forwarded-")
    ) {
      headers.delete(key);
    }
  }
}

function headersToObject(headers) {
  const out = {};
  const pairs = [];
  for (const [k, v] of headers.entries()) {
    pairs.push([k, v]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [k, v] of pairs) {
    out[k] = v;
  }
  return out;
}

function maskHeaderValue(name, value) {
  const key = (name || "").toLowerCase();
  if (key === "authorization") {
    const raw = String(value || "");
    const parts = raw.split(" ");
    if (parts.length >= 2) {
      const scheme = parts[0];
      const token = parts.slice(1).join(" ");
      if (token.length <= 10) return scheme + " ***";
      return scheme + " " + token.slice(0, 6) + "..." + token.slice(-4);
    }
    if (raw.length <= 10) return "***";
    return raw.slice(0, 6) + "..." + raw.slice(-4);
  }
  if (key.includes("token") || key.includes("api-key") || key.includes("apikey")) {
    const raw = String(value || "");
    if (raw.length <= 10) return "***";
    return raw.slice(0, 4) + "..." + raw.slice(-3);
  }
  return value;
}

function redactHeaders(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = maskHeaderValue(k, v);
  }
  return out;
}

function diffRemovedHeaders(before, after) {
  const removed = [];
  for (const key of Object.keys(before)) {
    const found = Object.prototype.hasOwnProperty.call(after, key);
    if (!found) {
      removed.push(key);
    }
  }
  removed.sort();
  return removed;
}

function computeForwardHeaders(requestHeaders, prefix, targetHost) {
  let headers;
  if (prefix === "/codex") {
    headers = new Headers(requestHeaders);
  } else {
    headers = new Headers();
    for (const [key, value] of requestHeaders.entries()) {
      if (FORWARD_ALLOW_HEADERS.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
  }

  const before = headersToObject(headers);

  for (const [key] of headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.delete(key);
    }
  }
  stripProxyInjectedHeaders(headers);

  if (targetHost) {
    headers.set("Host", targetHost);
  }
  if (!headers.has("User-Agent") && !headers.has("user-agent")) {
    headers.set("User-Agent", "antigravity/1.104.0");
  }

  const after = headersToObject(headers);
  return {
    beforeClean: before,
    afterClean: after,
    removedByCleaning: diffRemovedHeaders(before, after),
  };
}

function toHex(uint8) {
  return Array.from(uint8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data) {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(hash));
}

function formatBodyForLog(contentType, bytes) {
  if (!bytes || bytes.length === 0) {
    return "(empty body)";
  }
  const maxLogBytes = 64 * 1024;
  const limited = bytes.length > maxLogBytes ? bytes.subarray(0, maxLogBytes) : bytes;
  const truncated = bytes.length > maxLogBytes;
  const ct = (contentType || "").toLowerCase();
  const textLike =
    ct.includes("application/json") ||
    ct.includes("text/") ||
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("application/xml");
  if (textLike) {
    let out = new TextDecoder().decode(limited);
    if (truncated) {
      out += `\n...(truncated, total bytes=${bytes.length})`;
    }
    return out;
  }
  let binary = "";
  for (let i = 0; i < limited.length; i++) {
    binary += String.fromCharCode(limited[i]);
  }
  let out = "(binary body, base64)\n" + btoa(binary);
  if (truncated) {
    out += `\n...(truncated, total bytes=${bytes.length})`;
  }
  return out;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const rawPathname = url.pathname;
  const normalizedPath = normalizePath(rawPathname, Object.keys(apiMapping));
  const [prefix, rest] = extractPrefixAndRest(normalizedPath, Object.keys(apiMapping));
  const targetBase = prefix ? apiMapping[prefix] : "";
  const targetHost = targetBase ? new URL(targetBase).host : "";

  const contentType = request.headers.get("content-type") || "";
  const bodyRaw = await request.arrayBuffer();
  const bodyBytes = new Uint8Array(bodyRaw);
  const bodyHash = await sha256Hex(bodyRaw);
  const bodyLog = formatBodyForLog(contentType, bodyBytes);

  const forward = computeForwardHeaders(request.headers, prefix, targetHost);

  console.log("[debug-proxy] incoming request", {
    method: request.method,
    path: rawPathname,
    normalizedPath,
    contentType,
    bodyBytes: bodyBytes.length,
    bodySha256: bodyHash,
  });
  console.log("[debug-proxy] request body start");
  console.log(bodyLog);
  console.log("[debug-proxy] request body end");

  const report = {
    message: "Deno debug probe: incoming request captured",
    timestamp: new Date().toISOString(),
    request: {
      method: request.method,
      url: request.url,
      rawPathname,
      normalizedPath,
      query: Object.fromEntries(url.searchParams.entries()),
      contentType,
      contentLengthHeader: request.headers.get("content-length") || "",
      bodyBytes: bodyBytes.length,
      bodySha256: bodyHash,
    },
    routing: {
      prefixMatched: prefix,
      restPath: rest,
      mappedTargetBase: targetBase,
      mappedTargetHost: targetHost,
    },
    headers: {
      receivedAtDeno: headersToObject(request.headers),
      wouldForwardBeforeClean: forward.beforeClean,
      wouldForwardAfterClean: forward.afterClean,
      removedByCleaning: forward.removedByCleaning,
    },
  };

  console.log("[debug-proxy] headers.receivedAtDeno", redactHeaders(report.headers.receivedAtDeno));
  console.log("[debug-proxy] headers.wouldForwardBeforeClean", redactHeaders(report.headers.wouldForwardBeforeClean));
  console.log("[debug-proxy] headers.wouldForwardAfterClean", redactHeaders(report.headers.wouldForwardAfterClean));
  console.log("[debug-proxy] headers.removedByCleaning", report.headers.removedByCleaning);

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
});
