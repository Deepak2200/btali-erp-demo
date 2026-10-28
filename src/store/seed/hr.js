// Module seed for HR & Payroll. Receives the core seed (read-only) and returns NEW collections only.
import { makeAttachment, mulberry32, today, addDays } from '../../lib/format'
import {
  currentPeriod, addMonths, monthDays, dateOf, periodLabel, fromMin, toMin, computeRunSlips, runTotals, settleRun, calendarCode,
} from '../slices/hr'

const iso = (d, h = 10, m = 0) => `${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`

const SHIFTS = [
  { id: 'sh1', code: 'GEN', name: 'General – HQ', start: '09:30', end: '18:30', graceMin: 15, breakMin: 60, weeklyOff: [0, 6], otAllowed: false, color: '#2f416b', location: 'Navi Mumbai HQ' },
  { id: 'sh2', code: 'WH', name: 'Warehouse – Btali', start: '09:00', end: '18:00', graceMin: 10, breakMin: 45, weeklyOff: [0], otAllowed: true, color: '#0d9488', location: 'Btali Warehouse, Bhiwandi' },
  { id: 'sh3', code: 'FLD', name: 'Field Sales', start: '10:00', end: '19:00', graceMin: 30, breakMin: 60, weeklyOff: [0], otAllowed: false, color: '#f2541f', location: 'Field' },
  { id: 'sh4', code: 'SRV', name: 'Service – Field', start: '09:00', end: '18:00', graceMin: 15, breakMin: 45, weeklyOff: [0], otAllowed: true, color: '#7c3aed', location: 'Field' },
]

const HOLIDAYS = [
  ['2026-01-26', 'Republic Day'], ['2026-03-04', 'Holi'], ['2026-03-19', 'Gudi Padwa'], ['2026-05-01', 'Maharashtra Day'],
  ['2026-08-15', 'Independence Day'], ['2026-09-14', 'Ganesh Chaturthi'], ['2026-10-02', 'Gandhi Jayanti'], ['2026-10-20', 'Dussehra'],
  ['2026-11-10', 'Diwali – Balipratipada'], ['2026-12-25', 'Christmas'], ['2027-01-26', 'Republic Day'], ['2027-03-06', 'Holi'],
].map(([date, name], i) => ({ id: `hol${i + 1}`, date, name, type: 'PUBLIC' }))

const STRUCTURES = [
  {
    id: 'ss1', code: 'STAFF', name: 'Staff', description: 'Office, warehouse and service staff. Overtime eligible.',
    components: [
      { code: 'BASIC', name: 'Basic', calc: 'PCT_GROSS', value: 50 },
      { code: 'HRA', name: 'House Rent Allowance', calc: 'PCT_BASIC', value: 40 },
      { code: 'CONV', name: 'Conveyance Allowance', calc: 'FIXED', value: 1600 },
      { code: 'SPL', name: 'Special Allowance', calc: 'BALANCE', value: 0 },
    ],
    pf: true, esic: true, pt: true, tds: true, otEligible: true, incentiveEligible: false, createdAt: '2025-04-01T09:00:00.000Z',
  },
  {
    id: 'ss2', code: 'MGR', name: 'Manager', description: 'Managers and heads of department. PF on statutory wage ceiling.',
    components: [
      { code: 'BASIC', name: 'Basic', calc: 'PCT_GROSS', value: 40 },
      { code: 'HRA', name: 'House Rent Allowance', calc: 'PCT_BASIC', value: 50 },
      { code: 'CONV', name: 'Conveyance Allowance', calc: 'FIXED', value: 1600 },
      { code: 'MED', name: 'Medical Allowance', calc: 'FIXED', value: 1250 },
      { code: 'SPL', name: 'Special Allowance', calc: 'BALANCE', value: 0 },
    ],
    pf: true, esic: true, pt: true, tds: true, otEligible: false, incentiveEligible: false, createdAt: '2025-04-01T09:00:00.000Z',
  },
  {
    id: 'ss3', code: 'FIELD', name: 'Field Sales', description: 'Sales executives – travel & mobile allowance plus monthly sales incentive (0.5% of booked sales, capped ₹25,000).',
    components: [
      { code: 'BASIC', name: 'Basic', calc: 'PCT_GROSS', value: 45 },
      { code: 'HRA', name: 'House Rent Allowance', calc: 'PCT_BASIC', value: 40 },
      { code: 'CONV', name: 'Travel Allowance', calc: 'FIXED', value: 3000 },
      { code: 'MOB', name: 'Mobile Allowance', calc: 'FIXED', value: 1000 },
      { code: 'SPL', name: 'Special Allowance', calc: 'BALANCE', value: 0 },
    ],
    pf: true, esic: true, pt: true, tds: true, otEligible: false, incentiveEligible: true, createdAt: '2025-04-01T09:00:00.000Z',
  },
]

// [id, name, userId, dept, designation, gender, doj, ctc, structure, shift, managerId, location, extra]
const EMP = [
  ['e1', 'Vikram Mehta', 'u1', 'Management', 'Director', 'M', '2014-04-01', 3600000, 'ss2', 'sh1', null, 'Navi Mumbai HQ'],
  ['e2', 'Neha Mehta', 'u2', 'Finance & Accounts', 'Finance Head', 'F', '2015-06-15', 2400000, 'ss2', 'sh1', 'e1', 'Navi Mumbai HQ'],
  ['e3', 'Arjun Nair', 'u3', 'Purchase & Imports', 'Purchase Manager', 'M', '2018-08-01', 1320000, 'ss2', 'sh1', 'e1', 'Navi Mumbai HQ'],
  ['e4', 'Priya Desai', 'u4', 'Sales', 'Sales Manager', 'F', '2017-11-20', 1440000, 'ss2', 'sh1', 'e1', 'Navi Mumbai HQ'],
  ['e5', 'Rohit Kulkarni', 'u5', 'Sales', 'Sales Executive – West & Central', 'M', '2021-02-08', 600000, 'ss3', 'sh3', 'e4', 'Field'],
  ['e6', 'Sameer Khan', 'u6', 'Sales', 'Sales Executive – North', 'M', '2022-07-04', 540000, 'ss3', 'sh3', 'e4', 'Field'],
  ['e7', 'Ankita Joshi', 'u7', 'Sales', 'Sales Executive – South', 'F', '2022-01-17', 540000, 'ss3', 'sh3', 'e4', 'Field'],
  ['e8', 'Amit Verma', 'u18', 'Sales', 'Sales Executive – East', 'M', '2024-03-11', 480000, 'ss3', 'sh3', 'e4', 'Field'],
  ['e9', 'Deepak Yadav', 'u8', 'Dispatch & Logistics', 'Dispatch Executive', 'M', '2019-09-02', 360000, 'ss1', 'sh2', 'e3', 'Btali Warehouse, Bhiwandi'],
  ['e10', 'Kavita Iyer', 'u9', 'Finance & Accounts', 'Accounts Executive', 'F', '2020-01-06', 420000, 'ss1', 'sh1', 'e2', 'Navi Mumbai HQ'],
  ['e11', 'Meera Pillai', 'u10', 'HR & Admin', 'HR Manager', 'F', '2019-04-15', 900000, 'ss2', 'sh1', 'e1', 'Navi Mumbai HQ'],
  ['e12', 'Imran Shaikh', 'u11', 'Service', 'Service Head', 'M', '2018-03-12', 780000, 'ss2', 'sh4', 'e1', 'Field'],
  ['e13', 'Sunil More', 'u17', 'Warehouse', 'Warehouse Coordinator (Btali desk)', 'M', '2020-10-05', 300000, 'ss1', 'sh2', 'e9', 'Btali Warehouse, Bhiwandi'],
  ['e14', 'Pooja Sawant', null, 'Finance & Accounts', 'Accounts Assistant', 'F', '2023-06-01', 252000, 'ss1', 'sh1', 'e2', 'Navi Mumbai HQ'],
  ['e15', 'Ramesh Gawde', null, 'Warehouse', 'Warehouse Helper', 'M', '2021-11-15', 192000, 'ss1', 'sh2', 'e13', 'Btali Warehouse, Bhiwandi'],
  ['e16', 'Sachin Jadhav', null, 'Service', 'Service Technician', 'M', '2022-05-02', 276000, 'ss1', 'sh4', 'e12', 'Field'],
  ['e17', 'Faizal Ansari', null, 'Service', 'Service Technician', 'M', '2023-09-18', 252000, 'ss1', 'sh4', 'e12', 'Field'],
  ['e18', 'Lata Shinde', null, 'HR & Admin', 'Office Administrator', 'F', '2020-02-03', 228000, 'ss1', 'sh1', 'e11', 'Navi Mumbai HQ'],
  ['e19', 'Mahesh Patil', null, 'Dispatch & Logistics', 'Driver', 'M', '2019-12-09', 216000, 'ss1', 'sh2', 'e9', 'Btali Warehouse, Bhiwandi'],
  ['e20', 'Nikhil Rane', null, 'Purchase & Imports', 'Import Executive', 'M', '2022-12-01', 420000, 'ss1', 'sh1', 'e3', 'Navi Mumbai HQ'],
  ['e21', 'Swati Kale', null, 'Sales', 'Sales Coordinator', 'F', '2021-08-16', 360000, 'ss1', 'sh1', 'e4', 'Navi Mumbai HQ'],
  ['e22', 'Tejas Bhosale', null, 'Warehouse', 'Warehouse Assistant', 'M', null, 186000, 'ss1', 'sh2', 'e13', 'Btali Warehouse, Bhiwandi'],
]
const BANKS = [['HDFC Bank', 'HDFC0000540'], ['State Bank of India', 'SBIN0011853'], ['ICICI Bank', 'ICIC0001267'], ['Axis Bank', 'UTIB0000697'], ['Kotak Mahindra Bank', 'KKBK0000646'], ['Bank of Maharashtra', 'MAHB0000921']]
const CITIES = ['Vashi, Navi Mumbai', 'Kharghar, Navi Mumbai', 'Thane West', 'Panvel', 'Kalyan', 'Bhiwandi', 'Airoli, Navi Mumbai', 'Nerul, Navi Mumbai', 'Dombivli East', 'Ghansoli, Navi Mumbai']
const BLOOD = ['B+', 'O+', 'A+', 'AB+', 'O-', 'B-']

export const hrSeed = (core) => {
  const rnd = mulberry32(55021)
  const t = today()
  const cur = currentPeriod()
  const prev = addMonths(cur, -1)
  const users = Object.fromEntries(core.users.map((u) => [u.id, u]))
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const letter = () => L[Math.floor(rnd() * L.length)]

  const employees = EMP.map(([id, name, userId, dept, designation, gender, doj, ctc, structureId, shiftId, managerId, location], i) => {
    const n = i + 1
    const u = userId ? users[userId] : null
    const first = name.split(' ')[0].toLowerCase()
    const [bankName, ifsc] = BANKS[i % BANKS.length]
    const surnameInitial = name.split(' ').slice(-1)[0][0]
    const joining = doj || dateOf(prev, 7)
    const docs = [
      makeAttachment(`PAN-${first}.pdf`, { docType: 'ID proof', uploadedAt: iso(joining, 11) }),
      makeAttachment(`Aadhaar-${first}.pdf`, { docType: 'ID proof', uploadedAt: iso(joining, 11) }),
      makeAttachment(`Offer-letter-BTI-${String(n).padStart(3, '0')}.pdf`, { docType: 'Offer letter', uploadedAt: iso(joining, 9) }),
    ]
    if (n % 4 !== 0) docs.push(makeAttachment(`Appointment-letter-BTI-${String(n).padStart(3, '0')}.pdf`, { docType: 'Contract', uploadedAt: iso(joining, 12) }))
    if (n % 5 === 0) docs.push(makeAttachment(`Relieving-letter-previous-employer-${first}.pdf`, { docType: 'Previous employment', uploadedAt: iso(joining, 12) }))
    const ctcAtJoin = Math.round((ctc * 0.82) / 6000) * 6000
    const e = {
      id, code: `BTI-${String(n).padStart(3, '0')}`, name, userId, dept, designation, gender, doj: joining,
      dob: `${1972 + Math.floor(rnd() * 28)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 27)).padStart(2, '0')}`,
      email: u?.email || `${first}@btali.in`, phone: u?.phone || `98${Math.floor(10 + rnd() * 89)}0 ${String(10000 + Math.floor(rnd() * 89999))}`,
      personalEmail: `${first}.${name.split(' ').slice(-1)[0].toLowerCase()}@gmail.com`,
      address: `${100 + Math.floor(rnd() * 800)}, ${['Sai Krupa CHS', 'Gokul Dham', 'Shree Residency', 'Om Sai Apartments', 'Vrindavan Society'][i % 5]}, ${CITIES[i % CITIES.length]}`,
      emergencyContact: `${['Sunita', 'Rajesh', 'Anil', 'Kiran', 'Manoj', 'Asha'][i % 6]} ${name.split(' ').slice(-1)[0]} · 98${Math.floor(100 + rnd() * 899)} ${String(10000 + Math.floor(rnd() * 89999))}`,
      bloodGroup: BLOOD[i % BLOOD.length], maritalStatus: rnd() < 0.65 ? 'Married' : 'Single',
      location, managerId, shiftId, structureId, ctc, employmentType: n === 22 ? 'PROBATION' : 'PERMANENT', taxRegime: 'NEW',
      status: 'ACTIVE', exitDate: null,
      pan: `${letter()}${letter()}${letter()}P${surnameInitial}${String(1000 + Math.floor(rnd() * 8999))}${letter()}`,
      uan: `10${String(Math.floor(1e9 + rnd() * 8.9e9))}`,
      esic: `31${String(Math.floor(1e7 + rnd() * 8.9e7))}00`,
      aadhaar: `${Math.floor(2000 + rnd() * 7000)} ${Math.floor(1000 + rnd() * 8999)} ${Math.floor(1000 + rnd() * 8999)}`,
      bank: { name: bankName, account: String(Math.floor(5e10 + rnd() * 4.9e11)).slice(0, 12 + (i % 3)), ifsc, holder: name },
      documents: n === 22 ? docs.slice(0, 2) : docs,
      revisions: doj && doj < '2025-04-01' ? [{ date: joining, ctc: ctcAtJoin, note: 'Joining CTC' }, { date: '2025-04-01', ctc: Math.round((ctc * 0.92) / 6000) * 6000, note: 'Annual increment FY 25-26' }, { date: '2026-04-01', ctc, note: 'Annual increment FY 26-27' }] : [{ date: joining, ctc, note: 'Joining CTC' }],
      createdAt: iso(joining, 9),
    }
    return e
  })
  const emp = Object.fromEntries(employees.map((e) => [e.id, e]))
  // exits & notice
  emp.e21.status = 'EXITED'
  emp.e21.exitDate = dateOf(addMonths(cur, -2), 14)
  emp.e21.exitReason = 'Relocating to Pune after marriage'
  emp.e21.exitType = 'RESIGNATION'
  emp.e21.resignedOn = dateOf(addMonths(cur, -3), 14)
  emp.e20.status = 'NOTICE'
  emp.e20.resignedOn = addDays(t, -16)
  emp.e20.exitDate = addDays(t, 14)
  emp.e20.exitReason = 'Better opportunity – joining a freight forwarder'
  emp.e20.exitType = 'RESIGNATION'

  const ctx = { employees, shifts: SHIFTS, hrHolidays: HOLIDAYS }
  /** n-th working day (1-based) of a month for an employee */
  const workday = (e, period, nth) => {
    let c = 0
    for (let d = 1; d <= monthDays(period); d++) {
      const x = dateOf(period, d)
      if (!calendarCode(ctx, e, x)) { c++; if (c === nth) return x }
    }
    return dateOf(period, 1)
  }
  const nextWorkdays = (e, from, count) => {
    const out = []
    let d = from
    while (out.length < count) {
      if (!calendarCode(ctx, e, d)) out.push(d)
      d = addDays(d, 1)
    }
    return out
  }

  // ------------------------------------------------------------ leaves
  const leaves = []
  let lvN = 0
  const mkLeave = (empId, type, dates, status, reason, extra = {}) => {
    lvN++
    const from = dates[0]
    const to = dates[dates.length - 1]
    leaves.push({ id: `lv${lvN}`, empId, type, from, to, half: !!extra.half, days: extra.half ? 0.5 : dates.length, reason, status, appliedAt: iso([addDays(from, extra.appliedBefore ?? -6), addDays(t, -1)].sort()[0], 10, 15), appliedBy: emp[empId].userId || 'u10', decidedBy: status === 'PENDING' ? null : 'u10', decidedAt: status === 'PENDING' ? null : iso(addDays(from, (extra.appliedBefore ?? -6) + 1), 12), remark: extra.remark || '' })
  }
  mkLeave('e7', 'EL', nextWorkdays(emp.e7, workday(emp.e7, prev, 8), 3), 'APPROVED', 'Family trip to Madurai')
  mkLeave('e14', 'SL', [workday(emp.e14, prev, 12)], 'APPROVED', 'Viral fever', { appliedBefore: 0 })
  mkLeave('e19', 'LOP', nextWorkdays(emp.e19, workday(emp.e19, prev, 15), 2), 'APPROVED', 'Village visit – leave balance exhausted')
  mkLeave('e11', 'CL', [workday(emp.e11, prev, 4)], 'APPROVED', 'Personal work')
  mkLeave('e5', 'CL', [workday(emp.e5, prev, 18)], 'APPROVED', 'Bank & RTO work')
  mkLeave('e3', 'EL', nextWorkdays(emp.e3, workday(emp.e3, cur, 3), 2), 'APPROVED', 'Kerala visit')
  mkLeave('e18', 'CL', [workday(emp.e18, cur, 9)], 'APPROVED', 'Child school annual day')
  mkLeave('e6', 'SL', [workday(emp.e6, cur, 11)], 'APPROVED', 'Dental surgery', { appliedBefore: -1 })
  mkLeave('e16', 'CL', [workday(emp.e16, cur, 6)], 'APPROVED', 'Personal work', { half: true })
  mkLeave('e9', 'EL', nextWorkdays(emp.e9, workday(emp.e9, prev, 22), 3), 'REJECTED', 'Native place visit', { remark: 'Month-end dispatch peak – please re-apply for the first week of next month' })
  // pending
  mkLeave('e5', 'CL', nextWorkdays(emp.e5, addDays(t, 3), 2), 'PENDING', 'Family function in Satara', { appliedBefore: -3 })
  mkLeave('e10', 'EL', nextWorkdays(emp.e10, addDays(t, 12), 4), 'PENDING', 'Diwali vacation – Kochi', { appliedBefore: -12 })
  mkLeave('e17', 'SL', nextWorkdays(emp.e17, addDays(t, -1), 1), 'PENDING', 'Fever – medical certificate to follow', { appliedBefore: 0 })

  const leaveCell = {}
  for (const l of leaves.filter((x) => x.status === 'APPROVED')) {
    let d = l.from
    while (d <= l.to) {
      if (!calendarCode(ctx, emp[l.empId], d)) leaveCell[`${l.empId}|${d}`] = { s: 'L', lt: l.type, half: l.half }
      d = addDays(d, 1)
    }
  }

  // ------------------------------------------------------------ attendance (previous + current month)
  const attendance = []
  for (const period of [prev, cur]) {
    for (const e of employees) {
      const sh = SHIFTS.find((s) => s.id === e.shiftId)
      const days = {}
      const r = mulberry32(e.code.charCodeAt(6) * 131 + Number(period.replace('-', '')))
      for (let d = 1; d <= monthDays(period); d++) {
        const x = dateOf(period, d)
        if (x >= t) break
        if (x < e.doj || (e.exitDate && x > e.exitDate)) continue
        const cal = calendarCode(ctx, e, x)
        const roll = r()
        if (cal) {
          // warehouse staff occasionally work a Sunday during dispatch peaks (OT)
          if (cal === 'WO' && sh.otAllowed && roll < 0.08) days[d] = { s: 'P', in: fromMin(toMin(sh.start) - 5), out: fromMin(toMin(sh.start) + 300), ot: 5, src: 'BIOMETRIC' }
          else days[d] = { s: cal, src: 'SYSTEM' }
          continue
        }
        if (leaveCell[`${e.id}|${x}`]) {
          const lc = leaveCell[`${e.id}|${x}`]
          days[d] = lc.half ? { ...lc, in: fromMin(toMin(sh.start) + 3), out: fromMin(toMin(sh.start) + 250), src: 'LEAVE' } : { ...lc, src: 'LEAVE' }
          continue
        }
        const field = e.location === 'Field'
        if (roll < (e.id === 'e15' || e.id === 'e19' ? 0.06 : 0.018)) { days[d] = { s: 'A', src: 'BIOMETRIC' }; continue }
        if (roll > 0.985) { days[d] = { s: 'HD', in: fromMin(toMin(sh.start) + 5), out: fromMin(toMin(sh.start) + 245), src: field ? 'MOBILE' : 'BIOMETRIC' }; continue }
        const lateProne = ['e8', 'e15', 'e20', 'e19', 'e13'].includes(e.id)
        const late = r() < (lateProne ? 0.24 : 0.07)
        const inM = toMin(sh.start) - 14 + Math.floor(r() * 16) + (late ? sh.graceMin + 5 + Math.floor(r() * 40) : 0)
        const early = r() < 0.04
        const ot = sh.otAllowed && r() < 0.16 ? 1 + Math.floor(r() * 3) : 0
        const outM = toMin(sh.end) + (early ? -(30 + Math.floor(r() * 60)) : Math.floor(r() * 25)) + ot * 60
        days[d] = { s: 'P', in: fromMin(inM), out: fromMin(outM), ot, src: field ? 'MOBILE' : 'BIOMETRIC' }
      }
      if (Object.keys(days).length) attendance.push({ id: `att_${e.id}_${period}`, empId: e.id, month: period, days, updatedAt: iso(addDays(t, -1), 19, 5) })
    }
  }

  // ------------------------------------------------------------ leave balances
  const curMonthNo = Number(cur.slice(5, 7))
  const leaveBalances = employees.map((e, i) => {
    const usedOf = (type) => leaves.filter((l) => l.empId === e.id && l.type === type && l.status === 'APPROVED').reduce((a, l) => a + l.days, 0)
    const earlier = (k) => Math.floor(mulberry32(i * 7 + k)() * 4)
    const newJoiner = e.doj > dateOf(cur, 1).slice(0, 4) + '-01-01'
    const factor = newJoiner ? Math.max(1, 12 - Number(e.doj.slice(5, 7)) + 1) / 12 : 1
    return {
      id: `lb_${e.id}`, empId: e.id, year: Number(cur.slice(0, 4)),
      CL: { entitled: Math.round(8 * factor), used: Math.min(Math.round(8 * factor), usedOf('CL') + (newJoiner ? 0 : earlier(1))) },
      SL: { entitled: Math.round(8 * factor), used: Math.min(Math.round(8 * factor), usedOf('SL') + (newJoiner ? 0 : earlier(2))) },
      EL: { entitled: newJoiner ? 1.5 : 1.5 * curMonthNo + Math.floor(mulberry32(i + 99)() * 10), used: usedOf('EL') + (newJoiner ? 0 : earlier(3)) },
      CO: { entitled: ['e9', 'e13', 'e15'].includes(e.id) ? 2 : 0, used: 0 },
    }
  })

  // ------------------------------------------------------------ claims
  const claimRows = [
    // [empId, type, monthOffset, day, amount, description, status, km]
    ['e5', 'FUEL', -3, 6, 4120, 'Fuel – dealer visits Nashik / Dhule', 'APPROVED', 412],
    ['e6', 'TRAVEL', -3, 12, 6850, 'Train + local travel – Ludhiana & Jalandhar dealers', 'APPROVED'],
    ['e12', 'TRAVEL', -3, 20, 2380, 'Site visit – pump installation complaint, Vapi', 'APPROVED'],
    ['e7', 'FOOD', -2, 9, 3600, 'Lodging – Coimbatore dealer meet (2 nights)', 'APPROVED'],
    ['e16', 'TRAVEL', -2, 14, 760, 'Auto & bus fare – service calls Thane', 'APPROVED'],
    ['e8', 'FUEL', -2, 21, 2950, 'Fuel – Kolkata & Howrah route', 'APPROVED', 295],
    ['e3', 'OTHER', -2, 25, 1850, 'Courier charges – samples to Rajkot vendor', 'REJECTED'],
    ['e5', 'MOBILE', -1, 3, 799, 'Postpaid mobile bill', 'APPROVED'],
    ['e10', 'MEDICAL', -1, 8, 4200, 'OPD bills – hospital receipts attached', 'APPROVED'],
    ['e19', 'FOOD', -1, 16, 980, 'Meals during overnight Surat delivery', 'APPROVED'],
    ['e5', 'FUEL', 0, 4, 3450, 'Fuel – Aurangabad, Jalna & Ahmednagar visits', 'APPROVED', 345],
    ['e12', 'TRAVEL', 0, 7, 2180, 'Cab – Pune warranty inspection', 'APPROVED'],
    ['e5', 'TRAVEL', 0, 13, 1860, 'Bus + local travel – Pune dealer onboarding', 'PENDING'],
    ['e6', 'FOOD', 0, 14, 2400, 'Hotel – Chandigarh trade fair', 'PENDING'],
    ['e16', 'TRAVEL', 0, 15, 640, 'Auto fare – Kalyan service calls', 'PENDING'],
    ['e7', 'MOBILE', 0, 16, 799, 'Postpaid mobile bill', 'PENDING'],
    ['e13', 'OTHER', 0, 10, 1250, 'Stationery & printer toner – Btali desk', 'PENDING'],
  ]
  let empClaims = claimRows.map(([empId, type, off, day, amount, description, status, km], i) => {
    const period = addMonths(cur, off)
    const date = dateOf(period, Math.min(day, monthDays(period)))
    const sub = iso(addDays(date, 1), 11)
    const hist = [{ ts: sub, text: 'Claim submitted' }]
    if (status !== 'PENDING') hist.push({ ts: iso(addDays(date, 3), 15), text: status === 'APPROVED' ? `Approved ₹${amount.toLocaleString('en-IN')} – will be paid with next salary` : 'Rejected – courier is a vendor recoverable; raise against the PO' })
    return {
      id: `ec${i + 1}`, number: `RMB-${String(i + 1).padStart(4, '0')}`, empId, type, date, amount, description, km: km || null,
      attachments: [makeAttachment(`${type === 'FUEL' ? 'Fuel-bill' : type === 'MEDICAL' ? 'Medical-receipt' : 'Receipt'}-${i + 1}.jpg`, { uploadedAt: sub })],
      status, payout: 'PAYROLL', submittedAt: sub, submittedBy: emp[empId].userId || 'u10',
      approvedBy: status === 'PENDING' ? null : empId.match(/^e[5-8]$/) ? 'u4' : 'u10', approvedAt: status === 'PENDING' ? null : iso(addDays(date, 3), 15),
      approvedAmount: status === 'APPROVED' ? amount : null, remark: status === 'REJECTED' ? 'Courier is a vendor recoverable; raise against the PO' : '', history: hist,
    }
  })

  // ------------------------------------------------------------ loans
  let empLoans = [
    { id: 'ln1', number: 'LN-001', empId: 'e15', type: 'LOAN', amount: 30000, tenure: 10, emi: 3000, reason: 'House repair after monsoon damage', startMonth: addMonths(cur, -4), status: 'ACTIVE', requestedAt: iso(dateOf(addMonths(cur, -5), 18), 11), approvedBy: 'u2', approvedAt: iso(dateOf(addMonths(cur, -5), 20), 16), disbursedAt: iso(dateOf(addMonths(cur, -5), 21), 12), repayments: [], balance: 30000, history: [{ ts: iso(dateOf(addMonths(cur, -5), 18), 11), text: 'Requested' }, { ts: iso(dateOf(addMonths(cur, -5), 20), 16), text: 'Approved & disbursed – EMI ₹3,000 × 10' }] },
    { id: 'ln2', number: 'ADV-002', empId: 'e9', type: 'ADVANCE', amount: 15000, tenure: 3, emi: 5000, reason: 'Child school admission fees', startMonth: addMonths(cur, -2), status: 'ACTIVE', requestedAt: iso(dateOf(addMonths(cur, -3), 24), 10), approvedBy: 'u2', approvedAt: iso(dateOf(addMonths(cur, -3), 25), 12), disbursedAt: iso(dateOf(addMonths(cur, -3), 25), 15), repayments: [], balance: 15000, history: [{ ts: iso(dateOf(addMonths(cur, -3), 24), 10), text: 'Requested' }, { ts: iso(dateOf(addMonths(cur, -3), 25), 12), text: 'Approved & disbursed – EMI ₹5,000 × 3' }] },
    { id: 'ln3', number: 'LN-003', empId: 'e17', type: 'LOAN', amount: 50000, tenure: 10, emi: 5000, reason: "Mother's cataract surgery", startMonth: addMonths(cur, 1), status: 'PENDING', requestedAt: iso(addDays(t, -2), 12), repayments: [], balance: 50000, history: [{ ts: iso(addDays(t, -2), 12), text: 'Requested' }] },
  ]

  // ------------------------------------------------------------ payroll runs (last 6 months, all paid)
  const payrollRuns = []
  for (let k = 6; k >= 1; k--) {
    const period = addMonths(cur, -k)
    const id = `pr_${period}`
    const state = { ...ctx, salaryStructures: STRUCTURES, attendance, leaves, empClaims, empLoans, salesOrders: core.salesOrders }
    const slips = computeRunSlips(state, period, {}, id)
    const tot = runTotals(slips)
    const created = iso(dateOf(period, monthDays(period) - 3), 11)
    const paidDate = dateOf(addMonths(period, 1), 1)
    const run = {
      id, number: `PRL/${period}`, period, periodLabel: periodLabel(period), status: 'PAID', slips, inputs: {}, ...tot,
      createdBy: 'u10', createdAt: created, submittedAt: iso(dateOf(period, monthDays(period) - 2), 12), submittedBy: 'u10',
      approvedBy: 'u2', approvedAt: iso(dateOf(period, monthDays(period) - 1), 17), paidAt: iso(paidDate, 11), paymentDate: paidDate,
      paymentRef: `HDFC-BULK-${period.replace('-', '')}${String(410 + k)}`, bankId: 'bk1', slipsEmailed: true, postedExpenses: null,
      history: [
        { ts: created, text: `Payroll computed for ${slips.length} employees`, by: 'u10' },
        { ts: iso(dateOf(period, monthDays(period) - 2), 12), text: 'Submitted to Finance Head for approval', by: 'u10' },
        { ts: iso(dateOf(period, monthDays(period) - 1), 17), text: 'Approved for release', by: 'u2' },
        { ts: iso(paidDate, 11), text: 'Salaries released via HDFC bulk transfer · payslips emailed', by: 'u10' },
      ],
    }
    const settled = settleRun(state, run, iso(paidDate, 11))
    empClaims = settled.empClaims
    empLoans = settled.empLoans
    payrollRuns.unshift(run)
  }

  // ------------------------------------------------------------ profile change requests
  const profileRequests = [
    { id: 'pcr1', number: 'PCR-001', empId: 'e5', changes: { phone: '98201 77450', address: 'Flat 304, Sai Prasad CHS, Sector 21, Kharghar, Navi Mumbai 410210' }, current: { phone: emp.e5.phone, address: emp.e5.address }, reason: 'Shifted to new flat; new number for official calls', attachments: [makeAttachment('Rent-agreement-Kharghar.pdf')], status: 'PENDING', requestedAt: iso(addDays(t, -2), 18) },
    { id: 'pcr2', number: 'PCR-002', empId: 'e14', changes: { bank: { name: 'Kotak Mahindra Bank', account: '7712045589', ifsc: 'KKBK0000646', holder: 'Pooja Sawant' } }, current: { bank: { ...emp.e14.bank } }, reason: 'Salary account moved to Kotak', attachments: [makeAttachment('Cancelled-cheque-Kotak.jpg')], status: 'PENDING', requestedAt: iso(addDays(t, -1), 10) },
    { id: 'pcr3', number: 'PCR-003', empId: 'e9', changes: { emergencyContact: 'Savita Yadav · 98694 22107' }, current: { emergencyContact: emp.e9.emergencyContact }, reason: 'Update emergency contact', attachments: [], status: 'APPROVED', requestedAt: iso(addDays(t, -30), 12), decidedBy: 'u10', decidedAt: iso(addDays(t, -29), 11), remark: '' },
  ]
  emp.e9.emergencyContact = 'Savita Yadav · 98694 22107'

  const attendanceImports = [1, 2, 3, 4, 5].map((k) => ({ id: `imp${k}`, ts: iso(addDays(t, -k), 19, 5), period: addDays(t, -k).slice(0, 7), source: 'BIOMETRIC', rows: 13, employees: 13, by: 'system' }))

  return {
    employees, shifts: SHIFTS, hrHolidays: HOLIDAYS, salaryStructures: STRUCTURES, attendance, leaves, leaveBalances,
    empClaims, empLoans, payrollRuns, profileRequests, attendanceImports, leaveCredits: [],
    biometricSync: {
      lastSync: iso(addDays(t, -1), 19, 5),
      devices: [
        { id: 'BIO-HQ-01', name: 'ZKTeco K40 – HQ reception', location: 'Navi Mumbai HQ', status: 'ONLINE', users: 10 },
        { id: 'BIO-WH-01', name: 'ZKTeco F18 – Btali gate', location: 'Btali Warehouse, Bhiwandi', status: 'ONLINE', users: 5 },
        { id: 'APP-GEO', name: 'Btali mobile app (geo check-in)', location: 'Field staff', status: 'ONLINE', users: 7 },
      ],
    },
  }
}
