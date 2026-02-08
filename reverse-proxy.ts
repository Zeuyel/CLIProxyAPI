// Deno reverse proxy server (Deno Deploy + Supabase Edge compatible)
const apiMapping: Record<string, string> = {
  '/antigravity-sandbox': 'https://daily-cloudcode-pa.sandbox.googleapis.com',
  '/antigravity-daily': 'https://daily-cloudcode-pa.googleapis.com',
  '/antigravity-cloudcode': 'https://cloudcode-pa.googleapis.com',
  '/codex': 'https://chatgpt.com',
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
};

async function fetchWithRetry(url: string, options: RequestInit, requestId: string) {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    // Check if already aborted before attempting
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      const response = await fetch(url, options);

      if (response.status >= 500 && response.status < 600 && attempt < RETRY_CONFIG.maxRetries) {
        const errorText = await response.text();
        console.warn(
          `[${requestId}] Attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1} failed with ${response.status}, will retry. Error: ${errorText.substring(0, 200)}`
        );

        const delayMs = Math.min(
          RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
          RETRY_CONFIG.maxDelayMs
        );

        console.log(`[${requestId}] Waiting ${delayMs}ms before retry ${attempt + 2}/${RETRY_CONFIG.maxRetries + 1}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (attempt > 0) {
        console.log(`[${requestId}] Request succeeded on attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}`);
      }
      return response;
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted (client disconnected)
      if (lastError.name === 'AbortError') {
        throw lastError;
      }

      if (attempt < RETRY_CONFIG.maxRetries) {
        console.warn(
          `[${requestId}] Attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1} failed with error: ${lastError.message}, will retry`
        );
        const delayMs = Math.min(
          RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
          RETRY_CONFIG.maxDelayMs
        );
        console.log(`[${requestId}] Waiting ${delayMs}ms before retry ${attempt + 2}/${RETRY_CONFIG.maxRetries + 1}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      console.error(
        `[${requestId}] All ${RETRY_CONFIG.maxRetries + 1} attempts failed. Last error: ${lastError.message}`
      );
      throw lastError;
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

// Normalize path for both Deno Deploy and Supabase Edge Functions
function normalizePath(pathname: string, prefixes: string[]) {
  // Case 1: /functions/v1/<fn>/...
  if (pathname.startsWith('/functions/v1/')) {
    const rest = pathname.replace(/^\/functions\/v1\/[^/]+/, '');
    return rest === '' ? '/' : rest;
  }

  // Case 2: already a valid prefix
  if (prefixes.some((p) => pathname.startsWith(p))) {
    return pathname;
  }

  // Case 3: Supabase may pass /<fn>/... (function name kept)
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 1) {
    const rest = '/' + parts.slice(1).join('/');
    if (rest === '/' || prefixes.some((p) => rest.startsWith(p))) {
      return rest;
    }
  }

  // If only /<fn> with no extra path, treat as root
  if (parts.length === 1) {
    return '/';
  }

  return pathname;
}

function extractPrefixAndRest(pathname: string, prefixes: string[]) {
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      return [prefix, pathname.slice(prefix.length) || '/'] as const;
    }
  }
  return [null, null] as const;
}

Deno.serve(async (request) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);
  const url = new URL(request.url);
  const rawPathname = url.pathname;
  const pathname = normalizePath(rawPathname, Object.keys(apiMapping));

  console.log(`[${requestId}] ${request.method} ${rawPathname}${url.search}`);

  // Create abort controller linked to client's signal
  const abortController = new AbortController();
  const clientSignal = request.signal;

  // Abort our fetch if client disconnects
  const onAbort = () => {
    console.log(`[${requestId}] Client disconnected`);
    abortController.abort();
  };
  clientSignal.addEventListener('abort', onAbort);

  const cleanup = () => {
    clientSignal.removeEventListener('abort', onAbort);
  };

  if (pathname === '/' || pathname === '' || pathname === '/index.html') {
    cleanup();
    return new Response(JSON.stringify({ message: 'Deno Reverse Proxy', mappings: apiMapping }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (pathname === '/robots.txt') {
    cleanup();
    return new Response('User-agent: *\nDisallow: /', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  const [prefix, rest] = extractPrefixAndRest(pathname, Object.keys(apiMapping));
  if (!prefix) {
    cleanup();
    console.log(`[${requestId}] 404 No matching prefix`);
    return new Response('Not Found', { status: 404 });
  }

  const targetBase = apiMapping[prefix];
  const targetHost = new URL(targetBase).host;
  let forwardPath = rest;
  if (forwardPath === `/${targetHost}`) {
    forwardPath = '/';
  } else if (forwardPath.startsWith(`/${targetHost}/`)) {
    forwardPath = forwardPath.slice(targetHost.length + 1);
  }
  const targetUrl = `${targetBase}${forwardPath}${url.search}`;
  console.log(`[${requestId}] -> ${targetUrl}`);

  try {
    let headers: Headers;
    if (prefix === '/codex') {
      headers = new Headers(request.headers);
    } else {
      headers = new Headers();
      const forwardHeaders = [
        'accept',
        'content-type',
        'authorization',
        'user-agent',
        'x-goog-api-client',
        'x-goog-api-key',
      ];
      for (const [key, value] of request.headers.entries()) {
        if (forwardHeaders.includes(key.toLowerCase())) {
          headers.set(key, value);
        }
      }
    }
    headers.delete('x-forwarded-for');
    headers.delete('x-forwarded-proto');
    headers.delete('x-forwarded-host');
    headers.delete('x-real-ip');
    headers.delete('connection');
    headers.delete('keep-alive');
    headers.delete('proxy-authenticate');
    headers.delete('proxy-authorization');
    headers.delete('te');
    headers.delete('trailer');
    headers.delete('transfer-encoding');
    headers.delete('upgrade');
    headers.set('Host', targetHost);
    if (!headers.has('User-Agent') && !headers.has('user-agent')) {
      headers.set('User-Agent', 'antigravity/1.104.0');
    }

    const fetchOptions: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      redirect: 'manual',
      signal: abortController.signal,
    };
    if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOptions.body = request.body;
      fetchOptions.duplex = 'half';
    }

    const response = await fetchWithRetry(targetUrl, fetchOptions, requestId);
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${response.status} (${duration}ms)`);

    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      const skipHeaders = ['content-encoding', 'content-length', 'transfer-encoding'];
      if (!skipHeaders.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    // Handle streaming response with proper cleanup
    if (response.body) {
      const { readable, writable } = new TransformStream();
      const pipePromise = response.body.pipeTo(writable).catch((err) => {
        // Ignore abort errors (client disconnected)
        if (err.name === 'AbortError' || clientSignal.aborted) {
          console.log(`[${requestId}] Stream aborted (client disconnected)`);
        } else {
          console.error(`[${requestId}] Stream error: ${err.message}`);
        }
      }).finally(() => {
        cleanup();
      });
      // Don't await pipePromise - let it run in background
      void pipePromise;
      return new Response(readable, { status: response.status, headers: responseHeaders });
    }

    cleanup();
    return new Response(null, { status: response.status, headers: responseHeaders });
  } catch (error) {
    cleanup();
    const duration = Date.now() - startTime;
    const err = error as Error;

    // Handle client abort gracefully
    if (err.name === 'AbortError' || clientSignal.aborted) {
      console.log(`[${requestId}] Request aborted (client disconnected, ${duration}ms)`);
      return new Response(null, { status: 499 }); // nginx-style client closed request
    }

    const message = err?.message ?? 'Unknown error';
    console.error(`[${requestId}] Error after all retries (${duration}ms):`, message);

    return new Response(
      JSON.stringify({
        error: {
          message,
          type: 'server_error',
          code: 'internal_server_error',
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
