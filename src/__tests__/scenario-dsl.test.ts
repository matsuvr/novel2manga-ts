import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createNovelToMangaScenario } from "@/agents/scenarios/novel-to-manga";
import { runScenario, ScenarioBuilder } from "@/services/orchestrator/scenario";
import {
  zChunkOutput,
  zComposeOutput,
  zImageResult,
  zIngestOutput,
  zReduceOutput,
  zStoryboardOutput,
  zWindowAnalysis,
} from "@/types/contracts";

describe("Scenario DSL", () => {
  it("builds and runs the novel-to-manga flow in memory", async () => {
    const scenario = createNovelToMangaScenario();

    // Basic shape assertions
    expect(scenario.id).toBe("novel-to-manga");
    const stepIds = new Set(scenario.steps.map((s) => s.id));
    for (const id of [
      "ingest",
      "chunk",
      "analyzeWindow",
      "reduce",
      "storyboard",
      "prompt",
      "image",
      "compose",
      "publish",
    ]) {
      expect(stepIds.has(id)).toBe(true);
    }

    // Execute with a small initial input
    const outputs = await runScenario(scenario, {
      initialInput: {
        novelR2Key: "novels/example.txt",
        settings: { windowTokens: 512, strideTokens: 256 },
      },
    });

    // Ensure key stages produced outputs
    const ingestOut = zIngestOutput.parse(outputs["ingest"]);
    expect(ingestOut.totalChars).toBeGreaterThan(0);
    const chunkOut = zChunkOutput.parse(outputs["chunk"]);
    expect(chunkOut.windows.length).toBeGreaterThan(0);
    const windowAnalyses = z
      .array(zWindowAnalysis)
      .parse(outputs["analyzeWindow"]);
    expect(windowAnalyses.length).toBe(chunkOut.windows.length);
    const reduceOut = zReduceOutput.parse(outputs["reduce"]);
    expect(reduceOut.scenes.length).toBeGreaterThan(0);
    const storyboardOut = zStoryboardOutput.parse(outputs["storyboard"]);
    expect(storyboardOut.panels.length).toBeGreaterThan(0);
    const imageOut = z.array(zImageResult).parse(outputs["image"]);
    expect(imageOut.length).toBeGreaterThan(0);
    const composeOut = zComposeOutput.parse(outputs["compose"]);
    expect(composeOut.pages.length).toBeGreaterThan(0);
    expect(outputs["publish"]).toMatchObject({ ok: true });
  });

  it("detects cycle in scenario definition", () => {
    const b = new ScenarioBuilder("cycle-test", "1.0.0");
    const schema = z.object({ v: z.number() });
    b.step({
      id: "a",
      inputSchema: schema,
      outputSchema: schema,
      idempotencyFrom: [],
      run: async (i) => i,
    });
    b.step({
      id: "b",
      inputSchema: schema,
      outputSchema: schema,
      idempotencyFrom: [],
      run: async (i) => i,
    });
    b.edge({ from: "a", to: "b", fanIn: "all" });
    b.edge({ from: "b", to: "a", fanIn: "all" });
    expect(() => b.build()).toThrow(/cycle/i);
  });

  it("fails on invalid edge reference", () => {
    const b = new ScenarioBuilder("invalid-edge", "1.0.0");
    const schema = z.object({ v: z.number() });
    b.step({
      id: "only",
      inputSchema: schema,
      outputSchema: schema,
      idempotencyFrom: [],
      run: async (i) => i,
    });
    b.edge({ from: "only", to: "missing", fanIn: "all" });
    expect(() => b.build()).toThrow(/Edge.to not found/i);
  });

  it("validates input and output schemas and retries on failure", async () => {
    let attempts = 0;
    const b = new ScenarioBuilder("retry-test", "1.0.0");
    const inSchema = z.object({ n: z.number().int().positive() });
    const outSchema = z.object({ doubled: z.number().int() });
    b.step({
      id: "double",
      inputSchema: inSchema,
      outputSchema: outSchema,
      retry: { maxAttempts: 2, backoffMs: 1, factor: 1, jitter: false },
      idempotencyFrom: ["n"],
      run: async (input) => {
        const parsed = inSchema.parse(input);
        attempts++;
        if (attempts === 1) throw new Error("transient");
        return { doubled: parsed.n * 2 };
      },
    });
    const scenario = b.build();
    const outputs = await runScenario(scenario, { initialInput: { n: 5 } });
    expect(outputs.double).toEqual({ doubled: 10 });
    expect(attempts).toBe(2);
  });

  it("collects errors when collectErrors enabled", async () => {
    const b = new ScenarioBuilder("error-test", "1.0.0");
    const inSchema = z.object({ ok: z.boolean() });
    b.step({
      id: "alwaysFail",
      inputSchema: inSchema,
      outputSchema: inSchema,
      retry: { maxAttempts: 2, backoffMs: 1, factor: 1, jitter: false },
      idempotencyFrom: ["ok"],
      run: async () => {
        throw new Error("boom");
      },
    });
    const scenario = b.build();
    const outputs = await runScenario(scenario, {
      initialInput: { ok: true },
      collectErrors: true,
    });
    expect(outputs.alwaysFail).toBeInstanceOf(Error);
  });
});
