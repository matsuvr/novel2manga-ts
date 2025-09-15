import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MypageJobList from '@/components/mypage-job-list'
import type { MypageJobSummary } from '@/types/mypage'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

describe('MypageJobList', () => {
  it('renders empty list without crashing', () => {
    render(<MypageJobList jobs={[]} />)
    expect(screen.queryByText(/ジョブID/)).toBeNull()
  })

  it('shows processing indicator and navigates to progress on click', async () => {
    const user = userEvent.setup()
    const jobs: MypageJobSummary[] = [
      { id: 'j1', novelId: 'n1', novelTitle: 'Novel 1', status: 'processing' },
    ]
    render(<MypageJobList jobs={jobs} />)
    expect(screen.getByText('処理中')).toBeInTheDocument()
  })

  it('shows resume button for failed job', async () => {
    const jobs: MypageJobSummary[] = [
      { id: 'j2', novelId: 'n2', novelTitle: 'Novel 2', status: 'failed' },
    ]
    render(<MypageJobList jobs={jobs} />)
    expect(screen.getByText('再開')).toBeInTheDocument()
  })

  it('shows results link for completed job', () => {
    const jobs: MypageJobSummary[] = [
      { id: 'j3', novelId: 'n3', novelTitle: 'Novel 3', status: 'completed' },
    ]
    render(<MypageJobList jobs={jobs} />)
    expect(screen.getByText('結果を見る')).toBeInTheDocument()
  })
})
