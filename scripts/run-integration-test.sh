#!/bin/bash

# 小説処理フロー統合テストの実行スクリプト

echo "🚀 小説処理フロー統合テスト開始"
echo "========================================"

# 環境変数の設定
export NODE_ENV=test
export N2M_TEST=1
export N2M_MOCK_LLM=1
export DOTENV_CONFIG_PATH=.env.test

# 必要な環境変数がセットされているかチェック
check_env_vars() {
    echo "✓ テストは LLM モックモードで実行します (N2M_MOCK_LLM=1)"
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

    echo "🚀 サーバーを自動起動します..."
    NODE_ENV=test N2M_TEST=1 N2M_MOCK_LLM=1 npm run dev &
    SERVER_PID=$!

    # サーバー起動待機
    echo "サーバー起動を待機中..."
    for i in {1..40}; do
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
}

# テスト実行
run_tests() {
    echo ""
    echo "🧪 統合テスト実行"
    echo "------------------------"

    # Vitestでテスト実行
    npx dotenv -e .env.test -- vitest run tests/integration/full-pipeline.e2e.test.ts --reporter=verbose --config vitest.integration.config.ts

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
