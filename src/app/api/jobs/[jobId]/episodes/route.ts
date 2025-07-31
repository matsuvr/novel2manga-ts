import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/services/database";
import { getD1Database } from "@/utils/cloudflare-env";

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const db = getD1Database();
    const dbService = new DatabaseService(db);
    
    // ジョブの存在確認
    const job = await dbService.getExtendedJob(params.jobId);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }
    
    // エピソード一覧を取得
    const episodes = await dbService.getEpisodesByJobId(params.jobId);
    
    return NextResponse.json({
      jobId: params.jobId,
      totalEpisodes: episodes.length,
      episodes: episodes.map(ep => ({
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        summary: ep.summary,
        startChunk: ep.startChunk,
        endChunk: ep.endChunk,
        estimatedPages: ep.estimatedPages,
        confidence: ep.confidence
      }))
    });
  } catch (error) {
    console.error("Error fetching episodes:", error);
    return NextResponse.json(
      { error: "Failed to fetch episodes" },
      { status: 500 }
    );
  }
}