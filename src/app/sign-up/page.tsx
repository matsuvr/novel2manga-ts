'use client'

import { useState } from 'react'

export default function SignUpPage() {
  const [agreed, setAgreed] = useState(false)

  return (
    <form className="flex flex-col gap-4 p-4" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-col">
        <span>Email</span>
        <input type="email" className="border p-2" required />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>利用規約に同意します</span>
      </label>
      <button
        type="submit"
        disabled={!agreed}
        className="bg-blue-500 text-white py-2 px-4 disabled:opacity-50"
      >
        Sign Up
      </button>
    </form>
  )
}
