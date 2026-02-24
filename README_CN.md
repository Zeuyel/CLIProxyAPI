# CLI 代理 API

[English](README.md) | 中文

CLI 代理 API 是一个为 CLI 编码工具与 SDK 客户端提供 OpenAI/Gemini/Claude/Codex 兼容接口的网关。

## 功能概述（给使用者）

- 提供统一的 OpenAI/Gemini/Claude/Codex 兼容 API 端点。
- 支持 Codex 与 Claude Code 的 OAuth 鉴权接入流程。
- 支持流式与非流式响应。
- 支持工具调用 / 函数调用透传。
- 支持多模态输入透传（文本、图片，取决于上游能力）。
- 支持多账户路由与轮询。
- 支持通过配置接入 OpenAI 兼容上游。

## 当前欠缺（持续完善中）

- 不同提供商与不同客户端的兼容性仍未完全统一，仍有边缘场景差异。
- 部分模型/提供商的配额处理与冷却可视化还在持续优化。
- 面向生产环境的部署与运维指南仍不完整。
