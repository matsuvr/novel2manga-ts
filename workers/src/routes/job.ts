import { Hono } from 'hono';
import type { Env } from '../types/env';
import type { JobResponse } from '../types';
import { DatabaseService } from '../services/database';

export const jobRoute = new Hono<{ Bindings: Env }>();

jobRoute.get('/:id', async (c) => {
  try {
    const jobId = c.req.param('id');
    
    if (!jobId) {
      return c.json({ error: 'ジョブIDが指定されていません' }, 400);
    }

    const dbService = new DatabaseService(c.env.DB);
    
    const job = await dbService.getJob(jobId);
    if (!job) {
      return c.json({ error: 'ジョブが見つかりません' }, 404);
    }

    const chunks = await dbService.getChunksByJobId(jobId);

    const response: JobResponse = {
      job,
      chunks,
    };

    return c.json(response);
  } catch (error) {
    console.error('ジョブ取得エラー:', error);
    return c.json({ error: 'ジョブの取得中にエラーが発生しました' }, 500);
  }
});