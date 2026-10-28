import React, { useEffect, useState } from 'react'
import { Save, Plus, Trash2, Building2, Landmark, Users, Award } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Field, FormGrid, Input, Button, IconButton, FileUpload, AttachmentList, Badge, toast } from '../../components/ui'
import { fmtDate, daysBetween, today } from '../../lib/format'
import { useVendorScope } from './_parts'

const blankProfile = { address: '', website: '', established: '', employees: '', capacity: '', licence: '', contacts: [], bankDetails: { beneficiary: '', bankName: '', account: '', swift: '', bankAddress: '', currency: 'USD' }, certificates: [] }

export default function Profile() {
  const { vendorId } = useVendorScope()
  const vendor = useStore((s) => s.vendors.find((v) => v.id === vendorId))
  const profile = useStore((s) => (s.vendorProfiles || []).find((p) => p.vendorId === vendorId))
  const save = useStore((s) => s.vndUpdateProfile)
  const [v, setV] = useState({})
  const [p, setP] = useState(blankProfile)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!vendor) return
    setV({ name: vendor.name, contact: vendor.contact, email: vendor.email, phone: vendor.phone, city: vendor.city, country: vendor.country })
    setP({ ...blankProfile, ...(profile || {}), bankDetails: { ...blankProfile.bankDetails, ...(profile?.bankDetails || {}) }, contacts: profile?.contacts || [{ name: vendor.contact, role: 'Primary contact', email: vendor.email, phone: vendor.phone }] })
    setDirty(false)
  }, [vendorId]) // eslint-disable-line
  if (!vendor) return null
  const upd = (fn) => { setP(fn); setDirty(true) }
  const setB = (k) => (e) => upd((x) => ({ ...x, bankDetails: { ...x.bankDetails, [k]: e.target.value } }))
  const setC = (i, k) => (e) => upd((x) => ({ ...x, contacts: x.contacts.map((c, j) => (j === i ? { ...c, [k]: e.target.value } : c)) }))
  const submit = () => {
    if (!v.name?.trim() || !v.email?.trim()) return toast.error('Company name and email are required')
    if (p.bankDetails.swift && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(p.bankDetails.swift.toUpperCase())) return toast.error('SWIFT code must be 8 or 11 characters')
    const b = p.bankDetails
    save(vendorId, { vendor: { ...v, bank: b.bankName ? `${b.bankName} – SWIFT ${b.swift.toUpperCase()}` : vendor.bank }, profile: { ...p, bankDetails: { ...b, swift: b.swift.toUpperCase() } } })
    setDirty(false)
    toast.success('Profile saved', 'Btali Purchase has been notified of the update.')
  }
  return (
    <div>
      <PageHeader title="Company Profile" subtitle={`Supplier code ${vendor.code} · Rating ${vendor.rating}/5`}
        actions={<Button icon={Save} onClick={submit} disabled={!dirty}>Save changes</Button>} />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={<span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-brand-500" />Company</span>}>
          <FormGrid cols={2}>
            <Field label="Registered name" required className="md:col-span-2"><Input value={v.name || ''} onChange={(e) => { setV({ ...v, name: e.target.value }); setDirty(true) }} /></Field>
            <Field label="Address" className="md:col-span-2"><Input value={p.address} onChange={(e) => upd((x) => ({ ...x, address: e.target.value }))} /></Field>
            <Field label="City"><Input value={v.city || ''} onChange={(e) => { setV({ ...v, city: e.target.value }); setDirty(true) }} /></Field>
            <Field label="Country"><Input value={v.country || ''} onChange={(e) => { setV({ ...v, country: e.target.value }); setDirty(true) }} /></Field>
            <Field label="Website"><Input value={p.website} onChange={(e) => upd((x) => ({ ...x, website: e.target.value }))} /></Field>
            <Field label="Business licence no."><Input value={p.licence} onChange={(e) => upd((x) => ({ ...x, licence: e.target.value }))} /></Field>
            <Field label="Established"><Input value={p.established} onChange={(e) => upd((x) => ({ ...x, established: e.target.value }))} /></Field>
            <Field label="Employees"><Input value={p.employees} onChange={(e) => upd((x) => ({ ...x, employees: e.target.value }))} /></Field>
            <Field label="Monthly capacity" className="md:col-span-2"><Input value={p.capacity} onChange={(e) => upd((x) => ({ ...x, capacity: e.target.value }))} /></Field>
            <Field label="Primary email" required><Input value={v.email || ''} onChange={(e) => { setV({ ...v, email: e.target.value }); setDirty(true) }} /></Field>
            <Field label="Primary phone"><Input value={v.phone || ''} onChange={(e) => { setV({ ...v, phone: e.target.value }); setDirty(true) }} /></Field>
          </FormGrid>
          <div className="mt-3 text-xs text-slate-500">Categories supplied: {(vendor.categories || []).map((c) => <Badge key={c} className="mr-1">{c}</Badge>)}</div>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Landmark className="w-4 h-4 text-brand-500" />Bank & SWIFT details</span>} subtitle="Used by Btali Accounts for TT remittance">
          <FormGrid cols={2}>
            <Field label="Beneficiary name" className="md:col-span-2"><Input value={p.bankDetails.beneficiary} onChange={setB('beneficiary')} /></Field>
            <Field label="Bank name"><Input value={p.bankDetails.bankName} onChange={setB('bankName')} /></Field>
            <Field label="Account number"><Input value={p.bankDetails.account} onChange={setB('account')} /></Field>
            <Field label="SWIFT / BIC"><Input value={p.bankDetails.swift} onChange={setB('swift')} className="uppercase font-mono" /></Field>
            <Field label="Currency"><Input value={p.bankDetails.currency} onChange={setB('currency')} /></Field>
            <Field label="Bank address" className="md:col-span-2"><Input value={p.bankDetails.bankAddress} onChange={setB('bankAddress')} /></Field>
          </FormGrid>
          <div className="mt-3 text-xs text-slate-500">Payment terms agreed: {vendor.paymentTerms ? `${vendor.paymentTerms.advancePct}% advance · ${vendor.paymentTerms.balancePct}% balance${vendor.paymentTerms.creditDays ? ` · ${vendor.paymentTerms.creditDays} days` : ''}` : '—'}</div>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Users className="w-4 h-4 text-brand-500" />Contacts</span>} actions={<Button size="sm" variant="secondary" icon={Plus} onClick={() => upd((x) => ({ ...x, contacts: [...x.contacts, { name: '', role: '', email: '', phone: '' }] }))}>Add</Button>}>
          <div className="space-y-3">
            {p.contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1.3fr_1fr_auto] gap-2 items-center">
                <Input value={c.name} onChange={setC(i, 'name')} placeholder="Name" />
                <Input value={c.role} onChange={setC(i, 'role')} placeholder="Role" />
                <Input value={c.email} onChange={setC(i, 'email')} placeholder="Email" />
                <Input value={c.phone} onChange={setC(i, 'phone')} placeholder="Phone" />
                <IconButton icon={Trash2} tone="danger" title="Remove contact" onClick={() => upd((x) => ({ ...x, contacts: x.contacts.filter((_, j) => j !== i) }))} />
              </div>
            ))}
          </div>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Award className="w-4 h-4 text-brand-500" />Certificates</span>} subtitle="ISO, CE, BIS and test reports">
          <div className="space-y-2">
            {p.certificates.map((c, i) => {
              const d = c.expiry ? daysBetween(today(), c.expiry) : null
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[180px]"><AttachmentList dense items={[c]} onRemove={() => upd((x) => ({ ...x, certificates: x.certificates.filter((_, j) => j !== i) }))} /></div>
                  <Input type="date" value={c.expiry || ''} onChange={(e) => upd((x) => ({ ...x, certificates: x.certificates.map((y, j) => (j === i ? { ...y, expiry: e.target.value } : y)) }))} className="w-40" />
                  {d != null && <Badge tone={d < 0 ? 'red' : d <= 30 ? 'amber' : 'green'}>{d < 0 ? 'Expired' : d <= 30 ? `Expires ${fmtDate(c.expiry)}` : 'Valid'}</Badge>}
                </div>
              )
            })}
            <FileUpload compact label="Upload certificate" onFiles={(a) => upd((x) => ({ ...x, certificates: [...x.certificates, ...a.map((f) => ({ ...f, docType: 'Certificate' }))] }))} />
          </div>
        </Card>
      </div>
      {dirty && <div className="sticky bottom-0 mt-4 bg-white/95 backdrop-blur border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-card"><span className="text-sm text-slate-600">You have unsaved changes</span><Button icon={Save} onClick={submit}>Save changes</Button></div>}
    </div>
  )
}
