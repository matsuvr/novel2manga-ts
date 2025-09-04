import ProgressPageClient from '@/components/ProgressPageClient'

export default async function ProgressPage({ params }: { params: Promise<{ novelId: string }> }) {
  const { novelId } = await params
  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
    >
      <header className="modern-header">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-3xl">📚</div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  Novel to Manga Converter
                </h1>
                <p className="text-sm text-gray-600">小説をマンガの絵コンテに自動変換</p>
              </div>
            </div>
            <a
              href="/"
              className="px-6 py-3 bg-gray-100 text-gray-700 border border-gray-200 rounded-2xl font-medium shadow-sm shadow-gray-500/10 transition-all duration-300 ease-out hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 active:scale-95"
            >
              🔄 最初から
            </a>
          </div>
        </div>
      </header>

      <main className="py-10 container mx-auto px-6">
        <ProgressPageClient novelId={novelId} />
      </main>

      <footer className="modern-header border-t mt-auto">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <p>© 2025 Novel to Manga Converter</p>
            <div className="flex items-center space-x-6">
              <a href="/help" className="hover:text-blue-600 transition-colors">
                ヘルプ
              </a>
              <a href="/privacy" className="hover:text-blue-600 transition-colors">
                プライバシー
              </a>
              <a href="/terms" className="hover:text-blue-600 transition-colors">
                利用規約
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
