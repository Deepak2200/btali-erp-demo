import React, { useMemo, useState } from 'react'
import { Plus, ShieldCheck, Pencil, Trash2, ScanLine, Layers, Factory, Users, Package } from 'lucide-react'
import { PageHeader, Grid, Stat, Button, Card, Modal, FormGrid, Field, Input, NumberInput, Select, Textarea, Badge, IconButton, toast, confirm, Combobox, Alert, StatusBadge } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ScanInput } from '../../../components/business'
import { useStore } from '../../../store'
import { fmtDate } from '../../../lib/format'
import { checkWarranty } from '../../../lib/warranty'

const CATS = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']
const SCOPES = [{ value: 'CATEGORY', label: 'Product category', icon: Layers }, { value: 'VENDOR', label: 'Vendor', icon: Factory }, { value: 'PARTNER', label: 'Dealer / franchise', icon: Users }, { value: 'PRODUCT', label: 'Specific product', icon: Package }]
const blank = () => ({ scope: 'CATEGORY', ref: 'Pumps', months: 12, partnerMonths: 15, vendorMonths: 18, exclusions: '', extended: '' })

function CoverCard({ title, c, sub }) {
  const tone = c.end ? (c.valid ? 'green' : 'red') : 'gray'
  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold text-slate-600">{title}</div>
        <Badge tone={tone}>{c.end ? (c.valid ? `${c.daysLeft} days left` : 'Expired') : 'Not started'}</Badge></div>
      <div className="text-sm mt-2 text-slate-800">{c.start ? `${fmtDate(c.start)} → ${fmtDate(c.end)}` : sub}</div>
    </div>
  )
}

export default function WarrantyTerms() {
  const state = useStore()
  const { warrantyRules: rules, products, vendors, partners, units, warranties } = state
  const upsert = useStore((s) => s.upsertWarrantyRule)
  const remove = useStore((s) => s.removeWarrantyRule)
  const [f, setF] = useState(null)
  const [code, setCode] = useState('')
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const res = useMemo(() => (code ? checkWarranty(state, code) : null), [code, state])

  const refLabel = (r) => r.scope === 'CATEGORY' ? r.ref : r.scope === 'VENDOR' ? vendors.find((v) => v.id === r.ref)?.name : r.scope === 'PARTNER' ? partners.find((p) => p.id === r.ref)?.name : (() => { const p = products.find((x) => x.id === r.ref); return p ? `${p.sku} – ${p.shortName}` : r.ref })()
  const refOpts = (scope) => scope === 'CATEGORY' ? CATS.map((c) => ({ value: c, label: c }))
    : scope === 'VENDOR' ? vendors.filter((v) => v.type === 'CHINA' || v.type === 'INDIA').map((v) => ({ value: v.id, label: v.name, sub: v.country }))
      : scope === 'PARTNER' ? partners.filter((p) => p.type !== 'EXPORT').map((p) => ({ value: p.id, label: p.name, sub: p.city }))
        : products.map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: p.category }))

  const save = () => {
    if (!f.ref) return toast.error('Select what this rule applies to')
    if (rules.some((r) => r.scope === f.scope && r.ref === f.ref && r.id !== f.id)) return toast.error('A rule already exists for this selection')
    const num = (v) => (v === '' || v == null ? null : Number(v))
    upsert({ ...f, months: num(f.months), partnerMonths: num(f.partnerMonths), vendorMonths: num(f.vendorMonths) })
    toast.success('Warranty rule saved', `${SCOPES.find((s) => s.value === f.scope).label}: ${refLabel(f)}`)
    setF(null)
  }
  const del = async (r) => {
    if (!(await confirm({ title: 'Delete warranty rule?', message: `${refLabel(r)} will fall back to the next applicable rule (product → dealer → category → product master).`, tone: 'danger', confirmText: 'Delete' }))) return
    remove(r.id)
    toast.success('Rule deleted')
  }
  const m = (v) => (v == null ? <span className="text-slate-400">inherit</span> : `${v} mo`)
  const cols = [
    { key: 'scope', header: 'Scope', render: (r) => <Badge tone={{ CATEGORY: 'ink', VENDOR: 'violet', PARTNER: 'teal', PRODUCT: 'brand' }[r.scope]}>{SCOPES.find((s) => s.value === r.scope)?.label}</Badge> },
    { key: 'ref', header: 'Applies to', value: refLabel, render: (r) => <span className="font-medium text-slate-800">{refLabel(r)}</span> },
    { key: 'months', header: 'Customer', align: 'right', render: (r) => m(r.months) },
    { key: 'partnerMonths', header: 'Dealer / franchise', align: 'right', render: (r) => m(r.partnerMonths) },
    { key: 'vendorMonths', header: 'Vendor → Btali', align: 'right', render: (r) => m(r.vendorMonths) },
    { key: 'exclusions', header: 'Exclusions', className: 'max-w-xs', render: (r) => <span className="text-xs text-slate-600 line-clamp-2">{r.exclusions || '—'}</span> },
    { key: 'extended', header: 'Extended warranty', render: (r) => (r.extended ? <Badge tone="green">{r.extended}</Badge> : <span className="text-slate-400">—</span>) },
    { key: 'x', header: '', sortable: false, export: false, render: (r) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><IconButton icon={Pencil} title="Edit" onClick={() => setF({ ...r })} /><IconButton icon={Trash2} tone="danger" title="Delete" onClick={() => del(r)} /></div> },
  ]
  const suggestions = useMemo(() => [...warranties.slice(0, 4).map((w) => w.barcode), ...units.filter((u) => u.status === 'IN_WAREHOUSE').slice(0, 2).map((u) => u.code), ...units.filter((u) => u.status === 'AT_PARTNER').slice(0, 2).map((u) => u.code)], [warranties, units])

  return (
    <div>
      <PageHeader title="Warranty Terms" subtitle="Customer, dealer/franchise and vendor warranty periods by category, vendor, partner or product"
        actions={<Button icon={Plus} onClick={() => setF(blank())}>New rule</Button>} />
      <Grid cols={4} className="mb-4">
        {SCOPES.map((s, i) => <Stat key={s.value} label={`${s.label} rules`} value={rules.filter((r) => r.scope === s.value).length} icon={s.icon} tone={['brand', 'violet', 'green', 'ink'][i]} />)}
      </Grid>
      <div className="space-y-4">
        <div className="space-y-2">
          <DataTable rows={rules} columns={cols} onRowClick={(r) => setF({ ...r })} exportName="btali-warranty-rules" filters={[{ key: 'scope', label: 'scopes', options: SCOPES.map((s) => ({ value: s.value, label: s.label })) }]} />
          <p className="text-xs text-slate-500 px-1">Precedence: product rule → dealer/franchise rule → category rule → product master warranty. Vendor rules override the vendor-to-Btali period.</p>
        </div>
        <Card title="Test a barcode" subtitle="Instant validation across all three warranty relationships" actions={<ScanLine className="w-4 h-4 text-brand-500" />}>
          <ScanInput className="max-w-2xl" onScan={setCode} suggestions={suggestions} autoFocus={false} placeholder="Scan or type a barcode / warranty number and press Enter" />
          {res && !res.found && <Alert tone="error" className="mt-3" title="Not found">{res.query} is not a Btali barcode or warranty number.</Alert>}
          {res?.found && (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-mono text-sm font-semibold">{res.code}</div><div className="text-sm text-slate-700">{res.product?.shortName}</div><div className="text-xs text-slate-500">{res.vendor?.name}{res.partner ? ` · ${res.partner.name}` : ''}</div></div>
                <StatusBadge status={res.unit?.status} />
              </div>
              <CoverCard title={`Customer (${res.terms.months} mo)`} c={res.customer} sub="Not registered to an end customer yet" />
              <CoverCard title={`Dealer / franchise (${res.terms.partnerMonths} mo)`} c={res.partnerCover} sub="Starts on dispatch to partner" />
              <CoverCard title={`Vendor → Btali (${res.terms.vendorMonths} mo)`} c={res.vendorCover} sub="Starts on inward at Starex" />
              {res.terms.exclusions && <div className="text-xs text-slate-600 md:col-span-2 xl:col-span-4"><span className="font-semibold">Exclusions:</span> {res.terms.exclusions}</div>}
              {res.terms.extended && <div className="text-xs text-emerald-700 md:col-span-2 xl:col-span-4"><span className="font-semibold">Extended:</span> {res.terms.extended}</div>}
              <div className="text-[11px] text-slate-400 md:col-span-2 xl:col-span-4">Rules applied: {res.terms.ruleIds.map((id) => { const r = rules.find((x) => x.id === id); return r ? `${r.scope.toLowerCase()} ${refLabel(r)}` : id }).join(', ') || 'product master'}</div>
              {res.claims.length > 0 && <div className="text-xs text-slate-600 md:col-span-2 xl:col-span-4">{res.claims.length} claim(s): {res.claims.map((c) => `${c.number} (${c.status.replace(/_/g, ' ').toLowerCase()})`).join(', ')}</div>}
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit warranty rule' : 'New warranty rule'}
        footer={<><Button variant="secondary" onClick={() => setF(null)}>Cancel</Button><Button onClick={save}>Save rule</Button></>}>
        {f && (
          <FormGrid>
            <Field label="Scope"><Select value={f.scope} options={SCOPES.map((s) => ({ value: s.value, label: s.label }))} onChange={(e) => set({ scope: e.target.value, ref: '' })} /></Field>
            <div><div className="text-xs font-medium text-slate-600 mb-1">Applies to <span className="text-red-500">*</span></div><Combobox options={refOpts(f.scope)} value={f.ref} onChange={(v) => set({ ref: v })} /></div>
            <Field label="Customer warranty (months)" hint="Blank = inherit"><NumberInput value={f.months} onChange={(v) => set({ months: v })} /></Field>
            <Field label="Btali → dealer/franchise (months)"><NumberInput value={f.partnerMonths} onChange={(v) => set({ partnerMonths: v })} /></Field>
            <Field label="Vendor → Btali (months)"><NumberInput value={f.vendorMonths} onChange={(v) => set({ vendorMonths: v })} /></Field>
            <Field label="Extended warranty offer"><Input value={f.extended || ''} onChange={(e) => set({ extended: e.target.value })} placeholder="e.g. +12 months for ₹499" /></Field>
            <Field label="Exclusions" className="md:col-span-2"><Textarea rows={3} value={f.exclusions || ''} onChange={(e) => set({ exclusions: e.target.value })} /></Field>
          </FormGrid>
        )}
      </Modal>
    </div>
  )
}
