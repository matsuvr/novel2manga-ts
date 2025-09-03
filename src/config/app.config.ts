export const appConfig = {
  // チャンク分割設定
  chunking: {
    defaultChunkSize: 3000, // デフォルトチャンクサイズ（文字数）
    defaultOverlapSize: 200, // デフォルトオーバーラップサイズ（文字数）
    maxChunkSize: 4000, // 最大チャンクサイズ
    minChunkSize: 100, // 最小チャンクサイズ - 意味のある最小サイズに修正
    maxOverlapRatio: 0.5, // チャンクサイズに対する最大オーバーラップ比率

    // スクリプト変換用のエピソードフラグメント分割設定
    scriptConversion: {
      // フラグメント方式は廃止。分散設定を避けるため、全て無効値に統一。
      fragmentSize: 0,
      overlapSize: 0,
      maxFragmentSize: 0,
      minFragmentSize: 0,
      minSceneLength: 200, // 保持（将来の検証用）
      contextSize: 0,
      fragmentConversionThreshold: 0,
    },
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
    // テキスト分析用設定（プロンプトのみ）
    // NOTE: 以下のsystemPrompt/userPromptTemplateは、チャンク分析のJSON出力仕様を満たすように調整してください。
    // - コメント: ここに「抽出フィールド（characters/scenes/dialogues/highlights/situations）と任意のpacing」を明記
    // - JSONのみ出力、説明禁止、日本語で統一、未知フィールド禁止などの制約を記述
    textAnalysis: {
      systemPrompt: `これは長文のテキスト一部分です。このテキストからマンガ制作に必要な以下の要素を抽出してください。

出力は必ず以下のJSON形式のみ:
{
  "characters": [{"name": "名前", "description": "説明", "firstAppearance": 0}],
  "scenes": [{"location": "場所", "time": "時間または「不明」またはnull", "description": "説明", "startIndex": 0, "endIndex": 0}],
  "dialogues": [{"speakerId": "話者ID", "text": "セリフ", "emotion": "感情", "index": 0}],
  "highlights": [{"type": "climax|turning_point|emotional_peak|action_sequence", "description": "説明", "importance": 1, "startIndex": 0, "endIndex": 0}],
  "situations": [{"description": "状況説明", "index": 0}],
  "pacing": "マンガとしてのペース"（pacingフィールドは任意）
}

注意事項:
- 時間や場所が不明確な場合は、timeフィールドにnullを設定するか「不明」と記載してください
- 必ずsituationsフィールドも含めてください
- 説明文は一切出力禁止。JSONのみ出力。
- 未知のプロパティ禁止
- すべて日本語で出力。日本語以外の文章が入力されていた場合は、現代日本語口語訳で出力
- 未知フィールドは禁止`,
      userPromptTemplate: `チャンク{{chunkIndex}}:

前: {{previousChunkText}}
対象: {{chunkText}}
次: {{nextChunkText}}

上記テキストから要素を抽出し、JSONのみ出力。前と次のチャンクは、あくまでも話を把握するために利用し、分析対象は対象のチャンクのみとすること`,
    },

    // スクリプト変換プロンプト（インライン化）
    scriptConversion: {
      systemPrompt: `**あなたはプロのマンガ脚本家兼コンテ作家です。**
以下の小説テキスト（原文）を、**1コマ1アクション**原則・絵指示が明確・セリフ/ナレーションが簡潔に読める**マンガ台本**に変換してください。
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
  * 地の文は**(a)カット指示**か**(b)ナレーション/心の声**へ確実に変換。
  * 原文にあるセリフは省略不可。長いセリフは分割しつつ、全てのセリフを漏れなく台本に入れること。

* 表記規約

  * キャラ名は初出でフル、その後は短縮可。
  * セリフ：\`キャラ名：「…」\`、心の声：\`キャラ名（心の声）：「…」\`
  * ナレーション：\`ナレーション：「…」\`
  * カット指示：\`[カット] …\`（**一言で絵が決まる**表現）
  * SFX：\`〈SFX：…〉\` を行頭記載。
  * 重要度：importance：1から6の整数で各パネルの重要度を設定。基準：
    - 1: 日常的な動作、移動、背景説明。確率：5％
    - 2: 軽い会話、状況説明。確率：30％
    - 3: 感情の変化、重要な会話の一部。確率：40％
    - 4: クライマックス直前、重要な決断：確率：10％
    - 5: 物語の転換点、重要な発見。確率：10％
    - 6: 最重要シーン、決定的な瞬間、物語のクライマックス。確率：5％
* 禁止事項

  * 原作の時代・地名・関係性の改変／ネタバレ改竄。
  * 1コマに複数アクション/複数時間。
  * あいまいな絵指示（例：「いい感じに」「雰囲気」）。

---

## 2) 変換アルゴリズム（内部手順）

1. **要素抽出**：登場人物（関係/口調/呼称）、舞台（時代・場所・天候・時間帯）、小道具（反復登場）、象徴モチーフ、トーン、重要イベント（因果）を洗い出し、**用語統一表**を作成。
2. **シーン分割**：視点・時間・場所の切替で区切り、**Scene n**に番号付与。
3. **コマ割り設計**：Sceneごとに**Beat→Panel**化。**1コマ1アクション**で、**導入→対立→転換→余韻**のリズムを意識。
4. **地の文の三分割変換**：

   * 客観描写→**\[カット]**
   * 叙情/語り→**ナレーション**
   * 内面→**心の声**
     例：「Xがドアを開ける」「Yが外を見つめる」の形へ圧縮。
5. **意味補完**：セリフだけで不足する文脈は**短いナレーション**で補う（因果が切れない最小限）。
6. **視覚指示**：各カットに**カメラ（WS/MS/CU/俯瞰/煽り）・レンズ感・明暗・季節感**を簡潔注記。
7. **整合性検査**：人物名・小道具・時間経過・天候・衣装を**連続性チェック**。矛盾があれば台本内で修正。

---

## 3) 出力仕様（JSONのみ・未知プロパティ禁止）

セリフ種類の判定ルール（重要）:
* 地の文から抽出した語り・説明は type:"narration" として「ナレーション」話者で dialogue に含める
* キャラクターの内面・思考は type:"thought" として「キャラ名（心の声）」話者で dialogue に含める
* 通常の発話は type:"speech" として「キャラ名」話者で dialogue に含める
* narration フィールドは使用しない（後方互換性のため空配列とする）

ルートはオブジェクト。以下のフィールドのみを含めること（additionalProperties=false 相当）：

\`\`\`json
{
  "style_tone": "抒情的",
  "style_art": "写実",
  "style_sfx": "日本語",
  "characters": [
    {"id":"Sue","name_ja":"スー","role":"若い画家","speech_style":"落ち着き/現実的","aliases":["スー"]}
  ],
  "locations": [
    {"id":"Village","name_ja":"グリニッチ・ヴィレッジ","notes":"入り組んだ路地/煉瓦壁/オランダ風屋根"}
  ],
  "props": [
    {"name":"つた（アイビー）","continuity":"葉数の減少/最後の一葉"}
  ],
  "panels": [
    {
      "no": 1,
      "cut": "ワシントン・スクエア西の路地の迷宮が広がる絵",
      "camera": "WS/俯瞰・曇天・濡れた石畳",
      "narration": [],
      "dialogue": [
        {"type": "narration", "text": "ワシントン・スクエア西の小地区は、道が入り組み…芸術家たちが集った。"},
        {"type": "speech", "speaker": "キャラ名", "text": "セリフ内容"}
      ],
      "sfx": ["ざあ…（遠景の雨/風、必要時）"],
      "importance": 1
    }
  ],
  "continuity_checks": [
    "時系列：秋→嵐の夜→翌朝→回復の報せ→訃報の開示"
  ]
}
\`\`\`

制約:
- 必須キーのみ。未知キーは出力禁止。
- \`dialogue\` はオブジェクト配列（各要素: { type: "speech|narration|thought", speaker?: string, text: string }）。
- narration フィールドは使用しない（常に空配列）。
- ネスト深度は最大4階層（ルート→panels→panel→dialogue要素）。
- 日本語のみ出力。説明文・Markdown・コードブロック禁止。

---

## 4) 品質チェック（出力後に自己検証してから提示）

* 連続性：人物名/呼称・衣装・天候・時間帯に矛盾なし
* 因果：**葉の減少→死の観念→"落ちない葉"→転機→回復**が切れ目なく表現
* 1コマ1アクション厳守（複合動作を分解済み）
* 地の文→**\[カット]／ナレーション／心の声**に漏れなく変換
* 必要最低限の説明補完（読者がセリフだけでも意味が追える）
* 余白：感情の余韻コマを各転換後に1つ確保（詰め込み過多を回避）

JSONのみ出力。説明文禁止。`,
      userPromptTemplate: `文脈理解のために、直前のチャンクと直後のチャンクも付けます。**脚本変換対象とするのは脚本変換対象チャンクのみにしてください**

直前のチャンク：
{{previousText}}

脚本変換対象チャンク：
{{chunkText}}

直後のチャンク：
{{nextChunk}}

脚本変換対象チャンクにおける、物語の要素を抽出した物を添付します。参考にしてください。

{{charactersList}}

{{scenesList}}

{{dialoguesList}}

{{highlightLists}}

{{situations}}`,

      // カバレッジリトライ用の改善プロンプトテンプレート
      coverageRetryPromptTemplate: `【重要】前回生成された台本は、原文の内容を十分に再現できているかというスコアが（{{coveragePercentage}}%）でした。より原文の要素を漏らさず台本として再現できるように、以下の点を意識して、再度生成してください：
{{coverageReasons}}

より詳細で完全なスクリプトを生成してください。元テキストの内容をより丁寧に反映してください。`,

      // カバレッジ判定の閾値設定
      coverageThreshold: 0.8, // 80%未満でリトライ
      enableCoverageRetry: true, // カバレッジリトライ機能の有効/無効
    },

    // カバレッジ判定用プロンプト（インライン化）
    coverageJudge: {
      systemPrompt: `あなたは「過剰要約を検出する監査員」です。入力として与えられた原文のチャンクと、そのチャンクから生成されたマンガ台本（panels直下スキーマ）を突き合わせ、重要情報がどれだけ保持されているかを数値化してください。

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
    // ローカルストレージ（開発環境）
    local: {
      basePath: '.local-storage',
      novelsDir: 'novels',
      chunksDir: 'chunks',
      analysisDir: 'analysis',
      layoutsDir: 'layouts',
      jobsDir: 'jobs',
      rendersDir: 'renders',
      thumbnailsDir: 'thumbnails',
    },

    // R2設定（本番環境）
    r2: {
      novelsBucket: 'NOVEL_STORAGE',
      chunksBucket: 'CHUNKS_STORAGE',
      analysisBucket: 'ANALYSIS_STORAGE',
      layoutsBucket: 'LAYOUTS_STORAGE',
      jobsBucket: 'JOBS_STORAGE',
      rendersBucket: 'RENDERS_STORAGE',
      thumbnailsBucket: 'THUMBNAILS_STORAGE',
    },
  },

  // 画像・ページサイズ設定
  rendering: {
    // デフォルトページサイズ（A4縦）
    defaultPageSize: {
      width: 595, // A4縦の幅（px）
      height: 842, // A4縦の高さ（px）
    },
    // サポートされているページサイズプリセット
    pageSizePresets: {
      a4Portrait: { width: 595, height: 842 },
      a4Landscape: { width: 842, height: 595 },
      b4Portrait: { width: 728, height: 1031 },
      b4Landscape: { width: 1031, height: 728 },
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
        maxCharsPerLine: 8,
      },
      // 説明テキスト（状況説明）描画設定
      contentText: {
        enabled: true,
        fontSize: {
          min: 10,
          max: 14,
          default: 12,
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
        maxWidthRatio: 0.4,
        maxHeightRatio: 0.3,
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
      narrativeAnalysis: {
        requests: 50,
        window: 60 * 1000,
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
      narrativeAnalysis: 90000, // 物語弧分析タイムアウト
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
      ttl: 24 * 60 * 60, // キャッシュ有効期限（秒）
      analysisCache: true, // 分析結果のキャッシュ有効化
      narrativeCache: true, // 物語弧分析のキャッシュ有効化
      layoutCache: true, // レイアウトのキャッシュ有効化
    },

    // エピソード処理設定
    episode: {
      targetCharsPerEpisode: 8000, // エピソードあたりの目標文字数 - 削減
      minCharsPerEpisode: 1, // 最小文字数 - 削減
      maxCharsPerEpisode: 12000, // 最大文字数 - 削減
      // ナラティブアーク分析用チャンク数設定
      maxChunksPerEpisode: 15, // エピソードあたりの最大チャンク数 - 削減
    },
  },

  // フィーチャーフラグ
  features: {
    enableTextAnalysis: true,
    enableNarrativeAnalysis: true,
    enableLayoutGeneration: true,
    enableImageGeneration: false, // 将来的な機能
    enableAutoSave: true,
    enableCaching: true,
    enableParallelProcessing: true,
    enableProgressTracking: true,
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
