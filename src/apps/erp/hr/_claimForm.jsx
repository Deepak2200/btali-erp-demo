import React, { useState } from 'react'
import { useStore } from '../../../store'
import { Modal, Button, Field, FormGrid, Input, NumberInput, Select, Textarea, Combobox, FileUpload, AttachmentList, toast } from '../../../components/ui'
import { today, fmtINR } from '../../../lib/format'
import { CLAIM_TYPES } from '../../../store/slices/hr'

const FUEL_RATE = 4.5

/** Reimbursement claim form – HR (choose employee) or self-service (fixed employee) */
export default function ClaimForm({ empId: fixedEmp, onClose }) {
  const { employees = [], submitEmpClaim } = useStore()
  const [f, setF] = useState({ empId: fixedEmp || '', type: 'TRAVEL', date: today(), amount: '', km: '', description: '', attachments: [] })
  const submit = () => {
    if (!f.empId) return toast.error('Select an employee')
    if (!(Number(f.amount) > 0)) return toast.error('Enter the claim amount')
    if (!f.description.trim()) return toast.error('Describe the expense')
    if (f.date > today()) return toast.error('Expense date cannot be in the future')
    if (!f.attachments.length && Number(f.amount) > 500) return toast.error('Attach a receipt', 'Bills are mandatory for claims above ₹500')
    const c = submitEmpClaim({ ...f, km: f.km ? Number(f.km) : null })
    toast.success('Claim submitted', `${c.number} · ${fmtINR(c.amount)} sent for approval`)
    onClose()
  }
  return (
    <Modal open size="md" title="New reimbursement claim" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Submit claim</Button></>}>
      <div className="space-y-3">
        {!fixedEmp && (
          <Field label="Employee" required>
            <Combobox value={f.empId} onChange={(v) => setF({ ...f, empId: v })} placeholder="Select employee…" options={employees.filter((e) => e.status !== 'EXITED').map((e) => ({ value: e.id, label: e.name, sub: `${e.code} · ${e.designation}` }))} />
          </Field>
        )}
        <FormGrid cols={3}>
          <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={CLAIM_TYPES} /></Field>
          <Field label="Expense date" required><Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          {f.type === 'FUEL'
            ? <Field label="Distance (km)" hint={`₹${FUEL_RATE}/km two-wheeler rate`}><NumberInput value={f.km} onChange={(v) => setF({ ...f, km: v, amount: v ? Math.round(v * FUEL_RATE) : f.amount })} /></Field>
            : <Field label="Amount (₹)" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>}
        </FormGrid>
        {f.type === 'FUEL' && <Field label="Amount (₹)" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>}
        <Field label="Description" required><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Dealer visits – Nashik & Dhule" /></Field>
        <Field label="Receipts / bills">
          <FileUpload compact accept="image/*,.pdf" label="Upload bill photos or PDF" onFiles={(atts) => setF({ ...f, attachments: [...f.attachments, ...atts] })} />
        </Field>
        {f.attachments.length > 0 && <AttachmentList dense items={f.attachments} onRemove={(a) => setF({ ...f, attachments: f.attachments.filter((x) => x.id !== a.id) })} />}
      </div>
    </Modal>
  )
}
