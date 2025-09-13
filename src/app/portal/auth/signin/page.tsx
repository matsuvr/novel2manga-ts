import { Suspense } from 'react'
import { SignInForm } from './SignInForm'

export default function SignInPage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Novel2Manga にログイン
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Google アカウントでログインして、小説を漫画に変換しましょう
          </p>
        </div>
        <Suspense fallback={<div className="text-center">読み込み中...</div>}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  )
}
