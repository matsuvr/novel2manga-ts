import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const filePath = searchParams.get('path')
    
    if (!filePath) {
      return NextResponse.json({ error: 'Path parameter is required' }, { status: 400 })
    }

    // セキュリティ: パスの検証
    const normalizedPath = path.normalize(filePath).replace(/\\/g, '/')
    if (normalizedPath.includes('..') || !normalizedPath.startsWith('docs/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    // プロジェクトルートからの相対パスでファイルを読み込む
    const fullPath = path.join(process.cwd(), normalizedPath)
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      })
    } catch (error) {
      console.error('File read error:', error)
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}