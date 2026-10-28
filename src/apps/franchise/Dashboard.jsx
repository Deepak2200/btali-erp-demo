import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Receipt, LockOpen, Lock, PackageCheck, RotateCcw, AlertTriangle, ShieldCheck, ScanLine, Clock } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, StatusBadge, Grid, Stat, Progress, ProductImage, EmptyState } from '../../components/ui'
import { BarsChart } from '../../components/business'
import { fmtINR, fmtNum, fmtDate, fmtDateTime, sum, today, daysAgo, addDays, round2 } from '../../lib/format'
import { usePortal, isPendingInward } from '../dealer/_portal'
import { useSuggestions } from './Replenishment'

export default function Dashboard() {
  const nav = useNavigate()
  const { user, partnerId, partner } = usePortal()
  const posOrders = useStore((s) => s.posOrders) || []
  const sessions = useStore((s) => s.posSessions) || []
  const invoices = useStore((s) => s.invoices)
  const replenishments = useStore((s) => s.replenishments) || []
  const products = useStore((s) => s.products)
  const sugg = useSuggestions(partner)
  const mine = useMemo(() => posOrders.filter((o) => o.partnerId === partnerId), [posOrders, partnerId])
  const todays = mine.filter((o) => o.date === today())
  const open = sessions.find((s) => s.partnerId === partnerId && s.status === 'OPEN')
  const pendingInward = invoices.filter((i) => isPendingInward(i, partnerId))
  const reps = replenishments.filter((r) => r.partnerId === partnerId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4)
  const days = Array.from({ length: 14 }, (_, i) => addDays(daysAgo(13), i))
  const chart = days.map((d) => ({ label: new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), sales: round2(sum(mine.filter((o) => o.date === d), (o) => o.total)) }))
  const m30 = mine.filter((o) => o.date >= daysAgo(30))
  const comp = partner?.compliance || {}
  const lag = comp.stockUpdateLagDays ?? 0
  const score = Math.round(((comp.barcodeScanPct ?? 100) + (comp.posUsagePct ?? 100) + Math.max(0, 100 - lag * 15)) / 3)
  const top = Object.values(m30.flatMap((o) => o.lines).reduce((a, l) => { a[l.productId] = a[l.productId] || { id: l.productId, qty: 0, value: 0 }; a[l.productId].qty += l.qty; a[l.productId].value += l.qty * l.price; return a }, {})).sort((a, b) => b.value - a.value).slice(0, 5)

  return (
    <div>
      <PageHeader title={partner?.name} subtitle={`${partner?.code} · Store manager ${user?.name} · ${fmtDate(today())}`}
        actions={<><Button variant="secondary" icon={ScanLine} onClick={() => nav('/franchise/inward')}>Stock inward</Button><Button icon={Store} onClick={() => nav('/franchise/pos')}>{open ? 'Open POS' : 'Start day'}</Button></>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={Receipt} label="Today's sales" value={fmtINR(sum(todays, (o) => o.total))} sub={`${todays.length} bills`} onClick={() => nav('/franchise/reports')} />
        <Stat icon={open ? LockOpen : Lock} tone={open ? 'green' : 'amber'} label="POS session" value={open ? 'Open' : 'Closed'} sub={open ? `${open.number} · since ${fmtDateTime(open.openedAt)}` : 'Open a session to start billing'} onClick={() => nav(open ? '/franchise/sessions' : '/franchise/pos')} />
        <Stat icon={PackageCheck} tone={pendingInward.length ? 'blue' : 'green'} label="Pending inward" value={pendingInward.length} sub={pendingInward.length ? `${fmtNum(sum(pendingInward, (i) => sum(i.lines, (l) => l.qty)))} units in transit` : 'All received'} onClick={() => nav('/franchise/inward')} />
        <Stat icon={AlertTriangle} tone={sugg.length ? 'red' : 'green'} label="Stock alerts" value={sugg.length} sub="Below min / low cover" onClick={() => nav('/franchise/replenishment')} />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <Card title="Sales – last 14 days" subtitle={`30-day sales ${fmtINR(sum(m30, (o) => o.total))} · ${m30.length} bills · avg bill ${fmtINR(m30.length ? sum(m30, (o) => o.total) / m30.length : 0)}`}>
            <BarsChart data={chart} series={[{ key: 'sales', label: 'Sales' }]} height={230} />
          </Card>
          {pendingInward.length > 0 && (
            <Card title="Consignments arriving" actions={<Button size="sm" variant="link" onClick={() => nav('/franchise/inward')}>Scan inward</Button>}>
              <div className="space-y-2">
                {pendingInward.map((i) => <div key={i.id} className="flex justify-between items-center rounded-lg border border-slate-200 px-3 py-2 text-sm"><div><span className="font-mono font-medium">{i.number}</span><span className="text-xs text-slate-500 ml-2">LR {i.lr?.number} · {fmtDate(i.lr?.date)}</span></div><Badge tone="amber">{fmtNum(sum(i.lines, (l) => l.qty))} units</Badge></div>)}
              </div>
            </Card>
          )}
          <Card title="Top sellers (30 days)">
            {top.length === 0 ? <div className="text-sm text-slate-400">No sales yet.</div> : (
              <div className="space-y-2">
                {top.map((t) => { const p = products.find((x) => x.id === t.id); return <div key={t.id} className="flex items-center gap-3"><ProductImage product={p} size="xs" /><span className="flex-1 text-sm truncate">{p?.shortName}</span><span className="text-xs text-slate-500 tabular-nums">{t.qty} sold</span><span className="w-24 text-right text-sm font-medium tabular-nums">{fmtINR(t.value)}</span></div> })}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4 min-w-0">
          <Card title="Compliance score" subtitle="Mandatory Btali store process">
            <div className="flex items-end gap-2 mb-3"><span className="text-3xl font-bold tabular-nums">{score}</span><span className="text-sm text-slate-500 mb-1">/ 100</span><Badge tone={score >= 90 ? 'green' : score >= 75 ? 'amber' : 'red'} className="mb-1.5 ml-auto">{score >= 90 ? 'Excellent' : score >= 75 ? 'Needs attention' : 'At risk'}</Badge></div>
            <div className="space-y-3 text-sm">
              <div><div className="flex justify-between mb-1"><span className="text-slate-600 inline-flex items-center gap-1"><ScanLine className="w-3.5 h-3.5" />Barcode scanning</span><span className="tabular-nums">{comp.barcodeScanPct ?? '—'}%</span></div><Progress value={comp.barcodeScanPct ?? 0} tone={(comp.barcodeScanPct ?? 0) >= 90 ? 'green' : 'amber'} /></div>
              <div><div className="flex justify-between mb-1"><span className="text-slate-600 inline-flex items-center gap-1"><Receipt className="w-3.5 h-3.5" />POS usage</span><span className="tabular-nums">{comp.posUsagePct ?? '—'}%</span></div><Progress value={comp.posUsagePct ?? 0} tone={(comp.posUsagePct ?? 0) >= 90 ? 'green' : 'amber'} /></div>
              <div className="flex justify-between"><span className="text-slate-600 inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Stock update lag</span><Badge tone={lag <= 1 ? 'green' : 'amber'}>{lag === 0 ? 'Same day' : `${lag} day(s)`}</Badge></div>
              <div className="flex justify-between"><span className="text-slate-600 inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Warranties via POS (30d)</span><span className="tabular-nums">{sum(m30, (o) => (o.warrantyIds || []).length)}</span></div>
            </div>
          </Card>
          <Card title="Replenishment" actions={<Button size="sm" variant="link" onClick={() => nav('/franchise/replenishment')}>Manage</Button>}>
            {sugg.length > 0 && <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 mb-3">{sugg.length} item(s) need top-up: {sugg.slice(0, 3).map((s) => s.p.shortName).join(', ')}{sugg.length > 3 ? '…' : ''}</div>}
            {reps.length === 0 ? <EmptyState icon={RotateCcw} title="No requests" /> : (
              <div className="space-y-2">{reps.map((r) => <div key={r.id} className="flex justify-between items-center text-sm"><div><div className="font-mono text-xs">{r.number}</div><div className="text-[11px] text-slate-500">{fmtDate(r.createdAt || r.date)} · {r.lines.length} items</div></div><StatusBadge status={r.status} /></div>)}</div>
            )}
          </Card>
          <Card title="Recent bills" actions={<Button size="sm" variant="link" onClick={() => nav('/franchise/sessions')}>Sessions</Button>}>
            {mine.length === 0 ? <div className="text-sm text-slate-400">No bills yet.</div> : (
              <div className="space-y-2">{[...mine].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 5).map((o) => <div key={o.id} className="flex justify-between text-sm"><div><div className="font-mono text-xs">{o.number}</div><div className="text-[11px] text-slate-500">{fmtDateTime(o.ts)}{o.customer?.name ? ` · ${o.customer.name}` : ''}</div></div><span className="font-medium tabular-nums">{fmtINR(o.total)}</span></div>)}</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
