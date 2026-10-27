import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, X, ExternalLink, CheckCheck, CheckSquare, History, Clock, IndianRupee, Layers } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { PageHeader, Card, Grid, Stat, Badge, Button, Tabs, EmptyState, toast, confirm, prompt, StatusBadge } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { UserName } from '../../../components/business'
import { fmtINR, fmtCompact, fmtDate, fmtDateTime, timeAgo, sum } from '../../../lib/format'
import { pendingApprovals, APPROVAL_TYPES } from '../../../lib/approvals'

const isDecision = (a) => /^(Approved|Rejected|Confirmed|Re-activated)|approv|reject/i.test(a.action || '')

export default function Approvals() {
  const state = useStore()
  const user = useUser()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [view, setView] = useState('pending')
  const [busy, setBusy] = useState(null)
  const items = useMemo(() => pendingApprovals(state, user).map((x) => ({ ...x, key: `${x.type}:${x.id}` })), [state, user])
  const type = sp.get('type') || 'ALL'
  const setType = (t) => setSp(t === 'ALL' ? {} : { type: t }, { replace: true })

  const typeTabs = useMemo(() => {
    const counts = {}
    items.forEach((i) => { counts[i.type] = (counts[i.type] || 0) + 1 })
    return [{ key: 'ALL', label: 'All', count: items.length }, ...APPROVAL_TYPES.filter((t) => counts[t.key]).map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))]
  }, [items])
  const rows = type === 'ALL' ? items : items.filter((i) => i.type === type)
  const actionable = (it) => it.action && typeof useStore.getState()[it.action] === 'function'

  const decide = async (it, ok) => {
    let remark = ''
    if (!ok) {
      remark = await prompt({ title: `Reject ${it.label}`, message: it.title, label: 'Reason for rejection', required: true, confirmText: 'Reject', tone: 'danger' })
      if (remark == null) return
    }
    const fn = useStore.getState()[it.action]
    if (typeof fn !== 'function') { nav(it.link); return }
    setBusy(it.key)
    try {
      fn(it.id, ok, remark)
      toast.success(ok ? `${it.label} approved` : `${it.label} rejected`, it.title)
    } catch (e) {
      toast.error('Could not complete the action', String(e?.message || e))
    }
    setBusy(null)
  }

  const bulk = async (sel, clear) => {
    const ok = sel.filter(actionable)
    if (!ok.length) { toast.warn('Nothing to approve', 'Selected items must be opened in their own screen.'); return }
    const go = await confirm({ title: `Approve ${ok.length} item${ok.length > 1 ? 's' : ''}?`, message: `${ok.map((i) => `• ${i.label}: ${i.title}`).slice(0, 8).join('\n')}${ok.length > 8 ? `\n…and ${ok.length - 8} more` : ''}${sel.length > ok.length ? `\n\n${sel.length - ok.length} item(s) need review in their own screen and will be skipped.` : ''}`, confirmText: 'Approve all' })
    if (!go) return
    let n = 0
    for (const it of ok) {
      try { useStore.getState()[it.action](it.id, true, 'Bulk approved'); n++ } catch { /* continue */ }
    }
    clear()
    toast.success(`${n} item${n > 1 ? 's' : ''} approved`)
  }

  const history = useMemo(() => (state.auditLog || []).filter(isDecision).map((a) => ({ ...a, decision: /reject/i.test(a.action) ? 'REJECTED' : 'APPROVED' })), [state.auditLog])
  const myHistory = user?.role === 'ADMIN' ? history : history.filter((h) => h.userId === user?.id)
  const totalValue = sum(items, (i) => i.amount || 0)
  const oldest = items.reduce((m, i) => (i.date && (!m || i.date < m) ? i.date : m), null)

  const columns = [
    { key: 'label', header: 'Type', render: (r) => <Badge tone="brand">{r.label}</Badge> },
    { key: 'title', header: 'Request', render: (r) => <div className="min-w-[220px]"><div className="font-medium text-slate-800">{r.title}</div>{r.by && <div className="text-[11px] text-slate-500">Raised by <UserName id={r.by} /></div>}</div> },
    { key: 'amount', header: 'Value', align: 'right', value: (r) => r.amount || 0, render: (r) => (r.amount ? fmtINR(r.amount) : '—') },
    { key: 'date', header: 'Submitted', value: (r) => r.date || '', render: (r) => (r.date ? <span title={fmtDateTime(r.date)}>{timeAgo(r.date)}</span> : '—') },
    {
      key: 'act', header: '', sortable: false, export: false, align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {actionable(r) ? (
            <>
              <Button size="sm" variant="success" icon={Check} loading={busy === r.key} onClick={() => decide(r, true)}>Approve</Button>
              <Button size="sm" variant="secondary" icon={X} onClick={() => decide(r, false)}>Reject</Button>
            </>
          ) : <Button size="sm" variant="soft" iconRight={ExternalLink} onClick={() => nav(r.link)}>Review</Button>}
          {actionable(r) && <Button size="sm" variant="ghost" icon={ExternalLink} title="Open" onClick={() => nav(r.link)} />}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="My Approvals" subtitle="Everything waiting for your decision across purchase, sales, accounts, HR and service" />
      <Grid cols={4} className="mb-5">
        <Stat label="Pending" value={items.length} icon={CheckSquare} tone="brand" sub={`${typeTabs.length - 1} document types`} />
        <Stat label="Value awaiting decision" value={fmtCompact(totalValue)} icon={IndianRupee} tone="amber" />
        <Stat label="Oldest request" value={oldest ? timeAgo(oldest) : '—'} icon={Clock} tone="red" sub={oldest ? fmtDate(oldest) : ''} />
        <Stat label="Decisions logged" value={myHistory.length} icon={History} tone="green" sub="approval history" onClick={() => setView('history')} />
      </Grid>

      <Tabs className="mb-4" value={view} onChange={setView} tabs={[{ key: 'pending', label: 'Pending', count: items.length }, { key: 'history', label: 'History', count: myHistory.length }]} />

      {view === 'pending' ? (
        <>
          {items.length > 0 && <Tabs className="mb-3" value={type} onChange={setType} tabs={typeTabs} />}
          {items.length === 0 ? (
            <Card><EmptyState icon={CheckCheck} title="You're all caught up" message="No approvals are pending for you right now." /></Card>
          ) : (
            <DataTable
              rows={rows} rowKey="key" columns={columns} onRowClick={(r) => nav(r.link)} exportName="pending-approvals"
              searchPlaceholder="Search approvals…" initialSort={{ key: 'date', dir: 'desc' }}
              bulkActions={(sel, clear) => <Button size="sm" variant="success" icon={CheckCheck} onClick={() => bulk(sel, clear)}>Approve selected</Button>}
            />
          )}
        </>
      ) : (
        <DataTable
          rows={myHistory} exportName="approval-history" searchPlaceholder="Search history…"
          filters={[{ key: 'decision', label: 'decisions', options: ['APPROVED', 'REJECTED'] }, { key: 'entity', label: 'documents', options: [...new Set(myHistory.map((h) => h.entity).filter(Boolean))] }]}
          empty={<EmptyState icon={Layers} title="No decisions yet" message="Approvals and rejections you make will be recorded here with time and reference." />}
          columns={[
            { key: 'ts', header: 'When', render: (r) => fmtDateTime(r.ts) },
            { key: 'decision', header: 'Decision', render: (r) => <StatusBadge status={r.decision} /> },
            { key: 'action', header: 'Action' },
            { key: 'entity', header: 'Document' },
            { key: 'ref', header: 'Reference', render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
            { key: 'userId', header: 'By', value: (r) => state.users.find((u) => u.id === r.userId)?.name || '', render: (r) => <UserName id={r.userId} fallback="System" /> },
          ]}
        />
      )}
    </div>
  )
}
