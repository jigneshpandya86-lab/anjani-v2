import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  increment,
} from 'firebase/firestore'
import { db } from '../firebase-config'

export const DEFAULT_STAFF = [
  {
    id: 'nilesh',
    name: 'Nilesh',
    role: 'Delivery Staff & Driver',
    mobile: '9925997750',
    baseSalary: 15000,
    salaryType: 'monthly',
    active: true,
    color: '#2563eb',
  },
  {
    id: 'hiteshbhai',
    name: 'Hiteshbhai',
    role: 'Delivery Staff & Driver',
    mobile: '9825012345',
    baseSalary: 15000,
    salaryType: 'monthly',
    active: true,
    color: '#7c3aed',
  },
]

export const ACCOUNTS_SUMMARY_DOC = doc(db, 'accounts_summary', 'main')

/**
 * Computes net salary breakdown
 */
export function calculateSalaryBreakdown({
  baseSalary = 0,
  incentives = 0,
  overtime = 0,
  advancesDeducted = 0,
  otherDeductions = 0,
}) {
  const grossEarnings = (Number(baseSalary) || 0) + (Number(incentives) || 0) + (Number(overtime) || 0)
  const totalDeductions = (Number(advancesDeducted) || 0) + (Number(otherDeductions) || 0)
  const netPayable = Math.max(0, grossEarnings - totalDeductions)
  return {
    grossEarnings,
    totalDeductions,
    netPayable,
  }
}

/**
 * Formats a YYYY-MM string to readable month label (e.g. '2026-09' -> 'September 2026')
 */
export function formatSalaryMonth(monthStr) {
  if (!monthStr) return ''
  const parts = monthStr.split('-')
  if (parts.length < 2) return monthStr
  const year = parseInt(parts[0], 10)
  const monthIdx = parseInt(parts[1], 10) - 1
  const date = new Date(year, monthIdx, 1)
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

/**
 * Fetch all staff profiles from Firestore, seeding defaults if needed
 */
export async function getStaffList() {
  try {
    const snap = await getDocs(collection(db, 'staff'))
    if (!snap.empty) {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      // Ensure Nilesh always exists
      if (!list.find((s) => s.id === 'nilesh')) {
        list.unshift(DEFAULT_STAFF[0])
      }
      return list
    }
  } catch (err) {
    console.warn('[StaffSalary] Error fetching staff, using defaults:', err)
  }

  // Seed default staff
  try {
    for (const member of DEFAULT_STAFF) {
      await setDoc(doc(db, 'staff', member.id), member, { merge: true })
    }
  } catch (seedErr) {
    console.error('[StaffSalary] Failed to seed staff:', seedErr)
  }
  return DEFAULT_STAFF
}

/**
 * Update staff member base salary and settings
 */
export async function updateStaffProfile(employeeId, data) {
  const ref = doc(db, 'staff', employeeId)
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true })
}

/**
 * Record an advance given to an employee
 * Source account can be:
 * - 'counter': Counter Cash Drawer
 * - 'bank': Bank / Online UPI
 * - 'custody_deduction': Deducted from employee's collected route cash
 */
export async function recordStaffAdvance({
  employeeId,
  employeeName = 'Nilesh',
  amount,
  sourceAccountId = 'counter',
  date = new Date(),
  note = '',
  salaryMonth = '',
}) {
  const numAmount = Number(amount)
  if (!employeeId) throw new Error('Employee ID is required')
  if (!numAmount || numAmount <= 0) throw new Error('Valid advance amount is required')

  const effectiveDate = date instanceof Date ? date : new Date(date)
  const effectiveMonth =
    salaryMonth ||
    `${effectiveDate.getFullYear()}-${String(effectiveDate.getMonth() + 1).padStart(2, '0')}`

  const advancePayload = {
    employeeId,
    employeeName,
    type: 'advance',
    amount: numAmount,
    sourceAccountId,
    date: Timestamp.fromDate(effectiveDate),
    note: note ? note.trim() : '',
    salaryMonth: effectiveMonth,
    status: 'active', // 'active' until deducted in a salary settlement
    settledInSalaryId: null,
    createdAt: serverTimestamp(),
  }

  // 1. Add transaction record
  const docRef = await addDoc(collection(db, 'staff_transactions'), advancePayload)

  // 2. Update employee's advanceBalance
  const staffRef = doc(db, 'staff', employeeId)
  await setDoc(
    staffRef,
    {
      advanceBalance: increment(numAmount),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  // 3. Double-entry balance debit from the source account
  const accountToDebit = sourceAccountId === 'custody_deduction' ? employeeId : sourceAccountId
  if (accountToDebit) {
    await setDoc(
      ACCOUNTS_SUMMARY_DOC,
      {
        balances: {
          [accountToDebit]: increment(-numAmount),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  return { id: docRef.id, ...advancePayload }
}

/**
 * Delete or void an advance transaction, restoring account balances
 */
export async function deleteStaffTransaction(transactionId) {
  const ref = doc(db, 'staff_transactions', transactionId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data()
  const { employeeId, amount, type, sourceAccountId, status } = data
  const numAmount = Number(amount) || 0

  if (type === 'advance' && status === 'active' && numAmount > 0) {
    // 1. Reduce employee's advance balance
    const staffRef = doc(db, 'staff', employeeId)
    await setDoc(
      staffRef,
      {
        advanceBalance: increment(-numAmount),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )

    // 2. Refund back to source account
    const accountToRefund = sourceAccountId === 'custody_deduction' ? employeeId : sourceAccountId
    if (accountToRefund) {
      await setDoc(
        ACCOUNTS_SUMMARY_DOC,
        {
          balances: {
            [accountToRefund]: increment(numAmount),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }
  }

  await deleteDoc(ref)
}

/**
 * Settle and Pay Monthly Salary
 * Deducts active advances, posts company expense, and disburses net pay
 */
export async function settleStaffSalary({
  employeeId,
  employeeName = 'Nilesh',
  month, // e.g. '2026-09'
  baseSalary,
  incentives = 0,
  overtime = 0,
  advancesDeducted = 0,
  otherDeductions = 0,
  payoutAccountId = 'counter', // 'counter' or 'bank'
  payoutDate = new Date(),
  note = '',
  activeAdvanceIds = [],
}) {
  if (!employeeId) throw new Error('Employee ID is required')
  if (!month) throw new Error('Salary month is required')

  const { grossEarnings, totalDeductions, netPayable } = calculateSalaryBreakdown({
    baseSalary,
    incentives,
    overtime,
    advancesDeducted,
    otherDeductions,
  })

  const effectivePayoutDate = payoutDate instanceof Date ? payoutDate : new Date(payoutDate)

  // 1. Record Company Expense under 'Salary' category for accurate P&L
  const expensePayload = {
    amount: grossEarnings,
    category: 'Salary',
    accountId: payoutAccountId,
    narration: `Salary Payout - ${employeeName} (${formatSalaryMonth(month)})`,
    note: `Base: ₹${baseSalary} + Extra: ₹${incentives + overtime} - Advance: ₹${advancesDeducted}${
      note ? ` (${note.trim()})` : ''
    }`,
    date: Timestamp.fromDate(effectivePayoutDate),
    createdAt: serverTimestamp(),
  }
  const expenseRef = await addDoc(collection(db, 'expenses'), expensePayload)

  // 2. Deduct Net Payable from payout account (Counter or Bank)
  if (netPayable > 0 && payoutAccountId) {
    await setDoc(
      ACCOUNTS_SUMMARY_DOC,
      {
        balances: {
          [payoutAccountId]: increment(-netPayable),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  // 3. Create Salary Settlement Record
  const settlementPayload = {
    employeeId,
    employeeName,
    month,
    baseSalary: Number(baseSalary) || 0,
    incentives: Number(incentives) || 0,
    overtime: Number(overtime) || 0,
    advancesDeducted: Number(advancesDeducted) || 0,
    otherDeductions: Number(otherDeductions) || 0,
    grossEarnings,
    totalDeductions,
    netPaid: netPayable,
    payoutAccountId,
    payoutDate: Timestamp.fromDate(effectivePayoutDate),
    note: note ? note.trim() : '',
    expenseId: expenseRef.id,
    status: 'paid',
    settledAt: serverTimestamp(),
  }
  const settlementRef = await addDoc(collection(db, 'salary_settlements'), settlementPayload)

  // 4. Mark specific advance transactions as settled
  if (Array.isArray(activeAdvanceIds) && activeAdvanceIds.length > 0) {
    await Promise.allSettled(
      activeAdvanceIds.map((advId) =>
        updateDoc(doc(db, 'staff_transactions', advId), {
          status: 'settled',
          settledInSalaryId: settlementRef.id,
          settledAt: serverTimestamp(),
        })
      )
    )
  }

  // 5. Update employee's advance balance (deduct advances)
  const staffRef = doc(db, 'staff', employeeId)
  await setDoc(
    staffRef,
    {
      advanceBalance: increment(-Math.abs(Number(advancesDeducted) || 0)),
      lastSettlementMonth: month,
      lastSettlementId: settlementRef.id,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  return {
    id: settlementRef.id,
    ...settlementPayload,
  }
}
