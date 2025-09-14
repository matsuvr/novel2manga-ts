'use client'

import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export function SignInForm() {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const error = searchParams.get('error')

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      await signIn('google', {
        callbackUrl,
        redirect: true,
      })
    } catch (error) {
      console.error('Sign in error:', error)
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">ログインエラー</h3>
              <div className="mt-2 text-sm text-red-700">
                {error === 'OAuthSignin' && 'OAuth プロバイダーでエラーが発生しました。'}
                {error === 'OAuthCallback' && 'OAuth コールバックでエラーが発生しました。'}
                {error === 'OAuthCreateAccount' && 'アカウント作成でエラーが発生しました。'}
                {error === 'EmailCreateAccount' && 'メールアカウント作成でエラーが発生しました。'}
                {error === 'Callback' && 'コールバック処理でエラーが発生しました。'}
                {error === 'OAuthAccountNotLinked' &&
                  'このメールアドレスは既に別のアカウントで使用されています。'}
                {error === 'EmailSignin' && 'メール送信でエラーが発生しました。'}
                {error === 'CredentialsSignin' && '認証情報が正しくありません。'}
                {error === 'SessionRequired' && 'このページにアクセスするにはログインが必要です。'}
                {![
                  'OAuthSignin',
                  'OAuthCallback',
                  'OAuthCreateAccount',
                  'EmailCreateAccount',
                  'Callback',
                  'OAuthAccountNotLinked',
                  'EmailSignin',
                  'CredentialsSignin',
                  'SessionRequired',
                ].includes(error) && '予期しないエラーが発生しました。もう一度お試しください。'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          data-testid="google-signin-button"
          className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <div className="flex items-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              ログイン中...
            </div>
          ) : (
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google でログイン
            </div>
          )}
        </button>
      </div>

      <div className="text-xs text-gray-500 text-center">
        ログインすることで、
        <a href="/terms" className="text-blue-600 hover:text-blue-500">
          利用規約
        </a>
        および
        <a href="/privacy" className="text-blue-600 hover:text-blue-500">
          プライバシーポリシー
        </a>
        に同意したものとみなされます。
      </div>
    </div>
  )
}
