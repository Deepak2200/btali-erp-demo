import React, { useState } from 'react'
import { Clock, CheckCircle2, Banknote, Plus, Check, X, Wallet } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { PageHeader, Grid, Stat, Button, Drawer, Tabs, DescriptionList, AttachmentList, Timeline, StatusBadge, Badge, Field, NumberInput, Alert, toast, prompt } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { DonutChart } from '../../../components/business'
import { fmtINR, fmtDate, fmtDateTime } from '../../../lib/format'
import { CLAIM_TYPES, claimTypeLabel, currentPeriod, DEPARTMENTS } from '../../../store/slices/hr'
import { EmpCell, useEmpMap } from './_parts'
import ClaimForm from './_claimForm'

export default function Claims() {
  const claims = useStore((s) => s.empClaims || [])
  const empMap = useEmpMap()
  const [tab, setTab] = useState('PENDING')
  const [open, setOpen] = useState(null)
  const [form, setForm] = useState(false)
  const amt = (c) => c.approvedAmount ?? c.amount
  const sumOf = (list) => list.reduce((a, c) => a + amt(c), 0)
  const pending = claims.filter((c) => c.status === 'PENDING')
  const approved = claims.filter((c) => c.status === 'APPROVED')
  const cur = currentPeriod()
  const paidMonth = claims.filter((c) => c.status === 'PAID' && (c.paidAt || '').startsWith(cur))
  const rows = tab === 'ALL' ? claims : claims.filter((c) => c.status === tab)
  const byType = CLAIM_TYPES.map((t) => ({ name: t.label, value: sumOf(claims.filter((c) => c.type === t.value && (c.status === 'PAID' || c.status === 'APPROVED'))) })).filter((x) => x.value > 0)

  return (
    <div>
      <PageHeader title="Reimbursements" subtitle="Travel, fuel, medical and other employee claims · approved claims are paid with the next salary or released by Accounts"
        actions={<Button icon={Plus} onClick={() => setForm(true)}>New claim</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Pending approval" value={pending.length} sub={fmtINR(sumOf(pending))} icon={Clock} tone="amber" onClick={() => setTab('PENDING')} />
        <Stat label="Approved – next payroll" value={approved.length} sub={fmtINR(sumOf(approved))} icon={CheckCircle2} tone="blue" onClick={() => setTab('APPROVED')} />
        <Stat label="Paid this month" value={fmtINR(sumOf(paidMonth))} sub={`${paidMonth.length} claims`} icon={Banknote} tone="green" onClick={() => setTab('PAID')} />
        <Stat label="Total reimbursed" value={fmtINR(sumOf(claims.filter((c) => c.status === 'PAID')))} sub="all time" icon={Wallet} tone="ink" />
      </Grid>
      <div className="grid xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3">
          <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[
            { key: 'PENDING', label: 'Pending', count: pending.length }, { key: 'APPROVED', label: 'Approved', count: approved.length },
            { key: 'PAID', label: 'Paid' }, { key: 'REJECTED', label: 'Rejected' }, { key: 'ALL', label: 'All' },
          ]} />
          <DataTable rows={rows} onRowClick={(c) => setOpen(c.id)} exportName="reimbursements" initialSort={{ key: 'date', dir: 'desc' }} columns={[
            { key: 'number', header: 'Claim', render: (c) => <span className="font-mono text-xs">{c.number}</span> },
            { key: 'emp', header: 'Employee', render: (c) => <EmpCell emp={empMap[c.empId]} />, value: (c) => empMap[c.empId]?.name },
            { key: 'type', header: 'Type', render: (c) => claimTypeLabel(c.type) },
            { key: 'date', header: 'Date', render: (c) => <span className="whitespace-nowrap">{fmtDate(c.date)}</span> },
            { key: 'description', header: 'Description', className: 'max-w-[220px] truncate' },
            { key: 'att', header: 'Bills', align: 'center', value: (c) => (c.attachments || []).length },
            { key: 'amount', header: 'Amount', align: 'right', render: (c) => <span>{fmtINR(c.amount)}{c.approvedAmount != null && c.approvedAmount !== c.amount && <div className="text-[11px] text-emerald-700">approved {fmtINR(c.approvedAmount)}</div>}</span> },
            { key: 'status', header: 'Status', render: (c) => <div className="flex gap-1 items-center"><StatusBadge status={c.status} />{c.status === 'PAID' && <Badge tone="gray">{c.payout === 'ACCOUNTS' ? 'Accounts' : 'Payroll'}</Badge>}</div> },
          ]} filters={[
            { key: 'type', label: 'types', options: CLAIM_TYPES },
            { key: 'dept', label: 'departments', options: DEPARTMENTS, value: (c) => empMap[c.empId]?.dept },
          ]} />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4 h-fit">
          <div className="text-sm font-semibold mb-2">Spend by category</div>
          <DonutChart data={byType} height={180} />
        </div>
      </div>
      {open && <ClaimDrawer claim={claims.find((c) => c.id === open)} emp={empMap[claims.find((c) => c.id === open)?.empId]} onClose={() => setOpen(null)} />}
      {form && <ClaimForm onClose={() => setForm(false)} />}
    </div>
  )
}

function ClaimDrawer({ claim: c, emp, onClose }) {
  const user = useUser()
  const users = useStore((s) => s.users)
  const { approveEmpClaim, payEmpClaimNow } = useStore()
  const [approvedAmt, setApprovedAmt] = useState(c?.amount)
  if (!c) return null
  const canDecide = ['HR', 'ADMIN', 'FINANCE_HEAD'].includes(user.role) || (emp?.managerId && emp.managerId === useStore.getState().employees.find((e) => e.userId === user.id)?.id)
  const reject = async () => {
    const r = await prompt({ title: `Reject ${c.number}`, label: 'Reason (shared with employee)', required: true, tone: 'danger', confirmText: 'Reject' })
    if (r == null) return
    approveEmpClaim(c.id, false, r); toast.success('Claim rejected', `${emp?.name} notified`)
  }
  const approve = async () => {
    const r = await prompt({ title: `Approve ${c.number}`, label: 'Remarks (optional)', confirmText: 'Approve' })
    if (r == null) return
    approveEmpClaim(c.id, true, r, approvedAmt); toast.success('Claim approved', `${fmtINR(approvedAmt)} will be paid with the next salary`)
  }
  const payNow = async () => {
    const ref = await prompt({ title: 'Pay now via Accounts', message: `${fmtINR(c.approvedAmount ?? c.amount)} to ${emp?.name} (${emp?.bank?.name || 'salary account'}). It will be excluded from payroll.`, label: 'Payment reference (UTR / voucher no.)', required: true, multiline: false, confirmText: 'Record payment' })
    if (ref == null) return
    payEmpClaimNow(c.id, { paymentRef: ref }); toast.success('Claim paid', 'Posted to Accounts and employee notified')
  }
  const name = (id) => users.find((u) => u.id === id)?.name
  return (
    <Drawer open onClose={onClose} title={`${c.number} · ${claimTypeLabel(c.type)}`} subtitle={<span className="flex items-center gap-2">{emp?.name} · {emp?.code} <StatusBadge status={c.status} /></span>}
      footer={<>
        {c.status === 'PENDING' && canDecide && <><Button variant="secondary" icon={X} onClick={reject}>Reject</Button><Button variant="success" icon={Check} onClick={approve}>Approve</Button></>}
        {c.status === 'APPROVED' && <Button variant="secondary" icon={Banknote} onClick={payNow}>Pay now via Accounts</Button>}
      </>}>
      <div className="space-y-5">
        <div className="flex items-end justify-between">
          <div><div className="text-xs text-slate-500">Claimed</div><div className="text-2xl font-bold text-ink-900">{fmtINR(c.amount)}</div></div>
          {c.approvedAmount != null && <div className="text-right"><div className="text-xs text-slate-500">Approved</div><div className="text-xl font-bold text-emerald-700">{fmtINR(c.approvedAmount)}</div></div>}
        </div>
        <DescriptionList items={[
          ['Expense date', fmtDate(c.date)], ['Category', claimTypeLabel(c.type)],
          ['Department', emp?.dept], ['Reporting manager', useStore.getState().employees.find((e) => e.id === emp?.managerId)?.name || '—'],
          c.km ? ['Distance', `${c.km} km`] : null, ['Submitted', fmtDateTime(c.submittedAt)],
          c.approvedBy ? ['Decided by', `${name(c.approvedBy) || '—'} · ${fmtDateTime(c.approvedAt)}`] : null,
          c.paidAt ? ['Paid', `${fmtDateTime(c.paidAt)} via ${c.payout === 'ACCOUNTS' ? 'Accounts' : 'payroll'}${c.paymentRef ? ` (${c.paymentRef})` : ''}`] : null,
        ]} />
        <div><div className="text-[11px] uppercase tracking-wide font-medium text-slate-400 mb-1">Description</div><p className="text-sm text-slate-800">{c.description}</p></div>
        {c.remark && <Alert tone={c.status === 'REJECTED' ? 'error' : 'info'}>{c.remark}</Alert>}
        {c.status === 'PENDING' && canDecide && <Field label="Approve amount (₹)" hint="Reduce if part of the bill is not reimbursable"><NumberInput value={approvedAmt} max={c.amount} onChange={setApprovedAmt} /></Field>}
        {c.status === 'APPROVED' && <Alert tone="info">This claim will be added as a non-taxable reimbursement in the next payroll run unless paid now via Accounts.</Alert>}
        <div><div className="text-[11px] uppercase tracking-wide font-medium text-slate-400 mb-1">Receipts</div><AttachmentList items={c.attachments || []} empty="No receipts attached." /></div>
        <div><div className="text-[11px] uppercase tracking-wide font-medium text-slate-400 mb-2">History</div><Timeline items={[...(c.history || [])].reverse()} /></div>
      </div>
    </Drawer>
  )
}
