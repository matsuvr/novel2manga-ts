import { z } from 'zod'
import type { Tool, ToolRegistry } from './types'
import { ToolError } from './types'

/**
 * シンプルなツールレジストリの実装
 */
export class SimpleToolRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name '${tool.name}' is already registered`)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  validate(name: string, args: Record<string, unknown>): boolean {
    const tool = this.get(name)
    if (!tool) {
      return false
    }

    try {
      // JSON Schemaを使用したバリデーション
      const schema = z.object(tool.schema as z.ZodRawShape)
      schema.parse(args)
      return true
    } catch {
      return false
    }
  }

  /**
   * ツールを実行
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Promise<unknown> {
    const tool = this.get(toolName)
    if (!tool) {
      throw new ToolError(
        `Tool '${toolName}' not found`,
        toolName,
        'unknown',
        undefined,
        new Error(`Tool '${toolName}' is not registered`),
      )
    }

    // バリデーション
    if (!this.validate(toolName, args)) {
      throw new ToolError(
        `Invalid arguments for tool '${toolName}'`,
        toolName,
        'unknown',
        undefined,
        new Error(`Arguments do not match schema for tool '${toolName}'`),
      )
    }

    try {
      return await tool.handle(args, context)
    } catch (error) {
      throw new ToolError(
        `Tool '${toolName}' execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        toolName,
        'unknown',
        undefined,
        error instanceof Error ? error : undefined,
      )
    }
  }
}

/**
 * Zodスキーマからツールを作成
 */
export function createToolFromZodSchema<T extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: z.ZodObject<T>,
  handler: (args: z.infer<z.ZodObject<T>>, context?: Record<string, unknown>) => Promise<unknown>,
): Tool {
  return {
    name,
    description,
    schema: schema.shape as Record<string, unknown>,
    handle: async (args: Record<string, unknown>, context?: Record<string, unknown>) => {
      const validatedArgs = schema.parse(args)
      return handler(validatedArgs, context)
    },
  }
}

/**
 * シンプルなツールを作成
 */
export function createTool(
  name: string,
  description: string,
  schema: Record<string, unknown>,
  handler: (args: Record<string, unknown>, context?: Record<string, unknown>) => Promise<unknown>,
): Tool {
  return {
    name,
    description,
    schema,
    handle: handler,
  }
}

/**
 * テスト用のモックツール
 */
export const mockTools = {
  echo: createTool(
    'echo',
    'Echoes back the input',
    {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    async (args) => {
      return `Echo: ${args.message}`
    },
  ),

  add: createTool(
    'add',
    'Adds two numbers',
    {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      required: ['a', 'b'],
    },
    async (args) => {
      return (args.a as number) + (args.b as number)
    },
  ),

  fail: createTool(
    'fail',
    'Always fails for testing',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async () => {
      throw new Error('This tool always fails')
    },
  ),
}
