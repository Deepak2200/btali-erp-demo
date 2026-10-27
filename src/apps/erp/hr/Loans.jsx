import React, { useState } from 'react'
import { HandCoins, Wallet, CalendarClock, Clock, Plus, Check, X, IndianRupee, Pencil } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { PageHeader, Grid, Stat, Button, Drawer, Modal, FormGrid, Field, Input, NumberInput, Select, Textarea, Combobox, DescriptionList, Progress, StatusBadge, Badge, Timeline, Alert, toast, prompt, cx } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate } from '../../../lib/format'
import { currentPeriod, addMonths, periodLabel } from '../../../store/slices/hr'
import { EmpCell, useEmpMap, monthOptions } from './_parts'

const TYPE_LABEL = { LOAN: 'Staff loan', ADVANCE: 'Salary advance' }

export const emiSchedule = (l) => {
  const out = []
  let bal = l.amount
  const paid = [...(l.repayments || [])]
  let month = l.startMonth
  let guard = 0
  // actual repayments first (in order), then projected EMIs
  for (const r of paid) { bal -= r.amount; out.push({ month: r.month, amount: r.amount, balance: Math.max(0, bal), status: 'PAID', mode: r.mode, note: r.note }) }
  const lastPayrollMonth = paid.filter((r) => r.mode === 'PAYROLL').map((r) => r.month).sort().pop()
  if (lastPayrollMonth) month = addMonths(lastPayrollMonth, 1)
  while (bal > 0 && guard++ < 60 && l.status !== 'REJECTED') {
    const amt = Math.min(l.emi, bal)
    bal -= amt
    out.push({ month, amount: amt, balance: bal, status: 'DUE' })
    month = addMonths(month, 1)
  }
  return out
}

export default function Loans() {
  const loans = useStore((s) => s.empLoans || [])
  const empMap = useEmpMap()
  const [open, setOpen] = useState(null)
  const [form, setForm] = useState(false)
  const active = loans.filter((l) => l.status === 'ACTIVE')
  const pending = loans.filter((l) => l.status === 'PENDING')
  return (
    <div>
      <PageHeader title="Loans & Advances" subtitle="Staff loans and salary advances · EMIs are deducted automatically in payroll until settled"
        actions={<Button icon={Plus} onClick={() => setForm(true)}>New request</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Active loans / advances" value={active.length} sub={`${fmtINR(active.reduce((a, l) => a + l.amount, 0))} disbursed`} icon={HandCoins} />
        <Stat label="Outstanding balance" value={fmtINR(active.reduce((a, l) => a + l.balance, 0))} icon={Wallet} tone="amber" />
        <Stat label="Monthly EMI recovery" value={fmtINR(active.reduce((a, l) => a + Math.min(l.emi, l.balance), 0))} sub={`in ${periodLabel(currentPeriod())} payroll`} icon={CalendarClock} tone="blue" />
        <Stat label="Pending requests" value={pending.length} sub={fmtINR(pending.reduce((a, l) => a + l.amount, 0))} icon={Clock} tone="violet" />
      </Grid>
      {pending.length > 0 && <Alert tone="warn" className="mb-4" title={`${pending.length} request(s) awaiting approval`} action={<Button size="sm" variant="secondary" onClick={() => setOpen(pending[0].id)}>Review</Button>}>{pending.map((l) => `${empMap[l.empId]?.name} – ${fmtINR(l.amount)} (${l.reason})`).join(' · ')}</Alert>}
      <DataTable rows={[...loans].sort((a, b) => (b.status === 'PENDING') - (a.status === 'PENDING') || String(b.requestedAt).localeCompare(String(a.requestedAt)))} onRowClick={(l) => setOpen(l.id)} exportName="staff-loans" columns={[
        { key: 'number', header: 'Ref', render: (l) => <span className="font-mono text-xs">{l.number}</span> },
        { key: 'emp', header: 'Employee', render: (l) => <EmpCell emp={empMap[l.empId]} />, value: (l) => empMap[l.empId]?.name },
        { key: 'type', header: 'Type', render: (l) => <Badge tone={l.type === 'LOAN' ? 'ink' : 'teal'}>{TYPE_LABEL[l.type]}</Badge>, value: (l) => TYPE_LABEL[l.type] },
        { key: 'amount', header: 'Amount', align: 'right', render: (l) => fmtINR(l.amount) },
        { key: 'emi', header: 'EMI × months', align: 'right', render: (l) => `${fmtINR(l.emi)} × ${l.tenure}` },
        { key: 'startMonth', header: 'Recovery from', render: (l) => periodLabel(l.startMonth) },
        { key: 'progress', header: 'Recovered', sortable: false, render: (l) => <div className="w-32"><Progress value={l.amount - l.balance} max={l.amount} tone={l.status === 'CLOSED' ? 'green' : 'brand'} showLabel /></div> },
        { key: 'balance', header: 'Balance', align: 'right', render: (l) => <b>{fmtINR(l.balance)}</b> },
        { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
      ]} filters={[{ key: 'status', label: 'statuses', options: ['PENDING', 'ACTIVE', 'CLOSED', 'REJECTED'].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })) }, { key: 'type', label: 'types', options: [{ value: 'LOAN', label: 'Staff loan' }, { value: 'ADVANCE', label: 'Salary advance' }] }]} />
      {open && <LoanDrawer loan={loans.find((l) => l.id === open)} emp={empMap[loans.find((l) => l.id === open)?.empId]} onClose={() => setOpen(null)} />}
      {form && <LoanForm onClose={() => setForm(false)} />}
    </div>
  )
}

function LoanDrawer({ loan: l, emp, onClose }) {
  const user = useUser()
  const users = useStore((s) => s.users)
  const { approveEmpLoan, recordLoanRepayment, updateLoanEmi } = useStore()
  const [approve, setApprove] = useState(null)
  if (!l) return null
  const canApprove = ['HR', 'ADMIN', 'FINANCE_HEAD'].includes(user.role)
  const sched = emiSchedule(l)
  const reject = async () => {
    const r = await prompt({ title: `Reject ${l.number}`, label: 'Reason', required: true, tone: 'danger', confirmText: 'Reject' })
    if (r == null) return
    approveEmpLoan(l.id, false, r); toast.success('Request rejected', `${emp?.name} notified`)
  }
  const prepay = async () => {
    const v = await prompt({ title: 'Record prepayment', message: `Outstanding ${fmtINR(l.balance)}`, label: 'Amount received (₹)', required: true, multiline: false, defaultValue: String(l.balance) })
    if (v == null) return
    const n = Number(String(v).replace(/[^\d.]/g, ''))
    if (!(n > 0)) return toast.error('Enter a valid amount')
    recordLoanRepayment(l.id, n, 'Manual prepayment'); toast.success('Repayment recorded', n >= l.balance ? 'Loan closed' : `Balance ${fmtINR(l.balance - n)}`)
  }
  const reviseEmi = async () => {
    const v = await prompt({ title: 'Revise EMI', label: 'New monthly EMI (₹)', required: true, multiline: false, defaultValue: String(l.emi) })
    if (v == null) return
    const n = Number(String(v).replace(/[^\d.]/g, ''))
    if (!(n > 0)) return toast.error('Enter a valid amount')
    updateLoanEmi(l.id, n); toast.success('EMI revised', `${fmtINR(n)} from next payroll`)
  }
  return (
    <Drawer open onClose={onClose} title={`${l.number} · ${TYPE_LABEL[l.type]}`} subtitle={<span className="flex items-center gap-2">{emp?.name} · {emp?.designation} <StatusBadge status={l.status} /></span>}
      footer={<>
        {l.status === 'PENDING' && canApprove && <><Button variant="secondary" icon={X} onClick={reject}>Reject</Button><Button variant="success" icon={Check} onClick={() => setApprove({ tenure: l.tenure, startMonth: l.startMonth, ref: '' })}>Approve & disburse</Button></>}
        {l.status === 'ACTIVE' && <><Button variant="secondary" icon={Pencil} onClick={reviseEmi}>Revise EMI</Button><Button variant="secondary" icon={IndianRupee} onClick={prepay}>Record prepayment</Button></>}
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[['Amount', fmtINR(l.amount)], ['Recovered', fmtINR(l.amount - l.balance)], ['Balance', fmtINR(l.balance)]].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-lg font-bold text-ink-900">{v}</div></div>)}
        </div>
        <Progress value={l.amount - l.balance} max={l.amount} tone={l.status === 'CLOSED' ? 'green' : 'brand'} showLabel />
        <DescriptionList items={[
          ['Purpose', l.reason], ['EMI', `${fmtINR(l.emi)} × ${l.tenure} months`],
          ['Recovery from', periodLabel(l.startMonth)], ['Requested', fmtDate(l.requestedAt)],
          l.approvedBy ? ['Decided by', `${users.find((u) => u.id === l.approvedBy)?.name || '—'} · ${fmtDate(l.approvedAt)}`] : null,
          l.disbursedAt ? ['Disbursed', `${fmtDate(l.disbursedAt)}${l.disbursementRef ? ` · ${l.disbursementRef}` : ''}`] : null,
          ['Monthly net salary (last run)', <LastNet empId={l.empId} />],
        ]} />
        {l.remark && <Alert tone={l.status === 'REJECTED' ? 'error' : 'info'}>{l.remark}</Alert>}
        {l.status !== 'REJECTED' && (
          <div>
            <div className="text-[11px] uppercase tracking-wide font-medium text-slate-400 mb-2">EMI schedule</div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">#</th><th className="text-left px-3 py-2">Month</th><th className="text-right px-3 py-2">Amount</th><th className="text-right px-3 py-2">Balance after</th><th className="text-left px-3 py-2">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {sched.map((r, i) => (
                    <tr key={i} className={cx(r.status === 'PAID' && 'bg-emerald-50/40')}>
                      <td className="px-3 py-1.5 text-slate-400">{i + 1}</td><td className="px-3 py-1.5">{periodLabel(r.month)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtINR(r.amount)}</td><td className="px-3 py-1.5 text-right tabular-nums">{fmtINR(r.balance)}</td>
                      <td className="px-3 py-1.5">{r.status === 'PAID' ? <Badge tone="green">{r.mode === 'MANUAL' ? 'Prepaid' : 'Deducted in payroll'}</Badge> : <Badge tone="gray">{l.status === 'PENDING' ? 'Planned' : 'Upcoming'}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div><div className="text-[11px] uppercase tracking-wide font-medium text-slate-400 mb-2">History</div><Timeline items={[...(l.history || [])].reverse()} /></div>
      </div>
      {approve && (
        <Modal open size="sm" title={`Approve ${l.number}`} onClose={() => setApprove(null)} footer={<><Button variant="secondary" onClick={() => setApprove(null)}>Cancel</Button>
          <Button variant="success" onClick={() => { approveEmpLoan(l.id, true, '', approve); toast.success('Approved & disbursed', `EMI ${fmtINR(Math.ceil(l.amount / approve.tenure))} from ${periodLabel(approve.startMonth)}`); setApprove(null) }}>Approve</Button></>}>
          <div className="space-y-3">
            <FormGrid>
              <Field label="Tenure (months)"><NumberInput min={1} max={24} value={approve.tenure} onChange={(v) => setApprove({ ...approve, tenure: v || 1 })} /></Field>
              <Field label="Recovery from"><Select value={approve.startMonth} onChange={(e) => setApprove({ ...approve, startMonth: e.target.value })} options={monthOptions(0, 3)} /></Field>
            </FormGrid>
            <Field label="Disbursement reference"><Input value={approve.ref} onChange={(e) => setApprove({ ...approve, ref: e.target.value })} placeholder="NEFT UTR / cheque no." /></Field>
            <div className="text-sm text-slate-600">EMI: <b>{fmtINR(Math.ceil(l.amount / (approve.tenure || 1)))}</b> per month</div>
          </div>
        </Modal>
      )}
    </Drawer>
  )
}

function LastNet({ empId }) {
  const runs = useStore((s) => s.payrollRuns || [])
  const last = [...runs].filter((r) => r.status === 'PAID').sort((a, b) => b.period.localeCompare(a.period))[0]
  const sl = last?.slips.find((s) => s.empId === empId)
  return sl ? `${fmtINR(sl.net)} (${last.periodLabel})` : '—'
}

function LoanForm({ onClose }) {
  const { employees = [], requestEmpLoan } = useStore()
  const [f, setF] = useState({ empId: '', type: 'ADVANCE', amount: '', tenure: 3, startMonth: addMonths(currentPeriod(), 1), reason: '' })
  const save = () => {
    if (!f.empId || !(Number(f.amount) > 0) || !f.reason.trim()) return toast.error('Employee, amount and purpose are required')
    const l = requestEmpLoan(f)
    toast.success('Request created', `${l.number} · sent for approval`)
    onClose()
  }
  return (
    <Modal open size="md" title="New loan / advance request" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Create request</Button></>}>
      <div className="space-y-3">
        <Field label="Employee" required><Combobox value={f.empId} onChange={(v) => setF({ ...f, empId: v })} placeholder="Select employee…" options={employees.filter((e) => e.status === 'ACTIVE').map((e) => ({ value: e.id, label: e.name, sub: `${e.code} · ${e.designation}` }))} /></Field>
        <FormGrid>
          <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, tenure: e.target.value === 'ADVANCE' ? 3 : 10 })} options={[{ value: 'ADVANCE', label: 'Salary advance' }, { value: 'LOAN', label: 'Staff loan' }]} /></Field>
          <Field label="Amount (₹)" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          <Field label="Tenure (months)"><NumberInput min={1} max={24} value={f.tenure} onChange={(v) => setF({ ...f, tenure: v })} /></Field>
          <Field label="Recovery from"><Select value={f.startMonth} onChange={(e) => setF({ ...f, startMonth: e.target.value })} options={monthOptions(0, 3)} /></Field>
        </FormGrid>
        <Field label="Purpose" required><Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {f.amount > 0 && f.tenure > 0 && <div className="text-sm text-slate-600">EMI: <b>{fmtINR(Math.ceil(f.amount / f.tenure))}</b> / month</div>}
      </div>
    </Modal>
  )
}
