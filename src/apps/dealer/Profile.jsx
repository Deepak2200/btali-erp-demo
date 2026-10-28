import React, { useState } from 'react'
import { Building2, FileCheck2, Users, Truck, Landmark, Send, Plus, Trash2, Save, Pencil } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, StatusBadge, Modal, Field, Input, Select, Textarea, FormGrid, FileUpload, AttachmentList, DescriptionList, IconButton, EmptyState, toast } from '../../components/ui'
import { fmtDate, fmtDateTime } from '../../lib/format'
import { usePortal } from './_portal'

const KYC_TYPES = ['GST certificate', 'PAN card', 'Cancelled cheque', 'Shop & establishment licence', 'Trade licence', 'Dealer agreement', 'Address proof', 'Other']
const FIELDS = [
  ['name', 'Firm name'], ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['pincode', 'PIN code'], ['gstin', 'GSTIN'], ['pan', 'PAN'],
  ['phone', 'Phone'], ['email', 'Email'], ['transporterId', 'Preferred transporter'], ['bankName', 'Bank name'], ['bankAccount', 'Bank account no.'], ['bankIfsc', 'IFSC'],
]

export default function Profile() {
  const { partnerId, partner, isFranchise } = usePortal()
  const transporters = useStore((s) => s.transporters)
  const users = useStore((s) => s.users)
  const addKyc = useStore((s) => s.portalAddKyc)
  const saveContacts = useStore((s) => s.savePartnerContacts)
  const requestChange = useStore((s) => s.portalRequestProfileChange)
  const [kycType, setKycType] = useState(KYC_TYPES[0])
  const [contacts, setContacts] = useState(null)
  const [changeOpen, setChangeOpen] = useState(false)
  if (!partner) return null
  const tr = transporters.find((t) => t.id === partner.transporterId)
  const sp = users.find((u) => u.id === partner.salespersonId)
  const list = contacts || partner.contacts || [{ name: partner.contact, role: 'Owner', phone: partner.phone, email: partner.email, primary: true }]
  const bank = partner.bank || {}

  return (
    <div>
      <PageHeader title={isFranchise ? 'Store profile' : 'Profile & KYC'} subtitle={`${partner.code} · ${partner.type === 'FRANCHISE' ? 'Btali franchise store' : `Tier ${partner.tier} dealer`} since ${fmtDate(partner.onboardedAt)}`}
        actions={<Button icon={Pencil} onClick={() => setChangeOpen(true)}>Request change</Button>} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title={<span className="inline-flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400" />Firm details</span>} subtitle="Changes to registered details are verified by Btali Sales">
            <DescriptionList items={[['Firm name', partner.name], ['Status', <StatusBadge key="s" status={partner.status} />], ['Address', `${partner.address}${partner.pincode ? ` – ${partner.pincode}` : ''}`], ['City / State', `${partner.city}, ${partner.state}`], ['GSTIN', <span key="g" className="font-mono">{partner.gstin || '—'}</span>], ['PAN', <span key="p" className="font-mono">{partner.pan || partner.gstin?.slice(2, 12) || '—'}</span>], ['Phone', partner.phone], ['Email', partner.email], ['Payment terms', partner.paymentTerms], ['Price list', partner.priceListId === 'pl2' ? 'Premium Distributor' : partner.priceListId === 'pl3' ? 'Franchise Transfer' : 'Standard Dealer'], ['Authorised categories', (partner.authorizedCategories || []).join(', ')], ['Btali sales contact', sp ? `${sp.name} · ${sp.phone}` : '—']]} />
          </Card>
          <Card title={<span className="inline-flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" />Contact persons</span>}
            actions={contacts ? <><Button size="sm" variant="ghost" onClick={() => setContacts(null)}>Cancel</Button><Button size="sm" icon={Save} onClick={() => { saveContacts(partnerId, contacts.filter((c) => c.name.trim())); setContacts(null); toast.success('Contacts saved') }}>Save</Button></> : <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setContacts(list.map((c) => ({ ...c })))}>Edit</Button>}>
            {!contacts ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {list.map((c, i) => <div key={i} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-semibold flex items-center gap-2">{c.name}{c.primary && <Badge tone="brand">Primary</Badge>}</div><div className="text-xs text-slate-500">{c.role}</div><div className="text-xs mt-1">{c.phone} · {c.email}</div></div>)}
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((c, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1.3fr_auto] gap-2 items-center">
                    {['name', 'role', 'phone', 'email'].map((k) => <Input key={k} placeholder={k[0].toUpperCase() + k.slice(1)} value={c[k] || ''} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />)}
                    <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => setContacts([...contacts, { name: '', role: 'Accounts', phone: '', email: '' }])}>Add contact</Button>
              </div>
            )}
          </Card>
          <Card title={<span className="inline-flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-slate-400" />KYC documents</span>} subtitle="Upload GST, PAN, cheque and licences – Sales verifies new uploads">
            <AttachmentList items={partner.kyc || []} empty="No documents uploaded." />
            <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:items-start">
              <Select className="sm:w-60" value={kycType} onChange={(e) => setKycType(e.target.value)} options={KYC_TYPES} />
              <div className="flex-1"><FileUpload compact onFiles={(a) => { addKyc(partnerId, a, kycType); toast.success('Document uploaded', `${kycType} sent to Btali for verification`) }} label={`Upload ${kycType}`} /></div>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title={<span className="inline-flex items-center gap-2"><Truck className="w-4 h-4 text-slate-400" />Preferred transporter</span>}>
            <div className="text-sm font-semibold">{tr?.name || '—'}</div>
            <div className="text-xs text-slate-500">{tr ? `${tr.contact} · ${tr.phone}` : ''}</div>
            {tr?.isSafex && <Badge tone="blue" className="mt-2">Collects from Btali warehouse</Badge>}
            <Button size="sm" variant="link" className="mt-2" onClick={() => setChangeOpen(true)}>Change transporter</Button>
          </Card>
          <Card title={<span className="inline-flex items-center gap-2"><Landmark className="w-4 h-4 text-slate-400" />Bank details (for refunds)</span>}>
            <DescriptionList cols={1} items={[['Bank', bank.name || 'Not provided'], ['Account no.', bank.account ? `XXXX${String(bank.account).slice(-4)}` : '—'], ['IFSC', bank.ifsc || '—']]} />
            <Button size="sm" variant="link" className="mt-2" onClick={() => setChangeOpen(true)}>Update bank details</Button>
          </Card>
          <Card title="Change requests">
            {(partner.changeRequests || []).length === 0 ? <EmptyState title="No requests" message="Requests you raise appear here with their status." /> : (
              <div className="space-y-2">
                {partner.changeRequests.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                    <div className="flex justify-between gap-2"><span className="text-xs text-slate-500">{fmtDateTime(r.ts)}</span><StatusBadge status={r.status} /></div>
                    {Object.entries(r.changes).map(([k, v]) => <div key={k} className="text-xs mt-1"><b>{k}:</b> {v.to}</div>)}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      <ChangeModal open={changeOpen} onClose={() => setChangeOpen(false)} partner={partner} transporters={transporters}
        onSubmit={(changes, note) => { requestChange(partnerId, { changes, note }); toast.success('Change request sent', 'Btali Sales will verify and update your profile'); setChangeOpen(false) }} />
    </div>
  )
}

function ChangeModal({ open, onClose, partner, transporters, onSubmit }) {
  const current = (k) => (k === 'transporterId' ? transporters.find((t) => t.id === partner.transporterId)?.name : k === 'bankName' ? partner.bank?.name : k === 'bankAccount' ? partner.bank?.account : k === 'bankIfsc' ? partner.bank?.ifsc : partner[k]) || ''
  const [v, setV] = useState({})
  const [note, setNote] = useState('')
  React.useEffect(() => { if (open) { setV({}); setNote('') } }, [open])
  const changes = Object.fromEntries(FIELDS.filter(([k]) => v[k] != null && String(v[k]).trim() && String(v[k]) !== String(current(k))).map(([k, label]) => [label, { from: current(k), to: k === 'transporterId' ? transporters.find((t) => t.id === v[k])?.name : v[k] }]))
  return (
    <Modal open={open} onClose={onClose} title="Request profile change" subtitle="Edit only what needs to change" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} disabled={!Object.keys(changes).length} onClick={() => onSubmit(changes, note)}>Send to Btali Sales ({Object.keys(changes).length})</Button></>}>
      <FormGrid>
        {FIELDS.map(([k, label]) => (
          <Field key={k} label={label} hint={current(k) ? `Current: ${current(k)}` : undefined}>
            {k === 'transporterId' ? <Select value={v[k] ?? partner.transporterId} onChange={(e) => setV({ ...v, [k]: e.target.value })} options={transporters.map((t) => ({ value: t.id, label: t.name }))} />
              : <Input value={v[k] ?? ''} placeholder={String(current(k) || '')} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
          </Field>
        ))}
        <Field label="Reason / note" className="md:col-span-2"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  )
}
