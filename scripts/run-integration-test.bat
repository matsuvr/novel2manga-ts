@echo off
REM 小説処理フロー統合テストの実行スクリプト（Windows版）

echo 🚀 小説処理フロー統合テスト開始
echo ========================================

REM 環境変数の設定（dotenv-cli を使用して .env.test を読み込む）
set NODE_ENV=test
set N2M_TEST=1
set DOTENV_CONFIG_PATH=.env.test

echo.
echo 📋 前提条件チェック
echo ------------------------

REM Node.js version check
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Node.js version: %NODE_VERSION%

REM 小説ファイルの存在チェック
set NOVEL_FILE=docs\宮本武蔵地の巻.txt
if not exist "%NOVEL_FILE%" (
    echo ❌ 小説ファイルが見つかりません: %NOVEL_FILE%
    pause
    exit /b 1
)

for %%A in ("%NOVEL_FILE%") do set FILE_SIZE=%%~zA
echo ✓ 小説ファイル見つかりました: %NOVEL_FILE% (%FILE_SIZE% bytes)

REM Package dependencies check
if not exist "node_modules" (
    echo 📦 依存関係をインストール中...
    npm install
)

echo ✓ 前提条件チェック完了

echo.
echo 🔌 テスト用サーバー起動 (ポート3001)
echo ------------------------

REM 既存のポート3001使用プロセスを終了
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo 既存プロセスを終了: PID=%%p
    taskkill /F /PID %%p >nul 2>&1
)

REM 既存サーバー有無に関わらず、テスト専用ポートで起動
echo 🚀 サーバーを自動起動します (http://localhost:3001)
start /b cmd /c "set NODE_ENV=test && set N2M_TEST=1 && set PORT=3001 && npx next dev -p 3001"

echo サーバー起動を待機中...
for /l %%i in (1,1,40) do (
    ping 127.0.0.1 -n 3 >nul
    curl -s http://localhost:3001/api/health >nul 2>&1
    if not errorlevel 1 (
        echo ✓ サーバー起動完了 (http://localhost:3001)
        goto :run_tests
    )
    echo|set /p="."
)

echo.
echo ❌ サーバーの起動に失敗しました
exit /b 1

:run_tests
echo.
echo 🧪 統合テスト実行
echo ------------------------

REM Vitestでテスト実行（BASE_URLをテストサーバーに固定）
set NEXTAUTH_URL=http://localhost:3001
"node_modules/.bin/dotenv" -e .env.test -- npx vitest run tests/integration/full-pipeline.e2e.test.ts --reporter=verbose --config vitest.integration.config.ts

if %errorlevel% == 0 (
    echo.
    echo 🎉 統合テスト完了
    echo =================
    echo ✓ 全ての工程が正常に動作しました
    echo   - 小説読み込み
    echo   - アップロード
    echo   - チャンク分割
    echo   - テキスト分析
    echo   - エピソード分析
    echo   - コマ割りYAML生成
    echo   - LLMフォールバック機能
) else (
    echo.
    echo ❌ 統合テスト失敗
    echo =================
    echo 詳細はログを確認してください
)

echo.
echo テスト完了
