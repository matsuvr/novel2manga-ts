// LEGACY TEST (client.test.ts)
// 旧LLMレイヤ(client / fake) に依存していたため本実装移行で無効化。
// 将来: 完全に不要になったらファイル削除してください。
// NOTE: 空ファイルでVitestが失敗するためダミースイートを配置。

describe.skip('legacy llm client (removed)', () => {
  it('placeholder', () => {
    // no-op
  });
});

