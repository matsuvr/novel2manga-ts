import fs from 'fs/promises';
import path from 'path';

// APIエンドポイントのベースURL
const API_BASE = 'http://localhost:3000/api';

// テキストファイルを読み込み
async function loadText(): Promise<string> {
  const textPath = path.join(process.cwd(), 'docs', '最後の一葉.txt');
  return await fs.readFile(textPath, 'utf-8');
}

// Step 1: テキストをチャンクに分割してジョブを作成
async function createJob(text: string) {
  console.log('Step 1: Creating job and splitting into chunks...');
  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create job: ${response.statusText}`);
  }
  
  const result = await response.json();
  console.log(`Job created: ${result.jobId}, Chunks: ${result.chunkCount}`);
  return result;
}

// Step 2: 各チャンクの5要素分析を実行
async function analyzeChunks(jobId: string, chunkCount: number) {
  console.log('\nStep 2: Analyzing chunks (5 elements)...');
  
  for (let i = 0; i < chunkCount; i++) {
    console.log(`Analyzing chunk ${i}...`);
    const response = await fetch(`${API_BASE}/analyze/chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        novelId: jobId,
        chunkIndex: i
      })
    });
    
    if (!response.ok) {
      console.error(`Failed to analyze chunk ${i}: ${response.statusText}`);
      continue;
    }
    
    const result = await response.json();
    console.log(`Chunk ${i} analyzed successfully`);
  }
}

// Step 3: ナラティブアーク分析を実行
async function analyzeNarrativeArc(jobId: string) {
  console.log('\nStep 3: Analyzing narrative arc...');
  const response = await fetch(`${API_BASE}/analyze/narrative-arc/full`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      config: {
        chunksPerBatch: 20,
        targetCharsPerEpisode: 10000, // 短編なので少なめに設定
        minCharsPerEpisode: 5000,
        maxCharsPerEpisode: 15000
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to analyze narrative arc: ${response.statusText}`);
  }
  
  console.log('Narrative arc analysis started');
  
  // ジョブの完了を待つ
  await waitForJobCompletion(jobId);
}

// ジョブの完了を待つ
async function waitForJobCompletion(jobId: string) {
  console.log('\nWaiting for job completion...');
  let attempts = 0;
  const maxAttempts = 60; // 最大5分待つ
  
  while (attempts < maxAttempts) {
    const response = await fetch(`${API_BASE}/jobs/${jobId}/status`);
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }
    
    const status = await response.json();
    console.log(`Job status: ${status.status}, Progress: ${status.processedChunks}/${status.totalChunks}`);
    
    if (status.status === 'completed') {
      console.log('Job completed successfully!');
      return;
    } else if (status.status === 'failed') {
      throw new Error(`Job failed: ${status.errorMessage}`);
    }
    
    // 5秒待つ
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }
  
  throw new Error('Job timeout');
}

// Step 4: エピソード一覧を取得
async function getEpisodes(jobId: string) {
  console.log('\nStep 4: Getting episodes...');
  const response = await fetch(`${API_BASE}/jobs/${jobId}/episodes`);
  
  if (!response.ok) {
    throw new Error(`Failed to get episodes: ${response.statusText}`);
  }
  
  const result = await response.json();
  console.log(`Found ${result.totalEpisodes} episodes`);
  return result.episodes;
}

// Step 5: 各エピソードのレイアウトを生成
async function generateLayouts(jobId: string, episodes: any[]) {
  console.log('\nStep 5: Generating layouts...');
  
  for (const episode of episodes) {
    console.log(`\nGenerating layout for episode ${episode.episodeNumber}...`);
    const response = await fetch(`${API_BASE}/layout/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        episodeNumber: episode.episodeNumber,
        config: {
          panelsPerPage: {
            min: 3,
            max: 6,
            average: 4.5
          },
          dialogueDensity: 0.7,
          visualComplexity: 0.8,
          highlightPanelSizeMultiplier: 2.0
        }
      })
    });
    
    if (!response.ok) {
      console.error(`Failed to generate layout for episode ${episode.episodeNumber}: ${response.statusText}`);
      continue;
    }
    
    const result = await response.json();
    console.log(`Layout generated: ${result.layoutPath}`);
    
    // YAMLの内容を表示
    const yamlContent = await fs.readFile(result.layoutPath, 'utf-8');
    console.log('\n--- Generated YAML Preview ---');
    console.log(yamlContent.substring(0, 500) + '...');
  }
}

// メイン処理
async function main() {
  try {
    console.log('Starting layout generation test for "最後の一葉"...\n');
    
    // テキストを読み込み
    const text = await loadText();
    console.log(`Loaded text: ${text.length} characters`);
    
    // Step 1: ジョブ作成とチャンク分割
    const { jobId, chunkCount } = await createJob(text);
    
    // Step 2: チャンクの5要素分析
    await analyzeChunks(jobId, chunkCount);
    
    // Step 3: ナラティブアーク分析
    await analyzeNarrativeArc(jobId);
    
    // Step 4: エピソード取得
    const episodes = await getEpisodes(jobId);
    
    // Step 5: レイアウト生成
    await generateLayouts(jobId, episodes);
    
    console.log('\n✅ Layout generation test completed successfully!');
    console.log(`Check the generated YAML files in: .local-storage/layouts/${jobId}/`);
    
  } catch (error) {
    console.error('\n❌ Error during layout generation test:', error);
  }
}

// 実行
main();