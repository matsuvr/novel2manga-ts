import { NextRequest, NextResponse } from "next/server";
import { chunkAnalyzerAgent } from "@/agents/chunk-analyzer";
import { z } from "zod";
import { getConfig } from "@/config/config-loader";
import { getDatabase, runQuery, getOne, initializeDatabase, closeDatabase } from "@/lib/db";
import { saveJson, getChunkAnalysisPath } from "@/lib/storage/r2";
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
});

// 5要素の出力スキーマ
const textAnalysisOutputSchema = z.object({
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
    importance: z.number().min(1).max(5),
    startIndex: z.number(),
    endIndex: z.number(),
  })),
  situations: z.array(z.object({
    description: z.string(),
    index: z.number(),
  })),
});

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
    
    const { chunkId, chunkText, chunkIndex, novelId } = validatedData;
    
    // キャッシュが有効か確認
    const cacheEnabled = await isCacheEnabled('analysis');
    
    // キャッシュから取得を試みる
    if (cacheEnabled) {
      const cacheKey = getAnalysisCacheKey(novelId, chunkIndex);
      const cachedResult = await getCachedData<any>(cacheKey);
      
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
      .replace('{{chunkText}}', chunkText);
    
    // Mastraエージェントを使用してチャンクを分析（構造化出力）
    const result = await chunkAnalyzerAgent.generate(prompt, {
      output: textAnalysisOutputSchema,
    });
    
    // データベース接続を取得
    db = await getDatabase();
    
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