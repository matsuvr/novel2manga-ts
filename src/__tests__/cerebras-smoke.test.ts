// @vitest-environment node
import "dotenv/config";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Agent } from "@/agents/agent";

// CEREBRAS_API_KEY が無い場合はスキップ（CI等で失敗させない）
const hasCerebras = !!process.env.CEREBRAS_API_KEY;
const itif = hasCerebras ? it : it.skip;

describe("Cerebras structured outputs (smoke)", () => {
  itif(
    "returns JSON matching the schema from cerebras (gpt-oss-120b)",
    async () => {
      const schema = z.object({
        title: z.string(),
        director: z.string(),
        year: z.number().int(),
      });

      const agent = new Agent({
        name: "cerebras-smoke",
        instructions:
          "あなたは映画のレコメンダーです。要求スキーマに完全準拠したJSONのみを返してください。",
        provider: "cerebras",
      });

      const result = await agent.generateObject(
        [
          {
            role: "user",
            content:
              "1990年代のSF映画を1つ推薦し、title・director・yearを返して",
          },
        ],
        schema,
        { maxRetries: 0 }
      );

      expect(typeof result.title).toBe("string");
      expect(typeof result.director).toBe("string");
      expect(Number.isInteger(result.year)).toBe(true);
      expect(result.year).toBeGreaterThanOrEqual(1900);
      expect(result.year).toBeLessThanOrEqual(new Date().getFullYear());
    },
    60_000
  );
});
