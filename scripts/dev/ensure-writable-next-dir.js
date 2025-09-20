#!/usr/bin/env node
/**
 * Ensure .next and .next/types are writable by the current user before running next typegen.
 * If not writable, print a clear message with remediation steps and exit non-zero.
 */

import { access, constants, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'

async function ensureDirWriteable(dir) {
  try {
    await mkdir(dir, { recursive: true })
  } catch {
    // ignore mkdir race
  }
  try {
    await access(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

async function main() {
  const root = process.cwd()
  const nextDir = path.join(root, '.next')
  const typesDir = path.join(nextDir, 'types')

  const nextWritable = await ensureDirWriteable(nextDir)
  const typesWritable = await ensureDirWriteable(typesDir)

  if (!nextWritable || !typesWritable) {
    console.error('[Guard] .next is not writable by current user.\n')
    try {
      const s = await stat(nextDir)
      console.error(`.next exists (mode: ${s.mode.toString(8)} uid:${s.uid} gid:${s.gid}).`)
    } catch (_) {
      console.error('.next does not exist yet.')
    }
    console.error(`\nRemediation options:\n- chown: sudo chown -R $(id -u):$(id -g) .next\n- or clean: rm -rf .next (if safe)\n- in Docker dev, run the container with user: \"$UID:$GID\" to avoid root-owned artifacts.\n`)
    process.exit(2)
  }
}

main().catch((err) => {
  console.error('[Guard] Failed to ensure .next writability:', err)
  process.exit(2)
})
