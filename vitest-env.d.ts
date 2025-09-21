// Global Vitest test environment declarations
// Adding only the vitest types so that legacy placeholder test files using describe/it compile
// without re-introducing all test sources into the main TS program (tests themselves are excluded in tsconfig).
// If more globals needed (expect, vi), they are already part of vitest type package.
/// <reference types="vitest" />

export {};
