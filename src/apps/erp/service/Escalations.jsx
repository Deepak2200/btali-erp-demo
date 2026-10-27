import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Factory, BellRing, Clock, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Grid, Stat, Card, Badge, StatusBadge, Button, Segmented, EmptyState, toast, cx } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell } from '../../../components/business'
import { fmtDate, timeAgo } from '../../../lib/format'
import { escalatedAtOf } from '../../../store/slices/service'
import { fmtHours } from './_parts'

const hoursBetween = (a, b) => Math.round((new Date(b || Date.now()) - new Date(a)) / 3600000)

export const useEscalations = () => {
  const tickets = useStore((s) => s.tickets)
  const claims = useStore((s) => s.warrantyClaims)
  return useMemo(() => [
    ...tickets.filter((t) => t.escalatedToVendor && t.vendorId).map((t) => {
      const at = escalatedAtOf(t)
      const respondedAt = t.vendorRespondedAt || t.vendorResponse?.ts || null
      return { id: `t-${t.id}`, kind: 'TICKET', recId: t.id, ref: t.number, vendorId: t.vendorId, subject: t.subject, productId: t.productId, barcode: t.barcode, at, respondedAt, responded: !!respondedAt, open: !['RESOLVED', 'CLOSED'].includes(t.stage), status: respondedAt ? 'RESPONDED' : 'AWAITING_VENDOR', reminders: t.reminders?.length || 0, lastReminder: t.reminders?.slice(-1)[0]?.ts }
    }),
    ...claims.filter((c) => c.vendorClaim?.vendorId).map((c) => {
      const respondedAt = c.vendorClaim.respondedAt || null
      return { id: `c-${c.id}`, kind: 'CLAIM', recId: c.id, ref: c.number, vendorId: c.vendorClaim.vendorId, subject: c.issue, productId: c.productId, barcode: c.barcode, at: c.vendorClaim.sentAt, respondedAt, responded: !!respondedAt || !!c.vendorClaim.response, open: c.status === 'VENDOR_ESCALATED', status: c.vendorClaim.status, reminders: c.vendorClaim.reminders?.length || 0, lastReminder: c.vendorClaim.reminders?.slice(-1)[0]?.ts }
    }),
  ].map((r) => ({ ...r, ageH: hoursBetween(r.at), respH: r.respondedAt ? hoursBetween(r.at, r.respondedAt) : null })), [tickets, claims])
}

export default function Escalations() {
  const rows = useEscalations()
  const remind = useStore((s) => s.svcSendVendorReminder)
  const { vendor } = useLookup()
  const nav = useNavigate()
  const [seg, setSeg] = useState('OPEN')
  const [vf, setVf] = useState('')
  const open = rows.filter((r) => r.open)
  const awaiting = open.filter((r) => !r.responded)
  const resp = rows.filter((r) => r.respH != null)
  const avgResp = resp.length ? Math.round(resp.reduce((a, r) => a + r.respH, 0) / resp.length) : null
  const byVendor = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      m[r.vendorId] = m[r.vendorId] || { vendorId: r.vendorId, open: 0, awaiting: 0, total: 0, resp: [] }
      const v = m[r.vendorId]
      v.total++
      if (r.open) v.open++
      if (r.open && !r.responded) v.awaiting++
      if (r.respH != null) v.resp.push(r.respH)
    })
    return Object.values(m).sort((a, b) => b.open - a.open)
  }, [rows])
  const view = rows.filter((r) => (seg === 'OPEN' ? r.open : seg === 'AWAITING' ? r.open && !r.responded : true)).filter((r) => !vf || r.vendorId === vf)
  const goto = (r) => nav(r.kind === 'CLAIM' ? `/erp/service/claims?id=${r.recId}` : `/erp/service/tickets?id=${r.recId}`)
  const cols = [
    { key: 'ref', header: 'Reference', render: (r) => <div><div className="font-mono text-xs font-semibold">{r.ref}</div><Badge tone={r.kind === 'CLAIM' ? 'brand' : 'ink'}>{r.kind === 'CLAIM' ? 'Warranty claim' : 'Service ticket'}</Badge></div> },
    { key: 'vendor', header: 'Vendor', value: (r) => vendor(r.vendorId)?.name },
    { key: 'subject', header: 'Issue', render: (r) => <div className="max-w-[240px]"><div className="truncate text-sm">{r.subject}</div>{r.productId && <div className="text-[11px] text-slate-500">{r.barcode || ''}</div>}</div> },
    { key: 'product', header: 'Product', value: (r) => r.productId, render: (r) => (r.productId ? <ProductCell id={r.productId} /> : '—') },
    { key: 'at', header: 'Escalated', value: (r) => r.at, render: (r) => <div className="text-sm">{fmtDate(r.at)}<div className="text-[11px] text-slate-400">{timeAgo(r.at)}</div></div> },
    { key: 'status', header: 'Vendor status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'respH', header: 'Response time', align: 'right', value: (r) => r.respH ?? r.ageH, render: (r) => (r.respH != null ? <span className={r.respH > 72 ? 'text-amber-600' : 'text-emerald-600'}>{fmtHours(r.respH)}</span> : <span className={cx(r.ageH > 72 ? 'text-red-600 font-semibold' : 'text-slate-500')}>waiting {fmtHours(r.ageH)}</span>) },
    { key: 'reminders', header: 'Reminders', align: 'right', render: (r) => (r.reminders ? <span title={r.lastReminder ? `Last ${timeAgo(r.lastReminder)}` : ''}>{r.reminders}</span> : '—') },
    { key: 'act', header: '', sortable: false, export: false, render: (r) => (
      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
        {r.open && !r.responded && <Button size="sm" variant="soft" icon={BellRing} onClick={() => { remind(r.kind, r.recId); toast.success(`Reminder sent to ${vendor(r.vendorId)?.name}`, 'Email + Vendor Portal notification.') }}>Remind</Button>}
        <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => goto(r)}>Open</Button>
      </div>
    ) },
  ]
  return (
    <div>
      <PageHeader title="Vendor Escalations" subtitle="Manufacturing defects and warranty claims pushed to suppliers through the Vendor Portal" />
      <Grid cols={4} className="mb-4">
        <Stat label="Open escalations" value={open.length} icon={Factory} tone="violet" onClick={() => setSeg('OPEN')} />
        <Stat label="Awaiting vendor reply" value={awaiting.length} icon={Clock} tone="amber" onClick={() => setSeg('AWAITING')} />
        <Stat label="Pending > 3 days" value={awaiting.filter((r) => r.ageH > 72).length} icon={AlertTriangle} tone="red" />
        <Stat label="Avg. vendor response" value={avgResp != null ? fmtHours(avgResp) : '—'} icon={CheckCircle2} tone="green" sub={`${resp.length} responses`} />
      </Grid>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        {byVendor.length === 0 && <Card className="sm:col-span-2 xl:col-span-4"><EmptyState title="No vendor escalations" /></Card>}
        {byVendor.map((v) => (
          <button key={v.vendorId} type="button" onClick={() => setVf(vf === v.vendorId ? '' : v.vendorId)} className={cx('text-left bg-white rounded-xl border p-3 shadow-card transition-colors', vf === v.vendorId ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200 hover:border-brand-300')}>
            <div className="text-sm font-semibold text-ink-900 truncate">{vendor(v.vendorId)?.name}</div>
            <div className="mt-2 flex items-end gap-4 text-xs text-slate-500">
              <div><div className="text-xl font-bold text-ink-900">{v.open}</div>open</div>
              <div><div className={cx('text-xl font-bold', v.awaiting ? 'text-amber-600' : 'text-slate-400')}>{v.awaiting}</div>awaiting</div>
              <div><div className="text-xl font-bold text-ink-900">{v.resp.length ? fmtHours(Math.round(v.resp.reduce((a, b) => a + b, 0) / v.resp.length)) : '—'}</div>avg reply</div>
              <div className="ml-auto">{v.total} total</div>
            </div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented value={seg} onChange={setSeg} options={[{ key: 'OPEN', label: 'Open' }, { key: 'AWAITING', label: 'Awaiting reply' }, { key: 'ALL', label: 'All' }]} />
        {vf && <Badge tone="brand">{vendor(vf)?.name} <button className="ml-1" onClick={() => setVf('')}>×</button></Badge>}
      </div>
      <DataTable columns={cols} rows={view} onRowClick={goto} exportName="vendor-escalations" initialSort={{ key: 'at', dir: 'asc' }} />
    </div>
  )
}
