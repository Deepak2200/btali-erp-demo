import React, { useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useParams, Link } from 'react-router-dom'
import { Users, AlertTriangle, IndianRupee, Pencil, Plus, ListTodo, ShoppingCart, Mail, Phone, MapPin, ArrowLeft, Clock, Save, FileText } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Tabs, Button, StatusBadge, Badge, Modal, Field, FormGrid, Input, Select, Textarea, NumberInput, Checkbox,
  DescriptionList, EmptyState, FileUpload, AttachmentList, Avatar, KV, toast, confirm, prompt, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, TrendChart, UserName, FMSBadge } from '../../../components/business'
import { quotePrice } from '../../../lib/pricing'
import { fmsMap } from '../../../lib/analytics'
import { fmtINR, fmtDate, sum, today, timeAgo, round2, addDays } from '../../../lib/format'
import { useScope, ScopeToggle, dealerStats, isInactive, monthlyRevenue, REGIONS, CATEGORIES, SALES_PEOPLE, STAGES, NewOrderModal, TaskModal, targetRow, periodLabel, taskTypeLabel } from './_shared'
import { downloadDocHtml } from './Orders'

export default function Dealers() {
  return (
    <Routes>
      <Route index element={<DealerList />} />
      <Route path=":id" element={<DealerDetail />} />
    </Routes>
  )
}

function DealerList() {
  const state = useStore()
  const scope = useScope()
  const navigate = useNavigate()
  const [type, setType] = useState('DEALER')
  const [edit, setEdit] = useState(null)
  const users = state.users
  const rows = useMemo(() => state.partners.filter((p) => scope.inScope(p.id) && (type === 'ALL' || p.type === type)).map((p) => {
    const st = dealerStats(state, p.id)
    return { ...p, ...st, inactive: isInactive(p, state.settings), spName: users.find((u) => u.id === p.salespersonId)?.name }
  }), [state, scope.mine, type]) // eslint-disable-line
  const active = rows.filter((r) => r.status === 'ACTIVE')
  const inactive = rows.filter((r) => r.inactive)
  return (
    <div>
      <PageHeader title="Dealer 360" subtitle="Every dealer, franchise store and export customer – profile, pricing, orders, documents and health in one place."
        actions={<><ScopeToggle scope={scope} /><Button icon={Plus} onClick={() => navigate('/erp/sales/onboarding')}>Onboard dealer</Button></>} />
      <Grid cols={4} className="mb-5">
        <Stat label="Active accounts" value={active.length} sub={`${rows.length} in view`} icon={Users} />
        <Stat label="12-month revenue" value={fmtINR(sum(rows, (r) => r.rev12))} sub="taxable, invoiced" icon={IndianRupee} tone="green" />
        <Stat label={`Inactive > ${state.settings.alertRules.dealerInactiveDays} days`} value={inactive.length} sub={inactive.slice(0, 2).map((r) => r.name).join(', ')} icon={AlertTriangle} tone="red" />
        <Stat label="Pending advance" value={fmtINR(sum(rows, (r) => r.outstanding))} sub="confirmed orders, unpaid" icon={Clock} tone="amber" />
      </Grid>
      <Tabs className="mb-3" value={type} onChange={setType} tabs={[{ key: 'DEALER', label: 'Dealers' }, { key: 'FRANCHISE', label: 'Franchise stores' }, { key: 'EXPORT', label: 'Export customers' }, { key: 'ALL', label: 'All' }]} />
      <DataTable rows={rows} onRowClick={(r) => navigate(`/erp/sales/dealers/${r.id}`)} exportName="dealers" initialSort={{ key: 'rev12', dir: 'desc' }} searchPlaceholder="Search name, city, code…"
        filters={[
          { key: 'region', label: 'regions', options: [...REGIONS, 'Export'] },
          { key: 'tier', label: 'tiers', options: ['A', 'B', 'C', 'F'].map((t) => ({ value: t, label: t === 'F' ? 'Franchise' : `Tier ${t}` })) },
          { key: 'stage', label: 'stages', options: STAGES.map((s) => ({ value: s.key, label: s.label })) },
          { key: 'salespersonId', label: 'salespeople', options: [...SALES_PEOPLE, 'u4'].map((id) => ({ value: id, label: users.find((u) => u.id === id)?.name })) },
          { key: 'inactive', label: 'activity', value: (r) => (r.inactive ? 'yes' : 'no'), options: [{ value: 'yes', label: 'Inactive only' }, { value: 'no', label: 'Active buyers' }] },
        ]}
        columns={[
          { key: 'name', header: 'Dealer', render: (r) => <div className="min-w-0"><div className="font-medium text-slate-800 flex items-center gap-1.5">{r.name}{r.inactive && <Badge tone="red">Inactive</Badge>}</div><div className="text-[11px] text-slate-500">{r.code} · {r.city}</div></div> },
          { key: 'region', header: 'Region' },
          { key: 'tier', header: 'Tier', render: (r) => r.tier ? <Badge tone={r.tier === 'A' ? 'brand' : 'gray'}>{r.tier === 'F' ? 'Franchise' : r.tier}</Badge> : '—' },
          { key: 'stage', header: 'Stage', render: (r) => <StatusBadge status={r.stage} /> },
          { key: 'spName', header: 'Salesperson' },
          { key: 'rev12', header: 'Revenue 12M', align: 'right', render: (r) => fmtINR(r.rev12) },
          { key: 'lastOrder', header: 'Last order', render: (r) => r.lastOrder ? <span className={cx(r.inactive && 'text-red-600 font-medium')}>{fmtDate(r.lastOrder)}<span className="text-[11px] text-slate-400 ml-1">({r.daysSince}d)</span></span> : '—' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'edit', header: '', sortable: false, export: false, render: (r) => <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); setEdit(r.id) }}>Edit</button> },
        ]} />
      {edit && <EditDealer id={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function EditDealer({ id, onClose }) {
  const state = useStore()
  const p = state.partners.find((x) => x.id === id)
  const update = useStore((s) => s.updatePartnerProfile)
  const [f, setF] = useState({ name: p.name, contact: p.contact, phone: p.phone, email: p.email, address: p.address, city: p.city, state: p.state, region: p.region, gstin: p.gstin || '', pan: p.pan || '', tier: p.tier || '', salespersonId: p.salespersonId, transporterId: p.transporterId || '', paymentTerms: p.paymentTerms || 'Advance', notes: p.notes || '' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const save = () => {
    if (!f.name.trim() || !f.email.trim()) return toast.error('Name and email are required')
    update(id, f)
    toast.success('Dealer profile updated')
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={`Edit ${p.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Save} onClick={save}>Save changes</Button></>}>
      <FormGrid>
        <Field label="Firm name" required><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Contact person"><Input value={f.contact} onChange={set('contact')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email" required><Input value={f.email} onChange={set('email')} /></Field>
        <Field label="Address" className="md:col-span-2"><Input value={f.address} onChange={set('address')} /></Field>
        <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
        <Field label="State"><Input value={f.state} onChange={set('state')} /></Field>
        {p.type !== 'EXPORT' && <Field label="Region"><Select value={f.region} onChange={set('region')} options={REGIONS} /></Field>}
        {p.type === 'DEALER' && <Field label="Tier"><Select value={f.tier} onChange={set('tier')} options={['A', 'B', 'C']} /></Field>}
        <Field label="GSTIN"><Input value={f.gstin} onChange={set('gstin')} /></Field>
        <Field label="PAN"><Input value={f.pan} onChange={set('pan')} /></Field>
        <Field label="Salesperson"><Select value={f.salespersonId} onChange={set('salespersonId')} options={[...SALES_PEOPLE, 'u4'].map((u) => ({ value: u, label: state.users.find((x) => x.id === u)?.name }))} /></Field>
        <Field label="Preferred transporter"><Select value={f.transporterId} onChange={set('transporterId')} placeholder="—" options={state.transporters.map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Payment terms"><Input value={f.paymentTerms} onChange={set('paymentTerms')} /></Field>
        <Field label="Notes" className="md:col-span-2"><Textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </FormGrid>
    </Modal>
  )
}

const TABS = ['Overview', 'Orders', 'Invoices & LR', 'Payments', 'Pricing', 'Dealer stock', 'Tickets', 'Tasks', 'Schemes', 'KYC']

function DealerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useStore()
  const { user } = useLookup()
  const p = state.partners.find((x) => x.id === id)
  const [tab, setTab] = useState('Overview')
  const [edit, setEdit] = useState(false)
  const [order, setOrder] = useState(false)
  const [task, setTask] = useState(false)
  const sendEmail = useStore((s) => s.sendEmail)
  if (!p) return <Card><EmptyState title="Account not found" action={<Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/erp/sales/dealers')}>Back to Dealer 360</Button>} /></Card>
  const st = dealerStats(state, p.id)
  const inactive = isInactive(p, state.settings)
  const pl = state.priceLists.find((x) => x.id === p.priceListId)
  const sendStatement = () => {
    const orders = state.salesOrders.filter((s) => s.partnerId === p.id && ['CONFIRMED', 'PAID', 'INVOICED'].includes(s.status))
    sendEmail({ to: p.email, subject: `Account summary – Btali International`, body: `Dear ${p.contact},\n\nOpen orders:\n${orders.map((o) => `• ${o.number} · ${fmtINR(o.total)} · ${o.status.toLowerCase()}`).join('\n') || 'None'}\n\nAdvance pending: ${fmtINR(st.outstanding)}\n12-month purchases: ${fmtINR(st.rev12)}\n\nRegards,\nBtali Sales`, ref: p.code })
    toast.success('Account summary emailed', p.email)
  }
  return (
    <div>
      <PageHeader breadcrumb={<Link to="/erp/sales/dealers" className="hover:underline">Dealer 360</Link>}
        title={<span className="flex items-center gap-3 flex-wrap">{p.name}<StatusBadge status={p.stage} />{p.status !== 'ACTIVE' && <StatusBadge status={p.status} />}{inactive && <Badge tone="red">Inactive {st.daysSince}d</Badge>}</span>}
        subtitle={`${p.code} · ${p.type === 'DEALER' ? `Tier ${p.tier} dealer` : p.type === 'FRANCHISE' ? 'Btali franchise store' : 'Export customer'} · ${p.city}, ${p.state}`}
        actions={<>
          <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>
          <Button variant="secondary" icon={Mail} onClick={sendStatement}>Email summary</Button>
          <Button variant="secondary" icon={ListTodo} onClick={() => setTask(true)}>Task</Button>
          {p.type !== 'EXPORT' && p.status === 'ACTIVE' && <Button icon={ShoppingCart} onClick={() => setOrder(true)}>New order</Button>}
        </>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Revenue (12 months)" value={fmtINR(st.rev12)} icon={IndianRupee} tone="green" />
        <Stat label="Average order" value={fmtINR(st.avgOrder)} sub={`${st.orders} orders`} icon={ShoppingCart} />
        <Stat label="Last order" value={st.lastOrder ? fmtDate(st.lastOrder) : '—'} sub={st.daysSince != null ? `${st.daysSince} days ago` : 'No orders yet'} icon={Clock} tone={inactive ? 'red' : 'blue'} />
        <Stat label="Advance pending" value={fmtINR(st.outstanding)} sub="confirmed, unpaid orders" icon={AlertTriangle} tone="amber" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={TABS} />
      {tab === 'Overview' && <Overview p={p} pl={pl} user={user} />}
      {tab === 'Orders' && <OrdersTab p={p} />}
      {tab === 'Invoices & LR' && <InvoicesTab p={p} />}
      {tab === 'Payments' && <PaymentsTab p={p} />}
      {tab === 'Pricing' && <PricingTab p={p} />}
      {tab === 'Dealer stock' && <StockTab p={p} />}
      {tab === 'Tickets' && <TicketsTab p={p} />}
      {tab === 'Tasks' && <TasksTab p={p} onNew={() => setTask(true)} />}
      {tab === 'Schemes' && <SchemesTab p={p} />}
      {tab === 'KYC' && <KycTab p={p} />}
      {edit && <EditDealer id={p.id} onClose={() => setEdit(false)} />}
      {order && <NewOrderModal open onClose={() => setOrder(false)} initial={{ partnerId: p.id }} />}
      {task && <TaskModal open onClose={() => setTask(false)} initial={{ partnerId: p.id, title: `Follow up with ${p.name}` }} />}
    </div>
  )
}

function Overview({ p, pl, user }) {
  const state = useStore()
  const series = useMemo(() => monthlyRevenue(state, [p.id], 12), [state.invoices, p.id]) // eslint-disable-line
  const targets = (state.targets || []).filter((t) => t.ownerType === 'DEALER' && t.ownerId === p.id).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 3).map((t) => targetRow(state, t))
  const fms = useMemo(() => fmsMap(state, 90), [state.invoices]) // eslint-disable-line
  const top = useMemo(() => {
    const m = {}
    for (const i of state.invoices.filter((x) => x.partnerId === p.id && x.date >= addDays(today(), -365))) for (const l of i.lines) m[l.productId] = (m[l.productId] || 0) + l.amount
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [state.invoices, p.id])
  const tr = state.transporters.find((t) => t.id === p.transporterId)
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Revenue – last 12 months" subtitle="Invoiced taxable value"><TrendChart data={series} series={[{ key: 'revenue', label: 'Revenue' }]} height={240} /></Card>
        <Card title="Top products (12 months)">
          {top.length ? <ul className="divide-y divide-slate-100">{top.map(([pid, v]) => <li key={pid} className="py-2 flex items-center justify-between gap-3"><ProductCell id={pid} /><div className="flex items-center gap-2"><FMSBadge cls={fms[pid]?.cls} /><span className="tabular-nums text-sm font-medium w-24 text-right">{fmtINR(v)}</span></div></li>)}</ul> : <div className="text-sm text-slate-400">No purchases yet.</div>}
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Profile">
          <div className="flex items-center gap-3 mb-3"><Avatar name={p.contact} /><div><div className="font-medium text-slate-800">{p.contact}</div><div className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</div></div></div>
          <DescriptionList cols={1} items={[
            ['Email', p.email], ['Address', <span key="a" className="inline-flex gap-1"><MapPin className="w-3.5 h-3.5 mt-0.5 text-slate-400" />{p.address?.includes(p.city) ? p.address : `${p.address}, ${p.city}`}</span>],
            ['GSTIN / PAN', `${p.gstin || '—'} / ${p.pan || '—'}`], ['Salesperson', user(p.salespersonId)?.name], ['Price list', pl?.name],
            ['Payment terms', p.paymentTerms || 'Advance'], ['Transporter', tr?.name || '—'], ['Onboarded', fmtDate(p.onboardedAt)],
            p.lastVisitDate && ['Last visit', fmtDate(p.lastVisitDate)], p.notes && ['Notes', p.notes],
          ]} />
        </Card>
        {targets.length > 0 && (
          <Card title="Targets">
            {targets.map((t) => <div key={t.id} className="py-1.5"><div className="flex justify-between text-sm"><span>{periodLabel(t.periodType, t.period)}</span><span className="tabular-nums">{fmtINR(t.achieved)} / {fmtINR(t.amount)}</span></div><div className="h-2 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className={cx('h-full rounded-full', t.pct >= 100 ? 'bg-emerald-500' : t.pct >= 90 ? 'bg-amber-500' : 'bg-brand-500')} style={{ width: `${Math.min(100, t.pct)}%` }} /></div><div className="text-[11px] text-slate-500 mt-0.5">{t.pct.toFixed(0)}%{t.slab ? ` · ${t.slab.incentivePct}% incentive slab` : ''}</div></div>)}
          </Card>
        )}
      </div>
    </div>
  )
}

function OrdersTab({ p }) {
  const orders = useStore((s) => s.salesOrders).filter((s) => s.partnerId === p.id)
  const navigate = useNavigate()
  return <DataTable rows={orders} onRowClick={(r) => navigate(`/erp/sales/orders/${r.id}`)} exportName={`${p.code}-orders`} initialSort={{ key: 'date', dir: 'desc' }} pageSize={10}
    filters={[{ key: 'status', label: 'statuses', options: ['PENDING_REVIEW', 'CONFIRMED', 'PAID', 'INVOICED', 'DISPATCHED', 'CANCELLED'].map((s) => ({ value: s, label: s.replace('_', ' ').toLowerCase() })) }]}
    columns={[
      { key: 'number', header: 'Order', render: (r) => <span className="font-mono text-xs font-semibold">{r.number}</span> },
      { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'source', header: 'Source' },
      { key: 'items', header: 'Items', align: 'right', value: (r) => r.lines.length },
      { key: 'total', header: 'Total', align: 'right', render: (r) => fmtINR(r.total) },
      { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    ]} />
}

function InvoicesTab({ p }) {
  const state = useStore()
  const invs = state.invoices.filter((i) => i.partnerId === p.id)
  const dl = (inv) => downloadDocHtml(`${inv.number.replace(/\//g, '-')}.html`, 'Tax Invoice', inv.number, [['Date', fmtDate(inv.date)], ['Bill to', p.name], ['GSTIN', p.gstin || '—']], inv.lines, [['Taxable value', fmtINR(inv.subtotal, true)], ['GST @18%', fmtINR(inv.gst, true)], ['Total', fmtINR(inv.total, true)]], state.settings.company, state.products)
  return <DataTable rows={invs} exportName={`${p.code}-invoices`} initialSort={{ key: 'date', dir: 'desc' }} pageSize={10}
    columns={[
      { key: 'number', header: 'Invoice', render: (r) => <span className="font-mono text-xs font-semibold">{r.number}</span> },
      { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'total', header: 'Amount', align: 'right', render: (r) => fmtINR(r.total) },
      { key: 'transporter', header: 'Transporter', value: (r) => state.transporters.find((t) => t.id === r.transporterId)?.name },
      { key: 'lr', header: 'LR', value: (r) => r.lr?.number, render: (r) => r.lr ? <span className="text-xs">{r.lr.number} · {fmtDate(r.lr.date)}</span> : <span className="text-xs text-amber-600">Awaiting LR</span> },
      { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { key: 'dl', header: '', sortable: false, export: false, render: (r) => <Button size="sm" variant="ghost" icon={FileText} onClick={() => dl(r)}>Download</Button> },
    ]} />
}

function PaymentsTab({ p }) {
  const state = useStore()
  const rec = state.receipts.filter((r) => r.partnerId === p.id)
  const so = Object.fromEntries(state.salesOrders.map((s) => [s.id, s.number]))
  return (
    <div className="space-y-4">
      <Grid cols={3}>
        <Stat label="Received (12 months)" value={fmtINR(sum(rec.filter((r) => r.date >= addDays(today(), -365)), (r) => r.amount))} tone="green" />
        <Stat label="Receipts" value={rec.length} />
        <Stat label="Average days order → payment" value="Same day" sub="advance model" tone="ink" />
      </Grid>
      <DataTable rows={rec} exportName={`${p.code}-receipts`} initialSort={{ key: 'date', dir: 'desc' }} pageSize={10}
        columns={[
          { key: 'number', header: 'Receipt', render: (r) => <span className="font-mono text-xs">{r.number}</span> },
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'so', header: 'Order', value: (r) => so[r.soId] },
          { key: 'mode', header: 'Mode' },
          { key: 'ref', header: 'Reference' },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => fmtINR(r.amount) },
        ]} />
    </div>
  )
}

function PricingTab({ p }) {
  const state = useStore()
  const update = useStore((s) => s.updatePartnerProfile)
  const scope = useScope()
  const [plId, setPlId] = useState(p.priceListId)
  const [extra, setExtra] = useState(p.extraDiscountPct || 0)
  const [cats, setCats] = useState(p.authorizedCategories?.length ? p.authorizedCategories : CATEGORIES)
  const [cat, setCat] = useState('')
  const [stockDisplay, setStockDisplay] = useState(p.stockDisplay || '')
  const dirty = plId !== p.priceListId || Number(extra) !== Number(p.extraDiscountPct || 0) || cats.join() !== (p.authorizedCategories || CATEGORIES).join() || stockDisplay !== (p.stockDisplay || '')
  const save = async () => {
    if (!(await confirm({ title: 'Update dealer pricing?', message: 'New orders and portal prices for this dealer will use the updated terms immediately.', confirmText: 'Save pricing' }))) return
    update(p.id, { priceListId: plId, extraDiscountPct: Number(extra) || 0, authorizedCategories: cats, stockDisplay: stockDisplay || null })
    toast.success('Pricing terms updated', `${p.name} now on ${state.priceLists.find((x) => x.id === plId)?.name}`)
  }
  const rows = state.products.filter((x) => x.active && (!cat || x.category === cat) && cats.includes(x.category)).map((x) => {
    const q = quotePrice(state, { productId: x.id, partnerId: p.id, qty: 1 })
    return { ...x, net: q.unitPrice, disc: q.totalDiscPct, labels: q.discounts.map((d) => `${d.label}${d.pct ? ` ${d.pct}%` : ''}`).join(' + ') }
  })
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="Pricing terms" subtitle={scope.canManage ? 'Applied automatically in orders & on the portal' : 'Managed by the Sales Manager'}>
        <div className="space-y-3">
          <Field label="Price list"><Select disabled={!scope.canManage} value={plId} onChange={(e) => setPlId(e.target.value)} options={state.priceLists.map((x) => ({ value: x.id, label: `${x.name} (${x.kind === 'EXPORT' ? `cost + ${x.marginPct}%` : `${x.baseDiscountPct}% off MRP`})` }))} /></Field>
          <Field label="Extra dealer discount %"><NumberInput disabled={!scope.canManage} min={0} max={10} step="0.5" value={extra} onChange={setExtra} /></Field>
          <Field label="Portal stock visibility" hint="What this partner sees for Btali stock">
            <Select disabled={!scope.canManage} value={stockDisplay} onChange={(e) => setStockDisplay(e.target.value)} options={[{ value: '', label: `Company default (${state.settings.dealerPortal?.stockDisplay === 'QUANTITY' ? 'quantities' : 'status only'})` }, { value: 'STATUS', label: 'Status indicators only' }, { value: 'QUANTITY', label: 'Show available quantities' }]} />
          </Field>
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1">Authorised categories</div>
            <div className="grid grid-cols-1 gap-1.5">{CATEGORIES.map((c) => <Checkbox key={c} label={c} checked={cats.includes(c)} onChange={(v) => scope.canManage && setCats((s) => (v ? [...s, c] : s.filter((x) => x !== c)))} />)}</div>
          </div>
          {scope.canManage && <Button icon={Save} disabled={!dirty} onClick={save} className="w-full">Save pricing</Button>}
        </div>
      </Card>
      <div className="lg:col-span-2">
        <DataTable rows={rows} exportName={`${p.code}-price-list`} pageSize={12} filters={[]} toolbar={<Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All categories" options={cats} className="sm:w-48" />}
          columns={[
            { key: 'sku', header: 'Product', render: (r) => <ProductCell product={r} /> },
            { key: 'mrp', header: 'MRP', align: 'right', render: (r) => fmtINR(r.mrp) },
            { key: 'disc', header: 'Discount', align: 'right', render: (r) => <span title={r.labels}>{r.disc ? `${r.disc}%` : 'Net rate'}</span> },
            { key: 'net', header: 'Dealer net', align: 'right', render: (r) => <b>{fmtINR(r.net, true)}</b> },
          ]} />
      </div>
    </div>
  )
}

function StockTab({ p }) {
  const state = useStore()
  const sendReorderReminder = useStore((s) => s.sendReorderReminder)
  const rows = Object.entries(p.stock || {}).map(([pid, q]) => ({ id: pid, productId: pid, qty: q, min: p.stockMin?.[pid] ?? 3, low: q < (p.stockMin?.[pid] ?? 3), name: state.products.find((x) => x.id === pid)?.shortName }))
  const low = rows.filter((r) => r.low)
  if (!rows.length) return <Card><EmptyState title="No stock reported" message="This dealer has not shared stock on the portal yet. Ask them to update stock from the Dealer Portal → My Stock." /></Card>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><span>Last updated {p.stockUpdatedAt ? fmtDate(p.stockUpdatedAt) : '—'} · {rows.length} SKUs · <b className="text-red-600">{low.length} below min</b></span>
        {low.length > 0 && <Button size="sm" icon={Mail} onClick={() => { sendReorderReminder(p.id, low.map((r) => r.productId)); toast.success('Restock reminder emailed', `${low.length} items listed`) }}>Send restock reminder</Button>}</div>
      <DataTable rows={rows} exportName={`${p.code}-dealer-stock`} initialSort={{ key: 'low', dir: 'desc' }} rowClass={(r) => (r.low ? 'bg-red-50/40' : '')}
        columns={[
          { key: 'name', header: 'Product', render: (r) => <ProductCell id={r.productId} /> },
          { key: 'qty', header: 'Dealer stock', align: 'right' },
          { key: 'min', header: 'Min level', align: 'right' },
          { key: 'low', header: 'Status', value: (r) => (r.low ? 1 : 0), render: (r) => r.low ? <Badge tone="red">Below min</Badge> : <Badge tone="green">OK</Badge> },
        ]} />
    </div>
  )
}

function TicketsTab({ p }) {
  const tickets = useStore((s) => s.tickets).filter((t) => t.partnerId === p.id)
  return <DataTable rows={tickets} exportName={`${p.code}-tickets`} initialSort={{ key: 'createdAt', dir: 'desc' }}
    empty={<EmptyState title="No tickets" message="Complaints raised by this dealer appear here." />}
    columns={[
      { key: 'number', header: 'Ticket', render: (r) => <span className="font-mono text-xs">{r.number}</span> },
      { key: 'createdAt', header: 'Raised', render: (r) => timeAgo(r.createdAt) },
      { key: 'subject', header: 'Subject' },
      { key: 'category', header: 'Category', render: (r) => <span className="text-xs">{r.category.replace(/_/g, ' ').toLowerCase()}</span> },
      { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
      { key: 'stage', header: 'Stage', render: (r) => <StatusBadge status={r.stage} /> },
    ]} />
}

function TasksTab({ p, onNew }) {
  const tasks = useStore((s) => s.tasks || []).filter((t) => t.partnerId === p.id)
  const completeTask = useStore((s) => s.completeTask)
  const done = async (t) => {
    const o = await prompt({ title: 'Complete task', label: 'Outcome', required: true, confirmText: 'Mark done' })
    if (!o) return
    completeTask(t.id, o)
    toast.success('Task completed')
  }
  return <DataTable rows={tasks} initialSort={{ key: 'dueDate', dir: 'desc' }} toolbar={<Button size="sm" icon={Plus} onClick={onNew}>New task</Button>}
    empty={<EmptyState title="No tasks yet" message="Create visits, follow-ups and collections linked to this dealer." />}
    columns={[
      { key: 'title', header: 'Task', render: (r) => <div><div className={cx('font-medium', r.status === 'DONE' && 'text-slate-400 line-through')}>{r.title}</div>{r.outcome && <div className="text-xs text-slate-500">{r.outcome}</div>}</div> },
      { key: 'type', header: 'Type', render: (r) => taskTypeLabel(r.type) },
      { key: 'assigneeId', header: 'Owner', render: (r) => <UserName id={r.assigneeId} /> },
      { key: 'dueDate', header: 'Due', render: (r) => <span className={cx(r.status === 'OPEN' && r.dueDate < today() && 'text-red-600 font-medium')}>{fmtDate(r.dueDate)}</span> },
      { key: 'status', header: 'Status', render: (r) => r.status === 'OPEN' ? <Button size="sm" variant="soft" onClick={() => done(r)}>Mark done</Button> : <StatusBadge status="DONE" /> },
    ]} />
}

function SchemesTab({ p }) {
  const state = useStore()
  const orders = state.salesOrders.filter((s) => s.partnerId === p.id && s.status !== 'CANCELLED' && s.appliedSchemes?.length)
  const rows = state.schemes.map((sc) => {
    const used = orders.filter((o) => o.appliedSchemes.includes(sc.id))
    const benefit = sum(used, (o) => sum(o.lines.filter((l) => (l.schemeIds || []).includes(sc.id) || l.free), (l) => {
      if (l.free) return l.productId === sc.freeProductId ? l.qty * (state.products.find((x) => x.id === l.productId)?.landedCost || 0) : 0
      const d = (l.discounts || []).find((x) => x.label.includes(sc.code))
      return d ? (l.mrp || 0) * l.qty * (d.pct / 100) : 0
    }))
    const live = sc.active && sc.from <= today() && sc.to >= today()
    const eligible = (!sc.regions?.length || sc.regions.includes(p.region)) && (!sc.partnerIds?.length || sc.partnerIds.includes(p.id))
    return { ...sc, uses: used.length, benefit: round2(benefit), live, eligible }
  }).filter((r) => r.uses || (r.live && r.eligible))
  return <DataTable rows={rows} searchable={false} empty={<EmptyState title="No scheme activity" />}
    columns={[
      { key: 'code', header: 'Scheme', render: (r) => <div><Badge tone="violet">{r.code}</Badge><div className="text-xs text-slate-600 mt-1">{r.name}</div></div> },
      { key: 'type', header: 'Type' },
      { key: 'period', header: 'Period', value: (r) => `${fmtDate(r.from)} – ${fmtDate(r.to)}` },
      { key: 'live', header: 'Status', render: (r) => r.live ? <Badge tone="green">Live{r.eligible ? '' : ' (not eligible)'}</Badge> : <Badge>Ended</Badge> },
      { key: 'uses', header: 'Orders using', align: 'right' },
      { key: 'benefit', header: 'Benefit to dealer', align: 'right', render: (r) => fmtINR(r.benefit) },
    ]} />
}

function KycTab({ p }) {
  const addKyc = useStore((s) => s.addPartnerKyc)
  const removeKyc = useStore((s) => s.removePartnerKyc)
  const required = ['GST Certificate', 'PAN Card', 'Cancelled Cheque', 'Shop Establishment / Trade Licence']
  const have = (k) => (p.kyc || []).some((a) => a.name.toLowerCase().replace(/[^a-z]/g, '').includes(k.toLowerCase().split(' ')[0].replace(/[^a-z]/g, '')) || a.docType === k)
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="KYC checklist">
        <ul className="space-y-2 text-sm">{required.map((k) => <li key={k} className="flex justify-between gap-2"><span>{k}</span>{have(k) ? <Badge tone="green">On file</Badge> : <Badge tone="amber">Missing</Badge>}</li>)}</ul>
        <div className="mt-4 text-xs text-slate-500"><KV label="GSTIN" value={p.gstin || '—'} /><KV label="PAN" value={p.pan || '—'} /></div>
      </Card>
      <Card title="Documents" className="lg:col-span-2">
        <div className="space-y-3">
          <AttachmentList items={p.kyc || []} onRemove={async (a) => { if (await confirm({ title: 'Remove document?', message: a.name, tone: 'danger', confirmText: 'Remove' })) { removeKyc(p.id, a.id); toast.success('Document removed') } }} empty="No KYC documents uploaded." />
          <FileUpload compact label="Upload KYC documents (GST, PAN, cheque, licence)" onFiles={(atts) => { addKyc(p.id, atts); toast.success(`${atts.length} document(s) uploaded`) }} />
        </div>
      </Card>
    </div>
  )
}
