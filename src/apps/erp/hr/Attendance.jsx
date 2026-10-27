import React, { useMemo, useState } from 'react'
import { Fingerprint, Upload, Download, Clock, UserX, Timer, CalendarCheck, Plus, Pencil, Mail, Trash2, CalendarPlus } from 'lucide-react'
import { useStore } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Button, Modal, Tabs, FormGrid, Field, Input, NumberInput, Select, Badge, Checkbox, FileUpload, Alert, Switch, IconButton, toast, confirm, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtDate, fmtDateTime, timeAgo, exportCSV, downloadText, parseCSV, today } from '../../../lib/format'
import {
  currentPeriod, monthDays, dateOf, dow, attendanceSummary, attDoc, calendarCode, shiftOf, toMin, ATT_CODES, DEPARTMENTS, employedIn, periodLabel, leaveName,
} from '../../../store/slices/hr'
import { EmpCell, monthOptions, AttChip } from './_parts'

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Attendance() {
  const state = useStore()
  const { employees = [], syncBiometric, biometricSync, attendanceImports = [] } = state
  const [period, setPeriod] = useState(currentPeriod())
  const [tab, setTab] = useState('register')
  const [dept, setDept] = useState('')
  const [csvOpen, setCsvOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const emps = useMemo(() => employees.filter((e) => employedIn(e, period) && (!dept || e.dept === dept)), [employees, period, dept])
  const sums = useMemo(() => Object.fromEntries(emps.map((e) => [e.id, attendanceSummary(state, e, period)])), [emps, state, period])
  const tot = Object.values(sums).reduce((a, s) => ({ present: a.present + s.present, workdays: a.workdays + (s.marked ? s.present + s.absent + s.leave + s.lopLeave + s.halfDays * 0.5 : 0), absent: a.absent + s.absent, late: a.late + s.late, ot: a.ot + s.ot }), { present: 0, workdays: 0, absent: 0, late: 0, ot: 0 })

  const sync = () => {
    setSyncing(true)
    setTimeout(() => {
      const n = syncBiometric(period)
      setSyncing(false)
      toast.success('Biometric sync complete', n ? `${n} punch records imported from 3 devices` : 'All devices up to date – no new punches')
    }, 900)
  }
  const exportRegister = () => {
    const days = monthDays(period)
    exportCSV(`Attendance-${period}.csv`, emps, [
      { header: 'Code', key: 'code' }, { header: 'Name', key: 'name' }, { header: 'Department', key: 'dept' },
      ...Array.from({ length: days }, (_, i) => ({ header: String(i + 1), value: (e) => cellOf(state, e, period, i + 1).s || '' })),
      { header: 'Present', value: (e) => sums[e.id].present }, { header: 'Leave', value: (e) => sums[e.id].leave }, { header: 'LOP', value: (e) => sums[e.id].lop - sums[e.id].notEmployed },
      { header: 'Late', value: (e) => sums[e.id].late }, { header: 'OT hrs', value: (e) => sums[e.id].ot },
    ])
  }

  return (
    <div>
      <PageHeader title="Attendance & Shifts" subtitle={`Biometric, mobile and manual attendance · last device sync ${biometricSync?.lastSync ? timeAgo(biometricSync.lastSync) : '—'}`}
        actions={<>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} options={monthOptions(6)} />
          <Button variant="secondary" icon={Upload} onClick={() => setCsvOpen(true)}>Upload CSV</Button>
          <Button icon={Fingerprint} loading={syncing} onClick={sync}>Sync biometric</Button>
        </>} />
      <Grid cols={4} className="mb-4">
        <Stat label="Attendance rate" value={tot.workdays ? `${((tot.present / tot.workdays) * 100).toFixed(1)}%` : '—'} sub={`${emps.length} employees · ${periodLabel(period)}`} icon={CalendarCheck} tone="green" />
        <Stat label="Absent days" value={tot.absent} sub="unauthorised, treated as LOP" icon={UserX} tone="red" />
        <Stat label="Late arrivals" value={tot.late} sub="beyond shift grace time" icon={Clock} tone="amber" onClick={() => setTab('late')} />
        <Stat label="Overtime hours" value={tot.ot} sub="paid at 2x in payroll" icon={Timer} tone="blue" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { key: 'register', label: 'Monthly register' }, { key: 'late', label: 'Late entries & early exits' }, { key: 'shifts', label: 'Shifts & holidays' }, { key: 'imports', label: 'Devices & imports' },
      ]} />
      {tab === 'register' && <Register period={period} emps={emps} sums={sums} dept={dept} setDept={setDept} onExport={exportRegister} />}
      {tab === 'late' && <LateReport period={period} emps={emps} />}
      {tab === 'shifts' && <Shifts />}
      {tab === 'imports' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Attendance devices" actions={<Button size="sm" variant="secondary" icon={Fingerprint} loading={syncing} onClick={sync}>Sync now</Button>}>
            <ul className="divide-y divide-slate-100">
              {(biometricSync?.devices || []).map((d) => (
                <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div><div className="text-sm font-medium">{d.name}</div><div className="text-xs text-slate-500">{d.id} · {d.location} · {d.users} enrolled</div></div>
                  <Badge tone="green" dot>Online</Badge>
                </li>
              ))}
            </ul>
            <div className="text-xs text-slate-500 mt-2">Last sync {fmtDateTime(biometricSync?.lastSync)} · devices push punches every evening at 7 PM.</div>
          </Card>
          <Card title="Import history">
            <ul className="divide-y divide-slate-100">
              {attendanceImports.slice(0, 12).map((i) => (
                <li key={i.id} className="py-2 flex items-center justify-between text-sm">
                  <span>{fmtDateTime(i.ts)} · <Badge tone={i.source === 'CSV' ? 'violet' : 'blue'}>{i.source}</Badge></span>
                  <span className="text-slate-500">{i.rows} entries · {i.employees} employees</span>
                </li>
              ))}
              {!attendanceImports.length && <li className="text-sm text-slate-400 py-2">No imports yet.</li>}
            </ul>
          </Card>
        </div>
      )}
      {csvOpen && <CsvImport period={period} onClose={() => setCsvOpen(false)} />}
    </div>
  )
}

const cellOf = (state, e, period, d) => {
  const iso = dateOf(period, d)
  const rec = attDoc(state, e.id, period)?.days?.[d]
  if (rec) return rec
  if (iso < e.doj || (e.exitDate && iso > e.exitDate)) return { s: null, na: true }
  const cal = calendarCode(state, e, iso)
  return { s: cal || null, future: iso >= today() }
}

// ====================================================================== register grid
function Register({ period, emps, sums, dept, setDept, onExport }) {
  const state = useStore()
  const [edit, setEdit] = useState(null)
  const days = monthDays(period)
  const t = today()
  return (
    <Card padded={false}>
      <div className="flex flex-col sm:flex-row gap-2 justify-between p-3 border-b border-slate-100">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={dept} onChange={(e) => setDept(e.target.value)} placeholder="All departments" options={DEPARTMENTS} className="sm:w-52" />
          <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500 items-center">
            {Object.entries(ATT_CODES).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1"><AttChip code={k} />{v.label}</span>)}
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Late</span>
          </div>
        </div>
        <Button variant="secondary" size="sm" icon={Download} onClick={onExport}>Export register</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500">
              <th className="sticky left-0 z-10 bg-white text-left px-3 py-2 min-w-[190px] border-b border-slate-200">Employee</th>
              {Array.from({ length: days }, (_, i) => {
                const iso = dateOf(period, i + 1)
                return <th key={i} className={cx('px-0.5 py-1 font-medium border-b border-slate-200 text-center', iso === t && 'text-brand-600')}><div>{i + 1}</div><div className="text-[10px] text-slate-400">{WD[dow(iso)]}</div></th>
              })}
              {['P', 'L', 'LOP', 'Late', 'OT'].map((h) => <th key={h} className="px-2 py-2 border-b border-slate-200 bg-slate-50 text-right">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {emps.map((e) => {
              const sh = shiftOf(state, e)
              const lateAfter = toMin(sh.start) + sh.graceMin
              const sm = sums[e.id]
              return (
                <tr key={e.id} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-slate-100"><EmpCell emp={e} sub={`${e.code} · ${sh.code}`} /></td>
                  {Array.from({ length: days }, (_, i) => {
                    const c = cellOf(state, e, period, i + 1)
                    const late = (c.s === 'P' || c.s === 'HD') && c.in && toMin(c.in) > lateAfter
                    return (
                      <td key={i} className="px-0.5 py-1 border-b border-slate-100 text-center">
                        <button type="button" disabled={c.na} onClick={() => setEdit({ emp: e, day: i + 1, rec: c })}
                          title={c.na ? 'Not employed' : `${fmtDate(dateOf(period, i + 1))}${c.s ? ` · ${ATT_CODES[c.s]?.label}` : ''}${c.lt ? ` (${leaveName(c.lt)})` : ''}${c.in ? ` · ${c.in}–${c.out || ''}` : ''}${c.ot ? ` · OT ${c.ot}h` : ''}`}
                          className={cx('relative w-7 h-6 rounded text-[10px] font-semibold', c.na ? 'bg-slate-50 text-slate-200' : c.s ? ATT_CODES[c.s].cls : c.future ? 'bg-white border border-dashed border-slate-200 text-slate-300' : 'bg-white border border-slate-200 text-slate-300', !c.na && 'hover:ring-2 hover:ring-brand-300')}>
                          {c.na ? '' : c.s || '–'}
                          {late && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
                          {c.ot > 0 && <span className="absolute -bottom-1 -right-1 text-[8px] bg-sky-600 text-white rounded px-0.5">{c.ot}</span>}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-2 text-right border-b border-slate-100 bg-slate-50/60 tabular-nums">{sm.present}</td>
                  <td className="px-2 text-right border-b border-slate-100 bg-slate-50/60 tabular-nums">{sm.leave}</td>
                  <td className={cx('px-2 text-right border-b border-slate-100 bg-slate-50/60 tabular-nums', sm.lop - sm.notEmployed > 0 && 'text-red-600 font-semibold')}>{sm.lop - sm.notEmployed}</td>
                  <td className={cx('px-2 text-right border-b border-slate-100 bg-slate-50/60 tabular-nums', sm.late >= 3 && 'text-amber-700 font-semibold')}>{sm.late}</td>
                  <td className="px-2 text-right border-b border-slate-100 bg-slate-50/60 tabular-nums">{sm.ot}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {edit && <CellEditor period={period} {...edit} onClose={() => setEdit(null)} />}
    </Card>
  )
}

function CellEditor({ period, emp, day, rec, onClose }) {
  const setAttendance = useStore((s) => s.setAttendance)
  const [f, setF] = useState({ s: rec.s || 'P', in: rec.in || '', out: rec.out || '', ot: rec.ot || 0, note: rec.note || '' })
  const timed = f.s === 'P' || f.s === 'HD'
  const save = () => {
    const r = { s: f.s, note: f.note }
    if (timed) Object.assign(r, { in: f.in, out: f.out, ot: Number(f.ot) || 0 })
    if (f.s === 'L') Object.assign(r, { lt: rec.lt || 'CL' })
    setAttendance(emp.id, period, day, r, 'MANUAL')
    toast.success('Attendance updated', `${emp.name} · ${fmtDate(dateOf(period, day))} → ${ATT_CODES[f.s].label}`)
    onClose()
  }
  return (
    <Modal open size="sm" title={`${emp.name} · ${fmtDate(dateOf(period, day))}`} subtitle={`${WEEKDAYS[dow(dateOf(period, day))]} · source ${rec.src || 'not marked'}`} onClose={onClose}
      footer={<>
        {rec.s && <Button variant="ghost" onClick={() => { setAttendance(emp.id, period, day, null); toast.success('Entry cleared'); onClose() }}>Clear</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button>
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ATT_CODES).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setF({ ...f, s: k })} className={cx('px-2.5 py-1.5 rounded-lg text-xs font-semibold border', f.s === k ? 'border-brand-500 ring-2 ring-brand-200 ' + v.cls : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>{v.label}</button>
          ))}
        </div>
        {f.s === 'L' && rec.lt && <div className="text-xs text-slate-500">Leave type: {leaveName(rec.lt)} (approve/cancel leaves under Leave Management)</div>}
        {timed && (
          <FormGrid cols={3}>
            <Field label="In time"><Input type="time" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} /></Field>
            <Field label="Out time"><Input type="time" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} /></Field>
            <Field label="OT hours"><NumberInput min={0} max={12} value={f.ot} onChange={(v) => setF({ ...f, ot: v })} /></Field>
          </FormGrid>
        )}
        <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. forgot to punch – verified with manager" /></Field>
      </div>
    </Modal>
  )
}

// ====================================================================== CSV upload
function CsvImport({ period, onClose }) {
  const state = useStore()
  const bulkSetAttendance = state.bulkSetAttendance
  const [rows, setRows] = useState(null)
  const [fileName, setFileName] = useState('')
  const template = () => {
    const emps = state.employees.filter((e) => e.status !== 'EXITED').slice(0, 3)
    const d = dateOf(period, 1)
    downloadText(`Attendance-template-${period}.csv`, `EmployeeCode,Date,Status,InTime,OutTime,OTHours\n${emps.map((e, i) => `${e.code},${d},${['P', 'A', 'HD'][i]},${i === 1 ? '' : '09:28'},${i === 1 ? '' : i === 2 ? '13:30' : '18:42'},0`).join('\n')}\n`, 'text/csv')
  }
  const onFiles = async ([att]) => {
    try {
      const text = await (await fetch(att.url)).text()
      const parsed = parseCSV(text).map((r, i) => {
        const emp = state.employees.find((e) => e.code.toUpperCase() === String(r.EmployeeCode || '').trim().toUpperCase())
        const date = String(r.Date || '').trim()
        const s = String(r.Status || '').trim().toUpperCase()
        let error = ''
        if (!emp) error = 'Unknown employee code'
        else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error = 'Date must be YYYY-MM-DD'
        else if (date.slice(0, 7) !== period) error = `Date outside ${periodLabel(period)}`
        else if (!ATT_CODES[s]) error = 'Status must be P / A / L / HD / H / WO'
        return { i: i + 2, emp, date, s, in: r.InTime || '', out: r.OutTime || '', ot: Number(r.OTHours) || 0, error }
      })
      setRows(parsed)
      setFileName(att.name)
    } catch {
      toast.error('Could not read the file', 'Please upload the CSV template format')
    }
  }
  const valid = (rows || []).filter((r) => !r.error)
  const doImport = () => {
    bulkSetAttendance(period, valid.map((r) => ({ empId: r.emp.id, day: Number(r.date.slice(8, 10)), rec: { s: r.s, ...(r.in ? { in: r.in } : {}), ...(r.out ? { out: r.out } : {}), ot: r.ot } })), 'CSV')
    toast.success('Attendance imported', `${valid.length} entries from ${fileName}`)
    onClose()
  }
  return (
    <Modal open size="lg" title={`Upload attendance – ${periodLabel(period)}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid.length} onClick={doImport}>Import {valid.length || ''} entries</Button></>}>
      <div className="space-y-4">
        <Alert tone="info" action={<Button size="sm" variant="secondary" icon={Download} onClick={template}>Template</Button>}>
          Columns: EmployeeCode, Date (YYYY-MM-DD), Status (P/A/L/HD/H/WO), InTime, OutTime, OTHours. Existing entries for the same day are overwritten.
        </Alert>
        <FileUpload multiple={false} accept=".csv,text/csv" label="Drop the attendance CSV here or click to choose" onFiles={onFiles} />
        {rows && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 text-sm flex justify-between"><span>{fileName}</span><span><b className="text-emerald-700">{valid.length}</b> valid · <b className="text-red-600">{rows.length - valid.length}</b> with errors</span></div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 bg-white sticky top-0"><tr><th className="text-left px-3 py-1.5">Row</th><th className="text-left px-3">Employee</th><th className="text-left px-3">Date</th><th className="px-3">Status</th><th className="px-3">In</th><th className="px-3">Out</th><th className="px-3">OT</th><th className="text-left px-3">Check</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.i} className={r.error ? 'bg-red-50/50' : ''}>
                      <td className="px-3 py-1.5">{r.i}</td><td className="px-3">{r.emp?.name || '—'}</td><td className="px-3">{r.date}</td>
                      <td className="px-3 text-center">{ATT_CODES[r.s] ? <AttChip code={r.s} /> : r.s}</td><td className="px-3 text-center">{r.in}</td><td className="px-3 text-center">{r.out}</td><td className="px-3 text-center">{r.ot}</td>
                      <td className="px-3">{r.error ? <span className="text-red-600">{r.error}</span> : <span className="text-emerald-700">OK</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ====================================================================== late / early report
function LateReport({ period, emps }) {
  const state = useStore()
  const sendEmail = state.sendEmail
  const rows = useMemo(() => {
    const out = []
    for (const e of emps) {
      const sh = shiftOf(state, e)
      const doc = attDoc(state, e.id, period)
      for (const [d, r] of Object.entries(doc?.days || {})) {
        if (r.s !== 'P' && r.s !== 'HD') continue
        const lateBy = r.in ? toMin(r.in) - toMin(sh.start) : 0
        const earlyBy = r.out && r.s === 'P' ? toMin(sh.end) - toMin(r.out) : 0
        const late = lateBy > sh.graceMin
        const early = earlyBy > 0
        if (late || early) out.push({ id: `${e.id}-${d}`, emp: e, date: dateOf(period, Number(d)), shift: `${sh.code} ${sh.start}–${sh.end}`, in: r.in, out: r.out, lateBy: late ? lateBy : 0, earlyBy: early ? earlyBy : 0 })
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }, [emps, state, period])
  const perEmp = Object.values(rows.reduce((m, r) => { const k = r.emp.id; m[k] ||= { emp: r.emp, late: 0, early: 0, mins: 0 }; if (r.lateBy) { m[k].late++; m[k].mins += r.lateBy } if (r.earlyBy) m[k].early++; return m }, {})).sort((a, b) => b.late - a.late)
  const warn = async (p) => {
    if (!(await confirm({ title: `Send late-coming reminder to ${p.emp.name}?`, message: `${p.late} late arrivals in ${periodLabel(period)}. As per policy, every 3 late marks beyond grace attract a half-day deduction.` }))) return
    sendEmail({ to: p.emp.email, subject: `Attendance reminder – ${periodLabel(period)}`, body: `Dear ${p.emp.name},\n\nOur records show ${p.late} late arrival(s) and ${p.early} early exit(s) in ${periodLabel(period)}. Please adhere to your shift timings. Repeated late marks attract a half-day deduction as per company policy.\n\nHR – Btali International`, ref: p.emp.code, kind: 'HR' })
    toast.success('Reminder emailed', p.emp.email)
  }
  return (
    <div className="grid xl:grid-cols-3 gap-4">
      <Card title="By employee" subtitle="3+ late marks highlighted" className="xl:col-span-1">
        <ul className="divide-y divide-slate-100">
          {perEmp.map((p) => (
            <li key={p.emp.id} className="py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0"><EmpCell emp={p.emp} sub={`${p.late} late (${p.mins} min) · ${p.early} early`} /></div>
              {p.late >= 3 && <Badge tone="amber">{p.late} late</Badge>}
              <IconButton icon={Mail} title="Email reminder" onClick={() => warn(p)} />
            </li>
          ))}
          {!perEmp.length && <li className="text-sm text-slate-400 py-3">No late entries or early exits this month.</li>}
        </ul>
      </Card>
      <div className="xl:col-span-2">
        <DataTable rows={rows} exportName={`Late-early-${period}`} pageSize={14} columns={[
          { key: 'emp', header: 'Employee', render: (r) => <EmpCell emp={r.emp} />, value: (r) => r.emp.name },
          { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'shift', header: 'Shift' },
          { key: 'in', header: 'In' }, { key: 'out', header: 'Out' },
          { key: 'lateBy', header: 'Late by', align: 'right', render: (r) => (r.lateBy ? <span className="text-amber-700 font-medium">{r.lateBy} min</span> : '—') },
          { key: 'earlyBy', header: 'Early exit', align: 'right', render: (r) => (r.earlyBy ? <span className="text-red-600 font-medium">{r.earlyBy} min</span> : '—') },
        ]} filters={[{ key: 'kind', label: 'types', options: [{ value: 'late', label: 'Late entries' }, { value: 'early', label: 'Early exits' }], value: (r) => (r.lateBy ? 'late' : 'early') }]} />
      </div>
    </div>
  )
}

// ====================================================================== shifts
function Shifts() {
  const { shifts = [], employees = [], hrHolidays = [], assignShift, addItem, removeItem } = useStore()
  const [edit, setEdit] = useState(null)
  const [hol, setHol] = useState(null)
  const active = employees.filter((e) => e.status !== 'EXITED')
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {shifts.map((s) => (
          <Card key={s.id} className="border-t-4" title={s.name} subtitle={`${s.code} · ${s.location || ''}`} actions={<IconButton icon={Pencil} title="Edit shift" onClick={() => setEdit(s)} />}>
            <div className="text-2xl font-bold text-ink-900 tabular-nums">{s.start} – {s.end}</div>
            <div className="text-xs text-slate-500 mt-1">Grace {s.graceMin} min · break {s.breakMin} min · off: {(s.weeklyOff || []).map((d) => WEEKDAYS[d]).join(', ') || 'none'}</div>
            <div className="flex items-center justify-between mt-3">
              <Badge tone={s.otAllowed ? 'blue' : 'gray'}>{s.otAllowed ? 'OT allowed' : 'No OT'}</Badge>
              <span className="text-xs text-slate-600">{active.filter((e) => e.shiftId === s.id).length} employees</span>
            </div>
          </Card>
        ))}
        <button type="button" onClick={() => setEdit({ name: '', code: '', start: '09:30', end: '18:30', graceMin: 15, breakMin: 60, weeklyOff: [0], otAllowed: false })}
          className="border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:border-brand-300 hover:text-brand-600 min-h-[150px]">
          <Plus className="w-6 h-6" /><span className="text-sm mt-1">New shift</span>
        </button>
      </div>
      <div className="grid xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <DataTable rows={active} pageSize={10} searchPlaceholder="Search employee…" columns={[
            { key: 'name', header: 'Employee', render: (e) => <EmpCell emp={e} />, value: (e) => e.name },
            { key: 'dept', header: 'Department' }, { key: 'location', header: 'Location' },
            { key: 'shiftId', header: 'Assigned shift', sortable: false, render: (e) => (
              <div onClick={(ev) => ev.stopPropagation()} className="min-w-[170px]"><Select value={e.shiftId} onChange={(ev) => { assignShift([e.id], ev.target.value); toast.success('Shift assigned', `${e.name} → ${shifts.find((s) => s.id === ev.target.value)?.name}`) }} options={shifts.map((s) => ({ value: s.id, label: s.name }))} /></div>
            ) },
          ]} filters={[{ key: 'shiftId', label: 'shifts', options: shifts.map((s) => ({ value: s.id, label: s.name })) }]}
            bulkActions={(sel, clear) => (
              <Select value="" placeholder="Assign shift to selected…" className="w-56" options={shifts.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(ev) => { if (!ev.target.value) return; assignShift(sel.map((x) => x.id), ev.target.value); toast.success(`Shift assigned to ${sel.length} employees`); clear() }} />
            )} />
        </div>
        <Card title="Holiday calendar" subtitle={`${new Date().getFullYear()} · Maharashtra`} actions={<Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setHol({ date: '', name: '' })}>Add</Button>}>
          <ul className="divide-y divide-slate-100">
            {[...hrHolidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
              <li key={h.id} className={cx('py-2 flex items-center gap-3 text-sm', h.date < today() && 'text-slate-400')}>
                <span className="w-24 tabular-nums">{fmtDate(h.date)}</span><span className="flex-1">{h.name}</span><span className="text-xs">{WEEKDAYS[dow(h.date)]}</span>
                <IconButton icon={Trash2} tone="danger" title="Remove" onClick={async () => { if (await confirm({ title: `Remove ${h.name}?`, tone: 'danger', confirmText: 'Remove' })) { removeItem('hrHolidays', h.id); toast.success('Holiday removed') } }} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {edit && <ShiftModal shift={edit} onClose={() => setEdit(null)} />}
      {hol && (
        <Modal open size="sm" title="Add holiday" onClose={() => setHol(null)} footer={<><Button variant="secondary" onClick={() => setHol(null)}>Cancel</Button>
          <Button disabled={!hol.date || !hol.name} onClick={() => { addItem('hrHolidays', { ...hol, type: 'PUBLIC' }); toast.success('Holiday added', `${hol.name} · ${fmtDate(hol.date)}`); setHol(null) }}>Add holiday</Button></>}>
          <div className="space-y-3">
            <Field label="Date" required><Input type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} /></Field>
            <Field label="Occasion" required><Input value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ShiftModal({ shift, onClose }) {
  const saveShift = useStore((s) => s.saveShift)
  const [f, setF] = useState({ ...shift, weeklyOff: [...(shift.weeklyOff || [])] })
  const save = () => {
    if (!f.name.trim() || !f.code.trim()) return toast.error('Name and code are required')
    if (toMin(f.end) <= toMin(f.start)) return toast.error('End time must be after start time')
    saveShift(f)
    toast.success(shift.id ? 'Shift updated' : 'Shift created', `${f.name} ${f.start}–${f.end}`)
    onClose()
  }
  return (
    <Modal open size="sm" title={shift.id ? `Edit ${shift.name}` : 'New shift'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save shift</Button></>}>
      <div className="space-y-3">
        <FormGrid>
          <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Code" required><Input value={f.code} maxLength={5} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Start"><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="End"><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          <Field label="Grace (min)"><NumberInput value={f.graceMin} onChange={(v) => setF({ ...f, graceMin: v })} /></Field>
          <Field label="Break (min)"><NumberInput value={f.breakMin} onChange={(v) => setF({ ...f, breakMin: v })} /></Field>
        </FormGrid>
        <Field label="Weekly off">
          <div className="flex flex-wrap gap-3 mt-1">{WEEKDAYS.map((d, i) => <Checkbox key={d} label={d} checked={f.weeklyOff.includes(i)} onChange={(v) => setF({ ...f, weeklyOff: v ? [...f.weeklyOff, i] : f.weeklyOff.filter((x) => x !== i) })} />)}</div>
        </Field>
        <Switch checked={f.otAllowed} onChange={(v) => setF({ ...f, otAllowed: v })} label="Overtime allowed (paid at 2x in payroll)" />
      </div>
    </Modal>
  )
}
