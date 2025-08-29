# Script スキーマ浅層化（Structured Output 安定化）計画

目的

- Groq 等のStructured Output制約（ネスト深度<=5）に適合しつつ、どのLLMにも機動的に切替可能な浅いスキーマへ再設計する。
- スキーマ検証エラーをリクエスト前に排除し、デバッグ容易性を高める。

設計方針（新スキーマ: ScriptV2）

- ルート直下に `script: Line[]` の一次元配列のみを置く（`scenes` を廃止）。
- シーンのまとまりは `sceneIndex`（数値）で示す（1始まり想定）。
- 既存の行タイプは維持: `type: 'dialogue'|'thought'|'narration'|'stage'`。
- カバレッジはオプション `coverageStats`（uncoveredSpansは `{start,end}` 配列）。
- 例（概略）:

```json
{
  "title": "...",
  "script": [
    { "sceneIndex": 1, "type": "narration", "text": "…", "sourceStart": 0, "sourceEnd": 20 },
    { "sceneIndex": 1, "type": "dialogue", "speaker": "太郎", "text": "…" },
    { "sceneIndex": 2, "type": "stage", "text": "場面転換…" }
  ],
  "coverageStats": {
    "totalChars": 1234,
    "coveredChars": 1100,
    "coverageRatio": 0.89,
    "uncoveredCount": 2,
    "uncoveredSpans": [{ "start": 200, "end": 215 }]
  },
  "needsRetry": false
}
```

JSON Schema 深さの見積もり（最大5）

- ルート(object) → `script`(array) → items(object) → primitive: 深さ4
- `coverageStats`(object) → `uncoveredSpans`(array) → items(object) → primitive: 深さ5

段階移行戦略

- 互換アダプタを用意: `toLegacyScenes(scriptV2) => { scenes: [...] }`（sceneIndexでグルーピング）
- 既存の消費側は一時的にアダプタ経由で動作。段階的に直接ScriptV2を受け取るようリファクタする。
- フォールバック/スキップは禁止。検証エラーは詳細メッセージで停止。

タスク表
| # | タスク | 目的/内容 | 成果物/変更箇所 | 依存 | 担当 | 状態 |
|---|---|---|---|---|---|---|
| 1 | ScriptV2型とZod定義 | 浅いスキーマ定義（sceneIndex導入） | `src/types/script.ts` 新定義・型エクスポート | なし | | 未着手 |
| 2 | 互換アダプタ追加 | V2→レガシーscenes変換（暫定） | `src/utils/script-adapters.ts` | 1 | | 未着手 |
| 3 | プロンプト更新 | 出力仕様をV2へ同期（JSONのみ/日本語/厳格） | `src/config/app.config.ts` | 1 | | 未着手 |
| 4 | JSON Schema変換器強化 | Zod→JSON Schemaで深さ<=5を保証（$defs/anyOf/oneOf/allOf削減） | `src/agents/llm/openai-compatible.ts` 変換処理拡張 | 1 | | 未着手 |
| 5 | Script変換器更新 | LLM出力の要求/パース/検証をV2に変更 | `src/agents/script/script-converter.ts` | 1,3,4 | | 未着手 |
| 6 | チャンク→スクリプト保存 | ストレージ書式はV2（キーは現状維持） | `src/services/application/steps/chunk-script-step.ts` | 5 | | 未着手 |
| 7 | マージ/後続処理 | script-merge, page-break 等をV2対応（当面アダプタ併用可） | `script-merge-step.ts`, `page-break-step.ts`, 周辺 | 2,5 | | 未着手 |
| 8 | LLMプロンプト検証 | GroqでStructured Output成功、OpenAI/Gemini等でも整合 | 実行ログ/結果 | 3,4,5 | | 未着手 |
| 9 | テスト更新 | 単体/統合/E2EをV2へ移行・安定化 | `src/__tests__`, `tests/integration`, E2E | 2,5,7 | | 未着手 |
|10 | 互換除去 | 消費側がV2直参照に移行後、アダプタ削除 | 影響箇所全般 | 2,7,9 | | 未着手 |
|11 | ドキュメント更新 | 設計/仕様/タスク完了反映 | 本ドキュメント、設計書 | 全体 | | 未着手 |

受け入れ基準

- Groq Structured Output でHTTP 400が発生しない（スキーマ深さ<=5達成）。
- すべてのLLMでV2 JSONが生成され、Zod検証に合格する。
- 既存フロー（ページ分割/割付/レンダ）はV2で動作（必要時アダプタ経由）。
- 単体/統合/E2Eがグリーン（修正範囲に関するもの）。
- エラーは隠蔽せず、詳細メッセージで停止。

メモ

- uncoveredSpans は `{start,end}` 配列（タプル配列は不可）。
- strict structured outputs は維持。ただしJSON Schema変換で深さを越えないよう簡素化する。
