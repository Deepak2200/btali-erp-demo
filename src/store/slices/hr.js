// Store actions for the HR & Payroll module + the payroll engine (pure helpers, exported for pages and seed).
import { makeAttachment, nowISO, today, uid, round2 } from '../../lib/format'

// ====================================================================== constants
export const PF_WAGE_CEILING = 15000
export const ESIC_WAGE_LIMIT = 21000
export const STD_DEDUCTION_NEW = 75000
export const SALARY_ROLES = ['HR', 'ADMIN', 'FINANCE_HEAD']

export const DEPARTMENTS = ['Management', 'Finance & Accounts', 'Purchase & Imports', 'Sales', 'Dispatch & Logistics', 'Warehouse', 'Service', 'HR & Admin']
export const LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', annual: 8, paid: true },
  { code: 'SL', name: 'Sick Leave', annual: 8, paid: true },
  { code: 'EL', name: 'Earned Leave', annual: 18, paid: true },
  { code: 'CO', name: 'Comp-off', annual: 0, paid: true },
  { code: 'LOP', name: 'Leave Without Pay', annual: 0, paid: false },
]
export const leaveName = (code) => LEAVE_TYPES.find((l) => l.code === code)?.name || code
export const ATT_CODES = {
  P: { label: 'Present', cls: 'bg-emerald-50 text-emerald-700' },
  A: { label: 'Absent', cls: 'bg-red-100 text-red-700' },
  L: { label: 'Leave', cls: 'bg-sky-100 text-sky-700' },
  HD: { label: 'Half day', cls: 'bg-amber-100 text-amber-800' },
  H: { label: 'Holiday', cls: 'bg-violet-100 text-violet-700' },
  WO: { label: 'Weekly off', cls: 'bg-slate-100 text-slate-400' },
}
export const CLAIM_TYPES = [
  { value: 'TRAVEL', label: 'Travel & conveyance' },
  { value: 'FUEL', label: 'Fuel' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'MOBILE', label: 'Mobile & internet' },
  { value: 'FOOD', label: 'Food & lodging' },
  { value: 'OTHER', label: 'Other' },
]
export const claimTypeLabel = (v) => CLAIM_TYPES.find((c) => c.value === v)?.label || v

// ====================================================================== date helpers
const pad = (n) => String(n).padStart(2, '0')
export const currentPeriod = () => today().slice(0, 7)
export const monthDays = (period) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
export const dateOf = (period, d) => `${period}-${pad(d)}`
export const dow = (iso) => new Date(`${iso}T00:00:00`).getDay()
export const addMonths = (period, n) => {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
export const periodLabel = (period) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
export const periodShort = (period) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}
export const toMin = (hhmm) => {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}
export const fromMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
export const datesBetween = (from, to) => {
  const out = []
  let d = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (d <= end) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  }
  return out
}
export const maskId = (v, keep = 4) => {
  if (!v) return '—'
  const s = String(v)
  if (s.length <= keep) return s
  return `${'•'.repeat(Math.max(2, s.length - keep))}${s.slice(-keep)}`
}

// ====================================================================== statutory
/** Maharashtra Professional Tax (monthly). Women: nil up to ₹25,000. Men: nil up to ₹7,500; ₹175 up to ₹10,000; ₹200 above (₹300 in February). */
export const ptAmount = (gross, gender, period) => {
  const feb = period?.slice(5, 7) === '02'
  if (gender === 'F') return gross <= 25000 ? 0 : feb ? 300 : 200
  if (gross <= 7500) return 0
  if (gross <= 10000) return 175
  return feb ? 300 : 200
}
/** Annual income tax under the new regime (FY 2026-27 slabs), incl. 87A rebate up to ₹12L with marginal relief and 4% cess. */
export const annualTaxNewRegime = (taxable) => {
  if (taxable <= 0) return 0
  const slabs = [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]]
  let tax = 0
  let prev = 0
  for (const [lim, rate] of slabs) {
    if (taxable > prev) tax += (Math.min(taxable, lim) - prev) * rate
    prev = lim
  }
  if (taxable <= 1200000) tax = 0
  else tax = Math.min(tax, taxable - 1200000)
  return Math.round(tax * 1.04)
}

// ====================================================================== salary structure maths
/** components: [{code,name,calc:'PCT_GROSS'|'PCT_BASIC'|'FIXED'|'BALANCE', value}] → monthly earnings for a monthly gross */
export const structureBreakup = (st, gross) => {
  const comps = st?.components || []
  const amt = {}
  for (const c of comps) if (c.calc === 'PCT_GROSS') amt[c.code] = Math.round((gross * c.value) / 100)
  const basic = amt.BASIC || 0
  for (const c of comps) if (c.calc === 'PCT_BASIC') amt[c.code] = Math.round((basic * c.value) / 100)
  for (const c of comps) if (c.calc === 'FIXED') amt[c.code] = Math.round(c.value)
  const used = Object.values(amt).reduce((a, x) => a + x, 0)
  const bal = comps.find((c) => c.calc === 'BALANCE')
  if (bal) amt[bal.code] = Math.max(0, gross - used)
  const earnings = comps.map((c) => ({ code: c.code, name: c.name, amount: amt[c.code] || 0 }))
  return { earnings, basic: amt.BASIC || 0, gross: earnings.reduce((a, e) => a + e.amount, 0) }
}
export const employerContrib = (st, gross) => {
  const br = structureBreakup(st, gross)
  const pfWage = Math.min(br.basic, PF_WAGE_CEILING)
  const pf = st?.pf ? Math.round(pfWage * 0.12) : 0
  const esic = st?.esic && gross <= ESIC_WAGE_LIMIT ? Math.ceil(gross * 0.0325) : 0
  return { pf, esic, eps: st?.pf ? Math.round(pfWage * 0.0833) : 0 }
}
/** monthly gross such that gross + employer PF + employer ESIC = CTC / 12 */
export const grossFromCtc = (st, ctcAnnual) => {
  const m = (Number(ctcAnnual) || 0) / 12
  let g = m
  for (let i = 0; i < 30; i++) {
    const er = employerContrib(st, g)
    g = m - er.pf - er.esic
  }
  return Math.max(0, Math.round(g))
}
/** Full monthly breakup for a CTC – used by previews and the employee drawer */
export const ctcBreakup = (st, ctcAnnual, gender = 'M', period = currentPeriod()) => {
  const gross = grossFromCtc(st, ctcAnnual)
  const br = structureBreakup(st, gross)
  const er = employerContrib(st, gross)
  const pf = st?.pf ? Math.round(Math.min(br.basic, PF_WAGE_CEILING) * 0.12) : 0
  const esic = st?.esic && gross <= ESIC_WAGE_LIMIT ? Math.ceil(gross * 0.0075) : 0
  const pt = st?.pt ? ptAmount(gross, gender, period) : 0
  const tds = st?.tds ? Math.round(annualTaxNewRegime(gross * 12 - STD_DEDUCTION_NEW) / 12) : 0
  const deductions = [
    { code: 'PF', name: 'Provident Fund (12%)', amount: pf },
    { code: 'ESIC', name: 'ESIC (0.75%)', amount: esic },
    { code: 'PT', name: 'Professional Tax', amount: pt },
    { code: 'TDS', name: 'Income Tax (TDS)', amount: tds },
  ]
  const totalDed = deductions.reduce((a, d) => a + d.amount, 0)
  return { gross, earnings: br.earnings, basic: br.basic, employer: er, deductions, totalDed, net: gross - totalDed, ctcMonthly: gross + er.pf + er.esic }
}

// ====================================================================== attendance maths
export const holidayOn = (state, iso) => (state.hrHolidays || []).find((h) => h.date === iso)
export const shiftOf = (state, emp) => (state.shifts || []).find((s) => s.id === emp?.shiftId) || (state.shifts || [])[0]
/** calendar default for a date: 'WO' | 'H' | null (working day) */
export const calendarCode = (state, emp, iso) => {
  const sh = shiftOf(state, emp)
  if ((sh?.weeklyOff || [0]).includes(dow(iso))) return 'WO'
  if (holidayOn(state, iso)) return 'H'
  return null
}
export const attDoc = (state, empId, period) => (state.attendance || []).find((a) => a.empId === empId && a.month === period)

export const attendanceSummary = (state, emp, period) => {
  const days = monthDays(period)
  const doc = attDoc(state, emp.id, period)
  const sh = shiftOf(state, emp)
  const lateAfter = toMin(sh?.start || '09:30') + (sh?.graceMin ?? 15)
  const endMin = toMin(sh?.end || '18:30')
  const t = today()
  const out = { days, present: 0, absent: 0, leave: 0, lopLeave: 0, halfDays: 0, wo: 0, holidays: 0, late: 0, early: 0, ot: 0, notEmployed: 0, assumed: 0, lop: 0, paidDays: 0, marked: 0 }
  for (let d = 1; d <= days; d++) {
    const iso = dateOf(period, d)
    if ((emp.doj && iso < emp.doj) || (emp.exitDate && iso > emp.exitDate)) { out.notEmployed++; continue }
    const rec = doc?.days?.[d]
    let s = rec?.s
    if (!s) {
      s = calendarCode(state, emp, iso) || 'P'
      if (s === 'P') out.assumed += iso >= t || !doc ? 1 : 0
      if (s === 'P' && iso < t && doc) s = 'P'
    } else out.marked++
    if (s === 'P') out.present++
    else if (s === 'A') out.absent++
    else if (s === 'HD') { out.halfDays++; out.present += 0.5 }
    else if (s === 'WO') out.wo++
    else if (s === 'H') out.holidays++
    else if (s === 'L') {
      const part = rec?.half ? 0.5 : 1
      if (rec?.lt === 'LOP') out.lopLeave += part
      else out.leave += part
      if (rec?.half) out.present += 0.5
    }
    if (rec && (s === 'P' || s === 'HD')) {
      if (rec.in && toMin(rec.in) > lateAfter) out.late++
      if (rec.out && toMin(rec.out) < endMin && s === 'P') out.early++
      out.ot += Number(rec.ot) || 0
    }
  }
  out.lop = out.absent + out.halfDays * 0.5 + out.lopLeave + out.notEmployed
  out.paidDays = Math.max(0, days - out.lop)
  return out
}

// ====================================================================== payroll engine
export const structureOf = (state, emp) => (state.salaryStructures || []).find((s) => s.id === emp?.structureId)
export const defaultIncentive = (state, emp, period) => {
  const st = structureOf(state, emp)
  if (!st?.incentiveEligible || !emp.userId) return 0
  const sales = (state.salesOrders || []).filter((o) => o.salespersonId === emp.userId && o.date?.startsWith(period) && o.status !== 'CANCELLED' && o.status !== 'PENDING_REVIEW')
  const v = sales.reduce((a, o) => a + (o.subtotal || o.total || 0), 0)
  return Math.min(25000, Math.round((v * 0.005) / 100) * 100)
}
const periodEnd = (period) => dateOf(period, monthDays(period))

export const employedIn = (emp, period) => {
  const start = dateOf(period, 1)
  const end = periodEnd(period)
  if (emp.doj && emp.doj > end) return false
  if (emp.exitDate && emp.exitDate < start) return false
  return true
}

export const computeSlip = (state, emp, period, input = {}, runId = null) => {
  const st = structureOf(state, emp)
  const fixedGross = grossFromCtc(st, emp.ctc)
  const br = structureBreakup(st, fixedGross)
  const att = attendanceSummary(state, emp, period)
  const ratio = att.days ? att.paidDays / att.days : 1
  const earnings = br.earnings.map((e) => ({ code: e.code, name: e.name, full: e.amount, amount: Math.round(e.amount * ratio) }))
  const basicEarned = earnings.find((e) => e.code === 'BASIC')?.amount || 0
  let otAmount = 0
  if (st?.otEligible && att.ot > 0) {
    const rate = round2((fixedGross / 26 / 8) * 2)
    otAmount = Math.round(att.ot * rate)
    earnings.push({ code: 'OT', name: `Overtime (${att.ot} hrs @ 2x)`, full: 0, amount: otAmount })
  }
  const incentive = input.incentive != null && input.incentive !== '' ? Number(input.incentive) || 0 : defaultIncentive(state, emp, period)
  if (incentive > 0) earnings.push({ code: 'INC', name: 'Sales incentive', full: 0, amount: Math.round(incentive) })
  const arrears = Number(input.arrears) || 0
  if (arrears > 0) earnings.push({ code: 'ARR', name: 'Arrears / bonus', full: 0, amount: Math.round(arrears) })
  const gross = earnings.reduce((a, e) => a + e.amount, 0)

  const claims = (state.empClaims || []).filter((c) => c.empId === emp.id && c.status === 'APPROVED' && c.payout !== 'ACCOUNTS' && (!c.payrollRunId || c.payrollRunId === runId) && c.date <= periodEnd(period))
  const reimbursement = claims.reduce((a, c) => a + (Number(c.approvedAmount ?? c.amount) || 0), 0)

  const pfWage = Math.min(basicEarned, PF_WAGE_CEILING)
  const pf = st?.pf ? Math.round(pfWage * 0.12) : 0
  const esicApplicable = !!st?.esic && fixedGross <= ESIC_WAGE_LIMIT
  const esic = esicApplicable ? Math.ceil(gross * 0.0075) : 0
  const pt = st?.pt ? ptAmount(gross, emp.gender, period) : 0
  const projected = fixedGross * 12 + incentive + arrears - STD_DEDUCTION_NEW
  const tds = st?.tds ? Math.round(annualTaxNewRegime(projected) / 12 / 10) * 10 : 0
  const loans = (state.empLoans || []).filter((l) => l.empId === emp.id && l.status === 'ACTIVE' && l.startMonth <= period && l.balance > 0 && !(l.repayments || []).some((r) => r.month === period && r.runId !== runId))
  const loanDeductions = loans.map((l) => ({ loanId: l.id, number: l.number, type: l.type, amount: Math.min(l.emi, l.balance) }))
  const other = Number(input.otherDeduction) || 0
  const deductions = [
    { code: 'PF', name: 'Provident Fund', amount: pf },
    { code: 'ESIC', name: 'ESIC', amount: esic },
    { code: 'PT', name: 'Professional Tax', amount: pt },
    { code: 'TDS', name: 'Income Tax (TDS)', amount: tds },
    ...loanDeductions.map((l) => ({ code: 'LOAN', name: `${l.type === 'ADVANCE' ? 'Salary advance' : 'Loan EMI'} (${l.number})`, amount: l.amount })),
    ...(other ? [{ code: 'OTH', name: input.otherNote || 'Other deduction', amount: other }] : []),
  ].filter((d) => d.amount > 0)
  const totalDeductions = deductions.reduce((a, d) => a + d.amount, 0)
  const net = Math.max(0, gross - totalDeductions + reimbursement)
  const erPf = st?.pf ? Math.round(pfWage * 0.12) : 0
  const erEsic = esicApplicable ? Math.ceil(gross * 0.0325) : 0
  return {
    empId: emp.id, code: emp.code, name: emp.name, dept: emp.dept, designation: emp.designation, gender: emp.gender,
    pan: emp.pan, uan: emp.uan, esicNo: emp.esic, bank: emp.bank, structureId: st?.id, structureName: st?.name,
    fixedGross, days: att.days, paidDays: att.paidDays, lopDays: att.lop, presentDays: att.present, leaveDays: att.leave, otHours: att.ot, lateDays: att.late,
    earnings, gross, deductions, totalDeductions, reimbursement, claimIds: claims.map((c) => c.id), loanDeductions,
    incentive, otAmount, arrears, pfWage: st?.pf ? pfWage : 0, esicWage: esicApplicable ? gross : 0,
    employer: { pf: erPf, eps: st?.pf ? Math.round(pfWage * 0.0833) : 0, epf: st?.pf ? erPf - Math.round(pfWage * 0.0833) : 0, esic: erEsic },
    net, hold: !!input.hold, input,
  }
}
export const runTotals = (slips) => {
  const live = slips.filter((s) => !s.hold)
  const s = (f) => live.reduce((a, x) => a + (f(x) || 0), 0)
  return {
    totalGross: s((x) => x.gross), totalDeductions: s((x) => x.totalDeductions), totalNet: s((x) => x.net), totalReimb: s((x) => x.reimbursement),
    employerCost: s((x) => x.gross + x.employer.pf + x.employer.esic), headcount: live.length,
    pf: s((x) => (x.deductions.find((d) => d.code === 'PF')?.amount || 0)), esic: s((x) => (x.deductions.find((d) => d.code === 'ESIC')?.amount || 0)),
    pt: s((x) => (x.deductions.find((d) => d.code === 'PT')?.amount || 0)), tds: s((x) => (x.deductions.find((d) => d.code === 'TDS')?.amount || 0)),
    erPf: s((x) => x.employer.pf), erEsic: s((x) => x.employer.esic),
  }
}
export const computeRunSlips = (state, period, inputs = {}, runId = null) =>
  (state.employees || []).filter((e) => e.status !== 'DRAFT' && employedIn(e, period) && e.structureId).map((e) => computeSlip(state, e, period, inputs[e.id] || {}, runId))

/** pure: what changes in loans / claims when a run is paid */
export const settleRun = (state, run, paidAt) => {
  const live = run.slips.filter((s) => !s.hold)
  const claimIds = new Set(live.flatMap((s) => s.claimIds || []))
  const loanPay = {}
  for (const s of live) for (const l of s.loanDeductions || []) loanPay[l.loanId] = l.amount
  const empClaims = (state.empClaims || []).map((c) => (claimIds.has(c.id) ? { ...c, status: 'PAID', payrollRunId: run.id, paidAt, history: [...(c.history || []), { ts: paidAt, text: `Paid with ${periodLabel(run.period)} salary` }] } : c))
  const empLoans = (state.empLoans || []).map((l) => {
    if (!loanPay[l.id]) return l
    const balance = Math.max(0, l.balance - loanPay[l.id])
    return { ...l, balance, status: balance <= 0 ? 'CLOSED' : l.status, closedAt: balance <= 0 ? paidAt : l.closedAt, repayments: [...(l.repayments || []), { month: run.period, amount: loanPay[l.id], runId: run.id, mode: 'PAYROLL', date: paidAt.slice(0, 10) }] }
  })
  return { empClaims, empLoans }
}

const hrNo = (list, prefix, width = 4) => {
  const max = (list || []).reduce((m, x) => {
    const n = parseInt(String(x.number || '').split('-').pop(), 10)
    return isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `${prefix}-${String(max + 1).padStart(width, '0')}`
}
const empUserId = (state, empId) => state.employees.find((e) => e.id === empId)?.userId
const empById = (state, id) => state.employees.find((e) => e.id === id)
const leaveDaysFor = (state, emp, from, to, half) => {
  if (half) return calendarCode(state, emp, from) ? 0 : 0.5
  return datesBetween(from, to).filter((d) => !calendarCode(state, emp, d)).length
}

// ====================================================================== slice
// eslint-disable-next-line no-unused-vars
export const hrSlice = (set, get, api) => ({
  // ---------------------------------------------------------------- employees
  addEmployee: (data) => {
    const s = get()
    const n = s.employees.reduce((m, e) => Math.max(m, parseInt(e.code.split('-')[1], 10) || 0), 0) + 1
    const emp = {
      id: uid('emp'), code: `BTI-${String(n).padStart(3, '0')}`, status: 'ACTIVE', documents: [], revisions: [{ date: data.doj || today(), ctc: Number(data.ctc) || 0, note: 'Joining CTC' }],
      bank: {}, location: 'Navi Mumbai HQ', employmentType: 'PROBATION', taxRegime: 'NEW', ...data, ctc: Number(data.ctc) || 0, createdAt: nowISO(),
    }
    const bal = { id: `lb_${emp.id}`, empId: emp.id, year: Number(today().slice(0, 4)) }
    const monthsLeft = 12 - Number(today().slice(5, 7)) + 1
    for (const lt of LEAVE_TYPES.filter((l) => l.code !== 'LOP')) bal[lt.code] = { entitled: lt.code === 'EL' ? round2(1.5 * 0) : Math.round((lt.annual * monthsLeft) / 12), used: 0 }
    set((st) => ({ employees: [emp, ...st.employees], leaveBalances: [bal, ...(st.leaveBalances || [])] }))
    get().audit('Added employee', 'Employee', `${emp.code} ${emp.name}`)
    if (data.email) get().sendEmail({ to: data.email, subject: `Welcome to Btali International, ${emp.name.split(' ')[0]}!`, body: `Dear ${emp.name},\n\nWelcome aboard as ${emp.designation} (${emp.dept}). Your employee code is ${emp.code} and your date of joining is ${emp.doj}.\n\nPlease share your PAN, Aadhaar, bank details and previous employment UAN with HR on day one.\n\nRegards,\nHR – Btali International`, ref: emp.code, kind: 'HR' })
    return emp
  },
  updateEmployee: (id, patch, note = 'Profile updated') => {
    const before = empById(get(), id)
    get().updateItem('employees', id, (e) => {
      const next = { ...e, ...patch }
      if (patch.ctc != null && Number(patch.ctc) !== Number(e.ctc)) next.revisions = [...(e.revisions || []), { date: patch.effectiveFrom || today(), ctc: Number(patch.ctc), note: patch.revisionNote || 'Salary revision', by: get().session.userId }]
      delete next.effectiveFrom
      delete next.revisionNote
      return next
    })
    get().audit(note, 'Employee', `${before?.code} ${before?.name}`)
  },
  exitEmployee: (id, { date, reason, type = 'RESIGNATION', lastWorkingDay }) => {
    const e = empById(get(), id)
    const lwd = lastWorkingDay || date
    const exited = lwd <= today()
    get().updateItem('employees', id, { status: exited ? 'EXITED' : 'NOTICE', exitDate: lwd, exitReason: reason, exitType: type, resignedOn: date })
    get().notify({ title: exited ? 'Employee exit processed' : 'Employee on notice period', body: `${e.name} (${e.code}) – last working day ${lwd}. Include full & final in the payroll for that month.`, link: '/erp/hr/employees', roles: ['HR', 'FINANCE_HEAD', 'ACCOUNTS'] })
    get().audit('Exit initiated', 'Employee', `${e.code} ${e.name}`)
  },
  reinstateEmployee: (id) => {
    const e = empById(get(), id)
    get().updateItem('employees', id, { status: 'ACTIVE', exitDate: null, exitReason: '', exitType: null })
    get().audit('Exit withdrawn', 'Employee', `${e.code} ${e.name}`)
  },
  addEmployeeDocs: (id, atts, docType) => {
    get().updateItem('employees', id, (e) => ({ ...e, documents: [...(e.documents || []), ...atts.map((a) => ({ ...a, docType: docType || a.docType || 'Other' }))] }))
    get().audit('Uploaded employee documents', 'Employee', empById(get(), id)?.code)
  },
  removeEmployeeDoc: (id, attId) => get().updateItem('employees', id, (e) => ({ ...e, documents: (e.documents || []).filter((d) => d.id !== attId) })),

  // ---------------------------------------------------------------- profile change requests (self-service)
  requestProfileChange: ({ empId, changes, reason = '', attachments = [] }) => {
    const s = get()
    const e = empById(s, empId)
    const current = {}
    for (const k of Object.keys(changes)) current[k] = k === 'bank' ? { ...(e.bank || {}) } : e[k]
    const r = { id: uid('pcr'), number: hrNo(s.profileRequests, 'PCR', 3), empId, changes, current, reason, attachments, status: 'PENDING', requestedAt: nowISO() }
    set((st) => ({ profileRequests: [r, ...(st.profileRequests || [])] }))
    get().notify({ title: 'Profile change request', body: `${e.name} requested an update to ${Object.keys(changes).join(', ')}.`, link: '/erp/hr/employees', roles: ['HR'] })
    return r
  },
  decideProfileChange: (id, ok = true, remark = '') => {
    const r = (get().profileRequests || []).find((x) => x.id === id)
    if (!r) return
    const e = empById(get(), r.empId)
    if (ok) {
      const patch = { ...r.changes }
      if (patch.bank) patch.bank = { ...(e.bank || {}), ...patch.bank }
      get().updateItem('employees', r.empId, patch)
    }
    get().updateItem('profileRequests', id, { status: ok ? 'APPROVED' : 'REJECTED', decidedBy: get().session.userId, decidedAt: nowISO(), remark })
    if (e.userId) get().notify({ title: `Profile update ${ok ? 'approved' : 'rejected'}`, body: remark || (ok ? 'Your details have been updated.' : ''), link: '/erp/me/profile', userIds: [e.userId] })
    if (e.email) get().sendEmail({ to: e.email, subject: `Your profile update request ${r.number} was ${ok ? 'approved' : 'rejected'}`, body: `Dear ${e.name},\n\nYour request to update ${Object.keys(r.changes).join(', ')} has been ${ok ? 'approved and applied' : 'rejected'}.${remark ? `\nRemarks: ${remark}` : ''}\n\nHR – Btali International`, ref: r.number, kind: 'HR' })
    get().audit(ok ? 'Approved profile change' : 'Rejected profile change', 'Employee', e.code)
  },

  // ---------------------------------------------------------------- shifts & attendance
  saveShift: (shift) => {
    if (shift.id && (get().shifts || []).some((x) => x.id === shift.id)) get().updateItem('shifts', shift.id, shift)
    else get().addItem('shifts', { ...shift, id: uid('sh') })
    get().audit('Saved shift', 'Shift', shift.name)
  },
  assignShift: (empIds, shiftId) => {
    const ids = new Set(empIds)
    set((s) => ({ employees: s.employees.map((e) => (ids.has(e.id) ? { ...e, shiftId } : e)) }))
    get().audit('Assigned shift', 'Shift', `${empIds.length} employee(s)`)
  },
  setAttendance: (empId, period, day, rec, source = 'MANUAL') => {
    set((s) => {
      const list = s.attendance || []
      const ex = list.find((a) => a.empId === empId && a.month === period)
      const days = { ...(ex?.days || {}) }
      if (rec == null) delete days[day]
      else days[day] = { ...rec, src: source, by: s.session.userId }
      const doc = { id: ex?.id || `att_${empId}_${period}`, empId, month: period, days, updatedAt: nowISO() }
      return { attendance: ex ? list.map((a) => (a.id === ex.id ? doc : a)) : [doc, ...list] }
    })
  },
  /** rows: [{empId, day, rec}] */
  bulkSetAttendance: (period, rows, source = 'CSV') => {
    set((s) => {
      const list = [...(s.attendance || [])]
      const byEmp = {}
      for (const r of rows) (byEmp[r.empId] ||= []).push(r)
      for (const [empId, rs] of Object.entries(byEmp)) {
        const idx = list.findIndex((a) => a.empId === empId && a.month === period)
        const days = { ...(idx >= 0 ? list[idx].days : {}) }
        for (const r of rs) days[r.day] = { ...r.rec, src: source }
        const doc = { id: idx >= 0 ? list[idx].id : `att_${empId}_${period}`, empId, month: period, days, updatedAt: nowISO() }
        if (idx >= 0) list[idx] = doc
        else list.unshift(doc)
      }
      return { attendance: list, attendanceImports: [{ id: uid('imp'), ts: nowISO(), period, source, rows: rows.length, employees: Object.keys(byEmp).length, by: s.session.userId }, ...(s.attendanceImports || [])].slice(0, 50) }
    })
    get().audit(`Attendance import (${source})`, 'Attendance', `${rows.length} entries`)
  },
  /** pulls punches from the biometric terminals for all unmarked working days up to today */
  syncBiometric: (period) => {
    const s = get()
    const t = today()
    const rows = []
    let seed = Date.now() % 9973
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (const e of s.employees.filter((x) => x.status !== 'EXITED' && employedIn(x, period))) {
      const doc = attDoc(s, e.id, period)
      const sh = shiftOf(s, e)
      for (let d = 1; d <= monthDays(period); d++) {
        const iso = dateOf(period, d)
        if (iso > t || doc?.days?.[d] || (e.doj && iso < e.doj)) continue
        const cal = calendarCode(s, e, iso)
        if (cal) { rows.push({ empId: e.id, day: d, rec: { s: cal } }); continue }
        if (e.location === 'Field') { rows.push({ empId: e.id, day: d, rec: { s: 'P', in: fromMin(toMin(sh.start) + Math.floor(rnd() * 25)), out: fromMin(toMin(sh.end) + Math.floor(rnd() * 30)), geo: true } }); continue }
        const r = rnd()
        if (r < 0.03) { rows.push({ empId: e.id, day: d, rec: { s: 'A' } }); continue }
        const inM = toMin(sh.start) - 12 + Math.floor(rnd() * (r < 0.15 ? 55 : 24))
        const outM = toMin(sh.end) + (r > 0.96 ? -45 : Math.floor(rnd() * 25))
        const ot = sh.otAllowed && rnd() < 0.18 ? 1 + Math.floor(rnd() * 3) : 0
        rows.push({ empId: e.id, day: d, rec: { s: 'P', in: fromMin(inM), out: fromMin(outM + ot * 60), ot } })
      }
    }
    if (rows.length) get().bulkSetAttendance(period, rows, 'BIOMETRIC')
    set((st) => ({ biometricSync: { lastSync: nowISO(), devices: st.biometricSync?.devices || [] } }))
    return rows.length
  },

  // ---------------------------------------------------------------- leaves
  applyLeave: ({ empId, type, from, to, half = false, reason = '', onBehalf = false }) => {
    const s = get()
    const e = empById(s, empId)
    const days = leaveDaysFor(s, e, from, half ? from : to, half)
    if (days <= 0) return { ok: false, error: 'Selected dates fall on weekly offs / holidays.' }
    const bal = (s.leaveBalances || []).find((b) => b.empId === empId)
    if (type !== 'LOP' && bal?.[type] && bal[type].entitled - bal[type].used - pendingDays(s, empId, type) < days) return { ok: false, error: `Insufficient ${leaveName(type)} balance.` }
    const l = { id: uid('lv'), empId, type, from, to: half ? from : to, half, days, reason, status: 'PENDING', appliedAt: nowISO(), appliedBy: s.session.userId, onBehalf }
    set((st) => ({ leaves: [l, ...(st.leaves || [])] }))
    const mgr = empById(s, e.managerId)
    get().notify({ title: 'Leave request', body: `${e.name} · ${leaveName(type)} · ${days} day(s) from ${from}`, link: '/erp/hr/leaves', roles: ['HR'], userIds: mgr?.userId ? [mgr.userId] : [] })
    if (mgr?.email) get().sendEmail({ to: mgr.email, cc: 'meera@btali.in', subject: `Leave request – ${e.name} (${days} day${days === 1 ? '' : 's'})`, body: `${e.name} has applied for ${leaveName(type)} from ${from} to ${l.to}.\nReason: ${reason || '—'}\n\nApprove or reject in Btali ERP → HR → Leave Management.`, ref: e.code, kind: 'HR' })
    return { ok: true, leave: l }
  },
  approveLeave: (id, approved = true, remark = '') => {
    const s = get()
    const l = (s.leaves || []).find((x) => x.id === id)
    if (!l || l.status !== 'PENDING') return
    const e = empById(s, l.empId)
    get().updateItem('leaves', id, { status: approved ? 'APPROVED' : 'REJECTED', decidedBy: s.session.userId, decidedAt: nowISO(), remark })
    if (approved) {
      if (l.type !== 'LOP') get().updateItem('leaveBalances', (s.leaveBalances || []).find((b) => b.empId === l.empId)?.id, (b) => ({ ...b, [l.type]: { ...(b[l.type] || { entitled: 0, used: 0 }), used: round2((b[l.type]?.used || 0) + l.days) } }))
      for (const d of datesBetween(l.from, l.to)) {
        if (calendarCode(get(), e, d)) continue
        get().setAttendance(l.empId, d.slice(0, 7), Number(d.slice(8, 10)), { s: 'L', lt: l.type, half: l.half }, 'LEAVE')
      }
    }
    if (e?.userId) get().notify({ title: `Leave ${approved ? 'approved' : 'rejected'}`, body: `${leaveName(l.type)} ${l.from}${l.to !== l.from ? ` – ${l.to}` : ''}${remark ? ` · ${remark}` : ''}`, link: '/erp/me/leave', userIds: [e.userId] })
    if (e?.email) get().sendEmail({ to: e.email, subject: `Your leave request has been ${approved ? 'approved' : 'rejected'}`, body: `Dear ${e.name},\n\nYour ${leaveName(l.type)} request for ${l.days} day(s) (${l.from} to ${l.to}) has been ${approved ? 'approved' : 'rejected'}.${remark ? `\nRemarks: ${remark}` : ''}\n\nHR – Btali International`, ref: e.code, kind: 'HR' })
    get().audit(approved ? 'Approved leave' : 'Rejected leave', 'Leave', `${e?.name} ${l.from}`)
  },
  cancelLeave: (id, reason = '') => {
    const s = get()
    const l = (s.leaves || []).find((x) => x.id === id)
    if (!l) return
    const e = empById(s, l.empId)
    if (l.status === 'APPROVED') {
      if (l.type !== 'LOP') get().updateItem('leaveBalances', (s.leaveBalances || []).find((b) => b.empId === l.empId)?.id, (b) => ({ ...b, [l.type]: { ...b[l.type], used: Math.max(0, round2((b[l.type]?.used || 0) - l.days)) } }))
      for (const d of datesBetween(l.from, l.to)) {
        const doc = attDoc(get(), l.empId, d.slice(0, 7))
        const day = Number(d.slice(8, 10))
        if (doc?.days?.[day]?.s === 'L') get().setAttendance(l.empId, d.slice(0, 7), day, null)
      }
    }
    get().updateItem('leaves', id, { status: 'CANCELLED', cancelledAt: nowISO(), cancelReason: reason })
    get().notify({ title: 'Leave cancelled', body: `${e?.name} · ${leaveName(l.type)} ${l.from}`, link: '/erp/hr/leaves', roles: ['HR'] })
  },
  adjustLeaveBalance: (empId, type, delta, note = '') => {
    const b = (get().leaveBalances || []).find((x) => x.empId === empId)
    if (!b) return
    get().updateItem('leaveBalances', b.id, (x) => ({ ...x, [type]: { ...(x[type] || { entitled: 0, used: 0 }), entitled: round2((x[type]?.entitled || 0) + delta) }, adjustments: [...(x.adjustments || []), { ts: nowISO(), type, delta, note, by: get().session.userId }] }))
    get().audit('Leave balance adjusted', 'Leave', `${empById(get(), empId)?.code} ${type} ${delta > 0 ? '+' : ''}${delta}`)
  },
  creditMonthlyEL: () => {
    const period = currentPeriod()
    const s = get()
    if ((s.leaveCredits || []).includes(period)) return 0
    const active = s.employees.filter((e) => e.status !== 'EXITED').map((e) => e.id)
    set((st) => ({
      leaveBalances: st.leaveBalances.map((b) => (active.includes(b.empId) ? { ...b, EL: { ...(b.EL || { entitled: 0, used: 0 }), entitled: round2((b.EL?.entitled || 0) + 1.5) } } : b)),
      leaveCredits: [...(st.leaveCredits || []), period],
    }))
    get().audit('Monthly EL credit', 'Leave', periodLabel(period))
    return active.length
  },

  // ---------------------------------------------------------------- salary structures
  saveSalaryStructure: (st) => {
    if (st.id && (get().salaryStructures || []).some((x) => x.id === st.id)) get().updateItem('salaryStructures', st.id, { ...st, updatedAt: nowISO() })
    else get().addItem('salaryStructures', { ...st, id: uid('ss'), createdAt: nowISO() })
    get().audit('Saved salary structure', 'Payroll', st.name)
  },
  assignStructure: (empIds, structureId) => {
    const ids = new Set(empIds)
    set((s) => ({ employees: s.employees.map((e) => (ids.has(e.id) ? { ...e, structureId } : e)) }))
    get().audit('Assigned salary structure', 'Payroll', `${empIds.length} employee(s)`)
  },

  // ---------------------------------------------------------------- payroll
  createPayrollRun: (period) => {
    const s = get()
    if ((s.payrollRuns || []).some((r) => r.period === period)) return { ok: false, error: `A payroll run for ${periodLabel(period)} already exists.` }
    const id = uid('pr')
    const slips = computeRunSlips(s, period, {}, id)
    const run = { id, number: `PRL/${period}`, period, periodLabel: periodLabel(period), status: 'DRAFT', slips, inputs: {}, ...runTotals(slips), createdBy: s.session.userId, createdAt: nowISO(), history: [{ ts: nowISO(), text: `Payroll computed for ${slips.length} employees`, by: s.session.userId }] }
    set((st) => ({ payrollRuns: [run, ...(st.payrollRuns || [])] }))
    get().audit('Created payroll run', 'Payroll', run.number)
    return { ok: true, run }
  },
  recomputePayrollRun: (id) => {
    const s = get()
    const run = s.payrollRuns.find((r) => r.id === id)
    if (!run || run.status !== 'DRAFT') return
    const slips = computeRunSlips(s, run.period, run.inputs || {}, id)
    get().updateItem('payrollRuns', id, (r) => ({ ...r, slips, ...runTotals(slips), history: [...r.history, { ts: nowISO(), text: 'Recalculated from latest attendance, claims and loans', by: s.session.userId }] }))
  },
  setPayrollInput: (id, empId, patch) => {
    const s = get()
    const run = s.payrollRuns.find((r) => r.id === id)
    if (!run || run.status !== 'DRAFT') return
    const inputs = { ...(run.inputs || {}), [empId]: { ...(run.inputs?.[empId] || {}), ...patch } }
    const emp = empById(s, empId)
    const slip = computeSlip(s, emp, run.period, inputs[empId], id)
    const slips = run.slips.map((x) => (x.empId === empId ? slip : x))
    get().updateItem('payrollRuns', id, { inputs, slips, ...runTotals(slips) })
  },
  deletePayrollRun: (id) => {
    const run = get().payrollRuns.find((r) => r.id === id)
    if (!run || run.status === 'PAID') return
    get().removeItem('payrollRuns', id)
    get().audit('Discarded payroll draft', 'Payroll', run.number)
  },
  submitPayroll: (id) => {
    const s = get()
    const run = s.payrollRuns.find((r) => r.id === id)
    get().updateItem('payrollRuns', id, (r) => ({ ...r, status: 'PENDING_APPROVAL', submittedAt: nowISO(), submittedBy: s.session.userId, history: [...r.history, { ts: nowISO(), text: 'Submitted to Finance Head for approval', by: s.session.userId }] }))
    get().notify({ title: 'Payroll awaiting approval', body: `${run.periodLabel} · ${run.slips.filter((x) => !x.hold).length} employees · net ₹${Math.round(run.totalNet).toLocaleString('en-IN')}`, link: '/erp/hr/payroll', roles: ['FINANCE_HEAD', 'ADMIN'] })
    const fh = s.users.find((u) => u.role === 'FINANCE_HEAD')
    if (fh) get().sendEmail({ to: fh.email, subject: `Payroll ${run.periodLabel} submitted for approval`, body: `Dear ${fh.name},\n\nThe payroll for ${run.periodLabel} is ready for your approval.\n\nEmployees: ${run.headcount}\nGross: ₹${Math.round(run.totalGross).toLocaleString('en-IN')}\nNet payable: ₹${Math.round(run.totalNet).toLocaleString('en-IN')}\nEmployer cost: ₹${Math.round(run.employerCost).toLocaleString('en-IN')}\n\nReview in Btali ERP → HR → Payroll.\n\nHR – Btali International`, attachments: [makeAttachment(`Salary-Register-${run.period}.xlsx`)], ref: run.number, kind: 'HR' })
    get().audit('Submitted payroll', 'Payroll', run.number)
  },
  approvePayroll: (id, approved = true, remark = '') => {
    const s = get()
    const run = s.payrollRuns.find((r) => r.id === id)
    if (!run) return
    get().updateItem('payrollRuns', id, (r) => ({
      ...r, status: approved ? 'APPROVED' : 'DRAFT', approvedBy: approved ? s.session.userId : null, approvedAt: approved ? nowISO() : null,
      rejection: approved ? null : { remark, by: s.session.userId, ts: nowISO() },
      history: [...r.history, { ts: nowISO(), text: approved ? `Approved for release${remark ? ` – ${remark}` : ''}` : `Sent back for revision – ${remark}`, by: s.session.userId }],
    }))
    get().notify({ title: approved ? 'Payroll approved' : 'Payroll sent back', body: `${run.periodLabel}${remark ? ` – ${remark}` : ''}`, link: '/erp/hr/payroll', roles: approved ? ['HR', 'ACCOUNTS'] : ['HR'] })
    get().audit(approved ? 'Approved payroll' : 'Rejected payroll', 'Payroll', run.number)
  },
  markPayrollPaid: (id, { paymentRef = '', date = today(), bankId = 'bk1', emailSlips = true } = {}) => {
    const s = get()
    const run = s.payrollRuns.find((r) => r.id === id)
    if (!run || run.status !== 'APPROVED') return
    const paidAt = nowISO()
    const settled = settleRun(s, run, paidAt)
    set({ empClaims: settled.empClaims, empLoans: settled.empLoans })
    let posted = null
    if (Array.isArray(get().expenses)) {
      const t = runTotals(run.slips)
      const e1 = { id: uid('exp'), number: get().nextNo('EXPN'), date, category: 'Salaries & Wages', description: `Salary – ${run.periodLabel} (${t.headcount} employees, net ${Math.round(t.totalNet)})`, amount: Math.round(t.totalGross + t.totalReimb), recurring: false, status: 'PAID', paidAt: paidAt, paymentRef, bankId, source: 'PAYROLL', ref: run.number, attachments: [makeAttachment(`Salary-Register-${run.period}.pdf`)] }
      const e2 = { id: uid('exp'), number: get().nextNo('EXPN'), date, category: 'Employer PF & ESIC', description: `Employer statutory contribution – ${run.periodLabel}`, amount: Math.round(t.erPf + t.erEsic), recurring: false, status: 'APPROVED', source: 'PAYROLL', ref: run.number, attachments: [] }
      set((st) => ({ expenses: [e1, e2, ...st.expenses] }))
      posted = [e1.number, e2.number]
    }
    get().updateItem('payrollRuns', id, (r) => ({ ...r, status: 'PAID', paidAt, paymentDate: date, paymentRef, bankId, postedExpenses: posted, slipsEmailed: emailSlips, history: [...r.history, { ts: paidAt, text: `Salaries released${paymentRef ? ` (${paymentRef})` : ''}${posted ? ` · posted to Accounts ${posted.join(', ')}` : ' · Accounts notified for posting'}`, by: s.session.userId }] }))
    get().notify({ title: `Salaries paid – ${run.periodLabel}`, body: `Net ₹${Math.round(run.totalNet).toLocaleString('en-IN')} released${posted ? `; expense ${posted[0]} posted` : '; please post the salary JV'}. PF/ESIC/PT challans due by the 15th.`, link: posted ? '/erp/accounts/expenses' : '/erp/hr/payroll', roles: ['ACCOUNTS', 'FINANCE_HEAD'] })
    if (emailSlips) {
      for (const sl of run.slips.filter((x) => !x.hold)) {
        const e = empById(get(), sl.empId)
        if (e?.email) get().sendEmail({ to: e.email, subject: `Payslip for ${run.periodLabel}`, body: `Dear ${e.name},\n\nYour salary for ${run.periodLabel} has been credited. Net pay: ₹${Math.round(sl.net).toLocaleString('en-IN')}.\nPlease find your payslip attached. You can also view it under My Payslips in Btali ERP.\n\nHR – Btali International`, attachments: [makeAttachment(`Payslip-${e.code}-${run.period}.pdf`)], ref: run.number, kind: 'PAYSLIP' })
        if (e?.userId) get().notify({ title: 'Payslip available', body: `${run.periodLabel} · net ₹${Math.round(sl.net).toLocaleString('en-IN')}`, link: '/erp/me/payslips', userIds: [e.userId] })
      }
    }
    get().audit('Marked payroll paid', 'Payroll', run.number)
  },
  emailPayslip: (runId, empId) => {
    const run = get().payrollRuns.find((r) => r.id === runId)
    const e = empById(get(), empId)
    const sl = run?.slips.find((x) => x.empId === empId)
    if (!run || !e || !sl) return false
    get().sendEmail({ to: e.email || `${e.code.toLowerCase()}@btali.in`, subject: `Payslip for ${run.periodLabel}`, body: `Dear ${e.name},\n\nPlease find attached your payslip for ${run.periodLabel}. Net pay: ₹${Math.round(sl.net).toLocaleString('en-IN')}.\n\nHR – Btali International`, attachments: [makeAttachment(`Payslip-${e.code}-${run.period}.pdf`)], ref: run.number, kind: 'PAYSLIP' })
    return true
  },

  // ---------------------------------------------------------------- reimbursements
  submitEmpClaim: ({ empId, type, date, amount, description = '', attachments = [], km }) => {
    const s = get()
    const e = empById(s, empId)
    const c = { id: uid('ec'), number: hrNo(s.empClaims, 'RMB'), empId, type, date, amount: Number(amount), description, attachments, km: km || null, status: 'PENDING', payout: 'PAYROLL', submittedAt: nowISO(), submittedBy: s.session.userId, history: [{ ts: nowISO(), text: 'Claim submitted' }] }
    set((st) => ({ empClaims: [c, ...(st.empClaims || [])] }))
    const mgr = empById(s, e?.managerId)
    get().notify({ title: 'Reimbursement claim submitted', body: `${e?.name} · ${claimTypeLabel(type)} · ₹${Number(amount).toLocaleString('en-IN')}`, link: '/erp/hr/claims', roles: ['HR'], userIds: mgr?.userId ? [mgr.userId] : [] })
    return c
  },
  approveEmpClaim: (id, approved = true, remark = '', approvedAmount) => {
    const s = get()
    const c = (s.empClaims || []).find((x) => x.id === id)
    if (!c) return
    const e = empById(s, c.empId)
    const amt = approved ? (approvedAmount != null && approvedAmount !== '' ? Number(approvedAmount) : c.amount) : 0
    get().updateItem('empClaims', id, (x) => ({ ...x, status: approved ? 'APPROVED' : 'REJECTED', approvedAmount: approved ? amt : null, approvedBy: s.session.userId, approvedAt: nowISO(), remark, history: [...(x.history || []), { ts: nowISO(), text: approved ? `Approved ₹${amt.toLocaleString('en-IN')} – will be paid with next salary${remark ? ` (${remark})` : ''}` : `Rejected – ${remark}` }] }))
    if (e?.userId) get().notify({ title: `Claim ${c.number} ${approved ? 'approved' : 'rejected'}`, body: approved ? `₹${amt.toLocaleString('en-IN')} will be paid with your next salary.` : remark, link: '/erp/me/claims', userIds: [e.userId] })
    if (e?.email) get().sendEmail({ to: e.email, subject: `Reimbursement ${c.number} ${approved ? 'approved' : 'rejected'}`, body: `Dear ${e.name},\n\nYour ${claimTypeLabel(c.type).toLowerCase()} claim of ₹${c.amount.toLocaleString('en-IN')} dated ${c.date} has been ${approved ? `approved for ₹${amt.toLocaleString('en-IN')}` : 'rejected'}.${remark ? `\nRemarks: ${remark}` : ''}\n\nHR – Btali International`, ref: c.number, kind: 'HR' })
    get().audit(approved ? 'Approved reimbursement' : 'Rejected reimbursement', 'Claim', c.number)
  },
  /** pay an approved claim immediately through Accounts instead of the next payroll */
  payEmpClaimNow: (id, { paymentRef = '' } = {}) => {
    const s = get()
    const c = (s.empClaims || []).find((x) => x.id === id)
    if (!c || c.status !== 'APPROVED') return
    const e = empById(s, c.empId)
    const amt = c.approvedAmount ?? c.amount
    let posted = null
    if (Array.isArray(s.expenses)) {
      const ex = { id: uid('exp'), number: get().nextNo('EXPN'), date: today(), category: 'Staff Reimbursement', description: `${c.number} · ${e?.name} · ${claimTypeLabel(c.type)}`, amount: amt, recurring: false, status: 'PAID', paidAt: nowISO(), paymentRef, source: 'HR_CLAIM', ref: c.number, attachments: c.attachments || [] }
      set((st) => ({ expenses: [ex, ...st.expenses] }))
      posted = ex.number
    }
    get().updateItem('empClaims', id, (x) => ({ ...x, status: 'PAID', payout: 'ACCOUNTS', paidAt: nowISO(), paymentRef, postedExpense: posted, history: [...(x.history || []), { ts: nowISO(), text: `Paid via Accounts${paymentRef ? ` (${paymentRef})` : ''}${posted ? ` · ${posted}` : ''}` }] }))
    get().notify({ title: 'Staff reimbursement paid', body: `${c.number} · ${e?.name} · ₹${amt.toLocaleString('en-IN')}${posted ? ` · posted as ${posted}` : ' – please post the voucher'}`, link: posted ? '/erp/accounts/expenses' : '/erp/hr/claims', roles: ['ACCOUNTS'] })
    if (e?.userId) get().notify({ title: `Claim ${c.number} paid`, body: `₹${amt.toLocaleString('en-IN')} transferred to your bank account.`, link: '/erp/me/claims', userIds: [e.userId] })
  },
  withdrawEmpClaim: (id) => get().updateItem('empClaims', id, (x) => ({ ...x, status: 'WITHDRAWN', history: [...(x.history || []), { ts: nowISO(), text: 'Withdrawn by employee' }] })),

  // ---------------------------------------------------------------- loans & advances
  requestEmpLoan: ({ empId, type = 'LOAN', amount, tenure, reason = '', startMonth }) => {
    const s = get()
    const e = empById(s, empId)
    const n = Math.max(1, Number(tenure) || 1)
    const l = { id: uid('ln'), number: hrNo(s.empLoans, type === 'ADVANCE' ? 'ADV' : 'LN', 3), empId, type, amount: Number(amount), tenure: n, emi: Math.ceil(Number(amount) / n), reason, startMonth: startMonth || addMonths(currentPeriod(), 1), status: 'PENDING', requestedAt: nowISO(), repayments: [], balance: Number(amount), history: [{ ts: nowISO(), text: 'Requested' }] }
    set((st) => ({ empLoans: [l, ...(st.empLoans || [])] }))
    get().notify({ title: `${type === 'ADVANCE' ? 'Salary advance' : 'Loan'} request`, body: `${e?.name} · ₹${Number(amount).toLocaleString('en-IN')} over ${n} month(s)`, link: '/erp/hr/loans', roles: ['HR', 'FINANCE_HEAD'] })
    return l
  },
  approveEmpLoan: (id, approved = true, remark = '', patch = {}) => {
    const s = get()
    const l = (s.empLoans || []).find((x) => x.id === id)
    if (!l) return
    const e = empById(s, l.empId)
    const tenure = Number(patch.tenure) || l.tenure
    const emi = Math.ceil(l.amount / tenure)
    get().updateItem('empLoans', id, (x) => ({ ...x, ...(approved ? { status: 'ACTIVE', tenure, emi, startMonth: patch.startMonth || x.startMonth, disbursedAt: nowISO(), disbursementRef: patch.ref || '' } : { status: 'REJECTED' }), approvedBy: s.session.userId, approvedAt: nowISO(), remark, history: [...(x.history || []), { ts: nowISO(), text: approved ? `Approved & disbursed – EMI ₹${emi.toLocaleString('en-IN')} × ${tenure} from ${periodLabel(patch.startMonth || x.startMonth)}` : `Rejected – ${remark}` }] }))
    if (approved) get().notify({ title: 'Staff loan disbursed', body: `${l.number} · ${e?.name} · ₹${l.amount.toLocaleString('en-IN')} – recover via payroll`, link: '/erp/hr/loans', roles: ['ACCOUNTS'] })
    if (e?.userId) get().notify({ title: `${l.type === 'ADVANCE' ? 'Advance' : 'Loan'} ${approved ? 'approved' : 'rejected'}`, body: approved ? `₹${l.amount.toLocaleString('en-IN')} · EMI ₹${emi.toLocaleString('en-IN')} deducted from salary` : remark, link: '/erp/me/payslips', userIds: [e.userId] })
    if (e?.email) get().sendEmail({ to: e.email, subject: `${l.type === 'ADVANCE' ? 'Salary advance' : 'Staff loan'} ${l.number} ${approved ? 'approved' : 'rejected'}`, body: `Dear ${e.name},\n\n${approved ? `Your request for ₹${l.amount.toLocaleString('en-IN')} has been approved. ₹${emi.toLocaleString('en-IN')} will be recovered from your salary for ${tenure} month(s) starting ${periodLabel(patch.startMonth || l.startMonth)}.` : `Your request for ₹${l.amount.toLocaleString('en-IN')} could not be approved.${remark ? `\nRemarks: ${remark}` : ''}`}\n\nHR – Btali International`, ref: l.number, kind: 'HR' })
    get().audit(approved ? 'Approved staff loan' : 'Rejected staff loan', 'Loan', l.number)
  },
  recordLoanRepayment: (id, amount, note = 'Manual prepayment') => {
    const l = (get().empLoans || []).find((x) => x.id === id)
    if (!l) return
    const amt = Math.min(Number(amount) || 0, l.balance)
    const balance = l.balance - amt
    get().updateItem('empLoans', id, (x) => ({ ...x, balance, status: balance <= 0 ? 'CLOSED' : x.status, closedAt: balance <= 0 ? nowISO() : x.closedAt, repayments: [...(x.repayments || []), { month: currentPeriod(), amount: amt, mode: 'MANUAL', note, date: today() }], history: [...(x.history || []), { ts: nowISO(), text: `${note}: ₹${amt.toLocaleString('en-IN')}${balance <= 0 ? ' – loan closed' : ''}` }] }))
    get().audit('Loan repayment', 'Loan', l.number)
  },
  updateLoanEmi: (id, emi) => {
    get().updateItem('empLoans', id, (x) => ({ ...x, emi: Number(emi), history: [...(x.history || []), { ts: nowISO(), text: `EMI revised to ₹${Number(emi).toLocaleString('en-IN')}` }] }))
  },
})

function pendingDays(state, empId, type) {
  return (state.leaves || []).filter((l) => l.empId === empId && l.type === type && l.status === 'PENDING').reduce((a, l) => a + l.days, 0)
}
