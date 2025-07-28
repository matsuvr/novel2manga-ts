import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_ENDPOINT = 'http://localhost:3000/api/novel/storage';

async function testUpload() {
  try {
    console.log('📡 テストアップロードを開始...');
    
    const testText = "これはテストテキストです。\n小説のアップロードをテストしています。";
    
    console.log('🔌 APIエンドポイント:', API_ENDPOINT);
    console.log('📝 テキスト長:', testText.length);
    
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: testText }),
    });
    
    console.log('📨 レスポンスステータス:', response.status);
    console.log('📨 レスポンスヘッダー:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('📨 レスポンス本文:', responseText);
    
    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('✅ アップロード成功!');
      console.log('📁 ファイル名:', data.fileName);
      console.log('🆔 UUID:', data.uuid);
      
      // 保存されたファイルを確認
      const localStoragePath = path.join(process.cwd(), '.local-storage', 'novels');
      console.log('\n📂 ローカルストレージパス:', localStoragePath);
      
      try {
        const files = await fs.readdir(localStoragePath);
        console.log('📋 保存されたファイル:', files);
      } catch (err) {
        console.log('⚠️  ローカルストレージディレクトリが見つかりません');
      }
    } else {
      console.error('❌ アップロード失敗');
    }
    
  } catch (error) {
    console.error('🚨 エラー発生:', error.message);
    console.error('スタックトレース:', error.stack);
  }
}

// 実行
testUpload();