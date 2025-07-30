import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NarrativeProcessor } from "@/services/narrative-processor";
import { getDatabase, getOne, closeDatabase } from "@/lib/db";

const requestSchema = z.object({
  novelId: z.string(),
  config: z.object({
    chunksPerBatch: z.number().int().min(5).max(50).optional(),
    overlapChars: z.number().int().min(100).max(2000).optional(),
    targetCharsPerEpisode: z.number().int().optional(),
    minCharsPerEpisode: z.number().int().optional(),
    maxCharsPerEpisode: z.number().int().optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  let db = null;
  
  try {
    const body = await request.json();
    const validatedData = requestSchema.parse(body);
    const { novelId, config } = validatedData;

    // データベースから小説情報を取得
    db = await getDatabase();
    const novel = await getOne(db, 
      `SELECT id, total_length FROM novels WHERE id = ?`,
      [novelId]
    );

    if (!novel) {
      return NextResponse.json(
        { error: "Novel not found" },
        { status: 404 }
      );
    }

    // チャンク数を取得
    const chunkCount = await getOne(db,
      `SELECT COUNT(*) as count FROM chunks WHERE novel_id = ?`,
      [novelId]
    );
    const totalChunks = chunkCount?.count || 0;

    if (totalChunks === 0) {
      return NextResponse.json(
        { error: "No chunks found for this novel" },
        { status: 400 }
      );
    }

    // プロセッサーを作成
    const processor = new NarrativeProcessor(config);

    // バックグラウンドで処理を開始（実際の実装では、ジョブキューを使用すべき）
    processor.processNovel(novelId, totalChunks, (state) => {
      console.log(`Progress: ${state.processedChunks}/${state.totalChunks} chunks processed`);
    }).catch(error => {
      console.error("Narrative processing error:", error);
    });

    return NextResponse.json({
      message: "Narrative processing started",
      novelId,
      totalChunks,
      status: "processing"
    });

  } catch (error) {
    console.error("API error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to start narrative processing",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    if (db) {
      await closeDatabase(db);
    }
  }
}

// 処理状態を確認するエンドポイント
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const novelId = searchParams.get("novelId");

  if (!novelId) {
    return NextResponse.json(
      { error: "novelId is required" },
      { status: 400 }
    );
  }

  try {
    const { loadNarrativeState } = await import("@/utils/narrative-state");
    const state = await loadNarrativeState(novelId);

    if (!state) {
      return NextResponse.json(
        { error: "No processing state found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      novelId: state.novelId,
      progress: {
        processed: state.processedChunks,
        total: state.totalChunks,
        percentage: Math.round((state.processedChunks / state.totalChunks) * 100)
      },
      episodesFound: state.episodes.length,
      isCompleted: state.isCompleted,
      lastUpdated: state.updatedAt,
    });

  } catch (error) {
    console.error("Error fetching state:", error);
    return NextResponse.json(
      { error: "Failed to fetch processing state" },
      { status: 500 }
    );
  }
}