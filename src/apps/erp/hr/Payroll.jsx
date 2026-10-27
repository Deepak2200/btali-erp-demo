import React, { useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import { Coins, PlayCircle, RefreshCw, Send, Check, Undo2, Banknote, Download, Mail, Trash2, ArrowLeft, Wallet, Users, Building2, Landmark, FileSpreadsheet } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Button, Modal, Drawer, Field, Input, NumberInput, Select, Switch, Checkbox, Stepper, Alert, Badge, StatusBadge, Timeline, KV, EmptyState, toast, confirm, prompt,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { BarsChart, TrendChart } from '../../../components/business'
import { fmtINR, fmtCompact, fmtDate, fmtDateTime, today, exportCSV } from '../../../lib/format'
import { currentPeriod, addMonths, periodLabel, periodShort, runTotals } from '../../../store/slices/hr'
import { EmpCell, Payslip, downloadBankAdvice, useCanSeeSalary } from './_parts'

const STEPS = [{ key: 'DRAFT', label: 'Draft & review' }, { key: 'PENDING_APPROVAL', label: 'Finance approval' }, { key: 'APPROVED', label: 'Approved' }, { key: 'PAID', label: 'Paid & payslips sent' }]
const ded = (s, code) => s.deductions.filter((d) => d.code === code).reduce((a, d) => a + d.amount, 0)

export default function Payroll() {
  const canSal = useCanSeeSalary()
  if (!canSal) return <div><PageHeader title="Payroll" /><Alert tone="warn" title="Restricted">Payroll is visible to HR, Finance Head and Director only.</Alert></div>
  return (
    <Routes>
      <Route index element={<RunList />} />
      <Route path=":id" element={<RunDetail />} />
    </Routes>
  )
}

// ====================================================================== list
function RunList() {
  const runs = useStore((s) => s.payrollRuns || [])
  const createPayrollRun = useStore((s) => s.createPayrollRun)
  const user = useUser()
  const nav = useNavigate()
  const sorted = [...runs].sort((a, b) => b.period.localeCompare(a.period))
  const cur = currentPeriod()
  const options = [addMonths(cur, 1), cur, addMonths(cur, -1)].filter((p) => !runs.some((r) => r.period === p))
  const [period, setPeriod] = useState(options.includes(cur) ? cur : options[0] || '')
  const lastPaid = sorted.find((r) => r.status === 'PAID')
  const fy = cur.slice(5) >= '04' ? `${cur.slice(0, 4)}-04` : `${Number(cur.slice(0, 4)) - 1}-04`
  const ytd = runs.filter((r) => r.period >= fy).reduce((a, r) => a + r.employerCost, 0)
  const pending = runs.find((r) => r.status === 'PENDING_APPROVAL')
  const trend = [...sorted].reverse().map((r) => ({ label: periodShort(r.period), net: Math.round(r.totalNet), statutory: Math.round(r.pf + r.esic + r.pt + r.tds + r.erPf + r.erEsic) }))
  const run = () => {
    const r = createPayrollRun(period)
    if (!r.ok) return toast.error('Cannot create run', r.error)
    toast.success(`Payroll computed – ${periodLabel(period)}`, `${r.run.slips.length} employees · net ${fmtINR(r.run.totalNet)}`)
    nav(r.run.id)
  }
  return (
    <div>
      <PageHeader title="Payroll" subtitle="Monthly salary processing with PF, ESIC, PT and TDS · approval by Finance Head before release"
        actions={user.role !== 'FINANCE_HEAD' && options.length > 0 && <>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} options={options.map((p) => ({ value: p, label: periodLabel(p) }))} />
          <Button icon={PlayCircle} disabled={!period} onClick={run}>Run payroll</Button>
        </>} />
      {pending && <Alert tone="warn" className="mb-4" title={`${pending.periodLabel} payroll is awaiting approval`} action={<Button size="sm" variant="secondary" onClick={() => nav(pending.id)}>Open</Button>}>Submitted {fmtDateTime(pending.submittedAt)} · net {fmtINR(pending.totalNet)} for {pending.headcount} employees.</Alert>}
      <Grid cols={4} className="mb-4">
        <Stat label="Last salary released" value={lastPaid ? fmtINR(lastPaid.totalNet) : '—'} sub={lastPaid ? `${lastPaid.periodLabel} · ${lastPaid.headcount} employees` : ''} icon={Banknote} tone="green" />
        <Stat label="Employer cost (last run)" value={lastPaid ? fmtINR(lastPaid.employerCost) : '—'} sub="gross + employer PF & ESIC" icon={Building2} tone="ink" />
        <Stat label="Payroll cost FY to date" value={fmtCompact(ytd)} sub={`since ${periodLabel(fy)}`} icon={Wallet} tone="brand" />
        <Stat label="Statutory dues (last run)" value={lastPaid ? fmtINR(lastPaid.pf + lastPaid.erPf + lastPaid.esic + lastPaid.erEsic + lastPaid.pt + lastPaid.tds) : '—'} sub="PF + ESIC + PT + TDS, due by 15th" icon={Landmark} tone="amber" />
      </Grid>
      <div className="grid xl:grid-cols-3 gap-4 mb-4">
        <Card className="xl:col-span-2" title="Net salary & statutory outflow"><TrendChart data={trend} series={[{ key: 'net', label: 'Net salary' }, { key: 'statutory', label: 'Statutory (EE + ER)' }]} height={230} /></Card>
        <Card title="How a run works">
          <ol className="text-sm text-slate-600 space-y-2 list-decimal pl-4">
            <li>HR runs payroll – attendance (LOP), structure, OT, incentives, approved claims and loan EMIs are pulled in.</li>
            <li>Review the sheet, adjust incentives / arrears, hold salaries if needed, then submit.</li>
            <li>Finance Head approves or sends back with remarks.</li>
            <li>Mark paid: bank advice file, salary expense posted to Accounts, payslips emailed.</li>
          </ol>
        </Card>
      </div>
      <DataTable rows={sorted} onRowClick={(r) => nav(r.id)} exportName="payroll-runs" searchable={false} columns={[
        { key: 'period', header: 'Period', render: (r) => <div><div className="font-medium text-slate-800">{r.periodLabel}</div><div className="text-[11px] text-slate-500">{r.number}</div></div> },
        { key: 'headcount', header: 'Employees', align: 'right' },
        { key: 'totalGross', header: 'Gross', align: 'right', render: (r) => fmtINR(r.totalGross) },
        { key: 'totalDeductions', header: 'Deductions', align: 'right', render: (r) => fmtINR(r.totalDeductions) },
        { key: 'totalNet', header: 'Net pay', align: 'right', render: (r) => <b>{fmtINR(r.totalNet)}</b> },
        { key: 'employerCost', header: 'Employer cost', align: 'right', render: (r) => fmtINR(r.employerCost) },
        { key: 'paidAt', header: 'Paid on', render: (r) => (r.paymentDate ? fmtDate(r.paymentDate) : '—') },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]} empty={<EmptyState icon={Coins} title="No payroll runs yet" />} />
    </div>
  )
}

// ====================================================================== detail
function RunDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useUser()
  const run = useStore((s) => (s.payrollRuns || []).find((r) => r.id === id))
  const users = useStore((s) => s.users)
  const company = useStore((s) => s.settings.company)
  const expensesExists = useStore((s) => Array.isArray(s.expenses))
  const { recomputePayrollRun, submitPayroll, approvePayroll, deletePayrollRun, markPayrollPaid, emailPayslip } = useStore()
  const [slipEmp, setSlipEmp] = useState(null)
  const [payOpen, setPayOpen] = useState(false)
  const rows = useMemo(() => run?.slips || [], [run])
  if (!run) return <EmptyState title="Payroll run not found" action={<Button onClick={() => nav('..')}>Back to payroll</Button>} />
  const tot = runTotals(run.slips)
  const isHR = ['HR', 'ADMIN'].includes(user.role)
  const isApprover = ['FINANCE_HEAD', 'ADMIN'].includes(user.role)
  const byDept = Object.values(run.slips.filter((s) => !s.hold).reduce((m, s) => { (m[s.dept] ||= { label: s.dept, gross: 0, employer: 0 }); m[s.dept].gross += s.gross; m[s.dept].employer += s.employer.pf + s.employer.esic; return m }, {})).sort((a, b) => b.gross - a.gross)
  const name = (uid) => users.find((u) => u.id === uid)?.name

  const submit = async () => {
    const lop = run.slips.filter((s) => s.lopDays > 0).length
    if (!(await confirm({ title: `Submit ${run.periodLabel} payroll?`, message: `${tot.headcount} employees · net ${fmtINR(tot.totalNet)}${lop ? `\n${lop} employee(s) have LOP deductions.` : ''}\n\nNeha Mehta (Finance Head) will be notified for approval.`, confirmText: 'Submit for approval' }))) return
    submitPayroll(run.id); toast.success('Submitted for approval', 'Finance Head notified by email')
  }
  const approve = async (ok) => {
    const remark = await prompt({ title: ok ? 'Approve payroll' : 'Send back to HR', label: ok ? 'Remarks (optional)' : 'What needs to change?', required: !ok, confirmText: ok ? 'Approve' : 'Send back', tone: ok ? undefined : 'danger' })
    if (remark == null) return
    approvePayroll(run.id, ok, remark); toast.success(ok ? 'Payroll approved' : 'Sent back to HR', ok ? 'HR and Accounts notified to release salaries' : remark)
  }
  const exportRegister = () => exportCSV(`Salary-Register-${run.period}.csv`, run.slips, [
    { header: 'Code', key: 'code' }, { header: 'Name', key: 'name' }, { header: 'Department', key: 'dept' }, { header: 'Designation', key: 'designation' },
    { header: 'Days', key: 'days' }, { header: 'Paid days', key: 'paidDays' }, { header: 'LOP', key: 'lopDays' }, { header: 'OT hrs', key: 'otHours' },
    ...['BASIC', 'HRA', 'CONV', 'MED', 'MOB', 'SPL', 'OT', 'INC', 'ARR'].map((c) => ({ header: c, value: (s) => s.earnings.find((e) => e.code === c)?.amount || 0 })),
    { header: 'Gross', key: 'gross' }, { header: 'PF', value: (s) => ded(s, 'PF') }, { header: 'ESIC', value: (s) => ded(s, 'ESIC') }, { header: 'PT', value: (s) => ded(s, 'PT') }, { header: 'TDS', value: (s) => ded(s, 'TDS') },
    { header: 'Loan/Advance', value: (s) => ded(s, 'LOAN') }, { header: 'Other', value: (s) => ded(s, 'OTH') }, { header: 'Total deductions', key: 'totalDeductions' }, { header: 'Reimbursement', key: 'reimbursement' },
    { header: 'Net pay', key: 'net' }, { header: 'Employer PF', value: (s) => s.employer.pf }, { header: 'Employer ESIC', value: (s) => s.employer.esic }, { header: 'On hold', value: (s) => (s.hold ? 'Yes' : '') },
  ])

  return (
    <div>
      <PageHeader breadcrumb={<button className="inline-flex items-center gap-1 hover:text-brand-600" onClick={() => nav('..')}><ArrowLeft className="w-3 h-3" />Payroll</button>}
        title={`Payroll – ${run.periodLabel}`} subtitle={`${run.number} · created ${fmtDateTime(run.createdAt)} by ${name(run.createdBy) || 'HR'}`}
        actions={<>
          <Button variant="secondary" icon={FileSpreadsheet} onClick={exportRegister}>Salary register</Button>
          {run.status === 'DRAFT' && isHR && <>
            <Button variant="ghost" icon={Trash2} onClick={async () => { if (await confirm({ title: 'Discard this draft?', tone: 'danger', confirmText: 'Discard' })) { deletePayrollRun(run.id); toast.success('Draft discarded'); nav('..') } }}>Discard</Button>
            <Button variant="secondary" icon={RefreshCw} onClick={() => { recomputePayrollRun(run.id); toast.success('Recalculated', 'Latest attendance, leaves, claims and loans applied') }}>Recalculate</Button>
            <Button icon={Send} onClick={submit}>Submit for approval</Button>
          </>}
          {run.status === 'PENDING_APPROVAL' && isApprover && <>
            <Button variant="secondary" icon={Undo2} onClick={() => approve(false)}>Send back</Button>
            <Button variant="success" icon={Check} onClick={() => approve(true)}>Approve</Button>
          </>}
          {(run.status === 'APPROVED' || run.status === 'PAID') && <Button variant="secondary" icon={Download} onClick={() => { downloadBankAdvice(run, company); toast.success('Bank advice downloaded', `${run.slips.filter((s) => !s.hold).length} transfers`) }}>Bank advice</Button>}
          {run.status === 'APPROVED' && (isHR || user.role === 'FINANCE_HEAD') && <Button variant="success" icon={Banknote} onClick={() => setPayOpen(true)}>Mark as paid</Button>}
          {run.status === 'PAID' && <Button variant="secondary" icon={Mail} onClick={() => { run.slips.filter((s) => !s.hold).forEach((s) => emailPayslip(run.id, s.empId)); toast.success('Payslips emailed', `${tot.headcount} employees`) }}>Re-send payslips</Button>}
        </>} />
      <Card className="mb-4"><Stepper steps={STEPS} current={run.status} /></Card>
      {run.status === 'PAID' && <Alert tone="success" className="mb-4" title={`Salaries paid on ${fmtDate(run.paymentDate)}`}>Ref {run.paymentRef || '—'} · {run.postedExpenses ? `posted to Accounts as ${run.postedExpenses.join(', ')}` : 'Accounts notified for salary JV'} · payslips {run.slipsEmailed ? 'emailed to all employees' : 'available in self-service'}.</Alert>}
      {run.status === 'DRAFT' && run.rejection && <Alert tone="error" className="mb-4" title={`Sent back by ${name(run.rejection.by)} on ${fmtDateTime(run.rejection.ts)}`}>{run.rejection.remark}</Alert>}
      {run.status === 'PENDING_APPROVAL' && !isApprover && <Alert tone="info" className="mb-4" title="Awaiting Finance Head approval">Submitted {fmtDateTime(run.submittedAt)}. You will be notified once approved.</Alert>}
      {run.status === 'DRAFT' && run.period === currentPeriod() && <Alert tone="info" className="mb-4">Attendance is considered till date; remaining days of {run.periodLabel} are treated as present. Recalculate before submitting if attendance changes.</Alert>}
      <Grid cols={5} className="mb-4">
        <Stat label="Employees" value={tot.headcount} sub={run.slips.some((s) => s.hold) ? `${run.slips.filter((s) => s.hold).length} on hold` : 'all processed'} icon={Users} tone="ink" />
        <Stat label="Gross earnings" value={fmtINR(tot.totalGross)} icon={Coins} />
        <Stat label="Deductions" value={fmtINR(tot.totalDeductions)} sub="PF, ESIC, PT, TDS, loans" icon={Landmark} tone="amber" />
        <Stat label="Net payable" value={fmtINR(tot.totalNet)} sub={tot.totalReimb ? `incl. ${fmtINR(tot.totalReimb)} reimbursements` : ''} icon={Banknote} tone="green" />
        <Stat label="Employer cost" value={fmtINR(tot.employerCost)} sub={`ER PF ${fmtCompact(tot.erPf)} · ER ESIC ${fmtCompact(tot.erEsic)}`} icon={Building2} tone="blue" />
      </Grid>

      <DataTable className="mb-4" rows={rows} rowKey="empId" onRowClick={(s) => setSlipEmp(s.empId)} pageSize={25} searchPlaceholder="Search employee…" exportName={`Payroll-review-${run.period}`}
        rowClass={(s) => (s.hold ? 'opacity-50' : '')}
        filters={[{ key: 'dept', label: 'departments', options: [...new Set(rows.map((r) => r.dept))] }]}
        columns={[
          { key: 'name', header: 'Employee', render: (s) => <div className="flex items-center gap-2"><EmpCell emp={{ name: s.name, code: s.code, designation: s.designation }} />{s.hold && <Badge tone="amber">Hold</Badge>}</div> },
          { key: 'paidDays', header: 'Paid days', align: 'right', render: (s) => <span>{s.paidDays}<span className="text-slate-400">/{s.days}</span></span> },
          { key: 'lopDays', header: 'LOP', align: 'right', render: (s) => (s.lopDays ? <span className="text-red-600 font-medium">{s.lopDays}</span> : '—') },
          { key: 'fixedGross', header: 'Fixed gross', align: 'right', render: (s) => fmtINR(s.fixedGross) },
          { key: 'var', header: 'OT / Incentive', align: 'right', value: (s) => s.otAmount + s.incentive + s.arrears, render: (s) => (s.otAmount + s.incentive + s.arrears ? fmtINR(s.otAmount + s.incentive + s.arrears) : '—') },
          { key: 'gross', header: 'Earned gross', align: 'right', render: (s) => fmtINR(s.gross) },
          { key: 'pf', header: 'PF', align: 'right', value: (s) => ded(s, 'PF'), render: (s) => fmtINR(ded(s, 'PF')) },
          { key: 'esic', header: 'ESIC', align: 'right', value: (s) => ded(s, 'ESIC'), render: (s) => (ded(s, 'ESIC') ? fmtINR(ded(s, 'ESIC')) : '—') },
          { key: 'pt', header: 'PT', align: 'right', value: (s) => ded(s, 'PT'), render: (s) => (ded(s, 'PT') ? fmtINR(ded(s, 'PT')) : '—') },
          { key: 'tds', header: 'TDS', align: 'right', value: (s) => ded(s, 'TDS'), render: (s) => (ded(s, 'TDS') ? fmtINR(ded(s, 'TDS')) : '—') },
          { key: 'loan', header: 'Loan', align: 'right', value: (s) => ded(s, 'LOAN'), render: (s) => (ded(s, 'LOAN') ? fmtINR(ded(s, 'LOAN')) : '—') },
          { key: 'reimbursement', header: 'Reimb.', align: 'right', render: (s) => (s.reimbursement ? <span className="text-emerald-700">+{fmtINR(s.reimbursement)}</span> : '—') },
          { key: 'net', header: 'Net pay', align: 'right', render: (s) => <b>{fmtINR(s.net)}</b> },
        ]}
        footer={<tr className="text-sm">
          <td className="px-3 py-2">Total ({tot.headcount})</td><td /><td /><td />
          <td className="px-3 py-2 text-right tabular-nums">{fmtINR(rows.filter((s) => !s.hold).reduce((a, s) => a + s.otAmount + s.incentive + s.arrears, 0))}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtINR(tot.totalGross)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtINR(tot.pf)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(tot.esic)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtINR(tot.pt)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(tot.tds)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtINR(rows.filter((s) => !s.hold).reduce((a, s) => a + ded(s, 'LOAN'), 0))}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtINR(tot.totalReimb)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtINR(tot.totalNet)}</td>
        </tr>} />

      <div className="grid xl:grid-cols-3 gap-4">
        <Card title="Statutory summary" subtitle="Challans due by the 15th of next month">
          <KV label="PF – employee (12%)" value={fmtINR(tot.pf)} />
          <KV label="PF – employer (12%)" value={fmtINR(tot.erPf)} />
          <KV label="ESIC – employee (0.75%)" value={fmtINR(tot.esic)} />
          <KV label="ESIC – employer (3.25%)" value={fmtINR(tot.erEsic)} />
          <KV label="Professional Tax (Maharashtra)" value={fmtINR(tot.pt)} />
          <KV label="TDS on salary (24Q)" value={fmtINR(tot.tds)} />
          <KV className="border-t border-slate-100 font-semibold" label="Total remittance" value={fmtINR(tot.pf + tot.erPf + tot.esic + tot.erEsic + tot.pt + tot.tds)} />
        </Card>
        <Card title="Cost by department"><BarsChart data={byDept} layout="vertical" height={Math.max(200, byDept.length * 34)} series={[{ key: 'gross', label: 'Gross' }, { key: 'employer', label: 'Employer PF/ESIC' }]} stacked /></Card>
        <Card title="Activity"><Timeline items={[...(run.history || [])].reverse().map((h) => ({ ...h, by: name(h.by) }))} /></Card>
      </div>

      {slipEmp && <SlipDrawer run={run} empId={slipEmp} onClose={() => setSlipEmp(null)} />}
      {payOpen && <PayModal run={run} tot={tot} expensesExists={expensesExists} onClose={() => setPayOpen(false)} onPaid={(f) => { markPayrollPaid(run.id, f); toast.success('Salaries marked paid', `${f.emailSlips ? 'Payslips emailed · ' : ''}${expensesExists ? 'Expense posted to Accounts' : 'Accounts notified'}`); setPayOpen(false) }} />}
    </div>
  )
}

function SlipDrawer({ run, empId, onClose }) {
  const slip = run.slips.find((s) => s.empId === empId)
  const { setPayrollInput, emailPayslip } = useStore()
  const user = useUser()
  const editable = run.status === 'DRAFT' && ['HR', 'ADMIN'].includes(user.role)
  const inp = run.inputs?.[empId] || {}
  const [f, setF] = useState({ incentive: inp.incentive ?? slip.incentive, arrears: inp.arrears ?? '', otherDeduction: inp.otherDeduction ?? '', otherNote: inp.otherNote ?? '' })
  if (!slip) return null
  const apply = () => { setPayrollInput(run.id, empId, f); toast.success('Salary updated', `${slip.name} recalculated`) }
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={`${slip.name} – ${run.periodLabel}`} subtitle={`${slip.code} · ${slip.structureName} structure`}
      footer={<Button variant="secondary" icon={Mail} onClick={() => { emailPayslip(run.id, empId); toast.success('Payslip emailed', slip.name) }}>Email payslip</Button>}>
      {editable && (
        <Card className="mb-4" title="Adjustments for this month">
          <div className="grid sm:grid-cols-4 gap-3">
            <Field label="Incentive (₹)" hint="auto: 0.5% of sales"><NumberInput value={f.incentive} onChange={(v) => setF({ ...f, incentive: v })} /></Field>
            <Field label="Arrears / bonus (₹)"><NumberInput value={f.arrears} onChange={(v) => setF({ ...f, arrears: v })} /></Field>
            <Field label="Other deduction (₹)"><NumberInput value={f.otherDeduction} onChange={(v) => setF({ ...f, otherDeduction: v })} /></Field>
            <Field label="Deduction note"><Input value={f.otherNote} onChange={(e) => setF({ ...f, otherNote: e.target.value })} placeholder="e.g. Uniform recovery" /></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <Switch checked={!!slip.hold} onChange={(v) => { setPayrollInput(run.id, empId, { hold: v }); toast.success(v ? 'Salary put on hold' : 'Hold released', slip.name) }} label="Hold salary this month" />
            <Button size="sm" onClick={apply}>Apply & recalculate</Button>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-center">
        {[['Present', slip.presentDays], ['Paid leave', slip.leaveDays], ['LOP', slip.lopDays], ['OT hours', slip.otHours]].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 py-2"><div className="text-lg font-bold">{v}</div><div className="text-[11px] text-slate-500">{k}</div></div>)}
      </div>
      <Payslip run={run} slip={slip} />
    </Drawer>
  )
}

function PayModal({ run, tot, expensesExists, onClose, onPaid }) {
  const [f, setF] = useState({ date: today(), paymentRef: `HDFC-BULK-${run.period.replace('-', '')}`, bankId: 'bk1', emailSlips: true })
  const banks = useStore((s) => s.bankAccounts)
  return (
    <Modal open size="sm" title={`Release salaries – ${run.periodLabel}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" icon={Banknote} disabled={!f.paymentRef} onClick={() => onPaid(f)}>Confirm payment</Button></>}>
      <div className="space-y-3">
        <div className="rounded-lg bg-emerald-50 p-3 flex justify-between"><span className="text-sm text-emerald-900">{tot.headcount} transfers</span><span className="font-bold text-emerald-900">{fmtINR(tot.totalNet)}</span></div>
        <Field label="Payment date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Debit account">
          <Select value={f.bankId} onChange={(e) => setF({ ...f, bankId: e.target.value })} options={Array.isArray(banks) && banks.length ? banks.map((b) => ({ value: b.id, label: b.name || b.bank || b.id })) : [{ value: 'bk1', label: 'HDFC Bank – Current A/c (salary)' }]} />
        </Field>
        <Field label="Bank batch / UTR reference" required><Input value={f.paymentRef} onChange={(e) => setF({ ...f, paymentRef: e.target.value })} /></Field>
        <Checkbox label="Email payslips to all employees" checked={f.emailSlips} onChange={(v) => setF({ ...f, emailSlips: v })} />
        <p className="text-xs text-slate-500">{expensesExists ? 'Salary expense and employer PF/ESIC will be posted to Accounts → Expenses.' : 'Accounts will be notified to post the salary journal.'} Approved claims are marked paid and loan EMIs recorded.</p>
      </div>
    </Modal>
  )
}
