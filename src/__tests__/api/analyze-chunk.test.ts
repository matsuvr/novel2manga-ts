import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyze/chunk/route";
import { StorageFactory } from "@/utils/storage";

// モック設定
vi.mock("@/agents/chunk-analyzer", () => ({
  getChunkAnalyzerAgent: vi.fn(() => ({
    generateObject: vi.fn().mockResolvedValue({
      summary: "チャンク分析結果の要約",
      characters: [
        {
          name: "テスト花子",
          description: "テスト用女性キャラクター",
          firstAppearance: 15,
        },
      ],
      scenes: [
        {
          location: "学校",
          time: "午後",
          description: "学校の教室でのシーン",
          startIndex: 0,
          endIndex: 200,
        },
      ],
      dialogues: [
        {
          speakerId: "テスト花子",
          text: "おはようございます",
          emotion: "cheerful",
          index: 100,
        },
      ],
      highlights: [
        {
          type: "emotional_peak" as const,
          description: "感情的な山場",
          importance: 7,
          startIndex: 150,
          endIndex: 180,
          text: "感情的な部分の抜粋",
        },
      ],
      situations: [
        {
          description: "緊迫した状況",
          index: 120,
        },
      ],
    }),
  })),
}));

vi.mock("@/utils/storage", async (importOriginal) => {
  const actual = await importOriginal();
  // 型エラー回避のため any キャスト（テスト用モック拡張）
  return {
    ...(actual as any),
    StorageFactory: {
      getDatabase: vi.fn(),
      getChunkStorage: vi.fn(),
      getAnalysisStorage: vi.fn(),
    },
  };
});

vi.mock("@/config", () => ({
  getTextAnalysisConfig: vi.fn(() => ({
    userPromptTemplate:
      "チャンク{{chunkIndex}}を分析してください: {{chunkText}} 前: {{previousChunkText}} 次: {{nextChunkText}}",
  })),
}));

describe("/api/analyze/chunk", () => {
  let testJobId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // ストレージのモック設定
    // StorageKeys 仕様変更: 各ストレージの baseDir で種別ディレクトリを提供し、キー自体には prefix を含めない
    const mockChunkStorage = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === `${testJobId}/chunk_0.txt`) {
          return {
            text: "これはテスト用のチャンクテキストです。分析対象のサンプルテキストです。",
          };
        }
        if (path === `${testJobId}/chunk_1.txt`) {
          return {
            text: "2番目のチャンクテキストです。継続する物語の内容です。",
          };
        }
        if (path === `${testJobId}/chunk_999.txt`) {
          return null; // 存在しないファイル
        }
        return null;
      }),
      put: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn().mockImplementation((path: string) => {
        return (
          path !== `${testJobId}/chunk_999.txt` &&
          !path.startsWith("nonexistent-job")
        );
      }),
    };

    const mockAnalysisStorage = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === `${testJobId}/chunk_1.json`) {
          // キャッシュテスト用：chunk_1は既に分析済み
          return {
            text: JSON.stringify({
              chunkIndex: 1,
              jobId: testJobId,
              analysis: {
                summary: "キャッシュされた分析結果",
                characters: [],
                scenes: [],
                dialogues: [],
                highlights: [],
                situations: [],
              },
              analyzedAt: "2025-01-01T00:00:00.000Z",
            }),
          };
        }
        return null;
      }),
      put: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn().mockImplementation((path: string) => {
        return path === `${testJobId}/chunk_1.json`;
      }),
    };

    vi.mocked(StorageFactory.getChunkStorage).mockResolvedValue(
      mockChunkStorage
    );
    vi.mocked(StorageFactory.getAnalysisStorage).mockResolvedValue(
      mockAnalysisStorage
    );

    testJobId = "test-chunk-job";
  });

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
  });

  describe("POST /api/analyze/chunk", () => {
    it("有効なリクエストでチャンク分析を実行する", async () => {
      const requestBody = {
        jobId: testJobId,
        chunkIndex: 0,
      };

      const request = new NextRequest(
        "http://localhost:3000/api/analyze/chunk",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.cached).toBe(false);
      expect(data.data).toBeDefined();
      expect(data.data.summary).toBe("チャンク分析結果の要約");
      expect(data.data.characters).toHaveLength(1);
      expect(data.data.scenes).toHaveLength(1);
      expect(data.data.dialogues).toHaveLength(1);
      expect(data.data.highlights).toHaveLength(1);
      expect(data.data.situations).toHaveLength(1);
    });

    it("既に分析済みのチャンクの場合はキャッシュされた結果を返す", async () => {
      const requestBody = {
        jobId: testJobId,
        chunkIndex: 1, // chunk_1はモックで既に分析済みに設定
      };

      const request = new NextRequest(
        "http://localhost:3000/api/analyze/chunk",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.cached).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.summary).toBe("キャッシュされた分析結果");
    });

    it("jobIdが未指定の場合は400エラーを返す", async () => {
      const requestBody = {
        chunkIndex: 0,
      };

      const request = new NextRequest(
        "http://localhost:3000/api/analyze/chunk",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Invalid request data");
    });

    it("chunkIndexが未指定の場合は400エラーを返す", async () => {
      const requestBody = {
        jobId: testJobId,
      };

      const request = new NextRequest(
        "http://localhost:3000/api/analyze/chunk",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Invalid request data");
    });

    it("chunkIndexが数値でない場合は400エラーを返す", async () => {
      const requestBody = {
        jobId: testJobId,
        chunkIndex: "invalid",
      };

      const request = new NextRequest(
        "http://localhost:3000/api/analyze/chunk",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Invalid request data");
    });

    it("存在しないチャンクファイルの場合は404エラーを返す", async () => {
      const requestBody = {
        jobId: testJobId,
        chunkIndex: 999, // 存在しないチャンク
      };

      const request = new NextRequest(
        "http://localhost:3000/api/analyze/chunk",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Chunk file not found");
    });

    it("存在しないjobIdの場合は404エラーを返す", async () => {
      const requestBody = {
        jobId: "nonexistent-job",
        chunkIndex: 0,
      };

      const request = new NextRequest(
        "http://localhost:3000/api/analyze/chunk",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Chunk file not found");
    });
  });
});
