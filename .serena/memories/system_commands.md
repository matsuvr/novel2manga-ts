# System Commands (Windows)

## Windows環境でのコマンド

### ファイル・ディレクトリ操作
```cmd
# ディレクトリ一覧
dir
# または
ls   # Git Bashの場合

# ディレクトリ移動
cd path\to\directory

# ファイル内容表示
type filename.txt
# または
cat filename.txt   # Git Bashの場合

# ファイル検索
findstr "search_text" filename.txt
# または
grep "search_text" filename.txt   # Git Bashの場合

# ディレクトリ検索
dir /s filename.txt
# または
find . -name "filename.txt"   # Git Bashの場合
```

### プロセス管理
```cmd
# プロセス一覧
tasklist

# プロセス終了
taskkill /PID process_id
taskkill /IM process_name.exe
```

### ネットワーク
```cmd
# ポート確認
netstat -an | findstr :3000

# HTTP リクエスト
curl http://localhost:3000/api/endpoint
```

### Git コマンド
```bash
git status
git add .
git commit -m "commit message"
git push
git pull
git log --oneline
```

### Node.js/npm
```bash
# Node.js バージョン確認
node --version

# npm バージョン確認
npm --version

# 依存関係インストール
npm install

# パッケージインストール
npm install package-name

# グローバルパッケージ一覧
npm list -g --depth=0
```

## PowerShell固有コマンド
```powershell
# ディレクトリ一覧（詳細）
Get-ChildItem

# プロセス一覧
Get-Process

# 環境変数表示
Get-ChildItem Env:
```

## 開発で頻用するコマンド組み合わせ
```bash
# 開発開始
cd G:\TsProjects\novel2manga-mastra
npm run dev

# テスト付き品質チェック
npm run check && npm test

# 統合テスト実行
npm run test:integration
```