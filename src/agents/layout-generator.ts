import { Agent } from "@mastra/core";
import { z } from "zod";
import { 
  EpisodeData, 
  MangaLayout, 
  Page, 
  Panel, 
  LayoutGenerationConfig,
  ChunkData
} from "@/types/panel-layout";
import { selectLayoutTemplate, layoutRules } from "@/utils/layout-templates";
import { appConfig } from "@/config/app.config";

// LLMへの入力スキーマ
const layoutGenerationInputSchema = z.object({
  episodeData: z.object({
    episodeNumber: z.number(),
    episodeTitle: z.string().optional(),
    chunks: z.array(z.object({
      chunkIndex: z.number(),
      summary: z.string(),
      hasHighlight: z.boolean(),
      highlightImportance: z.number().optional(),
      dialogueCount: z.number(),
      sceneDescription: z.string(),
      characters: z.array(z.string())
    }))
  }),
  targetPages: z.number(),
  layoutConstraints: z.object({
    avoidEqualGrid: z.boolean(),
    preferVariedSizes: z.boolean(),
    ensureReadingFlow: z.boolean()
  })
});

// LLMからの出力スキーマ
const layoutGenerationOutputSchema = z.object({
  pages: z.array(z.object({
    pageNumber: z.number(),
    panels: z.array(z.object({
      content: z.string(),
      dialogues: z.array(z.object({
        speaker: z.string(),
        text: z.string()
      })).optional(),
      sourceChunkIndex: z.number(),
      importance: z.number().min(1).max(10),
      suggestedSize: z.enum(['small', 'medium', 'large', 'extra-large'])
    }))
  }))
});

export class LayoutGeneratorAgent extends Agent {
  constructor() {
    const provider = appConfig.llm.layoutGeneration.provider === 'default' 
      ? appConfig.llm.defaultProvider 
      : appConfig.llm.layoutGeneration.provider;
    
    const model = appConfig.llm.layoutGeneration.modelOverrides[provider] || 
      appConfig.llm.providers[provider].model;

    super({
      name: "layout-generator",
      instructions: appConfig.llm.layoutGeneration.instructions,
      model: model,
    });
  }

  async generateLayout(
    episodeData: EpisodeData,
    config: LayoutGenerationConfig
  ): Promise<MangaLayout> {
    // エピソードデータをLLM用に簡略化
    const simplifiedChunks = episodeData.chunks.map(chunk => ({
      chunkIndex: chunk.chunkIndex,
      summary: chunk.analysis.summary,
      hasHighlight: chunk.analysis.highlights.length > 0,
      highlightImportance: Math.max(...chunk.analysis.highlights.map(h => h.importance), 0),
      dialogueCount: chunk.analysis.dialogues.length,
      sceneDescription: chunk.analysis.scenes.map(s => s.setting).join(", "),
      characters: chunk.analysis.characters.map(c => c.name)
    }));

    // LLMでパネル内容を生成
    const layoutInput = {
      episodeData: {
        episodeNumber: episodeData.episodeNumber,
        episodeTitle: episodeData.episodeTitle,
        chunks: simplifiedChunks
      },
      targetPages: episodeData.estimatedPages,
      layoutConstraints: {
        avoidEqualGrid: true,
        preferVariedSizes: true,
        ensureReadingFlow: true
      }
    };

    const llmResponse = await this.generate({
      input: layoutInput,
      schema: layoutGenerationOutputSchema,
      messages: [
        {
          role: "system",
          content: "エピソードデータからマンガのコマ割りを生成してください。各ページのパネル構成を決定し、内容とセリフを配置してください。"
        }
      ]
    });

    // LLMの出力を実際のレイアウトに変換
    const pages: Page[] = [];
    
    for (const pageData of llmResponse.pages) {
      const panelCount = pageData.panels.length;
      const hasHighlight = pageData.panels.some(p => p.importance >= 7);
      const isClimax = pageData.panels.some(p => p.importance >= 9);
      const hasDialogue = pageData.panels.some(p => p.dialogues && p.dialogues.length > 0);

      // テンプレートを選択
      const template = selectLayoutTemplate(panelCount, hasHighlight, isClimax, hasDialogue);
      
      // パネルを生成
      const panels: Panel[] = pageData.panels.map((panelData, index) => {
        const templatePanel = template.panels[index] || template.panels[0];
        
        // 重要度に応じてサイズを調整
        let sizeMultiplier = 1.0;
        if (panelData.suggestedSize === 'extra-large') sizeMultiplier = 1.5;
        else if (panelData.suggestedSize === 'large') sizeMultiplier = 1.2;
        else if (panelData.suggestedSize === 'small') sizeMultiplier = 0.8;

        // サイズ調整（ページからはみ出さないように）
        const adjustedSize = {
          width: Math.min(templatePanel.size.width * sizeMultiplier, 1.0),
          height: Math.min(templatePanel.size.height * sizeMultiplier, 1.0)
        };

        return {
          id: index + 1,
          position: templatePanel.position,
          size: adjustedSize,
          content: panelData.content,
          dialogues: panelData.dialogues,
          sourceChunkIndex: panelData.sourceChunkIndex,
          importance: panelData.importance
        };
      });

      // レイアウトルールをチェック
      if (layoutRules.forbidden.isEqualGrid(panels)) {
        console.warn(`Page ${pageData.pageNumber} has equal grid layout, adjusting...`);
        // サイズを微調整して均等分割を避ける
        panels.forEach((panel, i) => {
          const adjustment = 0.05 + (i * 0.02);
          panel.size.width += (i % 2 === 0) ? adjustment : -adjustment;
          panel.size.height += (i % 2 === 1) ? adjustment : -adjustment;
        });
      }

      pages.push({
        page_number: pageData.pageNumber,
        panels
      });
    }

    return {
      title: episodeData.episodeTitle || `エピソード${episodeData.episodeNumber}`,
      created_at: new Date().toISOString().split('T')[0],
      episodeNumber: episodeData.episodeNumber,
      episodeTitle: episodeData.episodeTitle,
      pages
    };
  }
}

// レイアウト生成関数
export async function generateMangaLayout(
  episodeData: EpisodeData,
  config?: Partial<LayoutGenerationConfig>
): Promise<MangaLayout> {
  const fullConfig: LayoutGenerationConfig = {
    panelsPerPage: {
      min: 3,
      max: 6,
      average: 4.5
    },
    dialogueDensity: 0.6,
    visualComplexity: 0.7,
    highlightPanelSizeMultiplier: 2.0,
    readingDirection: 'right-to-left',
    ...config
  };

  const agent = new LayoutGeneratorAgent();
  return await agent.generateLayout(episodeData, fullConfig);
}