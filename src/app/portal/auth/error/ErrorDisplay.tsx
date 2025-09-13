'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export function ErrorDisplay() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case 'Configuration':
        return {
          title: '設定エラー',
          message: 'サーバーの設定に問題があります。管理者にお問い合わせください。',
          canRetry: false,
        }
      case 'AccessDenied':
        return {
          title: 'アクセス拒否',
          message: 'このアカウントではログインできません。別のアカウントをお試しください。',
          canRetry: true,
        }
      case 'Verification':
        return {
          title: '認証エラー',
          message: '認証トークンが無効または期限切れです。もう一度お試しください。',
          canRetry: true,
        }
      case 'OAuthSignin':
        return {
          title: 'OAuth エラー',
          message: 'OAuth プロバイダーとの通信でエラーが発生しました。',
          canRetry: true,
        }
      case 'OAuthCallback':
        return {
          title: 'OAuth コールバックエラー',
          message: 'OAuth コールバック処理でエラーが発生しました。',
          canRetry: true,
        }
      case 'OAuthCreateAccount':
        return {
          title: 'アカウント作成エラー',
          message: 'アカウントの作成に失敗しました。',
          canRetry: true,
        }
      case 'EmailCreateAccount':
        return {
          title: 'メールアカウント作成エラー',
          message: 'メールアカウントの作成に失敗しました。',
          canRetry: true,
        }
      case 'Callback':
        return {
          title: 'コールバックエラー',
          message: 'コールバック処理でエラーが発生しました。',
          canRetry: true,
        }
      case 'OAuthAccountNotLinked':
        return {
          title: 'アカウント連携エラー',
          message:
            'このメールアドレスは既に別のアカウントで使用されています。同じメールアドレスの別のプロバイダーでログインしてください。',
          canRetry: true,
        }
      case 'EmailSignin':
        return {
          title: 'メール送信エラー',
          message: 'サインインメールの送信に失敗しました。',
          canRetry: true,
        }
      case 'CredentialsSignin':
        return {
          title: '認証情報エラー',
          message: '認証情報が正しくありません。',
          canRetry: true,
        }
      case 'SessionRequired':
        return {
          title: 'セッション必須',
          message: 'このページにアクセスするにはログインが必要です。',
          canRetry: true,
        }
      default:
        return {
          title: '予期しないエラー',
          message: '予期しないエラーが発生しました。しばらく時間をおいてから再度お試しください。',
          canRetry: true,
        }
    }
  }

  const errorInfo = getErrorMessage(error)

  return (
    <div className="space-y-6">
      <div className="bg-red-50 border border-red-200 rounded-md p-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">{errorInfo.title}</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{errorInfo.message}</p>
            </div>
            {error && <div className="mt-2 text-xs text-red-600">エラーコード: {error}</div>}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {errorInfo.canRetry && (
          <Link
            href="/portal/auth/signin"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            再度ログインを試す
          </Link>
        )}

        <Link
          href="/"
          className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          ホームに戻る
        </Link>
      </div>

      <div className="text-xs text-gray-500 text-center">
        問題が解決しない場合は、
        <a href="/contact" className="text-blue-600 hover:text-blue-500">
          お問い合わせ
        </a>
        ください。
      </div>
    </div>
  )
}
