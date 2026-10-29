import React, { useState, useEffect } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  Timestamp,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore'
import {
  Plus,
  Edit2,
  Clock,
  CheckCircle,
  Archive,
  Send,
  MessageCircle,
  Sparkles,
  User,
  Sun,
  Moon,
  Bot,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { db } from './firebase-config'
import { DEFAULT_STAFF } from './constants/staff'
import {
  checkIsDayTime,
  sendTaskFollowUpSms,
  resolveStaffMember,
  createStaffTaskInDb,
  buildHumanLikeFollowUpMessage,
  buildTaskWhatsAppUrl,
  recordTaskFollowUpHistory,
} from './services/taskService'
import './TasksPage.css'

export interface Job {
  id: string
  text: string
  stage: 'new' | 'due' | 'complete' | 'archived'
  dueDate: any
  leadId?: string
  assignedTo?: string
  assignedStaffName?: string
  staffPhone?: string
  isFollowUp?: boolean
  parentTaskId?: string
  priority?: string
  followUpCount?: number
  lastFollowUpAt?: any
  followUpHistory?: any[]
  createdAt?: any
  updatedAt?: any
}

interface TasksPageProps {
  onOpenAiAssistant?: () => void
}

const TasksPage: React.FC<TasksPageProps> = ({ onOpenAiAssistant }) => {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    text: '',
    dueDate: '',
    assignedTo: 'nilesh',
    isFollowUp: false,
  })
  const [showNewTaskForm, setShowNewTaskForm] = useState(false)
  const [newTaskForm, setNewTaskForm] = useState({
    text: '',
    dueDate: '',
    assignedTo: 'nilesh',
    isFollowUp: false,
    sendSmsNotification: false,
  })
  const [sendingSmsTaskId, setSendingSmsTaskId] = useState<string | null>(null)

  // Real-time listener for tasks
  useEffect(() => {
    const q = query(collection(db, 'Jobs'), orderBy('dueDate', 'asc'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedJobs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Job[]
        // Filter out archived tasks
        const activeJobs = fetchedJobs.filter((job) => job.stage !== 'archived')
        setJobs(activeJobs)
        setLoading(false)
      },
      (err) => {
        console.error('Jobs listener error:', err)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  const handleStageChange = async (id: string, newStage: Job['stage']) => {
    try {
      const jobRef = doc(db, 'Jobs', id)
      await updateDoc(jobRef, { stage: newStage, updatedAt: serverTimestamp() })
      toast.success(
        newStage === 'complete' ? 'Task marked completed!' : `Stage updated to ${newStage}`
      )
    } catch (error: any) {
      console.error('Error updating stage:', error)
      toast.error('Error updating stage: ' + error.message)
    }
  }

  const startEditing = (job: Job) => {
    setEditingId(job.id)
    let dateStr = ''
    if (job.dueDate?.toDate) {
      dateStr = job.dueDate.toDate().toISOString().split('T')[0]
    } else if (job.dueDate) {
      try {
        dateStr = new Date(job.dueDate).toISOString().split('T')[0]
      } catch {
        dateStr = ''
      }
    }
    setEditForm({
      text: job.text || '',
      dueDate: dateStr,
      assignedTo: job.assignedTo || 'nilesh',
      isFollowUp: Boolean(job.isFollowUp),
    })
  }

  const saveEdit = async (id: string) => {
    try {
      const jobRef = doc(db, 'Jobs', id)
      const newDate = editForm.dueDate ? new Date(editForm.dueDate) : new Date()
      const staff = resolveStaffMember(editForm.assignedTo, DEFAULT_STAFF)

      await updateDoc(jobRef, {
        text: editForm.text,
        dueDate: Timestamp.fromDate(newDate),
        assignedTo: staff?.id || editForm.assignedTo,
        assignedStaffName: staff?.name || 'Nilesh',
        staffPhone: staff?.mobile || '7990943652',
        isFollowUp: Boolean(editForm.isFollowUp),
        updatedAt: serverTimestamp(),
      })
      setEditingId(null)
      toast.success('Task updated successfully!')
    } catch (error: any) {
      console.error('Error saving task:', error)
      toast.error('Failed to save task: ' + error.message)
    }
  }

  const createNewTask = async () => {
    if (!newTaskForm.text.trim()) {
      toast.error('Please enter a task description')
      return
    }

    try {
      const staff = resolveStaffMember(newTaskForm.assignedTo, DEFAULT_STAFF)
      const daytime = checkIsDayTime()
      let forceOutsideDaytime = false

      if (newTaskForm.sendSmsNotification && !daytime.isDayTime) {
        const confirmSend = window.confirm(
          `⚠️ Outside Daytime (${daytime.istTimeStr})\nDaytime working hours are 9:00 AM – 8:00 PM IST to avoid disturbing staff at night.\n\nDo you want to send assignment SMS anyway?`
        )
        if (!confirmSend) {
          toast('SMS notification held. Task created for daytime.', { icon: '🌙' })
        } else {
          forceOutsideDaytime = true
        }
      }

      await createStaffTaskInDb({
        text: newTaskForm.text,
        assignedTo: staff?.id || newTaskForm.assignedTo,
        assignedStaffName: staff?.name || 'Nilesh',
        staffPhone: staff?.mobile || '7990943652',
        dueDate: newTaskForm.dueDate || new Date(),
        isFollowUp: newTaskForm.isFollowUp,
        sendNotificationSms: newTaskForm.sendSmsNotification,
        forceOutsideDaytime,
      })

      toast.success(`Task assigned to ${staff?.name || 'Staff'}!`, { icon: '📋' })
      setNewTaskForm({
        text: '',
        dueDate: '',
        assignedTo: 'nilesh',
        isFollowUp: false,
        sendSmsNotification: false,
      })
      setShowNewTaskForm(false)
    } catch (error: any) {
      console.error('Error creating task:', error)
      toast.error('Failed to create task: ' + error.message)
    }
  }

  const handleSendFollowUpSms = async (job: Job) => {
    const staffName = job.assignedStaffName || (job.assignedTo === 'hiteshbhai' ? 'Hiteshbhai' : 'Nilesh')
    const staffPhone = job.staffPhone || (job.assignedTo === 'hiteshbhai' ? '7778077617' : '7990943652')
    const followCount = Number(job.followUpCount || 0)

    const daytime = checkIsDayTime()
    let force = false
    if (!daytime.isDayTime) {
      const confirmSend = window.confirm(
        `⚠️ Outside Daytime Hours (${daytime.istTimeStr})\n\nDaytime working hours are 9:00 AM – 8:00 PM IST to avoid disturbing staff at night.\n\nDo you want to send follow-up SMS to ${staffName} anyway?`
      )
      if (!confirmSend) return
      force = true
    }

    setSendingSmsTaskId(job.id)
    try {
      const res = await sendTaskFollowUpSms({
        taskId: job.id,
        staffName,
        staffPhone,
        taskText: job.text,
        followUpCount: followCount,
        forceOutsideDaytime: force,
      })
      toast.success(`📲 Follow-up SMS #${res.followUpCount} sent to ${staffName}!`, { icon: '✅' })
    } catch (err: any) {
      console.error('Follow-up SMS error:', err)
      toast.error('Failed to send SMS: ' + err.message)
    } finally {
      setSendingSmsTaskId(null)
    }
  }

  const handleSendFollowUpWhatsApp = async (job: Job) => {
    const staffName = job.assignedStaffName || (job.assignedTo === 'hiteshbhai' ? 'Hiteshbhai' : 'Nilesh')
    const staffPhone = job.staffPhone || (job.assignedTo === 'hiteshbhai' ? '7778077617' : '7990943652')
    const followCount = Number(job.followUpCount || 0)

    try {
      const message = buildHumanLikeFollowUpMessage({
        staffName,
        taskText: job.text,
        followUpCount: followCount,
      })
      const waUrl = buildTaskWhatsAppUrl({
        staffPhone,
        message,
      })
      if (waUrl) {
        window.open(waUrl, '_blank')
      }
      await recordTaskFollowUpHistory({
        taskId: job.id,
        staffName,
        message,
        channel: 'whatsapp',
        followUpCount: followCount,
      })
      toast.success(`💬 WhatsApp opened for ${staffName}!`, { icon: '✅' })
    } catch (err: any) {
      console.error('Follow-up WhatsApp error:', err)
      toast.error('Failed to open WhatsApp: ' + err.message)
    }
  }

  const archiveTask = async (id: string) => {
    try {
      const jobRef = doc(db, 'Jobs', id)
      await updateDoc(jobRef, {
        stage: 'archived',
        updatedAt: serverTimestamp(),
      })
      toast.success('Task archived')
    } catch (error: any) {
      console.error('Error archiving task:', error)
      toast.error('Failed to archive: ' + error.message)
    }
  }

  const isOverdue = (dueDate: any): boolean => {
    if (!dueDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const taskDate = dueDate.toDate ? dueDate.toDate() : new Date(dueDate)
    taskDate.setHours(0, 0, 0, 0)
    return taskDate < today
  }

  if (loading) return <div className="p-6 text-center text-gray-500 font-bold">Loading tasks...</div>

  const renderTaskColumn = (stage: Job['stage'], title: string) => {
    const columnJobs = jobs.filter((job) => job.stage === stage)

    return (
      <div className="task-column">
        <h3>
          {title} ({columnJobs.length})
        </h3>
        {columnJobs.map((job) => {
          const overdue = isOverdue(job.dueDate)
          const staffName = job.assignedStaffName || (job.assignedTo === 'hiteshbhai' ? 'Hiteshbhai' : 'Nilesh')
          const staffPhone = job.staffPhone || (job.assignedTo === 'hiteshbhai' ? '7778077617' : '7990943652')
          const followCount = Number(job.followUpCount || 0)

          return (
            <div key={job.id} className={`task-card ${overdue ? 'overdue' : ''}`}>
              {editingId === job.id ? (
                <div className="task-edit-form">
                  <textarea
                    value={editForm.text}
                    onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                    placeholder="Task details"
                  />
                  <div className="flex gap-2">
                    <select
                      value={editForm.assignedTo}
                      onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
                      className="p-1 border rounded text-xs flex-1"
                    >
                      {DEFAULT_STAFF.map((s) => (
                        <option key={s.id} value={s.id}>
                          👤 {s.name} ({s.mobile})
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={editForm.dueDate}
                      onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                      className="p-1 border rounded text-xs"
                    />
                  </div>
                  <label className="text-xs flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.isFollowUp}
                      onChange={(e) => setEditForm({ ...editForm, isFollowUp: e.target.checked })}
                    />
                    <span>Follow-up task</span>
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(job.id)}>Save</button>
                    <button onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Staff & Follow-up Badges */}
                  <div className="flex items-center justify-between gap-1 mb-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          job.assignedTo === 'hiteshbhai'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        👤 {staffName}
                      </span>
                      {job.isFollowUp && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          🔄 Follow-up
                        </span>
                      )}
                      {followCount > 0 && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                          🔔 Follow-ups: {followCount}
                        </span>
                      )}
                    </div>
                    {overdue && (
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-200 text-amber-900">
                        Overdue
                      </span>
                    )}
                  </div>

                  <p className="task-text">
                    <strong>{job.text}</strong>
                  </p>

                  <div className="task-footer">
                    <p className="task-date">
                      {job.dueDate?.toDate
                        ? job.dueDate.toDate().toLocaleDateString('en-IN')
                        : job.dueDate
                        ? new Date(job.dueDate).toLocaleDateString('en-IN')
                        : 'No date'}
                    </p>
                    <div className="task-actions">
                      {/* One-click Humanized Daytime SMS Follow-up */}
                      {stage !== 'complete' && (
                        <>
                          <button
                            onClick={() => handleSendFollowUpSms(job)}
                            disabled={sendingSmsTaskId === job.id}
                            title={`Send Follow-up SMS to ${staffName} (📞 ${staffPhone})`}
                            className="icon-btn text-teal-700 hover:bg-teal-600 hover:text-white"
                            style={{ borderColor: '#2dd4bf' }}
                          >
                            <Send size={15} />
                          </button>
                          <button
                            onClick={() => handleSendFollowUpWhatsApp(job)}
                            title={`WhatsApp Follow-up to ${staffName} (📞 ${staffPhone})`}
                            className="icon-btn text-emerald-600 hover:bg-emerald-600 hover:text-white"
                            style={{ borderColor: '#10b981' }}
                          >
                            <MessageCircle size={15} />
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => startEditing(job)}
                        title="Edit task"
                        className="icon-btn"
                      >
                        <Edit2 size={16} />
                      </button>
                      {stage !== 'due' && (
                        <button
                          onClick={() => handleStageChange(job.id, 'due')}
                          title="Set due / in-progress"
                          className="icon-btn"
                        >
                          <Clock size={16} />
                        </button>
                      )}
                      {stage !== 'complete' && (
                        <button
                          onClick={() => handleStageChange(job.id, 'complete')}
                          title="Mark complete"
                          className="icon-btn"
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => archiveTask(job.id)}
                        title="Archive task"
                        className="icon-btn archive-btn"
                      >
                        <Archive size={16} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="tasks-page">
      <div className="tasks-header flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2>Staff Tasks Assignment</h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            AI-powered task tracking, daytime SMS follow-up, and assignments for delivery staff
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAiAssistant && (
            <button
              onClick={onOpenAiAssistant}
              className="bg-[#131921] hover:bg-black text-[#ff9900] px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Open AI Chatbot for Staff Tasks"
            >
              <Sparkles className="w-4 h-4 text-[#ff9900]" />
              <span>AI Chatbot</span>
            </button>
          )}

          <button
            onClick={() => setShowNewTaskForm(!showNewTaskForm)}
            className="new-task-btn"
            title="Create new task"
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      {showNewTaskForm && (
        <div className="new-task-form">
          <h3>Create New Staff Task</h3>
          <textarea
            placeholder="Task description (e.g. Collect 20 empty jars from Krishna Hotel)"
            value={newTaskForm.text}
            onChange={(e) => setNewTaskForm({ ...newTaskForm, text: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-2">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Assign To Staff Member:
              </label>
              <select
                value={newTaskForm.assignedTo}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, assignedTo: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold outline-none"
              >
                {DEFAULT_STAFF.map((s) => (
                  <option key={s.id} value={s.id}>
                    👤 {s.name} ({s.role} • 📞 {s.mobile})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Target Due Date:</label>
              <input
                type="date"
                value={newTaskForm.dueDate}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, dueDate: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 my-2 text-xs font-semibold">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={newTaskForm.isFollowUp}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, isFollowUp: e.target.checked })}
              />
              <span>Is Follow-up Task?</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={newTaskForm.sendSmsNotification}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, sendSmsNotification: e.target.checked })
                }
              />
              <span>Send SMS Notification to Staff (Daytime)</span>
            </label>
          </div>

          <div className="form-actions">
            <button onClick={createNewTask} className="save-btn">
              Create Task
            </button>
            <button
              onClick={() => {
                setShowNewTaskForm(false)
                setNewTaskForm({
                  text: '',
                  dueDate: '',
                  assignedTo: 'nilesh',
                  isFollowUp: false,
                  sendSmsNotification: false,
                })
              }}
              className="cancel-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="tasks-board">
        {renderTaskColumn('new', 'New Tasks')}
        {renderTaskColumn('due', 'Due / In Progress')}
        {renderTaskColumn('complete', 'Completed')}
      </div>
    </div>
  )
}

export default TasksPage
