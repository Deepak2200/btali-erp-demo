import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserPlus, Users, UserMinus, FileWarning, ClipboardEdit, Pencil, LogOut, Undo2, Mail, Check, X, Lock, IndianRupee } from 'lucide-react'
import { useStore } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Button, Drawer, Modal, Tabs, FormGrid, Field, Input, NumberInput, Select, Textarea, DescriptionList, Badge, StatusBadge,
  FileUpload, AttachmentList, Alert, SectionTitle, KV, Timeline, toast, confirm, prompt,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate, today, daysBetween } from '../../../lib/format'
import { DEPARTMENTS, ctcBreakup, attendanceSummary, currentPeriod, LEAVE_TYPES } from '../../../store/slices/hr'
import { EmpCell, EmpStatus, MaskedId, useCanSeeSalary, useEmpMap } from './_parts'

const DOC_TYPES = ['ID proof', 'Address proof', 'Offer letter', 'Contract', 'Previous employment', 'Education', 'Other']
const LOCATIONS = ['Navi Mumbai HQ', 'Btali Warehouse, Bhiwandi', 'Field']
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
const FIELD_LABEL = { phone: 'Mobile', address: 'Address', personalEmail: 'Personal email', emergencyContact: 'Emergency contact', bank: 'Bank details', maritalStatus: 'Marital status', bloodGroup: 'Blood group' }

export default function Employees() {
  const employees = useStore((s) => s.employees || [])
  const requests = useStore((s) => s.profileRequests || [])
  const shifts = useStore((s) => s.shifts || [])
  const canSal = useCanSeeSalary()
  const empMap = useEmpMap()
  const [params, setParams] = useSearchParams()
  const [openId, setOpenId] = useState(params.get('emp'))
  const [form, setForm] = useState(null)
  const [view, setView] = useState('current')

  useEffect(() => { if (params.get('emp')) setOpenId(params.get('emp')) }, [params])
  const pending = requests.filter((r) => r.status === 'PENDING')
  const active = employees.filter((e) => e.status !== 'EXITED')
  const missingDocs = active.filter((e) => !['ID proof', 'Offer letter', 'Contract'].every((t) => (e.documents || []).some((d) => d.docType === t)))
  const joiners = employees.filter((e) => daysBetween(e.doj, today()) <= 90)
  const rows = useMemo(() => {
    if (view === 'exited') return employees.filter((e) => e.status === 'EXITED')
    if (view === 'requests') return employees.filter((e) => pending.some((r) => r.empId === e.id))
    if (view === 'docs') return missingDocs
    return active
  }, [view, employees, pending, missingDocs, active])

  const close = () => { setOpenId(null); if (params.get('emp')) { params.delete('emp'); setParams(params, { replace: true }) } }

  const columns = [
    { key: 'name', header: 'Employee', render: (e) => <EmpCell emp={e} />, value: (e) => `${e.name} ${e.code}` },
    { key: 'dept', header: 'Department' },
    { key: 'location', header: 'Location', className: 'whitespace-nowrap' },
    { key: 'manager', header: 'Reports to', value: (e) => empMap[e.managerId]?.name || '—', className: 'whitespace-nowrap' },
    { key: 'shift', header: 'Shift', value: (e) => shifts.find((s) => s.id === e.shiftId)?.code || '—' },
    { key: 'doj', header: 'Joined', className: 'whitespace-nowrap', render: (e) => fmtDate(e.doj), value: (e) => e.doj },
    { key: 'ctc', header: 'CTC (p.a.)', align: 'right', hidden: !canSal, render: (e) => fmtINR(e.ctc), value: (e) => e.ctc },
    { key: 'status', header: 'Status', render: (e) => <div className="flex gap-1"><EmpStatus emp={e} />{pending.some((r) => r.empId === e.id) && <Badge tone="violet">Change request</Badge>}</div>, value: (e) => e.status },
  ]

  return (
    <div>
      <PageHeader title="Employees" subtitle="Employee master – personal, job, statutory, bank and salary records with documents"
        actions={<Button icon={UserPlus} onClick={() => setForm({})}>Add employee</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Active headcount" value={active.length} sub={`${employees.filter((e) => e.status === 'NOTICE').length} on notice`} icon={Users} onClick={() => setView('current')} />
        <Stat label="Joined in last 90 days" value={joiners.length} sub={joiners.map((j) => j.name.split(' ')[0]).join(', ') || '—'} icon={UserPlus} tone="green" />
        <Stat label="Profile change requests" value={pending.length} sub="awaiting HR review" icon={ClipboardEdit} tone="violet" onClick={() => setView('requests')} />
        <Stat label="Incomplete documents" value={missingDocs.length} sub="ID / offer / contract missing" icon={FileWarning} tone="amber" onClick={() => setView('docs')} />
      </Grid>
      {pending.length > 0 && view !== 'requests' && (
        <Alert tone="info" className="mb-4" title={`${pending.length} self-service change request${pending.length > 1 ? 's' : ''} pending`}
          action={<Button size="sm" variant="secondary" onClick={() => setView('requests')}>Review</Button>}>
          {pending.map((r) => `${empMap[r.empId]?.name} (${Object.keys(r.changes).map((k) => FIELD_LABEL[k] || k).join(', ')})`).join(' · ')}
        </Alert>
      )}
      <Tabs className="mb-3" value={view} onChange={setView} tabs={[
        { key: 'current', label: 'Current', count: active.length },
        { key: 'requests', label: 'Change requests', count: pending.length },
        { key: 'docs', label: 'Incomplete documents', count: missingDocs.length },
        { key: 'exited', label: 'Exited', count: employees.filter((e) => e.status === 'EXITED').length },
      ]} />
      <DataTable columns={columns} rows={rows} onRowClick={(e) => setOpenId(e.id)} exportName="employees" searchPlaceholder="Search name, code, designation…"
        filters={[
          { key: 'dept', label: 'departments', options: DEPARTMENTS },
          { key: 'designation', label: 'designations', options: [...new Set(employees.map((e) => e.designation))].sort() },
          { key: 'location', label: 'locations', options: LOCATIONS },
          { key: 'status', label: 'statuses', options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'NOTICE', label: 'Notice period' }, { value: 'EXITED', label: 'Exited' }] },
        ]} pageSize={15} />
      {openId && empMap[openId] && <EmployeeDrawer emp={empMap[openId]} onClose={close} onEdit={() => setForm(empMap[openId])} />}
      {form && <EmployeeForm initial={form} onClose={() => setForm(null)} onSaved={(id) => { setForm(null); setOpenId(id) }} />}
    </div>
  )
}

// ====================================================================== drawer
function EmployeeDrawer({ emp, onClose, onEdit }) {
  const canSal = useCanSeeSalary()
  const empMap = useEmpMap()
  const structures = useStore((s) => s.salaryStructures || [])
  const shifts = useStore((s) => s.shifts || [])
  const requests = useStore((s) => (s.profileRequests || []).filter((r) => r.empId === emp.id))
  const balance = useStore((s) => (s.leaveBalances || []).find((b) => b.empId === emp.id))
  const state = useStore()
  const { addEmployeeDocs, removeEmployeeDoc, decideProfileChange, reinstateEmployee, sendEmail, updateEmployee } = state
  const [tab, setTab] = useState(requests.some((r) => r.status === 'PENDING') ? 'requests' : 'overview')
  const [docType, setDocType] = useState('ID proof')
  const [exitOpen, setExitOpen] = useState(false)
  const [revise, setRevise] = useState(null)
  const st = structures.find((s) => s.id === emp.structureId)
  const br = st ? ctcBreakup(st, emp.ctc, emp.gender) : null
  const att = attendanceSummary(state, emp, currentPeriod())
  const reports = Object.values(empMap).filter((e) => e.managerId === emp.id && e.status !== 'EXITED')

  const decide = async (r, ok) => {
    let remark = ''
    if (!ok) { remark = await prompt({ title: 'Reject change request', label: 'Reason (sent to employee)', required: true }); if (remark == null) return }
    decideProfileChange(r.id, ok, remark)
    toast.success(ok ? 'Change applied to employee record' : 'Request rejected', `${emp.name} has been notified`)
  }
  const fmtVal = (k, v) => (k === 'bank' && v ? `${v.name || ''} · A/c ${v.account || ''} · ${v.ifsc || ''}` : v || '—')

  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={`${emp.name}`} subtitle={<span className="flex items-center gap-2 flex-wrap">{emp.code} · {emp.designation} · {emp.dept} <EmpStatus emp={emp} /></span>}
      footer={<>
        <Button variant="secondary" icon={Mail} onClick={async () => {
          const body = await prompt({ title: `Email ${emp.name}`, label: 'Message', required: true })
          if (!body) return
          sendEmail({ to: emp.email, subject: 'Message from HR – Btali International', body, ref: emp.code, kind: 'HR' })
          toast.success('Email sent', emp.email)
        }}>Email</Button>
        {emp.status === 'ACTIVE' && <Button variant="secondary" icon={LogOut} onClick={() => setExitOpen(true)}>Initiate exit</Button>}
        {emp.status !== 'ACTIVE' && <Button variant="secondary" icon={Undo2} onClick={async () => {
          if (!(await confirm({ title: 'Withdraw exit?', message: `${emp.name} will be marked active again.` }))) return
          reinstateEmployee(emp.id); toast.success('Employee reinstated')
        }}>Withdraw exit</Button>}
        <Button icon={Pencil} onClick={onEdit}>Edit</Button>
      </>}>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview' },
        { key: 'statutory', label: 'Statutory & bank' },
        { key: 'salary', label: 'Salary' },
        { key: 'documents', label: 'Documents', count: (emp.documents || []).length },
        { key: 'requests', label: 'Change requests', count: requests.filter((r) => r.status === 'PENDING').length },
      ]} />

      {tab === 'overview' && (
        <div className="space-y-5">
          {emp.status !== 'ACTIVE' && (
            <Alert tone={emp.status === 'EXITED' ? 'info' : 'warn'} title={emp.status === 'EXITED' ? `Exited on ${fmtDate(emp.exitDate)}` : `Serving notice – last working day ${fmtDate(emp.exitDate)}`}>
              {emp.exitType && `${emp.exitType.replace('_', ' ').toLowerCase()} · `}{emp.exitReason}
            </Alert>
          )}
          <div>
            <SectionTitle>Job</SectionTitle>
            <DescriptionList cols={3} items={[
              ['Department', emp.dept], ['Designation', emp.designation], ['Reports to', empMap[emp.managerId]?.name || 'Board'],
              ['Date of joining', fmtDate(emp.doj)], ['Employment type', emp.employmentType === 'PROBATION' ? 'Probation' : emp.employmentType === 'CONTRACT' ? 'Contract' : 'Permanent'], ['Work location', emp.location],
              ['Shift', shifts.find((s) => s.id === emp.shiftId)?.name || '—'], ['Salary structure', st?.name || 'Not assigned'], ['Direct reports', reports.length ? reports.map((r) => r.name).join(', ') : '—'],
            ]} />
          </div>
          <div>
            <SectionTitle>Personal</SectionTitle>
            <DescriptionList cols={3} items={[
              ['Mobile', emp.phone], ['Work email', emp.email], ['Personal email', emp.personalEmail],
              ['Date of birth', fmtDate(emp.dob)], ['Gender', emp.gender === 'F' ? 'Female' : 'Male'], ['Blood group', emp.bloodGroup],
              ['Marital status', emp.maritalStatus], ['Emergency contact', emp.emergencyContact], ['Address', emp.address],
            ]} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card title="This month's attendance" padded>
              <KV label="Present" value={att.present} /><KV label="Leave" value={att.leave} /><KV label="Absent / LOP" value={att.lop - att.notEmployed} /><KV label="Late arrivals" value={att.late} />
            </Card>
            <Card title="Leave balance" padded>
              {LEAVE_TYPES.filter((l) => l.code !== 'LOP').map((l) => <KV key={l.code} label={l.name} value={balance?.[l.code] ? `${balance[l.code].entitled - balance[l.code].used} / ${balance[l.code].entitled}` : '—'} />)}
            </Card>
          </div>
        </div>
      )}

      {tab === 'statutory' && (
        <div className="space-y-5">
          <div>
            <SectionTitle>Statutory identifiers</SectionTitle>
            <DescriptionList cols={2} items={[
              ['PAN', <MaskedId value={emp.pan} />], ['Aadhaar', <MaskedId value={emp.aadhaar} />],
              ['UAN (EPFO)', <MaskedId value={emp.uan} />], ['ESIC IP number', <MaskedId value={emp.esic} />],
              ['Tax regime', 'New regime (115BAC)'], ['PF / ESIC applicability', st ? `${st.pf ? 'PF' : ''}${st.esic && br?.gross <= 21000 ? ' + ESIC' : ''}` : '—'],
            ]} />
          </div>
          <div>
            <SectionTitle>Salary bank account</SectionTitle>
            <DescriptionList cols={2} items={[
              ['Bank', emp.bank?.name], ['Account holder', emp.bank?.holder || emp.name],
              ['Account number', <MaskedId value={emp.bank?.account} />], ['IFSC', emp.bank?.ifsc],
            ]} />
          </div>
          {!canSal && <Alert tone="info" icon={Lock}>Full identifiers are visible to HR and Finance only.</Alert>}
        </div>
      )}

      {tab === 'salary' && (!canSal ? (
        <Alert tone="warn" title="Restricted">Salary details are confidential and visible to HR, Finance Head and Director only.</Alert>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div>
              <div className="text-xs text-slate-500">Annual CTC</div>
              <div className="text-2xl font-bold text-ink-900">{fmtINR(emp.ctc)}</div>
              <div className="text-xs text-slate-500">{st?.name || 'No structure'} structure · monthly gross {fmtINR(br?.gross)}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={emp.structureId || ''} placeholder="Assign structure" options={structures.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(e) => { updateEmployee(emp.id, { structureId: e.target.value }, 'Changed salary structure'); toast.success('Salary structure updated') }} />
              <Button variant="secondary" icon={IndianRupee} onClick={() => setRevise({ ctc: emp.ctc, effectiveFrom: today(), revisionNote: 'Annual increment' })}>Revise CTC</Button>
            </div>
          </div>
          {br && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Monthly earnings" padded>
                {br.earnings.map((e) => <KV key={e.code} label={e.name} value={fmtINR(e.amount)} />)}
                <KV className="border-t border-slate-100 font-semibold" label="Gross" value={fmtINR(br.gross)} />
              </Card>
              <Card title="Deductions & employer cost" padded>
                {br.deductions.map((d) => <KV key={d.code} label={d.name} value={fmtINR(d.amount)} />)}
                <KV className="border-t border-slate-100" label="Net take-home" value={<span className="text-emerald-700">{fmtINR(br.net)}</span>} />
                <KV label="Employer PF (12%)" value={fmtINR(br.employer.pf)} />
                <KV label="Employer ESIC (3.25%)" value={fmtINR(br.employer.esic)} />
              </Card>
            </div>
          )}
          <div>
            <SectionTitle>Revision history</SectionTitle>
            <Timeline items={[...(emp.revisions || [])].reverse().map((r) => ({ ts: r.date, text: `${fmtINR(r.ctc)} p.a. – ${r.note}` }))} />
          </div>
        </div>
      ))}

      {tab === 'documents' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="sm:w-48"><Field label="Document type"><Select value={docType} onChange={(e) => setDocType(e.target.value)} options={DOC_TYPES} /></Field></div>
            <div className="flex-1"><FileUpload compact label="Upload ID proofs, offer letter, contract…" onFiles={(atts) => { addEmployeeDocs(emp.id, atts, docType); toast.success(`${atts.length} document(s) uploaded`, docType) }} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {['ID proof', 'Offer letter', 'Contract'].map((t) => (emp.documents || []).some((d) => d.docType === t)
              ? <Badge key={t} tone="green"><Check className="w-3 h-3" />{t}</Badge> : <Badge key={t} tone="amber"><X className="w-3 h-3" />{t} missing</Badge>)}
          </div>
          <AttachmentList items={emp.documents || []} onRemove={async (a) => {
            if (!(await confirm({ title: 'Remove document?', message: a.name, tone: 'danger', confirmText: 'Remove' }))) return
            removeEmployeeDoc(emp.id, a.id); toast.success('Document removed')
          }} />
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 && <div className="text-sm text-slate-400">No change requests raised by this employee.</div>}
          {requests.map((r) => (
            <div key={r.id} className="border border-slate-200 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-semibold">{r.number} <span className="text-xs font-normal text-slate-500">· {fmtDate(r.requestedAt)}</span></div>
                <StatusBadge status={r.status} />
              </div>
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-slate-400"><tr><th className="text-left py-1">Field</th><th className="text-left py-1">Current</th><th className="text-left py-1">Requested</th></tr></thead>
                <tbody>
                  {Object.entries(r.changes).map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100 align-top">
                      <td className="py-1.5 pr-2 text-slate-500">{FIELD_LABEL[k] || k}</td>
                      <td className="py-1.5 pr-2 text-slate-500 line-through decoration-slate-300">{fmtVal(k, r.current?.[k])}</td>
                      <td className="py-1.5 font-medium text-slate-800">{fmtVal(k, v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.reason && <div className="text-xs text-slate-500 mt-2">Reason: {r.reason}</div>}
              {r.attachments?.length > 0 && <div className="mt-2"><AttachmentList dense items={r.attachments} /></div>}
              {r.remark && <div className="text-xs text-slate-500 mt-2">HR remark: {r.remark}</div>}
              {r.status === 'PENDING' && (
                <div className="flex gap-2 justify-end mt-3">
                  <Button size="sm" variant="secondary" icon={X} onClick={() => decide(r, false)}>Reject</Button>
                  <Button size="sm" variant="success" icon={Check} onClick={() => decide(r, true)}>Approve & apply</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {exitOpen && <ExitModal emp={emp} onClose={() => setExitOpen(false)} />}
      {revise && (
        <Modal open size="sm" title="Revise CTC" onClose={() => setRevise(null)} footer={<>
          <Button variant="secondary" onClick={() => setRevise(null)}>Cancel</Button>
          <Button disabled={!revise.ctc} onClick={() => { updateEmployee(emp.id, revise, 'Revised CTC'); toast.success('CTC revised', `${fmtINR(revise.ctc)} p.a. from ${fmtDate(revise.effectiveFrom)}`); setRevise(null) }}>Save revision</Button>
        </>}>
          <div className="space-y-3">
            <Field label="New annual CTC (₹)" required><NumberInput value={revise.ctc} onChange={(v) => setRevise({ ...revise, ctc: v })} /></Field>
            <Field label="Effective from"><Input type="date" value={revise.effectiveFrom} onChange={(e) => setRevise({ ...revise, effectiveFrom: e.target.value })} /></Field>
            <Field label="Note"><Input value={revise.revisionNote} onChange={(e) => setRevise({ ...revise, revisionNote: e.target.value })} /></Field>
            {st && revise.ctc > 0 && <div className="text-xs text-slate-500">Monthly gross {fmtINR(ctcBreakup(st, revise.ctc, emp.gender).gross)} · change {fmtINR(revise.ctc - emp.ctc)} p.a. ({emp.ctc ? (((revise.ctc - emp.ctc) / emp.ctc) * 100).toFixed(1) : 0}%)</div>}
          </div>
        </Modal>
      )}
    </Drawer>
  )
}

function ExitModal({ emp, onClose }) {
  const exitEmployee = useStore((s) => s.exitEmployee)
  const [f, setF] = useState({ date: today(), lastWorkingDay: today(), type: 'RESIGNATION', reason: '' })
  const save = () => {
    if (!f.reason.trim()) return toast.error('Please enter the exit reason')
    exitEmployee(emp.id, f)
    toast.success(f.lastWorkingDay <= today() ? 'Exit processed' : 'Notice period started', `Last working day ${fmtDate(f.lastWorkingDay)} · Finance notified for full & final`)
    onClose()
  }
  return (
    <Modal open title={`Exit – ${emp.name}`} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={save}>Confirm exit</Button></>}>
      <div className="space-y-3">
        <Field label="Exit type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={[{ value: 'RESIGNATION', label: 'Resignation' }, { value: 'TERMINATION', label: 'Termination' }, { value: 'RETIREMENT', label: 'Retirement' }, { value: 'END_OF_CONTRACT', label: 'End of contract' }, { value: 'ABSCONDING', label: 'Absconding' }]} /></Field>
        <FormGrid>
          <Field label="Resignation / notice date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Last working day"><Input type="date" value={f.lastWorkingDay} onChange={(e) => setF({ ...f, lastWorkingDay: e.target.value })} /></Field>
        </FormGrid>
        <Field label="Reason" required><Textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <p className="text-xs text-slate-500">Salary for the exit month is prorated to the last working day in payroll. Pending loans should be recovered in full & final.</p>
      </div>
    </Modal>
  )
}

// ====================================================================== add / edit form
function EmployeeForm({ initial, onClose, onSaved }) {
  const canSal = useCanSeeSalary()
  const employees = useStore((s) => s.employees || [])
  const shifts = useStore((s) => s.shifts || [])
  const structures = useStore((s) => s.salaryStructures || [])
  const { addEmployee, updateEmployee } = useStore()
  const isNew = !initial.id
  const [f, setF] = useState(() => ({
    gender: 'M', location: 'Navi Mumbai HQ', employmentType: 'PROBATION', doj: today(), shiftId: 'sh1', structureId: 'ss1', ctc: 300000, bank: {}, ...initial, bank: { ...(initial.bank || {}) },
  }))
  const [err, setErr] = useState({})
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const setBank = (k) => (e) => setF((x) => ({ ...x, bank: { ...x.bank, [k]: e.target.value.toUpperCase ? (k === 'ifsc' ? e.target.value.toUpperCase() : e.target.value) : e.target.value } }))
  const save = () => {
    const er = {}
    if (!f.name?.trim()) er.name = 'Required'
    if (!f.dept) er.dept = 'Required'
    if (!f.designation?.trim()) er.designation = 'Required'
    if (!f.doj) er.doj = 'Required'
    if (f.pan && !PAN_RE.test(f.pan)) er.pan = 'Format: ABCDE1234F'
    if (f.bank?.ifsc && !IFSC_RE.test(f.bank.ifsc)) er.ifsc = 'Format: HDFC0001234'
    if (f.uan && !/^\d{12}$/.test(f.uan)) er.uan = '12 digits'
    setErr(er)
    if (Object.keys(er).length) return toast.error('Please fix the highlighted fields')
    const data = { ...f, bank: { ...f.bank, holder: f.bank.holder || f.name } }
    if (isNew) {
      const e = addEmployee(data)
      toast.success('Employee added', `${e.code} · welcome email sent`)
      onSaved(e.id)
    } else {
      const { id, ...patch } = data
      if (patch.ctc === initial.ctc) delete patch.ctc
      updateEmployee(id, patch)
      toast.success('Employee updated')
      onSaved(id)
    }
  }
  return (
    <Modal open size="lg" title={isNew ? 'Add employee' : `Edit ${initial.name}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>{isNew ? 'Add employee' : 'Save changes'}</Button></>}>
      <div className="space-y-5">
        <div>
          <SectionTitle>Personal</SectionTitle>
          <FormGrid cols={3}>
            <Field label="Full name" required error={err.name}><Input value={f.name || ''} onChange={set('name')} /></Field>
            <Field label="Gender"><Select value={f.gender} onChange={set('gender')} options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }]} /></Field>
            <Field label="Date of birth"><Input type="date" value={f.dob || ''} onChange={set('dob')} /></Field>
            <Field label="Mobile"><Input value={f.phone || ''} onChange={set('phone')} /></Field>
            <Field label="Work email"><Input type="email" value={f.email || ''} onChange={set('email')} placeholder="name@btali.in" /></Field>
            <Field label="Personal email"><Input type="email" value={f.personalEmail || ''} onChange={set('personalEmail')} /></Field>
            <Field label="Blood group"><Select value={f.bloodGroup || ''} placeholder="—" onChange={set('bloodGroup')} options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']} /></Field>
            <Field label="Marital status"><Select value={f.maritalStatus || ''} placeholder="—" onChange={set('maritalStatus')} options={['Single', 'Married']} /></Field>
            <Field label="Emergency contact"><Input value={f.emergencyContact || ''} onChange={set('emergencyContact')} placeholder="Name · phone" /></Field>
          </FormGrid>
          <Field label="Address" className="mt-3"><Input value={f.address || ''} onChange={set('address')} /></Field>
        </div>
        <div>
          <SectionTitle>Job</SectionTitle>
          <FormGrid cols={3}>
            <Field label="Department" required error={err.dept}><Select value={f.dept || ''} placeholder="Select…" onChange={set('dept')} options={DEPARTMENTS} /></Field>
            <Field label="Designation" required error={err.designation}><Input value={f.designation || ''} onChange={set('designation')} /></Field>
            <Field label="Date of joining" required error={err.doj}><Input type="date" value={f.doj || ''} onChange={set('doj')} /></Field>
            <Field label="Employment type"><Select value={f.employmentType} onChange={set('employmentType')} options={[{ value: 'PROBATION', label: 'Probation' }, { value: 'PERMANENT', label: 'Permanent' }, { value: 'CONTRACT', label: 'Contract' }]} /></Field>
            <Field label="Work location"><Select value={f.location} onChange={set('location')} options={LOCATIONS} /></Field>
            <Field label="Reports to"><Select value={f.managerId || ''} placeholder="—" onChange={set('managerId')} options={employees.filter((e) => e.status !== 'EXITED' && e.id !== f.id).map((e) => ({ value: e.id, label: `${e.name} (${e.designation})` }))} /></Field>
            <Field label="Shift"><Select value={f.shiftId || ''} onChange={set('shiftId')} options={shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.start}–${s.end})` }))} /></Field>
            {canSal && <Field label="Salary structure"><Select value={f.structureId || ''} onChange={set('structureId')} options={structures.map((s) => ({ value: s.id, label: s.name }))} /></Field>}
            {canSal && <Field label="Annual CTC (₹)" hint={f.structureId && f.ctc ? `Monthly gross ≈ ${fmtINR(ctcBreakup(structures.find((s) => s.id === f.structureId), f.ctc, f.gender).gross)}` : ''}><NumberInput value={f.ctc} onChange={set('ctc')} /></Field>}
          </FormGrid>
        </div>
        <div>
          <SectionTitle>Statutory & bank</SectionTitle>
          <FormGrid cols={3}>
            <Field label="PAN" error={err.pan}><Input value={f.pan || ''} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} maxLength={10} /></Field>
            <Field label="Aadhaar"><Input value={f.aadhaar || ''} onChange={set('aadhaar')} placeholder="XXXX XXXX XXXX" /></Field>
            <Field label="UAN" error={err.uan}><Input value={f.uan || ''} onChange={set('uan')} maxLength={12} /></Field>
            <Field label="ESIC IP number"><Input value={f.esic || ''} onChange={set('esic')} /></Field>
            <Field label="Bank name"><Input value={f.bank.name || ''} onChange={setBank('name')} /></Field>
            <Field label="Account number"><Input value={f.bank.account || ''} onChange={setBank('account')} /></Field>
            <Field label="IFSC" error={err.ifsc}><Input value={f.bank.ifsc || ''} onChange={setBank('ifsc')} maxLength={11} /></Field>
          </FormGrid>
        </div>
      </div>
    </Modal>
  )
}
