export const appConfig = {
  // チャンク分割設定
  chunking: {
    defaultChunkSize: 3000, // デフォルトチャンクサイズ（文字数）
    defaultOverlapSize: 200, // デフォルトオーバーラップサイズ（文字数）
    maxChunkSize: 4000, // 最大チャンクサイズ
    minChunkSize: 100, // 最小チャンクサイズ - 意味のある最小サイズに修正
    maxOverlapRatio: 0.5, // チャンクサイズに対する最大オーバーラップ比率
  },
  // Script coverage scoring constants
  scriptCoverage: {
    expectedPanelsPerKChar: 2, // Expected panels per 1000 characters
    panelCountThresholdRatio: 0.5, // Minimum ratio of expected panels to avoid penalty
    panelCountPenalty: 0.3, // Penalty for insufficient panel count
    dialogueThresholdRatio: 0.3, // Minimum ratio of original dialogue to avoid penalty
    dialoguePenalty: 0.25, // Penalty for insufficient dialogue coverage
    narrationPenalty: 0.2, // Penalty for missing narration (when text > 200 chars)
    minTextLengthForNarration: 200, // Minimum text length to expect narration
    unusedCharactersPenalty: 0.15, // Penalty for defined but unused characters
  },

  // Script segmentation configuration (for long scripts)
  scriptSegmentation: {
    // Maximum panels per segment for episode break estimation (2 episodes worth)
    maxPanelsPerSegment: 400,
    // Number of panels to overlap between segments for episode boundary context
    contextOverlapPanels: 50,
    // Minimum panels required to trigger segmentation (400+ panels)
    minPanelsForSegmentation: 400,
    // Enable segmentation by default for production
    enableSegmentation: true,
    // Log segmentation details for debugging
    enableDetailedLogging: true,
    // Minimum trailing segment size to avoid merging with previous (80% of maxPanelsPerSegment)
    minTrailingSegmentSize: 320,
  },

  // Script constraints (post Script Conversion normalization)
  scriptConstraints: {
    dialogue: {
      // 一つの吹き出しに入る文字数の上限（マジックナンバー禁止のため設定化）
      maxCharsPerBubble: 50,
      // 分割方針: 吹き出し上限超過時はパネルを分割して以降のセリフを新規パネルへ
      splitPolicy: 'split-panel' as const,
      // 分割で増えた2コマ目以降の絵の内容
      continuationPanelCutText: '前のコマを引き継ぐ',
      // 適用タイミング: Script Conversion直後（できるだけ早い段階）
      applyStage: 'post-script-conversion-early' as const,
      // 対象の台詞種別
      applyToTypes: ['speech', 'thought', 'narration'] as const,
    },
  },

  // Episode bundling configuration
  episodeBundling: {
    // Minimum page count for episode bundling
    // Episodes with fewer pages will be merged with adjacent episodes
    minPageCount: 20,
    // Enable bundling by default
    enabled: true,
  },
  // LLM設定（モデル・パラメータは llm.config.ts に集約。ここではプロンプトのみ保持）
  llm: {
    chunkSummary: {
      systemPrompt:
        '要約: 以下のテキストを150文字以内の簡潔な日本語要約にしてください。改行は使用しないでください。',
      maxLength: 150,
    },
    // テキスト分析用設定（プロンプトのみ）
    // NOTE: 以下のsystemPrompt/userPromptTemplateは、チャンク分析のJSON出力仕様を満たすように調整してください。
    // - コメント: ここに「抽出フィールド（characters/scenes/dialogues/highlights/situations）と任意のpacing」を明記
    // - JSONのみ出力、説明禁止、日本語で統一、未知フィールド禁止などの制約を記述
    textAnalysis: {
      systemPrompt: `これは長文テキストの一部分（=チャンク）です。以下の要素を抽出してください。人物だけは「前回までの人物メモリ」を参照して同一人物かどうかを判定し、必要に応じて新規人物の仮IDを発行してください。分析対象は「対象」チャンクのみです（前/次は文脈把握のためだけに使用）。

出力は必ず次の JSON 形式（v2）のみ。説明文や余計な文字は出力禁止。未知フィールド禁止。すべて日本語で出力。入力が日本語以外の場合は現代日本語口語訳で出力。

{
  "characters": [
    {
      "id": "char_既存ID または temp_char_<chunkIndex>_<連番>",
      "name": "このチャンクで確認できた呼称（不明な場合は「不明」）",
      "aliases": ["別名や肩書き（なければ空配列）"],
      "description": "このチャンクで新たに判明/確証された人物情報（50〜120字）",
      "firstAppearanceChunk": 0,         // 新規人物なら現在の chunkIndex、既知なら null
      "firstAppearance": 0,              // 新規人物なら対象テキスト内の最初の出現インデックス、既知なら null
      "possibleMatchIds": [              // 既存人物候補（なければ空配列）
        {"id": "char_XX", "confidence": 0.0} // 0.0〜1.0
      ]
    }
  ],
  "characterEvents": [
    {
      "characterId": "char_既存ID または temp_char_<chunkIndex>_<連番>",
      "action": "このチャンクでその人物が行った/言った/判明したことを簡潔に記述（1文）",
      "index": 0                         // 対象テキスト内の先頭文字インデックス（0起点）
    }
  ],
  "scenes": [
    {
      "location": "場所",
      "time": "時間 または \"不明\" または null",
      "description": "場面の要約（1〜2文）",
      "startIndex": 0,                   // 対象テキスト内の開始位置（0起点、包含）
      "endIndex": 0                      // 対象テキスト内の終了位置（排他的）
    }
  ],
  "dialogues": [
    {
      "speakerId": "char_既存ID または temp_char_<chunkIndex>_<連番> または \"不明\"",
      "text": "セリフ本文（入力が他言語なら日本語訳）",
      "emotion": "感情（例: 中立/喜び/怒り/悲しみ/驚き/恐れ/嫌悪/不明 など自由記述）",
      "index": 0
    }
  ],
  "highlights": [
    {
      "type": "climax|turning_point|emotional_peak|action_sequence",
      "description": "重要な出来事の要約（1文）",
      "importance": 1,                   // 1〜6 の整数で重要度（6が最大）
      "startIndex": 0,
      "endIndex": 0
    }
  ],
  "situations": [
    {"description": "状況説明（出来事の流れ・因果が分かるよう簡潔に）", "index": 0}
  ],
  "pacing": "マンガとしてのペース（任意。コマ割り・密度感などを短く）"
}

厳守事項:
- 必ず "situations" フィールドを含めること。
- インデックス規約: すべて対象テキストに対する 0 起点。startIndex は包含、endIndex は排他的。
- 時間や場所が不明確な場合は time を null または「不明」にする。
- 登場人物の同一性判定:
  - 「人物メモリ」に同一候補がある場合は、その既存ID（例: char_12）を "id" や "speakerId" に用いる。
  - 不明/新規の場合は temp_char_<chunkIndex>_<連番> を発行し、"characters" に登録する。
  - 既存候補があるが確信度が低い場合は "possibleMatchIds" に列挙（confidence 0.0〜1.0）。
- "characters" には「このチャンクで新たに登場した人物」または「既知だが新情報を得た人物」のみを含める。単に再登場しただけで新情報がない既知人物は "characters" に入れず、"characterEvents" と "dialogues" で参照する。
- "dialogues.text" は必要に応じて日本語訳にし、原文のニュアンスを保ちつつ簡潔に。
- 説明文や JSON 以外の出力は厳禁。未知のプロパティ禁止。すべて日本語で出力。
- 重要度は 1〜6 の整数で評価。6が最大評価。発生確率は、1が30％、2が30％、3が20％、4が10％、5が5％、6が5％程度を目安に。
`,
      userPromptTemplate: `チャンク{{chunkIndex}}:

[人物メモリ（前回までの確定情報・JSON）]
{{previousCharacterMemoryJson}}

前要約: {{previousChunkSummary}}
対象: {{chunkText}}
次要約: {{nextChunkSummary}}

指示:
- 分析対象は「対象」のみ。前/次は同一人物判定や話の流れ把握にのみ使用。
- 既知人物は "人物メモリ" の ID（例: char_12）を使用。不明/新規なら temp_char_{{chunkIndex}}_1, _2... を発行。
- "characters" には新登場または新情報のある人物のみを入れる。再登場のみの場合は "characterEvents" / "dialogues" で参照。
- 出力は必ず JSON（v2）**のみ**。
`,
    },

    // スクリプト変換プロンプト（インライン化）
    scriptConversion: {
      systemPrompt: `**あなたはプロのマンガ脚本家兼コンテ作家です。**
以下の小説テキスト（原文）を、**1コマ1アクション**原則・絵指示が明確・セリフ/ナレーションが簡潔に読める**マンガ台本**に変換してください。
書かれている言語が現代口語の日本語以外の場合は、**現代日本語口語訳**で台本を作成してください。
最終出力は**機械可読JSONのみ**で提示します（説明・Markdown・コードブロック禁止）。

---

* 作品情報

  * 小説全文を{{chunksNumber}}個に分けたチャンクの中の{{chunkIndex}}番目のチャンクです
* 仕上がり要件

  * 想定媒体：紙の漫画雑誌
  * 擬音表記：日本語オノマトペ優先
  * 作画指向：アニメ調
  * 年代・舞台継承：**原作準拠**（変更禁止）
* 出力粒度

  * **1コマに1アクション**、1セリフ塊は最大2行（25〜35字目安）。
  * カメラは**基本固定→必要時のみ移動**、唐突なジャンプカット禁止。
  * 地の文は心の声/ナレーション/カット指示に変換。心の声と解釈出来る部分は確実に抽出。
  * 地の文をナレーションにする場合は、**短く簡潔に**。セリフで補えない因果関係を繋ぐ最小限の説明に留める。地の文に相当する箇所を圧縮してキャラクターのセリフにフォーカスすることで作品の魅力が上がります。
  * 原文にあるセリフは省略不可。長いセリフは分割しつつ、全てのセリフを漏れなく台本に入れること。
  * 心の声の前後に（）は不要

* 表記規約

  * キャラ名は初出でフル、その後は短縮可。
  * 前後のチャンクの出力を踏まえ、文体、キャラクター毎の口調を統一。
  * セリフ：\\
`,
      userPromptTemplate: `文脈理解のために、直前のチャンクと直後のチャンクも付けます。**脚本変換対象とするのは脚本変換対象チャンクのみにしてください**

直前のチャンク：
{{previousSummary}}

脚本変換対象チャンク：
{{chunkText}}

直後のチャンク：
{{nextSummary}}

脚本変換対象チャンクにおける、物語の要素を抽出した物を添付します。参考にしてください。

{{scenesList}}

{{dialoguesList}}

{{highlightLists}}

{{situations}}

本作全体における、登場人物の情報を添付します。参考にしてください。このチャンクではまだ登場していない情報を入れないように注意してください。

{{charactersList}}

`,

      // カバレッジリトライ用の改善プロンプトテンプレート
      coverageRetryPromptTemplate: `【重要】前回生成された台本は、原文のセリフを十分に再現できているかというスコアが（{{coveragePercentage}}%）でした。より原文のセリフと重要情報を漏らさず台本として再現できるように、以下の点を意識して、再度生成してください：
{{coverageReasons}}

より詳細で完全なスクリプトを生成してください。元テキストの内容をより丁寧に反映してください。`,

      // カバレッジ判定の閾値設定
      coverageThreshold: 0.8, // 80%未満でリトライ
      enableCoverageRetry: true, // カバレッジリトライ機能の有効/無効

      // 分析結果のフォーマット設定
      analysisFormatting: {
        scenesHeader: '【シーン情報】',
        dialoguesHeader: '【セリフ情報】',
        highlightsHeader: '【重要ポイント】',
        situationsHeader: '【状況】',
        emotionUnknown: '感情不明',
        importanceLabel: '重要度',
      },
    },

    // カバレッジ判定用プロンプト（インライン化）
    coverageJudge: {
      systemPrompt: `あなたは「過剰要約を検出する監査員」です。入力として与えられた原文のチャンクと、そのチャンクから生成されたマンガ台本（panels直下スキーマ）を突き合わせ、セリフや重要な情報がどれだけ保持されているかを数値化してください。

厳守事項:
- 出力はJSONのみ。説明・マークダウン・コードブロック禁止。
- 未知プロパティ禁止。下記スキーマに完全一致させること。

スキーマ:
{
  "coverageRatio": number (0..1),
  "missingPoints": string[] (省略/落丁された重要事項の短文列挙),
  "overSummarized": boolean (過剰要約が疑われるか),
  "notes"?: string (2-3行の判定根拠)
}

評価基準（重要）:
- 重要情報= 主要イベント、主要人物の意図/行動、因果、キーとなるセリフ要旨、シーンの転換点
- coverageRatioは「原文の重要情報のうち台本で保持されている割合」の主観評価（0..1）。
- 省略/圧縮により、主要イベントや因果が欠落していれば比率を大きく下げる。
- 表現の言い換えは許容。意味が保持されていれば減点しない。`,
      userPromptTemplate: `原文（チャンク）: {{rawText}}
参考分析: characters/dialogues/highlights/situations（存在すれば）
台本JSON（panels直下・dialogueは "名前: セリフ" 文字列配列）: {{scriptJson}}

上記スキーマのJSONのみを返すこと。`,
    },

    // Episode break estimation configuration
    episodeBreakEstimation: {
      systemPrompt: `あなたはマンガのエピソード構成専門家です。与えられた統合スクリプトから、マンガとしての自然なエピソードの切れ目を検出してください。

【エピソード切れ目の基準】
- 場面転換（時間、場所、状況の大きな変化）
- ストーリー展開の区切り（導入→展開→山場→結末）
- キャラクター視点の切り替え
- テーマや雰囲気の変化
- 自然な読み切り感のある区切り

【制約】
- 最小エピソード長: 10パネル以上
- 最大エピソード長: 50パネル以下
- パネル番号（no）を基準にstart/endを決定
- エピソード番号は1から始まる連番
- 全パネルが必ずいずれかのエピソードに含まれること（漏れ禁止）

出力は以下のJSON形式のみ:
{
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "プロローグ",
      "startPanelIndex": 1,
      "endPanelIndex": 15,
      "description": "物語の導入部分"
    },
    {
      "episodeNumber": 2,
      "title": "出会い",
      "startPanelIndex": 16,
      "endPanelIndex": 35,
      "description": "主人公と重要キャラクターの出会い"
    }
  ]
}

注意事項:
- title、descriptionは必須（空文字禁止）
- startPanelIndex ≤ endPanelIndex
- エピソード間に隙間や重複なし
- 追加の説明文は出力禁止`,
      userPromptTemplate: `【統合スクリプト】
{{scriptJson}}

【指示】
上記の統合スクリプトのpanels配列を分析し、自然なエピソード切れ目を検出してください。各パネルのno（パネル番号）を基準に、startPanelIndexとendPanelIndexを決定してください。

【分析観点】
1. パネル内容（cut）の変化
2. 場所や時間設定の転換
3. キャラクター構成の変化
4. ストーリーの流れとテンション

適切なエピソード分割を行い、上記JSON形式で出力してください。`,
    },
  },

  // ストレージ設定
  storage: {
    // ローカルストレージ
    basePath: 'storage',
    novelsDir: 'novels',
    chunksDir: 'chunks',
    analysisDir: 'analysis',
    layoutsDir: 'layouts',
    jobsDir: 'jobs',
    rendersDir: 'renders',
    thumbnailsDir: 'thumbnails',
  },

  // 画像・ページサイズ設定
  rendering: {
    // デフォルトページサイズ（A4縦）
    defaultPageSize: {
      width: 1190, // A4縦の幅（px）
      height: 1684, // A4縦の高さ（px）
    },
    // サポートされているページサイズプリセット
    pageSizePresets: {
      a4Portrait: { width: 595, height: 842 },
      a4Landscape: { width: 842, height: 595 },
      b4Portrait: { width: 728, height: 1031 },
      b4Landscape: { width: 1031, height: 728 },
    },
    // 安全上限（PageBreakV2 の最大ページ数）。
    // マジックナンバー禁止: 必ずここを参照
    // 設定根拠:
    // - 大規模ドキュメント/長編のレンダリング要求への備え
    // - パフォーマンス検証で 5000 ページまで安定動作を確認
    // - それ以上はメモリ・CPU負荷が急増するため安全上限とする
    // 運用の目安: 通常は 1000〜2000 ページ程度を推奨。必要に応じて調整可。
    limits: {
      maxPages: 5000,
    },
    // 縦書きテキスト（セリフ）画像化の設定
    verticalText: {
      enabled: true,
      defaults: {
        fontSize: 24,
        lineHeight: 1.6,
        letterSpacing: 0.0,
        padding: 12,
        maxCharsPerLine: 14,
      },
      maxConcurrent: 4,
    },
    // Canvas描画設定
    canvas: {
      // SFX（描き文字）描画設定（新仕様）
      sfx: {
        enabled: true,
        mainFontSize: {
          min: 24,
          max: 48,
          scaleFactor: 0.12, // パネル高さに対する比率
        },
        supplementFontSize: {
          scaleFactor: 0.35, // メインフォントサイズに対する比率
          min: 10,
        },
        mainTextStyle: {
          fillStyle: '#000000',
          strokeStyle: '#ffffff',
          lineWidth: 4,
          fontWeight: 'bold' as 'bold' | 'normal',
        },
        supplementTextStyle: {
          fillStyle: '#666666',
          strokeStyle: '#ffffff',
          lineWidth: 2,
          fontWeight: 'normal' as 'bold' | 'normal',
        },
        rotation: {
          enabled: true,
          maxAngle: 0.15, // ラジアン
        },
        placement: {
          avoidOverlap: true,
          preferredPositions: [
            'top-left',
            'bottom-left',
            'top-center',
            'middle-left',
            'bottom-right',
          ],
        },
      },
      // 吹き出し描画設定
      bubble: {
        fillStyle: '#ffffff', // 吹き出し背景色
        strokeStyle: '#000000', // 吹き出し枠線色
        normalLineWidth: 2, // 通常の線幅
        shoutLineWidth: 3, // 叫び系の線幅
        // thought（心の声）の雲形パラメータ（マジックナンバー排除のため設定化）
        thoughtShape: {
          bumps: 18, // こぶの数（多いほど細かくグネグネ）
          amplitudeRatio: 0.12, // ふくらみの基本比率（短径基準）
          randomness: 0.3, // こぶ毎の揺らぎ強度（0..1）
          minRadiusPx: 6, // ふくらみの最小値（ピクセル）
          // 疑似乱数（ノイズ）生成に用いる係数（GLSL系ハッシュに着想）
          prng: {
            seedScale: 0.01337, // シード拡散のためのスケール
            sinScale: 12.9898, // サイン入力のデコリレーション用スケール
            multiplier: 43758.5453, // 小数部を広げる乗数
          },
        },
        // thought（心の声）尾泡パラメータ
        // 既定: 有効（2〜3個の小円が吹き出しからキャラ方向へ）
        thoughtTail: {
          enabled: true,
          count: 3,
          startRadiusRatio: 0.12, // 最大尾泡の半径（短径比）
          decay: 0.65, // 尾泡がだんだん小さくなる比率
          gapRatio: 0.28, // 円間距離（短径比）
          // デフォルト方向: 左下（一般的な配置で自然になりやすい）
          // 右下にしたい場合は -Math.PI * 0.75 などに調整
          angle: Math.PI * 0.75,
        },
      },
      // 話者ラベル描画設定（オプション）
      speakerLabel: {
        enabled: true,
        // メインフォントサイズに対する比率
        fontSize: 0.7,
        padding: 4,
        backgroundColor: '#ffffff',
        borderColor: '#333333',
        textColor: '#333333',
        // ラベル幅・高さに対する外側オフセット比率
        offsetX: 0.3,
        offsetY: 0.7,
        borderRadius: 3,
        // BudouXを用いた行分割の1行最大文字数（単語境界優先）
        // 狭いパネルでの可読性（過度なフォント縮小の回避）を優先するため
        // 以前の 8 から 5 に調整。横幅制約時は改行で収める設計。
        // 作品のレイアウト方針に応じて運用で再調整可能。
        maxCharsPerLine: 5,
      },
      // 説明テキスト（状況説明）描画設定
      contentText: {
        enabled: true,
        fontSize: {
          // 説明テキストは従来比で縦横2倍のスケールを確保する
          min: 20,
          max: 28,
          default: 24,
        },
        padding: 8,
        lineHeight: 1.4,
        background: {
          color: 'rgba(255, 255, 255, 0.85)',
          borderColor: '#cccccc',
          borderWidth: 1,
          borderRadius: 4,
        },
        textColor: '#333333',
        placement: {
          strategy: 'auto',
          preferredAreas: ['left', 'top', 'bottom'],
          minAreaSize: 80,
        },
        // 占有領域も縦横2倍確保（但しパネル面積の80%/60%を上限とする）
        maxWidthRatio: 0.8,
        maxHeightRatio: 0.6,
      },
    },
  },

  // API設定
  api: {
    // レート制限
    rateLimit: {
      textAnalysis: {
        requests: 100, // リクエスト数
        window: 60 * 1000, // ウィンドウ（ミリ秒）
      },
      layoutGeneration: {
        requests: 30,
        window: 60 * 1000,
      },
      imageGeneration: {
        requests: 50,
        window: 60 * 1000,
      },
      pageRender: {
        requests: 100,
        window: 60 * 1000,
      },
    },

    // タイムアウト設定
    timeout: {
      default: 30000, // デフォルトタイムアウト（ミリ秒）
      textAnalysis: 180000, // テキスト分析タイムアウト（gpt-5-nano-2025-08-07用に3分に増加）
      layoutGeneration: 45000, // レイアウト生成タイムアウト
      imageGeneration: 120000, // 画像生成タイムアウト
      pageRender: 60000, // ページレンダリングタイムアウト
    },

    // ポーリング設定（APIステータス監視など）
    polling: {
      jobStatus: {
        intervalMs: 5000, // ステータスチェック間隔（ミリ秒）
        maxAttempts: 120, // 最大ポーリング回数
      },
    },

    // ペイロード制限
    maxPayloadSize: {
      text: 1024 * 1024, // 1MB
      image: 5 * 1024 * 1024, // 5MB
      json: 512 * 1024, // 512KB
    },
  },

  // 処理設定
  processing: {
    // 並列処理数
    maxConcurrentChunks: 3, // 同時処理可能なチャンク数 - 削減
    maxConcurrentJobs: 2, // 同時処理可能なジョブ数 - 削減

    // バッチ処理設定
    batchSize: {
      chunks: 6, // チャンク処理のバッチサイズ - 削減
      analysis: 3, // 分析処理のバッチサイズ - 削減
    },

    // リトライ設定
    retry: {
      maxAttempts: 3,
      initialDelay: 1000, // 初期遅延（ミリ秒）
      maxDelay: 10000, // 最大遅延（ミリ秒）
      backoffFactor: 2, // バックオフ係数
    },

    // キャッシュ設定
    cache: {
      ttl: 24 * 60 * 60, // デフォルトTTL（秒）
      // 最小TTL（秒）: マジックナンバー禁止に基づき設定化
      minTtlSec: 60,
      // 推奨TTL（秒）: 種別ごとの下限
      recommended: {
        analysisSec: 60 * 60, // 1時間
        layoutSec: 30 * 60, // 30分
      },
      // 1アイテムの最大サイズ（MB）: ストレージ/メモリ保護用の上限
      maxItemSizeMB: 25,
      // 機能トグル
      analysisCache: true, // 分析結果のキャッシュ有効化
      layoutCache: true, // レイアウトのキャッシュ有効化
    },

    // エピソード処理設定
    episode: {
      targetCharsPerEpisode: 8000, // エピソードあたりの目標文字数 - 削減
      minCharsPerEpisode: 1, // 最小文字数 - 削減
      maxCharsPerEpisode: 12000, // 最大文字数 - 削減
      smallPanelThreshold: 8, // パネル数がこの値以下なら単一エピソードとして扱う
      minPanelsPerEpisode: 10, // 1エピソードの最小コマ数
      maxPanelsPerEpisode: 1000, // 1エピソードの最大コマ数（従来の50から拡張。詳細は設計ドキュメント参照）
    },
  },

  // フィーチャーフラグ
  features: {
    enableTextAnalysis: true,
    enableLayoutGeneration: true,
    enableImageGeneration: false, // 将来的な機能
    enableAutoSave: true,
    enableCaching: true,
    enableCoverageCheck: false,
    enableParallelProcessing: true,
    enableProgressTracking: true,
    enableTokenCounter: true, // Gemini Token Counter 機能
    enableTokenCounterUI: true, // トークンカウンターUI表示
    enableTokenCounterTelemetry: true, // トークン計測テレメトリ
  },

  // キャラクターメモリ設定（マジックナンバー禁止ルールに基づき閾値を一元化）
  characterMemory: {
    // キャラクターメモリのサマリー最大長（文字数）
    summaryMaxLength: 700,
    // プロンプト用メモリ生成の制御値
    promptMemory: {
      maxTokens: 4000, // 目安: 3000-5000
      recentChunkWindow: 15, // 直近チャンクの窓幅
      topProminentCount: 10, // 常時含める主要人物数
      tokenEstimatePerChar: 2.5, // 日本語テキストの概算トークン/文字
    },
    // 候補マージ時の一致信頼度しきい値
    matching: {
      confidenceThreshold: 0.75,
    },
    // 重要度スコアリング（出演度）設定
    prominence: {
      weights: {
        events: 0.4,
        dialogue: 0.3,
        chunkSpan: 0.2,
        recent: 0.1,
      },
      recentWindow: 10, // 直近アクティビティと見なすチャンク数
    },
    // 主要アクション抽出の数のデフォルト
    majorActions: {
      min: 3,
      max: 7,
    },
    // スナップショットフォーマット設定
    snapshotFormatting: {
      header: '【登場人物情報（これまでに登場済み）】',
      emptyMessage: '',
      characterPrefix: '◆',
      aliasesLabel: '別名',
      summaryLabel: '説明',
      actionsLabel: '主な行動',
      maxAliases: 5,
      maxSummaryLength: 150,
      maxActions: 3,
    },
  },

  // ログ設定
  logging: {
    level: 'info' as 'error' | 'warn' | 'info' | 'debug',
    enableFileLogging: true,
    enableConsoleLogging: true,
    logDir: 'logs',
    rotateDaily: true,
    maxLogFiles: 7, // 最大ログファイル数
  },

  // 開発・デバッグ設定
  development: {
    enableVerboseLogging: false,
    enablePerformanceMetrics: true,
    enableErrorDetails: true,
    mockExternalAPIs: false, // 外部API呼び出しをモック化
    enableTestMode: false, // テストモード
  },
  // UI設定（ポーリング間隔などの一元化）
  ui: {
    progress: {
      tokenUsagePollIntervalMs: 2000,
      // レイアウト進捗の現行エピソードに与える配点（0.0〜1.0）
      currentEpisodeProgressWeight: 0.5,
      // エピソード番号のパース失敗時のフォールバック
      defaultEpisodeNumber: 1,
    },
    logs: {
      // 進捗ログの最大保持件数
      maxEntries: 50,
      // ログ表示コンテナの最大高さ（vh単位）
      maxVisibleLogHeightVh: 60,
    },
  },
}

export type AppConfig = typeof appConfig

// 環境変数オーバーライド用の変更可能な型
type MutableAppConfig = {
  [K in keyof AppConfig]: AppConfig[K] extends Record<string, unknown>
    ? { [P in keyof AppConfig[K]]: AppConfig[K][P] }
    : AppConfig[K]
}

// 環境変数オーバーライド機能
export function getAppConfigWithOverrides(): AppConfig {
  // ディープコピーを作成して設定をオーバーライド
  const config = JSON.parse(JSON.stringify(appConfig)) as MutableAppConfig

  // 環境変数による設定オーバーライド
  // LLM のデフォルトプロバイダーやモデル設定は llm.config.ts で扱います

  if (process.env.APP_CHUNKS_DEFAULT_SIZE) {
    config.chunking.defaultChunkSize = parseInt(process.env.APP_CHUNKS_DEFAULT_SIZE, 10)
  }

  if (process.env.APP_CHUNKS_DEFAULT_OVERLAP) {
    config.chunking.defaultOverlapSize = parseInt(process.env.APP_CHUNKS_DEFAULT_OVERLAP, 10)
  }

  if (process.env.APP_PROCESSING_MAX_CONCURRENT) {
    config.processing.maxConcurrentChunks = parseInt(process.env.APP_PROCESSING_MAX_CONCURRENT, 10)
  }

  if (process.env.APP_ENABLE_CACHING !== undefined) {
    config.features.enableCaching = process.env.APP_ENABLE_CACHING === 'true'
  }

  if (process.env.APP_LOG_LEVEL) {
    const level = process.env.APP_LOG_LEVEL as 'info' | 'error' | 'warn' | 'debug'
    if (['info', 'error', 'warn', 'debug'].includes(level)) {
      config.logging.level = level
    }
  }

  if (process.env.NODE_ENV === 'development') {
    config.development.enableVerboseLogging = true
    config.development.enableErrorDetails = true
  }

  // Vertical text feature flags / overrides (no secrets here)
  if (process.env.APP_RENDER_VERTICAL_TEXT_ENABLED !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
    config.rendering.verticalText.enabled = process.env.APP_RENDER_VERTICAL_TEXT_ENABLED === 'true'
  }
  if (process.env.APP_RENDER_VERTICAL_TEXT_MAX_CONCURRENT) {
    const n = parseInt(process.env.APP_RENDER_VERTICAL_TEXT_MAX_CONCURRENT, 10)
    if (!Number.isNaN(n) && n > 0) {
      config.rendering.verticalText.maxConcurrent = n
    }
  }
  if (process.env.APP_RENDER_VERTICAL_TEXT_FONT_SIZE) {
    const v = parseInt(process.env.APP_RENDER_VERTICAL_TEXT_FONT_SIZE, 10)
    if (!Number.isNaN(v) && v > 0) {
      config.rendering.verticalText.defaults.fontSize = v
    }
  }
  if (process.env.APP_RENDER_VERTICAL_TEXT_MAX_CHARS_PER_LINE) {
    const v = parseInt(process.env.APP_RENDER_VERTICAL_TEXT_MAX_CHARS_PER_LINE, 10)
    if (!Number.isNaN(v) && v > 0) {
      config.rendering.verticalText.defaults.maxCharsPerLine = v
    }
  }

  return config
}
