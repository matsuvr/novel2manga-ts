'use client'

import { signOut } from 'next-auth/react'
import { useState } from 'react'

interface DeleteAccountDialogProps {
  isOpen: boolean
  onClose: () => void
  userEmail: string
}

export function DeleteAccountDialog({ isOpen, onClose, userEmail }: DeleteAccountDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expectedText = 'アカウントを削除'
  const isConfirmed = confirmText === expectedText

  const handleDelete = async () => {
    if (!isConfirmed) return

    setDeleting(true)
    setError(null)

    try {
      const response = await fetch('/api/me', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirm: true }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'アカウントの削除に失敗しました')
      }

      // Sign out and redirect to home
      await signOut({ callbackUrl: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期しないエラーが発生しました')
    } finally {
      setDeleting(false)
    }
  }

  const handleClose = () => {
    if (deleting) return
    setConfirmText('')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          role="button"
          tabIndex={0}
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={handleClose}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleClose()
            }
          }}
        />

        {/* Center the modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="sm:flex sm:items-start">
            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
              <svg
                className="h-6 w-6 text-red-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">アカウントの削除</h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  この操作は取り消せません。アカウントを削除すると、以下のデータがすべて永久に失われます：
                </p>
                <ul className="mt-2 text-sm text-gray-500 list-disc list-inside">
                  <li>プロフィール情報</li>
                  <li>アップロードした小説</li>
                  <li>変換ジョブとその結果</li>
                  <li>設定とカスタマイズ</li>
                </ul>
                <p className="mt-3 text-sm text-gray-500">
                  続行するには、下のテキストボックスに「
                  <span className="font-medium">{expectedText}</span>」と入力してください。
                </p>
              </div>

              {/* Confirmation input */}
              <div className="mt-4">
                <label htmlFor="confirm-text" className="block text-sm font-medium text-gray-700">
                  確認テキスト
                </label>
                <input
                  type="text"
                  id="confirm-text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={expectedText}
                  disabled={deleting}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* User email confirmation */}
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">
                  削除対象アカウント: <span className="font-medium">{userEmail}</span>
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!isConfirmed || deleting}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? '削除中...' : 'アカウントを削除'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={deleting}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
