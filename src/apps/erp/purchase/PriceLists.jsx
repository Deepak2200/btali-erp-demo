import React, { useMemo, useState } from 'react'
import { ListOrdered, Send, Download, AlertTriangle, History, Pencil, BadgePercent, CalendarClock } from 'lucide-react'
import { useStore } from '../../../store'
import {
  PageHeader, Card, Grid, Stat, Button, Badge, Tabs, Modal, Drawer, Field, NumberInput, Textarea, Checkbox, Alert, KV, Select, toast, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, UserName } from '../../../components/business'
import { fmtINR, fmtDate, fmtPct, round2, exportCSV, daysBetween } from '../../../lib/format'
import { priceListRow, mrpFromVendorRate } from '../../../lib/pricing'

const LISTS = ['pl1', 'pl2', 'pl3']
const rowFor = (p, pl, settings) => {
  const base = priceListRow(p, pl, settings)
  const ov = pl?.overrides?.[p.id]
  const net = ov ?? base.dealerNet
  const margin = round2(net - p.landedCost)
  const marginPct = net ? round2((margin / net) * 100) : 0
  return { net, override: ov != null, margin, marginPct, below: marginPct < (settings.targetMarginPct ?? 12) }
}

export default function PriceLists() {
  const products = useStore((s) => s.products)
  const priceLists = useStore((s) => s.priceLists)
  const settings = useStore((s) => s.settings)
  const versions = useStore((s) => s.priceListVersions) || []
  const shipments = useStore((s) => s.shipments)
  const [tab, setTab] = useState('gen')
  const [edit, setEdit] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const pls = LISTS.map((id) => priceLists.find((p) => p.id === id)).filter(Boolean)

  const rows = useMemo(() => products.filter((p) => p.active).map((p) => {
    const r = { id: p.id, sku: p.sku, name: p.shortName, category: p.category, landed: p.landedCost, mrp: p.mrp, suggested: mrpFromVendorRate(p.vendorRate, p.currency, settings) }
    for (const pl of pls) r[pl.id] = rowFor(p, pl, settings)
    r.below = pls.some((pl) => pl.kind === 'DEALER' && r[pl.id].below)
    r.minMargin = Math.min(...pls.map((pl) => r[pl.id].marginPct))
    return r
  }), [products, priceLists, settings]) // eslint-disable-line
  const below = rows.filter((r) => r.below)
  const lastPub = versions[0]
  const lastFinal = shipments.map((s) => s.landedCost?.finalizedAt).filter(Boolean).sort().pop()
  const stale = lastFinal && (!lastPub || lastFinal > lastPub.ts)

  const exportCurrent = () => exportCSV(`btali-price-list-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
    { header: 'SKU', key: 'sku' }, { header: 'Product', key: 'name' }, { header: 'Category', key: 'category' }, { header: 'Landed cost', key: 'landed' }, { header: 'MRP', key: 'mrp' },
    ...pls.flatMap((pl) => [{ header: `${pl.name} net`, value: (r) => r[pl.id].net }, { header: `${pl.name} margin %`, value: (r) => r[pl.id].marginPct }]),
    { header: 'Below target', value: (r) => (r.below ? 'Yes' : '') },
  ])

  return (
    <div>
      <PageHeader title="Price List Generator" subtitle={`Landed cost → MRP → dealer net for every price list · target margin ${settings.targetMarginPct}%`}
        actions={<><Button variant="secondary" icon={Download} onClick={exportCurrent}>Export CSV</Button><Button icon={Send} onClick={() => setPublishing(true)}>Publish to Sales</Button></>} />
      {stale && <Alert tone="warn" className="mb-4" title="Landed cost changed since the last release">A container was finalised on {fmtDate(lastFinal)}. Review margins and publish a new version so Sales and dealers see current prices.</Alert>}
      <Grid cols={4} className="mb-5">
        <Stat label="Active products" value={rows.length} icon={ListOrdered} tone="ink" />
        <Stat label="Below target margin" value={below.length} icon={AlertTriangle} tone={below.length ? 'red' : 'green'} sub={`< ${settings.targetMarginPct}% on a dealer list`} />
        <Stat label="Current versions" value={pls.map((p) => `v${p.version}`).join(' · ')} icon={BadgePercent} tone="blue" sub={pls.map((p) => p.name.split(' ')[0]).join(' · ')} />
        <Stat label="Last release" value={lastPub ? fmtDate(lastPub.date) : '—'} icon={CalendarClock} tone="green" sub={lastPub ? `${lastPub.number} · ${lastPub.leadDays ?? '—'} d after landed cost` : ''} />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'gen', label: 'Generator' }, { key: 'history', label: 'Version history', count: versions.length }]} />
      {tab === 'gen' ? (
        <DataTable rows={rows} onRowClick={(r) => setEdit(r.id)} pageSize={15} searchPlaceholder="Search SKU or product…" rowClass={(r) => (r.below ? 'bg-red-50/40' : '')}
          filters={[{ key: 'category', label: 'categories', options: [...new Set(rows.map((r) => r.category))] }, { key: 'flag', label: 'margins', value: (r) => (r.below ? 'below' : 'ok'), options: [{ value: 'below', label: 'Below target' }, { value: 'ok', label: 'On target' }] }]}
          columns={[
            { key: 'name', header: 'Product', render: (r) => <ProductCell id={r.id} /> },
            { key: 'landed', header: 'Landed', align: 'right', render: (r) => fmtINR(r.landed) },
            { key: 'mrp', header: 'MRP', align: 'right', render: (r) => <span className="font-semibold">{fmtINR(r.mrp)}</span> },
            ...pls.map((pl) => ({
              key: pl.id, header: `${pl.name.split(' ')[0]} −${pl.baseDiscountPct}%`, align: 'right', value: (r) => r[pl.id].marginPct,
              render: (r) => (
                <div>
                  <div className="tabular-nums">{fmtINR(r[pl.id].net, true)}{r[pl.id].override && <Badge tone="violet" className="ml-1">Special</Badge>}</div>
                  <div className={cx('text-[11px] tabular-nums', r[pl.id].below ? 'text-red-600 font-semibold' : 'text-emerald-600')}>{fmtPct(r[pl.id].marginPct)} margin</div>
                </div>
              ),
            })),
            { key: 'flag', header: '', sortable: false, render: (r) => (r.below ? <Badge tone="red">Below target</Badge> : null) },
          ]} />
      ) : <VersionHistory versions={versions} priceLists={priceLists} />}
      {edit && <EditDrawer productId={edit} onClose={() => setEdit(null)} pls={pls} />}
      {publishing && <PublishModal onClose={() => setPublishing(false)} pls={pls} below={below} lastFinal={lastFinal} />}
    </div>
  )
}

function EditDrawer({ productId, onClose, pls }) {
  const p = useStore((s) => s.products.find((x) => x.id === productId))
  const settings = useStore((s) => s.settings)
  const upsertProduct = useStore((s) => s.upsertProduct)
  const setOverride = useStore((s) => s.setPriceListOverride)
  const [mrp, setMrp] = useState(p.mrp)
  const [ov, setOv] = useState(Object.fromEntries(pls.map((pl) => [pl.id, pl.overrides?.[p.id] ?? ''])))
  const preview = { ...p, mrp: Number(mrp) || 0 }
  const maxDisc = Math.max(...pls.map((pl) => pl.baseDiscountPct))
  const targetMrp = Math.ceil(p.landedCost / (1 - settings.targetMarginPct / 100) / (1 - maxDisc / 100) / 10) * 10
  const suggested = mrpFromVendorRate(p.vendorRate, p.currency, settings)
  const save = () => {
    if (!(mrp > 0)) return toast.error('MRP must be greater than zero')
    if (Number(mrp) !== p.mrp) upsertProduct({ id: p.id, mrp: Number(mrp) })
    for (const pl of pls) {
      const v = ov[pl.id]
      if ((v === '' ? undefined : Number(v)) !== pl.overrides?.[p.id]) setOverride(pl.id, p.id, v === '' ? null : Number(v))
    }
    toast.success('Pricing updated', 'Publish a new version to release it to Sales')
    onClose()
  }
  return (
    <Drawer open onClose={onClose} title={p.name} subtitle={`${p.sku} · landed ${fmtINR(p.landedCost)} · vendor ${p.currency} ${p.vendorRate}`} width="max-w-xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save pricing</Button></>}>
      <Field label="MRP (₹)" hint={`Formula: vendor rate × FX × ${settings.mrpMultiplier} = ${fmtINR(suggested)} · MRP for ${settings.targetMarginPct}% margin on all lists ≥ ${fmtINR(targetMrp)}`}>
        <NumberInput min={0} value={mrp} onChange={setMrp} />
      </Field>
      <div className="flex gap-2 mt-2"><Button size="sm" variant="soft" onClick={() => setMrp(suggested)}>Use formula MRP</Button><Button size="sm" variant="soft" onClick={() => setMrp(targetMrp)}>Use target-margin MRP</Button></div>
      <h4 className="text-sm font-semibold mt-6 mb-2">Dealer net by price list</h4>
      <div className="space-y-3">
        {pls.map((pl) => {
          const r = rowFor(preview, { ...pl, overrides: { ...pl.overrides, [p.id]: ov[pl.id] === '' ? undefined : Number(ov[pl.id]) } }, settings)
          return (
            <div key={pl.id} className="border border-slate-200 rounded-xl p-3">
              <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium">{pl.name}</span><Badge tone={r.below ? 'red' : 'green'}>{fmtPct(r.marginPct)} margin</Badge></div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <KV label={`MRP less ${pl.baseDiscountPct}%`} value={fmtINR(round2(preview.mrp * (1 - pl.baseDiscountPct / 100)), true)} />
                <Field label="Special net price (optional)"><NumberInput min={0} value={ov[pl.id]} onChange={(v) => setOv((o) => ({ ...o, [pl.id]: v }))} placeholder="Formula price" /></Field>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Net {fmtINR(r.net, true)} · margin {fmtINR(r.margin)} per unit</div>
            </div>
          )
        })}
      </div>
    </Drawer>
  )
}

function PublishModal({ onClose, pls, below, lastFinal }) {
  const publish = useStore((s) => s.publishPriceLists)
  const partners = useStore((s) => s.partners)
  const [ids, setIds] = useState(pls.filter((p) => p.kind === 'DEALER').map((p) => p.id))
  const [note, setNote] = useState('')
  const dealers = partners.filter((p) => (p.type === 'DEALER' || p.type === 'FRANCHISE') && p.status === 'ACTIVE').length
  const go = () => {
    if (!ids.length) return toast.error('Select at least one price list')
    const rec = publish({ note, priceListIds: ids, trigger: lastFinal ? `Landed cost finalised ${fmtDate(lastFinal)}` : 'Manual revision' })
    toast.success(`${rec.number} published`, `Sales team notified · price list emailed to ${dealers} dealers & stores`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Publish price list" subtitle="Bumps the version, makes prices live for Sales & dealer portal and emails partners"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} onClick={go}>Publish & notify</Button></>}>
      <div className="space-y-2 mb-4">
        {pls.map((pl) => <Checkbox key={pl.id} checked={ids.includes(pl.id)} onChange={(v) => setIds((s) => (v ? [...s, pl.id] : s.filter((x) => x !== pl.id)))} label={`${pl.name} – v${pl.version} → v${pl.version + 1}`} />)}
      </div>
      {below.length > 0 && <Alert tone="warn" className="mb-3" title={`${below.length} product(s) below ${useStore.getState().settings.targetMarginPct}% target margin`}>{below.slice(0, 5).map((r) => r.sku).join(', ')}{below.length > 5 ? ` and ${below.length - 5} more` : ''}. You can still publish; consider revising MRP first.</Alert>}
      <Field label="Release note"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pressure washer prices revised after SH/26-27/0022 landed cost" /></Field>
      <p className="text-xs text-slate-500 mt-2">Email goes to {dealers} active dealers & franchise stores; Sales Manager and executives get an in-app notification.</p>
    </Modal>
  )
}

function VersionHistory({ versions, priceLists }) {
  const name = (id) => priceLists.find((p) => p.id === id)?.name || id
  const download = (v) => exportCSV(`${v.number}.csv`, v.rows || [], [
    { header: 'SKU', key: 'sku' }, { header: 'Product', key: 'name' }, { header: 'Landed cost', key: 'landedCost' }, { header: 'MRP', key: 'mrp' },
    ...['pl1', 'pl2', 'pl3'].map((id) => ({ header: `${name(id)} net`, key: id })),
  ])
  return (
    <DataTable rows={versions} exportName="price-list-versions" searchPlaceholder="Search versions…"
      columns={[
        { key: 'number', header: 'Version', render: (v) => <div><div className="font-medium">{v.number}</div><div className="text-[11px] text-slate-500">{fmtDate(v.date)}</div></div> },
        { key: 'lists', header: 'Price lists', value: (v) => v.priceListIds.map((id) => `${name(id)} v${v.versions[id]}`).join(', '), render: (v) => <div className="flex flex-wrap gap-1">{v.priceListIds.map((id) => <Badge key={id} tone="blue">{name(id)} v{v.versions[id]}</Badge>)}</div> },
        { key: 'trigger', header: 'Trigger' },
        { key: 'note', header: 'Note', render: (v) => <span className="text-xs text-slate-600">{v.note || '—'}</span> },
        { key: 'leadDays', header: 'Lead time', align: 'right', render: (v) => (v.leadDays != null ? `${v.leadDays} d` : '—') },
        { key: 'belowTarget', header: 'Below target', align: 'right' },
        { key: 'by', header: 'Published by', value: (v) => v.publishedBy, render: (v) => <UserName id={v.publishedBy} /> },
        { key: 'dl', header: '', sortable: false, render: (v) => <Button size="sm" variant="ghost" icon={Download} onClick={(e) => { e.stopPropagation(); download(v); toast.success(`${v.number}.csv downloaded`) }}>CSV</Button> },
      ]} />
  )
}
