'use client'
import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-white border-t mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <p>© 2025 Novel2Manga</p>
          <div className="flex items-center space-x-6">
            <Link
              href="/terms"
              className="hover:text-blue-600 transition-colors"
            >
              利用規約
            </Link>
            <Link
              href="/privacy"
              className="hover:text-blue-600 transition-colors"
            >
              プライバシーポリシー
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}