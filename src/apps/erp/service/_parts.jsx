// Shared building blocks for the Service & Warranty screens.
import React, { useMemo, useState } from 'react'
import { ShieldCheck, ShieldX, ShieldAlert, Clock, Factory, Store, User, Send, Paperclip, Globe, PhoneCall } from 'lucide-react'
import { useStore, useLookup, useUser } from '../../../store'
import {
  Badge, Button, Modal, Field, FormGrid, Input, Textarea, Select, Combobox, FileUpload, AttachmentList, Checkbox, Alert, cx, toast,
} from '../../../components/ui'
import { checkWarranty } from '../../../lib/warranty'
import { fmtDate, fmtDateTime } from '../../../lib/format'
import { CATEGORY_LABEL, SOURCE_LABEL, nearestPartner, servicePartners, slaState, slaDue } from '../../../store/slices/service'

export { CATEGORY_LABEL, SOURCE_LABEL }
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))
export const SOURCE_OPTIONS = Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))
export const PRIORITY_OPTIONS = [{ value: 'HIGH', label: 'High' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' }]

export const fmtHours = (h) => {
  const a = Math.abs(h)
  if (a >= 48) return `${Math.round(a / 24)}d`
  return `${a}h`
}

export function SlaChip({ t, className }) {
  const s = slaState(t)
  if (s.done) return <Badge tone={s.breached ? 'red' : 'green'} className={className}>{s.breached ? 'SLA missed' : 'Within SLA'}</Badge>
  return (
    <Badge tone={s.overdue ? 'red' : s.hoursLeft < 12 ? 'amber' : 'gray'} className={className}>
      <Clock className="w-3 h-3" />{s.overdue ? `Overdue ${fmtHours(s.hoursLeft)}` : `${fmtHours(s.hoursLeft)} left`}
    </Badge>
  )
}

export const sourceIcon = (src) => ({ WEBSITE: Globe, TOLL_FREE: PhoneCall, VENDOR: Factory, DEALER: Store, FRANCHISE: Store }[src] || User)

/** Three-relationship warranty validity panel. */
export function WarrantyCover({ result, compact }) {
  if (!result?.found) return <Alert tone="warn" title="Barcode not found">This code is not in Btali barcode records.</Alert>
  const rows = [
    { key: 'customer', label: 'Customer ↔ Dealer', sub: result.customer.registered ? `${result.warranty.customer?.name || 'Customer'} · ${result.partner?.name || ''}` : 'Not registered with a customer yet', d: result.customer, months: result.terms.months },
    { key: 'partner', label: 'Dealer ↔ Btali', sub: result.partnerCover.start ? `From dispatch ${fmtDate(result.partnerCover.start)}` : 'Not yet dispatched to a partner', d: result.partnerCover, months: result.terms.partnerMonths },
    { key: 'vendor', label: 'Btali ↔ Vendor', sub: `${result.vendor?.name || '—'}${result.vendorCover.start ? ` · from inward ${fmtDate(result.vendorCover.start)}` : ''}`, d: result.vendorCover, months: result.terms.vendorMonths },
  ]
  return (
    <div className={cx('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3')}>
      {rows.map((r) => {
        const has = !!r.d.end
        const ok = has && r.d.valid
        const I = !has ? ShieldAlert : ok ? ShieldCheck : ShieldX
        return (
          <div key={r.key} className={cx('rounded-xl border p-3', !has ? 'border-slate-200 bg-slate-50' : ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60')}>
            <div className="flex items-center gap-2">
              <I className={cx('w-4 h-4', !has ? 'text-slate-400' : ok ? 'text-emerald-600' : 'text-red-600')} />
              <span className="text-xs font-semibold text-slate-700">{r.label}</span>
              <span className="ml-auto text-[11px] text-slate-500">{r.months} mo</span>
            </div>
            <div className={cx('text-sm font-bold mt-1', !has ? 'text-slate-500' : ok ? 'text-emerald-700' : 'text-red-700')}>
              {!has ? 'Not started' : ok ? `Valid · ${r.d.daysLeft} days left` : `Expired ${Math.abs(r.d.daysLeft)} days ago`}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{has ? `${fmtDate(r.d.start)} → ${fmtDate(r.d.end)}` : ''}</div>
            <div className="text-[11px] text-slate-500 truncate" title={r.sub}>{r.sub}</div>
          </div>
        )
      })}
    </div>
  )
}

export const useWarrantyCheck = (code) => {
  const units = useStore((s) => s.units)
  const warranties = useStore((s) => s.warranties)
  const claims = useStore((s) => s.warrantyClaims)
  const state = useStore.getState()
  return useMemo(() => (code ? checkWarranty({ ...state, units, warranties, warrantyClaims: claims }, code) : null), [code, units, warranties, claims]) // eslint-disable-line
}

export const internalUsers = (users) => users.filter((u) => u.app === 'erp')

/** Assign in-house or route to nearest partner */
export function AssignModal({ ticket, open, onClose }) {
  const users = useStore((s) => s.users)
  const state = useStore.getState()
  const route = useStore((s) => s.svcRouteTicket)
  const { partner: lp } = useLookup()
  const [mode, setMode] = useState('PARTNER')
  const near = useMemo(() => {
    const city = ticket?.customer?.city || lp(ticket?.partnerId)?.city
    const pincode = ticket?.customer?.pincode
    return nearestPartner(state, { city, pincode })
  }, [ticket]) // eslint-disable-line
  const [partnerId, setPartnerId] = useState('')
  const [assigneeId, setAssigneeId] = useState('u11')
  const [note, setNote] = useState('')
  if (!ticket) return null
  const pid = partnerId || near.partner?.id || ''
  const partners = servicePartners(state).map((p) => ({ value: p.id, label: p.name, sub: `${p.type === 'FRANCHISE' ? 'Franchise' : 'Dealer'} · ${p.city}, ${p.region}` }))
  const submit = () => {
    if (mode === 'PARTNER' && !pid) return toast.error('Select a partner')
    route(ticket.id, mode === 'PARTNER' ? { partnerId: pid, note } : { assigneeId, note })
    toast.success(mode === 'PARTNER' ? 'Routed to partner' : 'Assigned', mode === 'PARTNER' ? 'Partner notified by email & portal; customer informed by SMS.' : undefined)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={`Assign ${ticket.number}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} onClick={submit}>{mode === 'PARTNER' ? 'Route ticket' : 'Assign'}</Button></>}>
      <div className="flex gap-2 mb-4">
        {[['PARTNER', 'Nearest dealer / franchise'], ['IN_HOUSE', 'In-house team']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={cx('flex-1 text-sm rounded-lg border px-3 py-2', mode === k ? 'border-brand-400 bg-brand-50 text-brand-700 font-medium' : 'border-slate-200 text-slate-600')}>{l}</button>
        ))}
      </div>
      {mode === 'PARTNER' ? (
        <div className="space-y-3">
          {near.partner ? (
            <Alert tone="info" title={`Suggested: ${near.partner.name}`}>{near.match === 'CITY' ? 'Same city as the customer' : `Nearest in ${near.region} region`} · {near.partner.phone}</Alert>
          ) : <Alert tone="warn">No partner found near the customer location – choose manually or assign in-house.</Alert>}
          <Field label="Service partner"><Combobox options={partners} value={pid} onChange={setPartnerId} placeholder="Choose partner" /></Field>
        </div>
      ) : (
        <Field label="Assign to"><Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} options={internalUsers(users).map((u) => ({ value: u.id, label: `${u.name} – ${u.title}` }))} /></Field>
      )}
      <Field label="Instructions" className="mt-3"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the assignee" /></Field>
    </Modal>
  )
}

export function EscalateModal({ ticket, open, onClose }) {
  const vendors = useStore((s) => s.vendors)
  const products = useStore((s) => s.products)
  const units = useStore((s) => s.units)
  const escalate = useStore((s) => s.svcEscalateTicket)
  const unit = units.find((u) => u.code === ticket?.barcode)
  const def = unit?.vendorId || products.find((p) => p.id === ticket?.productId)?.vendorId || ''
  const [vendorId, setVendorId] = useState(def)
  const [note, setNote] = useState('')
  const [files, setFiles] = useState([])
  if (!ticket) return null
  const vid = vendorId || def
  return (
    <Modal open={open} onClose={onClose} title={`Escalate ${ticket.number} to vendor`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Factory} disabled={!vid || !note.trim()} onClick={() => { escalate(ticket.id, vid, note, files); toast.success('Escalated to vendor', 'Vendor notified on portal and by email.'); onClose() }}>Escalate</Button></>}>
      <FormGrid cols={1}>
        <Field label="Vendor" required><Select value={vid} onChange={(e) => setVendorId(e.target.value)} placeholder="Select vendor" options={vendors.filter((v) => v.type === 'CHINA' || v.type === 'INDIA').map((v) => ({ value: v.id, label: v.name }))} /></Field>
        <Field label="Defect details for vendor" required><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Failure observed, batch / barcode, diagnosis, requested resolution" /></Field>
        <Field label="Supporting photos / videos"><FileUpload compact onFiles={(a) => setFiles((f) => [...f, ...a])} /></Field>
        {files.length > 0 && <AttachmentList items={files} onRemove={(a) => setFiles((f) => f.filter((x) => x.id !== a.id))} dense />}
      </FormGrid>
    </Modal>
  )
}

const blankCustomer = { name: '', phone: '', city: '', pincode: '', email: '' }
export function NewTicketModal({ open, onClose, defaultSource = 'INTERNAL', onCreated }) {
  const products = useStore((s) => s.products)
  const units = useStore((s) => s.units)
  const partners = useStore((s) => s.partners)
  const createTicket = useStore((s) => s.createTicket)
  const logRequest = useStore((s) => s.svcLogServiceRequest)
  const user = useUser()
  const [f, setF] = useState({ source: defaultSource, category: 'PRODUCT_DEFECT', priority: 'MEDIUM', subject: '', description: '', partnerId: '', productId: '', barcode: '', orderRef: '', autoRoute: true })
  const [cust, setCust] = useState(blankCustomer)
  const [files, setFiles] = useState([])
  React.useEffect(() => { if (open) { setF((x) => ({ ...x, source: defaultSource })); setCust(blankCustomer); setFiles([]) } }, [open, defaultSource])
  const isCustomer = f.source === 'TOLL_FREE' || f.source === 'WEBSITE'
  const unit = f.barcode ? units.find((u) => u.code === f.barcode.trim().toUpperCase()) : null
  const near = useMemo(() => (isCustomer && (cust.city || cust.pincode) ? nearestPartner(useStore.getState(), cust) : null), [isCustomer, cust.city, cust.pincode]) // eslint-disable-line
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const submit = () => {
    if (isCustomer) {
      if (!cust.name.trim() || !/\d{10}/.test(cust.phone.replace(/\D/g, '')) || !cust.city.trim()) return toast.error('Customer name, 10-digit mobile and city are required')
      if (!f.description.trim()) return toast.error('Describe the issue')
      const r = logRequest({ source: f.source, customer: cust, productId: f.productId || unit?.productId, barcode: f.barcode, category: f.category, description: f.description, attachments: files, priority: f.priority, autoRoute: f.autoRoute })
      toast.success(`${r.ticket.number} logged`, r.partner ? `Routed to ${r.partner.name}. SMS sent to customer.` : 'Assigned to Btali service team. SMS sent to customer.')
      onCreated?.(r.ticket)
    } else {
      if (!f.subject.trim()) return toast.error('Subject is required')
      const t = createTicket({ source: f.source, category: f.category, priority: f.priority, subject: f.subject, description: f.description || f.subject, partnerId: f.partnerId || null, productId: f.productId || unit?.productId || null, barcode: unit?.code || f.barcode || null, orderRef: f.orderRef, attachments: files, updates: [{ ts: new Date().toISOString(), by: user?.id, text: 'Ticket created' }] })
      toast.success(`${t.number} created`)
      onCreated?.(t)
    }
    onClose()
  }
  const productOpts = products.filter((p) => p.active !== false).map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName || p.name}`, sub: p.category }))
  return (
    <Modal open={open} onClose={onClose} size="lg" title={f.source === 'TOLL_FREE' ? 'Toll-free call intake' : 'New service ticket'} subtitle={f.source === 'TOLL_FREE' ? 'Capture the caller’s details – the request is routed automatically to the nearest service partner.' : undefined}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>{isCustomer ? 'Log request & send SMS' : 'Create ticket'}</Button></>}>
      <FormGrid cols={3}>
        <Field label="Source"><Select value={f.source} onChange={set('source')} options={SOURCE_OPTIONS.filter((o) => o.value !== 'VENDOR')} /></Field>
        <Field label="Category"><Select value={f.category} onChange={set('category')} options={CATEGORY_OPTIONS} /></Field>
        <Field label="Priority"><Select value={f.priority} onChange={set('priority')} options={PRIORITY_OPTIONS} /></Field>
      </FormGrid>
      {isCustomer ? (
        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Caller / customer</div>
          <FormGrid cols={3}>
            <Field label="Name" required><Input value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></Field>
            <Field label="Mobile" required><Input value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="98XXXXXXXX" /></Field>
            <Field label="Email"><Input value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} /></Field>
            <Field label="City" required><Input value={cust.city} onChange={(e) => setCust({ ...cust, city: e.target.value })} /></Field>
            <Field label="Pincode"><Input value={cust.pincode} onChange={(e) => setCust({ ...cust, pincode: e.target.value })} maxLength={6} /></Field>
            <Field label="Routing"><Checkbox className="mt-2" label="Auto-route to nearest partner" checked={f.autoRoute} onChange={(v) => setF((x) => ({ ...x, autoRoute: v }))} /></Field>
          </FormGrid>
          {f.autoRoute && near && (
            <div className="mt-3 text-xs text-slate-600">{near.partner ? <>Will route to <b>{near.partner.name}</b> ({near.partner.city}) – {near.match === 'CITY' ? 'same city' : `${near.region} region`}</> : 'No partner nearby – will go to Btali service team.'}</div>
          )}
        </div>
      ) : (
        <FormGrid cols={2} className="mt-4">
          <Field label="Subject" required className="md:col-span-2"><Input value={f.subject} onChange={set('subject')} /></Field>
          <Field label="Dealer / franchise"><Combobox value={f.partnerId} onChange={set('partnerId')} placeholder="Optional" options={partners.filter((p) => p.type !== 'EXPORT').map((p) => ({ value: p.id, label: p.name, sub: p.city }))} /></Field>
          <Field label="Order / shipment reference"><Input value={f.orderRef} onChange={set('orderRef')} placeholder="SO / invoice / GRN no." /></Field>
        </FormGrid>
      )}
      <FormGrid cols={2} className="mt-4">
        <Field label="Product barcode" hint={unit ? `${products.find((p) => p.id === unit.productId)?.name} · ${unit.status.replace(/_/g, ' ').toLowerCase()}` : f.barcode ? 'Not a Btali barcode – select the product instead' : 'Optional'}>
          <Input value={f.barcode} onChange={set('barcode')} className="font-mono uppercase" placeholder="e.g. SPRY001004" />
        </Field>
        <Field label="Product"><Combobox value={f.productId || unit?.productId || ''} onChange={set('productId')} options={productOpts} placeholder="Select product" /></Field>
        <Field label="Issue description" required={isCustomer} className="md:col-span-2"><Textarea rows={3} value={f.description} onChange={set('description')} /></Field>
        <div className="md:col-span-2"><FileUpload compact label="Attach photos / videos / documents" onFiles={(a) => setFiles((x) => [...x, ...a])} /></div>
        {files.length > 0 && <div className="md:col-span-2"><AttachmentList dense items={files} onRemove={(a) => setFiles((x) => x.filter((y) => y.id !== a.id))} /></div>}
      </FormGrid>
    </Modal>
  )
}

export function ThreadItem({ u }) {
  const { user } = useLookup()
  const who = user(u.by)
  return (
    <li className="flex gap-3">
      <div className={cx('w-2 h-2 rounded-full mt-2 shrink-0', u.stage ? 'bg-brand-500' : 'bg-slate-300')} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-800 whitespace-pre-line">{u.text}</div>
        <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-2">
          <span>{fmtDateTime(u.ts)}</span>{who && <span>· {who.name}</span>}{u.public && <span className="text-sky-600">· visible to customer</span>}
        </div>
        {u.attachments?.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{u.attachments.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-[11px] bg-slate-100 rounded px-1.5 py-0.5"><Paperclip className="w-3 h-3" />{a.name}</span>)}</div>}
      </div>
    </li>
  )
}

export { slaDue, slaState }
