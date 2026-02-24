# CLI Proxy API

English | [中文](README_CN.md)

CLI Proxy API is a gateway that exposes OpenAI/Gemini/Claude-compatible endpoints for CLI coding tools and SDK clients.

## Feature Overview

- Unified OpenAI/Gemini/Claude/Codex-compatible API endpoints.
- OAuth-based access for Codex and Claude Code flows.
- Streaming and non-streaming response support.
- Tool/function-calling pass-through support.
- Multimodal input pass-through (text and image where upstream supports it).
- Multi-account routing/rotation for supported providers.
- Config-driven upstream routing to OpenAI-compatible providers.

## Current Gaps

- Compatibility is still not fully uniform across all providers and all client edge-cases.
- Quota handling and cooldown visibility are still being refined for some model/provider combinations.
- Production deployment guidance and operational playbooks are still incomplete.
