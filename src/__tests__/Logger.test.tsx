import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Logger from '@/components/Logger'

describe('Logger Component', () => {
  it('should render the logger component with empty logs', () => {
    render(<Logger logs={[]} />)
    expect(screen.getByText('処理ログ')).toBeInTheDocument()
    expect(screen.getByText('ログがありません')).toBeInTheDocument()
  })

  it('should render log entries', () => {
    const mockLogs = [
      {
        timestamp: new Date('2025-01-27T10:00:00'),
        level: 'info' as const,
        message: 'テストメッセージ1',
      },
      {
        timestamp: new Date('2025-01-27T10:00:01'),
        level: 'error' as const,
        message: 'エラーメッセージ',
      },
    ]

    render(<Logger logs={mockLogs} />)
    expect(screen.getByText('テストメッセージ1')).toBeInTheDocument()
    expect(screen.getByText('エラーメッセージ')).toBeInTheDocument()
    expect(screen.getByText('[INFO]')).toBeInTheDocument()
    expect(screen.getByText('[ERROR]')).toBeInTheDocument()
  })
})
