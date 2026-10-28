import React, { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, Modal, FormGrid, Field, Input, Select, Textarea, DescriptionList, AttachmentList, FileUpload, StatusBadge, Avatar, Alert, EmptyState, SectionTitle, toast } from '../../../components/ui'
import { fmtDate, fmtDateTime } from '../../../lib/format'
import { maskId } from '../../../store/slices/hr'
import { useMyEmployee, useEmpMap, EmpStatus } from '../hr/_parts'

const LABEL = { phone: 'Mobile', address: 'Address', personalEmail: 'Personal email', emergencyContact: 'Emergency contact', bank: 'Bank details', maritalStatus: 'Marital status', bloodGroup: 'Blood group' }
const fmtVal = (k, v) => (k === 'bank' && v ? `${v.name || ''} · A/c ${v.account || ''} · ${v.ifsc || ''}` : v || '—')

export default function MyProfile() {
  const me = useMyEmployee()
  const empMap = useEmpMap()
  const shifts = useStore((s) => s.shifts || [])
  const requests = useStore((s) => (s.profileRequests || []).filter((r) => r.empId === me?.id))
  const addEmployeeDocs = useStore((s) => s.addEmployeeDocs)
  const [edit, setEdit] = useState(false)
  if (!me) return <div><PageHeader title="My Profile" /><EmptyState title="No employee record linked to your login" message="Please contact HR." /></div>
  const pending = requests.find((r) => r.status === 'PENDING')
  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your employment record with Btali International" actions={<Button icon={Pencil} onClick={() => setEdit(true)}>Request change</Button>} />
      {pending && <Alert tone="info" className="mb-4" title={`Change request ${pending.number} is with HR`}>Requested {fmtDateTime(pending.requestedAt)} – {Object.keys(pending.changes).map((k) => LABEL[k] || k).join(', ')}. Your record updates once approved.</Alert>}
      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1">
          <div className="flex items-center gap-3">
            <Avatar name={me.name} size="lg" />
            <div><div className="font-semibold text-ink-900">{me.name}</div><div className="text-xs text-slate-500">{me.designation}</div><div className="mt-1"><EmpStatus emp={me} /></div></div>
          </div>
          <div className="mt-4"><DescriptionList cols={1} items={[
            ['Employee code', me.code], ['Department', me.dept], ['Reports to', empMap[me.managerId]?.name || '—'], ['Date of joining', fmtDate(me.doj)],
            ['Location', me.location], ['Shift', (() => { const s = shifts.find((x) => x.id === me.shiftId); return s ? `${s.name} (${s.start}–${s.end})` : '—' })()],
          ]} /></div>
        </Card>
        <div className="xl:col-span-2 space-y-4">
          <Card title="Personal details">
            <DescriptionList cols={3} items={[
              ['Mobile', me.phone], ['Work email', me.email], ['Personal email', me.personalEmail], ['Date of birth', fmtDate(me.dob)], ['Blood group', me.bloodGroup], ['Marital status', me.maritalStatus],
              ['Emergency contact', me.emergencyContact], ['Address', me.address],
            ]} />
          </Card>
          <Card title="Statutory & bank">
            <DescriptionList cols={3} items={[
              ['PAN', me.pan], ['UAN', me.uan], ['ESIC IP no.', me.esic], ['Aadhaar', maskId(me.aadhaar?.replace(/\s/g, ''))],
              ['Bank', me.bank?.name], ['Account', maskId(me.bank?.account)], ['IFSC', me.bank?.ifsc],
            ]} />
          </Card>
          <Card title="My documents" actions={<span className="text-xs text-slate-500">{(me.documents || []).length} files</span>}>
            <AttachmentList items={me.documents || []} />
            <div className="mt-3"><FileUpload compact label="Upload a document for HR (certificates, ID proof…)" onFiles={(atts) => { addEmployeeDocs(me.id, atts, 'Other'); toast.success('Uploaded', 'HR can now see the document on your record') }} /></div>
          </Card>
          <Card title="Change requests">
            {!requests.length && <div className="text-sm text-slate-400">No change requests raised.</div>}
            <ul className="divide-y divide-slate-100">
              {requests.map((r) => (
                <li key={r.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{r.number} · {Object.keys(r.changes).map((k) => LABEL[k] || k).join(', ')}</span><StatusBadge status={r.status} /></div>
                  <div className="text-xs text-slate-500 mt-0.5">{fmtDateTime(r.requestedAt)}{r.remark ? ` · HR: ${r.remark}` : ''}</div>
                  <div className="text-xs text-slate-600 mt-1">{Object.entries(r.changes).map(([k, v]) => `${LABEL[k] || k}: ${fmtVal(k, v)}`).join(' · ')}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      {edit && <ChangeModal me={me} onClose={() => setEdit(false)} />}
    </div>
  )
}

function ChangeModal({ me, onClose }) {
  const requestProfileChange = useStore((s) => s.requestProfileChange)
  const [f, setF] = useState({ phone: me.phone || '', personalEmail: me.personalEmail || '', address: me.address || '', emergencyContact: me.emergencyContact || '', maritalStatus: me.maritalStatus || '', bloodGroup: me.bloodGroup || '', bankName: me.bank?.name || '', account: me.bank?.account || '', ifsc: me.bank?.ifsc || '' })
  const [reason, setReason] = useState('')
  const [atts, setAtts] = useState([])
  const submit = () => {
    const changes = {}
    for (const k of ['phone', 'personalEmail', 'address', 'emergencyContact', 'maritalStatus', 'bloodGroup']) if ((f[k] || '') !== (me[k] || '')) changes[k] = f[k]
    if (f.bankName !== (me.bank?.name || '') || f.account !== (me.bank?.account || '') || f.ifsc !== (me.bank?.ifsc || '')) {
      if (f.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc)) return toast.error('Invalid IFSC', 'Format: HDFC0001234')
      if (!atts.length) return toast.error('Attach a cancelled cheque', 'Required for bank account changes')
      changes.bank = { name: f.bankName, account: f.account, ifsc: f.ifsc, holder: me.name }
    }
    if (!Object.keys(changes).length) return toast.error('No changes made')
    const r = requestProfileChange({ empId: me.id, changes, reason, attachments: atts })
    toast.success('Request sent to HR', `${r.number} · you will be notified once reviewed`)
    onClose()
  }
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal open size="lg" title="Request profile change" subtitle="Changes are applied after HR verification" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Submit request</Button></>}>
      <div className="space-y-4">
        <SectionTitle>Personal</SectionTitle>
        <FormGrid cols={3}>
          <Field label="Mobile"><Input value={f.phone} onChange={s('phone')} /></Field>
          <Field label="Personal email"><Input type="email" value={f.personalEmail} onChange={s('personalEmail')} /></Field>
          <Field label="Emergency contact"><Input value={f.emergencyContact} onChange={s('emergencyContact')} /></Field>
          <Field label="Marital status"><Select value={f.maritalStatus} placeholder="—" onChange={s('maritalStatus')} options={['Single', 'Married']} /></Field>
          <Field label="Blood group"><Select value={f.bloodGroup} placeholder="—" onChange={s('bloodGroup')} options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']} /></Field>
        </FormGrid>
        <Field label="Address"><Input value={f.address} onChange={s('address')} /></Field>
        <SectionTitle>Salary bank account</SectionTitle>
        <FormGrid cols={3}>
          <Field label="Bank"><Input value={f.bankName} onChange={s('bankName')} /></Field>
          <Field label="Account number"><Input value={f.account} onChange={s('account')} /></Field>
          <Field label="IFSC"><Input value={f.ifsc} maxLength={11} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} /></Field>
        </FormGrid>
        <Field label="Reason"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shifted house / new salary account" /></Field>
        <Field label="Supporting documents" hint="Cancelled cheque for bank changes, address proof for address changes">
          <FileUpload compact label="Upload proof" onFiles={(a) => setAtts([...atts, ...a])} />
        </Field>
        {atts.length > 0 && <AttachmentList dense items={atts} onRemove={(a) => setAtts(atts.filter((x) => x.id !== a.id))} />}
      </div>
    </Modal>
  )
}

