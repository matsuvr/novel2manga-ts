// Clean reconstructed configuration (corrupted legacy fragments removed)
//
// Expansion related ENV overrides (magic number除去方針):
//   APP_EXPANSION_TARGET_SCENARIO_CHARS   -> targetScenarioChars (default 1000)
//   APP_EXPANSION_SHORT_INPUT_TRIGGER_RATIO -> shortInputTriggerRatio (0<r<1, default 0.6)
//   APP_EXPANSION_MIN_SHORT_INPUT_CHARS  -> minShortInputChars (floor, default 400)
// これらを変更することで runExpandPreprocess の閾値 = max(floor, target*ratio) を調整可能。
// NOTE: Relative imports (not alias) to ensure this file can be imported
// very early (e.g., Vitest config) before path aliases are configured.
import { ExplainerCharactersSchema } from '../types/characters'
import { NarrativeJudgeSchema } from '../types/validation'

export const appConfig = {
    chunking: {
      defaultChunkSize: 4000,
      defaultOverlapSize: 100,
      maxChunkSize: 6000,
      minChunkSize: 100,
      maxOverlapRatio: 0.5,
    },
    scriptCoverage: {
      expectedPanelsPerKChar: 2,
      panelCountThresholdRatio: 0.5,
      panelCountPenalty: 0.3,
      dialogueThresholdRatio: 0.3,
      dialoguePenalty: 0.25,
      narrationPenalty: 0.2,
      minTextLengthForNarration: 200,
      unusedCharactersPenalty: 0.15,
    },
    scriptSegmentation: {
      maxPanelsPerSegment: 400,
      contextOverlapPanels: 50,
      minPanelsForSegmentation: 400,
      enableSegmentation: true,
      enableDetailedLogging: true,
      minTrailingSegmentSize: 320,
    },
    scriptConstraints: {
      dialogue: {
        maxCharsPerBubble: 50,
        splitPolicy: 'split-panel' as const,
        continuationPanelCutText: '前のコマを引き継ぐ',
        applyStage: 'post-script-conversion-early' as const,
        applyToTypes: ['speech', 'thought', 'narration'] as const,
      },
    },
    episodeBundling: { minPageCount: 20, enabled: true },
    validation: { minInputChars: 1000, narrativeJudgeEnabled: true, model: 'vertexai_lite' as const },
  // expansion: 短い入力(例: タイトル+一文)を先にシナリオ拡張してから既存チャンク処理に渡す前処理設定
  // targetScenarioChars: 目標拡張長
  // shortInputTriggerRatio: 元入力長 < targetScenarioChars * ratio なら拡張対象とみなす（0.6 はマジックナンバー排除のため設定化）
  // minShortInputChars: 最低でもこの文字数未満なら無条件で「短い」と判定 (safety floor)
  expansion: { enabled: true, targetScenarioChars: 1000, shortInputTriggerRatio: 0.6, minShortInputChars: 400 },
    nonNarrative: { enabled: true, defaultExplainerCount: [2, 3] as [number, number] },
    llm: {
      chunkConversion: {
        systemPrompt: `あなたはプロのマンガ編集者兼脚本家です。入力された小説チャンクを分析し、マンガ用の詳細なJSON (version=3) を生成します。出力はJSONのみ。`,
        userPromptTemplate: `### コンテキスト\nチャンク(0始): {{chunkIndex}} / {{chunksNumber}}\n前要約: {{previousChunkSummary}}\n次要約: {{nextChunkSummary}}\n既存メモリ(JSON):\n{{previousElementMemoryJson}}\n\n### 対象本文\n{{chunkText}}\n\n### 指示\n1. memory.characters / scenes を必要に応じ更新 (再登場のみは追加しない)。\n2. situations を重要事象で作成。\n3. script パネル列を生成 (1パネル1要点, no昇順, dialogueは speaker/ text, 60字目安)。\n4. summary を160字以内。\n5. characters[*].id は c<number> 形式 (例 c1,c2)。既存メモリにあるIDは再利用し、新規のみ未使用最大番号+1。数値単体IDや c 以外の接頭辞、重複IDは禁止。dialogue[*].speaker もその ID か '不明' のみ。\n6. 仕様に合う JSON のみを1つだけ出力 (前後に説明文やコードフェンス禁止)。`,
      },
      narrativityClassification: {
        systemPrompt: `あなたは文章をマンガ脚本前処理用に分類するアナライザーです。以下の3クラスから厳密に1つを JSON で返します。\n\n分類基準:\n1. EXPAND: 入力が極端に短い / 断片的 / タイトル+一文 / 設定が不足し、このままでは十分な複数パネル脚本展開が困難な場合。意味は把握できるが展開に必要な舞台・登場人物・動機などが足りないものを含む。\n2. EXPLAINER: 叙述的な物語展開ではなく、説明・解説・手順・箇条書き・見出し列挙・仕様・教科書的説明など、ストーリーの時間的進行やキャラクター間の相互作用を主目的としないテキスト。\n3. NORMAL: 上記どちらにも当てはまらない、物語的（キャラクター/出来事/進行）テキスト。短すぎない場合はこちら。\n\n注意:\n- 返答は JSON 1行のみ。キーは branch, reason。\n- branch は "EXPAND" | "EXPLAINER" | "NORMAL" のみ。\n- reason は日本語で簡潔に (最大300字)。\n- 入力文字数や不足情報を根拠に必須なら EXPAND を選ぶ。`,
        userPromptTemplate: `【入力テキスト】(length={{length}} chars / targetForExpansion={{expansionTarget}})\n{{text}}\n\n必ず JSON で: {"branch":"EXPAND|EXPLAINER|NORMAL","reason":"..."}`,
      },
      // EXPAND ブランチ用: 短い/断片的な入力を「展開シナリオ本文」に拡張し、その結果を通常の chunkConversion に流す前処理。
      // 出力は単純な JSON: { "expandedText": string, "notes": string[] }
      expandPreprocess: {
        systemPrompt: `あなたは創造的だが忠実な小説編集/脚本補筆アシスタントです。与えられた短い/断片的な文章(タイトルや短文のみ等)を、原意を保持しつつマンガ脚本化に十分な分量(目安: {{targetScenarioChars}} 文字前後, 必要なら前後±20%)に自然に拡張します。冗長な水増し・無意味な反復は禁止。舞台/登場人物/動機/クリフハンガー(任意)を補い、後続チャンク変換で panel 化しやすい描写(行動, 発話, 状況)を含めてください。出力は JSON のみ。`,
        userPromptTemplate: `### 入力テキスト(短い元資料)
{{rawInput}}

### 既知メタ情報
判定理由(短すぎる根拠): {{shortReason}}
希望ターゲット長(文字): {{targetScenarioChars}}

### 指針
1. 原意と既存固有名詞があるなら維持。無ければ自然な日本人名/設定を適度に導入。
2. 唐突な展開禁止。起(導入)->承(展開)->転(対立/障害)->結(次への含み) の骨格を与える。
3. 会話: 2-3人のやり取りを散りばめ、地の文で背景/感情を補足。
4. 過度なテンプレ台詞・オノマトペ乱用は禁止。自然さ優先。
5. 拡張が不可能なほど曖昧なら最小限の仮定を『(仮)』コメントなしで本文へ自然統合。
6. 出力JSON形式: {"expandedText": string, "notes": string[]}。notes には仮定/補足/未確定要素を列挙(最大5)。

### 出力要件
JSONのみ。expandedText は改行を保持。文字数は target ±20% 以内。`,
      },
      explainerConversion: {
        systemPrompt: `あなたは教育マンガ編集者です。非物語テキストを学習目的の explainer-v1 JSON に変換します。これは、先生役、生徒役1，生徒役2、モブキャラクターの対話により、入力テキストをわかりやすく解説するものです。JSON以外禁止。`,
        // chunkConversion と共通化: パイプライン後段の共通処理を容易にするため同一テンプレート
        userPromptTemplate: `### コンテキスト\nチャンク(0始): {{chunkIndex}} / {{chunksNumber}}\n前要約: {{previousChunkSummary}}\n次要約: {{nextChunkSummary}}\n既存メモリ(JSON):\n{{previousElementMemoryJson}}\n\n### 対象本文\n{{chunkText}}\n\n### 指示\n1. memory.characters / scenes を必要に応じ更新 (再登場のみは追加しない)。\n2. situations を重要事象で作成。\n3. script パネル列を生成 (1パネル1要点, no昇順, dialogueは speaker/ text, 60字目安)。\n4. summary を160字以内。\n5. characters[*].id は c<number> 形式 (例 c1,c2) を厳守。既存IDを再使用し、新規のみ連番追加。dialogue[*].speaker はその ID か '不明'。\n6. 仕様に合う JSON のみを1つだけ出力 (前後余計な文字列禁止)。`,
      },
      episodeBreakEstimation: {
        systemPrompt: `統合スクリプト panels を自然なエピソード単位に分割。最小10/最大50パネル。全パネルを網羅。JSONのみ {"episodes":[{episodeNumber,title,startPanelIndex,endPanelIndex,description}]}`,
        userPromptTemplate: `【統合スクリプト】\n{{scriptJson}}\nepisodes JSON を出力。`,
      },
    },
    storage: {
      basePath: 'storage', novelsDir: 'novels', chunksDir: 'chunks', analysisDir: 'analysis', layoutsDir: 'layouts', jobsDir: 'jobs', rendersDir: 'renders', thumbnailsDir: 'thumbnails',
    },
    rendering: {
      defaultPageSize: { width: 1190, height: 1684 },
      pageSizePresets: { a4Portrait: { width: 595, height: 842 }, a4Landscape: { width: 842, height: 595 }, b4Portrait: { width: 728, height: 1031 }, b4Landscape: { width: 1031, height: 728 } },
      limits: { maxPages: 5000 },
      verticalText: { enabled: true, defaults: { fontSize: 24, lineHeight: 1.6, letterSpacing: 0, padding: 12, maxCharsPerLine: 14 }, maxConcurrent: 4 },
      canvas: {
        sfx: { enabled: true, mainFontSize: { min: 24, max: 48, scaleFactor: 0.12 }, supplementFontSize: { scaleFactor: 0.35, min: 10 }, mainTextStyle: { fillStyle: '#000000', strokeStyle: '#ffffff', lineWidth: 4, fontWeight: 'bold' as 'bold' | 'normal' }, supplementTextStyle: { fillStyle: '#666666', strokeStyle: '#ffffff', lineWidth: 2, fontWeight: 'normal' as 'bold' | 'normal' }, rotation: { enabled: true, maxAngle: 0.15 }, placement: { avoidOverlap: true, preferredPositions: ['top-left','bottom-left','top-center','middle-left','bottom-right'] } },
        bubble: { fillStyle: '#ffffff', strokeStyle: '#000000', normalLineWidth: 2, shoutLineWidth: 3, thoughtShape: { bumps: 18, amplitudeRatio: 0.12, randomness: 0.3, minRadiusPx: 6, prng: { seedScale: 0.01337, sinScale: 12.9898, multiplier: 43758.5453 } }, thoughtTail: { enabled: true, count: 3, startRadiusRatio: 0.12, decay: 0.65, gapRatio: 0.28, angle: Math.PI * 0.75 } },
        speakerLabel: { enabled: true, fontSize: 1.4, padding: 8, backgroundColor: '#ffffff', borderColor: '#333333', textColor: '#333333', offsetX: 0.3, offsetY: 0.7, borderRadius: 6, maxCharsPerLine: 5 },
        contentText: { enabled: true, fontSize: { min: 20, max: 28, default: 24 }, padding: 8, lineHeight: 1.4, textColor: '#333333', placement: { strategy: 'auto', preferredAreas: ['left','top','bottom'], minAreaSize: 80 }, maxWidthRatio: 0.8, maxHeightRatio: 0.6 },
      },
    },
    api: {
      rateLimit: { layoutGeneration: { requests: 30, window: 60000 }, imageGeneration: { requests: 50, window: 60000 }, pageRender: { requests: 100, window: 60000 } },
      timeout: { default: 30000, layoutGeneration: 45000, imageGeneration: 120000, pageRender: 60000 },
      polling: { jobStatus: { intervalMs: 5000, maxAttempts: 120 } },
      maxPayloadSize: { text: 1024 * 1024, image: 5 * 1024 * 1024, json: 512 * 1024 },
    },
    processing: {
      maxConcurrentChunks: 3,
      maxConcurrentJobs: 2,
      batchSize: { chunks: 6, analysis: 3 },
      retry: { maxAttempts: 3, initialDelay: 1000, maxDelay: 10000, backoffFactor: 2 },
      cache: { ttl: 24 * 60 * 60, minTtlSec: 60, validationTtlSec: 30, recommended: { analysisSec: 60 * 60, layoutSec: 30 * 60 }, maxItemSizeMB: 25, analysisCache: true, layoutCache: true },
      episode: { targetCharsPerEpisode: 8000, minCharsPerEpisode: 1, maxCharsPerEpisode: 12000, smallPanelThreshold: 8, minPanelsPerEpisode: 10, maxPanelsPerEpisode: 1000 },
    },
  features: { enableLayoutGeneration: true, enableImageGeneration: false, enableAutoSave: true, enableCaching: true, enableCoverageCheck: false, enableParallelProcessing: true, enableProgressTracking: true, enableTokenCounter: true, enableTokenCounterUI: true, enableTokenCounterTelemetry: true },
    characterMemory: {
      summaryMaxLength: 700,
      promptMemory: { maxTokens: 4000, recentChunkWindow: 15, topProminentCount: 10, tokenEstimatePerChar: 2.5 },
      matching: { confidenceThreshold: 0.75 },
      prominence: { weights: { events: 0.4, dialogue: 0.3, chunkSpan: 0.2, recent: 0.1 }, recentWindow: 10 },
      majorActions: { min: 3, max: 7 },
      snapshotFormatting: { header: '【登場人物情報（これまでに登場済み）】', emptyMessage: '', characterPrefix: '◆', aliasesLabel: '別名', summaryLabel: '説明', actionsLabel: '主な行動', maxAliases: 5, maxSummaryLength: 150, maxActions: 3 },
    },
    logging: { level: 'info' as 'error' | 'warn' | 'info' | 'debug', enableFileLogging: true, enableConsoleLogging: true, logDir: 'logs', rotateDaily: true, maxLogFiles: 7 },
    development: { enableVerboseLogging: false, enablePerformanceMetrics: true, enableErrorDetails: true, mockExternalAPIs: false, enableTestMode: false },
    ui: { progress: { tokenUsagePollIntervalMs: 2000, currentEpisodeProgressWeight: 0.5, defaultEpisodeNumber: 1 }, logs: { maxEntries: 50, maxVisibleLogHeightVh: 60 }, sse: { maxReconnectAttempts: 5, maxReconnectDelayMs: 30000, fallbackPollingIntervalMs: 30000, expectedHeartbeatMs: 20000 } },
    navigation: { fallbackRedirectDelayMs: 1200 },
  }

export type AppConfig = typeof appConfig
type MutableAppConfig = { [K in keyof AppConfig]: AppConfig[K] extends Record<string, unknown> ? { [P in keyof AppConfig[K]]: AppConfig[K][P] } : AppConfig[K] }
export function getAppConfigWithOverrides(): AppConfig {
    // 環境変数による上書き禁止ポリシー: app.config.ts が唯一の真実ソース。
    // ここでは clone + 構造バリデーションのみ行い、欠損があれば即座に throw。
    const config = JSON.parse(JSON.stringify(appConfig)) as MutableAppConfig

    // 必須フィールドの存在チェック（追加・変更時ここを更新）
    type LlmConfig = typeof appConfig.llm & Record<string, unknown>
    const llmCfg = config.llm as LlmConfig
    const chunkConv = (llmCfg && typeof llmCfg === 'object' && 'chunkConversion' in llmCfg)
      ? (llmCfg as { chunkConversion?: { systemPrompt?: string; userPromptTemplate?: string } }).chunkConversion
      : undefined
    const requiredPaths: Array<[string, unknown]> = [
      ['chunking.defaultChunkSize', config.chunking?.defaultChunkSize],
      ['validation.minInputChars', config.validation?.minInputChars],
      ['expansion.targetScenarioChars', config.expansion?.targetScenarioChars],
      ['expansion.shortInputTriggerRatio', config.expansion?.shortInputTriggerRatio],
      ['expansion.minShortInputChars', config.expansion?.minShortInputChars],
      ['llm.chunkConversion.systemPrompt', chunkConv?.systemPrompt],
      ['llm.chunkConversion.userPromptTemplate', chunkConv?.userPromptTemplate],
    ]
    const missing = requiredPaths.filter(([, v]) => v === undefined || v === null)
    if (missing.length > 0) {
      const detail = missing.map(([k]) => k).join(', ')
      throw new Error(`AppConfig validation failed: missing required keys: ${detail}`)
    }
    return config
}

// ------------------------------------------------------------
// Centralized LLM prompt helpers (migrated from src/prompts/*)
// NOTE: These are exported separately (NOT inside appConfig) because
// getAppConfigWithOverrides performs JSON serialization cloning which
// would strip functions. Keep pure-data config and code helpers apart.
// ------------------------------------------------------------

// Explainer characters generation
export const EXPLAINER_CHARS_SYSTEM = `
You create memorable teaching personas for a Japanese learning comic.
Constraints:
- Output STRICT JSON array of 2–3 objects with fields:
  id, name, role ("Teacher"|"Student"|"Skeptic"|"Expert"|"Narrator"|"Other"), voice, style, quirks?, goal?
- Keep names short and distinct. Keep voices/styles concise (<= 120 JP chars each).
- JSON ONLY. No markdown, no prose.
`.trim()

export function buildExplainerCharsUser(contentSummary: string) {
  return `
【題材の要約／トピック】
${contentSummary}

【目的】
読者（初学者）にわかりやすく、テンポ良く、誤解なく要点を説明する。
`.trim()
}

export function parseExplainerChars(jsonText: string) {
  const parsed = JSON.parse(jsonText)
  return ExplainerCharactersSchema.parse(parsed)
}

export const EXPLAINER_CHARS_GEN_CFG = {
  temperature: 0.6,
  maxTokens: 512,
} as const

// Narrativity judge (boolean + kind classification)
export const NARRATIVITY_JUDGE_SYSTEM = `
You are a strict JSON-only classifier.
Decide if the input text is NARRATIVE FICTION (novel / short story / play / rakugo) or NON-FICTION (manual / report / textbook / news / blog / etc.).
Output ONLY compact JSON with fields: isNarrative (boolean), kind (one of: novel, short_story, play, rakugo, nonfiction, report, manual, other), confidence (0..1), reason (<=160 chars JP).
NO prose, NO markdown—JSON ONLY.
`.trim()

export function buildNarrativityJudgeUser(inputText: string): string {
  return `
【判定対象テキスト】
${inputText}
`.trim()
}

export const NARRATIVITY_JUDGE_SYSTEM_LITE = `JSON only. Classify Japanese text.
Fields: isNarrative(bool), kind(one of novel, short_story, play, rakugo, nonfiction, report, manual, other), confidence(0..1), reason(JP<=120 chars).
` as const

export function buildNarrativityJudgeUserLite(inputText: string): string {
  const maxChars = 3000
  let text = inputText
  if (text.length > maxChars) {
    const head = text.slice(0, 1500)
    const tail = text.slice(-1200)
    text = `${head}\n...[省略]...\n${tail}`
  }
  return `TEXT:\n${text}`
}

export function parseNarrativityJudge(jsonText: string) {
  const parsed = JSON.parse(jsonText)
  return NarrativeJudgeSchema.parse(parsed)
}

export const NARRATIVITY_JUDGE_GEN_CFG = {
  temperature: 0.0,
  maxTokens: 256,
} as const

// AI Expansion (短い入力テキストを物語シナリオへ拡張)
// 旧: src/prompts/aiExpansion.prompt.ts から移行
export function buildAIExpansionSystem(targetChars: number) {
  return `あなたは熟練の脚本家です。ユーザーの短い入力を手がかりに、\n約${targetChars}文字の日本語シナリオ（マンガ化しやすい地の文 + 必要最低限のセリフ）を書いてください。\n制約:\n- 箇条書き/見出し/番号リスト/JSON禁止。段落構成のみ。\n- 起承転結と場面の切り替えを明確に。\n- 登場人物は 2〜4 名に抑え、セリフは自然で読みやすく。\n- 長すぎる固有名詞や複雑な世界観の過剰導入を避ける。\n- 過度なメタ発言禁止。\n- 目標文字数は±10% 以内。`.trim()
}

export function buildAIExpansionUser(shortInput: string) {
  return `【元の短い入力】\n${shortInput}\n\n【要件】\n- 上記の核となる要素(登場人物/状況/雰囲気)を尊重しつつ不足部分を創造的に補完。\n- 読後に小さな余韻が残るワンエピソード完結。\n- プレーンテキストのみ。`.trim()
}

export const AI_EXPANSION_GEN_CFG = {
  temperature: 0.7,
  maxTokens: 2048,
} as const

