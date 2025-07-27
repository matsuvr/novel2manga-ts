#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// 標準入力からデータを読み取る
let inputData = '';
process.stdin.on('data', (chunk) => {
    inputData += chunk;
});

process.stdin.on('end', () => {
    try {
        const data = JSON.parse(inputData);
        
        // 確認が必要なメッセージパターンを検出
        const confirmationPatterns = [
            /確認.*お願い/i,
            /レビュー.*しましたか/i,
            /approve.*required/i,
            /\[y\/N\]/,
            /続行.*しますか/i,
            /よろしいですか/i,
            /確認してください/i,
            /Do you want to/i,
            /Would you like to/i,
            /Please confirm/i,
            /Please review/i
        ];
        
        // メッセージの内容をチェック
        const message = data.message || '';
        const role = data.role || '';
        
        // アシスタントからのメッセージで確認パターンが含まれている場合
        if (role === 'assistant' && confirmationPatterns.some(pattern => pattern.test(message))) {
            // PowerShellスクリプトのパス（簡易版を使用）
            const scriptPath = path.join(__dirname, 'notify-simple.ps1');
            
            // メッセージから最初の100文字を抽出（長すぎる場合）
            const shortMessage = message.substring(0, 100) + (message.length > 100 ? '...' : '');
            
            // PowerShellコマンドを実行
            const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -Title "Claude Code - 確認要求" -Message "${shortMessage.replace(/"/g, '`"')}"`;
            
            try {
                execSync(command, { windowsHide: true });
                console.error('[Hook] Windows通知を送信しました');
            } catch (err) {
                console.error('[Hook] 通知の送信に失敗しました:', err.message);
            }
        }
        
        // 元のデータをそのまま出力（Claude Codeに返す）
        process.stdout.write(JSON.stringify(data));
        
    } catch (error) {
        console.error('[Hook Error]', error);
        // エラーが発生してもデータはそのまま返す
        process.stdout.write(inputData);
    }
});