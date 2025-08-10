import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/services/database";
import { JobNarrativeProcessor } from "@/services/job-narrative-processor";
import {
  ApiError,
  createErrorResponse,
  ValidationError,
} from "@/utils/api-error";

export async function POST(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    if (!params.jobId || params.jobId === "undefined") {
      throw new ValidationError("Invalid jobId");
    }
    const dbService = new DatabaseService();
    const processor = new JobNarrativeProcessor(dbService);

    // ジョブが再開可能かチェック
    const canResume = await processor.canResumeJob(params.jobId);
    if (!canResume) {
      throw new ApiError(
        "Job cannot be resumed. It may be completed or not found.",
        400,
        "INVALID_STATE"
      );
    }

    // バックグラウンドで処理を再開
    // 実際の実装では、ワーカーキューやバックグラウンドジョブシステムを使用すべき
    processor
      .processJob(params.jobId, (progress) => {
        console.log(`Job ${params.jobId} progress:`, {
          processedChunks: progress.processedChunks,
          totalChunks: progress.totalChunks,
          episodes: progress.episodes.length,
        });
      })
      .catch((error) => {
        console.error(`Error processing job ${params.jobId}:`, error);
      });

    return NextResponse.json({
      message: "Job resumed successfully",
      jobId: params.jobId,
    });
  } catch (error) {
    console.error("Error resuming job:", error);
    return createErrorResponse(error, "Failed to resume job");
  }
}
