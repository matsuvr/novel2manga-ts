# Integration Test Guide (fail-fast + splitOnly)

This guide describes the current E2E strategy: fast, deterministic smoke tests using /api/analyze splitOnly mode, and a fail-fast API surface with no internal fallbacks.

## Overview

- Split-only smoke path validates early pipeline pieces without invoking LLMs.
- API does not provide fallback loops; errors surface immediately. This prevents 60s hangs.
- Heavier, LLM-involved validations should be done with service/agent-layer mocks, not API flags.

## Prerequisites

- Node.js 20+
- npm
- Novel text at `docs/宮本武蔵地の巻.txt`
- No LLM keys are required for splitOnly smoke.

## Running

You can start the server manually or let the scripts handle it.

### Manual server then run tests

```bash
npm run dev
# In another terminal
npm run test:integration
```

### Orchestrated (recommended)

```bash
npm run test:full-flow        # Linux/Mac
npm run test:full-flow:win    # Windows
```

The scripts wait for `/api/health` on port 3001 and run the Vitest suite.

## Scenarios (current)

1. Split-only smoke

- POST /api/novel → novelId
- POST /api/analyze { splitOnly: true } → jobId, chunkCount
- GET /api/jobs/:jobId/status → splitCompleted true
- GET /api/jobs/:jobId/episodes → 404 (no episodes yet)
- GET /api/render/status/:jobId → { status: "no_episodes" }

2. Error paths (examples)

- Invalid analyze payload → 400/422
- Unknown jobId → 404
- Storage read error → 500 with clear message (no retry/fallback hidden loops)

## Extending Tests

- Place new tests in `tests/integration/`.
- Keep scenarios minimal and deterministic; avoid timing-based assertions.
- For LLM-heavy flows, inject mocks at the agent/service layer in unit/integration tests, not via API test flags.

## Troubleshooting

- Port conflicts (3001): The orchestration attempts cleanup, but collisions can happen. Retry after a few seconds.
- 60s timeouts: Remove any local retry loops; the API intentionally fails fast now.
- Dynamic route params: Ensure Next.js App Router handlers await params before accessing `jobId`.
  ✓ 統合テスト完了: 小説→漫画レイアウトまでの全工程が正常に動作

```

## トラブルシューティング

| エラー | 解決方法 |
|--------|----------|
| `API key not found` | `.env.test` にAPI Keyを設定 |
| `ECONNREFUSED` | `npm run dev` でサーバー起動 |
| `ENOENT: no such file` | `docs/宮本武蔵地の巻.txt` が存在するか確認 |
| `Request timeout` | API Key有効性確認、レート制限に注意 |

## 設定項目

- **タイムアウト**: 最大10分 (長文処理のため)
- **LLMプロバイダー**: OpenRouter → Gemini フォールバック
- **テストファイル**: 宮本武蔵地の巻 (約10万文字)
- **チャンク数**: 20-30個程度に分割
- **エピソード数**: 2-5個程度

このテストにより、システム全体の動作確認が完了します。
```
