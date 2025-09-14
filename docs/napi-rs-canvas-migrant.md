# Design Spec: Migrate `canvas` → `@napi-rs/canvas`

## 1) Context & Goals

- Today, the code dynamically imports `canvas` (node-canvas) and threads a `NodeCanvasImage` constructor through renderers (e.g., `CanvasRenderer`, dialogue/manga builders). &#x20;
- Unit tests currently mock the `"canvas"` module. &#x20;
- Goal: swap in **@napi-rs/canvas** (Skia backend, zero system deps) to simplify installs and reduce environment pains while keeping a node-canvas-like API. ([npm][1], [GitHub][2])

**Non-goals (for now):**

- Rewriting drawing logic or changing output formats.
- Moving rendering to Edge/Workers (see §8 runtime notes).

## 2) Why @napi-rs/canvas

- Prebuilt binaries via Node-API, **no Cairo** or system libs; simple `npm i @napi-rs/canvas`. ([npm][1])
- API parity is intentionally close to node-canvas: `createCanvas`, `loadImage`, `Image`, `toBuffer`, and async `encode('png' | 'jpeg' | 'webp' | 'avif')`. ([GitHub][2], [npm][1])
- Font management via `GlobalFonts.registerFromPath`. ([GitHub][2])

## 3) Migration Surface (Repo Hotspots)

- **`src/lib/canvas/canvas-renderer.ts`**: dynamic `import('canvas')`, typed `CanvasModule`, `NodeCanvasImageCtor`. Replace with `@napi-rs/canvas`.&#x20;
- **`src/lib/canvas/dialogue-asset-builder.ts`**/**`manga-page-renderer.ts`** (and similar): use of `NodeCanvasImage` / `createCanvas`. Convert to `Image` / `loadImage`.&#x20;
- **Tests**: `vi.mock('canvas', …)` to become `vi.mock('@napi-rs/canvas', …)`.&#x20;

## 4) API Mapping (node-canvas → @napi-rs/canvas)

| Concern | node-canvas                                    | @napi-rs/canvas                                                   | Notes                                        |                                      |                                                    |                                                                                           |
| ------- | ---------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- | ------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Create  | `createCanvas(w,h)`                            | `createCanvas(w,h)`                                               | Same signature. ([GitHub][2])                |                                      |                                                    |                                                                                           |
| Images  | `new Image(); img.src=...` or `loadImage(...)` | \`loadImage(Buffer                                                | path                                         | URL)`; also `new Image()\` supported | Prefer `loadImage` for buffers/URLs. ([GitHub][2]) |                                                                                           |
| Fonts   | `registerFont(path, { family })`               | `GlobalFonts.registerFromPath(path, family)`                      | Adjust call site. ([GitHub][2])              |                                      |                                                    |                                                                                           |
| Encode  | `canvas.toBuffer('image/png')`                 | `canvas.toBuffer('image/png')` **or** \`await canvas.encode('png' | 'jpeg'                                       | 'webp'                               | 'avif')\`                                          | `encode` is non-blocking; consider switching for perf. ([Stack Overflow][3], [GitHub][2]) |
| Types   | `CanvasRenderingContext2D`                     | Same type available                                               | Minimal TS changes in imports. ([GitHub][2]) |                                      |                                                    |                                                                                           |

### Type/Import diffs (illustrative)

**Before**

```ts
// dynamic import
const mod = await import('canvas')
type CanvasModule = typeof import('canvas')
// custom ctor typed as node-canvas Image
type NodeCanvasImageCtor = new () => NodeCanvasImage
```

**After**

```ts
const mod = await import('@napi-rs/canvas')
type CanvasModule = typeof import('@napi-rs/canvas')
// Prefer using provided Image type or loadImage
import type { Image } from '@napi-rs/canvas'
type NodeCanvasImageCtor = typeof Image // if ctor pattern is still used
```

**Image loading change (recommended):**

```ts
// Before: const img = new Image(); img.src = buffer;
import { loadImage } from '@napi-rs/canvas'
const img = await loadImage(buffer) // buffer | path | URL supported
```

&#x20; ([GitHub][2])

## 5) Build/Runtime Notes

- **Linux glibc ≥ 2.18** required by Skia builds—CI/container base images should meet this. ([npm][1])
- **CI coverage**: GitHub Actions runs on `ubuntu-22.04`, `macos-latest`, and `windows-latest` and installs dependencies with `npm ci` to build and test native modules like `@napi-rs/canvas` and `better-sqlite3`.
- **AWS Lambda**: use the published Lambda layer; bundle should **externalize** `@napi-rs/canvas` (provided by layer at runtime). ([npm][1])
- **Vercel/Node**: supported (native N-API addon prebuilds). ([npm][1])
- **Cloudflare Workers/Pages**: Workers add Node _APIs_ via `nodejs_compat(_v2)` but are **not a Node native-addons runtime**. Packages with `.node` binaries can usually be imported but may not function. If deploying to Workers, run rendering off-Worker (e.g., Lambda/Vercel/Cloud Run) behind an internal HTTP API, or switch to a WASM/JS renderer for edge. (Reference background on Node compatibility & flags.) ([Cloudflare Docs][4], [The Cloudflare Blog][5])
  - The repo recently added Cloudflare/OpenNext settings and references `nodejs_compat`; plan accordingly.&#x20;

## 6) Testing Strategy

- **Golden-image tests**: render a deterministic set (Latin/Japanese/emoji, gradients, alpha, scaling) and do pixel diff (tolerance ≤ 1).
- **Font coverage**: register at least one Japanese font via `GlobalFonts.registerFromPath` to avoid tofu squares on server-side renders. ([Zenn][6])
- **Performance**: optional A/B 100x rendering loop; consider switching `toBuffer` → `encode('png')` to offload encoding. ([Stack Overflow][3])

## 7) Observability & Rollback

- Feature flag `RENDER_BACKEND=cairo|skia`. On failure spikes, flip back to `cairo` (node-canvas) without code revert.
- Log `@napi-rs/canvas` version and font registrations at boot.

## 8) Deployment Pattern (suggested)

- **If on Node (Vercel, self-host, Lambda)**: inline migration; no topology change.
- **If on Cloudflare Workers/Pages**:
  - Keep UI/API on Workers (with `nodejs_compat_v2`), but route `/render/*` to a **Node runtime** service that hosts `@napi-rs/canvas`. Provide signed request from Worker. ([Cloudflare Docs][7])

---

# Task Board (for a coding agent)

| ID  | Task                     | File/Scope                          | Output                                                                                                                       | Owner  | Effort                           |     |     |
| --- | ------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------- | --- | --- |
| T1  | Add dependency           | `package.json`                      | `@napi-rs/canvas` added; remove `canvas`                                                                                     | Dev    | S                                |     |     |
| T2  | Swap imports (core)      | `src/lib/canvas/canvas-renderer.ts` | Change `import('canvas')` → `import('@napi-rs/canvas')`; update `CanvasModule` type                                          | Dev    | S                                |     |     |
| T3  | Replace Image ctor usage | `src/lib/canvas/*`                  | Prefer \`loadImage(buf                                                                                                       | url    | path)`over`new Image().src=...\` | Dev | M   |
| T4  | Fonts API                | wherever fonts are registered       | Replace `registerFont` with `GlobalFonts.registerFromPath(path, family)`                                                     | Dev    | S                                |     |     |
| T5  | Encoding path            | render outputs                      | Optionally switch `toBuffer('image/png')` → `await canvas.encode('png')` (behind flag)                                       | Dev    | S                                |     |     |
| T6  | Tests: update mocks      | `*.test.ts`                         | `vi.mock('@napi-rs/canvas', …)`; provide minimal `createCanvas`, `getContext`, `toBuffer/encode` fakes                       | QA     | S                                |     |     |
| T7  | Golden images            | `tests/fixtures`                    | Add 10 reference cases (JP text, emoji, scaling, gradients, alpha)                                                           | QA     | M                                |     |     |
| T8  | Pixel diff harness       | `tests/render-diff.test.ts`         | Diff images with tolerance; fail on >1% differing pixels                                                                     | QA     | M                                |     |     |
| T9  | CI image base            | CI/Dockerfile or runner             | Ensure glibc ≥ 2.18; cache native prebuilds                                                                                  | DevOps | S                                |     |     |
| T10 | Runtime check (Workers?) | infra/docs                          | If deploying to Cloudflare Workers/Pages, document offloading `/render/*` to Node service; wire env var `RENDER_SERVICE_URL` | DevOps | M                                |     |     |
| T11 | Feature flag & rollback  | config                              | `RENDER_BACKEND` env; default `skia`; allow `cairo` fallback                                                                 | Dev    | S                                |     |     |
| T12 | Bench (optional)         | scripts                             | Script to time 100 renders skia vs cairo; record numbers                                                                     | Dev    | S                                |     |     |

### Step-by-step for T2–T4 (patch templates)

**T2 – core import swap**

```diff
- const mod = await import('canvas');
- type CanvasModule = typeof import('canvas');
+ const mod = await import('@napi-rs/canvas');
+ type CanvasModule = typeof import('@napi-rs/canvas');
```

(See current dynamic import/type pattern.)&#x20;

**T3 – image creation**

```diff
- const img = new Image();
- img.src = buffer;
+ import { loadImage } from '@napi-rs/canvas';
+ const img = await loadImage(buffer);
```

(Adapt for any sites that pass `NodeCanvasImageCtor` around.) ([GitHub][2])

**T4 – fonts**

```diff
- registerFont(fontPath, { family: 'MyFont' });
+ import { GlobalFonts } from '@napi-rs/canvas';
+ GlobalFonts.registerFromPath(fontPath, 'MyFont');
```

([GitHub][2])

**T6 – tests**

```diff
- vi.mock('canvas', () => ({ /* stubs */ }));
+ vi.mock('@napi-rs/canvas', () => ({ /* stubs */ }));
```

(Adjust any test helpers referring to `"canvas"`.)&#x20;

## Acceptance Criteria

1. Build/install passes locally & in CI without system-level Cairo dependencies. ([npm][1])
2. All golden-image tests pass with ≤1% pixel diff.
3. JP text and emoji render correctly with registered fonts. ([Zenn][6])
4. If enabled, `encode('png')` yields same visual output & improves non-blocking throughput. ([Stack Overflow][3])
5. If deploying on Workers/Pages, `/render/*` offload is documented and feature-flagged. ([Cloudflare Docs][7])

## Risk & Mitigations

- **Workers runtime** incompatibility with native addons: keep a **Node runtime** rendering service if targeting Cloudflare Workers. ([Cloudflare Docs][7])
- **Fonts** missing on servers → tofu squares: always register fonts via `GlobalFonts.registerFromPath`. Add test coverage. ([Zenn][6])
- **Image decoding differences**: prefer `loadImage` and lock `@napi-rs/canvas` to a specific minor version initially. ([GitHub][2])

---

## Implementation Status

See `docs/napi-rs-canvas-migrant.tasks.md` for the current task checklist. The core renderer now relies on `@napi-rs/canvas` and tests mock this module accordingly.

If you want, I can turn this into a PR-ready branch plan (commits per task), or generate the **vitest mocks** for `@napi-rs/canvas` so your agent can drop them in.

[1]: https://www.npmjs.com/package/%40napi-rs/canvas/v/0.1.44?utm_source=chatgpt.com '@napi-rs/canvas - npm'
[2]: https://github.com/Brooooooklyn/canvas?utm_source=chatgpt.com 'GitHub - Brooooooklyn/canvas: High performance skia binding to Node.js. Zero system dependencies and pure npm packages without any postinstall scripts nor node-gyp.'
[3]: https://stackoverflow.com/questions/72930832/installing-canvas-giving-error-on-linux-arm-64-server?utm_source=chatgpt.com 'javascript - Installing canvas giving error on linux (arm 64) server - Stack Overflow'
[4]: https://developers.cloudflare.com/workers/runtime-apis/nodejs/?utm_source=chatgpt.com 'Node.js compatibility · Cloudflare Workers docs'
[5]: https://blog.cloudflare.com/th-th/more-npm-packages-on-cloudflare-workers-combining-polyfills-and-native-code?utm_source=chatgpt.com 'More NPM packages on Cloudflare Workers: Combining polyfills and native code to support Node.js APIs'
[6]: https://zenn.dev/mitate_gengaku/articles/canvas-garbled-on-the-servier-side?utm_source=chatgpt.com 'サーバーサイド側でcanvasを使用したとき日本語が文字化けして豆腐みたいになった'
[7]: https://developers.cloudflare.com/workers/runtime-apis/nodejs?utm_source=chatgpt.com 'Node.js compatibility | Cloudflare Workers docs'
