'use client'

interface JobFiltersProps {
  currentFilters: {
    status: string
    limit: number
    offset: number
  }
  onFilterChange: (filters: Partial<{ status: string; limit: number }>) => void
  loading: boolean
}

export function JobFilters({ currentFilters, onFilterChange, loading }: JobFiltersProps) {
  const statusOptions = [
    { value: '', label: 'すべて' },
    { value: 'pending', label: '待機中' },
    { value: 'processing', label: '処理中' },
    { value: 'completed', label: '完了' },
    { value: 'failed', label: '失敗' },
    { value: 'paused', label: '一時停止' },
  ]

  const limitOptions = [
    { value: 6, label: '6件' },
    { value: 12, label: '12件' },
    { value: 24, label: '24件' },
    { value: 48, label: '48件' },
  ]

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="flex items-center space-x-2">
            <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
              ステータス:
            </label>
            <select
              id="status-filter"
              value={currentFilters.status}
              onChange={(e) => onFilterChange({ status: e.target.value })}
              disabled={loading}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label htmlFor="limit-filter" className="text-sm font-medium text-gray-700">
              表示件数:
            </label>
            <select
              id="limit-filter"
              value={currentFilters.limit}
              onChange={(e) => onFilterChange({ limit: Number(e.target.value) })}
              disabled={loading}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {limitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className={`-ml-0.5 mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            更新
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {statusOptions.slice(1).map((status) => (
            <button
              type="button"
              key={status.value}
              onClick={() => onFilterChange({ status: status.value })}
              className={`text-center p-2 rounded-md text-sm font-medium transition-colors ${
                currentFilters.status === status.value
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'text-gray-600 hover:bg-gray-50 border border-transparent'
              }`}
            >
              <div className="text-lg font-bold">-</div>
              <div>{status.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
