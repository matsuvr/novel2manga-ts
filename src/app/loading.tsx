export default function Loading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-600">
        <div className="size-3 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.2s]" />
        <div className="size-3 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.1s]" />
        <div className="size-3 rounded-full bg-blue-500 animate-bounce" />
        <span className="ml-2">読み込み中...</span>
      </div>
    </div>
  )
}
