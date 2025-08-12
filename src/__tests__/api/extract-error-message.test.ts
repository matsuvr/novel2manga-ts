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
  const obj: Record<string, unknown> = {} as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- circular assignment is intentional and safe for test
  ;(obj as any).self = obj;
    const result = extractErrorMessage(obj);
    // Circular -> JSON.stringify throws -> fallback to String => [object Object]
    expect(result).toBe("[object Object]");
  });

  it("handles undefined", () => {
    expect(extractErrorMessage(undefined)).toBe("undefined");
  });

  it("handles null", () => {
    expect(extractErrorMessage(null)).toBe("null");
  });

  it("handles symbol", () => {
    const sym = Symbol("test");
    expect(extractErrorMessage(sym)).toBe("Symbol(test)");
  });

  it("handles function", () => {
    function sampleFn() { /* noop */ }
    const msg = extractErrorMessage(sampleFn);
    expect(msg).toMatch(/sampleFn|function/i);
  });
});
