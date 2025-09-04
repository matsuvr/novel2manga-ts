import crypto from 'node:crypto'
import { db } from '../src/services/database/index'

async function main() {
  const jobs = db.jobs()
  const novels = db.novels()
  const chunks = db.chunks()
  const episodes = db.episodes()

  // 1) Create or ensure a novel
  const novelId = crypto.randomUUID()
  await novels.ensureNovel(novelId, {
    title: 'Smoke Test Novel',
    author: 'Tester',
    originalTextPath: 'storage/smoke-test.txt',
    textLength: 1234,
    language: 'ja',
    metadataPath: undefined,
    userId: 'test-user',
  })
  console.log('✓ ensureNovel ok:', novelId)

  // 2) Create a job for the novel
  const jobId = await (async () => {
    const id = crypto.randomUUID()
    jobs.createJobRecord({
      id,
      novelId,
      title: 'Smoke Job',
      totalChunks: 1,
      status: 'pending',
      userId: 'test-user',
    })
    return id
  })()
  console.log('✓ createJob ok:', jobId)

  // 3) Insert a chunk (unique constraint on (job_id, chunk_index) must hold)
  const chunkId = await chunks.createChunk({
    novelId,
    jobId,
    chunkIndex: 0,
    contentPath: 'storage/chunk-0.txt',
    startPosition: 0,
    endPosition: 100,
    wordCount: 100,
  })
  console.log('✓ createChunk ok:', chunkId)

  // 3b) Try to insert duplicate (job_id, chunk_index) to ensure unique constraint is enforced
  let duplicateEnforced = false
  try {
    await chunks.createChunk({
      novelId,
      jobId,
      chunkIndex: 0,
      contentPath: 'storage/chunk-0-dup.txt',
      startPosition: 0,
      endPosition: 100,
      wordCount: 100,
    })
  } catch (_e) {
    duplicateEnforced = true
    console.log('✓ unique (job_id, chunk_index) enforced for chunks')
  }
  if (!duplicateEnforced) {
    throw new Error('Unique constraint on chunks(job_id, chunk_index) NOT enforced')
  }

  // 4) Create a minimal episode (unique (job_id, episode_number) must hold)
  await episodes.createEpisode({
    novelId,
    jobId,
    episodeNumber: 1,
    title: 'Ep1',
    summary: undefined,
    startChunk: 0,
    startCharIndex: 0,
    endChunk: 0,
    endCharIndex: 0,
    confidence: 1,
  })
  console.log('✓ createEpisode ok: episode 1')

  // 4b) Duplicate episode number should fail
  let epDuplicateEnforced = false
  try {
    await episodes.createEpisode({
      novelId,
      jobId,
      episodeNumber: 1,
      title: 'Ep1-dup',
      summary: undefined,
      startChunk: 0,
      startCharIndex: 0,
      endChunk: 0,
      endCharIndex: 0,
      confidence: 1,
    })
  } catch (_e) {
    epDuplicateEnforced = true
    console.log('✓ unique (job_id, episode_number) enforced for episodes')
  }
  if (!epDuplicateEnforced) {
    throw new Error('Unique constraint on episodes(job_id, episode_number) NOT enforced')
  }

  // 5) Read back job with progress (used by /api/jobs/[jobId]/status)
  const jobWithProgress = await jobs.getJobWithProgress(jobId)
  if (!jobWithProgress) throw new Error('Job not found after creation')
  console.log('✓ getJobWithProgress ok:', {
    id: jobWithProgress.id,
    status: jobWithProgress.status,
    currentStep: jobWithProgress.currentStep,
    progress: jobWithProgress.progress,
  })

  console.log('\nAll smoke checks passed.')
}

main().catch((err) => {
  console.error('Smoke test failed:', err)
  process.exit(1)
})
