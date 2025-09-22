# Script Converter Interface Renaming Migration Plan

目的: `script-converter.ts` 内の *scriptConversion* 由来の名称を、現行の実態 (チャンク変換ベース / エピソード単位の統一インターフェース) に合わせて段階的にリネームし、過去ドメイン語彙 (scriptConversion) を段階的に排除する。

## 現状インターフェース / シンボル
- `ScriptConversionInput`
- `ScriptConversionOptions`
- `convertChunkToMangaScript`
- `EpisodeScriptConversionInput`
- `convertEpisodeTextToScript`
- 内部利用: `mapChunkConversionResult`
- 関連構造: `chunk-script-step.ts` の `stepName = 'scriptConversion'`

## 変更方針の原則
1. **後方互換段階 (Phase 1)**: 旧名称を deprecated alias としてエクスポートしつつ、新名称を導入。型のシリアライズやストレージ永続化に `scriptConversion` という文字列が現れないか点検 (現状: stepName のみ)。
2. **内部置換 (Phase 2)**: コード内部呼び出しを新名称へ移行。ログ出力のコンテキスト `service: 'script-converter'` も必要なら `'chunk-script'` 等へ再評価。
3. **エイリアス除去 (Phase 3)**: Deprecated alias を削除。`stepName` のマイグレーション (DB / イベント履歴に影響する場合はマイグレーションスクリプト追加)。
4. **最終クリーン (Phase 4)**: コメント・ドキュメントから旧語彙を除去。

## 提案する新名称
| 現在 | 新名称 (案) | 用途 | 備考 |
|------|-------------|------|------|
| `ScriptConversionInput` | `ChunkScriptBuildInput` | チャンク→スクリプト入力 | より機能を直接表現 |
| `ScriptConversionOptions` | `ChunkScriptBuildOptions` | オプション | jobId/episodeNumber/isDemo 維持 |
| `convertChunkToMangaScript` | `buildChunkScript` | 関数 | 動詞 + 成果物 |
| `EpisodeScriptConversionInput` | `EpisodeScriptBuildInput` | エピソード全体入力 | naming symmetry |
| `convertEpisodeTextToScript` | `buildEpisodeScript` | 関数 | 上に対応 |
| `stepName = 'scriptConversion'` | `'chunkScript'` | パイプラインステップ識別子 | 互換性要検討 |

## 互換性インパクト
- 現状 DB / Storage: `scriptConversion` 文字列を key / file path に使用していない (要 grep 最終確認)。
- ログ: `service: 'script-converter'` → 変更しても重大影響は低。ただしダッシュボード / ログ検索クエリ依存あれば告知。
- テスト: 型名参照しているテストを段階的に更新。 Phase 1 では alias で壊れないように。

## 移行ステップ詳細
### Phase 0 (事前調査)
- grep: `scriptConversion` / `ScriptConversionInput` / `convertChunkToMangaScript` 全件洗い出し (完了想定)。
- 確認: 永続化ファイル・JSON スナップショットに stepName が含まれていないか (episode/layout progress 等)。

### Phase 1 (導入)
- `script-converter.ts` に新インターフェース/関数を追加し、旧名称を `/** @deprecated Use X */` コメント付きで re-export。
- 既存実装本体は新名称へ移動し、旧関数は thin wrapper。
- `chunk-script-step.ts` は現状維持 (後段で変更)。

### Phase 2 (内部置換)
- プロジェクト内 import を新名称へ置換 (一括 / セグメント化)。
- ログコンテキスト変更 (オプション)。
- テスト更新: 旧名称参照を新名称へ。 deprecation 警告抑制不要 (TS のみ)。

### Phase 3 (識別子変更)
- `chunk-script-step.ts` の `stepName` を `'chunkScript'` へ変更。
- もし進捗管理 / 再開処理で stepName をキーにしている場合は、
  - 過去ジョブを読み込む際に `'scriptConversion'` を `'chunkScript'` にマッピングする互換レイヤーを一時実装。
  - 移行完了後 (観測期間 ~2週) に互換レイヤー削除。

### Phase 4 (エイリアス除去)
- Deprecated export を削除。
- Docs / コメント更新。
- grep で旧語彙ゼロ確認。

## ロールバック戦略
- Phase 1/2 で問題発生時: 旧エクスポートが残るため import 戻すだけ。
- Phase 3 で stepName が原因の再開失敗が発生した場合: 互換マッピングロジックを即時追加 / もしくは stepName 変更コミットを revert。

## テスト戦略
- Unit: 新旧関数が同一結果を返すゴールデンテスト (同じ入力→深い equality)。
- Integration: パイプラインステップを通した script 出力 (代表チャンク) を snapshot (過剰差分を避け sanitize 前後比較)。
- Migration: stepName 変更時、既存 progress JSON を読み込む互換テスト (旧名称→新名称変換)。

## 計画タイムライン (目安)
| Phase | 作業時間目安 | リードタイム | 備考 |
|-------|---------------|--------------|------|
| 0 | 0.5h | 即日 | 調査済み想定 |
| 1 | 1h | 即日 | PR1 |
| 2 | 1h | +1日 | PR2 |
| 3 | 1-2h | +2日 | 互換層含む |
| 4 | 0.5h | +2週後 | PR3 |

## 次アクション (承認後)
1. Phase 1 実装パッチ作成
2. Grep チェックログを docs に追記 (監査用)
3. Phase 2 用 issue 起票

---
この計画で問題なければ *Phase 1* 実装を続行可能です。修正や命名変更希望があればコメントください。
