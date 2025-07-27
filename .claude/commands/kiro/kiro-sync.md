# Kiro-GitHub Project Sync

KiroタスクとGitHub Projectを同期するコマンドです。

## 同期の実行

```bash
# KiroからGitHub Projectへの同期
node .claude/scripts/kiro-project-sync.js kiro-to-project

# GitHub ProjectからKiroへの同期（ステータス更新）
node .claude/scripts/kiro-project-sync.js project-to-kiro

# 双方向同期
node .claude/scripts/kiro-project-sync.js both
```

## 同期内容

### Kiro → GitHub Project
- tasks.mdのタスクをProject itemとして作成
- Status（Todo/Done）の設定
- Phase（Requirements/Design/Implementation等）の設定
- Priority（High/Medium/Low）の設定
- Spec名の記録

### GitHub Project → Kiro
- Project itemのステータス変更をtasks.mdに反映
- 完了したタスクのチェックボックスを更新

## 注意事項
- 初回実行時はすべてのタスクが新規作成されます
- 同期状態は`.kiro/project-sync-state.json`に保存されます
- タスクの削除は自動同期されません（手動で対応が必要）