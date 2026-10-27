import React, { useMemo, useState } from 'react'
import { Plus, Factory, Ship, Landmark, Truck, Star, Pencil, Globe2 } from 'lucide-react'
import {
  PageHeader, Grid, Stat, Button, Drawer, Tabs, FormGrid, Field, Input, NumberInput, Select, Textarea, Switch, Badge, IconButton, SectionTitle, toast, DescriptionList, Alert,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { useStore } from '../../../store'
import { fmtINR, fmtCompact, fmtNum, sum, daysBetween } from '../../../lib/format'

const TYPE_TABS = [
  { key: 'CHINA', label: 'China suppliers', icon: Factory },
  { key: 'INDIA', label: 'Indian suppliers', icon: Factory },
  { key: 'FORWARDER', label: 'Freight forwarders', icon: Ship },
  { key: 'CHA', label: 'Customs (CHA)', icon: Landmark },
  { key: 'LOGISTICS', label: 'Logistics & 3PL', icon: Truck },
]
const SUBTYPES = { FORWARDER: ['CHINA', 'INDIA', 'DESTINATION'], LOGISTICS: ['WAREHOUSE', 'TRANSPORT', 'PORT_TRANSPORT'] }
const CATS = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']
const blank = (type) => ({ type, name: '', code: '', subtype: SUBTYPES[type]?.[0] || '', country: type === 'CHINA' ? 'China' : 'India', city: '', currency: type === 'CHINA' || (type === 'FORWARDER') ? 'USD' : 'INR', contact: '', email: '', phone: '', paymentTerms: { advancePct: type === 'CHINA' ? 30 : 0, balancePct: type === 'CHINA' ? 70 : 100, creditDays: 30 }, bank: '', gst: '', rating: 4, portal: type === 'CHINA', categories: [] })

const Stars = ({ v }) => (
  <span className="inline-flex items-center gap-0.5 text-amber-500">
    <Star className="w-3.5 h-3.5 fill-current" /><span className="text-xs font-semibold text-slate-700 tabular-nums">{Number(v || 0).toFixed(1)}</span>
  </span>
)

export default function Vendors() {
  const vendors = useStore((s) => s.vendors)
  const pos = useStore((s) => s.purchaseOrders)
  const shipments = useStore((s) => s.shipments)
  const fx = useStore((s) => s.settings.fx)
  const upsertVendor = useStore((s) => s.upsertVendor)
  const notify = useStore((s) => s.notify)
  const sendEmail = useStore((s) => s.sendEmail)
  const [tab, setTab] = useState('CHINA')
  const [f, setF] = useState(null)
  const set = (p) => setF((x) => ({ ...x, ...p }))

  const perf = useMemo(() => {
    const m = {}
    for (const v of vendors) {
      const mine = pos.filter((p) => p.vendorId === v.id && !['REJECTED', 'CANCELLED', 'DRAFT'].includes(p.status))
      const value = sum(mine, (p) => sum(p.lines, (l) => l.qty * l.rate) * (fx[p.currency] || 1))
      const shs = shipments.filter((s) => s.vendorId === v.id || s.forwarderId === v.id || s.indianForwarderId === v.id || s.chaId === v.id)
      const disp = shs.map((s) => s.milestones?.find((x) => x.key === 'VENDOR_DISPATCH')).filter((x) => x?.done)
      const onTime = disp.filter((x) => !x.date || x.date <= x.planned).length
      const arrived = shs.filter((s) => s.ata)
      const etaDelay = arrived.length ? sum(arrived, (s) => daysBetween(s.eta, s.ata)) / arrived.length : null
      m[v.id] = { pos: mine.length, open: mine.filter((p) => !['RECEIVED', 'CLOSED'].includes(p.status)).length, value, shipments: shs.length, otd: disp.length ? Math.round((onTime / disp.length) * 100) : null, etaDelay }
    }
    return m
  }, [vendors, pos, shipments, fx])

  const rows = vendors.filter((v) => v.type === tab)
  const save = () => {
    if (!f.name.trim() || !f.email.trim()) return toast.error('Name and email are required')
    const pt = f.paymentTerms
    if (Number(pt.advancePct) + Number(pt.balancePct) !== 100) return toast.error('Advance % + balance % must equal 100')
    const code = f.code || f.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
    const wasPortal = vendors.find((v) => v.id === f.id)?.portal
    const id = upsertVendor({ ...f, code, rating: Number(f.rating) || 0, paymentTerms: { advancePct: Number(pt.advancePct), balancePct: Number(pt.balancePct), creditDays: Number(pt.creditDays) } })
    if (f.portal && !wasPortal && (f.type === 'CHINA' || f.type === 'INDIA')) {
      sendEmail({ to: f.email, subject: 'Your Btali Vendor Portal access', body: `Dear ${f.contact || 'Partner'},\n\nVendor Portal access has been enabled for ${f.name}. You can now view POs, upload PIs, QC media, packing lists and shipping documents.\n\nRegards,\nBtali Purchase`, ref: code })
      notify({ title: 'Welcome to the Btali Vendor Portal', body: 'Your POs and documents are now available online.', vendorId: id, link: '/vendor/dashboard' })
    }
    toast.success(f.id ? 'Vendor updated' : 'Vendor created', f.name)
    setF(null)
  }
  const togglePortal = (v) => {
    upsertVendor({ ...v, portal: !v.portal })
    if (!v.portal) sendEmail({ to: v.email, subject: 'Your Btali Vendor Portal access', body: `Dear ${v.contact},\n\nVendor Portal access has been enabled for ${v.name}.\n\nRegards,\nBtali Purchase`, ref: v.code })
    toast.success(v.portal ? 'Portal access revoked' : 'Portal access enabled', v.name)
  }

  const supplier = tab === 'CHINA' || tab === 'INDIA'
  const cols = [
    { key: 'name', header: 'Vendor', render: (r) => <div><div className="font-medium text-slate-800">{r.name}</div><div className="text-[11px] text-slate-500">{r.code} · {r.city}, {r.country}</div></div> },
    { key: 'subtype', header: 'Type', hidden: supplier, render: (r) => r.subtype ? <Badge tone="blue">{r.subtype.replace('_', ' ')}</Badge> : '—' },
    { key: 'contact', header: 'Contact', render: (r) => <div className="text-xs"><div>{r.contact}</div><div className="text-slate-500">{r.phone}</div></div> },
    { key: 'currency', header: 'Cur.' },
    { key: 'terms', header: 'Payment terms', value: (r) => `${r.paymentTerms?.advancePct}/${r.paymentTerms?.balancePct}`, render: (r) => <span className="text-xs">{r.paymentTerms?.advancePct}% adv · {r.paymentTerms?.balancePct}% bal · {r.paymentTerms?.creditDays}d</span> },
    { key: 'pos', header: supplier ? 'POs' : 'Shipments', align: 'right', value: (r) => (supplier ? perf[r.id]?.pos : perf[r.id]?.shipments) },
    { key: 'value', header: 'PO value', align: 'right', hidden: !supplier, value: (r) => perf[r.id]?.value, render: (r) => fmtCompact(perf[r.id]?.value) },
    { key: 'otd', header: 'On-time', align: 'right', hidden: !supplier, value: (r) => perf[r.id]?.otd ?? -1, render: (r) => (perf[r.id]?.otd == null ? <span className="text-slate-400">—</span> : <Badge tone={perf[r.id].otd >= 90 ? 'green' : 'amber'}>{perf[r.id].otd}%</Badge>) },
    { key: 'rating', header: 'Rating', align: 'right', render: (r) => <Stars v={r.rating} /> },
    { key: 'portal', header: 'Portal', hidden: !supplier, sortable: false, value: (r) => (r.portal ? 'Yes' : 'No'), render: (r) => <span onClick={(e) => e.stopPropagation()}><Switch checked={r.portal} onChange={() => togglePortal(r)} /></span> },
    { key: 'e', header: '', sortable: false, export: false, render: (r) => <IconButton icon={Pencil} title="Edit" onClick={(e) => { e.stopPropagation(); setF(JSON.parse(JSON.stringify(r))) }} /> },
  ]
  const sel = f?.id ? perf[f.id] : null

  return (
    <div>
      <PageHeader title="Vendors & Logistics" subtitle="Suppliers, freight forwarders, CHA and logistics partners with payment terms and performance"
        actions={<Button icon={Plus} onClick={() => setF(blank(tab))}>{{ CHINA: 'New China supplier', INDIA: 'New Indian supplier', FORWARDER: 'New forwarder', CHA: 'New CHA', LOGISTICS: 'New logistics partner' }[tab]}</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Suppliers" value={vendors.filter((v) => v.type === 'CHINA' || v.type === 'INDIA').length} icon={Factory} sub={`${vendors.filter((v) => v.type === 'CHINA').length} China · ${vendors.filter((v) => v.type === 'INDIA').length} India`} />
        <Stat label="Freight forwarders" value={vendors.filter((v) => v.type === 'FORWARDER').length} icon={Ship} tone="ink" />
        <Stat label="Portal-enabled vendors" value={vendors.filter((v) => v.portal).length} icon={Globe2} tone="green" />
        <Stat label="Open PO value" value={fmtCompact(sum(pos.filter((p) => !['RECEIVED', 'CLOSED', 'REJECTED', 'CANCELLED', 'DRAFT'].includes(p.status)), (p) => sum(p.lines, (l) => l.qty * l.rate) * (fx[p.currency] || 1)))} icon={Landmark} tone="amber" />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={TYPE_TABS.map((t) => ({ key: t.key, label: t.label, count: vendors.filter((v) => v.type === t.key).length }))} />
      <DataTable key={tab} rows={rows} columns={cols} onRowClick={(r) => setF(JSON.parse(JSON.stringify(r)))} exportName={`btali-vendors-${tab.toLowerCase()}`} />

      <Drawer open={!!f} onClose={() => setF(null)} title={f?.id ? f.name : 'New vendor'} subtitle={f && TYPE_TABS.find((t) => t.key === f.type)?.label}
        footer={<><Button variant="secondary" onClick={() => setF(null)}>Cancel</Button><Button onClick={save}>{f?.id ? 'Save changes' : 'Create vendor'}</Button></>}>
        {f && (
          <div className="space-y-5">
            {sel && (f.type === 'CHINA' || f.type === 'INDIA') && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[['POs', fmtNum(sel.pos)], ['Open POs', fmtNum(sel.open)], ['PO value', fmtCompact(sel.value)], ['On-time dispatch', sel.otd == null ? '—' : `${sel.otd}%`]].map(([k, v]) => (
                  <div key={k} className="bg-slate-50 rounded-lg p-3"><div className="text-[11px] uppercase text-slate-400">{k}</div><div className="font-bold text-ink-900">{v}</div></div>
                ))}
              </div>
            )}
            {sel && !(f.type === 'CHINA' || f.type === 'INDIA') && (
              <DescriptionList cols={3} items={[['Shipments handled', fmtNum(sel.shipments)], ['Avg ETA deviation', sel.etaDelay == null ? '—' : `${sel.etaDelay.toFixed(1)} days`], ['Rating', <Stars v={f.rating} />]]} />
            )}
            {f.note && <Alert tone="info">{f.note}</Alert>}
            <SectionTitle>Company</SectionTitle>
            <FormGrid>
              <Field label="Name" required className="md:col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Code"><Input value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="Auto" /></Field>
              <Field label="Type"><Select value={f.type} options={TYPE_TABS.map((t) => ({ value: t.key, label: t.label }))} onChange={(e) => set({ type: e.target.value, subtype: SUBTYPES[e.target.value]?.[0] || '' })} /></Field>
              {SUBTYPES[f.type] && <Field label="Sub-type"><Select value={f.subtype} options={SUBTYPES[f.type].map((s) => ({ value: s, label: s.replace('_', ' ') }))} onChange={(e) => set({ subtype: e.target.value })} /></Field>}
              <Field label="Country"><Input value={f.country} onChange={(e) => set({ country: e.target.value })} /></Field>
              <Field label="City"><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
              <Field label="Currency"><Select value={f.currency} options={['USD', 'CNY', 'INR']} onChange={(e) => set({ currency: e.target.value })} /></Field>
              <Field label="GSTIN"><Input value={f.gst || ''} onChange={(e) => set({ gst: e.target.value.toUpperCase() })} /></Field>
              <Field label="Rating (0–5)"><NumberInput step="0.1" min={0} max={5} value={f.rating} onChange={(v) => set({ rating: v })} /></Field>
            </FormGrid>
            <SectionTitle>Contact</SectionTitle>
            <FormGrid>
              <Field label="Contact person"><Input value={f.contact} onChange={(e) => set({ contact: e.target.value })} /></Field>
              <Field label="Phone"><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
              <Field label="Email" required className="md:col-span-2"><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            </FormGrid>
            <SectionTitle>Payment terms & bank</SectionTitle>
            <FormGrid cols={3}>
              <Field label="Advance %"><NumberInput value={f.paymentTerms.advancePct} onChange={(v) => set({ paymentTerms: { ...f.paymentTerms, advancePct: v, balancePct: 100 - (Number(v) || 0) } })} /></Field>
              <Field label="Balance %"><NumberInput value={f.paymentTerms.balancePct} onChange={(v) => set({ paymentTerms: { ...f.paymentTerms, balancePct: v } })} /></Field>
              <Field label="Credit days"><NumberInput value={f.paymentTerms.creditDays} onChange={(v) => set({ paymentTerms: { ...f.paymentTerms, creditDays: v } })} /></Field>
              <Field label="Bank details (bank, branch, SWIFT / IFSC, a/c)" className="md:col-span-3"><Textarea rows={2} value={f.bank || ''} onChange={(e) => set({ bank: e.target.value })} /></Field>
            </FormGrid>
            {(f.type === 'CHINA' || f.type === 'INDIA') && (
              <>
                <SectionTitle>Supply & portal</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {CATS.map((c) => {
                    const on = (f.categories || []).includes(c)
                    return <button key={c} type="button" onClick={() => set({ categories: on ? f.categories.filter((x) => x !== c) : [...(f.categories || []), c] })} className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-slate-300 text-slate-600'}`}>{c}</button>
                  })}
                </div>
                <Switch checked={!!f.portal} onChange={(v) => set({ portal: v })} label="Vendor Portal access (POs, PI, QC, packing list, documents)" />
              </>
            )}
            <Field label="Internal note"><Textarea rows={2} value={f.note || ''} onChange={(e) => set({ note: e.target.value })} /></Field>
          </div>
        )}
      </Drawer>
    </div>
  )
}
