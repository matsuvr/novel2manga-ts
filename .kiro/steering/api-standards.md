<!-- Inclusion Mode: Conditional: "src/app/api/**/*", "**/route.ts" -->

# API Standards

API設計とエンドポイント実装に関する標準規約とパターン。

## エンドポイント設計原則

### 命名規則
- RESTfulな命名: `/api/[リソース名]`（複数形を使用）
- ネストしたリソース: `/api/novels/{id}/chapters`
- アクション指向の場合: `/api/[リソース]/[動詞]`（例: `/api/file/upload`）

### HTTPメソッドの使用
```typescript
// GET: リソースの取得
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  // ...
}

// POST: リソースの作成
export async function POST(request: NextRequest) {
  const body = await request.json()
  // ...
}

// PUT: リソースの完全な更新
export async function PUT(request: NextRequest) {
  const body = await request.json()
  // ...
}

// DELETE: リソースの削除
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  // ...
}
```

## レスポンス形式

### 成功レスポンス
```typescript
// 単一リソース
return NextResponse.json({
  data: resource,
  metadata: {
    timestamp: new Date().toISOString()
  }
})

// 複数リソース
return NextResponse.json({
  data: resources,
  metadata: {
    total: totalCount,
    page: currentPage,
    pageSize: pageSize
  }
})

// 作成成功
return NextResponse.json({
  success: true,
  id: newResourceId,
  message: '作成されました'
}, { status: 201 })
```

### エラーレスポンス
```typescript
// 標準エラー形式
return NextResponse.json({
  error: {
    code: 'VALIDATION_ERROR',
    message: 'ユーザー向けメッセージ',
    details: {
      field: 'email',
      reason: '無効なメールアドレス形式'
    }
  }
}, { status: 400 })

// 共通エラーコード
// BAD_REQUEST (400): VALIDATION_ERROR, MISSING_PARAMETER, INVALID_FORMAT
// UNAUTHORIZED (401): AUTH_REQUIRED, TOKEN_EXPIRED
// FORBIDDEN (403): PERMISSION_DENIED, RATE_LIMITED
// NOT_FOUND (404): RESOURCE_NOT_FOUND
// INTERNAL_ERROR (500): SERVER_ERROR, DATABASE_ERROR
```

## 入力検証

### 必須バリデーション
```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 型チェック
    if (typeof body.text !== 'string') {
      return NextResponse.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '入力は文字列である必要があります'
        }
      }, { status: 400 })
    }
    
    // 必須フィールドチェック
    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json({
        error: {
          code: 'MISSING_PARAMETER',
          message: 'テキストは必須です'
        }
      }, { status: 400 })
    }
    
    // 長さ制限
    const MAX_LENGTH = 1000000 // 1MB相当
    if (body.text.length > MAX_LENGTH) {
      return NextResponse.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `テキストは${MAX_LENGTH}文字以内にしてください`
        }
      }, { status: 400 })
    }
    
    // 処理実行
  } catch (error) {
    // JSONパースエラー
    if (error instanceof SyntaxError) {
      return NextResponse.json({
        error: {
          code: 'INVALID_FORMAT',
          message: '無効なJSON形式です'
        }
      }, { status: 400 })
    }
    throw error
  }
}
```

## エラーハンドリング

### 統一エラーハンドラー
```typescript
// utils/api-error.ts
export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number,
    public details?: any
  ) {
    super(message)
  }
}

// エンドポイントでの使用
export async function POST(request: NextRequest) {
  try {
    // ビジネスロジック
  } catch (error) {
    console.error('API Error:', error)
    
    if (error instanceof ApiError) {
      return NextResponse.json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      }, { status: error.status })
    }
    
    // 予期しないエラー
    return NextResponse.json({
      error: {
        code: 'SERVER_ERROR',
        message: 'サーバーエラーが発生しました'
      }
    }, { status: 500 })
  }
}
```

## Cloudflare Workers固有の考慮事項

### R2バインディングアクセス
```typescript
// グローバルオブジェクトからアクセス
// @ts-ignore - ランタイムでのみ利用可能
if (globalThis.NOVEL_STORAGE) {
  await globalThis.NOVEL_STORAGE.put(key, value, {
    httpMetadata: {
      contentType: 'text/plain; charset=utf-8'
    },
    customMetadata: {
      uploadedAt: new Date().toISOString()
    }
  })
} else {
  throw new ApiError(
    'STORAGE_UNAVAILABLE',
    'ストレージが利用できません',
    503
  )
}
```

### レート制限
```typescript
// TODO: Cloudflare Rate Limitingルールと連携
// ヘッダーで残りリクエスト数を返す
response.headers.set('X-RateLimit-Limit', '100')
response.headers.set('X-RateLimit-Remaining', '95')
response.headers.set('X-RateLimit-Reset', resetTime.toISOString())
```

## セキュリティ

### CORS設定
```typescript
// 必要に応じてCORSヘッダーを設定
const response = NextResponse.json(data)
response.headers.set('Access-Control-Allow-Origin', '*')
response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
return response
```

### 入力サニタイゼーション
- SQLインジェクション対策: パラメータ化クエリを使用
- XSS対策: HTMLエンティティのエスケープ
- パストラバーサル対策: ファイルパスの検証

## パフォーマンス最適化

### キャッシュ戦略
```typescript
// 適切なキャッシュヘッダーの設定
response.headers.set('Cache-Control', 'public, max-age=3600') // 1時間
response.headers.set('ETag', `"${resourceVersion}"`)
```

### ペイロードサイズ制限
- リクエストボディ: 最大10MB
- レスポンス: 必要な情報のみ返す（過剰なデータを避ける）
- 大きなデータ: ページネーションまたはストリーミング使用

## 統合ポイント

- **tech.md**: Next.js App RouterとCloudflare Workersの技術スタック
- **structure.md**: APIルートのディレクトリ構造（`src/app/api/`）
- **product.md**: API機能要件と制約事項