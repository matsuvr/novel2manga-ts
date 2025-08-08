// テスト用の型拡張（型チェック専用）

export {}

declare global {
  // fetch/Response の json() を any で扱う（テストで data のプロパティアクセスを許容）
  interface Response {
    json(): Promise<any>
  }

  // JSON.parse に undefined を許容（optional chaining での使用を許可）
  interface JSON {
    parse(text: string | undefined, reviver?: (this: any, key: string, value: any) => any): any
  }

  // テストで使用するグローバル（Cloudflare Workers のバインディング想定）
  // これらは実行時にモックされるため any とする
  var NOVEL_STORAGE: any
  var DB: any
}
