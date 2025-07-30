import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeNarrativeArc } from "@/agents/narrative-arc-analyzer";
import { prepareNarrativeAnalysisInput } from "@/utils/episode-utils";
import { saveEpisodeBoundaries } from "@/utils/storage";
import { EpisodeBoundary } from "@/types/episode";
import { appConfig } from "@/config/app.config";

const requestSchema = z.object({
  novelId: z.string(),
  startChunkIndex: z.number().int().min(0),
  targetChars: z.number().int().optional(),
  minChars: z.number().int().optional(),
  maxChars: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = requestSchema.parse(body);

    const input = await prepareNarrativeAnalysisInput({
      novelId: validatedData.novelId,
      startChunkIndex: validatedData.startChunkIndex,
      targetChars: validatedData.targetChars,
      minChars: validatedData.minChars,
      maxChars: validatedData.maxChars,
    });

    if (!input) {
      return NextResponse.json(
        {
          error: "Failed to prepare narrative analysis input",
          details: "Not enough chunks available or invalid chunk range",
        },
        { status: 400 }
      );
    }

    console.log(
      `Analyzing narrative arc for novel ${validatedData.novelId}, ` +
        `chunks ${input.chunks[0].chunkIndex}-${
          input.chunks[input.chunks.length - 1].chunkIndex
        }, ` +
        `total chars: ${input.chunks.reduce((sum, c) => sum + c.text.length, 0)}`
    );

    const boundaries = await analyzeNarrativeArc(input);

    await saveEpisodeBoundaries(validatedData.novelId, boundaries);

    const responseData = {
      novelId: validatedData.novelId,
      analyzedChunks: {
        start: input.chunks[0].chunkIndex,
        end: input.chunks[input.chunks.length - 1].chunkIndex,
        count: input.chunks.length,
      },
      totalChars: input.chunks.reduce((sum, c) => sum + c.text.length, 0),
      boundaries: boundaries.map((b) => ({
        ...b,
        charRange: {
          start: { chunk: b.startChunk, char: b.startCharIndex },
          end: { chunk: b.endChunk, char: b.endCharIndex },
        },
      })),
      suggestions: boundaries.length === 0 ? [
        "No natural episode breaks found in this range",
        "Consider analyzing a larger text range",
        "The content might need manual division",
      ] : undefined,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Narrative arc analysis error:", error);

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
        error: "Failed to analyze narrative arc",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}