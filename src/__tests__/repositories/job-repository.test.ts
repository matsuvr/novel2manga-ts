import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/db";
import { type JobDbPort, JobRepository } from "@/repositories/job-repository";

function createMockPort() {
  const calls: {
    createWithId: Array<[string, string, string | undefined]>;
    createPayload: any[];
  } = {
    createWithId: [],
    createPayload: [],
  };
  const mock: JobDbPort = {
    async getJob(_id: string): Promise<Job | null> {
      return null;
    },
    async getJobWithProgress(_id: string) {
      return null;
    },
    async createJob(
      idOrPayload:
        | string
        | {
            novelId: string;
            title?: string;
            totalChunks?: number;
            status?: string;
          },
      novelId?: string,
      jobName?: string
    ) {
      if (typeof idOrPayload === "string") {
        calls.createWithId.push([idOrPayload, novelId as string, jobName]);
        return idOrPayload;
      }
      calls.createPayload.push(idOrPayload);
      // emulate generated id
      return "generated-id";
    },
    async getJobsByNovelId(_novelId: string) {
      return [];
    },
  } as unknown as JobDbPort;

  return { mock, calls };
}

describe("JobRepository", () => {
  it("createWithId delegates to db.createJob with provided id", async () => {
    const { mock, calls } = createMockPort();
    const repo = new JobRepository(mock);
    const id = await repo.createWithId("jid", "nid", "text_analysis");
    expect(id).toBe("jid");
    expect(calls.createWithId).toEqual([["jid", "nid", "text_analysis"]]);
  });

  it("create delegates to db.createJob with payload and returns generated id", async () => {
    const { mock, calls } = createMockPort();
    const repo = new JobRepository(mock);
    const id = await repo.create({
      novelId: "nid",
      title: "Job",
      totalChunks: 10,
      status: "pending",
    });
    expect(id).toBe("generated-id");
    expect(calls.createPayload).toEqual([
      { novelId: "nid", title: "Job", totalChunks: 10, status: "pending" },
    ]);
  });
});
