// Shared UI pieces for management dashboards (drill-down drawers, clickable bar lists).
import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { Drawer, Button, Badge, StatusBadge, DescriptionList, SectionTitle, Timeline, Progress, cx, KV } from '../../../components/ui'
import { TrendChart, ProductCell } from '../../../components/business'
import { fmtINR, fmtCompact, fmtNum, fmtDate, fmtPct, sum, daysBetween, today } from '../../../lib/format'
import { aggregate, salesLines } from '../../../lib/analytics'
import { monthlyFor } from './_execData'

/** Horizontal clickable bar list */
export function HBarList({ items, onClick, money = true, color = 'bg-brand-500', empty = 'No data for this period.' }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) return <div className="text-sm text-slate-400 py-6 text-center">{empty}</div>
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={it.id}>
          <button type="button" onClick={() => onClick?.(it)} className={cx('w-full text-left group', onClick && 'cursor-pointer')}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] w-5 text-slate-400 tabular-nums shrink-0">{i + 1}</span>
                <span className="truncate text-slate-800 group-hover:text-brand-700 font-medium">{it.label}</span>
                {it.sub && <span className="text-[11px] text-slate-400 truncate hidden sm:inline">{it.sub}</span>}
              </span>
              <span className="tabular-nums text-slate-700 shrink-0">{money ? fmtCompact(it.value) : fmtNum(it.value)}{it.extra && <span className="text-[11px] text-slate-400 ml-1.5">{it.extra}</span>}</span>
            </div>
            <div className="ml-7 mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={cx('h-full rounded-full transition-all group-hover:opacity-80', it.color || color)} style={{ width: `${(it.value / max) * 100}%` }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function MiniMetric({ label, value, hint, tone }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={cx('text-base font-bold tabular-nums', tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-ink-900')}>{value}</div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  )
}

/** Dealer drill-down */
export function DealerDrawer({ partnerId, period, onClose }) {
  const state = useStore()
  const navigate = useNavigate()
  const { user } = useLookup()
  const p = state.partners.find((x) => x.id === partnerId)
  const data = useMemo(() => {
    if (!p) return null
    const trend = monthlyFor(state, 12, (l) => l.partnerId === p.id)
    const lines = salesLines(state, { from: period?.from, to: period?.to }).filter((l) => l.partnerId === p.id)
    const prods = aggregate(lines, (l) => l.productId).sort((a, b) => b.revenue - a.revenue).slice(0, 8)
    const cats = aggregate(lines, (l) => l.category).sort((a, b) => b.revenue - a.revenue)
    const open = state.salesOrders.filter((s) => s.partnerId === p.id && ['PENDING_REVIEW', 'CONFIRMED', 'PAID', 'INVOICED'].includes(s.status))
    const curM = today().slice(0, 7)
    const tgt = (state.targets || []).filter((t) => t.ownerType === 'DEALER' && t.ownerId === p.id).sort((a, b) => b.period.localeCompare(a.period))
    return { trend: trend.map((m) => ({ ...m, target: tgt.find((t) => t.period === m.month)?.amount || null })), prods, cats, open, revenue: sum(lines, (l) => l.revenue), margin: sum(lines, (l) => l.revenue - l.cost), tgt, curM }
  }, [state, p, period])
  if (!p || !data) return null
  const hasTarget = data.trend.some((m) => m.target)
  return (
    <Drawer open onClose={onClose} title={p.name} subtitle={`${p.code} · ${p.city}, ${p.state} · ${p.region}`} width="max-w-3xl"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={ExternalLink} onClick={() => navigate(`/erp/sales/dealers?id=${p.id}`)}>Open Dealer 360</Button></>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <MiniMetric label={`Revenue · ${period?.label || 'period'}`} value={fmtCompact(data.revenue)} />
        <MiniMetric label="Gross margin" value={fmtPct(data.revenue ? (data.margin / data.revenue) * 100 : 0)} />
        <MiniMetric label="Open orders" value={data.open.length} hint={fmtINR(sum(data.open, (s) => s.total))} />
        <MiniMetric label="Last order" value={p.lastOrderDate ? `${daysBetween(p.lastOrderDate, today())}d ago` : '—'} hint={fmtDate(p.lastOrderDate)} />
      </div>
      <SectionTitle>Monthly purchases{hasTarget ? ' vs target' : ''} (12 months)</SectionTitle>
      <TrendChart data={data.trend} type={hasTarget ? 'line' : 'area'} height={200} series={[{ key: 'revenue', label: 'Revenue' }, ...(hasTarget ? [{ key: 'target', label: 'Target', color: '#64748b', dashed: true }] : [])]} />
      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <div>
          <SectionTitle>Top products</SectionTitle>
          <div className="space-y-2">
            {data.prods.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-2">
                <ProductCell id={r.key} sub={`${fmtNum(r.qty)} units`} />
                <span className="text-sm tabular-nums">{fmtCompact(r.revenue)}</span>
              </div>
            ))}
            {!data.prods.length && <div className="text-sm text-slate-400">No purchases in this period.</div>}
          </div>
        </div>
        <div>
          <SectionTitle>Category mix</SectionTitle>
          {data.cats.map((c) => <KV key={c.key} label={c.key} value={`${fmtCompact(c.revenue)} · ${fmtPct(c.marginPct)}`} />)}
          <SectionTitle className="mt-4">Profile</SectionTitle>
          <DescriptionList cols={2} items={[['Tier', p.tier], ['Salesperson', user(p.salespersonId)?.name], ['Price list', state.priceLists.find((x) => x.id === p.priceListId)?.name], ['Status', <StatusBadge key="s" status={p.status} />]]} />
        </div>
      </div>
      {data.open.length > 0 && (
        <>
          <SectionTitle className="mt-5">Open orders</SectionTitle>
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {data.open.map((so) => (
              <li key={so.id} className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/erp/sales/orders/${so.id}`)}>
                <span className="font-medium">{so.number}<span className="text-xs text-slate-400 ml-2">{fmtDate(so.date)}</span></span>
                <span className="flex items-center gap-2"><StatusBadge status={so.status} /><span className="tabular-nums">{fmtINR(so.total)}</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  )
}

/** Shipment drill-down */
export function ShipmentDrawer({ shipment: sh, onClose }) {
  const state = useStore()
  const navigate = useNavigate()
  const { vendor } = useLookup()
  if (!sh) return null
  const pos = state.purchaseOrders.filter((p) => sh.poIds.includes(p.id))
  const delay = sh.status !== 'RECEIVED' && sh.eta < today() ? daysBetween(sh.eta, today()) : 0
  return (
    <Drawer open onClose={onClose} title={`${sh.number} · ${sh.containerNo}`} subtitle={`${vendor(sh.vendorId)?.name} · ${sh.containerType}`} width="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={ExternalLink} onClick={() => navigate('/erp/purchase/shipments')}>Open in Shipments</Button></>}>
      <div className="flex flex-wrap gap-2 mb-4"><StatusBadge status={sh.status} />{delay > 0 && <Badge tone="red">Delayed {delay} days</Badge>}{sh.telexReleased && <Badge tone="green">Telex released</Badge>}</div>
      <DescriptionList cols={3} items={[['ETD', fmtDate(sh.etd)], ['ETA', fmtDate(sh.eta)], ['ATA', fmtDate(sh.ata)], ['BL No.', sh.blNo], ['Forwarder', vendor(sh.forwarderId)?.name], ['Indian agent', vendor(sh.indianForwarderId)?.name]]} />
      <SectionTitle className="mt-5">Milestones</SectionTitle>
      <Timeline items={(sh.milestones || []).map((m) => ({ text: `${m.done ? '✓ ' : ''}${m.label}`, ts: m.date || m.planned, by: m.done ? 'Done' : `Planned`, tone: m.done ? 'green' : m.planned < today() ? 'red' : undefined }))} />
      <SectionTitle className="mt-5">Purchase orders & contents</SectionTitle>
      {pos.map((po) => (
        <div key={po.id} className="border border-slate-200 rounded-lg p-3 mb-2">
          <div className="flex justify-between text-sm font-medium mb-2"><span>{po.number}</span><StatusBadge status={po.status} /></div>
          <div className="space-y-1.5">{po.lines.map((l) => <div key={l.productId} className="flex justify-between items-center"><ProductCell id={l.productId} /><span className="text-sm tabular-nums">{fmtNum(l.qty)}</span></div>)}</div>
        </div>
      ))}
    </Drawer>
  )
}

/** Open-order shortfalls drill-down */
export function ShortfallDrawer({ rows, onClose }) {
  const navigate = useNavigate()
  const { partner } = useLookup()
  return (
    <Drawer open onClose={onClose} title="Open orders waiting on stock" subtitle="Products where confirmed / paid order quantity exceeds Btali on-hand stock" width="max-w-3xl">
      {!rows.length && <div className="text-sm text-slate-500">All open orders are covered by available stock.</div>}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="border border-slate-200 rounded-xl p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ProductCell id={r.productId} sub={`Demand ${fmtNum(r.demand)} · on hand ${fmtNum(r.onHand)}`} />
              <div className="flex items-center gap-2">
                <Badge tone="red">Short {fmtNum(r.shortfall)}</Badge>
                {r.status === 'DELAYED' ? <Badge tone="red">Inbound delayed {r.delay}d</Badge> : r.status === 'INBOUND' ? <Badge tone="blue">Inbound {r.next?.eta ? fmtDate(r.next.eta) : r.next?.stage?.replace(/_/g, ' ').toLowerCase()}</Badge> : <Badge tone="amber">No inbound PO</Badge>}
              </div>
            </div>
            {r.next && <div className="text-xs text-slate-500 mt-2">Next supply: {r.next.poNumber} · {fmtNum(r.next.qty)} units{r.shipment ? ` · ${r.shipment.number} (${r.shipment.containerNo})` : ''}</div>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {r.orders.map((so) => (
                <button key={so.id} onClick={() => navigate(`/erp/sales/orders/${so.id}`)} className="text-[11px] px-2 py-1 rounded-md bg-slate-100 hover:bg-brand-50 hover:text-brand-700">
                  {so.number} · {partner(so.partnerId)?.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  )
}

export function ProgressRow({ label, value, max, right, tone }) {
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-sm mb-1"><span className="text-slate-700 truncate">{label}</span><span className="tabular-nums text-slate-600 shrink-0 ml-2">{right}</span></div>
      <Progress value={value} max={max} tone={tone} />
    </div>
  )
}
