import { NextRequest, NextResponse } from "next/server";
import { chunkAnalyzerAgent } from "@/agents/chunk-analyzer";
import { z } from "zod";
import { getConfig } from "@/config/config-loader";
import { getDatabase, runQuery, getOne, initializeDatabase, closeDatabase } from "@/lib/db";
import { saveJson, getChunkAnalysisPath, loadJson, getChunkTextPath } from "@/lib/storage/r2";
import { 
  getAnalysisCacheKey, 
  getCachedData, 
  setCachedData, 
  getCacheTTL, 
  isCacheEnabled 
} from "@/lib/cache/kv";

// リクエストボディのバリデーションスキーマ
const analyzeChunkSchema = z.object({
  chunkId: z.string(),
  chunkText: z.string(),
  chunkIndex: z.number(),
  novelId: z.string(),
  previousChunkText: z.string().optional(),
  nextChunkText: z.string().optional(),
});

// 5要素の出力スキーマ
const textAnalysisOutputSchema = z.object({
  summary: z.string().describe("このチャンクの内容要約（100-200文字）"),
  characters: z.array(z.object({
    name: z.string(),
    description: z.string(),
    firstAppearance: z.number(),
  })),
  scenes: z.array(z.object({
    location: z.string(),
    time: z.string().optional(),
    description: z.string(),
    startIndex: z.number(),
    endIndex: z.number(),
  })),
  dialogues: z.array(z.object({
    speakerId: z.string(),
    text: z.string(),
    emotion: z.string().optional(),
    index: z.number(),
  })),
  highlights: z.array(z.object({
    type: z.enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence']),
    description: z.string(),
    importance: z.number().min(1).max(10).describe("重要度を1-10に変更"),
    startIndex: z.number(),
    endIndex: z.number(),
    text: z.string().optional().describe("該当部分のテキスト抜粋"),
  })),
  situations: z.array(z.object({
    description: z.string(),
    index: z.number(),
  })),
});

// キャッシュされる分析結果の型
type CachedAnalysisResult = {
  chunkId: string;
  chunkIndex: number;
  novelId: string;
  analysisId: string;
  analysisPath: string;
  analysis: z.infer<typeof textAnalysisOutputSchema>;
  summary: {
    textSummary: string;
    characterCount: number;
    sceneCount: number;
    dialogueCount: number;
    highlightCount: number;
    situationCount: number;
  };
};

export async function POST(request: NextRequest) {
  let db = null;
  
  try {
    // データベースの初期化（開発環境用）
    if (process.env.NODE_ENV === 'development') {
      await initializeDatabase();
    }
    
    // リクエストボディの取得とバリデーション
    const body = await request.json();
    const validatedData = analyzeChunkSchema.parse(body);
    
    const { chunkId, chunkText, chunkIndex, novelId, previousChunkText, nextChunkText } = validatedData;
    
    // データベース接続を取得
    db = await getDatabase();
    
    // 前後のチャンクテキストを取得（渡されていない場合）
    let prevChunkText = previousChunkText;
    let nextChunkText_ = nextChunkText;
    
    if (!prevChunkText || !nextChunkText_) {
      // 前のチャンクを取得
      if (!prevChunkText) {
        if (chunkIndex > 0) {
          const prevChunkMeta = await getOne(db,
            `SELECT id FROM chunks WHERE novel_id = ? AND chunk_index = ?`,
            [novelId, chunkIndex - 1]
          );
          if (prevChunkMeta?.id) {
            // チャンクテキストをストレージから読み込む
            const chunkData = await loadJson(getChunkTextPath(prevChunkMeta.id), 'CHUNKS_STORAGE');
            prevChunkText = chunkData?.text || '（開始点）';
          } else {
            prevChunkText = '（開始点）';
          }
        } else {
          prevChunkText = '（開始点）';
        }
      }
      
      // 次のチャンクを取得
      if (!nextChunkText_) {
        const nextChunkMeta = await getOne(db,
          `SELECT id FROM chunks WHERE novel_id = ? AND chunk_index = ?`,
          [novelId, chunkIndex + 1]
        );
        
        if (nextChunkMeta?.id) {
          // チャンクテキストをストレージから読み込む
          const chunkData = await loadJson(getChunkTextPath(nextChunkMeta.id), 'CHUNKS_STORAGE');
          nextChunkText_ = chunkData?.text || '';
        } else {
          // 最後のチャンクかどうか確認
          const maxChunkIndex = await getOne(db,
            `SELECT MAX(chunk_index) as max_index FROM chunks WHERE novel_id = ?`,
            [novelId]
          );
          nextChunkText_ = (maxChunkIndex?.max_index === chunkIndex) ? '（終了）' : '';
        }
      }
    }
    
    // キャッシュが有効か確認
    const cacheEnabled = await isCacheEnabled('analysis');
    
    // キャッシュから取得を試みる
    if (cacheEnabled) {
      const cacheKey = getAnalysisCacheKey(novelId, chunkIndex);
      const cachedResult = await getCachedData<CachedAnalysisResult>(cacheKey);
      
      if (cachedResult) {
        console.log(`Cache hit for chunk analysis: ${cacheKey}`);
        return NextResponse.json({
          success: true,
          data: cachedResult,
          cached: true,
        });
      }
    }
    
    // 設定を取得
    const config = getConfig();
    
    // プロンプトテンプレートを設定から取得
    let promptTemplate: string;
    try {
      promptTemplate = config.getPath<string>('llm.textAnalysis.userPromptTemplate');
    } catch {
      // 設定が見つからない場合はデフォルトを使用
      promptTemplate = `以下の小説テキストを分析して、5つの要素（キャラクター、場面、対話、ハイライト、状況）を抽出してください。

チャンク番号: {{chunkIndex}}
テキスト:
{{chunkText}}`;
    }
    
    // プロンプトを生成
    const prompt = promptTemplate
      .replace('{{chunkIndex}}', chunkIndex.toString())
      .replace('{{chunkText}}', chunkText)
      .replace('{{previousChunkText}}', prevChunkText || '（開始点）')
      .replace('{{nextChunkText}}', nextChunkText_ || '（終了）');
    
    // Mastraエージェントを使用してチャンクを分析（構造化出力）
    const result = await chunkAnalyzerAgent.generate(prompt, {
      output: textAnalysisOutputSchema,
    });
    
    // チャンクが存在するか確認
    const chunk = await getOne(db, 
      `SELECT id FROM chunks WHERE id = ?`, 
      [chunkId]
    );
    
    if (!chunk) {
      return NextResponse.json(
        {
          success: false,
          error: "指定されたチャンクが見つかりません",
        },
        { status: 404 }
      );
    }
    
    // 分析結果をR2に保存
    const analysisPath = getChunkAnalysisPath(novelId, chunkIndex);
    const analysisData = {
      chunkId,
      chunkIndex,
      novelId,
      analysis: result.object,
      processedAt: new Date().toISOString(),
    };
    
    await saveJson(analysisPath, analysisData, 'ANALYSIS_STORAGE');
    
    // チャンク分析をデータベースに記録
    const analysisId = crypto.randomUUID();
    await runQuery(db,
      `INSERT INTO chunk_analyses (id, chunk_id, analysis_file, character_count, scene_count, dialogue_count, highlight_count, situation_count) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        analysisId,
        chunkId,
        analysisPath,
        result.object.characters.length,
        result.object.scenes.length,
        result.object.dialogues.length,
        result.object.highlights.length,
        result.object.situations.length,
      ]
    );
    
    // レスポンスデータを構築
    const responseData = {
      chunkId,
      chunkIndex,
      novelId,
      analysisId,
      analysisPath,
      analysis: result.object,
      summary: {
        textSummary: result.object.summary,
        characterCount: result.object.characters.length,
        sceneCount: result.object.scenes.length,
        dialogueCount: result.object.dialogues.length,
        highlightCount: result.object.highlights.length,
        situationCount: result.object.situations.length,
      },
    };
    
    // キャッシュに保存
    if (cacheEnabled) {
      const cacheKey = getAnalysisCacheKey(novelId, chunkIndex);
      const cacheTTL = getCacheTTL('analysis');
      await setCachedData(cacheKey, responseData, cacheTTL);
      console.log(`Cached chunk analysis: ${cacheKey} with TTL: ${cacheTTL}s`);
    }
    
    // レスポンスの返却
    return NextResponse.json({
      success: true,
      data: responseData,
      cached: false,
    });
    
  } catch (error) {
    console.error("Chunk analysis error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: error.errors,
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze chunk",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    // データベース接続をクローズ
    if (db) {
      await closeDatabase(db);
    }
  }
}