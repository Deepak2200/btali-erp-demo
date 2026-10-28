import React, { useState } from 'react'
import { CalendarPlus, CalendarDays, X } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, EmptyState, Badge, StatusBadge, Progress, toast, prompt, confirm } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtDate, fmtDateTime, today } from '../../../lib/format'
import { LEAVE_TYPES, leaveName } from '../../../store/slices/hr'
import { useMyEmployee } from '../hr/_parts'
import LeaveForm from '../hr/_leaveForm'

const TONE = { CL: 'blue', SL: 'red', EL: 'green', CO: 'violet', LOP: 'amber' }

export default function MyLeave() {
  const me = useMyEmployee()
  const leaves = useStore((s) => (s.leaves || []).filter((l) => l.empId === me?.id))
  const bal = useStore((s) => (s.leaveBalances || []).find((b) => b.empId === me?.id))
  const holidays = useStore((s) => (s.hrHolidays || []).filter((h) => h.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6))
  const cancelLeave = useStore((s) => s.cancelLeave)
  const [apply, setApply] = useState(false)
  if (!me) return <div><PageHeader title="Apply Leave" /><EmptyState title="No employee record linked to your login" message="Please contact HR." /></div>
  const pendingDays = (code) => leaves.filter((l) => l.status === 'PENDING' && l.type === code).reduce((a, l) => a + l.days, 0)
  const cancel = async (l) => {
    if (l.status === 'PENDING') {
      if (!(await confirm({ title: 'Withdraw this leave request?', message: `${leaveName(l.type)} · ${fmtDate(l.from)}${l.to !== l.from ? ` – ${fmtDate(l.to)}` : ''}`, confirmText: 'Withdraw' }))) return
      cancelLeave(l.id, 'Withdrawn by employee')
    } else {
      const r = await prompt({ title: 'Cancel approved leave', label: 'Reason', required: true })
      if (r == null) return
      cancelLeave(l.id, r)
    }
    toast.success('Leave cancelled', 'HR has been notified')
  }
  return (
    <div>
      <PageHeader title="Apply Leave" subtitle="Your leave balances, requests and the holiday calendar" actions={<Button icon={CalendarPlus} onClick={() => setApply(true)}>Apply for leave</Button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {LEAVE_TYPES.filter((l) => l.code !== 'LOP').map((lt) => {
          const b = bal?.[lt.code] || { entitled: 0, used: 0 }
          const avail = b.entitled - b.used
          return (
            <Card key={lt.code}>
              <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{lt.name}</span><Badge tone={TONE[lt.code]}>{lt.code}</Badge></div>
              <div className="text-2xl font-bold text-ink-900 mt-1">{avail}<span className="text-sm font-normal text-slate-400"> / {b.entitled} days</span></div>
              <Progress value={b.used} max={b.entitled || 1} tone={avail <= 0 ? 'red' : 'brand'} className="mt-2" />
              <div className="text-[11px] text-slate-500 mt-1">{b.used} used{pendingDays(lt.code) ? ` · ${pendingDays(lt.code)} pending` : ''}</div>
            </Card>
          )
        })}
      </div>
      <div className="grid xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <DataTable rows={[...leaves].sort((a, b) => String(b.from).localeCompare(String(a.from)))} searchable={false} exportName="my-leaves" columns={[
            { key: 'type', header: 'Type', render: (l) => <Badge tone={TONE[l.type]}>{leaveName(l.type)}</Badge> },
            { key: 'from', header: 'Dates', render: (l) => <span className="whitespace-nowrap">{fmtDate(l.from)}{l.to !== l.from ? ` – ${fmtDate(l.to)}` : ''}{l.half ? ' (½)' : ''}</span> },
            { key: 'days', header: 'Days', align: 'right' },
            { key: 'reason', header: 'Reason', render: (l) => <div className="max-w-[220px]"><div className="truncate">{l.reason}</div><div className="text-[11px] text-slate-400">Applied {fmtDateTime(l.appliedAt)}</div>{l.remark && <div className="text-[11px] text-slate-500 truncate">HR: {l.remark}</div>}</div> },
            { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
            { key: 'act', header: '', sortable: false, render: (l) => ((l.status === 'PENDING' || (l.status === 'APPROVED' && l.from > today())) ? <Button size="sm" variant="ghost" icon={X} onClick={() => cancel(l)}>{l.status === 'PENDING' ? 'Withdraw' : 'Cancel'}</Button> : null) },
          ]} empty={<EmptyState icon={CalendarDays} title="No leave requests yet" />} />
        </div>
        <Card title="Upcoming holidays">
          <ul className="divide-y divide-slate-100">
            {holidays.map((h) => <li key={h.id} className="py-2 flex justify-between text-sm"><span>{h.name}</span><span className="text-slate-500">{fmtDate(h.date)}</span></li>)}
            {!holidays.length && <li className="text-sm text-slate-400 py-2">No upcoming holidays.</li>}
          </ul>
          <p className="text-[11px] text-slate-500 mt-3">Earned Leave accrues at 1.5 days per month. Weekly offs and holidays inside a leave period are not counted.</p>
        </Card>
      </div>
      {apply && <LeaveForm empId={me.id} onClose={() => setApply(false)} />}
    </div>
  )
}
