import React, { useMemo, useState } from 'react'
import { Gift, Plus, Pencil, Trash2, Power, Percent, Wallet, TrendingUp, X, Download } from 'lucide-react'
import { useStore } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Button, IconButton, Modal, Field, FormGrid, Input, NumberInput, Select, Textarea, Combobox, Checkbox, Switch,
  Tabs, Badge, Progress, EmptyState, Alert, toast, confirm,
} from '../../../components/ui'
import { BarsChart } from '../../../components/business'
import { fmtINR, fmtCompact, fmtDate, fmtNum, today, addDays, round2, exportCSV, daysBetween } from '../../../lib/format'
import { useScope, CATEGORIES, REGIONS } from './_shared'

const TYPES = [
  { value: 'SEASONAL', label: 'Seasonal % discount', tone: 'brand' },
  { value: 'SLAB', label: 'Volume slab (extra % above qty)', tone: 'blue' },
  { value: 'COMBO', label: 'Combo / bundle', tone: 'violet' },
  { value: 'BOGO', label: 'Buy X get Y free', tone: 'green' },
]
const typeMeta = (t) => TYPES.find((x) => x.value === t) || TYPES[0]
const DEFAULT_BUDGET = { SEASONAL: 200000, SLAB: 100000, COMBO: 75000, BOGO: 25000 }
const budgetOf = (s) => (s.budget != null ? Number(s.budget) || 0 : DEFAULT_BUDGET[s.type] || 0)
const phase = (s) => (!s.active ? 'INACTIVE' : s.from && s.from > today() ? 'UPCOMING' : s.to && s.to < today() ? 'EXPIRED' : 'LIVE')

const applies = (s, product, partner) => {
  if (!product) return false
  if (s.regions?.length && partner && !s.regions.includes(partner.region)) return false
  if (s.partnerIds?.length && partner && !s.partnerIds.includes(partner.id)) return false
  if (s.type === 'COMBO') return (s.comboItems || []).some((c) => c.productId === product.id)
  if (s.type === 'BOGO') return s.buyProductId === product.id
  const catOk = !s.categories?.length || s.categories.includes(product.category)
  const prodOk = !s.productIds?.length || s.productIds.includes(product.id)
  if (s.categories?.length && s.productIds?.length) return catOk || prodOk
  return catOk && prodOk
}

/** Accrual = discount actually given on orders that carry the scheme + estimated on invoiced sales in the scheme window. */
const computeAccrual = (state, s) => {
  const prod = Object.fromEntries(state.products.map((p) => [p.id, p]))
  const part = Object.fromEntries(state.partners.map((p) => [p.id, p]))
  let discount = 0, revenue = 0, units = 0, freeValue = 0
  const orders = new Set(), dealers = new Set()
  const byMonth = {}
  const add = (date, d, r) => { const k = date.slice(0, 7); byMonth[k] = byMonth[k] || { discount: 0, revenue: 0 }; byMonth[k].discount += d; byMonth[k].revenue += r }
  // exact – orders priced by the engine
  for (const so of state.salesOrders) {
    if (so.status === 'CANCELLED' || !(so.appliedSchemes || []).includes(s.id)) continue
    orders.add(so.id); dealers.add(so.partnerId)
    for (const l of so.lines) {
      if (l.free && (l.schemeIds || []).includes(s.id)) {
        const v = (l.qty || 0) * (prod[l.productId]?.landedCost || 0)
        freeValue += v; discount += v; units += l.qty; add(so.date, v, 0)
        continue
      }
      for (const d of l.discounts || []) {
        if (!d.label?.includes(s.code)) continue
        const combo = /Combo .* on (\d+)/.exec(d.label)
        const base = combo ? l.price * Number(combo[1]) : (l.mrp || 0) * l.qty
        const v = round2((base * (d.pct || 0)) / 100)
        discount += v; revenue += l.amount; units += combo ? Number(combo[1]) : l.qty; add(so.date, v, l.amount)
      }
    }
  }
  // estimate on historical invoices inside the scheme window (pre-engine orders)
  if (s.type === 'SEASONAL' || s.type === 'SLAB') {
    for (const inv of state.invoices) {
      if (!inv.history) continue
      if ((s.from && inv.date < s.from) || (s.to && inv.date > s.to)) continue
      const partner = part[inv.partnerId]
      for (const l of inv.lines) {
        const p = prod[l.productId]
        if (!applies(s, p, partner)) continue
        if (s.type === 'SLAB' && l.qty < (s.minQty || 0)) continue
        const pct = s.type === 'SEASONAL' ? s.discountPct : s.extraPct
        const v = round2((p.mrp * l.qty * (pct || 0)) / 100)
        discount += v; revenue += l.amount; units += l.qty; orders.add(inv.soId); dealers.add(inv.partnerId); add(inv.date, v, l.amount)
      }
    }
  }
  return { discount: round2(discount), revenue: round2(revenue), units, freeValue: round2(freeValue), orders: orders.size, dealers: dealers.size, byMonth }
}

const blank = () => ({ code: '', name: '', type: 'SEASONAL', discountPct: 3, minQty: 25, extraPct: 2, comboItems: [{ productId: '', qty: 1 }, { productId: '', qty: 1 }], comboDiscountPct: 10, buyProductId: '', buyQty: 10, freeProductId: '', freeQty: 1, from: today(), to: addDays(today(), 30), categories: [], productIds: [], regions: [], partnerIds: [], active: true, description: '', budget: 100000 })

function ChipPicker({ options, value, onChange, placeholder, disabled }) {
  return (
    <div>
      <Combobox options={options.filter((o) => !value.includes(o.value))} value="" onChange={(v) => onChange([...value, v])} placeholder={placeholder} disabled={disabled} />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs rounded-full pl-2.5 pr-1 py-0.5">
              {options.find((o) => o.value === v)?.label || v}
              {!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="p-0.5 rounded-full hover:bg-slate-200"><X className="w-3 h-3" /></button>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SchemeForm({ initial, onClose }) {
  const state = useStore()
  const upsertScheme = useStore((s) => s.upsertScheme)
  const [f, setF] = useState(() => ({ ...blank(), ...initial, budget: initial?.id ? budgetOf(initial) : blank().budget, comboItems: initial?.comboItems?.length ? initial.comboItems : blank().comboItems }))
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const prodOpts = state.products.map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: p.category }))
  const dealerOpts = state.partners.filter((p) => p.status === 'ACTIVE' && p.type !== 'EXPORT').map((p) => ({ value: p.id, label: p.name, sub: `${p.city} · ${p.region}` }))
  const toggle = (k, v) => setF((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }))
  const save = () => {
    const code = f.code.trim().toUpperCase()
    if (!code || !f.name.trim()) return toast.error('Code and name are required')
    if (state.schemes.some((s) => s.code === code && s.id !== f.id)) return toast.error('Scheme code already exists')
    if (!f.from || !f.to || f.to < f.from) return toast.error('Valid-to must be after valid-from')
    if (f.type === 'SEASONAL' && !(Number(f.discountPct) > 0)) return toast.error('Enter a discount %')
    if (f.type === 'SLAB' && !(Number(f.minQty) > 0 && Number(f.extraPct) > 0)) return toast.error('Enter slab quantity and extra %')
    if (f.type === 'COMBO' && f.comboItems.filter((c) => c.productId).length < 2) return toast.error('A combo needs at least two products')
    if (f.type === 'BOGO' && !(f.buyProductId && f.freeProductId)) return toast.error('Select buy and free products')
    const data = {
      ...f, code, discountPct: Number(f.discountPct) || 0, minQty: Number(f.minQty) || 0, extraPct: Number(f.extraPct) || 0, comboDiscountPct: Number(f.comboDiscountPct) || 0,
      buyQty: Number(f.buyQty) || 1, freeQty: Number(f.freeQty) || 1, budget: Number(f.budget) || 0,
      comboItems: f.type === 'COMBO' ? f.comboItems.filter((c) => c.productId).map((c) => ({ productId: c.productId, qty: Number(c.qty) || 1 })) : [],
    }
    if (f.type === 'COMBO') data.productIds = data.comboItems.map((c) => c.productId)
    if (f.type === 'BOGO') data.productIds = [f.buyProductId]
    upsertScheme(data)
    toast.success(f.id ? 'Scheme updated' : 'Scheme launched', `${code} – auto-applied in orders & visible on dealer portal`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={f.id ? `Edit ${f.code}` : 'New scheme'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>{f.id ? 'Save changes' : 'Launch scheme'}</Button></>}>
      <div className="space-y-4">
        <FormGrid cols={3}>
          <Field label="Code" required><Input value={f.code} onChange={set('code')} className="uppercase font-mono" placeholder="DIWALI26" /></Field>
          <Field label="Name" required className="md:col-span-2"><Input value={f.name} onChange={set('name')} /></Field>
          <Field label="Type"><Select value={f.type} onChange={set('type')} options={TYPES} /></Field>
          <Field label="Valid from"><Input type="date" value={f.from} onChange={set('from')} /></Field>
          <Field label="Valid to"><Input type="date" value={f.to} onChange={set('to')} /></Field>
        </FormGrid>
        <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/60">
          {f.type === 'SEASONAL' && <FormGrid cols={3}><Field label="Discount %"><NumberInput value={f.discountPct} step="0.5" onChange={set('discountPct')} /></Field></FormGrid>}
          {f.type === 'SLAB' && <FormGrid cols={3}><Field label="Minimum qty per order line"><NumberInput value={f.minQty} onChange={set('minQty')} /></Field><Field label="Extra discount %"><NumberInput value={f.extraPct} step="0.5" onChange={set('extraPct')} /></Field></FormGrid>}
          {f.type === 'COMBO' && (
            <div className="space-y-2">
              {f.comboItems.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Combobox className="flex-1" options={prodOpts} value={c.productId} onChange={(v) => setF((s) => ({ ...s, comboItems: s.comboItems.map((x, j) => (j === i ? { ...x, productId: v } : x)) }))} placeholder="Product" />
                  <NumberInput className="w-20" value={c.qty} min={1} onChange={(v) => setF((s) => ({ ...s, comboItems: s.comboItems.map((x, j) => (j === i ? { ...x, qty: v } : x)) }))} />
                  {f.comboItems.length > 2 && <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => setF((s) => ({ ...s, comboItems: s.comboItems.filter((_, j) => j !== i) }))} />}
                </div>
              ))}
              <div className="flex items-end gap-3 flex-wrap">
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => setF((s) => ({ ...s, comboItems: [...s.comboItems, { productId: '', qty: 1 }] }))}>Add item</Button>
                <Field label="Combo discount %"><NumberInput className="w-28" value={f.comboDiscountPct} onChange={set('comboDiscountPct')} /></Field>
              </div>
            </div>
          )}
          {f.type === 'BOGO' && (
            <FormGrid>
              <Field label="Buy product"><Combobox options={prodOpts} value={f.buyProductId} onChange={set('buyProductId')} /></Field>
              <Field label="Buy qty"><NumberInput value={f.buyQty} min={1} onChange={set('buyQty')} /></Field>
              <Field label="Free product"><Combobox options={prodOpts} value={f.freeProductId} onChange={set('freeProductId')} /></Field>
              <Field label="Free qty"><NumberInput value={f.freeQty} min={1} onChange={set('freeQty')} /></Field>
            </FormGrid>
          )}
        </div>
        {(f.type === 'SEASONAL' || f.type === 'SLAB') && (
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1">Categories (empty = all)</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">{CATEGORIES.map((c) => <Checkbox key={c} label={c} checked={f.categories.includes(c)} onChange={() => toggle('categories', c)} />)}</div>
            <Field label="Specific products" className="mt-3"><ChipPicker options={prodOpts} value={f.productIds} onChange={set('productIds')} placeholder="Add product…" /></Field>
          </div>
        )}
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Regions (empty = all India)</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">{REGIONS.map((r) => <Checkbox key={r} label={r} checked={f.regions.includes(r)} onChange={() => toggle('regions', r)} />)}</div>
        </div>
        <Field label="Restrict to dealers (empty = all eligible)"><ChipPicker options={dealerOpts} value={f.partnerIds} onChange={set('partnerIds')} placeholder="Add dealer…" /></Field>
        <FormGrid>
          <Field label="Budget (₹)" hint="Discount + free goods value allowed for this scheme"><NumberInput value={f.budget} onChange={set('budget')} /></Field>
          <Field label="Status"><div className="pt-2"><Switch checked={f.active} onChange={set('active')} label={f.active ? 'Active' : 'Inactive'} /></div></Field>
        </FormGrid>
        <Field label="Description shown to dealers"><Textarea rows={2} value={f.description} onChange={set('description')} /></Field>
      </div>
    </Modal>
  )
}

const ruleText = (s, state) => {
  const pn = (id) => state.products.find((p) => p.id === id)?.shortName || id
  if (s.type === 'SEASONAL') return `${s.discountPct}% extra off`
  if (s.type === 'SLAB') return `+${s.extraPct}% on ${s.minQty}+ units`
  if (s.type === 'COMBO') return `${s.comboDiscountPct}% off ${(s.comboItems || []).map((c) => `${c.qty}× ${pn(c.productId)}`).join(' + ')}`
  if (s.type === 'BOGO') return `Buy ${s.buyQty} ${pn(s.buyProductId)}, get ${s.freeQty} ${pn(s.freeProductId)} free`
  return ''
}
const scopeText = (s, state) => [
  s.categories?.length ? s.categories.join(', ') : null,
  s.productIds?.length && s.type !== 'COMBO' && s.type !== 'BOGO' ? `${s.productIds.length} products` : null,
  s.regions?.length ? s.regions.join('/') : 'All regions',
  s.partnerIds?.length ? `${s.partnerIds.length} dealers` : null,
].filter(Boolean).join(' · ')

export default function Schemes() {
  const state = useStore()
  const toggleScheme = useStore((s) => s.toggleScheme)
  const removeScheme = useStore((s) => s.removeScheme)
  const scope = useScope()
  const [tab, setTab] = useState('LIVE')
  const [edit, setEdit] = useState(null)
  const acc = useMemo(() => Object.fromEntries(state.schemes.map((s) => [s.id, computeAccrual(state, s)])), [state.schemes, state.salesOrders, state.invoices]) // eslint-disable-line
  const by = (p) => state.schemes.filter((s) => phase(s) === p)
  const list = by(tab)
  const live = by('LIVE')
  const totDisc = live.reduce((a, s) => a + acc[s.id].discount, 0)
  const totBudget = live.reduce((a, s) => a + budgetOf(s), 0)
  const totRev = live.reduce((a, s) => a + acc[s.id].revenue, 0)
  const chart = state.schemes.filter((s) => phase(s) !== 'UPCOMING').map((s) => ({ label: s.code, accrued: acc[s.id].discount, budget: budgetOf(s) }))

  const onToggle = async (s) => {
    if (s.active && !(await confirm({ title: `Deactivate ${s.code}?`, message: 'It will stop applying to new orders immediately.', confirmText: 'Deactivate', tone: 'danger' }))) return
    toggleScheme(s.id)
    toast.success(s.active ? `${s.code} deactivated` : `${s.code} activated`)
  }
  const onDelete = async (s) => {
    if (!(await confirm({ title: `Delete ${s.code}?`, message: 'Past orders keep their scheme reference; the scheme will no longer be listed.', confirmText: 'Delete', tone: 'danger' }))) return
    removeScheme(s.id)
    toast.success('Scheme deleted')
  }
  const exportAll = () => exportCSV('scheme-accrual.csv', state.schemes, [
    { header: 'Code', value: (s) => s.code }, { header: 'Name', value: (s) => s.name }, { header: 'Type', value: (s) => s.type }, { header: 'Status', value: (s) => phase(s) },
    { header: 'From', value: (s) => s.from }, { header: 'To', value: (s) => s.to }, { header: 'Orders', value: (s) => acc[s.id].orders }, { header: 'Dealers', value: (s) => acc[s.id].dealers },
    { header: 'Units', value: (s) => acc[s.id].units }, { header: 'Scheme sales (INR)', value: (s) => acc[s.id].revenue }, { header: 'Discount accrued (INR)', value: (s) => acc[s.id].discount }, { header: 'Budget (INR)', value: (s) => budgetOf(s) },
  ])

  return (
    <div>
      <PageHeader title="Schemes & Promotions" subtitle="Seasonal discounts, volume slabs, combos and BOGO – auto-applied in sales orders and on the Dealer Portal"
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportAll}>Export accrual</Button>
          {scope.canManage && <Button icon={Plus} onClick={() => setEdit(blank())}>New scheme</Button>}
        </>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Live schemes" value={live.length} icon={Gift} tone="brand" sub={`${by('UPCOMING').length} upcoming`} />
        <Stat label="Scheme-driven sales" value={fmtCompact(totRev)} icon={TrendingUp} tone="green" sub="live schemes" />
        <Stat label="Discount accrued" value={fmtCompact(totDisc)} icon={Percent} tone="amber" sub={totRev ? `${((totDisc / totRev) * 100).toFixed(1)}% of scheme sales` : 'no uptake yet'} />
        <Stat label="Budget utilisation" value={totBudget ? `${Math.round((totDisc / totBudget) * 100)}%` : '—'} icon={Wallet} tone={totBudget && totDisc > totBudget ? 'red' : 'ink'} sub={`of ${fmtCompact(totBudget)} budget`} />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { key: 'LIVE', label: 'Live', count: live.length }, { key: 'UPCOMING', label: 'Upcoming', count: by('UPCOMING').length },
        { key: 'EXPIRED', label: 'Expired', count: by('EXPIRED').length }, { key: 'INACTIVE', label: 'Inactive', count: by('INACTIVE').length },
      ]} />
      {list.length === 0 ? <Card><EmptyState icon={Gift} title={`No ${tab.toLowerCase()} schemes`} action={scope.canManage && <Button icon={Plus} onClick={() => setEdit(blank())}>New scheme</Button>} /></Card> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
          {list.map((s) => {
            const a = acc[s.id]
            const util = budgetOf(s) ? (a.discount / budgetOf(s)) * 100 : 0
            const left = s.to ? daysBetween(today(), s.to) : null
            return (
              <Card key={s.id} className="flex flex-col" bodyClass="flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-xs font-bold text-ink-900">{s.code}</span><Badge tone={typeMeta(s.type).tone}>{s.type}</Badge>{phase(s) === 'LIVE' && left != null && <Badge tone={left <= 7 ? 'amber' : 'green'} dot>{left}d left</Badge>}</div>
                    <div className="text-sm font-semibold text-slate-800 mt-1">{s.name}</div>
                  </div>
                  {scope.canManage && (
                    <div className="flex shrink-0">
                      <IconButton icon={Pencil} title="Edit" onClick={() => setEdit(s)} />
                      <IconButton icon={Power} title={s.active ? 'Deactivate' : 'Activate'} onClick={() => onToggle(s)} className={s.active ? '!text-emerald-600' : ''} />
                      <IconButton icon={Trash2} tone="danger" title="Delete" onClick={() => onDelete(s)} />
                    </div>
                  )}
                </div>
                <div className="text-sm text-brand-700 font-medium mt-2">{ruleText(s, state)}</div>
                <div className="text-xs text-slate-500 mt-0.5">{scopeText(s, state)}</div>
                <div className="text-xs text-slate-400 mt-0.5">{fmtDate(s.from)} → {fmtDate(s.to)}</div>
                {s.description && <p className="text-xs text-slate-600 mt-2 line-clamp-2">{s.description}</p>}
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] text-slate-400 uppercase">Orders</div><div className="text-sm font-bold">{fmtNum(a.orders)}</div></div>
                  <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] text-slate-400 uppercase">Dealers</div><div className="text-sm font-bold">{fmtNum(a.dealers)}</div></div>
                  <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] text-slate-400 uppercase">Sales</div><div className="text-sm font-bold">{fmtCompact(a.revenue)}</div></div>
                </div>
                <div className="mt-auto pt-3">
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Accrued {fmtINR(a.discount)}{a.freeValue ? ` (free goods ${fmtINR(a.freeValue)})` : ''}</span><span className="text-slate-500">{budgetOf(s) ? `of ${fmtCompact(budgetOf(s))}` : 'no budget'}</span></div>
                  <Progress value={util} tone={util > 100 ? 'red' : util > 80 ? 'amber' : 'green'} showLabel={!!budgetOf(s)} />
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <Card title="Accrual vs budget" subtitle="Discount and free-goods value given under each scheme">
        {chart.length ? <BarsChart data={chart} series={[{ key: 'accrued', label: 'Accrued' }, { key: 'budget', label: 'Budget', color: '#cbd5e1' }]} height={260} /> : <Alert>No scheme data yet.</Alert>}
      </Card>
      {edit && <SchemeForm initial={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}
