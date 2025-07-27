import { Hono } from 'hono';
import type { Env } from '../types/env';
import type { AnalyzeRequest, AnalyzeResponse } from '../types';
import { DatabaseService } from '../services/database';
import { StorageService } from '../services/storage';
import { generateUUID } from '../utils/uuid';
import { splitTextIntoChunks, generateChunkFileName } from '../utils/text-splitter';

export const analyzeRoute = new Hono<{ Bindings: Env }>();

analyzeRoute.post('/', async (c) => {
  try {
    const body = await c.req.json<AnalyzeRequest>();
    
    if (!body.text || body.text.trim().length === 0) {
      return c.json({ error: 'テキストが入力されていません' }, 400);
    }

    const jobId = generateUUID();
    const chunks = splitTextIntoChunks(body.text);
    
    const dbService = new DatabaseService(c.env.DB);
    const storageService = new StorageService(c.env.STORAGE);

    // 元のテキストをR2に保存
    await storageService.saveNovel(jobId, body.text);

    // ジョブをD1に保存
    await dbService.createJob(jobId, body.text, chunks.length);

    // チャンクを保存
    const chunkPromises = chunks.map(async (content, index) => {
      const chunkId = generateUUID();
      const fileName = generateChunkFileName(jobId, index);
      
      // R2にチャンクファイルを保存
      await storageService.saveChunk(fileName, content);
      
      // D1にチャンク情報を保存
      await dbService.createChunk({
        id: chunkId,
        jobId,
        chunkIndex: index,
        content,
        fileName,
      });
    });

    await Promise.all(chunkPromises);

    const response: AnalyzeResponse = {
      jobId,
      chunkCount: chunks.length,
      message: `テキストを${chunks.length}個のチャンクに分割しました`,
    };

    return c.json(response);
  } catch (error) {
    console.error('分析エラー:', error);
    return c.json({ error: 'テキストの分析中にエラーが発生しました' }, 500);
  }
});