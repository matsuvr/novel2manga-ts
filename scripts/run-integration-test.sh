#!/bin/bash

# 小説処理フロー統合テストの実行スクリプト

echo "🚀 小説処理フロー統合テスト開始"
echo "========================================"

# 環境変数の設定
export NODE_ENV=test
export DOTENV_CONFIG_PATH=.env.test

# 必要な環境変数がセットされているかチェック
check_env_vars() {
    local missing_vars=()

    # LLM API Keys のチェック（少なくとも2つは必要）
    local llm_count=0

    if [ -n "$OPENROUTER_API_KEY" ] && [ "$OPENROUTER_API_KEY" != "your_openrouter_api_key_here" ]; then
        ((llm_count++))
        echo "✓ OpenRouter API Key found"
    fi

    if [ -n "$GEMINI_API_KEY" ] && [ "$GEMINI_API_KEY" != "your_gemini_api_key_here" ]; then
        ((llm_count++))
        echo "✓ Gemini API Key found"
    fi

    if [ -n "$CLAUDE_API_KEY" ] && [ "$CLAUDE_API_KEY" != "your_claude_api_key_here" ]; then
        ((llm_count++))
        echo "✓ Claude API Key found"
    fi

    if [ $llm_count -lt 2 ]; then
        echo "❌ フォールバック機能のテストには最低2つのLLM API Keyが必要です"
        echo "   .env.test ファイルにAPI Keyを設定してください"
        exit 1
    fi

    echo "✓ 必要な環境変数が設定されています ($llm_count個のLLM プロバイダー)"
}

# 前提条件のチェック
check_prerequisites() {
    echo ""
    echo "📋 前提条件チェック"
    echo "------------------------"

    # Node.js version check
    node_version=$(node --version)
    echo "Node.js version: $node_version"

    # 小説ファイルの存在チェック
    novel_file="docs/宮本武蔵地の巻.txt"
    if [ ! -f "$novel_file" ]; then
        echo "❌ 小説ファイルが見つかりません: $novel_file"
        exit 1
    fi

    file_size=$(wc -c < "$novel_file")
    echo "✓ 小説ファイル見つかりました: $novel_file ($file_size bytes)"

    # Package dependencies check
    if [ ! -d "node_modules" ]; then
        echo "📦 依存関係をインストール中..."
        npm install
    fi

    echo "✓ 前提条件チェック完了"
}

# サーバー起動の確認
check_server() {
    echo ""
    echo "🔌 サーバー接続確認"
    echo "------------------------"

    # 既にサーバーが起動しているかチェック
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✓ サーバーは既に起動しています"
        return 0
    fi

    echo "⚠️  サーバーが起動していません"
    echo "   テスト前に 'npm run dev' でサーバーを起動してください"
    echo "   または、サーバー自動起動オプション付きでテストを実行してください"

    read -p "サーバーを自動起動しますか？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 サーバーを起動中..."
        npm run dev &
        SERVER_PID=$!

        # サーバー起動待機
        echo "サーバー起動を待機中..."
        for i in {1..30}; do
            if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
                echo "✓ サーバー起動完了"
                return 0
            fi
            echo -n "."
            sleep 2
        done

        echo ""
        echo "❌ サーバーの起動に失敗しました"
        exit 1
    else
        echo "テストを中止します"
        exit 1
    fi
}

# テスト実行
run_tests() {
    echo ""
    echo "🧪 統合テスト実行"
    echo "------------------------"

    # Vitestでテスト実行
    npx vitest run tests/integration/novel-processing-flow.test.ts \
        --reporter=verbose

    test_result=$?

    if [ $test_result -eq 0 ]; then
        echo ""
        echo "🎉 統合テスト完了"
        echo "================="
        echo "✓ 全ての工程が正常に動作しました"
        echo "  - 小説読み込み"
        echo "  - アップロード"
        echo "  - チャンク分割"
        echo "  - テキスト分析"
        echo "  - エピソード分析"
        echo "  - コマ割りYAML生成"
        echo "  - LLMフォールバック機能"
    else
        echo ""
        echo "❌ 統合テスト失敗"
        echo "================="
        echo "詳細はログを確認してください"
    fi

    return $test_result
}

# クリーンアップ
cleanup() {
    echo ""
    echo "🧹 クリーンアップ"
    echo "-------------------"

    if [ -n "$SERVER_PID" ]; then
        echo "サーバーを停止中..."
        kill $SERVER_PID 2>/dev/null
        wait $SERVER_PID 2>/dev/null
        echo "✓ サーバー停止完了"
    fi
}

# SIGINTトラップの設定
trap cleanup EXIT
trap cleanup SIGINT
trap cleanup SIGTERM

# メイン実行
main() {
    check_env_vars
    check_prerequisites
    check_server
    run_tests

    exit_code=$?
    cleanup
    exit $exit_code
}

# スクリプト実行
main "$@"
