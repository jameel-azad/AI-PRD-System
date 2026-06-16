import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { prd as prdApi } from '../services/api'
import useAuthStore from '../store/authStore'

const STATUS_STYLE = {
  approved: 'bg-green-100 text-green-800',
  pending:  'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-800',
}

export default function ApprovalsView({ projectId }) {
  const qc   = useQueryClient()
  const user = useAuthStore(s => s.user)

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals', projectId],
    queryFn:  () => prdApi.approvals(projectId).then(r => r.data),
  })

  const approveMutation = useMutation({
    mutationFn: () => prdApi.approve(projectId, { comment: 'Approved via portal' }),
    onSuccess:  () => qc.invalidateQueries(['approvals', projectId]),
  })

  const canApprove = user?.role !== 'ba_pm'

  return (
    <div className="space-y-6">
      {/* Approve CTA */}
      {canApprove && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">Approve this PRD</p>
            <p className="text-sm text-gray-500 mt-0.5">Your approval will be recorded with a timestamp</p>
          </div>
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="bg-green-600 text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {approveMutation.isPending ? 'Submitting…' : 'Approve PRD'}
          </button>
        </div>
      )}

      {/* Approval history */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading approvals…</div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="font-medium">No approvals yet</p>
          <p className="text-sm mt-1">Approvals will appear here once submitted</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Approver</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Comment</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {approvals.map(a => (
                <tr key={a.id}>
                  <td className="px-5 py-3 text-gray-900">User #{a.approver_id}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[a.status] || ''}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{a.comment || '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
