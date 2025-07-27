import type { R2Bucket } from '@cloudflare/workers-types';

export class StorageService {
  constructor(private bucket: R2Bucket) {}

  async saveNovel(key: string, content: string): Promise<void> {
    await this.bucket.put(`novels/${key}.txt`, content, {
      httpMetadata: {
        contentType: 'text/plain; charset=utf-8',
      },
    });
  }

  async saveChunk(key: string, content: string): Promise<void> {
    await this.bucket.put(`chunks/${key}`, content, {
      httpMetadata: {
        contentType: 'text/plain; charset=utf-8',
      },
    });
  }

  async getNovel(key: string): Promise<string | null> {
    const object = await this.bucket.get(`novels/${key}.txt`);
    if (!object) return null;
    return await object.text();
  }

  async getChunk(key: string): Promise<string | null> {
    const object = await this.bucket.get(`chunks/${key}`);
    if (!object) return null;
    return await object.text();
  }
}