import { describe, expect, it } from "vitest";
import { adaptEpisodePort, adaptJobPort, adaptNovelPort, adaptOutputPort } from "@/repositories/adapters";
import type {
  EpisodeDbPortRO,
  EpisodeDbPortRW,
  JobDbPort,
  NovelDbPortRO,
  NovelDbPortRW,
  OutputDbPort,
} from "@/repositories/ports";
import {
  hasEpisodeWriteCapabilities,
  hasJobWriteCapabilities,
  hasNovelWriteCapabilities,
  isEpisodePort,
  isJobPort,
  isNovelPort,
  isOutputPort,
} from "@/repositories/ports";

// フェイク DB (必要最低限メソッドのみ)
const fakeDb = {
  getEpisode: async () => null,
  getEpisodesByJobId: async () => [],
  createEpisodes: async () => {},
  getNovel: async () => null,
  getAllNovels: async () => [],
  ensureNovel: async () => {},
  createJob: async () => "job-id",
  getJob: async () => null,
  getJobsByNovelId: async () => [],
  updateJobStatus: async () => {},
  createOutput: async () => "output-id",
} as any;

describe("Repository Port Type Guards", () => {
  describe("Write Capability Guards", () => {
    it("Episode port write capability 判定", () => {
      const rwPort = adaptEpisodePort(fakeDb, true);
      const roPort = adaptEpisodePort(fakeDb, false);
      expect(hasEpisodeWriteCapabilities(rwPort)).toBe(true);
      expect(hasEpisodeWriteCapabilities(roPort)).toBe(false);
    });

    it("Novel port write capability 判定", () => {
      const rwPort = adaptNovelPort(fakeDb, true);
      const roPort = adaptNovelPort(fakeDb, false);
      expect(hasNovelWriteCapabilities(rwPort)).toBe(true);
      expect(hasNovelWriteCapabilities(roPort)).toBe(false);
    });

    it("Job port write capability 判定 (always RW)", () => {
      const jobPort = adaptJobPort(fakeDb);
      expect(hasJobWriteCapabilities(jobPort)).toBe(true);
    });

    it("Legacy port compatibility - Episode with createEpisodes method", () => {
      const legacyPort = {
        entity: "episode",
        mode: "rw",
        getEpisodesByJobId: async () => [],
        createEpisodes: async () => {},
      } as EpisodeDbPortRW;

      expect(hasEpisodeWriteCapabilities(legacyPort)).toBe(true);
    });

    it("Legacy port compatibility - Episode without createEpisodes method", () => {
      const legacyPort = {
        entity: "episode",
        mode: "ro",
        getEpisodesByJobId: async () => [],
      } as EpisodeDbPortRO;

      expect(hasEpisodeWriteCapabilities(legacyPort)).toBe(false);
    });

    it("Legacy port compatibility - Novel with ensureNovel method", () => {
      const legacyPort = {
        entity: "novel",
        mode: "rw",
        getNovel: async () => null,
        getAllNovels: async () => [],
        ensureNovel: async () => {},
      } as NovelDbPortRW;

      expect(hasNovelWriteCapabilities(legacyPort)).toBe(true);
    });

    it("Legacy port compatibility - Novel without ensureNovel method", () => {
      const legacyPort = {
        entity: "novel",
        mode: "ro",
        getNovel: async () => null,
        getAllNovels: async () => [],
      } as NovelDbPortRO;

      expect(hasNovelWriteCapabilities(legacyPort)).toBe(false);
    });
  });

  describe("Discriminated Union Type Guards", () => {
    it("isEpisodePort - should return true for valid episode port", () => {
      const episodePort = { entity: "episode", mode: "rw" };
      expect(isEpisodePort(episodePort)).toBe(true);
    });

    it("isEpisodePort - should return false for non-episode port", () => {
      const novelPort = { entity: "novel", mode: "rw" };
      expect(isEpisodePort(novelPort)).toBe(false);
    });

    it("isEpisodePort - should return false for null/undefined", () => {
      expect(isEpisodePort(null)).toBe(false);
      expect(isEpisodePort(undefined)).toBe(false);
    });

    it("isEpisodePort - should return false for non-object", () => {
      expect(isEpisodePort("string")).toBe(false);
      expect(isEpisodePort(123)).toBe(false);
      expect(isEpisodePort(true)).toBe(false);
    });

    it("isNovelPort - should return true for valid novel port", () => {
      const novelPort = { entity: "novel", mode: "ro" };
      expect(isNovelPort(novelPort)).toBe(true);
    });

    it("isNovelPort - should return false for non-novel port", () => {
      const episodePort = { entity: "episode", mode: "rw" };
      expect(isNovelPort(episodePort)).toBe(false);
    });

    it("isJobPort - should return true for valid job port", () => {
      const jobPort = { entity: "job", mode: "rw" };
      expect(isJobPort(jobPort)).toBe(true);
    });

    it("isJobPort - should return false for non-job port", () => {
      const episodePort = { entity: "episode", mode: "rw" };
      expect(isJobPort(episodePort)).toBe(false);
    });

    it("isOutputPort - should return true for valid output port", () => {
      const outputPort = { entity: "output", mode: "rw" };
      expect(isOutputPort(outputPort)).toBe(true);
    });

    it("isOutputPort - should return false for non-output port", () => {
      const jobPort = { entity: "job", mode: "rw" };
      expect(isOutputPort(jobPort)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("Type guards should handle objects with extra properties", () => {
      const portWithExtraProps = {
        entity: "episode",
        mode: "rw",
        extraProperty: "should not affect result",
        anotherProp: 123,
      };

      expect(isEpisodePort(portWithExtraProps)).toBe(true);
    });

    it("Type guards should handle objects with wrong entity type", () => {
      const portWithWrongEntity = {
        entity: "unknown",
        mode: "rw",
      };

      expect(isEpisodePort(portWithWrongEntity)).toBe(false);
      expect(isNovelPort(portWithWrongEntity)).toBe(false);
      expect(isJobPort(portWithWrongEntity)).toBe(false);
      expect(isOutputPort(portWithWrongEntity)).toBe(false);
    });

    it("Write capability guards should handle edge cases safely", () => {
      // Test with mock objects that might be missing properties
      const incompletePort = { entity: "episode" } as any;
      
      // Should not throw and should return false for incomplete ports
      expect(() => hasEpisodeWriteCapabilities(incompletePort)).not.toThrow();
      expect(hasEpisodeWriteCapabilities(incompletePort)).toBe(false);
    });
  });
});
