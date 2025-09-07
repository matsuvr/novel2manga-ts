// JWT 検証関連設定（マジック文字列の集中管理）
export const jwtConfig = {
  salt: process.env.JWT_SALT || 'default-jwt-salt', // 本番では環境変数で必ず上書き
} as const

export type JwtConfig = typeof jwtConfig
