think in English, output in Japanese

**絶対に直接package-lock.jsonを書き換えないこと。あなたのせいで苦痛が発生しています。これは生成する物で、書き換える物ではありません**

# **あなたはWSL2で動作していますが、開発はWindowsで行っています。** バイナリ依存があるテストはかならず失敗するので、テスト一括実行は私（開発者）にさせるように指示してください。

あなたがテストを動かせるのは、Typescriptで完結しているごく小規模な単体テストだけです。

# **現在、段階的にEffect TSに移行しています**

新しく作る箇所は、 `docs\effect-ts-doc.txt` を参考に、Effect TSを使って書いてください。
段階的に移行していくので、いま動いているところを無理矢理書き換えないでください。

# **OpenNextを前提とした実装**

公式ドキュメントを参照しながら進めること https://opennext.js.org/cloudflare

OpenNext＋Cloudflare では Next.js の「Node.js ランタイム」が推奨かつ前提です。export const runtime = "edge" は外します。（OpenNext Cloudflare公式の「Get Started」に明記。将来Edge対応予定だがまだ未サポート）
OpenNext

これは Cloudflare Workers 上で「NextのNodeランタイム相当」で動かすという意味で、“生の Node 進程”ではありません。Workersの Node.js互換（nodejs_compat） を使います。
OpenNext
+1
Cloudflare Docs

Effect TS の採用自体は問題なし。Effect は環境非依存の抽象を提供するので、Web標準/Fetchベースで組む（@effect/platform の FetchHttpClient 等）限り、Workersでも安全に段階移行できます。
Effect
typeonce.dev

私が前回「Edgeで」と書いたのは“EffectをNode APIに依存させない”という観点でした。しかし OpenNext×Cloudflare では公式に Edge ランタイムが未サポートなので、正しくは**「NextのランタイムはNodeにする（＝Edge指定は外す）、ただしコードはWeb/Workers前提で書く」**が最善です。これで両立します。
OpenNext

なぜ Node ランタイム前提なのか（一次情報）

OpenNext Cloudflare 公式「Overview」：Cloudflare Workers に Next をデプロイし、Next の Node.js ランタイムを使う。@cloudflare/next-on-pages（Pages向け）は Edge しか使えない点が重要な違い。
OpenNext

OpenNext Cloudflare 公式「Get Started」：「export const runtime = "edge" を削除」、**「nodejs_compat を有効化」**が手順に明記。
OpenNext

Cloudflare 公式ブログ（2025/04/08）：アダプタは現状 Node ランタイムのみ対応、Edge は次メジャーで対応予定。
The Cloudflare Blog

Cloudflare 公式Docs：Workers は Node APIの広いサブセットを互換提供（nodejs_compatと適切なcompatibility dateが必要）。
Cloudflare Docs

あなたの移行に直結する実務ポイント

1. 設定チェックリスト

wrangler設定（抜粋。compatibility_date は 2024-09-23 以降）

{
"$schema": "node_modules/wrangler/config-schema.json",
"main": ".open-next/worker.js",
"name": "novel2manga",
"compatibility_date": "2025-09-07",
"compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
"assets": { "directory": ".open-next/assets", "binding": "ASSETS" }
}

（nodejs_compat必須、main/assetsはOpenNextの出力を指す）
OpenNext

Nextのコードから Edge 指定を撤廃：
export const runtime = 'edge' があれば削除。
OpenNext

dev統合（next.config.ts）：

import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

（next dev時もWorkers相当でバインディングを使えるようにする）
OpenNext

2. Cloudflare資源（KV/R2/D1等）を Effect の Layer に注入

OpenNext では getCloudflareContext().env からバインディング取得。これを Effect のサービスに噛ませます。

// app/api/hello/route.ts
import { Effect, Layer, Context } from "effect";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type CloudflareEnv = typeof import("../../cloudflare-env").CloudflareEnv; // `wrangler types` で生成
const CfEnv = Context.Tag<CloudflareEnv>("CfEnv");

const BaseLive = Layer.mergeAll(
FetchHttpClient.layer, // fetchベースのHttpClient（Workersで安全）
Layer.succeed(CfEnv, getCloudflareContext().env as CloudflareEnv),
);

export async function GET() {
const program = Effect.gen(function* (\_) {
const client = yield* _(HttpClient.HttpClient);
const res = yield\* _(client.get("https://example.com"));
return new Response(`ok: ${res.status}`);
});

return await Effect.provide(program, BaseLive).runPromise();
}

バインディングの型安全：wrangler types --env-interface CloudflareEnv で cloudflare-env.d.ts を生成。
OpenNext
+1

公式の getCloudflareContext().env で KV/D1/R2 などに到達できます。
OpenNext

3. ライブラリ互換の落とし穴（workerd固有差分）

Workersの実体は workerd。一部パッケージは exports に workerd 向けエントリを持ちます。Nextのバンドル解決を誤らせないよう serverExternalPackages に列挙（例：postgres、jose、@prisma/client）。
OpenNext

// next.config.ts
const nextConfig = {
serverExternalPackages: ["@prisma/client", ".prisma/client", "postgres", "jose"],
};

4. Node APIの使い方の指針

まずは Web標準（fetch, Web Crypto, Streams）＋Effectの抽象で設計。

どうしても必要な所だけ nodejs_compat に依存（たとえば events や buffer など）。fs 等は未対応/非推奨なので避ける。対応範囲はCloudflare公式の一覧を参照。
Cloudflare Docs

段階的な Effect 導入プラン（OpenNext＋Workers前提）

ドメインロジックのEffect化：副作用を持たない計算・スキーマ検証・エラーハンドリング（Effect, Schema）から置き換え。

HTTP/I/Oを抽象化：@effect/platform の FetchHttpClient を使い、外部API呼び出しをEffectサービス化。
typeonce.dev

CloudflareバインディングをLayer化：KV/D1/R2/Queues を getCloudflareContext().env 経由で注入。
OpenNext

Nextのルート単位で差し替え：Route HandlerやServer ActionsからEffectプログラムを呼び出す。

互換の必要箇所のみ Node API：nodejs_compatで補い、workerd固有のパッケージは serverExternalPackages で回避。
OpenNext

# Repository Guidelines

## Project Structure & Module Organization

- Source: `src/` with `app/` (Next.js routes), `components/`, `agents/`, `services/`, `db/`, `utils/`, `types/`.
- Tests: unit in `src/__tests__/`; integration in `tests/integration/`; Playwright E2E under `tests/integration/e2e/`.
- Assets & scripts: `public/` for static assets; `scripts/` for local tooling.
- Database: `database/` (data, docs) and `drizzle/` (SQL + meta). Keep schema in `src/db/schema.ts` in sync with migrations.

## Build, Test, and Development Commands

- `npm run dev`: Start Next.js locally at `http://localhost:3000`.
- `npm run build` / `npm start`: Production build and serve.
- `npm test`, `npm run test:unit`: Run Vitest unit tests; `npm run test:coverage` for coverage.
- `npm run test:integration` / `:run`: Vitest integration using `.env.test`.
- `npm run test:e2e`: Playwright E2E; `npm run test:full-flow` (or `:win`) runs scripted flow.
- `npm run format` / `npm run lint` / `npm run check`: Biome format, lint, and combined checks.
- DB: `npm run db:migrate` / `db:generate` / `db:push` / `db:studio`.
- Cloudflare: `npm run preview` (local), `npm run deploy` (OpenNext + Workers); `npm run cf-typegen` to refresh bindings types.

## Coding Style & Naming Conventions

- Language: TypeScript (Node >= 20.9). Strict types; avoid `any` and unexplained `@ts-ignore`.
- Formatting/Linting: Biome. Keep files formatted; CI enforces `format:check`/`lint:check`.
- Naming: PascalCase React components; camelCase functions/vars; kebab-case files. Next.js routes live under `src/app/`.

### マジックナンバー禁止・設定の一元化（新規ルール）

- マジックナンバーのハードコーディングは禁止です。
- 閾値・上限・タイムアウト・ページ数などの設定値は、すべて `*.config.ts` に定義し、そこからのみ参照してください。
- 既存コードにハードコードが見つかった場合は、即時に `*.config.ts` へ移動して参照を置換すること。
- 例: レンダリング最大ページ数 `maxPages` は `app.config.ts` の `rendering.limits.maxPages` を唯一の参照源とする。

## Testing Guidelines

- Frameworks: Vitest for unit/integration; Playwright for E2E.
- Location & names: Unit tests in `src/__tests__` as `*.test.ts(x)`; integration in `tests/integration/` (configured via `vitest.integration.config.ts`); E2E in `tests/integration/e2e/` (Playwright).
- Running: Use commands above; prefer `npm run test:coverage` for meaningful PRs.
- Test data/env: Keep `.env.test` current for integration; isolate side effects.

## Commit & Pull Request Guidelines

- Commits: Use Conventional Commits (e.g., `feat:`, `fix:`, `chore:`). Keep changes focused.
- PRs: Use `.github/pull_request_template.md`. Link issues, paste test summaries (unit/integration/E2E), update docs/specs in `.kiro/specs/...`, DB schema/migrations (`src/db/schema.ts`, `drizzle/`), and `database/storage-structure.md` when applicable.
- Quality gates: zero TS errors, clean lint/format, DRY/SOLID respected, adequate tests for changes.

## Security & Configuration Tips

- Do not commit secrets. Copy `.env.example` to `.env`/`.env.local`; keep `.env.test` for integration.
- Verify Cloudflare bindings in `wrangler.toml` and regenerate environment types via `npm run cf-typegen` when bindings change.

## CLI Tools

- `gh` (GitHub CLI): create branches, push, open PRs from the terminal. Requires configured credentials and network access.
- `git-grep`

```instructions
MANDATORY RULES FOR THIS REPOSITORY — READ BEFORE CODING

Non‑negotiables (do these every time):
- Always fetch and develop against the latest official documentation via MCP tools before writing code.
	- Cloudflare: Use MCP to obtain and cite the latest docs and APIs. Do not rely on memory or outdated snippets. If docs cannot be verified, do not proceed.
	- Use Web search + Deepwiki to gather current library information. Prefer primary sources; cross‑check breaking changes and version constraints.
- TypeScript: The any type is forbidden. Use precise types (unknown + type guards, generics, discriminated unions). No ts-ignore/ts-expect-error unless absolutely necessary and justified with a comment and a tracking task.
- Lint/Format: Resolve all linter errors and warnings. Do not merge with outstanding issues. Do not disable rules to “make it pass” unless there is a justified, documented rationale.
- DRY: Eliminate duplication. Extract shared logic into reusable modules/functions. No copy-paste forks of similar code paths.
- SOLID: Follow Single-responsibility, Open/closed, Liskov, Interface segregation, Dependency inversion. Prefer composition over inheritance and stable, testable boundaries.

Project conventions you must follow:
- Unit tests: Place all unit tests under src/__tests__ using the repository’s test runner (Vitest). Every new/changed public behavior must have tests.
- E2E tests: Implement and run end-to-end tests with Playwright MCP. Treat E2E as required for critical flows. Keep scenarios minimal, deterministic, and parallel‑safe.
- Temporary scripts: Put any ad‑hoc verification or one‑off scripts in /tmp_test. Clearly mark them as temporary and remove or gate them before merging to main.

Design, tasks, and data contracts — keep in sync in the same PR:
- System design: .kiro\specs\novel-to-manga-converter\design.md must reflect the current architecture and decisions. Update it when introducing or changing components, flows, or boundaries.
- Task breakdown: .kiro\specs\novel-to-manga-converter\tasks.md must be updated alongside code to reflect the actual scope, status, and acceptance criteria.
- Database: Use Drizzle. The schema source of truth is src\db\schema.ts. Update schema and generate/apply migrations together with code changes; never drift the runtime DB from the schema.
- Storage layout: database\storage-structure.md defines storage contracts and layout. Update it when files, buckets/paths, or retention rules change.
- エラーの隠蔽がないか。LLMコール以外のフォールバックが実装されていないか。スキップが無いか。一気通貫の分析サービスである以上、フォールバックやスキップで正常な分析結果が得られないことはシステムの重要な欠陥である。フォールバックは実装してはいけない。エラーは詳細なメッセージと共に明示し、そこで処理をストップすべき

Technology‑specific directives:
-- Cloudflare (Workers/Pages/D1/R2/Queues/etc.): Use MCP to verify the latest Cloudflare APIs and limits. Keep wrangler configuration accurate, document required bindings, and pin versions when possible.
- Libraries: When introducing or upgrading dependencies, use web search + Context7 + Deepwiki to validate stability, maintenance status, and migration notes. Include justification and links in the PR.

Quality gates (must pass before merge):
- Build succeeds with zero TypeScript errors (no any), and linter passes with no errors and no unexplained disables.
- Unit tests in src/__tests__ pass. E2E tests via Playwright MCP pass for core flows. Integration tests must pass if applicable.
- Docs/specs/tasks updated in the same PR: design.md, tasks.md, schema.ts + migrations, storage-structure.md.
- No duplicated code introduced; shared utilities factored appropriately.

PR checklist (copy into your PR and tick all):
- [ ] No any types introduced; strict types only. No unjustified ts-ignore.
- [ ] Linter and formatter clean (0 errors). No rule disabling without justification.
- [ ] DRY and SOLID upheld; no redundant implementations.
- [ ] Unit tests added/updated in src/__tests__ and passing.
- [ ] E2E scenarios added/updated and passing with Playwright MCP.
- [ ] Updated: .kiro\specs\novel-to-manga-converter\design.md
- [ ] Updated: .kiro\specs\novel-to-manga-converter\tasks.md
- [ ] Updated: src\db\schema.ts (+ migrations applied/generated as needed)
- [ ] Updated: database\storage-structure.md

If any item cannot be satisfied, stop and resolve it first. Do not proceed with implementation or merging until all conditions above are met.
```
