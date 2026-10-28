import React, { useMemo, useState } from 'react'
import { ShieldCheck, ShieldAlert, ScanLine, FileWarning, Plus, UserCheck } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, StatusBadge, Tabs, Modal, Drawer, Field, Input, Select, Textarea, FormGrid, FileUpload, AttachmentList, Grid, Stat, ProductImage, Alert, Timeline, EmptyState, SectionTitle, Combobox, Barcode, toast } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { ScanInput, PrintArea, DocHeader } from '../../components/business'
import { fmtDate, today, addDays } from '../../lib/format'
import { checkWarranty } from '../../lib/warranty'
import { usePortal } from './_portal'

function useWarrantyState() {
  const units = useStore((s) => s.units)
  const warranties = useStore((s) => s.warranties)
  const products = useStore((s) => s.products)
  const warrantyRules = useStore((s) => s.warrantyRules)
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const shipments = useStore((s) => s.shipments)
  const warrantyClaims = useStore((s) => s.warrantyClaims)
  return useMemo(() => ({ units, warranties, products, warrantyRules, partners, vendors, shipments, warrantyClaims }), [units, warranties, products, warrantyRules, partners, vendors, shipments, warrantyClaims])
}

export default function Warranty() {
  const { partnerId, partner, isFranchise } = usePortal()
  const ws = useWarrantyState()
  const [tab, setTab] = useState('register')
  const [claimFor, setClaimFor] = useState(null)
  const mine = ws.warranties.filter((w) => w.partnerId === partnerId)
  const claims = ws.warrantyClaims.filter((c) => c.partnerId === partnerId)
  const atMe = ws.units.filter((u) => u.partnerId === partnerId && u.status === 'AT_PARTNER')
  const active = mine.filter((w) => w.endDate >= today())

  return (
    <div>
      <PageHeader title="Warranty" subtitle="Register customer sales by barcode, check validity and raise warranty claims"
        actions={<Button icon={FileWarning} variant="secondary" onClick={() => setClaimFor('')}>Raise claim</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={ScanLine} tone="ink" label="Barcoded stock" value={atMe.length} sub="Ready to register on sale" />
        <Stat icon={ShieldCheck} tone="green" label="Active warranties" value={active.length} sub={`${mine.length} registered in total`} />
        <Stat icon={FileWarning} tone="amber" label="Open claims" value={claims.filter((c) => !['CLOSED', 'REJECTED'].includes(c.status)).length} />
        <Stat icon={UserCheck} tone="blue" label="Expiring 30d" value={active.filter((w) => w.endDate <= addDays(today(), 30)).length} />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'register', label: 'Register sale' }, { key: 'check', label: 'Check warranty' }, { key: 'claims', label: 'Claims', count: claims.length }, { key: 'issued', label: 'Warranties issued', count: mine.length }]} />
      {tab === 'register' && <Register partnerId={partnerId} partner={partner} isFranchise={isFranchise} ws={ws} atMe={atMe} />}
      {tab === 'check' && <Check ws={ws} mine={mine} onClaim={(code) => setClaimFor(code)} />}
      {tab === 'claims' && <Claims claims={claims} ws={ws} onNew={() => setClaimFor('')} />}
      {tab === 'issued' && (
        <DataTable rows={mine} exportName={`Warranties-${partner?.code}`} initialSort={{ key: 'saleDate', dir: 'desc' }}
          columns={[
            { key: 'number', header: 'Warranty', render: (w) => <span className="font-mono font-medium">{w.number}</span> },
            { key: 'barcode', header: 'Barcode', render: (w) => <span className="font-mono text-xs">{w.barcode}</span> },
            { key: 'product', header: 'Product', value: (w) => ws.products.find((p) => p.id === w.productId)?.shortName },
            { key: 'customer', header: 'Customer', value: (w) => `${w.customer?.name || ''} ${w.customer?.phone || ''}`, render: (w) => <div><div>{w.customer?.name}</div><div className="text-[11px] text-slate-500">{w.customer?.phone} · {w.customer?.city}</div></div> },
            { key: 'saleDate', header: 'Sold', render: (w) => fmtDate(w.saleDate) },
            { key: 'endDate', header: 'Valid till', render: (w) => <span className={w.endDate < today() ? 'text-red-600' : ''}>{fmtDate(w.endDate)}</span> },
            { key: 'act', header: '', sortable: false, export: false, render: (w) => <Button size="sm" variant="ghost" onClick={() => setClaimFor(w.barcode)}>Claim</Button> },
          ]} />
      )}
      <ClaimModal open={claimFor != null} barcode={claimFor} onClose={() => setClaimFor(null)} mine={mine} ws={ws} partnerId={partnerId} onDone={() => setTab('claims')} />
    </div>
  )
}

function Register({ partnerId, partner, isFranchise, ws, atMe }) {
  const registerWarranty = useStore((s) => s.registerWarranty)
  const adjustPartnerStock = useStore((s) => s.adjustPartnerStock)
  const sendEmail = useStore((s) => s.sendEmail)
  const [unit, setUnit] = useState(null)
  const [err, setErr] = useState('')
  const [c, setC] = useState({ name: '', phone: '', city: partner?.city || '', email: '', saleDate: today(), invoiceRef: '' })
  const [done, setDone] = useState(null)
  const scan = (code) => {
    setDone(null); setErr('')
    const u = ws.units.find((x) => x.code.toUpperCase() === code)
    if (!u) { setUnit(null); return setErr(`${code} is not a Btali barcode. Check the sticker and try again.`) }
    if (ws.warranties.some((w) => w.barcode === u.code)) { setUnit(null); return setErr(`${code} is already registered to a customer. Use "Check warranty" to view it.`) }
    if (u.partnerId !== partnerId) { setUnit(null); return setErr(`${code} was not supplied to ${partner?.name}. Contact Btali Sales if this unit is in your store.`) }
    setUnit(u)
  }
  const p = unit && ws.products.find((x) => x.id === unit.productId)
  const valid = unit && c.name.trim() && /\d{10}/.test(c.phone.replace(/\D/g, ''))
  const submit = () => {
    const r = registerWarranty({ barcode: unit.code, customer: { name: c.name.trim(), phone: c.phone.trim(), city: c.city.trim(), email: c.email.trim() }, partnerId, saleDate: c.saleDate, source: isFranchise ? 'POS' : 'DEALER_PORTAL', invoiceRef: c.invoiceRef })
    if (!r.ok) return toast.error('Registration failed', r.error)
    if ((partner?.stock || {})[unit.productId]) adjustPartnerStock(partnerId, unit.productId, -1)
    if (c.email.trim()) sendEmail({ to: c.email.trim(), subject: `Your Btali warranty ${r.warranty.number}`, body: `Dear ${c.name},\n\nThank you for buying ${p.name}. Your warranty ${r.warranty.number} (barcode ${unit.code}) is valid till ${fmtDate(r.warranty.endDate)}.\n\nSold by ${partner?.name}, ${partner?.city}.\n\nTeam Btali`, ref: r.warranty.number })
    toast.success('Warranty activated', `${r.warranty.number} · valid till ${fmtDate(r.warranty.endDate)}`)
    setDone({ w: r.warranty, p, unit })
    setUnit(null)
    setC({ name: '', phone: '', city: partner?.city || '', email: '', saleDate: today(), invoiceRef: '' })
  }
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card title="1. Scan the product barcode" subtitle={`${atMe.length} barcoded units in your stock`}>
        <ScanInput onScan={scan} suggestions={atMe.map((u) => u.code)} />
        {err && <Alert tone="error" className="mt-3">{err}</Alert>}
        {unit && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <ProductImage product={p} size="md" />
            <div className="flex-1 min-w-0"><div className="font-semibold text-slate-900">{p.shortName}</div><div className="text-xs text-slate-500">{p.sku} · {p.warrantyMonths} months customer warranty</div><div className="font-mono text-sm mt-0.5">{unit.code}</div></div>
            <Badge tone="green">Verified</Badge>
          </div>
        )}
        {!unit && !err && !done && <div className="text-sm text-slate-500 mt-3">Use a USB / Bluetooth scanner or type the code printed under the barcode.</div>}
      </Card>
      {done ? (
        <Card title="Warranty card" actions={<Button size="sm" variant="secondary" onClick={() => setDone(null)}>Register another</Button>}>
          <PrintArea title={done.w.number}>
            <DocHeader title="Warranty card" number={done.w.number} date={done.w.saleDate} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-[11px] uppercase text-slate-400">Product</div><b>{done.p.name}</b><div className="text-xs">{done.p.sku}</div></div>
              <div><div className="text-[11px] uppercase text-slate-400">Customer</div><b>{done.w.customer.name}</b><div className="text-xs">{done.w.customer.phone} · {done.w.customer.city}</div></div>
              <div><div className="text-[11px] uppercase text-slate-400">Valid</div>{fmtDate(done.w.startDate)} – <b>{fmtDate(done.w.endDate)}</b></div>
              <div><div className="text-[11px] uppercase text-slate-400">Sold by</div>{partner?.name}, {partner?.city}</div>
            </div>
            <div className="mt-3 flex justify-center"><Barcode value={done.unit.code} height={44} /></div>
            <div className="text-[11px] text-slate-500 mt-2">Keep this card with your purchase bill. For service call Btali on {useStore.getState().settings.company.phone}.</div>
          </PrintArea>
        </Card>
      ) : (
        <Card title="2. Customer details" subtitle="Creates the digital warranty card linked to this barcode">
          <FormGrid>
            <Field label="Customer name" required><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} disabled={!unit} /></Field>
            <Field label="Mobile" required hint="10-digit mobile"><Input inputMode="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} disabled={!unit} /></Field>
            <Field label="City"><Input value={c.city} onChange={(e) => setC({ ...c, city: e.target.value })} disabled={!unit} /></Field>
            <Field label="Email (sends e-warranty)"><Input type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} disabled={!unit} /></Field>
            <Field label="Sale date"><Input type="date" max={today()} value={c.saleDate} onChange={(e) => setC({ ...c, saleDate: e.target.value })} disabled={!unit} /></Field>
            <Field label="Your bill no."><Input value={c.invoiceRef} onChange={(e) => setC({ ...c, invoiceRef: e.target.value })} disabled={!unit} /></Field>
          </FormGrid>
          <Button className="mt-4 w-full" icon={ShieldCheck} disabled={!valid} onClick={submit}>Activate warranty</Button>
        </Card>
      )}
    </div>
  )
}

function Cover({ title, c, sub }) {
  return (
    <div className={`rounded-xl border p-3 ${c.valid ? 'border-emerald-200 bg-emerald-50/60' : c.end ? 'border-red-200 bg-red-50/60' : 'border-slate-200 bg-slate-50'}`}>
      <div className="text-[11px] uppercase font-semibold text-slate-500">{title}</div>
      <div className="flex items-center gap-1.5 mt-1 font-semibold">{c.valid ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-red-500" />}{c.end ? (c.valid ? `Valid · ${c.daysLeft} days left` : 'Expired') : 'Not started'}</div>
      <div className="text-xs text-slate-500 mt-0.5">{c.start ? `${fmtDate(c.start)} – ${fmtDate(c.end)}` : sub}</div>
    </div>
  )
}

function Check({ ws, mine, onClaim }) {
  const [res, setRes] = useState(null)
  const go = (q) => setRes(checkWarranty(ws, q))
  return (
    <div className="space-y-4">
      <Card title="Look up any Btali product" subtitle="Scan the barcode or enter a warranty number">
        <ScanInput onScan={go} suggestions={mine.map((w) => w.barcode)} placeholder="Barcode or warranty no. (e.g. WAR-5001)" />
      </Card>
      {res && !res.found && <Alert tone="error" title="No record found">{res.query} does not match any Btali barcode or warranty.</Alert>}
      {res?.found && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <ProductImage product={res.product} size="md" />
            <div className="flex-1 min-w-0"><div className="font-semibold text-slate-900">{res.product?.name}</div><div className="text-xs text-slate-500 font-mono">{res.code}</div></div>
            <StatusBadge status={res.unit?.status} />
            {res.warranty && res.customer.valid && <Button icon={FileWarning} onClick={() => onClaim(res.code)}>Raise claim</Button>}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Cover title="Customer warranty" c={res.customer} sub="Not registered to a customer yet" />
            <Cover title="Btali → partner cover" c={res.partnerCover} sub="Starts on dispatch" />
          </div>
          {res.warranty && <div className="text-sm mt-3"><b>{res.warranty.customer?.name}</b> · {res.warranty.customer?.phone} · {res.warranty.customer?.city} · {res.warranty.number}</div>}
          {res.terms?.exclusions && <div className="text-xs text-slate-500 mt-2"><b>Exclusions:</b> {res.terms.exclusions}{res.terms.extended ? ` · Extended: ${res.terms.extended}` : ''}</div>}
          {res.claims.length > 0 && <div className="mt-3"><SectionTitle>Claims on this unit</SectionTitle>{res.claims.map((c) => <div key={c.id} className="flex justify-between text-sm py-1"><span>{c.number} · {c.issue}</span><StatusBadge status={c.status} /></div>)}</div>}
          <div className="mt-4"><SectionTitle>Barcode journey</SectionTitle><Timeline items={[...(res.unit?.history || [])].reverse()} /></div>
        </Card>
      )}
    </div>
  )
}

function Claims({ claims, ws, onNew }) {
  const [sel, setSel] = useState(null)
  const c = claims.find((x) => x.id === sel)
  const pn = (id) => ws.products.find((p) => p.id === id)?.shortName
  return (
    <>
      <DataTable rows={claims} onRowClick={(r) => setSel(r.id)} initialSort={{ key: 'createdAt', dir: 'desc' }} toolbar={<Button size="sm" icon={Plus} onClick={onNew}>New claim</Button>}
        empty={<EmptyState icon={FileWarning} title="No warranty claims" message="Raise a claim when a customer reports a defect on a registered product." />}
        columns={[
          { key: 'number', header: 'Claim', render: (r) => <span className="font-mono font-medium">{r.number}</span> },
          { key: 'barcode', header: 'Barcode', render: (r) => <span className="font-mono text-xs">{r.barcode}</span> },
          { key: 'product', header: 'Product', value: (r) => pn(r.productId) },
          { key: 'issue', header: 'Issue' },
          { key: 'requestType', header: 'Request', render: (r) => <Badge tone={r.requestType === 'REPLACEMENT' ? 'violet' : 'blue'}>{r.requestType === 'REPLACEMENT' ? 'Replacement' : 'Repair'}</Badge> },
          { key: 'createdAt', header: 'Raised', render: (r) => fmtDate(r.createdAt) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={r.status === 'VENDOR_ESCALATED' ? 'With manufacturer' : undefined} /> },
        ]} />
      <Drawer open={!!c} onClose={() => setSel(null)} title={c?.number} subtitle={c && `${pn(c.productId)} · ${c.barcode}`}>
        {c && (
          <div className="space-y-4">
            <div className="flex gap-2"><StatusBadge status={c.status} /><Badge tone="gray">{c.requestType}</Badge></div>
            <div className="text-sm"><b>Issue:</b> {c.issue}</div>
            {c.remark && <Alert tone={c.status === 'REJECTED' ? 'error' : 'info'}>{c.remark}</Alert>}
            {c.replacementBarcode && <div className="text-sm">Replacement unit: <span className="font-mono">{c.replacementBarcode}</span></div>}
            {(c.attachments || []).length > 0 && <AttachmentList items={c.attachments} />}
            <SectionTitle>Progress</SectionTitle>
            <Timeline items={[...(c.timeline || [])].reverse()} />
          </div>
        )}
      </Drawer>
    </>
  )
}

function ClaimModal({ open, barcode, onClose, mine, ws, partnerId, onDone }) {
  const createWarrantyClaim = useStore((s) => s.createWarrantyClaim)
  const [f, setF] = useState({ barcode: '', issue: '', requestType: 'REPAIR', details: '' })
  const [files, setFiles] = useState([])
  React.useEffect(() => { if (open) { setF({ barcode: barcode || '', issue: '', requestType: 'REPAIR', details: '' }); setFiles([]) } }, [open, barcode])
  const res = f.barcode ? checkWarranty(ws, f.barcode) : null
  const submit = () => {
    const r = createWarrantyClaim({ barcode: f.barcode, issue: f.issue.trim() + (f.details.trim() ? ` – ${f.details.trim()}` : ''), requestType: f.requestType, partnerId, attachments: files })
    if (!r.ok) return toast.error('Claim not raised', r.error)
    toast.success(`Claim ${r.claim.number} submitted`, 'Btali Service will verify and respond')
    onClose(); onDone()
  }
  return (
    <Modal open={open} onClose={onClose} title="Raise warranty claim" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!f.barcode || !f.issue.trim() || (res && !res.warranty)} onClick={submit}>Submit claim</Button></>}>
      <FormGrid>
        <Field label="Product barcode" required className="md:col-span-2"><Combobox options={mine.map((w) => ({ value: w.barcode, label: `${w.barcode} – ${ws.products.find((p) => p.id === w.productId)?.shortName}`, sub: `${w.customer?.name} · till ${fmtDate(w.endDate)}` }))} value={f.barcode} onChange={(v) => setF({ ...f, barcode: v })} placeholder="Select a registered unit…" /></Field>
        {res?.found && <div className="md:col-span-2"><Alert tone={res.customer.valid ? 'success' : 'warn'}>{res.customer.valid ? `In warranty – ${res.customer.daysLeft} days left (till ${fmtDate(res.customer.end)})` : `Customer warranty ${res.customer.end ? `expired on ${fmtDate(res.customer.end)}` : 'not registered'} – claim will be reviewed as goodwill`}</Alert></div>}
        <Field label="Issue" required><Input value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} placeholder="e.g. Motor not starting" /></Field>
        <Field label="Request"><Select value={f.requestType} onChange={(e) => setF({ ...f, requestType: e.target.value })} options={[{ value: 'REPAIR', label: 'Repair' }, { value: 'REPLACEMENT', label: 'Replacement' }]} /></Field>
        <Field label="Details" className="md:col-span-2"><Textarea rows={2} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></Field>
      </FormGrid>
      <div className="mt-3"><FileUpload compact onFiles={(a) => setFiles((s) => [...s, ...a])} label="Attach photos / video of the defect" />{files.length > 0 && <div className="mt-2"><AttachmentList items={files} onRemove={(a) => setFiles((s) => s.filter((x) => x.id !== a.id))} /></div>}</div>
    </Modal>
  )
}
