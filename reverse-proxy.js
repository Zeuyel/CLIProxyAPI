// Deno reverse proxy server (Deno Deploy + Supabase Edge compatible)
const apiMapping = {
  "/antigravity-sandbox": "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "/antigravity-daily": "https://daily-cloudcode-pa.googleapis.com",
  "/antigravity-cloudcode": "https://cloudcode-pa.googleapis.com",
  "/codex": "https://chatgpt.com",
  "/openai": "https://api.openai.com",
};

const CHATBOT_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reverse Proxy Chatbot</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --line: #dbe3ee;
      --brand: #0ea5e9;
      --brand-hover: #0284c7;
      --danger: #dc2626;
      --radius: 14px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--text);
      background: radial-gradient(circle at top right, #e0f2fe 0%, var(--bg) 45%);
    }
    .app {
      max-width: 980px;
      margin: 0 auto;
      padding: 24px 16px 32px;
      display: grid;
      gap: 16px;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
      padding: 14px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 22px;
      font-weight: 700;
    }
    p { margin: 0; color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .field {
      display: grid;
      gap: 6px;
    }
    .field.full { grid-column: 1 / -1; }
    label {
      font-size: 13px;
      color: #334155;
      font-weight: 600;
    }
    input, textarea, button {
      font: inherit;
    }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      background: #fff;
      color: var(--text);
      transition: border-color .15s ease;
    }
    input:focus, textarea:focus {
      outline: none;
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    button {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
      font-weight: 600;
      color: #fff;
      background: var(--brand);
      transition: background .15s ease;
    }
    button:hover { background: var(--brand-hover); }
    button.secondary {
      color: #334155;
      background: #eef2f7;
    }
    button.secondary:hover { background: #e2e8f0; }
    .status {
      margin-left: auto;
      font-size: 12px;
      color: var(--muted);
    }
    .status.error { color: var(--danger); }
    .chat {
      min-height: 360px;
      max-height: 56vh;
      overflow: auto;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      display: grid;
      gap: 8px;
    }
    .msg {
      border-radius: 12px;
      padding: 10px 12px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.45;
      border: 1px solid var(--line);
      background: #fff;
    }
    .msg.user {
      border-color: #bfdbfe;
      background: #eff6ff;
    }
    .msg.assistant {
      border-color: #bae6fd;
      background: #ecfeff;
    }
    .msg.meta {
      font-size: 12px;
      color: var(--muted);
      background: #f8fafc;
    }
    .send-box {
      display: grid;
      gap: 8px;
    }
    .send-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .send-row textarea {
      min-height: 86px;
      resize: vertical;
    }
    .send-row button {
      min-width: 120px;
      height: 42px;
    }
    code {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 2px 6px;
      font-size: 12px;
    }
    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      .status { width: 100%; margin-left: 0; }
      .send-row { flex-direction: column; align-items: stretch; }
      .send-row button { width: 100%; }
    }
  </style>
</head>
<body>
  <main class="app">
    <section class="panel">
      <h1>Reverse Proxy Chatbot</h1>
      <p>默认请求路径：<code>/openai/v1/chat/completions</code>（会通过本代理转发到 OpenAI）。</p>
    </section>

    <section class="panel grid">
      <div class="field">
        <label for="apiKey">OpenAI API Key</label>
        <input id="apiKey" type="password" placeholder="sk-..." />
      </div>
      <div class="field">
        <label for="model">Model</label>
        <input id="model" type="text" value="gpt-4o-mini" />
      </div>
      <div class="field full">
        <label for="endpoint">Endpoint</label>
        <input id="endpoint" type="text" value="/openai/v1/chat/completions" />
      </div>
      <div class="field">
        <label for="temperature">Temperature</label>
        <input id="temperature" type="number" step="0.1" min="0" max="2" value="0.7" />
      </div>
      <div class="field">
        <label for="maxTokens">Max Tokens（可选）</label>
        <input id="maxTokens" type="number" min="1" placeholder="例如 1024" />
      </div>
      <div class="toolbar full">
        <button id="saveBtn" class="secondary" type="button">保存配置</button>
        <button id="clearBtn" class="secondary" type="button">清空对话</button>
        <span id="status" class="status"></span>
      </div>
    </section>

    <section class="panel">
      <div id="chat" class="chat"></div>
    </section>

    <section class="panel send-box">
      <div class="field">
        <label for="systemPrompt">System Prompt（可选）</label>
        <textarea id="systemPrompt" placeholder="You are a helpful assistant."></textarea>
      </div>
      <div class="send-row">
        <textarea id="messageInput" placeholder="输入你的问题..." aria-label="message input"></textarea>
        <button id="sendBtn" type="button">发送</button>
      </div>
    </section>
  </main>

  <script>
    const STORAGE_KEY = "proxy_chatbot_settings_v1";
    const chatEl = document.getElementById("chat");
    const statusEl = document.getElementById("status");

    const fields = {
      apiKey: document.getElementById("apiKey"),
      model: document.getElementById("model"),
      endpoint: document.getElementById("endpoint"),
      temperature: document.getElementById("temperature"),
      maxTokens: document.getElementById("maxTokens"),
      systemPrompt: document.getElementById("systemPrompt"),
      messageInput: document.getElementById("messageInput"),
    };

    const state = {
      messages: [],
      sending: false,
    };

    function setStatus(text, isError) {
      statusEl.textContent = text || "";
      statusEl.classList.toggle("error", !!isError);
    }

    function addMessage(role, text) {
      const div = document.createElement("div");
      div.className = "msg " + role;
      div.textContent = text;
      chatEl.appendChild(div);
      chatEl.scrollTop = chatEl.scrollHeight;
      return div;
    }

    function loadSettings() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        fields.apiKey.value = saved.apiKey || "";
        fields.model.value = saved.model || "gpt-4o-mini";
        fields.endpoint.value = saved.endpoint || "/openai/v1/chat/completions";
        fields.temperature.value = saved.temperature || "0.7";
        fields.maxTokens.value = saved.maxTokens || "";
        fields.systemPrompt.value = saved.systemPrompt || "";
      } catch (err) {
        setStatus("读取本地配置失败", true);
      }
    }

    function saveSettings() {
      const payload = {
        apiKey: fields.apiKey.value.trim(),
        model: fields.model.value.trim() || "gpt-4o-mini",
        endpoint: fields.endpoint.value.trim() || "/openai/v1/chat/completions",
        temperature: fields.temperature.value.trim() || "0.7",
        maxTokens: fields.maxTokens.value.trim(),
        systemPrompt: fields.systemPrompt.value,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setStatus("配置已保存");
    }

    function buildChatMessages() {
      const output = [];
      const systemPrompt = fields.systemPrompt.value.trim();
      if (systemPrompt) {
        output.push({ role: "system", content: systemPrompt });
      }
      for (const item of state.messages) {
        output.push({ role: item.role, content: item.content });
      }
      return output;
    }

    async function sendMessage() {
      if (state.sending) return;

      const text = fields.messageInput.value.trim();
      if (!text) return;

      const endpoint = fields.endpoint.value.trim() || "/openai/v1/chat/completions";
      const apiKey = fields.apiKey.value.trim();
      const model = fields.model.value.trim() || "gpt-4o-mini";
      const temperature = Number(fields.temperature.value || "0.7");
      const maxTokensRaw = fields.maxTokens.value.trim();
      const maxTokens = maxTokensRaw ? Number(maxTokensRaw) : undefined;

      if (!apiKey) {
        setStatus("请先填写 API Key", true);
        return;
      }

      state.sending = true;
      setStatus("发送中...");
      fields.messageInput.value = "";

      state.messages.push({ role: "user", content: text });
      addMessage("user", text);
      const assistantNode = addMessage("assistant", "思考中...");

      try {
        const body = {
          model: model,
          messages: buildChatMessages(),
          temperature: Number.isFinite(temperature) ? temperature : 0.7,
          stream: false,
        };
        if (Number.isFinite(maxTokens) && maxTokens > 0) {
          body.max_tokens = maxTokens;
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error("HTTP " + response.status + " " + errText.slice(0, 400));
        }

        const data = await response.json();
        const content = data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : "";

        const answer = Array.isArray(content) ? JSON.stringify(content) : String(content || "");
        assistantNode.textContent = answer || "(empty response)";
        state.messages.push({ role: "assistant", content: assistantNode.textContent });
        setStatus("完成");
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        assistantNode.textContent = "请求失败: " + message;
        setStatus("请求失败", true);
      } finally {
        state.sending = false;
      }
    }

    document.getElementById("sendBtn").addEventListener("click", sendMessage);
    document.getElementById("saveBtn").addEventListener("click", saveSettings);
    document.getElementById("clearBtn").addEventListener("click", function () {
      state.messages = [];
      chatEl.innerHTML = "";
      setStatus("对话已清空");
    });

    fields.messageInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    loadSettings();
    addMessage("meta", "提示：这是一个前端测试页面，聊天请求会走当前反向代理服务。");
  </script>
</body>
</html>`;

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
};

async function fetchWithRetry(url, options, requestId) {
  let lastError;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    if (options.signal && options.signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      const response = await fetch(url, options);

      if (response.status >= 500 && response.status < 600 && attempt < RETRY_CONFIG.maxRetries) {
        const errorText = await response.text();
        console.warn(
          "[" + requestId + "] Attempt " + (attempt + 1) + "/" + (RETRY_CONFIG.maxRetries + 1) +
          " failed with " + response.status + ", will retry. Error: " + errorText.substring(0, 200)
        );

        const delayMs = Math.min(
          RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
          RETRY_CONFIG.maxDelayMs
        );

        console.log(
          "[" + requestId + "] Waiting " + delayMs + "ms before retry " + (attempt + 2) + "/" +
          (RETRY_CONFIG.maxRetries + 1)
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (attempt > 0) {
        console.log(
          "[" + requestId + "] Request succeeded on attempt " + (attempt + 1) + "/" +
          (RETRY_CONFIG.maxRetries + 1)
        );
      }
      return response;
    } catch (error) {
      lastError = error;
      if (lastError && lastError.name === "AbortError") {
        throw lastError;
      }

      if (attempt < RETRY_CONFIG.maxRetries) {
        console.warn(
          "[" + requestId + "] Attempt " + (attempt + 1) + "/" + (RETRY_CONFIG.maxRetries + 1) +
          " failed with error: " + lastError.message + ", will retry"
        );
        const delayMs = Math.min(
          RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
          RETRY_CONFIG.maxDelayMs
        );
        console.log(
          "[" + requestId + "] Waiting " + delayMs + "ms before retry " + (attempt + 2) + "/" +
          (RETRY_CONFIG.maxRetries + 1)
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      console.error(
        "[" + requestId + "] All " + (RETRY_CONFIG.maxRetries + 1) +
        " attempts failed. Last error: " + lastError.message
      );
      throw lastError;
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

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
  const keys = [];
  for (const pair of headers.entries()) {
    keys.push(pair[0]);
  }
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith("cf-") ||
      lower === "cdn-loop" ||
      lower === "via" ||
      lower === "traceparent" ||
      lower === "tracestate" ||
      lower === "true-client-ip" ||
      lower.startsWith("x-forwarded-")
    ) {
      headers.delete(key);
    }
  }
}

function ensureCodexBrowserHeaders(headers) {
  if (!headers.has("Accept-Language") && !headers.has("accept-language")) {
    headers.set("Accept-Language", "en-US,en;q=0.9");
  }
  if (!headers.has("Sec-Fetch-Site") && !headers.has("sec-fetch-site")) {
    headers.set("Sec-Fetch-Site", "same-origin");
  }
  if (!headers.has("Sec-Fetch-Mode") && !headers.has("sec-fetch-mode")) {
    headers.set("Sec-Fetch-Mode", "cors");
  }
  if (!headers.has("Sec-Fetch-Dest") && !headers.has("sec-fetch-dest")) {
    headers.set("Sec-Fetch-Dest", "empty");
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
}

function makeJsonResponse(data, status) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function shouldServeHtml(request) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

Deno.serve(async (request) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);
  const url = new URL(request.url);
  const rawPathname = url.pathname;
  const pathname = normalizePath(rawPathname, Object.keys(apiMapping));

  console.log("[" + requestId + "] " + request.method + " " + rawPathname + url.search);

  const abortController = new AbortController();
  const clientSignal = request.signal;
  const onAbort = () => {
    console.log("[" + requestId + "] Client disconnected");
    abortController.abort();
  };
  clientSignal.addEventListener("abort", onAbort);

  const cleanup = () => {
    clientSignal.removeEventListener("abort", onAbort);
  };

  if (pathname === "/" || pathname === "" || pathname === "/index.html" || pathname === "/chatbot" || pathname === "/chatbot.html") {
    cleanup();
    if (shouldServeHtml(request) || pathname === "/chatbot" || pathname === "/chatbot.html") {
      return new Response(CHATBOT_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return makeJsonResponse({ message: "Deno Reverse Proxy", mappings: apiMapping });
  }

  if (pathname === "/api/mappings") {
    cleanup();
    return makeJsonResponse({ mappings: apiMapping });
  }

  if (pathname === "/robots.txt") {
    cleanup();
    return new Response("User-agent: *\nDisallow: /", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const extracted = extractPrefixAndRest(pathname, Object.keys(apiMapping));
  const prefix = extracted[0];
  const rest = extracted[1];
  if (!prefix) {
    cleanup();
    console.log("[" + requestId + "] 404 No matching prefix");
    return new Response("Not Found", { status: 404 });
  }

  const targetBase = apiMapping[prefix];
  const targetHost = new URL(targetBase).host;
  let forwardPath = rest;
  if (forwardPath === "/" + targetHost) {
    forwardPath = "/";
  } else if (forwardPath.startsWith("/" + targetHost + "/")) {
    forwardPath = forwardPath.slice(targetHost.length + 1);
  }
  const targetUrl = targetBase + forwardPath + url.search;
  console.log("[" + requestId + "] -> " + targetUrl);

  try {
    let headers;
    if (prefix === "/codex") {
      headers = new Headers(request.headers);
    } else {
      headers = new Headers();
      const forwardHeaders = [
        "accept",
        "content-type",
        "authorization",
        "user-agent",
        "x-goog-api-client",
        "x-goog-api-key",
        "openai-organization",
        "openai-project",
      ];
      for (const pair of request.headers.entries()) {
        const key = pair[0];
        const value = pair[1];
        if (forwardHeaders.includes(key.toLowerCase())) {
          headers.set(key, value);
        }
      }
    }
    headers.delete("x-forwarded-for");
    headers.delete("x-forwarded-proto");
    headers.delete("x-forwarded-host");
    headers.delete("x-real-ip");
    headers.delete("connection");
    headers.delete("keep-alive");
    headers.delete("proxy-authenticate");
    headers.delete("proxy-authorization");
    headers.delete("te");
    headers.delete("trailer");
    headers.delete("transfer-encoding");
    headers.delete("upgrade");
    // Strip proxy/CDN injected network identity headers to avoid upstream WAF false positives.
    stripProxyInjectedHeaders(headers);
    if (prefix === "/codex") {
      ensureCodexBrowserHeaders(headers);
    }
    headers.set("Host", targetHost);
    if (!headers.has("User-Agent") && !headers.has("user-agent")) {
      headers.set("User-Agent", "antigravity/1.104.0");
    }

    const fetchOptions = {
      method: request.method,
      headers,
      redirect: "manual",
      signal: abortController.signal,
    };
    if (request.body && request.method !== "GET" && request.method !== "HEAD") {
      fetchOptions.body = request.body;
      fetchOptions.duplex = "half";
    }

    const response = await fetchWithRetry(targetUrl, fetchOptions, requestId);
    const duration = Date.now() - startTime;
    console.log("[" + requestId + "] " + response.status + " (" + duration + "ms)");

    const responseHeaders = new Headers();
    for (const pair of response.headers.entries()) {
      const key = pair[0];
      const value = pair[1];
      const skipHeaders = ["content-encoding", "content-length", "transfer-encoding"];
      if (!skipHeaders.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("X-Frame-Options", "DENY");
    responseHeaders.set("Referrer-Policy", "no-referrer");

    if (response.body) {
      const streamPair = new TransformStream();
      const pipePromise = response.body.pipeTo(streamPair.writable).catch((err) => {
        if (err.name === "AbortError" || clientSignal.aborted) {
          console.log("[" + requestId + "] Stream aborted (client disconnected)");
        } else {
          console.error("[" + requestId + "] Stream error: " + err.message);
        }
      }).finally(() => {
        cleanup();
      });
      void pipePromise;
      return new Response(streamPair.readable, { status: response.status, headers: responseHeaders });
    }

    cleanup();
    return new Response(null, { status: response.status, headers: responseHeaders });
  } catch (error) {
    cleanup();
    const duration = Date.now() - startTime;
    const err = error;

    if ((err && err.name === "AbortError") || clientSignal.aborted) {
      console.log("[" + requestId + "] Request aborted (client disconnected, " + duration + "ms)");
      return new Response(null, { status: 499 });
    }

    const message = err && err.message ? err.message : "Unknown error";
    console.error("[" + requestId + "] Error after all retries (" + duration + "ms):", message);

    return makeJsonResponse(
      {
        error: {
          message,
          type: "server_error",
          code: "internal_server_error",
        },
      },
      500
    );
  }
});
