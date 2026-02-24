# CPA -> Cloudflare Worker -> Deno

This worker forwards requests to a Deno reverse proxy.
It supports dynamic upstream selection from the request URL.

## Deploy

```bash
cd cloudflare-worker
wrangler deploy
```

## Variables

- `UPSTREAM_BASE_URL`: optional fallback base URL when request URL does not include upstream.
- `ALLOWED_UPSTREAM_SUFFIXES`: allowed host suffix list, comma-separated (default: `.deno.net,.deno.dev`).
- `WORKER_AUTH_TOKEN`: optional shared secret. If set, caller must provide:
  - `x-worker-token: <token>`

> Keep upstream `Authorization` for OpenAI/Codex credentials. Do not use `Authorization` for worker auth in this chain.

## Dynamic upstream formats

1. Path suffix mode (matches your requested format):

```bash
curl -i "https://<your-worker>.workers.dev/api/mappings/funny-starfish-28.lauracadano-max.deno.net"
```

2. Query mode:

```bash
curl -i "https://<your-worker>.workers.dev/api/mappings?upstream=funny-starfish-28.lauracadano-max.deno.net"
```

## Notes

- Only HTTPS + allowed Deno host suffixes are accepted.
- Response headers include:
  - `x-worker-upstream`
  - `x-worker-routing-mode` (`path`, `query`, or `fixed`)

## Example test (fixed fallback mode)

```bash
curl -i "https://<your-worker>.workers.dev/openai/v1/models"
```
