import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, CheckCircle2, RotateCcw, Pencil, Trash2, Phone, MapPin, CalendarClock, AlertTriangle, ListTodo, Users, Activity, Sun } from 'lucide-react'
import { useStore } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Segmented, Button, IconButton, Badge, StatusBadge, Kanban, Progress, Avatar, toast, confirm, prompt, EmptyState, Select, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PartnerCell } from '../../../components/business'
import { fmtDate, today, addDays, daysAgo, daysBetween, fmtPct } from '../../../lib/format'
import { useScope, ScopeToggle, TaskModal, TASK_TYPES, taskTypeLabel, SALES_PEOPLE } from './_shared'

const TYPE_TONE = { VISIT: 'brand', FOLLOW_UP: 'blue', COLLECTION: 'green', CALL: 'violet', DEMO: 'teal' }
const PRI_TONE = { HIGH: 'red', MEDIUM: 'amber', LOW: 'gray' }
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const bucket = (t) => (t.status === 'DONE' ? 'DONE' : t.dueDate < today() ? 'OVERDUE' : t.dueDate === today() ? 'TODAY' : 'UPCOMING')

export default function Tasks() {
  const state = useStore()
  const scope = useScope()
  const completeTask = useStore((s) => s.completeTask)
  const reopenTask = useStore((s) => s.reopenTask)
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const user = scope.user
  const [view, setView] = useState(scope.isExec ? 'day' : 'list')
  const [modal, setModal] = useState(null)
  const [assignee, setAssignee] = useState('')

  const all = state.tasks || []
  const tasks = useMemo(() => all.filter(scope.isOwnTask).filter((t) => !assignee || t.assigneeId === assignee), [all, scope.mine, assignee]) // eslint-disable-line
  const open = tasks.filter((t) => t.status === 'OPEN')
  const overdue = open.filter((t) => t.dueDate < today())
  const dueToday = open.filter((t) => t.dueDate === today())
  const done30 = tasks.filter((t) => t.status === 'DONE' && (t.completedAt || '').slice(0, 10) >= daysAgo(30))
  const due30 = tasks.filter((t) => t.dueDate >= daysAgo(30) && t.dueDate <= today())
  const completion = due30.length ? (due30.filter((t) => t.status === 'DONE').length / due30.length) * 100 : 0

  const markDone = async (t) => {
    const outcome = await prompt({ title: `Complete: ${t.title}`, label: 'Outcome', placeholder: 'e.g. Met owner, order of 20 pumps expected Friday', required: true, confirmText: 'Mark done' })
    if (!outcome) return
    completeTask(t.id, outcome)
    toast.success('Task completed', outcome)
  }
  const remove = async (t) => {
    if (!(await confirm({ title: 'Delete task?', message: t.title, tone: 'danger', confirmText: 'Delete' }))) return
    deleteTask(t.id)
    toast.success('Task deleted')
  }
  const reopen = (t) => { reopenTask(t.id); toast.info('Task reopened') }
  const name = (id) => state.users.find((u) => u.id === id)?.name || '—'
  const partner = (id) => state.partners.find((p) => p.id === id)
  const so = (id) => state.salesOrders.find((s) => s.id === id)

  const Actions = ({ t }) => (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {t.status === 'OPEN' ? <Button size="sm" variant="soft" icon={CheckCircle2} onClick={() => markDone(t)}>Done</Button> : <IconButton icon={RotateCcw} title="Reopen" onClick={() => reopen(t)} />}
      <IconButton icon={Pencil} title="Edit" onClick={() => setModal({ task: t })} />
      {(scope.canManage || t.createdBy === user?.id) && <IconButton icon={Trash2} tone="danger" title="Delete" onClick={() => remove(t)} />}
    </div>
  )

  const TaskCard = ({ t, big }) => {
    const p = partner(t.partnerId)
    const b = bucket(t)
    return (
      <div className={cx('min-w-0', big && 'bg-white rounded-xl border shadow-card p-4', big && (b === 'OVERDUE' ? 'border-red-200' : 'border-slate-200'))}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cx('font-medium text-slate-800', big ? 'text-base' : 'text-sm', t.status === 'DONE' && 'line-through text-slate-400')}>{t.title}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge tone={TYPE_TONE[t.type]}>{taskTypeLabel(t.type)}</Badge>
              <Badge tone={PRI_TONE[t.priority]}>{t.priority?.toLowerCase()}</Badge>
              <span className={cx('text-[11px]', b === 'OVERDUE' ? 'text-red-600 font-semibold' : 'text-slate-500')}>{b === 'OVERDUE' ? `Overdue ${daysBetween(t.dueDate, today())}d` : b === 'DONE' ? `Done ${fmtDate(t.completedAt)}` : `Due ${fmtDate(t.dueDate)}`}</span>
            </div>
          </div>
        </div>
        {p && <div className="mt-2 text-xs text-slate-600"><Link className="font-medium text-brand-700 hover:underline" to={`/erp/sales/dealers/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.name}</Link> · {p.city}{t.soId && so(t.soId) ? <> · <Link className="hover:underline" to={`/erp/sales/orders/${t.soId}`}>{so(t.soId).number}</Link></> : null}</div>}
        {t.outcome && <div className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">{t.outcome}</div>}
        {!scope.isExec && !big && <div className="mt-1.5 text-[11px] text-slate-400">{name(t.assigneeId)}</div>}
        {big && (
          <div className="flex flex-wrap gap-2 mt-3">
            {t.status === 'OPEN' ? <Button className="flex-1" icon={CheckCircle2} onClick={() => markDone(t)}>Mark done</Button> : <Button variant="secondary" className="flex-1" icon={RotateCcw} onClick={() => reopen(t)}>Reopen</Button>}
            {p?.phone && <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="inline-flex items-center justify-center gap-1.5 rounded-lg text-sm px-3.5 py-2 border border-slate-300 bg-white text-slate-700"><Phone className="w-4 h-4" />Call</a>}
            {p && <a href={`https://www.google.com/maps/search/${encodeURIComponent(`${p.address || ''} ${p.city}`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg text-sm px-3.5 py-2 border border-slate-300 bg-white text-slate-700"><MapPin className="w-4 h-4" />Map</a>}
            <IconButton icon={Pencil} title="Edit" onClick={() => setModal({ task: t })} />
          </div>
        )}
      </div>
    )
  }

  // ---------- My day
  const myDay = () => {
    const mineOnly = all.filter((t) => t.assigneeId === user?.id)
    const src = mineOnly.length || scope.isExec ? mineOnly : tasks
    const groups = [
      ['Overdue', src.filter((t) => t.status === 'OPEN' && t.dueDate < today()).sort((a, b) => a.dueDate.localeCompare(b.dueDate))],
      ['Today', src.filter((t) => t.status === 'OPEN' && t.dueDate === today())],
      ['Next 3 days', src.filter((t) => t.status === 'OPEN' && t.dueDate > today() && t.dueDate <= addDays(today(), 3)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))],
      ['Completed today', src.filter((t) => t.status === 'DONE' && (t.completedAt || '').slice(0, 10) === today())],
    ]
    return (
      <div className="max-w-2xl space-y-5">
        <div className="rounded-xl bg-gradient-to-r from-ink-900 to-ink-700 text-white p-4">
          <div className="flex items-center gap-2 text-sm opacity-80"><Sun className="w-4 h-4" />{fmtDate(today())}</div>
          <div className="text-lg font-semibold mt-1">{groups[1][1].length} tasks today · {groups[0][1].length} overdue</div>
          <div className="text-xs opacity-75 mt-0.5">{mineOnly.length || scope.isExec ? `Assigned to ${user?.name}` : 'Team view – no tasks assigned to you'}</div>
        </div>
        {groups.map(([label, list]) => list.length > 0 && (
          <div key={label}>
            <div className={cx('text-xs font-semibold uppercase tracking-wide mb-2', label === 'Overdue' ? 'text-red-600' : 'text-slate-500')}>{label} ({list.length})</div>
            <div className="space-y-3">{list.map((t) => <TaskCard key={t.id} t={t} big />)}</div>
          </div>
        ))}
        {groups.every(([, l]) => !l.length) && <Card><EmptyState icon={CheckCircle2} title="You're all caught up" message="No open tasks for today. Plan a dealer visit from Reorder Nudges." /></Card>}
      </div>
    )
  }

  // ---------- Board
  const cols = [
    { key: 'OVERDUE', label: 'Overdue', tone: 'red' },
    { key: 'TODAY', label: 'Today', tone: 'amber' },
    { key: 'UPCOMING', label: 'Upcoming', tone: 'blue' },
    { key: 'DONE', label: 'Done (14d)', tone: 'green' },
  ]
  const boardItems = tasks.filter((t) => t.status === 'OPEN' || (t.completedAt || '').slice(0, 10) >= daysAgo(14))
  const onMove = async (t, to) => {
    if (to === 'DONE') return markDone(t)
    if (to === 'OVERDUE') return toast.warn('Pick Today or Upcoming to reschedule a task')
    if (t.status === 'DONE') reopenTask(t.id)
    const due = to === 'TODAY' ? today() : addDays(today(), 1)
    updateTask(t.id, { dueDate: due })
    toast.success(`Rescheduled to ${fmtDate(due)}`)
  }

  // ---------- Team view
  const team = useMemo(() => {
    const people = state.users.filter((u) => SALES_PEOPLE.includes(u.id) && (!scope.isExec || !scope.mine || u.id === user?.id))
    const cut = daysAgo(56)
    const rows = people.map((u) => {
      const mine = all.filter((t) => t.assigneeId === u.id)
      const due = mine.filter((t) => t.dueDate <= today() && t.dueDate >= daysAgo(30))
      const od = mine.filter((t) => t.status === 'OPEN' && t.dueDate < today())
      const heat = WEEKDAYS.map((_, wd) => mine.filter((t) => {
        const d = t.status === 'DONE' ? (t.completedAt || '').slice(0, 10) : t.dueDate
        return d >= cut && ((new Date(d).getDay() + 6) % 7) === wd
      }).length)
      return { id: u.id, name: u.name, title: u.title, total: mine.length, open: mine.filter((t) => t.status === 'OPEN').length, overdue: od.length, done: mine.filter((t) => t.status === 'DONE').length, completion: due.length ? (due.filter((t) => t.status === 'DONE').length / due.length) * 100 : 0, overduePct: mine.filter((t) => t.status === 'OPEN').length ? (od.length / mine.filter((t) => t.status === 'OPEN').length) * 100 : 0, heat }
    })
    const max = Math.max(1, ...rows.flatMap((r) => r.heat))
    const dealers = state.partners.filter((p) => p.status === 'ACTIVE' && p.type !== 'EXPORT' && scope.inScope(p.id)).map((p) => {
      const touches = all.filter((t) => t.partnerId === p.id && t.status === 'DONE')
      const last = touches.map((t) => (t.completedAt || '').slice(0, 10)).sort().reverse()[0] || p.lastVisitDate || null
      const t90 = touches.filter((t) => (t.completedAt || '').slice(0, 10) >= daysAgo(90)).length
      const since = last ? daysBetween(last, today()) : null
      return { id: p.id, name: p.name, salespersonId: p.salespersonId, last, since, t90, openTasks: all.filter((t) => t.partnerId === p.id && t.status === 'OPEN').length, cadence: since == null ? 'NONE' : since <= 14 ? 'GOOD' : since <= 30 ? 'DUE' : 'LAPSED' }
    })
    return { rows, max, dealers }
  }, [all, state.partners, scope.mine]) // eslint-disable-line

  const listCols = [
    { key: 'title', header: 'Task', render: (t) => <div className="min-w-[220px]"><div className={cx('font-medium text-slate-800', t.status === 'DONE' && 'line-through text-slate-400')}>{t.title}</div>{t.outcome && <div className="text-[11px] text-emerald-700 truncate max-w-xs">{t.outcome}</div>}</div> },
    { key: 'type', header: 'Type', value: (t) => taskTypeLabel(t.type), render: (t) => <Badge tone={TYPE_TONE[t.type]}>{taskTypeLabel(t.type)}</Badge> },
    { key: 'partner', header: 'Dealer', value: (t) => partner(t.partnerId)?.name || '', render: (t) => (t.partnerId ? <PartnerCell id={t.partnerId} /> : <span className="text-slate-400">—</span>) },
    { key: 'assignee', header: 'Assignee', value: (t) => name(t.assigneeId) },
    { key: 'dueDate', header: 'Due', render: (t) => <span className={cx('text-xs whitespace-nowrap', bucket(t) === 'OVERDUE' && 'text-red-600 font-semibold')}>{fmtDate(t.dueDate)}</span> },
    { key: 'priority', header: 'Priority', render: (t) => <Badge tone={PRI_TONE[t.priority]}>{t.priority?.toLowerCase()}</Badge> },
    { key: 'status', header: 'Status', value: (t) => bucket(t), render: (t) => <StatusBadge status={bucket(t) === 'OVERDUE' ? 'OVERDUE' : t.status} label={bucket(t) === 'OVERDUE' ? 'Overdue' : t.status === 'DONE' ? 'Done' : 'Open'} /> },
    { key: 'actions', header: '', sortable: false, export: false, render: (t) => <Actions t={t} /> },
  ]

  return (
    <div>
      <PageHeader title="Sales Tasks" subtitle="Visits, follow-ups, collections and demos – linked to dealers and orders."
        actions={<>
          <ScopeToggle scope={scope} />
          <Button icon={Plus} onClick={() => setModal({ initial: {} })}>New task</Button>
        </>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Open tasks" value={open.length} icon={ListTodo} tone="ink" sub={`${dueToday.length} due today`} onClick={() => setView('board')} />
        <Stat label="Overdue" value={overdue.length} icon={AlertTriangle} tone="red" sub={open.length ? `${fmtPct((overdue.length / open.length) * 100, 0)} of open` : '—'} />
        <Stat label="Completion (30d)" value={fmtPct(completion, 0)} icon={CheckCircle2} tone="green" sub={`${done30.length} done in 30 days`} />
        <Stat label="Dealers touched (30d)" value={new Set(done30.map((t) => t.partnerId).filter(Boolean)).size} icon={Users} tone="blue" />
      </Grid>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="overflow-x-auto no-scrollbar"><Segmented value={view} onChange={setView} options={[{ key: 'day', label: 'My day' }, { key: 'list', label: 'List' }, { key: 'board', label: 'Board' }, { key: 'team', label: scope.canManage ? 'Team dashboard' : 'Activity' }]} /></div>
        {scope.canManage && view !== 'day' && <div className="sm:w-56"><Select value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="All salespeople" options={state.users.filter((u) => [...SALES_PEOPLE, 'u4'].includes(u.id)).map((u) => ({ value: u.id, label: u.name }))} /></div>}
      </div>

      {view === 'day' && myDay()}
      {view === 'list' && (
        <DataTable columns={listCols} rows={tasks} exportName="sales-tasks" initialSort={{ key: 'dueDate', dir: 'asc' }}
          filters={[
            { key: 'status', label: 'statuses', options: [{ value: 'OVERDUE', label: 'Overdue' }, { value: 'TODAY', label: 'Due today' }, { value: 'UPCOMING', label: 'Upcoming' }, { value: 'DONE', label: 'Done' }], value: bucket },
            { key: 'type', label: 'types', options: TASK_TYPES },
          ]} />
      )}
      {view === 'board' && (
        <Kanban columns={cols} items={boardItems} getColumn={bucket} onMove={onMove} renderCard={(t) => <div onDoubleClick={() => setModal({ task: t })}><TaskCard t={t} /></div>} />
      )}
      {view === 'team' && (
        <div className="space-y-4">
          <Card title="Salesperson execution" subtitle="Completion % on tasks due in the last 30 days">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr><th className="text-left px-3 py-2">Salesperson</th><th className="text-right px-3">Open</th><th className="text-right px-3">Overdue</th><th className="text-right px-3">Done</th><th className="px-3 text-left w-48">Completion</th><th className="px-3 text-right">Overdue %</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {team.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><Avatar name={r.name} size="sm" /><div><div className="font-medium">{r.name}</div><div className="text-[11px] text-slate-500">{r.title.replace('Sales Executive – ', '')}</div></div></div></td>
                      <td className="px-3 text-right tabular-nums">{r.open}</td>
                      <td className={cx('px-3 text-right tabular-nums', r.overdue && 'text-red-600 font-semibold')}>{r.overdue}</td>
                      <td className="px-3 text-right tabular-nums">{r.done}</td>
                      <td className="px-3"><Progress value={r.completion} showLabel tone={r.completion >= 80 ? 'green' : r.completion >= 50 ? 'amber' : 'red'} /></td>
                      <td className="px-3 text-right tabular-nums">{fmtPct(r.overduePct, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Activity heatmap" subtitle="Tasks by weekday × salesperson (last 8 weeks)">
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead><tr><th className="text-left py-1 pr-2 font-medium text-slate-500" />{WEEKDAYS.map((d) => <th key={d} className="font-medium text-slate-500 px-1 py-1">{d}</th>)}</tr></thead>
                  <tbody>
                    {team.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="pr-2 py-1 whitespace-nowrap text-slate-700">{r.name.split(' ')[0]}</td>
                        {r.heat.map((v, i) => (
                          <td key={i} className="p-0.5"><div title={`${r.name} · ${WEEKDAYS[i]}: ${v}`} className="h-8 min-w-[32px] rounded flex items-center justify-center font-semibold" style={{ background: v ? `rgba(242,84,31,${0.12 + (v / team.max) * 0.78})` : '#f1f5f9', color: v / team.max > 0.5 ? '#fff' : '#334155' }}>{v || ''}</div></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Dealer-touch cadence" subtitle="Days since last completed visit / call / follow-up">
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                {[['GOOD', '≤ 14 days', 'green'], ['DUE', '15–30 days', 'amber'], ['LAPSED', '> 30 days', 'red'], ['NONE', 'No touch logged', 'gray']].map(([k, l, tone]) => <Badge key={k} tone={tone}>{l}: {team.dealers.filter((d) => d.cadence === k).length}</Badge>)}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {[...team.dealers].sort((a, b) => (b.since ?? 999) - (a.since ?? 999)).map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0"><Link to={`/erp/sales/dealers/${d.id}`} className="font-medium text-slate-800 hover:underline truncate block">{d.name}</Link><div className="text-[11px] text-slate-500">{name(d.salespersonId)} · {d.t90} touches in 90d{d.openTasks ? ` · ${d.openTasks} open` : ''}</div></div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={{ GOOD: 'green', DUE: 'amber', LAPSED: 'red', NONE: 'gray' }[d.cadence]}>{d.since == null ? 'Never' : `${d.since}d`}</Badge>
                      {d.cadence !== 'GOOD' && !d.openTasks && <IconButton icon={CalendarClock} title="Plan a visit" onClick={() => setModal({ initial: { title: `Visit ${d.name}`, type: 'VISIT', partnerId: d.id, assigneeId: d.salespersonId, dueDate: addDays(today(), 2) } })} />}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <Card title="Recent completions" actions={<Activity className="w-4 h-4 text-slate-400" />}>
            <div className="divide-y divide-slate-100">
              {all.filter((t) => t.status === 'DONE' && scope.isOwnTask(t)).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 8).map((t) => (
                <div key={t.id} className="py-2 flex items-start justify-between gap-3 text-sm"><div className="min-w-0"><div className="font-medium text-slate-800">{t.title}</div><div className="text-xs text-emerald-700">{t.outcome}</div></div><div className="text-[11px] text-slate-500 text-right shrink-0">{name(t.assigneeId)}<br />{fmtDate(t.completedAt)}</div></div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {modal && <TaskModal open onClose={() => setModal(null)} task={modal.task} initial={modal.initial} />}
    </div>
  )
}
