import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Episode, Job } from "@/db";
import { JobProgressService } from "@/services/application/job-progress";
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

// Mock objects
let mockDatabaseService: any;
let mockLayoutStorage: any;
let mockJobDbPort: any;

beforeEach(() => {
  vi.clearAllMocks();

  // Mock database service
  mockDatabaseService = {
    getEpisodesByJobId: vi.fn(),
    getRenderStatusByEpisode: vi.fn(),
  };

  // Mock layout storage
  mockLayoutStorage = {
    getEpisodeLayoutProgress: vi.fn(),
  };

  // Mock job database port
  mockJobDbPort = {
    getJobWithProgress: vi.fn(),
  };
});

describe("JobProgressService Integration Tests", () => {
  describe("getJobWithProgress", () => {
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
      const mockJob: Job & { progress: JobProgress } = {
        id: "job-1",
        novelId: "novel-1",
        status: "processing",
        currentStep: "analyze",
        totalChunks: 10,
        processedChunks: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: {
          jobId: "job-1",
          status: "processing",
          currentStep: "analyze",
          progress: 50,
          stepProgress: {
            split: { completed: true, progress: 100 },
            analyze: { completed: false, progress: 50 },
            episode: { completed: false, progress: 0 },
            layout: { completed: false, progress: 0 },
            render: { completed: false, progress: 0 },
          },
          stats: {
            totalChunks: 10,
            processedChunks: 5,
            totalEpisodes: 0,
            processedEpisodes: 0,
            totalPages: 0,
            renderedPages: 0,
          },
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      };

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
      const mockJob: Job & { progress: JobProgress } = {
        id: "job-1",
        novelId: "novel-1",
        status: "processing",
        currentStep: "layout",
        totalChunks: 10,
        processedChunks: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: {
          jobId: "job-1",
          status: "processing",
          currentStep: "layout",
          progress: 75,
          stepProgress: {
            split: { completed: true, progress: 100 },
            analyze: { completed: true, progress: 100 },
            episode: { completed: true, progress: 100 },
            layout: { completed: false, progress: 50 },
            render: { completed: false, progress: 0 },
          },
          stats: {
            totalChunks: 10,
            processedChunks: 10,
            totalEpisodes: 2,
            processedEpisodes: 2,
            totalPages: 70,
            renderedPages: 0,
          },
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const mockEpisodes: Episode[] = [
        {
          id: "ep1",
          jobId: "job-1",
          episodeNumber: 1,
          title: "Episode 1",
          startChunk: 0,
          endChunk: 4,
          estimatedPages: 30,
          startCharIndex: 0,
          endCharIndex: 1000,
          confidence: 0.9,
          createdAt: new Date(),
        },
        {
          id: "ep2",
          jobId: "job-1",
          episodeNumber: 2,
          title: "Episode 2",
          startChunk: 5,
          endChunk: 9,
          estimatedPages: 40,
          startCharIndex: 1001,
          endCharIndex: 2000,
          confidence: 0.85,
          createdAt: new Date(),
        },
      ];

      const mockLayoutProgress1 = JSON.stringify({ pages: Array(25).fill({}) }); // 25 planned pages
      const mockLayoutProgress2 = JSON.stringify({ pages: Array(35).fill({}) }); // 35 planned pages
      const mockRenderStatus1 = []; // 0 rendered pages
      const mockRenderStatus2 = Array(3).fill({}); // 3 rendered pages

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
      const mockJob: Job & { progress: JobProgress } = {
        id: "job-1",
        novelId: "novel-1",
        status: "processing",
        currentStep: "layout",
        totalChunks: 5,
        processedChunks: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: {
          jobId: "job-1",
          status: "processing",
          currentStep: "layout",
          progress: 75,
          stepProgress: {
            split: { completed: true, progress: 100 },
            analyze: { completed: true, progress: 100 },
            episode: { completed: true, progress: 100 },
            layout: { completed: false, progress: 50 },
            render: { completed: false, progress: 0 },
          },
          stats: {
            totalChunks: 5,
            processedChunks: 5,
            totalEpisodes: 1,
            processedEpisodes: 1,
            totalPages: 20,
            renderedPages: 0,
          },
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const mockEpisodes: Episode[] = [
        {
          id: "ep1",
          jobId: "job-1",
          episodeNumber: 1,
          title: "Episode 1",
          startChunk: 0,
          endChunk: 4,
          estimatedPages: 20,
          startCharIndex: 0,
          endCharIndex: 1000,
          confidence: 0.9,
          createdAt: new Date(),
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
      const mockJob: Job & { progress: JobProgress } = {
        id: "job-1",
        novelId: "novel-1",
        status: "processing",
        currentStep: "layout",
        totalChunks: 5,
        processedChunks: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: {
          jobId: "job-1",
          status: "processing",
          currentStep: "layout",
          progress: 75,
          stepProgress: {
            split: { completed: true, progress: 100 },
            analyze: { completed: true, progress: 100 },
            episode: { completed: true, progress: 100 },
            layout: { completed: false, progress: 50 },
            render: { completed: false, progress: 0 },
          },
          stats: {
            totalChunks: 5,
            processedChunks: 5,
            totalEpisodes: 1,
            processedEpisodes: 1,
            totalPages: 20,
            renderedPages: 0,
          },
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      };

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
