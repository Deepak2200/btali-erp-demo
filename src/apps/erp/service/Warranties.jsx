import React, { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, ShieldCheck, ShieldAlert, ShieldX, Hourglass, FileText, ClipboardPlus } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Badge, StatusBadge, Button, Drawer, DescriptionList, SectionTitle, Modal, Field, FormGrid, Input, Combobox, Textarea, Select,
  Segmented, Timeline, Alert, toast, FileUpload, AttachmentList,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ProductCell, PartnerCell, ScanInput } from '../../../components/business'
import { fmtDate, daysBetween, today, addDays } from '../../../lib/format'
import { resolveTerms } from '../../../lib/warranty'
import { WarrantyCover, useWarrantyCheck } from './_parts'

const statusOf = (w) => {
  const d = daysBetween(today(), w.endDate)
  if (d < 0) return { key: 'EXPIRED', d }
  if (d <= 30) return { key: 'EXPIRING', d }
  return { key: 'ACTIVE', d }
}

export default function Warranties() {
  const warranties = useStore((s) => s.warranties)
  const claims = useStore((s) => s.warrantyClaims)
  const { product, partner } = useLookup()
  const [params, setParams] = useSearchParams()
  const [seg, setSeg] = useState('ALL')
  const [regOpen, setRegOpen] = useState(false)
  const q = params.get('q') || ''
  const openId = params.get('id')

  const rows = useMemo(() => warranties.map((w) => ({ ...w, st: statusOf(w), claimCount: claims.filter((c) => c.barcode === w.barcode).length })), [warranties, claims])
  const counts = { ALL: rows.length, ACTIVE: rows.filter((r) => r.st.key !== 'EXPIRED').length, EXPIRING: rows.filter((r) => r.st.key === 'EXPIRING').length, EXPIRED: rows.filter((r) => r.st.key === 'EXPIRED').length }
  const view = rows.filter((r) => (seg === 'ALL' ? true : seg === 'ACTIVE' ? r.st.key !== 'EXPIRED' : r.st.key === seg)).filter((r) => {
    if (!q) return true
    const s = q.toLowerCase()
    return `${r.barcode} ${r.number} ${r.customer?.name} ${r.customer?.phone} ${r.customer?.city} ${partner(r.partnerId)?.name || ''}`.toLowerCase().includes(s)
  })
  const setQ = (v) => setParams(v ? { q: v } : {})

  const cols = [
    { key: 'number', header: 'Warranty', render: (w) => <div><div className="font-mono text-xs font-semibold">{w.number}</div><div className="font-mono text-[11px] text-slate-500">{w.barcode}</div></div> },
    { key: 'product', header: 'Product', value: (w) => product(w.productId)?.name, render: (w) => <ProductCell id={w.productId} /> },
    { key: 'customer', header: 'Customer', value: (w) => w.customer?.name, render: (w) => <div><div className="text-sm">{w.customer?.name}</div><div className="text-[11px] text-slate-500">{w.customer?.phone} · {w.customer?.city}</div></div> },
    { key: 'partner', header: 'Sold by', value: (w) => partner(w.partnerId)?.name, render: (w) => <PartnerCell id={w.partnerId} /> },
    { key: 'startDate', header: 'Start', value: (w) => w.startDate, render: (w) => fmtDate(w.startDate) },
    { key: 'endDate', header: 'Valid till', value: (w) => w.endDate, render: (w) => fmtDate(w.endDate) },
    { key: 'days', header: 'Days left', align: 'right', value: (w) => w.st.d, render: (w) => <span className={w.st.d < 0 ? 'text-red-600' : w.st.d <= 30 ? 'text-amber-600 font-semibold' : ''}>{w.st.d < 0 ? 'Expired' : w.st.d}</span> },
    { key: 'status', header: 'Status', value: (w) => w.st.key, render: (w) => <StatusBadge status={w.st.key === 'EXPIRING' ? 'PENDING' : w.st.key} label={w.st.key === 'EXPIRING' ? 'Expiring soon' : undefined} /> },
    { key: 'claims', header: 'Claims', align: 'right', value: (w) => w.claimCount },
  ]

  return (
    <div>
      <PageHeader title="Warranty Registry" subtitle="Every warranty is linked to a Btali barcode – customer, dealer and vendor cover in one place"
        actions={<Button icon={Plus} onClick={() => setRegOpen(true)}>Register warranty</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Registered warranties" value={counts.ALL} icon={ShieldCheck} onClick={() => setSeg('ALL')} />
        <Stat label="Active" value={counts.ACTIVE} icon={ShieldCheck} tone="green" onClick={() => setSeg('ACTIVE')} />
        <Stat label="Expiring in 30 days" value={counts.EXPIRING} icon={Hourglass} tone="amber" onClick={() => setSeg('EXPIRING')} />
        <Stat label="Expired" value={counts.EXPIRED} icon={ShieldX} tone="red" onClick={() => setSeg('EXPIRED')} />
      </Grid>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-3">
        <Segmented value={seg} onChange={setSeg} options={[{ key: 'ALL', label: `All (${counts.ALL})` }, { key: 'ACTIVE', label: 'Active' }, { key: 'EXPIRING', label: 'Expiring ≤30d' }, { key: 'EXPIRED', label: 'Expired' }]} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search barcode, phone, customer, dealer…" className="sm:w-80" />
      </div>
      <DataTable columns={cols} rows={view} searchable={false} onRowClick={(w) => setParams({ ...(q ? { q } : {}), id: w.id })} exportName="warranty-registry" initialSort={{ key: 'startDate', dir: 'desc' }} />
      {openId && <WarrantyDrawer id={openId} onClose={() => setParams(q ? { q } : {})} />}
      <RegisterModal open={regOpen} onClose={() => setRegOpen(false)} onDone={(w) => setParams({ id: w.id })} />
    </div>
  )
}

function WarrantyDrawer({ id, onClose }) {
  const w = useStore((s) => s.warranties.find((x) => x.id === id))
  const claims = useStore((s) => s.warrantyClaims)
  const createClaim = useStore((s) => s.createWarrantyClaim)
  const { partner } = useLookup()
  const nav = useNavigate()
  const wc = useWarrantyCheck(w?.barcode)
  const [claimOpen, setClaimOpen] = useState(false)
  const [cf, setCf] = useState({ issue: '', requestType: 'REPAIR' })
  const [files, setFiles] = useState([])
  if (!w) return null
  const mine = claims.filter((c) => c.barcode === w.barcode)
  const p = partner(w.partnerId)
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={`${w.number} · ${w.barcode}`} subtitle={`${wc?.product?.name || ''}`}
      footer={<Button icon={ClipboardPlus} onClick={() => setClaimOpen(true)}>Raise warranty claim</Button>}>
      <SectionTitle>Validity across relationships</SectionTitle>
      {wc && <WarrantyCover result={wc} />}
      {wc?.terms?.exclusions && <Alert tone="info" className="mt-3" title="Exclusions">{wc.terms.exclusions}{wc.terms.extended ? ` · Extended cover: ${wc.terms.extended}` : ''}</Alert>}
      <div className="mt-5 grid md:grid-cols-2 gap-4">
        <div>
          <SectionTitle>Customer</SectionTitle>
          <DescriptionList cols={1} items={[['Name', w.customer?.name], ['Mobile', w.customer?.phone], ['City', w.customer?.city], ['Email', w.customer?.email || null]]} />
        </div>
        <div>
          <SectionTitle>Sale</SectionTitle>
          <DescriptionList cols={1} items={[['Sold by', p ? `${p.name}, ${p.city}` : '—'], ['Sale date', fmtDate(w.saleDate)], ['Bill / ref', w.invoiceRef], ['Registered via', (w.source || '').replace(/_/g, ' ')]]} />
        </div>
      </div>
      {w.replacementBarcode && <Alert tone="warn" className="mt-4" title="Unit replaced under warranty">Replaced by barcode {w.replacementBarcode} – cover continues on the new unit.</Alert>}
      <div className="mt-5">
        <SectionTitle>Claims</SectionTitle>
        {mine.length === 0 ? <div className="text-sm text-slate-400">No claims on this unit.</div> : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {mine.map((c) => (
              <li key={c.id} className="px-3 py-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50" onClick={() => nav(`/erp/service/claims?id=${c.id}`)}>
                <FileText className="w-4 h-4 text-slate-400" />
                <div className="flex-1 min-w-0"><div className="text-sm">{c.number} · {c.issue}</div><div className="text-[11px] text-slate-500">{fmtDate(c.createdAt)} · {c.requestType.toLowerCase()}</div></div>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-5">
        <SectionTitle>Barcode history</SectionTitle>
        <Timeline items={[...(wc?.unit?.history || [])].reverse()} />
      </div>
      <Modal open={claimOpen} onClose={() => setClaimOpen(false)} title={`Raise claim on ${w.barcode}`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setClaimOpen(false)}>Cancel</Button><Button disabled={!cf.issue.trim()} onClick={() => {
          const r = createClaim({ barcode: w.barcode, issue: cf.issue, requestType: cf.requestType, partnerId: w.partnerId, attachments: files })
          if (!r.ok) return toast.error(r.error)
          toast.success(`Claim ${r.claim.number} raised`)
          setClaimOpen(false)
          nav(`/erp/service/claims?id=${r.claim.id}`)
        }}>Submit claim</Button></>}>
        <FormGrid cols={1}>
          <Field label="Issue" required><Textarea rows={3} value={cf.issue} onChange={(e) => setCf({ ...cf, issue: e.target.value })} /></Field>
          <Field label="Request"><Select value={cf.requestType} onChange={(e) => setCf({ ...cf, requestType: e.target.value })} options={[{ value: 'REPAIR', label: 'Repair' }, { value: 'REPLACEMENT', label: 'Replacement' }]} /></Field>
          <FileUpload compact onFiles={(a) => setFiles((x) => [...x, ...a])} />
          {files.length > 0 && <AttachmentList dense items={files} />}
        </FormGrid>
      </Modal>
    </Drawer>
  )
}

function RegisterModal({ open, onClose, onDone }) {
  const units = useStore((s) => s.units)
  const warranties = useStore((s) => s.warranties)
  const partners = useStore((s) => s.partners)
  const register = useStore((s) => s.svcRegisterWarranty)
  const state = useStore.getState()
  const [code, setCode] = useState('')
  const [c, setC] = useState({ name: '', phone: '', city: '', email: '' })
  const [partnerId, setPartnerId] = useState('')
  const [saleDate, setSaleDate] = useState(today())
  const [ref, setRef] = useState('')
  const registered = useMemo(() => new Set(warranties.map((w) => w.barcode)), [warranties])
  const eligible = useMemo(() => units.filter((u) => ['AT_PARTNER', 'IN_WAREHOUSE', 'INVOICED'].includes(u.status) && !registered.has(u.code)), [units, registered])
  const unit = units.find((u) => u.code === code)
  const prod = unit && state.products.find((p) => p.id === unit.productId)
  const terms = prod ? resolveTerms(state, prod, { vendorId: unit.vendorId, partnerId: partnerId || unit.partnerId }) : null
  const pick = (cd) => {
    const u = units.find((x) => x.code === cd)
    if (!u) return toast.error(`${cd} is not a Btali barcode`)
    if (registered.has(u.code)) return toast.error('Warranty already registered for this barcode')
    setCode(u.code)
    setPartnerId(u.partnerId || '')
  }
  const submit = () => {
    if (!unit) return toast.error('Scan a barcode')
    if (!c.name.trim() || c.phone.replace(/\D/g, '').length < 10) return toast.error('Customer name and 10-digit mobile are required')
    const r = register({ barcode: code, customer: c, partnerId: partnerId || null, saleDate, source: 'SERVICE_DESK', invoiceRef: ref })
    if (!r.ok) return toast.error(r.error)
    toast.success(`Warranty ${r.warranty.number} activated`, 'Warranty card sent to customer by SMS.')
    setCode(''); setC({ name: '', phone: '', city: '', email: '' }); setRef('')
    onClose(); onDone?.(r.warranty)
  }
  return (
    <Modal open={open} onClose={onClose} title="Register warranty" subtitle="Scan the unit barcode and capture the customer’s details" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={ShieldCheck} onClick={submit}>Activate warranty</Button></>}>
      <ScanInput onScan={pick} autoFocus={false} suggestions={eligible.slice(0, 40).map((u) => u.code)} />
      {unit && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-4">
          <ProductCell id={unit.productId} sub={unit.code} />
          <StatusBadge status={unit.status} />
          {terms && <div className="text-xs text-slate-600">Cover: <b>{terms.months} months</b> customer · {terms.partnerMonths} dealer · {terms.vendorMonths} vendor · valid till <b>{fmtDate(addDays(saleDate, Math.round(terms.months * 30.4)))}</b></div>}
        </div>
      )}
      <FormGrid cols={2} className="mt-4">
        <Field label="Customer name" required><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
        <Field label="Mobile" required><Input value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
        <Field label="City"><Input value={c.city} onChange={(e) => setC({ ...c, city: e.target.value })} /></Field>
        <Field label="Email"><Input value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
        <Field label="Sold by"><Combobox value={partnerId} onChange={setPartnerId} placeholder="Dealer / franchise" options={partners.filter((p) => p.type !== 'EXPORT').map((p) => ({ value: p.id, label: p.name, sub: p.city }))} /></Field>
        <Field label="Sale date"><Input type="date" value={saleDate} max={today()} onChange={(e) => setSaleDate(e.target.value)} /></Field>
        <Field label="Customer bill no."><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </FormGrid>
      {!unit && <div className="mt-3 text-xs text-slate-500 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" />{eligible.length} sold-through units are awaiting warranty registration.</div>}
      {unit && <Badge tone="blue" className="mt-3">Barcode {unit.code}</Badge>}
    </Modal>
  )
}
