#!/usr/bin/env node

/**
 * Kiro-GitHub Project同期スクリプト
 * KiroタスクをGitHub Projectアイテムとして管理
 */

import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROJECT_NUMBER = 2 // Novel2Manga Development Project
const OWNER = 'matsuvr'

class KiroProjectSync {
  constructor() {
    this.kiroSpecsPath = path.join(process.cwd(), '.kiro', 'specs')
    this.syncStatePath = path.join(process.cwd(), '.kiro', 'project-sync-state.json')
  }

  async loadSyncState() {
    try {
      const data = await fs.readFile(this.syncStatePath, 'utf8')
      return JSON.parse(data)
    } catch {
      return { items: {}, fieldIds: {}, lastSync: null }
    }
  }

  async saveSyncState(state) {
    await fs.mkdir(path.dirname(this.syncStatePath), { recursive: true })
    await fs.writeFile(this.syncStatePath, JSON.stringify(state, null, 2))
  }

  async getProjectFieldIds() {
    try {
      const output = execSync(
        `gh project field-list ${PROJECT_NUMBER} --owner ${OWNER} --format json`,
        { encoding: 'utf8' },
      )

      const data = JSON.parse(output)
      const fieldIds = {}

      for (const field of data.fields) {
        fieldIds[field.name] = field.id

        // オプション付きフィールドの場合、オプションIDも保存
        if (field.options) {
          fieldIds[`${field.name}_options`] = {}
          for (const option of field.options) {
            fieldIds[`${field.name}_options`][option.name] = option.id
          }
        }
      }

      return fieldIds
    } catch (error) {
      console.error('Failed to get field IDs:', error.message)
      return {}
    }
  }

  async parseKiroTasks(specName) {
    const tasksPath = path.join(this.kiroSpecsPath, specName, 'tasks.md')
    const specPath = path.join(this.kiroSpecsPath, specName, 'spec.json')

    try {
      const content = await fs.readFile(tasksPath, 'utf8')
      const _specData = JSON.parse(await fs.readFile(specPath, 'utf8'))
      const tasks = []

      // タスクのパース
      const lines = content.split('\n')
      let currentPhase = ''
      let taskIndex = 0

      for (const line of lines) {
        if (line.startsWith('## ')) {
          currentPhase = line.replace('## ', '').trim()
        } else if (line.match(/^- \[([ x])\] (.+)/)) {
          const [, status, title] = line.match(/^- \[([ x])\] (.+)/)

          // 優先度の推定（タスクの内容から）
          let priority = 'Medium'
          if (title.toLowerCase().includes('critical') || title.toLowerCase().includes('重要')) {
            priority = 'High'
          } else if (
            title.toLowerCase().includes('optional') ||
            title.toLowerCase().includes('任意')
          ) {
            priority = 'Low'
          }

          tasks.push({
            id: `${specName}-task-${taskIndex++}`,
            title: `[${specName}] ${title}`,
            content: `Phase: ${currentPhase}\nSpec: ${specName}\n\nDescription: ${title}`,
            status: status === 'x' ? 'Done' : 'Todo',
            phase: currentPhase,
            priority: priority,
            spec: specName,
          })
        }
      }

      return tasks
    } catch (error) {
      console.error(`Failed to parse tasks for ${specName}:`, error.message)
      return []
    }
  }

  async createProjectItem(task, fieldIds) {
    try {
      // Draft itemを作成
      const createCommand = `gh project item-create ${PROJECT_NUMBER} --owner ${OWNER} --title "${task.title}" --format json`
      const createOutput = execSync(createCommand, { encoding: 'utf8' })
      const item = JSON.parse(createOutput)

      // フィールドを更新
      const updates = [
        { fieldId: fieldIds.Status, optionId: fieldIds.Status_options[task.status] },
        {
          fieldId: fieldIds.Phase,
          optionId: fieldIds.Phase_options[task.phase] || fieldIds.Phase_options.Implementation,
        },
        { fieldId: fieldIds.Priority, optionId: fieldIds.Priority_options[task.priority] },
        { fieldId: fieldIds.Spec, value: task.spec },
      ]

      for (const update of updates) {
        if (update.optionId) {
          // Single select field
          execSync(
            `gh project item-edit --id ${item.id} --field-id ${update.fieldId} --project-id ${item.project.id} --single-select-option-id ${update.optionId}`,
            { encoding: 'utf8' },
          )
        } else if (update.value) {
          // Text field
          execSync(
            `gh project item-edit --id ${item.id} --field-id ${update.fieldId} --project-id ${item.project.id} --text "${update.value}"`,
            { encoding: 'utf8' },
          )
        }
      }

      return item.id
    } catch (error) {
      console.error('Failed to create project item:', error.message)
      return null
    }
  }

  async syncKiroToProject() {
    console.log('🔄 Syncing Kiro tasks to GitHub Project...')

    const syncState = await this.loadSyncState()
    const fieldIds = await this.getProjectFieldIds()

    // フィールドIDを保存
    syncState.fieldIds = fieldIds

    const specs = await fs.readdir(this.kiroSpecsPath)

    for (const spec of specs) {
      const stat = await fs.stat(path.join(this.kiroSpecsPath, spec))
      if (!stat.isDirectory()) continue

      console.log(`\n📁 Processing spec: ${spec}`)
      const tasks = await this.parseKiroTasks(spec)

      for (const task of tasks) {
        const taskKey = task.id

        // 既存のアイテムがあるかチェック
        if (syncState.items[taskKey]) {
          console.log(`  ✓ Already synced: ${task.title}`)
          // TODO: ステータスの更新チェック
          continue
        }

        // 新しいアイテムを作成
        console.log(`  📝 Creating project item: ${task.title}`)
        const itemId = await this.createProjectItem(task, fieldIds)

        if (itemId) {
          syncState.items[taskKey] = {
            itemId,
            created: new Date().toISOString(),
            status: task.status,
          }
          console.log(`  ✅ Created project item`)
        }
      }
    }

    syncState.lastSync = new Date().toISOString()
    await this.saveSyncState(syncState)

    console.log('\n✨ Sync completed!')
  }

  async syncProjectToKiro() {
    console.log('🔄 Syncing GitHub Project to Kiro tasks...')

    // Project itemsからKiroタスクへの同期
    // ステータスの更新を反映
    const _syncState = await this.loadSyncState()

    // TODO: Project itemsを取得してKiroタスクのステータスを更新
    console.log('⚠️  Project to Kiro sync is under development')
  }

  async sync(direction = 'both') {
    if (direction === 'kiro-to-project' || direction === 'both') {
      await this.syncKiroToProject()
    }

    if (direction === 'project-to-kiro' || direction === 'both') {
      await this.syncProjectToKiro()
    }
  }
}

// CLIとして実行
const sync = new KiroProjectSync()
const direction = process.argv[2] || 'kiro-to-project'

sync.sync(direction).catch(console.error)

export default KiroProjectSync
