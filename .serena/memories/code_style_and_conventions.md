# Code Style and Conventions

## 言語とフレームワーク
- **言語**: TypeScript（strict mode）
- **Node.js**: >= 20.9.0
- **Module Type**: ES Modules (type: "module" in package.json)

## Code Quality Tools
- **Biome**: 統合されたlinter、formatter、type checker
- **設定ファイル**: `biome.json`
- **ESLint**: 補完的に使用（`.eslintrc.json`）

## Naming Conventions
- **ファイル名**: kebab-case (`chunk-analyzer.ts`, `text-splitter.ts`)
- **ディレクトリ名**: kebab-case
- **コンポーネント**: PascalCase (`NovelUploader.tsx`)
- **変数・関数**: camelCase
- **定数**: UPPER_SNAKE_CASE
- **型定義**: PascalCase (interfaces, types)

## ディレクトリ構造
```
src/
├── agents/          # Mastraエージェント
├── app/             # Next.js App Router
│   ├── api/         # API routes
│   └── (pages)/     # ページコンポーネント
├── components/      # Reactコンポーネント
├── config/          # 設定ファイル
├── lib/             # 外部ライブラリ統合
├── services/        # ビジネスロジック
├── types/           # 型定義
├── utils/           # ユーティリティ関数
└── __tests__/       # テストファイル
```

## Import Rules
- **絶対パス**: `@/` エイリアスを使用
- **型インポート**: `import type` を明示的に使用
- **順序**: 外部ライブラリ → 内部モジュール → 型定義

## TypeScript Rules
- **strict mode**: 有効
- **any型**: 厳格に禁止（CLAUDE.mdに明記）
- **型安全性**: 完全な型定義を要求
- **null/undefined**: 適切にハンドリング

## API Route Conventions
- **エラーハンドリング**: 統一されたApiErrorクラス使用
- **レスポンス形式**: NextResponse.json()使用
- **バリデーション**: Zodスキーマ使用

## Test Conventions
- **単体テスト**: `.test.ts` 拡張子
- **統合テスト**: `tests/integration/` ディレクトリ
- **テストツール**: Vitest + React Testing Library
- **モック**: 必要最小限に留める

## DRY原則
- **STRICT ENFORCEMENT**: 重複コードは絶対禁止
- **迂回禁止**: 同様の実装の重複は許可しない
- **共通化**: ユーティリティ関数、型定義、設定の統一