import type { Mocked } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Episode, Job, RenderStatus } from "@/db";
import type { LayoutStoragePort } from "@/infrastructure/storage/ports";
import type { JobDbPort } from "@/repositories/ports";
import { JobProgressService } from "@/services/application/job-progress";
import type { DatabaseService } from "@/services/database";
import type { JobProgress } from "@/types/job";

// Mock dependencies
vi.mock("@/services/db-factory", () => ({
  getDatabaseService: vi.fn(() => mockDatabaseService),
}));

vi.mock("@/infrastructure/storage/ports", () => ({
  getStoragePorts: vi.fn(() => ({
    layout: mockLayoutStorage,
  })),
}));

vi.mock("@/repositories/adapters", () => ({
  adaptAll: vi.fn(() => ({
    job: mockJobDbPort,
  })),
}));

// Mock objects (strictly typed)
type MockDb = Pick<
  DatabaseService,
  "getEpisodesByJobId" | "getRenderStatusByEpisode"
>;
type MockLayout = Pick<LayoutStoragePort, "getEpisodeLayoutProgress">;
type MockJobPort = Pick<JobDbPort, "getJobWithProgress">;

let mockDatabaseService: Mocked<MockDb>;
let mockLayoutStorage: Mocked<MockLayout>;
let mockJobDbPort: Mocked<MockJobPort>;

beforeEach(() => {
  vi.clearAllMocks();

  // Mock database service
  mockDatabaseService = {
    getEpisodesByJobId: vi.fn(),
    getRenderStatusByEpisode: vi.fn(),
  } as unknown as Mocked<MockDb>;

  // Mock layout storage
  mockLayoutStorage = {
    getEpisodeLayoutProgress: vi.fn(),
  } as unknown as Mocked<MockLayout>;

  // Mock job database port
  mockJobDbPort = {
    getJobWithProgress: vi.fn(),
  } as unknown as Mocked<MockJobPort>;
});

describe("JobProgressService Integration Tests", () => {
  describe("getJobWithProgress", () => {
    // Helper to build a fully-typed Job object with sensible defaults
    const makeMockJob = (
      overrides: Partial<Job>,
      progressOverrides: Partial<JobProgress> = {}
    ): Job & { progress: JobProgress } => {
      const now = new Date().toISOString();
      const base: Job = {
        id: "job-DEFAULT",
        novelId: "novel-DEFAULT",
        jobName: null,
        status: "pending",
        currentStep: "initialized",
        splitCompleted: false,
        analyzeCompleted: false,
        episodeCompleted: false,
        layoutCompleted: false,
        renderCompleted: false,
        chunksDirPath: null,
        analysesDirPath: null,
        episodesDataPath: null,
        layoutsDirPath: null,
        rendersDirPath: null,
        totalChunks: 0,
        processedChunks: 0,
        totalEpisodes: 0,
        processedEpisodes: 0,
        totalPages: 0,
        renderedPages: 0,
        lastError: null,
        lastErrorStep: null,
        retryCount: 0,
        resumeDataPath: null,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        completedAt: null,
      };
      const job: Job = { ...base, ...overrides };
      const progress: JobProgress = {
        currentStep: job.currentStep as JobProgress["currentStep"],
        processedChunks: job.processedChunks ?? 0,
        totalChunks: job.totalChunks ?? 0,
        episodes: [],
        ...progressOverrides,
      };
      return { ...job, progress };
    };
    it("returns null when job does not exist", async () => {
      // Arrange
      mockJobDbPort.getJobWithProgress.mockResolvedValue(null);
      const service = new JobProgressService();

      // Act
      const result = await service.getJobWithProgress("nonexistent-job");

      // Assert
      expect(result).toBeNull();
      expect(mockJobDbPort.getJobWithProgress).toHaveBeenCalledWith(
        "nonexistent-job"
      );
    });

    it("returns original job when no episodes exist", async () => {
      // Arrange
      const mockJob = makeMockJob({
        id: "job-1",
        novelId: "novel-1",
        status: "processing",
        currentStep: "analyze",
        totalChunks: 10,
        processedChunks: 5,
      });

      mockJobDbPort.getJobWithProgress.mockResolvedValue(mockJob);
      mockDatabaseService.getEpisodesByJobId.mockResolvedValue([]);

      const service = new JobProgressService();

      // Act
      const result = await service.getJobWithProgress("job-1");

      // Assert
      expect(result).toEqual(mockJob);
      expect(mockDatabaseService.getEpisodesByJobId).toHaveBeenCalledWith(
        "job-1"
      );
    });

    it("enriches job with perEpisodePages when episodes exist", async () => {
      // Arrange
      const mockJob = makeMockJob({
        id: "job-1",
        novelId: "novel-1",
        status: "processing",
        currentStep: "layout",
        totalChunks: 10,
        processedChunks: 10,
      });

      const mockEpisodes: Episode[] = [
        {
          id: "ep1",
          novelId: "novel-1",
          jobId: "job-1",
          episodeNumber: 1,
          title: "Episode 1",
          summary: null,
          startChunk: 0,
          endChunk: 4,
          estimatedPages: 30,
          startCharIndex: 0,
          endCharIndex: 1000,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
        {
          id: "ep2",
          novelId: "novel-1",
          jobId: "job-1",
          episodeNumber: 2,
          title: "Episode 2",
          summary: null,
          startChunk: 5,
          endChunk: 9,
          estimatedPages: 40,
          startCharIndex: 1001,
          endCharIndex: 2000,
          confidence: 0.85,
          createdAt: new Date().toISOString(),
        },
      ];

      const mockLayoutProgress1 = JSON.stringify({ pages: Array(25).fill({}) }); // 25 planned pages
      const mockLayoutProgress2 = JSON.stringify({ pages: Array(35).fill({}) }); // 35 planned pages
      const mockRenderStatus1: RenderStatus[] = []; // 0 rendered pages
      const mockRenderStatus2: RenderStatus[] = [
        {
          id: "r-1",
          jobId: "job-1",
          episodeNumber: 2,
          pageNumber: 1,
          isRendered: true,
          imagePath: null,
          thumbnailPath: null,
          width: null,
          height: null,
          fileSize: null,
          renderedAt: null,
          retryCount: 0,
          lastError: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: "r-2",
          jobId: "job-1",
          episodeNumber: 2,
          pageNumber: 2,
          isRendered: true,
          imagePath: null,
          thumbnailPath: null,
          width: null,
          height: null,
          fileSize: null,
          renderedAt: null,
          retryCount: 0,
          lastError: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: "r-3",
          jobId: "job-1",
          episodeNumber: 2,
          pageNumber: 3,
          isRendered: true,
          imagePath: null,
          thumbnailPath: null,
          width: null,
          height: null,
          fileSize: null,
          renderedAt: null,
          retryCount: 0,
          lastError: null,
          createdAt: new Date().toISOString(),
        },
      ];

      mockJobDbPort.getJobWithProgress.mockResolvedValue(mockJob);
      mockDatabaseService.getEpisodesByJobId.mockResolvedValue(mockEpisodes);
      mockLayoutStorage.getEpisodeLayoutProgress
        .mockResolvedValueOnce(mockLayoutProgress1)
        .mockResolvedValueOnce(mockLayoutProgress2);
      mockDatabaseService.getRenderStatusByEpisode
        .mockResolvedValueOnce(mockRenderStatus1)
        .mockResolvedValueOnce(mockRenderStatus2);

      const service = new JobProgressService();

      // Act
      const result = await service.getJobWithProgress("job-1");

      // Assert
      expect(result).toBeDefined();
      expect(result?.progress?.perEpisodePages).toBeDefined();

      const perEpisodePages = result!.progress!.perEpisodePages!;

      // Episode 1: total=30, planned=25, rendered=0
      expect(perEpisodePages[1]).toEqual({
        planned: 25,
        rendered: 0,
        total: 30,
      });

      // Episode 2: total=40, planned=35, rendered=3
      expect(perEpisodePages[2]).toEqual({
        planned: 35,
        rendered: 3,
        total: 40,
      });

      // Verify all mocks were called correctly
      expect(mockDatabaseService.getEpisodesByJobId).toHaveBeenCalledWith(
        "job-1"
      );
      expect(mockLayoutStorage.getEpisodeLayoutProgress).toHaveBeenCalledWith(
        "job-1",
        1
      );
      expect(mockLayoutStorage.getEpisodeLayoutProgress).toHaveBeenCalledWith(
        "job-1",
        2
      );
      expect(mockDatabaseService.getRenderStatusByEpisode).toHaveBeenCalledWith(
        "job-1",
        1
      );
      expect(mockDatabaseService.getRenderStatusByEpisode).toHaveBeenCalledWith(
        "job-1",
        2
      );
    });

    it("handles layout progress parsing errors gracefully", async () => {
      // Arrange
      const mockJob = makeMockJob({
        id: "job-1",
        novelId: "novel-1",
        status: "processing",
        currentStep: "layout",
        totalChunks: 5,
        processedChunks: 5,
      });

      const mockEpisodes: Episode[] = [
        {
          id: "ep1",
          novelId: "novel-1",
          jobId: "job-1",
          episodeNumber: 1,
          title: "Episode 1",
          summary: null,
          startChunk: 0,
          endChunk: 4,
          estimatedPages: 20,
          startCharIndex: 0,
          endCharIndex: 1000,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
      ];

      mockJobDbPort.getJobWithProgress.mockResolvedValue(mockJob);
      mockDatabaseService.getEpisodesByJobId.mockResolvedValue(mockEpisodes);
      // Return invalid JSON that will cause parsing to fail
      mockLayoutStorage.getEpisodeLayoutProgress.mockResolvedValue(
        "invalid-json"
      );
      mockDatabaseService.getRenderStatusByEpisode.mockResolvedValue([]);

      const service = new JobProgressService();

      // Act
      const result = await service.getJobWithProgress("job-1");

      // Assert
      expect(result).toBeDefined();
      expect(result?.progress?.perEpisodePages).toBeDefined();

      const perEpisodePages = result!.progress!.perEpisodePages!;

      // Should have planned=0 due to parsing error, but still include the episode
      expect(perEpisodePages[1]).toEqual({
        planned: 0, // Falls back to 0 when JSON parsing fails
        rendered: 0,
        total: 20,
      });
    });

    it("handles storage operation errors gracefully and returns original job", async () => {
      // Arrange
      const mockJob = makeMockJob({
        id: "job-1",
        novelId: "novel-1",
        status: "processing",
        currentStep: "layout",
        totalChunks: 5,
        processedChunks: 5,
      });

      mockJobDbPort.getJobWithProgress.mockResolvedValue(mockJob);
      // Simulate error in getEpisodesByJobId that triggers the catch block
      mockDatabaseService.getEpisodesByJobId.mockRejectedValue(
        new Error("Database connection failed")
      );

      const service = new JobProgressService();

      // Act
      const result = await service.getJobWithProgress("job-1");

      // Assert
      // Should return original job when enrichment fails
      expect(result).toEqual(mockJob);
      expect(result?.progress?.perEpisodePages).toBeUndefined();
    });
  });
});
