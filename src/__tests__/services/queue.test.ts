import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabaseService } from "@/services/db-factory";
import { JobNarrativeProcessor } from "@/services/job-narrative-processor";
import { getNotificationService } from "@/services/notifications";
import { __resetJobQueueForTest, getJobQueue } from "@/services/queue";

vi.mock("@/services/job-narrative-processor", () => ({
  JobNarrativeProcessor: vi.fn().mockImplementation(() => ({
    processJob: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/services/db-factory", () => ({
  getDatabaseService: vi.fn().mockReturnValue({
    updateJobError: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/services/notifications", () => ({
  getNotificationService: vi.fn().mockReturnValue({
    sendJobCompletionEmail: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("JobQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error test shim
    globalThis.JOBS_QUEUE = undefined;
    __resetJobQueueForTest();
  });

  it("InProcessQueue: should process jobs immediately and send completion notification", async () => {
    const queue = getJobQueue();
    await queue.enqueue({
      type: "PROCESS_NARRATIVE",
      jobId: "job-1",
      userEmail: "u@example.com",
    });

    expect(JobNarrativeProcessor).toHaveBeenCalled();
    const notifications = getNotificationService();
    expect(notifications.sendJobCompletionEmail).toHaveBeenCalledWith(
      "u@example.com",
      expect.objectContaining({ jobId: "job-1", status: "completed" })
    );
  });

  it("InProcessQueue: should update DB and notify on failure", async () => {
    (JobNarrativeProcessor as unknown as vi.Mock).mockImplementation(() => ({
      processJob: vi.fn().mockRejectedValue(new Error("boom")),
    }));

    const queue = getJobQueue();
    await queue.enqueue({
      type: "PROCESS_NARRATIVE",
      jobId: "job-2",
      userEmail: "u2@example.com",
    });

    const db = getDatabaseService() as unknown as { updateJobError: vi.Mock };
    // 非同期のcatch終了を待つため、マイクロタスクを一度待機
    await new Promise((r) => setTimeout(r, 0));
    // 新インターフェースは第4引数 incrementRetry を要求
    expect(db.updateJobError).toHaveBeenCalledWith(
      "job-2",
      "boom",
      "processing",
      true
    );

    const notifications = getNotificationService();
    expect(notifications.sendJobCompletionEmail).toHaveBeenCalledWith(
      "u2@example.com",
      expect.objectContaining({ jobId: "job-2", status: "failed" })
    );
  });

  it("getJobQueue: should fallback to InProcessQueue when JOBS_QUEUE is undefined", async () => {
    const queue = getJobQueue();
    await expect(
      queue.enqueue({ type: "PROCESS_NARRATIVE", jobId: "job-3" })
    ).resolves.toBeUndefined();
  });

  it("getJobQueue: should return Cloudflare-backed queue when JOBS_QUEUE is available", async () => {
    __resetJobQueueForTest();
    // @ts-expect-error test shim
    globalThis.JOBS_QUEUE = { send: vi.fn().mockResolvedValue(undefined) };
    const queue = getJobQueue();
    await queue.enqueue({ type: "PROCESS_NARRATIVE", jobId: "job-4" });
    // @ts-expect-error test shim
    expect(globalThis.JOBS_QUEUE.send).toHaveBeenCalledWith({
      type: "PROCESS_NARRATIVE",
      jobId: "job-4",
    });
  });
});
