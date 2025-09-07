import { render, screen } from '@testing-library/react'
import HelloPage from '@/app/hello/page'

describe('HelloPage', () => {
  it('renders greeting', () => {
    render(<HelloPage />)
    expect(screen.getByText('Hello Cloudflare!')).toBeInTheDocument()
  })
})
