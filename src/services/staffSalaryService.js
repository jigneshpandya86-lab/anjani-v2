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
  activeAdvances = [],
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

  // 4. Mark specific advance transactions as settled / allocate partial carry-forward
  if (Array.isArray(activeAdvances) && activeAdvances.length > 0) {
    let remainingToDeduct = Number(advancesDeducted) || 0

    const getMillis = (obj) => {
      if (!obj) return 0
      if (typeof obj.toDate === 'function') return obj.toDate().getTime()
      if (obj.seconds) return obj.seconds * 1000
      if (obj instanceof Date) return obj.getTime()
      if (typeof obj === 'string' || typeof obj === 'number') return new Date(obj).getTime()
      return 0
    }

    // Sort advances chronologically: oldest first
    const sortedAdvances = [...activeAdvances].sort((a, b) => {
      const tA = getMillis(a.date) || getMillis(a.createdAt)
      const tB = getMillis(b.date) || getMillis(b.createdAt)
      return tA - tB
    })

    for (const adv of sortedAdvances) {
      if (remainingToDeduct <= 0) {
        // Any remaining advances stay active untouched
        break
      }
      const advAmt = Number(adv.amount) || 0
      if (advAmt <= remainingToDeduct) {
        // Full settlement of this advance
        await updateDoc(doc(db, 'staff_transactions', adv.id), {
          status: 'settled',
          settledInSalaryId: settlementRef.id,
          settledAmount: advAmt,
          settledAt: serverTimestamp(),
        })
        remainingToDeduct -= advAmt
      } else {
        // Partial settlement of this advance
        const portionDeducted = remainingToDeduct
        const remainder = advAmt - portionDeducted

        await updateDoc(doc(db, 'staff_transactions', adv.id), {
          status: 'settled',
          settledInSalaryId: settlementRef.id,
          settledAmount: portionDeducted,
          settledAt: serverTimestamp(),
          partialCarryForward: true,
          carryForwardAmount: remainder,
        })

        // Create an active carry-forward record for the remaining advance
        await addDoc(collection(db, 'staff_transactions'), {
          employeeId,
          employeeName,
          amount: remainder,
          sourceAccountId: adv.sourceAccountId || 'counter',
          date: Timestamp.fromDate(effectivePayoutDate),
          note: `Carry-forward balance from advance of ₹${advAmt}${adv.note ? ` (${adv.note})` : ''}`,
          status: 'active',
          isCarryForward: true,
          previousTransactionId: adv.id,
          settledInSalaryId: settlementRef.id,
          createdAt: serverTimestamp(),
        })

        remainingToDeduct = 0
        break
      }
    }
  } else if (Array.isArray(activeAdvanceIds) && activeAdvanceIds.length > 0) {
    // Fallback: If only IDs were passed, mark them as settled
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

/**
 * Reverts/deletes a salary settlement slip:
 * - Restores settled advances back to 'active'
 * - Deletes any carry-forward advance transactions created by the settlement
 * - Refunds employee's advanceBalance
 * - Removes salary expense from P&L
 * - Refunds net paid amount back to payout account (counter/bank)
 */
export async function deleteSalarySettlement(settlementId, employeeId) {
  if (!settlementId) throw new Error('Settlement ID is required')

  const settlementRef = doc(db, 'salary_settlements', settlementId)
  const settlementSnap = await getDoc(settlementRef)
  if (!settlementSnap.exists()) {
    throw new Error('Salary settlement record not found')
  }
  const settlementData = settlementSnap.data()

  // 1. Delete carry-forward transactions created by this settlement
  try {
    const cfQ = query(
      collection(db, 'staff_transactions'),
      where('settledInSalaryId', '==', settlementId),
      where('isCarryForward', '==', true),
    )
    const cfDocs = await getDocs(cfQ)
    if (!cfDocs.empty) {
      await Promise.allSettled(cfDocs.docs.map((d) => deleteDoc(d.ref)))
    }
  } catch (err) {
    console.warn('[StaffSalary] Error deleting carry-forward docs on settlement undo:', err)
  }

  // 2. Revert settled advance transactions back to active
  try {
    const settledQ = query(
      collection(db, 'staff_transactions'),
      where('settledInSalaryId', '==', settlementId),
    )
    const settledDocs = await getDocs(settledQ)
    if (!settledDocs.empty) {
      await Promise.allSettled(
        settledDocs.docs.map((d) =>
          updateDoc(d.ref, {
            status: 'active',
            settledInSalaryId: null,
            settledAmount: null,
            partialCarryForward: null,
            carryForwardAmount: null,
          }),
        ),
      )
    }
  } catch (err) {
    console.warn('[StaffSalary] Error reverting advances on settlement undo:', err)
  }

  // 3. Restore staff profile advanceBalance
  const advancesDeducted = Number(settlementData.advancesDeducted || 0)
  if (advancesDeducted > 0 && employeeId) {
    const staffRef = doc(db, 'staff', employeeId)
    await setDoc(
      staffRef,
      {
        advanceBalance: increment(advancesDeducted),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  // 4. Delete corresponding expense
  if (settlementData.expenseId) {
    try {
      await deleteDoc(doc(db, 'expenses', settlementData.expenseId))
    } catch (err) {
      console.warn('[StaffSalary] Error deleting salary expense:', err)
    }
  }

  // 5. Refund netPaid to payoutAccountId
  const netPaid = Number(settlementData.netPaid || 0)
  const payoutAccountId = settlementData.payoutAccountId
  if (netPaid > 0 && payoutAccountId) {
    await setDoc(
      ACCOUNTS_SUMMARY_DOC,
      {
        balances: {
          [payoutAccountId]: increment(netPaid),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  // 6. Delete settlement record
  await deleteDoc(settlementRef)
  return true
}

/**
 * Restores uncarried excess advance to active advance balance
 */
export async function restoreExcessAdvance({
  employeeId,
  employeeName = 'Nilesh',
  amount,
  note = 'Restored advance balance carried forward from salary settlement',
  sourceAccountId = 'counter',
}) {
  const num = Math.abs(Number(amount) || 0)
  if (!num || num <= 0) {
    throw new Error('Valid advance amount required')
  }

  const txPayload = {
    employeeId,
    employeeName,
    amount: num,
    sourceAccountId,
    date: Timestamp.fromDate(new Date()),
    note: note.trim(),
    status: 'active',
    isCarryForward: true,
    createdAt: serverTimestamp(),
  }

  const docRef = await addDoc(collection(db, 'staff_transactions'), txPayload)

  // Update staff advanceBalance
  const staffRef = doc(db, 'staff', employeeId)
  await setDoc(
    staffRef,
    {
      advanceBalance: increment(num),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  return { id: docRef.id, ...txPayload }
}
