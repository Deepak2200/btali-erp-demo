import React, { useState } from 'react'
import { useStore } from '../../../store'
import { Modal, Button, Field, FormGrid, Input, Select, Textarea, Checkbox, Combobox, Alert, toast } from '../../../components/ui'
import { today } from '../../../lib/format'
import { LEAVE_TYPES, datesBetween, calendarCode } from '../../../store/slices/hr'

/** Apply leave – used by HR (on behalf, empId selectable) and by employees (fixed empId) */
export default function LeaveForm({ empId: fixedEmp, onClose, onBehalf = false }) {
  const state = useStore()
  const { employees = [], leaveBalances = [], applyLeave, approveLeave } = state
  const [f, setF] = useState({ empId: fixedEmp || '', type: 'CL', from: today(), to: today(), half: false, reason: '', approveNow: false })
  const emp = employees.find((e) => e.id === f.empId)
  const bal = leaveBalances.find((b) => b.empId === f.empId)
  const days = emp && f.from && (f.half || f.to >= f.from) ? (f.half ? (calendarCode(state, emp, f.from) ? 0 : 0.5) : datesBetween(f.from, f.to).filter((d) => !calendarCode(state, emp, d)).length) : 0
  const avail = bal?.[f.type] ? bal[f.type].entitled - bal[f.type].used : null
  const submit = () => {
    if (!f.empId) return toast.error('Select an employee')
    if (!f.reason.trim()) return toast.error('Please enter a reason')
    if (!f.half && f.to < f.from) return toast.error('“To” date must be on or after “From”')
    const r = applyLeave({ empId: f.empId, type: f.type, from: f.from, to: f.half ? f.from : f.to, half: f.half, reason: f.reason, onBehalf })
    if (!r.ok) return toast.error('Leave not submitted', r.error)
    if (onBehalf && f.approveNow) approveLeave(r.leave.id, true, 'Applied & approved by HR')
    toast.success(onBehalf && f.approveNow ? 'Leave recorded & approved' : 'Leave request submitted', `${r.leave.days} day(s) · ${onBehalf ? emp.name : 'HR & your manager have been notified'}`)
    onClose()
  }
  return (
    <Modal open size="md" title={onBehalf ? 'Apply leave on behalf' : 'Apply for leave'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!days}>Submit {days ? `(${days} day${days === 1 ? '' : 's'})` : ''}</Button></>}>
      <div className="space-y-3">
        {!fixedEmp && (
          <Field label="Employee" required>
            <Combobox value={f.empId} onChange={(v) => setF({ ...f, empId: v })} placeholder="Select employee…"
              options={employees.filter((e) => e.status !== 'EXITED').map((e) => ({ value: e.id, label: e.name, sub: `${e.code} · ${e.designation}` }))} />
          </Field>
        )}
        <FormGrid>
          <Field label="Leave type" hint={avail != null ? `Available: ${avail} day(s)` : f.type === 'LOP' ? 'Unpaid – deducted in payroll' : ''}>
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={LEAVE_TYPES.map((l) => ({ value: l.code, label: l.name }))} />
          </Field>
          <Field label=" "><div className="pt-2"><Checkbox label="Half day" checked={f.half} onChange={(v) => setF({ ...f, half: v })} /></div></Field>
          <Field label="From" required><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: e.target.value > f.to ? e.target.value : f.to })} /></Field>
          {!f.half && <Field label="To" required><Input type="date" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>}
        </FormGrid>
        <Field label="Reason" required><Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {emp && <div className="text-xs text-slate-500">{days} working day(s) – weekly offs and holidays excluded.</div>}
        {avail != null && days > avail && <Alert tone="warn">Requested days exceed the available {f.type} balance. Choose another leave type or Leave Without Pay.</Alert>}
        {onBehalf && <Checkbox label="Approve immediately (e.g. leave already taken / informed by phone)" checked={f.approveNow} onChange={(v) => setF({ ...f, approveNow: v })} />}
      </div>
    </Modal>
  )
}
