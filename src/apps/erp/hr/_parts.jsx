// Shared HR & Payroll UI pieces (used by hr/* and me/* pages).
import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { Avatar, Badge, cx } from '../../../components/ui'
import { PrintArea, DocHeader } from '../../../components/business'
import { fmtINR, fmtDate, exportCSV } from '../../../lib/format'
import { SALARY_ROLES, maskId, periodLabel, addMonths, currentPeriod, ATT_CODES } from '../../../store/slices/hr'

export const useCanSeeSalary = () => {
  const user = useUser()
  return !!user && SALARY_ROLES.includes(user.role)
}
export const useMyEmployee = () => {
  const user = useUser()
  return useStore((s) => (s.employees || []).find((e) => e.userId === user?.id)) || null
}
export const useEmpMap = () => {
  const employees = useStore((s) => s.employees || [])
  const map = {}
  for (const e of employees) map[e.id] = e
  return map
}

export function EmpCell({ emp, sub }) {
  if (!emp) return <span className="text-slate-400">—</span>
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar name={emp.name} size="sm" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{emp.name}</div>
        <div className="text-[11px] text-slate-500 truncate">{sub ?? `${emp.code} · ${emp.designation}`}</div>
      </div>
    </div>
  )
}

export function EmpStatus({ emp }) {
  if (!emp) return null
  if (emp.status === 'EXITED') return <Badge tone="gray" dot>Exited</Badge>
  if (emp.status === 'NOTICE') return <Badge tone="amber" dot>Notice period</Badge>
  if (emp.employmentType === 'PROBATION') return <Badge tone="blue" dot>Probation</Badge>
  return <Badge tone="green" dot>Active</Badge>
}

/** Statutory ID, masked; HR / Finance can reveal */
export function MaskedId({ value, keep = 4 }) {
  const can = useCanSeeSalary()
  const [show, setShow] = useState(false)
  if (!value) return <span className="text-slate-400">Not provided</span>
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[13px]">
      {show ? value : maskId(value, keep)}
      {can && (
        <button type="button" className="text-slate-400 hover:text-slate-700" title={show ? 'Hide' : 'Reveal'} onClick={() => setShow((v) => !v)}>
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      )}
    </span>
  )
}

export const monthOptions = (back = 12, ahead = 0) => {
  const cur = currentPeriod()
  const out = []
  for (let i = ahead; i >= -back; i--) {
    const p = addMonths(cur, i)
    out.push({ value: p, label: periodLabel(p) })
  }
  return out
}

export function AttChip({ code, small }) {
  const c = ATT_CODES[code]
  if (!c) return <span className="text-slate-300">·</span>
  return <span className={cx('inline-flex items-center justify-center rounded font-semibold', small ? 'text-[10px] w-7 h-6' : 'text-xs px-1.5 py-0.5', c.cls)}>{code}</span>
}

const inWords = (num) => {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const two = (n) => (n < 20 ? a[n] : `${b[Math.floor(n / 10)]}${n % 10 ? ` ${a[n % 10]}` : ''}`)
  const three = (n) => `${n >= 100 ? `${a[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? two(n % 100) : ''}`
  let n = Math.round(num)
  if (n === 0) return 'Zero'
  const parts = []
  const cr = Math.floor(n / 1e7); n %= 1e7
  const lk = Math.floor(n / 1e5); n %= 1e5
  const th = Math.floor(n / 1e3); n %= 1e3
  if (cr) parts.push(`${three(cr)} Crore`)
  if (lk) parts.push(`${two(lk)} Lakh`)
  if (th) parts.push(`${two(th)} Thousand`)
  if (n) parts.push(three(n))
  return parts.join(' ')
}

/** Printable payslip */
export function Payslip({ run, slip }) {
  const emp = useStore((s) => (s.employees || []).find((e) => e.id === slip.empId))
  const rows = Math.max(slip.earnings.length, slip.deductions.length)
  return (
    <PrintArea title={`Payslip ${slip.code} ${run.periodLabel}`}>
      <DocHeader title="Payslip" number={run.periodLabel} date={run.paymentDate || run.createdAt?.slice(0, 10)} right={<div className="text-xs text-slate-500 mt-1">{run.status === 'PAID' ? 'Salary credited' : 'Provisional – pending release'}</div>} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs mb-4">
        {[
          ['Employee', slip.name], ['Code', slip.code], ['Designation', slip.designation], ['Department', slip.dept],
          ['Date of joining', fmtDate(emp?.doj)], ['PAN', slip.pan || '—'], ['UAN', slip.uan || '—'], ['ESIC IP no.', slip.esicWage ? slip.esicNo : 'Not applicable'],
          ['Bank', slip.bank?.name || '—'], ['Account', slip.bank?.account ? maskId(slip.bank.account) : '—'], ['Days in month', slip.days], ['Paid days', slip.paidDays],
          ['LOP days', slip.lopDays], ['Leave days', slip.leaveDays], ['Overtime', `${slip.otHours || 0} hrs`], ['Tax regime', 'New (115BAC)'],
        ].map(([k, v]) => (
          <div key={k}><div className="text-slate-400 uppercase tracking-wide text-[10px]">{k}</div><div className="text-slate-800 font-medium">{v}</div></div>
        ))}
      </div>
      <table className="w-full text-sm border border-slate-200">
        <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
          <tr><th className="text-left px-3 py-2">Earnings</th><th className="text-right px-3 py-2">Amount</th><th className="text-left px-3 py-2 border-l border-slate-200">Deductions</th><th className="text-right px-3 py-2">Amount</th></tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => {
            const e = slip.earnings[i]
            const d = slip.deductions[i]
            return (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-1.5">{e?.name || ''}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{e ? fmtINR(e.amount) : ''}</td>
                <td className="px-3 py-1.5 border-l border-slate-200">{d?.name || ''}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{d ? fmtINR(d.amount) : ''}</td>
              </tr>
            )
          })}
          <tr className="border-t border-slate-300 font-semibold bg-slate-50">
            <td className="px-3 py-2">Gross earnings</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(slip.gross)}</td>
            <td className="px-3 py-2 border-l border-slate-200">Total deductions</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(slip.totalDeductions)}</td>
          </tr>
        </tbody>
      </table>
      {slip.reimbursement > 0 && <div className="flex justify-between text-sm px-3 py-2 border border-t-0 border-slate-200"><span>Reimbursements (non-taxable)</span><span className="tabular-nums">{fmtINR(slip.reimbursement)}</span></div>}
      <div className="flex flex-col sm:flex-row justify-between gap-2 mt-4 p-3 rounded-lg bg-ink-50">
        <div>
          <div className="text-xs text-slate-500">Net pay</div>
          <div className="text-xl font-bold text-ink-900">{fmtINR(slip.net)}</div>
          <div className="text-xs text-slate-600">Rupees {inWords(slip.net)} Only</div>
        </div>
        <div className="text-xs text-slate-500 sm:text-right">
          Employer PF: {fmtINR(slip.employer?.pf)} · Employer ESIC: {fmtINR(slip.employer?.esic)}<br />
          Cost to company this month: {fmtINR(slip.gross + (slip.employer?.pf || 0) + (slip.employer?.esic || 0))}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-4">This is a computer-generated payslip and does not require a signature. Professional Tax deducted as per Maharashtra State Tax on Professions Act; TDS estimated on projected annual income under the new tax regime.</p>
    </PrintArea>
  )
}

/** Bank advice CSV (salary transfer file) */
export const downloadBankAdvice = (run, company) => {
  const rows = run.slips.filter((s) => !s.hold && s.net > 0)
  exportCSV(`Bank-Advice-${run.period}.csv`, rows, [
    { header: 'Sr', value: (r) => rows.indexOf(r) + 1 },
    { header: 'Employee Code', key: 'code' },
    { header: 'Beneficiary Name', value: (r) => r.bank?.holder || r.name },
    { header: 'Bank', value: (r) => r.bank?.name || '' },
    { header: 'Account Number', value: (r) => (r.bank?.account ? `'${r.bank.account}` : '') },
    { header: 'IFSC', value: (r) => r.bank?.ifsc || '' },
    { header: 'Amount', value: (r) => Math.round(r.net) },
    { header: 'Mode', value: (r) => (r.bank?.ifsc?.startsWith('HDFC') ? 'IFT' : 'NEFT') },
    { header: 'Narration', value: () => `Salary ${run.periodLabel} – ${company?.name || 'Btali International'}` },
  ])
}
