import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Clock, CheckCircle2, XCircle, ShieldCheck, FileCheck2 } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Button, Modal, Field, FormGrid, Input, Select, Textarea, FileUpload, AttachmentList, Checkbox,
  Badge, StatusBadge, EmptyState, DescriptionList, Tabs, Alert, toast, prompt, confirm,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { UserName } from '../../../components/business'
import { fmtDate, daysBetween, today, daysAgo, timeAgo } from '../../../lib/format'
import { REGIONS, CATEGORIES, SALES_PEOPLE } from './_shared'

const STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal']
const STATE_REGION = { Punjab: 'North', Haryana: 'North', Delhi: 'North', Rajasthan: 'North', 'Uttar Pradesh': 'North', Uttarakhand: 'North', Maharashtra: 'West', Gujarat: 'West', Goa: 'West', 'Madhya Pradesh': 'Central', Chhattisgarh: 'Central', 'Tamil Nadu': 'South', Karnataka: 'South', Kerala: 'South', Telangana: 'South', 'Andhra Pradesh': 'South', 'West Bengal': 'East', Odisha: 'East', Bihar: 'East', Assam: 'East', Jharkhand: 'East' }
const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const KYC_DOCS = ['GST Certificate', 'PAN Card', 'Cancelled Cheque', 'Shop & Establishment', 'Address Proof']

const blank = (user) => ({
  name: '', contact: '', phone: '', email: '', gstin: '', pan: '', address: '', city: '', state: '', region: '', pincode: '',
  tier: 'C', paymentTerms: 'Advance', creditDays: 0, creditLimit: 0, salespersonId: user?.role === 'SALES_EXEC' ? user.id : '', transporterId: '', priceListId: 'pl1',
  extraDiscountPct: 0, authorizedCategories: [...CATEGORIES], kyc: [], notes: '',
})

function OnboardForm({ open, onClose, prospect }) {
  const user = useUser()
  const state = useStore()
  const submit = useStore((s) => s.submitDealerOnboarding)
  const updatePartnerProfile = useStore((s) => s.updatePartnerProfile)
  const notify = useStore((s) => s.notify)
  const [f, setF] = useState(() => (prospect ? { ...blank(user), ...Object.fromEntries(Object.keys(blank(user)).filter((k) => prospect[k] != null && prospect[k] !== '').map((k) => [k, prospect[k]])), kyc: prospect.kyc || [] } : blank(user)))
  const [docType, setDocType] = useState(KYC_DOCS[0])
  const [errors, setErrors] = useState({})
  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e
    setF((s) => ({ ...s, [k]: v, ...(k === 'state' && STATE_REGION[v] ? { region: STATE_REGION[v] } : {}), ...(k === 'gstin' && GST_RE.test(String(v).toUpperCase()) ? { pan: String(v).toUpperCase().slice(2, 12) } : {}) }))
  }
  const save = () => {
    const e = {}
    if (!f.name.trim()) e.name = 'Required'
    if (!f.contact.trim()) e.contact = 'Required'
    if (!/^[0-9 +]{10,14}$/.test(f.phone.trim())) e.phone = 'Enter a valid mobile number'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email'
    if (!GST_RE.test(f.gstin.toUpperCase())) e.gstin = 'Invalid GSTIN (15 characters, e.g. 27AAACB1234C1Z5)'
    if (!PAN_RE.test(f.pan.toUpperCase())) e.pan = 'Invalid PAN'
    if (!f.city.trim()) e.city = 'Required'
    if (!f.state) e.state = 'Required'
    if (!f.region) e.region = 'Required'
    if (!f.salespersonId) e.salespersonId = 'Assign a salesperson'
    if (!f.transporterId) e.transporterId = 'Select preferred transporter'
    setErrors(e)
    if (Object.keys(e).length) return toast.error('Please fix the highlighted fields')
    if (f.kyc.length < 2) return toast.error('Upload at least GST certificate and PAN card')
    const data = { ...f, gstin: f.gstin.toUpperCase(), pan: f.pan.toUpperCase(), creditDays: Number(f.creditDays) || 0, creditLimit: Number(f.creditLimit) || 0, extraDiscountPct: Number(f.extraDiscountPct) || 0, safex: f.transporterId === 't1' }
    let p
    if (prospect) {
      p = updatePartnerProfile(prospect.id, { ...data, status: 'PENDING_APPROVAL', stage: 'IN_DECISION', submittedAt: new Date().toISOString(), submittedBy: user?.id })
      notify({ title: 'Dealer onboarding for approval', body: `${p.name}, ${p.city}`, link: '/erp/sales/onboarding', roles: ['SALES_MANAGER', 'ADMIN'] })
    } else p = submit(data)
    toast.success('Onboarding submitted for approval', `${p.name} (${p.code}) sent to Sales Manager`)
    setF(blank(user)); setErrors({})
    onClose()
  }
  const sp = state.users.filter((u) => SALES_PEOPLE.includes(u.id) || u.role === 'SALES_MANAGER')
  return (
    <Modal open={open} onClose={onClose} size="lg" title={prospect ? `Onboard ${prospect.name}` : 'Dealer onboarding form'} subtitle="Captures KYC, GST, terms and ownership. The dealer is activated in Dealer Master only after approval."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={UserPlus} onClick={save}>Submit for approval</Button></>}>
      <div className="space-y-5">
        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Firm & contact</div>
          <FormGrid>
            <Field label="Firm name" required error={errors.name}><Input value={f.name} onChange={set('name')} placeholder="e.g. Shree Balaji Pump House" /></Field>
            <Field label="Contact person" required error={errors.contact}><Input value={f.contact} onChange={set('contact')} /></Field>
            <Field label="Mobile" required error={errors.phone}><Input value={f.phone} onChange={set('phone')} placeholder="98XXXXXXXX" /></Field>
            <Field label="Email" required error={errors.email}><Input type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="GSTIN" required error={errors.gstin} hint="PAN is auto-filled from GSTIN"><Input value={f.gstin} onChange={set('gstin')} className="uppercase font-mono" maxLength={15} /></Field>
            <Field label="PAN" required error={errors.pan}><Input value={f.pan} onChange={set('pan')} className="uppercase font-mono" maxLength={10} /></Field>
          </FormGrid>
        </section>
        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Address & region</div>
          <FormGrid cols={3}>
            <Field label="Address" className="md:col-span-3"><Input value={f.address} onChange={set('address')} /></Field>
            <Field label="City" required error={errors.city}><Input value={f.city} onChange={set('city')} /></Field>
            <Field label="State" required error={errors.state}><Select value={f.state} onChange={set('state')} placeholder="Select state" options={STATES} /></Field>
            <Field label="Region" required error={errors.region}><Select value={f.region} onChange={set('region')} placeholder="Select region" options={REGIONS} /></Field>
            <Field label="Pincode"><Input value={f.pincode} onChange={set('pincode')} maxLength={6} /></Field>
          </FormGrid>
        </section>
        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Commercial terms & ownership</div>
          <FormGrid cols={3}>
            <Field label="Payment terms"><Select value={f.paymentTerms} onChange={set('paymentTerms')} options={['Advance', '50% Advance, 50% before dispatch', 'Credit']} /></Field>
            <Field label="Credit days"><Input type="number" min={0} value={f.creditDays} onChange={set('creditDays')} disabled={f.paymentTerms !== 'Credit'} /></Field>
            <Field label="Credit limit (₹)"><Input type="number" min={0} value={f.creditLimit} onChange={set('creditLimit')} disabled={f.paymentTerms !== 'Credit'} /></Field>
            <Field label="Assigned salesperson" required error={errors.salespersonId}><Select value={f.salespersonId} onChange={set('salespersonId')} placeholder="Select" options={sp.map((u) => ({ value: u.id, label: u.name }))} /></Field>
            <Field label="Preferred transporter" required error={errors.transporterId}><Select value={f.transporterId} onChange={set('transporterId')} placeholder="Select" options={state.transporters.map((t) => ({ value: t.id, label: `${t.name}${t.regions?.length ? ` (${t.regions.join('/')})` : ''}` }))} /></Field>
            <Field label="Price list"><Select value={f.priceListId} onChange={set('priceListId')} options={state.priceLists.filter((p) => p.kind === 'DEALER').map((p) => ({ value: p.id, label: `${p.name} (${p.baseDiscountPct}%)` }))} /></Field>
            <Field label="Tier"><Select value={f.tier} onChange={set('tier')} options={[{ value: 'A', label: 'A – Key distributor' }, { value: 'B', label: 'B – Regular' }, { value: 'C', label: 'C – New / small' }]} /></Field>
            <Field label="Extra discount %"><Input type="number" min={0} max={10} step="0.5" value={f.extraDiscountPct} onChange={set('extraDiscountPct')} /></Field>
          </FormGrid>
          <div className="mt-3">
            <div className="text-xs font-medium text-slate-600 mb-1">Authorised categories</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {CATEGORIES.map((c) => <Checkbox key={c} label={c} checked={f.authorizedCategories.includes(c)} onChange={(v) => setF((s) => ({ ...s, authorizedCategories: v ? [...s.authorizedCategories, c] : s.authorizedCategories.filter((x) => x !== c) }))} />)}
            </div>
          </div>
        </section>
        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">KYC documents</div>
          <div className="grid md:grid-cols-[200px_1fr] gap-3 items-start">
            <Field label="Document type"><Select value={docType} onChange={(e) => setDocType(e.target.value)} options={KYC_DOCS} /></Field>
            <FileUpload compact label={`Upload ${docType}`} hint="PDF / JPG, max 5 MB" onFiles={(atts) => setF((s) => ({ ...s, kyc: [...s.kyc, ...atts.map((a) => ({ ...a, docType }))] }))} />
          </div>
          <div className="mt-2"><AttachmentList items={f.kyc} onRemove={(a) => setF((s) => ({ ...s, kyc: s.kyc.filter((x) => x.id !== a.id) }))} empty="No KYC uploaded yet – GST certificate and PAN card are mandatory." /></div>
        </section>
        <Field label="Remarks"><Textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="Market potential, references, competing brands…" /></Field>
      </div>
    </Modal>
  )
}

function ReviewDrawer({ partner, onClose, canApprove }) {
  const state = useStore()
  const approveDealer = useStore((s) => s.approveDealer)
  const addPartnerKyc = useStore((s) => s.addPartnerKyc)
  if (!partner) return null
  const p = state.partners.find((x) => x.id === partner.id) || partner
  const gstOk = GST_RE.test(p.gstin || '')
  const panOk = PAN_RE.test(p.pan || '')
  const dup = state.partners.filter((x) => x.id !== p.id && x.gstin && x.gstin === p.gstin)
  const decide = async (ok) => {
    let remark = ''
    if (ok) {
      if (!(await confirm({ title: `Approve ${p.name}?`, message: 'The dealer will be activated in Dealer Master, moved to Current Dealers and receive Dealer Portal login by email.', confirmText: 'Approve & activate' }))) return
    } else {
      remark = await prompt({ title: 'Reject onboarding', label: 'Reason', required: true, tone: 'danger', confirmText: 'Reject' })
      if (!remark) return
    }
    approveDealer(p.id, ok, remark)
    toast.success(ok ? `${p.name} activated` : 'Onboarding rejected', ok ? `Welcome email with portal access sent to ${p.email}` : remark)
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={p.name} subtitle={`${p.code} · submitted ${p.submittedAt ? timeAgo(p.submittedAt) : 'earlier'}`}
      footer={canApprove && p.status === 'PENDING_APPROVAL' ? <><Button variant="danger" icon={XCircle} onClick={() => decide(false)}>Reject</Button><Button variant="success" icon={CheckCircle2} onClick={() => decide(true)}>Approve & activate</Button></> : <Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        {!canApprove && p.status === 'PENDING_APPROVAL' && <Alert tone="info">Awaiting Sales Manager approval.</Alert>}
        <DescriptionList cols={3} items={[
          ['Contact', p.contact], ['Mobile', p.phone], ['Email', p.email],
          ['GSTIN', <span className="font-mono">{p.gstin} {gstOk ? <Badge tone="green">Format OK</Badge> : <Badge tone="red">Check</Badge>}</span>],
          ['PAN', <span className="font-mono">{p.pan} {panOk ? <Badge tone="green">OK</Badge> : <Badge tone="red">Check</Badge>}</span>],
          ['Location', `${p.city}, ${p.state} · ${p.region}`],
          ['Salesperson', <UserName id={p.salespersonId} />], ['Transporter', state.transporters.find((t) => t.id === p.transporterId)?.name],
          ['Price list', state.priceLists.find((x) => x.id === p.priceListId)?.name],
          ['Payment terms', `${p.paymentTerms || 'Advance'}${p.creditDays ? ` · ${p.creditDays} days` : ''}`], ['Tier', p.tier], ['Extra discount', `${p.extraDiscountPct || 0}%`],
          ['Authorised categories', (p.authorizedCategories || []).join(', ') || 'All'],
        ]} />
        {dup.length > 0 && <Alert tone="warn" title="Duplicate GSTIN">Already used by {dup.map((d) => d.name).join(', ')}.</Alert>}
        <div>
          <div className="flex items-center justify-between mb-2"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">KYC documents ({(p.kyc || []).length})</div></div>
          <KycPreview items={p.kyc || []} />
          <div className="mt-2"><FileUpload compact label="Add missing document" onFiles={(atts) => { addPartnerKyc(p.id, atts.map((a) => ({ ...a, docType: 'KYC' }))); toast.success('Document added') }} /></div>
        </div>
        {p.notes && <Alert tone="info" title="Remarks">{p.notes}</Alert>}
      </div>
    </Modal>
  )
}

function KycPreview({ items }) {
  const imgs = items.filter((a) => a.url && a.type?.startsWith('image'))
  return (
    <div className="space-y-2">
      {imgs.length > 0 && <div className="grid grid-cols-3 gap-2">{imgs.map((a) => <img key={a.id} src={a.url} alt={a.name} className="rounded-lg border border-slate-200 aspect-video object-cover w-full" />)}</div>}
      <AttachmentList items={items} empty="No KYC documents uploaded." />
    </div>
  )
}

export default function Onboarding() {
  const user = useUser()
  const partners = useStore((s) => s.partners)
  const users = useStore((s) => s.users)
  const navigate = useNavigate()
  const canApprove = ['SALES_MANAGER', 'ADMIN'].includes(user?.role)
  const [form, setForm] = useState(false)
  const [review, setReview] = useState(null)
  const [prospect, setProspect] = useState(null)
  const [tab, setTab] = useState('queue')

  const pending = partners.filter((p) => p.status === 'PENDING_APPROVAL')
  const rejected = partners.filter((p) => p.status === 'REJECTED')
  const onboarded = useMemo(() => partners.filter((p) => p.onboardedAt && p.status === 'ACTIVE').sort((a, b) => (b.onboardedAt > a.onboardedAt ? 1 : -1)), [partners])
  const recent = onboarded.filter((p) => p.onboardedAt >= daysAgo(365))
  const prospects = partners.filter((p) => p.status === 'PROSPECT' && p.type === 'DEALER')
  const cycle = useMemo(() => {
    const xs = partners.filter((p) => p.submittedAt && p.onboardedAt).map((p) => Math.max(0, daysBetween(p.submittedAt.slice(0, 10), p.onboardedAt)))
    return xs.length ? (xs.reduce((a, x) => a + x, 0) / xs.length).toFixed(1) : null
  }, [partners])
  const decided = partners.filter((p) => p.submittedAt && ['ACTIVE', 'REJECTED'].includes(p.status))
  const approvalRate = decided.length ? Math.round((decided.filter((p) => p.status === 'ACTIVE').length / decided.length) * 100) : 100
  const oldestPending = pending.reduce((a, p) => Math.max(a, p.submittedAt ? daysBetween(p.submittedAt.slice(0, 10), today()) : 1), 0)

  const cols = [
    { key: 'name', header: 'Dealer', render: (p) => <div><div className="font-medium text-slate-800">{p.name}</div><div className="text-[11px] text-slate-500">{p.code} · {p.city}, {p.state}</div></div> },
    { key: 'region', header: 'Region' },
    { key: 'gstin', header: 'GSTIN', className: 'font-mono text-xs' },
    { key: 'salespersonId', header: 'Salesperson', value: (p) => users.find((u) => u.id === p.salespersonId)?.name },
    { key: 'kyc', header: 'KYC', value: (p) => (p.kyc || []).length, render: (p) => <Badge tone={(p.kyc || []).length >= 2 ? 'green' : 'amber'}><FileCheck2 className="w-3 h-3" />{(p.kyc || []).length} docs</Badge> },
    { key: 'submittedAt', header: 'Submitted', value: (p) => p.submittedAt || '', render: (p) => (p.submittedAt ? timeAgo(p.submittedAt) : '—') },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    { key: 'act', header: '', sortable: false, export: false, render: (p) => <Button size="sm" variant={canApprove && p.status === 'PENDING_APPROVAL' ? 'primary' : 'secondary'} onClick={(e) => { e.stopPropagation(); setReview(p) }}>{canApprove && p.status === 'PENDING_APPROVAL' ? 'Review' : 'View'}</Button> },
  ]
  const recentCols = [
    { key: 'name', header: 'Dealer', render: (p) => <div><div className="font-medium text-slate-800">{p.name}</div><div className="text-[11px] text-slate-500">{p.code} · {p.city}</div></div> },
    { key: 'type', header: 'Type', render: (p) => <Badge tone={p.type === 'FRANCHISE' ? 'violet' : p.type === 'EXPORT' ? 'blue' : 'gray'}>{p.type.toLowerCase()}</Badge> },
    { key: 'region', header: 'Region' },
    { key: 'salespersonId', header: 'Salesperson', value: (p) => users.find((u) => u.id === p.salespersonId)?.name },
    { key: 'onboardedAt', header: 'Activated', render: (p) => fmtDate(p.onboardedAt) },
    { key: 'cycle', header: 'Cycle time', value: (p) => (p.submittedAt ? daysBetween(p.submittedAt.slice(0, 10), p.onboardedAt) : null), render: (p) => (p.submittedAt ? `${daysBetween(p.submittedAt.slice(0, 10), p.onboardedAt)} days` : '—') },
    { key: 'lastOrderDate', header: 'First / last order', render: (p) => (p.lastOrderDate ? fmtDate(p.lastOrderDate) : <span className="text-amber-600 text-xs">No order yet</span>) },
  ]

  return (
    <div>
      <PageHeader title="Dealer Onboarding" subtitle="Onboarding form → KYC verification → Sales Manager approval → auto-created in Dealer Master with portal access"
        actions={<Button icon={UserPlus} onClick={() => setForm(true)}>Onboard new dealer</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Awaiting approval" value={pending.length} icon={ShieldCheck} tone="amber" sub={pending.length ? `oldest ${oldestPending} days` : 'queue clear'} onClick={() => setTab('queue')} />
        <Stat label="Avg onboarding cycle time" value={cycle != null ? `${cycle} days` : '—'} icon={Clock} tone="ink" sub={cycle != null ? 'submission → activation' : 'starts with first ERP approval'} />
        <Stat label="Activated (12 months)" value={recent.length} icon={CheckCircle2} tone="green" sub={`${onboarded.length} active partners`} onClick={() => setTab('recent')} />
        <Stat label="Approval rate" value={`${approvalRate}%`} icon={UserPlus} tone="brand" sub={`${rejected.length} rejected`} />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'queue', label: 'Approval queue', count: pending.length }, { key: 'recent', label: 'Recently onboarded', count: recent.length }, { key: 'prospects', label: 'Prospects to convert', count: prospects.length }, { key: 'rejected', label: 'Rejected', count: rejected.length }]} />
      {tab === 'queue' && (pending.length ? <DataTable columns={cols} rows={pending} onRowClick={setReview} exportName="onboarding-queue" /> : (
        <Card><EmptyState icon={ShieldCheck} title="No onboarding requests pending" message="New dealer applications submitted by the sales team appear here for verification." action={<Button icon={UserPlus} onClick={() => setForm(true)}>Onboard new dealer</Button>} /></Card>
      ))}
      {tab === 'recent' && <DataTable columns={recentCols} rows={recent} onRowClick={(p) => navigate(`/erp/sales/dealers/${p.id}`)} exportName="recently-onboarded" />}
      {tab === 'rejected' && <DataTable columns={[...cols.slice(0, 4), { key: 'approvalRemark', header: 'Reason' }, cols[7]]} rows={rejected} onRowClick={setReview} empty={<EmptyState title="No rejected applications" />} />}
      {tab === 'prospects' && <DataTable columns={[...cols.slice(0, 2), cols[3], { key: 'phone', header: 'Phone' }, { key: 'go', header: '', sortable: false, export: false, render: (p) => <Button size="sm" icon={UserPlus} onClick={(e) => { e.stopPropagation(); setProspect(p) }}>Start onboarding</Button> }]} rows={prospects} onRowClick={(p) => navigate(`/erp/sales/dealers/${p.id}`)} empty={<EmptyState title="No open prospects" message="Add prospects from the Dealer Pipeline." />} />}
      {form && <OnboardForm open onClose={() => setForm(false)} />}
      {prospect && <OnboardForm open prospect={prospect} onClose={() => setProspect(null)} />}
      {review && <ReviewDrawer partner={review} canApprove={canApprove} onClose={() => setReview(null)} />}
    </div>
  )
}
