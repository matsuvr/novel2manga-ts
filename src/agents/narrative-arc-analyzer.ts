import { Agent } from "@mastra/core";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@/lib/llm/openrouter-provider";
import { NarrativeAnalysisInput, EpisodeBoundary } from "@/types/episode";
import { appConfig } from "@/config/app.config";
import { getConfig } from "@/config/config-loader";

function getModel() {
  const episodeConfig = appConfig.episode.narrativeAnalysis;
  const providerName = episodeConfig.provider === 'default' 
    ? appConfig.llm.defaultProvider 
    : episodeConfig.provider;
  
  const modelName = episodeConfig.modelOverrides[providerName];

  switch (providerName) {
    case 'openai':
      return openai(modelName, { apiKey: appConfig.llm.providers.openai.apiKey! });
    case 'gemini':
      return google(modelName, { apiKey: appConfig.llm.providers.gemini.apiKey! });
    case 'groq':
      return createGroq({ apiKey: appConfig.llm.providers.groq.apiKey! })(modelName);
    case 'local':
      return createOpenAI({ 
        baseURL: appConfig.llm.providers.local.baseURL,
        apiKey: 'dummy-key'
      })(modelName);
    case 'openrouter':
      return createOpenRouter({ apiKey: appConfig.llm.providers.openrouter.apiKey! })(modelName);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

const narrativeArcAnalyzer = new Agent({
  name: "Narrative Arc Analyzer",
  instructions: appConfig.episode.narrativeAnalysis.systemPrompt,
  model: getModel(),
});

export async function analyzeNarrativeArc(
  input: NarrativeAnalysisInput
): Promise<EpisodeBoundary[]> {
  console.log('analyzeNarrativeArc called with:', {
    chunks: input.chunks.length,
    targetChars: input.targetCharsPerEpisode,
  });
  
  const targetPages = Math.round(input.targetCharsPerEpisode / appConfig.episode.charsPerPage);
  const minPages = Math.round(input.minCharsPerEpisode / appConfig.episode.charsPerPage);
  const maxPages = Math.round(input.maxCharsPerEpisode / appConfig.episode.charsPerPage);

  const chunkSummaries = input.chunks
    .map(
      (chunk) => `
チャンク${chunk.chunkIndex}:
要約: ${chunk.summary || "なし"}
登場人物: ${chunk.characters?.join("、") || "なし"}
文字数: ${chunk.text.length}文字
`
    )
    .join("\n");

  const highlightsInfo = input.chunks
    .flatMap((chunk) =>
      (chunk.highlights || []).map((h) => ({
        chunkIndex: chunk.chunkIndex,
        ...h,
      }))
    )
    .filter((h) => h.importance >= 6)
    .map(
      (h) => `
- チャンク${h.chunkIndex}: ${h.description} (重要度: ${h.importance})
  ${h.context || ""}`
    )
    .join("\n");

  const characterActions = input.chunks
    .flatMap((chunk) => {
      const actions: string[] = [];
      if (chunk.summary) {
        const matches = chunk.summary.match(/「[^」]+」/g) || [];
        matches.forEach((match) => {
          actions.push(`チャンク${chunk.chunkIndex}: ${match}`);
        });
      }
      return actions;
    })
    .join("\n");

  const fullText = input.chunks.map((chunk) => chunk.text).join("\n\n");

  const userPrompt = appConfig.episode.narrativeAnalysis.userPromptTemplate
    .replace('{{chunkCount}}', input.chunks.length.toString())
    .replace('{{startIndex}}', input.chunks[0].chunkIndex.toString())
    .replace('{{endIndex}}', input.chunks[input.chunks.length - 1].chunkIndex.toString())
    .replace('{{totalChars}}', fullText.length.toString())
    .replace('{{targetPages}}', targetPages.toString())
    .replace('{{minPages}}', minPages.toString())
    .replace('{{maxPages}}', maxPages.toString())
    .replace('{{chunkSummaries}}', chunkSummaries)
    .replace('{{highlightsInfo}}', highlightsInfo || "なし")
    .replace('{{characterActions}}', characterActions || "なし")
    .replace('{{fullText}}', fullText);

  const responseSchema = z.object({
    boundaries: z.array(
      z.object({
        startChunk: z.number(),
        startCharIndex: z.number(),
        endChunk: z.number(),
        endCharIndex: z.number(),
        episodeNumber: z.number(),
        title: z.string().optional(),
        summary: z.string().optional(),
        estimatedPages: z.number(),
        confidence: z.number().min(0).max(1),
        reasoning: z.string(),
      })
    ),
    overallAnalysis: z.string(),
    suggestions: z.array(z.string()).optional(),
  });

  try {
    const result = await narrativeArcAnalyzer.generate([
      { role: "user", content: userPrompt }
    ], {
      output: responseSchema,
    });

    if (!result.object) {
      throw new Error("Failed to generate narrative analysis");
    }

    return result.object.boundaries;
  } catch (error) {
    console.error("Narrative arc analysis error:", error);
    throw error;
  }
}

export function findOptimalBreakpoints(
  text: string,
  chunkIndex: number,
  targetPosition: number
): { position: number; context: string } {
  const searchRange = 500;
  const start = Math.max(0, targetPosition - searchRange);
  const end = Math.min(text.length, targetPosition + searchRange);
  const searchText = text.substring(start, end);

  const breakIndicators = [
    /[。！？」』】\n]+\s*$/gm,
    /第[一二三四五六七八九十\d]+[章話節]/g,
    /\n\s*[＊※◇◆■□●○★☆×]\s*\n/g,
    /\n\s*\d+\s*\n/g,
  ];

  let bestBreak = targetPosition;
  let bestScore = 0;

  for (const pattern of breakIndicators) {
    const matches = [...searchText.matchAll(pattern)];
    for (const match of matches) {
      if (match.index !== undefined) {
        const absolutePos = start + match.index + match[0].length;
        const distance = Math.abs(absolutePos - targetPosition);
        const score = 1 - distance / searchRange;

        if (score > bestScore) {
          bestScore = score;
          bestBreak = absolutePos;
        }
      }
    }
  }

  const contextStart = Math.max(0, bestBreak - 100);
  const contextEnd = Math.min(text.length, bestBreak + 100);
  const context = text.substring(contextStart, contextEnd);

  return {
    position: bestBreak,
    context: context,
  };
}