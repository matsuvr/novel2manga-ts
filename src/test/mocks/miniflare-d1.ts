// Minimal typed mock compatible with test usage in this repo
interface SqliteLike {
  prepare: (sql: string) => { run: (...args: unknown[]) => unknown }
}

export class D1DatabaseAPI {
  db: SqliteLike
  constructor(sqlite: SqliteLike) {
    this.db = sqlite
  }
  async run(sql: string) {
    // better-sqlite3 run returns { changes, lastInsertRowid }
    return this.db.prepare(sql).run()
  }
}

export class D1Database {
  api: D1DatabaseAPI
  constructor(api: D1DatabaseAPI) {
    this.api = api
  }
  async exec(sql: string) {
    // execute statements; using run for simplicity
    return this.api.run(sql)
  }
}
