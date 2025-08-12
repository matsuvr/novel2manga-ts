import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "@/utils/api-error";

describe("extractErrorMessage", () => {
  it("handles Error instance", () => {
    const err = new Error("boom");
    expect(extractErrorMessage(err)).toBe("boom");
  });
  it("handles string", () => {
    expect(extractErrorMessage("plain")).toBe("plain");
  });
  it("serializes object", () => {
    expect(extractErrorMessage({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
  });
  it("falls back to String for circular object", () => {
    const obj: any = {};
    obj.self = obj;
    const result = extractErrorMessage(obj);
    // Circular -> JSON.stringify throws -> fallback to String => [object Object]
    expect(result).toBe("[object Object]");
  });
});
