import React, { useMemo, useState } from 'react'
import { CalendarPlus, Clock, Plane, CalendarDays, Ban, Check, X, ChevronLeft, ChevronRight, SlidersHorizontal, CalendarCheck } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, Modal, Tabs, FormGrid, Field, NumberInput, Select, Input, Badge, StatusBadge, IconButton, toast, prompt, confirm, cx } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtDate, fmtDateTime, today, exportCSV } from '../../../lib/format'
import { LEAVE_TYPES, leaveName, currentPeriod, addMonths, monthDays, dateOf, dow, periodLabel, holidayOn, datesBetween, DEPARTMENTS } from '../../../store/slices/hr'
import { EmpCell, useEmpMap, monthOptions } from './_parts'
import LeaveForm from './_leaveForm'

const TYPE_TONE = { CL: 'blue', SL: 'red', EL: 'green', CO: 'violet', LOP: 'amber' }

export default function Leaves() {
  const leaves = useStore((s) => s.leaves || [])
  const employees = useStore((s) => s.employees || [])
  const leaveCredits = useStore((s) => s.leaveCredits || [])
  const { approveLeave, cancelLeave, creditMonthlyEL } = useStore()
  const empMap = useEmpMap()
  const [tab, setTab] = useState('requests')
  const [apply, setApply] = useState(false)
  const t = today()
  const pending = leaves.filter((l) => l.status === 'PENDING')
  const onLeaveToday = leaves.filter((l) => l.status === 'APPROVED' && l.from <= t && l.to >= t)
  const cur = currentPeriod()
  const monthApproved = leaves.filter((l) => l.status === 'APPROVED' && (l.from.startsWith(cur) || l.to.startsWith(cur)))

  const decide = async (l, ok) => {
    let remark = ''
    if (!ok) { remark = await prompt({ title: 'Reject leave', label: 'Reason (shared with employee)', required: true }); if (remark == null) return }
    approveLeave(l.id, ok, remark)
    toast.success(ok ? 'Leave approved' : 'Leave rejected', `${empMap[l.empId]?.name} notified by email${ok ? ' · balance & attendance updated' : ''}`)
  }
  const sorted = useMemo(() => [...leaves].sort((a, b) => (b.status === 'PENDING') - (a.status === 'PENDING') || String(b.appliedAt).localeCompare(String(a.appliedAt))), [leaves])

  return (
    <div>
      <PageHeader title="Leave Management" subtitle="Requests, approvals, balances and the team leave calendar"
        actions={<>
          <Button variant="secondary" icon={CalendarCheck} disabled={leaveCredits.includes(cur)} onClick={async () => {
            if (!(await confirm({ title: `Credit Earned Leave for ${periodLabel(cur)}?`, message: '1.5 days of EL will be credited to every active employee.' }))) return
            const n = creditMonthlyEL(); toast.success('Earned leave credited', `${n} employees · +1.5 EL`)
          }}>{leaveCredits.includes(cur) ? 'EL credited' : 'Credit monthly EL'}</Button>
          <Button icon={CalendarPlus} onClick={() => setApply(true)}>Apply on behalf</Button>
        </>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Pending approval" value={pending.length} sub={`${pending.reduce((a, l) => a + l.days, 0)} day(s) requested`} icon={Clock} tone="amber" onClick={() => setTab('requests')} />
        <Stat label="On leave today" value={onLeaveToday.length} sub={onLeaveToday.map((l) => empMap[l.empId]?.name.split(' ')[0]).join(', ') || 'Full strength'} icon={Plane} tone="blue" />
        <Stat label={`Leave days – ${periodLabel(cur)}`} value={monthApproved.reduce((a, l) => a + l.days, 0)} sub={`${monthApproved.length} approved requests`} icon={CalendarDays} tone="green" onClick={() => setTab('summary')} />
        <Stat label="Unpaid (LOP) days" value={monthApproved.filter((l) => l.type === 'LOP').reduce((a, l) => a + l.days, 0)} sub="flow into payroll" icon={Ban} tone="red" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { key: 'requests', label: 'Requests', count: pending.length }, { key: 'balances', label: 'Balances' }, { key: 'calendar', label: 'Leave calendar' }, { key: 'summary', label: 'Monthly summary' },
      ]} />
      {tab === 'requests' && (
        <DataTable rows={sorted} exportName="leave-requests" searchPlaceholder="Search employee or reason…" columns={[
          { key: 'emp', header: 'Employee', render: (l) => <EmpCell emp={empMap[l.empId]} />, value: (l) => empMap[l.empId]?.name },
          { key: 'type', header: 'Type', render: (l) => <Badge tone={TYPE_TONE[l.type]}>{leaveName(l.type)}</Badge>, value: (l) => leaveName(l.type) },
          { key: 'from', header: 'Dates', render: (l) => <div className="whitespace-nowrap">{fmtDate(l.from)}{l.to !== l.from ? ` – ${fmtDate(l.to)}` : ''}{l.half ? ' (½)' : ''}<div className="text-[11px] text-slate-400">Applied {fmtDateTime(l.appliedAt)}{l.onBehalf ? ' · by HR' : ''}</div></div>, value: (l) => l.from },
          { key: 'days', header: 'Days', align: 'right' },
          { key: 'reason', header: 'Reason', className: 'max-w-[200px]', render: (l) => <div className="truncate" title={l.reason}>{l.reason}{l.remark && <div className="text-[11px] text-slate-400 truncate">HR: {l.remark}</div>}</div> },
          { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
          { key: 'act', header: '', sortable: false, render: (l) => (
            <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
              {l.status === 'PENDING' && <><Button size="sm" variant="success" icon={Check} onClick={() => decide(l, true)}>Approve</Button><Button size="sm" variant="secondary" icon={X} onClick={() => decide(l, false)}>Reject</Button></>}
              {l.status === 'APPROVED' && l.to >= t && <Button size="sm" variant="ghost" onClick={async () => {
                const r = await prompt({ title: 'Cancel approved leave', label: 'Reason', required: true }); if (r == null) return
                cancelLeave(l.id, r); toast.success('Leave cancelled', 'Balance restored and attendance cleared')
              }}>Cancel</Button>}
            </div>
          ) },
        ]} filters={[
          { key: 'status', label: 'statuses', options: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })) },
          { key: 'type', label: 'types', options: LEAVE_TYPES.map((l) => ({ value: l.code, label: l.name })) },
          { key: 'dept', label: 'departments', options: DEPARTMENTS, value: (l) => empMap[l.empId]?.dept },
        ]} />
      )}
      {tab === 'balances' && <Balances employees={employees} />}
      {tab === 'calendar' && <LeaveCalendar leaves={leaves} empMap={empMap} />}
      {tab === 'summary' && <Summary leaves={leaves} employees={employees} />}
      {apply && <LeaveForm onBehalf onClose={() => setApply(false)} />}
    </div>
  )
}

function Balances({ employees }) {
  const balances = useStore((s) => s.leaveBalances || [])
  const leaves = useStore((s) => s.leaves || [])
  const [adj, setAdj] = useState(null)
  const adjust = useStore((s) => s.adjustLeaveBalance)
  const rows = employees.filter((e) => e.status !== 'EXITED').map((e) => ({ ...e, bal: balances.find((b) => b.empId === e.id) || {} }))
  const cell = (b, code) => {
    const x = b[code]
    if (!x) return '—'
    const av = x.entitled - x.used
    return <span className={cx('tabular-nums', av <= 0 && x.entitled > 0 && 'text-red-600')}><b>{av}</b><span className="text-slate-400"> / {x.entitled}</span></span>
  }
  return (
    <>
      <DataTable rows={rows} exportName="leave-balances" pageSize={15} columns={[
        { key: 'name', header: 'Employee', render: (e) => <EmpCell emp={e} />, value: (e) => e.name },
        { key: 'dept', header: 'Department' },
        ...LEAVE_TYPES.filter((l) => l.code !== 'LOP').map((l) => ({ key: l.code, header: `${l.code} avail / total`, align: 'right', render: (e) => cell(e.bal, l.code), value: (e) => (e.bal[l.code] ? e.bal[l.code].entitled - e.bal[l.code].used : 0) })),
        { key: 'pending', header: 'Pending', align: 'right', value: (e) => leaves.filter((l) => l.empId === e.id && l.status === 'PENDING').reduce((a, l) => a + l.days, 0) },
        { key: 'act', header: '', sortable: false, render: (e) => <IconButton icon={SlidersHorizontal} title="Adjust balance" onClick={() => setAdj({ emp: e, type: 'EL', delta: 1, note: '' })} /> },
      ]} filters={[{ key: 'dept', label: 'departments', options: DEPARTMENTS }]} />
      {adj && (
        <Modal open size="sm" title={`Adjust leave – ${adj.emp.name}`} onClose={() => setAdj(null)} footer={<><Button variant="secondary" onClick={() => setAdj(null)}>Cancel</Button>
          <Button disabled={!adj.delta || !adj.note.trim()} onClick={() => { adjust(adj.emp.id, adj.type, Number(adj.delta), adj.note); toast.success('Balance adjusted', `${adj.type} ${adj.delta > 0 ? '+' : ''}${adj.delta}`); setAdj(null) }}>Save</Button></>}>
          <div className="space-y-3">
            <FormGrid>
              <Field label="Leave type"><Select value={adj.type} onChange={(e) => setAdj({ ...adj, type: e.target.value })} options={LEAVE_TYPES.filter((l) => l.code !== 'LOP').map((l) => ({ value: l.code, label: l.name }))} /></Field>
              <Field label="Days (+ credit / − debit)"><NumberInput step="0.5" value={adj.delta} onChange={(v) => setAdj({ ...adj, delta: v })} /></Field>
            </FormGrid>
            <Field label="Reason" required><Input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="e.g. Comp-off for Sunday stock audit" /></Field>
          </div>
        </Modal>
      )}
    </>
  )
}

function LeaveCalendar({ leaves, empMap }) {
  const state = useStore()
  const [period, setPeriod] = useState(currentPeriod())
  const days = monthDays(period)
  const first = dow(dateOf(period, 1))
  const t = today()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => dateOf(period, i + 1))]
  const on = (d) => leaves.filter((l) => (l.status === 'APPROVED' || l.status === 'PENDING') && l.from <= d && l.to >= d)
  return (
    <Card title={periodLabel(period)} actions={<div className="flex gap-1"><IconButton icon={ChevronLeft} title="Previous month" onClick={() => setPeriod(addMonths(period, -1))} /><Button size="sm" variant="secondary" onClick={() => setPeriod(currentPeriod())}>Today</Button><IconButton icon={ChevronRight} title="Next month" onClick={() => setPeriod(addMonths(period, 1))} /></div>}>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-1 min-w-[640px]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="text-[11px] font-semibold uppercase text-slate-400 px-1">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const h = holidayOn(state, d)
            const list = on(d)
            return (
              <div key={d} className={cx('min-h-[92px] rounded-lg border p-1.5', d === t ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200', (dow(d) === 0) && 'bg-slate-50')}>
                <div className="flex justify-between items-center"><span className={cx('text-xs font-semibold', d === t ? 'text-brand-700' : 'text-slate-600')}>{Number(d.slice(8))}</span>{list.length > 0 && <span className="text-[10px] text-slate-400">{list.length}</span>}</div>
                {h && <div className="text-[10px] mt-0.5 px-1 py-0.5 rounded bg-violet-100 text-violet-700 truncate">{h.name}</div>}
                {list.slice(0, 3).map((l) => (
                  <div key={l.id} title={`${empMap[l.empId]?.name} · ${leaveName(l.type)}${l.status === 'PENDING' ? ' (pending)' : ''}`}
                    className={cx('text-[10px] mt-0.5 px-1 py-0.5 rounded truncate', l.status === 'PENDING' ? 'border border-dashed border-amber-400 text-amber-800' : { CL: 'bg-sky-100 text-sky-800', SL: 'bg-red-100 text-red-700', EL: 'bg-emerald-100 text-emerald-800', CO: 'bg-violet-100 text-violet-700', LOP: 'bg-amber-100 text-amber-800' }[l.type])}>
                    {empMap[l.empId]?.name.split(' ')[0]} · {l.type}
                  </div>
                ))}
                {list.length > 3 && <div className="text-[10px] text-slate-500 mt-0.5">+{list.length - 3} more</div>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 mt-3">
        {LEAVE_TYPES.map((l) => <span key={l.code} className="inline-flex items-center gap-1"><Badge tone={TYPE_TONE[l.code]}>{l.code}</Badge>{l.name}</span>)}
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 border border-dashed border-amber-400 rounded" />Pending</span>
      </div>
    </Card>
  )
}

function Summary({ leaves, employees }) {
  const [period, setPeriod] = useState(currentPeriod())
  const end = dateOf(period, monthDays(period))
  const start = dateOf(period, 1)
  const rows = employees.filter((e) => e.doj <= end && (!e.exitDate || e.exitDate >= start)).map((e) => {
    const r = { id: e.id, emp: e, total: 0 }
    for (const lt of LEAVE_TYPES) r[lt.code] = 0
    for (const l of leaves.filter((x) => x.empId === e.id && x.status === 'APPROVED')) {
      const inMonth = l.half ? (l.from.startsWith(period) ? 0.5 : 0) : datesBetween(l.from, l.to).filter((d) => d.startsWith(period)).length
      if (!inMonth) continue
      const share = l.half ? 0.5 : Math.min(inMonth, l.days)
      r[l.type] += share
      r.total += share
    }
    return r
  })
  const exportIt = () => exportCSV(`Leave-summary-${period}.csv`, rows, [{ header: 'Code', value: (r) => r.emp.code }, { header: 'Name', value: (r) => r.emp.name }, { header: 'Department', value: (r) => r.emp.dept }, ...LEAVE_TYPES.map((l) => ({ header: l.code, key: l.code })), { header: 'Total', key: 'total' }])
  return (
    <DataTable rows={rows} pageSize={15} toolbar={<><Select value={period} onChange={(e) => setPeriod(e.target.value)} options={monthOptions(12, 1)} /><Button size="sm" variant="secondary" onClick={exportIt}>Export CSV</Button></>}
      initialSort={{ key: 'total', dir: 'desc' }} columns={[
        { key: 'emp', header: 'Employee', render: (r) => <EmpCell emp={r.emp} />, value: (r) => r.emp.name },
        { key: 'dept', header: 'Department', value: (r) => r.emp.dept },
        ...LEAVE_TYPES.map((l) => ({ key: l.code, header: l.code, align: 'right', render: (r) => (r[l.code] ? r[l.code] : <span className="text-slate-300">0</span>) })),
        { key: 'total', header: 'Total', align: 'right', render: (r) => <b>{r.total}</b> },
      ]} />
  )
}
