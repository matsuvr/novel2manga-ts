@echo off
REM 小説処理フロー統合テストの実行スクリプト（Windows版）

echo 🚀 小説処理フロー統合テスト開始
echo ========================================

REM 環境変数の設定
set NODE_ENV=test
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
echo 🔌 サーバー接続確認
echo ------------------------

REM サーバーの接続確認
curl -s http://localhost:3000/api/health >nul 2>&1
if %errorlevel% == 0 (
    echo ✓ サーバーは既に起動しています
    goto :run_tests
)

echo ⚠️  サーバーが起動していません
echo    テスト前に 'npm run dev' でサーバーを起動してください
echo    または、サーバー自動起動オプション付きでテストを実行してください

set /p AUTO_START="サーバーを自動起動しますか？ (y/N): "
if /i "%AUTO_START%" == "y" (
    echo 🚀 サーバーを起動中...
    start /b npm run dev

    echo サーバー起動を待機中...
    for /l %%i in (1,1,30) do (
        ping 127.0.0.1 -n 3 >nul
        curl -s http://localhost:3000/api/health >nul 2>&1
        if not errorlevel 1 (
            echo ✓ サーバー起動完了
            goto :run_tests
        )
        echo|set /p="."
    )

    echo.
    echo ❌ サーバーの起動に失敗しました
    pause
    exit /b 1
) else (
    echo テストを中止します
    pause
    exit /b 1
)

:run_tests
echo.
echo 🧪 統合テスト実行
echo ------------------------

REM Vitestでテスト実行
npx vitest run tests/integration/novel-processing-flow.test.ts --reporter=verbose

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
echo テスト完了。何かキーを押して終了してください...
pause >nul
