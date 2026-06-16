import { useQuery } from '@tanstack/react-query'
import { prd as prdApi } from '../services/api'

const PRIORITY_COLOR = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-gray-100 text-gray-600 border-gray-200',
}

export default function ClarificationsView({ projectId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['prd', projectId],
    queryFn:  () => prdApi.get(projectId).then(r => r.data),
    retry: false,
  })

  if (isLoading) return <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
  if (error || !data) return <div className="text-center py-8 text-gray-400 text-sm">No PRD available yet</div>

  const gaps = data.gaps || []
  const bySection = gaps.reduce((acc, g) => {
    const key = g.section || 'general'
    if (!acc[key]) acc[key] = []
    acc[key].push(g)
    return acc
  }, {})

  if (gaps.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-green-700 font-medium">No open clarification questions</p>
        <p className="text-gray-400 text-sm mt-1">All sections appear complete based on available inputs</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        {gaps.length} clarification {gaps.length === 1 ? 'question' : 'questions'} identified by the AI
      </p>
      {Object.entries(bySection).map(([section, questions]) => (
        <div key={section} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-100 px-5 py-3">
            <h3 className="font-semibold text-gray-700 text-sm capitalize">{section.replace(/_/g, ' ')}</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {questions.map((q, i) => (
              <li key={i} className="px-5 py-4 flex gap-4 items-start">
                <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium flex-shrink-0 mt-0.5 ${PRIORITY_COLOR[q.priority] || PRIORITY_COLOR.low}`}>
                  {q.priority}
                </span>
                <p className="text-sm text-gray-700">{q.question}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
