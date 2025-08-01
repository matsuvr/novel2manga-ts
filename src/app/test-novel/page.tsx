import NovelUploader from '@/components/NovelUploader'

export default function TestNovelPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-12">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">小説アップロードテスト</h1>
        <NovelUploader />
      </div>
    </div>
  )
}
