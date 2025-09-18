# novel2manga v2.0 実装タスク表（完全版）

## 📌 概要
**プロジェクト**: novel2manga-ts v2.0
**期間**: 2025年2月3日 - 2025年3月28日（8週間）
**目標**: トークン75%削減、処理速度2倍、品質95%以上維持

---

## 🔥 Phase 1: 基盤構築 (Week 1-2: 2/3-2/14)

### Task 1.1: SQLiteレジストリ基盤実装
**優先度**: 🔴 Critical
**担当**: Backend Developer A
**工数**: 3日
**前提条件**: なし

#### 実装内容
```typescript
// ファイル: src/v2/registry/sqlite-adapter.ts
class SQLiteRegistry {
  // 1. データベース接続管理
  - WALモード有効化
  - コネクションプール実装
  - トランザクション管理

  // 2. テーブル作成
  - character_registry
  - scene_registry
  - alias_fts
  - chunk_state

  // 3. CRUD操作
  - upsertCharacter()
  - findCharacterById()
  - findByAlias()
  - getActiveCharacters()
}
```

#### 完了条件
- [ ] SQLiteデータベース初期化成功
- [ ] 全CRUDメソッドのユニットテスト作成（カバレッジ90%以上）
- [ ] FTS5検索で100ms以内のレスポンス
- [ ] 1000キャラクター登録時のパフォーマンステスト合格

#### 成果物
- `sqlite-adapter.ts` (500行)
- `sqlite-adapter.test.ts` (300行)
- `schema.sql` (150行)

---

### Task 1.2: テキスト前処理パイプライン
**優先度**: 🔴 Critical
**担当**: NLP Engineer
**工数**: 4日
**前提条件**: なし

#### 実装内容
```typescript
// ファイル: src/v2/preprocessing/text-normalizer.ts
class TextNormalizer {
  normalize(text: string): NormalizedText {
    // 1. NFKC正規化
    // 2. 全角半角統一
    // 3. 括弧内テキスト保護
    // 4. 改行・空白統一
  }
}

// ファイル: src/v2/preprocessing/entity-extractor.ts
class EntityExtractor {
  extract(text: NormalizedText): ExtractedEntities {
    // 1. 正規表現による人名抽出
    // 2. 敬称・役職検出
    // 3. 代名詞マーキング
    // 4. 場所名抽出
  }
}
```

#### 完了条件
- [ ] 日本語テキスト正規化処理実装
- [ ] エンティティ抽出精度80%以上（テストデータ100件）
- [ ] 処理速度: 1000文字/秒以上
- [ ] メモリ使用量: 100MB以下

#### 成果物
- `text-normalizer.ts` (200行)
- `entity-extractor.ts` (300行)
- `japanese-patterns.ts` (150行)
- テストスイート (400行)

---

### Task 1.3: ID解決システム
**優先度**: 🔴 Critical
**担当**: Backend Developer B
**工数**: 3日
**前提条件**: Task 1.1完了

#### 実装内容
```typescript
// ファイル: src/v2/preprocessing/id-resolver.ts
class IdResolver {
  async resolve(
    entities: ExtractedEntities,
    context: ChunkContext
  ): Promise<IdResolution> {
    // 1. FTS5検索でキャンディデート取得
    // 2. コンテキストベーススコアリング
    // 3. 信頼度閾値判定
    // 4. 曖昧性フラグ設定
  }

  private scoreCandiates(
    candidates: CharId[],
    context: ChunkContext
  ): ScoredCandidate[] {
    // 距離、頻度、関係性でスコア計算
  }
}
```

#### 完了条件
- [ ] ID解決精度85%以上
- [ ] 曖昧性検出率90%以上
- [ ] SQLiteクエリ最適化（インデックス使用確認）
- [ ] 100エンティティ/秒の処理速度

#### 成果物
- `id-resolver.ts` (250行)
- `scoring-algorithm.ts` (150行)
- `id-resolver.test.ts` (200行)

---

### Task 1.4: テキストマスキング実装
**優先度**: 🟡 High
**担当**: Backend Developer A
**工数**: 2日
**前提条件**: Task 1.3完了

#### 実装内容
```typescript
// ファイル: src/v2/preprocessing/text-masker.ts
class TextMasker {
  mask(
    text: string,
    idMap: Map<string, CharId>
  ): MaskedText {
    // 1. エンティティ位置特定
    // 2. ID置換（[C001]形式）
    // 3. マッピング情報保存
    // 4. 曖昧箇所マーキング（[?]）
  }

  unmask(masked: MaskedText): string {
    // 逆変換処理
  }
}
```

#### 完了条件
- [ ] 100%可逆なマスキング・アンマスキング
- [ ] 位置情報の正確な保持
- [ ] 処理速度: 10000文字/秒以上
- [ ] エッジケース対応（重複、部分一致）

#### 成果物
- `text-masker.ts` (200行)
- `masking-utils.ts` (100行)
- テストケース (150行)

---

## 🧠 Phase 2: メモリ最適化 (Week 3-4: 2/17-2/28)

### Task 2.1: 階層的メモリマネージャー
**優先度**: 🔴 Critical
**担当**: Senior Developer
**工数**: 4日
**前提条件**: Phase 1完了

#### 実装内容
```typescript
// ファイル: src/v2/memory/hierarchical-manager.ts
class HierarchicalMemoryManager {
  private hot: LRUCache<CharId, FullCharacterData>
  private warm: LRUCache<CharId, CompressedData>
  private cold: SQLiteRegistry

  async getCharacterData(
    id: CharId,
    level: CacheLevel
  ): Promise<CharacterData> {
    // 1. 3層キャッシュ探索
    // 2. プロモーション/デモーション
    // 3. 自動圧縮・展開
  }

  updateAccessPattern(
    chunkIndex: number,
    accessedIds: CharId[]
  ): void {
    // アクセスパターン記録と予測
  }
}
```

#### 完了条件
- [ ] 3層キャッシュ動作確認
- [ ] メモリ使用量50%削減（1GB→500MB）
- [ ] キャッシュヒット率80%以上
- [ ] アクセス速度10倍向上（10ms→1ms）

#### 成果物
- `hierarchical-manager.ts` (400行)
- `cache-strategy.ts` (200行)
- `lru-cache.ts` (150行)
- 統合テスト (300行)

---

### Task 2.2: コンテキスト選択アルゴリズム
**優先度**: 🔴 Critical
**担当**: Algorithm Engineer
**工数**: 3日
**前提条件**: Task 2.1進行中

#### 実装内容
```typescript
// ファイル: src/v2/memory/context-selector.ts
class ContextSelector {
  selectOptimalContext(
    chunkIndex: number,
    maskedText: MaskedText,
    maxTokens: number = 2000
  ): OptimalContext {
    // 1. アクティブキャラクター抽出
    // 2. 関連度スコアリング
    // 3. K-best選択（動的K）
    // 4. トークン数最適化
  }

  private calculateRelevance(
    charId: CharId,
    chunkIndex: number
  ): number {
    // 複合スコア計算アルゴリズム
  }
}
```

#### 完了条件
- [ ] コンテキストサイズ80%削減
- [ ] 関連情報カバレッジ95%以上
- [ ] 選択処理100ms以内
- [ ] トークン数2000以下保証

#### 成果物
- `context-selector.ts` (300行)
- `relevance-scorer.ts` (200行)
- `k-best-selector.ts` (150行)

---

### Task 2.3: 圧縮サービス実装
**優先度**: 🟡 High
**担当**: Backend Developer B
**工数**: 2日
**前提条件**: Task 2.1進行中

#### 実装内容
```typescript
// ファイル: src/v2/memory/compression-service.ts
class CompressionService {
  compress(data: FullCharacterData): CompressedData {
    // 1. 要約生成（50文字）
    // 2. 関係性圧縮（上位3件）
    // 3. タイムライン圧縮（最新10件）
    // 4. メタデータ最小化
  }

  decompress(compressed: CompressedData): PartialData {
    // 部分的復元処理
  }

  private generateSummary(text: string): string {
    // 決定的要約生成（非LLM）
  }
}
```

#### 完了条件
- [ ] データサイズ70%削減
- [ ] 圧縮速度: 10ms以内/エントリ
- [ ] 展開速度: 5ms以内/エントリ
- [ ] 重要情報の100%保持

#### 成果物
- `compression-service.ts` (250行)
- `summary-generator.ts` (150行)
- 圧縮テスト (200行)

---

### Task 2.4: キャッシュ戦略実装
**優先度**: 🟢 Medium
**担当**: Backend Developer A
**工数**: 2日
**前提条件**: Task 2.1完了

#### 実装内容
```typescript
// ファイル: src/v2/memory/cache-strategy.ts
class CacheStrategy {
  // 1. LRU実装
  // 2. TTL管理
  // 3. サイズ制限
  // 4. プリフェッチ戦略

  prefetch(predictedIds: CharId[]): void {
    // 予測的プリフェッチ
  }

  evict(): void {
    // 適応的エビクション
  }
}
```

#### 完了条件
- [ ] キャッシュヒット率85%以上
- [ ] メモリ使用量制限遵守
- [ ] エビクション処理1ms以内
- [ ] プリフェッチ精度70%以上

#### 成果物
- `cache-strategy.ts` (200行)
- `prefetch-predictor.ts` (150行)

---

## 🤖 Phase 3: LLM最適化 (Week 5-6: 3/3-3/14)

### Task 3.1: カスケードコントローラー実装
**優先度**: 🔴 Critical
**担当**: Senior AI Engineer
**工数**: 4日
**前提条件**: Phase 2完了

#### 実装内容
```typescript
// ファイル: src/v2/llm-cascade/cascade-controller.ts
class CascadeLLMController {
  async process(input: ProcessingInput): Promise<ProcessingResult> {
    // 1. Tier1処理（Groq/Gemini）
    const tier1Result = await this.tier1.process(input)

    // 2. 信頼度チェックと分岐
    if (tier1Result.confidence >= 0.7) {
      return tier1Result // 70%はここで完了
    }

    // 3. Tier2エスカレーション
    const tier2Result = await this.tier2.resolve(
      tier1Result,
      this.expandContext(input)
    )

    // 4. Tier3検証（必要時のみ）
    if (tier2Result.needsVerification) {
      return this.tier3.verify(tier2Result)
    }

    return tier2Result
  }
}
```

#### 完了条件
- [ ] 3層カスケード動作確認
- [ ] Tier1完結率70%以上
- [ ] 平均処理時間500ms以内
- [ ] コスト削減60%達成

#### 成果物
- `cascade-controller.ts` (400行)
- `tier1-handler.ts` (200行)
- `tier2-handler.ts` (200行)
- `tier3-handler.ts` (200行)

---

### Task 3.2: 最適化プロンプトビルダー
**優先度**: 🔴 Critical
**担当**: Prompt Engineer
**工数**: 3日
**前提条件**: Task 3.1進行中

#### 実装内容
```typescript
// ファイル: src/v2/llm-cascade/prompt-builder.ts
class OptimizedPromptBuilder {
  buildMinimalPrompt(context: MinimalContext): string {
    // 1. Legend生成（K=5, 各40文字）
    // 2. マスクテキスト埋め込み
    // 3. 短縮記法使用
    // 4. 空要素省略

    return `[L]${legend}\n[T]${masked}\n[O]JSON:c/e/d/s`
  }

  buildExpandedPrompt(context: ExpandedContext): string {
    // Tier2用詳細プロンプト
  }

  buildVerificationPrompt(context: VerificationContext): string {
    // Tier3用検証プロンプト
  }
}
```

#### 完了条件
- [ ] プロンプトサイズ60%削減
- [ ] 出力精度95%維持
- [ ] JSON短縮記法実装
- [ ] 動的プロンプト生成対応

#### 成果物
- `prompt-builder.ts` (300行)
- `prompt-templates.ts` (200行)
- `abbreviation-map.ts` (100行)

---

### Task 3.3: 信頼度スコアリングシステム
**優先度**: 🟡 High
**担当**: ML Engineer
**工数**: 2日
**前提条件**: Task 3.1進行中

#### 実装内容
```typescript
// ファイル: src/v2/llm-cascade/confidence-scorer.ts
class ConfidenceScorer {
  score(result: LLMResult, context: ProcessingContext): Confidence {
    // 1. 構造的整合性チェック
    // 2. ID解決明確性評価
    // 3. コンテキスト一致度
    // 4. 内部一貫性検証

    return this.calculateWeightedScore(factors, weights)
  }

  updateThresholds(feedback: QualityFeedback): void {
    // 動的閾値調整
  }
}
```

#### 完了条件
- [ ] スコアリング精度90%以上
- [ ] 誤検出率5%以下
- [ ] 処理時間10ms以内
- [ ] 自動閾値調整機能

#### 成果物
- `confidence-scorer.ts` (250行)
- `scoring-metrics.ts` (150行)
- `threshold-optimizer.ts` (100行)

---

### Task 3.4: Tierハンドラー実装
**優先度**: 🟡 High
**担当**: Backend Developer A/B
**工数**: 3日
**前提条件**: Task 3.1完了

#### 実装内容
```typescript
// ファイル: src/v2/llm-cascade/tier-handlers/*.ts
class Tier1Handler {
  // Groq/Gemini用の低コスト処理
  // 基本抽出、簡易照応解決
}

class Tier2Handler {
  // GPT-4o用の中コスト処理
  // 曖昧性解決、複雑な抽出
}

class Tier3Handler {
  // GPT-5用の高品質処理
  // 品質検証、一貫性チェック
}
```

#### 完了条件
- [ ] 各Tierの処理実装完了
- [ ] プロバイダー別最適化
- [ ] エラーハンドリング実装
- [ ] リトライロジック実装

#### 成果物
- 各Tierハンドラー (各200行)
- 共通インターフェース (100行)

---

## 🔧 Phase 4: 統合・テスト (Week 7: 3/17-3/21)

### Task 4.1: 既存システムとの統合
**優先度**: 🔴 Critical
**担当**: Integration Engineer
**工数**: 3日
**前提条件**: Phase 3完了

#### 実装内容
```typescript
// ファイル: src/v2/integration/v2-service.ts
class V2IntegrationService {
  async processWithV2(jobConfig: JobConfig): Promise<JobResult> {
    // 1. フィーチャーフラグ確認
    if (!jobConfig.features?.useV2) {
      return this.legacyProcess(jobConfig)
    }

    // 2. v2パイプライン実行
    const pipeline = new V2Pipeline(this.buildConfig(jobConfig))

    // 3. 結果の変換（後方互換性）
    return this.transformResult(await pipeline.process())
  }

  // マイグレーションヘルパー
  async migrateExistingData(): Promise<void> {
    // 既存データのインポート
  }
}
```

#### 完了条件
- [ ] 既存APIとの100%互換性
- [ ] フィーチャーフラグ動作確認
- [ ] ロールバック機能実装
- [ ] データマイグレーション成功

#### 成果物
- `v2-service.ts` (300行)
- `migration-helper.ts` (200行)
- `compatibility-layer.ts` (150行)

---

### Task 4.2: E2Eテスト実装
**優先度**: 🔴 Critical
**担当**: QA Engineer
**工数**: 3日
**前提条件**: Task 4.1進行中

#### 実装内容
```typescript
// ファイル: src/__tests__/v2/e2e/*.test.ts
describe('V2 E2E Tests', () => {
  test('短編小説処理', async () => {
    // 10チャンクの処理
  })

  test('中編小説処理', async () => {
    // 50チャンクの処理
  })

  test('長編小説処理', async () => {
    // 100チャンクの処理
  })

  test('超長編小説処理', async () => {
    // 500チャンクの処理
  })
})
```

#### 完了条件
- [ ] 全シナリオテスト合格
- [ ] パフォーマンス基準達成
- [ ] 品質スコア95%以上
- [ ] メモリリーク検出なし

#### 成果物
- E2Eテストスイート (1000行)
- テストデータセット
- テストレポート

---

### Task 4.3: パフォーマンステスト
**優先度**: 🟡 High
**担当**: Performance Engineer
**工数**: 2日
**前提条件**: Task 4.2進行中

#### 実装内容
```typescript
// ファイル: src/__tests__/v2/performance/*.bench.ts
class PerformanceBenchmark {
  async runBenchmark(): Promise<BenchmarkResult> {
    // 1. トークン使用量測定
    // 2. 処理速度測定
    // 3. メモリ使用量測定
    // 4. API呼び出し回数カウント
  }
}
```

#### 完了条件
- [ ] トークン削減75%以上確認
- [ ] 処理速度2倍向上確認
- [ ] メモリ使用量基準内
- [ ] ベンチマークレポート作成

#### 成果物
- ベンチマークスイート (500行)
- パフォーマンスレポート
- 最適化提案書

---

### Task 4.4: メトリクス収集システム
**優先度**: 🟢 Medium
**担当**: Data Engineer
**工数**: 2日
**前提条件**: Task 4.1完了

#### 実装内容
```typescript
// ファイル: src/v2/optimization/metrics-collector.ts
class MetricsCollector {
  record(event: MetricEvent): void {
    // 1. イベント記録
    // 2. リアルタイム集計
    // 3. 閾値チェック
    // 4. アラート送信
  }

  generateReport(): MetricsReport {
    // 定期レポート生成
  }
}
```

#### 完了条件
- [ ] メトリクス収集動作確認
- [ ] ダッシュボード構築
- [ ] アラート設定完了
- [ ] 自動レポート生成

#### 成果物
- `metrics-collector.ts` (300行)
- `dashboard-config.json`
- `alert-rules.yaml`

---

## 🚀 Phase 5: デプロイメント (Week 8: 3/24-3/28)

### Task 5.1: ステージング環境デプロイ
**優先度**: 🔴 Critical
**担当**: DevOps Engineer
**工数**: 2日
**前提条件**: Phase 4完了

#### 実装内容
```bash
# デプロイメントスクリプト
#!/bin/bash
# 1. Docker イメージビルド
# 2. ステージング環境へデプロイ
# 3. ヘルスチェック
# 4. スモークテスト実行
```

#### 完了条件
- [ ] ステージング環境動作確認
- [ ] 負荷テスト合格
- [ ] セキュリティスキャン完了
- [ ] バックアップ設定確認

#### 成果物
- Dockerfile
- docker-compose.yml
- deployment-scripts/

---

### Task 5.2: カナリアリリース
**優先度**: 🔴 Critical
**担当**: SRE
**工数**: 2日
**前提条件**: Task 5.1完了

#### 実装内容
```yaml
# カナリアデプロイ設定
canary:
  stages:
    - traffic: 10%
      duration: 2h
      metrics:
        - error_rate < 1%
        - p99_latency < 1000ms
    - traffic: 25%
      duration: 4h
    - traffic: 50%
      duration: 8h
    - traffic: 100%
```

#### 完了条件
- [ ] 10%トラフィック成功
- [ ] メトリクス基準達成
- [ ] ロールバック演習完了
- [ ] 段階的展開完了

#### 成果物
- カナリア設定ファイル
- モニタリングダッシュボード
- ランブック

---

### Task 5.3: 本番環境フルリリース
**優先度**: 🔴 Critical
**担当**: Release Manager
**工数**: 1日
**前提条件**: Task 5.2完了

#### 実装内容
- 100%トラフィック切り替え
- 旧システム停止
- モニタリング強化
- インシデント対応準備

#### 完了条件
- [ ] 全トラフィックv2移行
- [ ] 1日間安定稼働
- [ ] SLA達成確認
- [ ] リリースノート公開

#### 成果物
- リリースノート
- 運用手順書
- インシデント対応マニュアル

---

### Task 5.4: ドキュメント整備
**優先度**: 🟡 High
**担当**: Technical Writer
**工数**: 2日
**前提条件**: なし（並行作業）

#### 実装内容
```markdown
# ドキュメント一覧
1. アーキテクチャドキュメント
2. API仕様書
3. 運用マニュアル
4. トラブルシューティングガイド
5. パフォーマンスチューニングガイド
6. 移行ガイド
```

#### 完了条件
- [ ] 全ドキュメント作成完了
- [ ] レビュー完了
- [ ] 社内Wiki更新
- [ ] 外部公開準備

#### 成果物
- docs/ディレクトリ一式
- README.md更新
- CHANGELOG.md

---

## 📊 リソース管理

### 人員配置表

| 週 | Phase | 必要人員 | 役割 |
|----|-------|----------|------|
| 1-2 | 基盤構築 | 4名 | Backend×2, NLP×1, Algorithm×1 |
| 3-4 | メモリ最適化 | 4名 | Senior×1, Backend×2, Algorithm×1 |
| 5-6 | LLM最適化 | 4名 | AI×1, Prompt×1, Backend×2 |
| 7 | 統合・テスト | 3名 | Integration×1, QA×1, Performance×1 |
| 8 | デプロイ | 3名 | DevOps×1, SRE×1, Release×1 |

### スキル要件

| 役割 | 必須スキル | 推奨スキル |
|------|-----------|-----------|
| Backend Dev | TypeScript, SQLite, Node.js | Redis, Docker |
| NLP Engineer | 自然言語処理, 正規表現 | 日本語形態素解析 |
| AI Engineer | LLM API, プロンプトエンジニアリング | Fine-tuning |
| DevOps | Docker, K8s, CI/CD | Terraform, AWS |

---

## 🎯 成功基準

### 必須達成項目
- [ ] トークン使用量75%削減
- [ ] 処理速度2倍向上
- [ ] 品質スコア95%以上維持
- [ ] エラー率1%以下
- [ ] 本番環境1週間安定稼働

### ボーナス目標
- [ ] トークン使用量80%削減
- [ ] 処理速度3倍向上
- [ ] Tier1完結率80%達成
- [ ] API費用85%削減

---

## ⚠️ リスク管理

| リスク | 影響度 | 発生確率 | 対策 | 責任者 |
|--------|--------|----------|------|--------|
| SQLite性能問題 | 高 | 中 | WALモード、インデックス最適化 | DBA |
| ID解決精度不足 | 高 | 低 | ML モデル追加検討 | ML Engineer |
| カスケード複雑化 | 中 | 中 | シンプル化、ドキュメント充実 | Tech Lead |
| リリース遅延 | 高 | 低 | バッファ期間確保、並行作業 | PM |
| 品質劣化 | 高 | 低 | 段階的テスト、A/Bテスト | QA Lead |

---

## 📅 週次レビュー計画

### 週次ミーティング
- **月曜**: キックオフ、週次計画確認
- **水曜**: 進捗確認、課題共有
- **金曜**: 成果レビュー、次週準備

### レビュー項目
1. タスク進捗率
2. 品質メトリクス
3. リスク状況
4. 次週の優先順位

---

## 📝 コミュニケーション計画

### Slackチャンネル
- `#v2-dev`: 開発議論
- `#v2-qa`: テスト・品質
- `#v2-release`: リリース調整
- `#v2-alerts`: アラート通知

### ドキュメント管理
- GitHub Wiki: 技術仕様
- Notion: プロジェクト管理
- Google Drive: 設計書・レポート

---

## ✅ 完了チェックリスト

### Phase完了条件

#### Phase 1 完了
- [ ] SQLiteレジストリ完全動作
- [ ] 前処理パイプライン統合テスト合格
- [ ] ID解決精度85%達成
- [ ] コードレビュー完了

#### Phase 2 完了
- [ ] メモリ階層実装完了
- [ ] コンテキストサイズ80%削減確認
- [ ] キャッシュヒット率80%達成
- [ ] 統合テスト合格

#### Phase 3 完了
- [ ] カスケードLLM動作確認
- [ ] プロンプトサイズ60%削減
- [ ] Tier1完結率70%達成
- [ ] コスト削減シミュレーション完了

#### Phase 4 完了
- [ ] E2E全シナリオ合格
- [ ] パフォーマンス目標達成
- [ ] 後方互換性100%確認
- [ ] ドキュメント完成

#### Phase 5 完了
- [ ] 本番環境安定稼働
- [ ] SLA達成確認
- [ ] 運用引き継ぎ完了
- [ ] プロジェクト完了報告

---

## 🎉 プロジェクト完了条件

1. **技術目標達成**
   - トークン75%削減 ✓
   - 処理速度2倍 ✓
   - 品質維持 ✓

2. **ビジネス目標達成**
   - コスト80%削減 ✓
   - ユーザー満足度向上 ✓

3. **運用準備完了**
   - ドキュメント完備 ✓
   - モニタリング設定 ✓
   - サポート体制確立 ✓

---

