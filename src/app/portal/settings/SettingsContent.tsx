'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'
import { DeleteAccountDialog } from './DeleteAccountDialog'

interface UserSettings {
  emailNotifications: boolean
  theme: 'light' | 'dark'
  language: 'ja' | 'en' | 'zh-TW'
}

interface UserData {
  id: string
  email: string
  name: string
  image: string
  settings: UserSettings
}

export function SettingsContent() {
  const { status } = useSession()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Form state
  const [formData, setFormData] = useState<UserSettings>({
    emailNotifications: true,
    theme: 'light',
    language: 'ja',
  })

  const fetchUserData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/me', { credentials: 'include' })

      if (!response.ok) {
        throw new Error('ユーザー情報の取得に失敗しました')
      }

      const data = await response.json()
      setUserData(data)
      setFormData(data.settings)
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期しないエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchUserData()
    }
  }, [status, fetchUserData])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: formData }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || '設定の保存に失敗しました')
      }

      setSuccessMessage('設定が保存されました')

      // Update local user data
      if (userData) {
        setUserData({ ...userData, settings: formData })
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期しないエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (
    field: keyof UserSettings,
    value: UserSettings[keyof UserSettings],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const hasChanges =
    userData &&
    (formData.emailNotifications !== userData.settings.emailNotifications ||
      formData.theme !== userData.settings.theme ||
      formData.language !== userData.settings.language)

  if (status === 'loading' || loading) {
    return <div className="text-center">読み込み中...</div>
  }

  if (status === 'unauthenticated') {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">ログインが必要です</h2>
        <Link
          href="/portal/api/auth/login"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          ログイン
        </Link>
      </div>
    )
  }

  if (error && !userData) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">エラー</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={fetchUserData}
                className="text-sm bg-red-100 text-red-800 rounded-md px-2 py-1 hover:bg-red-200"
              >
                再試行
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
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
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Profile Information */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">プロフィール情報</h2>

        {userData && (
          <div className="flex items-center space-x-4">
            {userData.image && (
              <Image
                className="h-12 w-12 rounded-full"
                src={userData.image}
                alt={userData.name || 'プロフィール画像'}
                width={48}
                height={48}
              />
            )}
            <div>
              <h3 className="text-lg font-medium text-gray-900">{userData.name || 'ユーザー'}</h3>
              <p className="text-sm text-gray-500">{userData.email}</p>
            </div>
          </div>
        )}
      </div>

      {/* Notification Settings */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">通知設定</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="email-notifications" className="text-sm font-medium text-gray-700">
                メール通知
              </label>
              <p className="text-sm text-gray-500">ジョブの完了や失敗時にメール通知を受け取る</p>
            </div>
            <button
              type="button"
              onClick={() => handleInputChange('emailNotifications', !formData.emailNotifications)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                formData.emailNotifications ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  formData.emailNotifications ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Appearance Settings */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">外観設定</h2>

        <div className="space-y-6">
          <div>
            <label htmlFor="theme" className="block text-sm font-medium text-gray-700 mb-2">
              テーマ
            </label>
            <select
              id="theme"
              value={formData.theme}
              onChange={(e) => handleInputChange('theme', e.target.value as 'light' | 'dark')}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="light">ライト</option>
              <option value="dark">ダーク</option>
            </select>
          </div>

          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
              言語
            </label>
            <select
              id="language"
              value={formData.language}
              onChange={(e) =>
                handleInputChange('language', e.target.value as 'ja' | 'en' | 'zh-TW')
              }
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
              <option value="zh-TW">繁體中文</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-700">設定の保存</h3>
            <p className="text-sm text-gray-500">
              変更を保存するには「保存」ボタンをクリックしてください
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white shadow rounded-lg p-6 border-l-4 border-red-400">
        <h2 className="text-lg font-medium text-red-900 mb-4">危険な操作</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-red-700">アカウントの削除</h3>
            <p className="text-sm text-red-600 mb-4">
              アカウントを削除すると、すべてのデータが永久に失われます。この操作は取り消せません。
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteDialog(true)}
              className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              アカウントを削除
            </button>
          </div>
        </div>
      </div>

      {/* Delete Account Dialog */}
      <DeleteAccountDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        userEmail={userData?.email || ''}
      />
    </div>
  )
}
