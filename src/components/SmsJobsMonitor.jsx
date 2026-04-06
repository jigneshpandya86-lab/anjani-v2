import { useEffect, useMemo, useState } from 'react'
import { Timestamp, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase-config'
import toast from 'react-hot-toast'

const STATUS_FILTERS = ['all', 'pending', 'processing', 'sent', 'failed', 'cancelled']
const DELIVERY_FILTERS = ['all-delivery', 'delivery-pending', 'delivery-delivered', 'delivery-failed']

const getDateLabel = (value) => {
  if (!value) return '-'
  if (value?.toDate) return value.toDate().toLocaleString('en-IN')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString('en-IN')
}

const badgeClassByStatus = (status) => {
  if (status === 'sent') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (status === 'failed') return 'bg-red-100 text-red-700 border-red-200'
  if (status === 'processing') return 'bg-blue-100 text-blue-700 border-blue-200'
  if (status === 'cancelled') return 'bg-slate-100 text-slate-700 border-slate-200'
  return 'bg-amber-100 text-amber-700 border-amber-200'
}

const badgeClassByErrorCategory = (category) => {
  if (category === 'terminal') return 'bg-red-100 text-red-700'
  if (category === 'retryable') return 'bg-yellow-100 text-yellow-700'
  if (category === 'rate_limit') return 'bg-orange-100 text-orange-700'
  return 'bg-gray-100 text-gray-700'
}

const badgeClassByDeliveryStatus = (status) => {
  if (status === 'delivered') return 'bg-green-100 text-green-700'
  if (status === 'failed' || status === 'undelivered') return 'bg-red-100 text-red-700'
  return 'bg-blue-100 text-blue-700'
}

export default function SmsJobsMonitor() {
  const [jobs, setJobs] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [deliveryFilter, setDeliveryFilter] = useState('all-delivery')

  useEffect(() => {
    const q = query(collection(db, 'sms_jobs'), orderBy('createdAt', 'desc'), limit(50))
    const unsub = onSnapshot(q, (snapshot) => {
      setJobs(snapshot.docs.map((row) => ({ id: row.id, ...row.data() })))
    })
    return unsub
  }, [])

  const filteredJobs = useMemo(() => {
    let filtered = jobs

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((job) => job.status === statusFilter)
    }

    // Apply delivery filter
    if (deliveryFilter === 'delivery-pending') {
      filtered = filtered.filter((job) => job.deliveryStatus === 'pending')
    } else if (deliveryFilter === 'delivery-delivered') {
      filtered = filtered.filter((job) => job.deliveryStatus === 'delivered')
    } else if (deliveryFilter === 'delivery-failed') {
      filtered = filtered.filter(
        (job) => job.deliveryStatus === 'failed' || job.deliveryStatus === 'undelivered'
      )
    }

    return filtered
  }, [jobs, statusFilter, deliveryFilter])

  const retryNow = async (job) => {
    try {
      await updateDoc(doc(db, 'sms_jobs', job.id), {
        status: 'pending',
        scheduledFor: Timestamp.fromDate(new Date()),
        lastError: '',
        updatedAt: serverTimestamp(),
      })
      toast.success('Job moved to pending queue')
    } catch (error) {
      console.error(error)
      toast.error('Failed to retry job')
    }
  }

  const cancelPending = async (job) => {
    try {
      await updateDoc(doc(db, 'sms_jobs', job.id), {
        status: 'cancelled',
        cancelReason: 'manual_cancel',
        updatedAt: serverTimestamp(),
      })
      toast.success('Pending job cancelled')
    } catch (error) {
      console.error(error)
      toast.error('Failed to cancel job')
    }
  }

  return (
    <div className="space-y-3 pb-24">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <h2 className="text-lg font-black text-[#131921]">SMS Jobs Monitor</h2>
        <p className="text-xs text-gray-500 mt-1 font-semibold">
          Latest SMS queue rows from Firestore (`sms_jobs`) for delivery troubleshooting.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <span className="text-[10px] font-black text-gray-600 self-center whitespace-nowrap">Status:</span>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${statusFilter === filter ? 'bg-[#131921] text-[#ff9900]' : 'bg-white text-gray-500 border border-gray-200'}`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <span className="text-[10px] font-black text-gray-600 self-center whitespace-nowrap">Delivery:</span>
          {DELIVERY_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setDeliveryFilter(filter)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${deliveryFilter === filter ? 'bg-[#131921] text-[#ff9900]' : 'bg-white text-gray-500 border border-gray-200'}`}
            >
              {filter.replace('delivery-', '')}
            </button>
          ))}
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-100 text-gray-400 font-bold italic">
          No SMS jobs found for selected filter.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredJobs.map((job) => (
            <div key={job.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-900 truncate">{job.taskType || 'unknown-task'}</p>
                  <p className="text-[11px] font-semibold text-gray-500">To: {job.recipientMobile || '-'}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-[10px] font-black border uppercase ${badgeClassByStatus(job.status)}`}>
                  {job.status || 'pending'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-semibold text-gray-600">
                <p>Scheduled: {getDateLabel(job.scheduledFor)}</p>
                <p>Attempts: {Number(job.attemptCount || 0)}</p>
                <p className="sm:col-span-2">Entity: {job.entityId || '-'}</p>

                {/* Delivery Status */}
                {job.deliveryStatus && (
                  <div className="sm:col-span-2">
                    <p className="text-gray-500 mb-1">Delivery Status:</p>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${badgeClassByDeliveryStatus(job.deliveryStatus)}`}>
                      {job.deliveryStatus}
                    </span>
                  </div>
                )}

                {/* Error Code and Category */}
                {job.errorCode && (
                  <div className="sm:col-span-2">
                    <p className="text-gray-500 mb-1">Error Details:</p>
                    <div className="flex gap-2 flex-wrap">
                      <span className={`px-2 py-1 rounded text-[10px] font-black border ${badgeClassByErrorCategory(job.errorCategory)}`}>
                        {job.errorCode}
                      </span>
                      <span className="px-2 py-1 rounded text-[10px] font-black bg-gray-100 text-gray-700 border">
                        {job.errorCategory || 'unknown'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Last Error Message */}
                {job.lastError ? <p className="sm:col-span-2 text-red-600">Error: {job.lastError}</p> : null}
              </div>

              <div className="mt-3 flex gap-2 flex-wrap">
                {(job.status === 'failed' || job.status === 'cancelled') && (
                  <button
                    type="button"
                    onClick={() => retryNow(job)}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black uppercase tracking-wide"
                  >
                    Retry Now
                  </button>
                )}
                {(job.status === 'pending' || job.status === 'processing') && (
                  <button
                    type="button"
                    onClick={() => cancelPending(job)}
                    className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[10px] font-black uppercase tracking-wide"
                  >
                    Cancel Pending
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
