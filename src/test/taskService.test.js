import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkIsDayTime,
  buildHumanLikeFollowUpMessage,
  buildNewTaskAssignmentMessage,
  resolveStaffMember,
  sendTaskFollowUpSms,
  createStaffTaskInDb,
} from '../services/taskService'

vi.mock('../firebase-config', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'mock-task-id' }),
  updateDoc: vi.fn().mockResolvedValue({}),
  doc: vi.fn((_db, _col, id) => ({ id })),
  Timestamp: {
    now: () => ({ toDate: () => new Date('2026-10-29T10:00:00Z') }),
    fromDate: (d) => ({ toDate: () => d }),
  },
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  increment: (val) => ({ __increment: val }),
  arrayUnion: (item) => ({ __arrayUnion: item }),
  query: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
}))

const mockSendBackgroundSms = vi.fn().mockResolvedValue({})
vi.mock('../services/leadSmsService', () => ({
  sendBackgroundSms: (args) => mockSendBackgroundSms(args),
  normalizeIndianPhone: (p) => (p ? `91${String(p).replace(/\D/g, '').slice(-10)}` : ''),
}))

describe('taskService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkIsDayTime', () => {
    it('identifies 11:00 AM IST as valid daytime (9 AM - 8 PM)', () => {
      // 11:00 AM IST = 05:30 UTC
      const daytimeUtc = new Date('2026-10-29T05:30:00Z')
      const result = checkIsDayTime(daytimeUtc)
      expect(result.isDayTime).toBe(true)
      expect(result.currentHour).toBe(11)
      expect(result.reason).toContain('Daytime working hours')
    })

    it('identifies 10:30 PM IST (22:30) as outside daytime', () => {
      // 10:30 PM IST = 17:00 UTC
      const nightUtc = new Date('2026-10-29T17:00:00Z')
      const result = checkIsDayTime(nightUtc)
      expect(result.isDayTime).toBe(false)
      expect(result.currentHour).toBe(22)
      expect(result.reason).toContain('Outside daytime working hours')
    })

    it('identifies 7:00 AM IST as outside daytime', () => {
      // 7:00 AM IST = 01:30 UTC
      const earlyMorningUtc = new Date('2026-10-29T01:30:00Z')
      const result = checkIsDayTime(earlyMorningUtc)
      expect(result.isDayTime).toBe(false)
      expect(result.currentHour).toBe(7)
    })
  })

  describe('buildHumanLikeFollowUpMessage', () => {
    it('builds a polite, gentle 1st follow-up inquiry', () => {
      const msg = buildHumanLikeFollowUpMessage({
        staffName: 'Nilesh',
        taskText: 'Collect 15 empty jars from Krishna Hotel',
        followUpCount: 0,
        dueDateStr: 'Today 4 PM',
      })
      expect(msg).toContain('Jay Shree Krishna Nileshbhai')
      expect(msg).toContain('Collect 15 empty jars from Krishna Hotel')
      expect(msg).toContain('When will it be completed?')
      expect(msg).toContain('Jigneshbhai')
    })

    it('builds a friendly 2nd follow-up reminder', () => {
      const msg = buildHumanLikeFollowUpMessage({
        staffName: 'Hiteshbhai',
        taskText: 'Deliver 20 boxes to Radhe Provision',
        followUpCount: 1,
      })
      expect(msg).toContain('Jay Shree Krishna Hiteshbhai')
      expect(msg).toContain('gentle reminder')
      expect(msg).toContain('Has this been completed?')
    })

    it('builds an urgent 3rd+ repeated follow-up reminder', () => {
      const msg = buildHumanLikeFollowUpMessage({
        staffName: 'Nilesh',
        taskText: 'Collect payment of Rs 3500 from Patel Store',
        followUpCount: 2,
      })
      expect(msg).toContain('pending follow-up on urgent task')
      expect(msg).toContain('as soon as possible')
    })
  })

  describe('buildNewTaskAssignmentMessage', () => {
    it('builds a new task assignment message for staff', () => {
      const msg = buildNewTaskAssignmentMessage({
        staffName: 'Nilesh',
        taskText: 'Check tempo tyre pressure & fuel',
        dueDateStr: 'Today',
        isFollowUp: false,
      })
      expect(msg).toContain('Jay Shree Krishna Nileshbhai')
      expect(msg).toContain('new task assigned')
      expect(msg).toContain('Check tempo tyre pressure & fuel')
    })

    it('builds a follow-up task assignment message when isFollowUp is true', () => {
      const msg = buildNewTaskAssignmentMessage({
        staffName: 'Hitesh',
        taskText: 'Re-visit Royal Hotel for remaining 5 petli',
        dueDateStr: 'Tomorrow',
        isFollowUp: true,
      })
      expect(msg).toContain('Jay Shree Krishna Hiteshbhai')
      expect(msg).toContain('follow-up task is assigned')
    })
  })

  describe('resolveStaffMember', () => {
    it('matches Nilesh and Hitesh by name or id', () => {
      const s1 = resolveStaffMember('nilesh')
      expect(s1.name).toBe('Nilesh')
      expect(s1.mobile).toBe('7990943652')

      const s2 = resolveStaffMember('hiteshbhai')
      expect(s2.name).toBe('Hiteshbhai')
      expect(s2.mobile).toBe('7778077617')
    })
  })

  describe('sendTaskFollowUpSms', () => {
    it('dispatches SMS and updates follow-up count during daytime', async () => {
      // Mock daytime by testing with forceOutsideDaytime = true or when daytime is true
      const res = await sendTaskFollowUpSms({
        taskId: 'task-123',
        staffName: 'Nilesh',
        staffPhone: '7990943652',
        taskText: 'Collect empty jars from Krishna Hotel',
        followUpCount: 0,
        forceOutsideDaytime: true,
      })

      expect(res.success).toBe(true)
      expect(res.followUpCount).toBe(1)
      expect(mockSendBackgroundSms).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '917990943652',
          message: expect.stringContaining('Jay Shree Krishna Nileshbhai'),
        })
      )
    })
  })

  describe('createStaffTaskInDb', () => {
    it('creates a task document in Firestore with resolved staff details', async () => {
      const task = await createStaffTaskInDb({
        text: 'Deliver 10 boxes to Ramesh Store',
        assignedTo: 'nilesh',
        isFollowUp: true,
      })

      expect(task.id).toBe('mock-task-id')
      expect(task.text).toBe('Deliver 10 boxes to Ramesh Store')
      expect(task.assignedStaffName).toBe('Nilesh')
      expect(task.staffPhone).toBe('7990943652')
      expect(task.isFollowUp).toBe(true)
    })
  })
})
