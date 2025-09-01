import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignUpPage from '@/app/sign-up/page'

describe('SignUpPage', () => {
  it('disables submit until terms are accepted', async () => {
    render(<SignUpPage />)
    const submit = screen.getByRole('button', { name: /sign up/i })
    expect(submit).toBeDisabled()
    const checkbox = screen.getByRole('checkbox')
    await userEvent.click(checkbox)
    expect(submit).toBeEnabled()
  })
})
