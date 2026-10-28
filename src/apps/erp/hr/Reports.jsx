import React, { useMemo, useState } from 'react'
import { Users, UserPlus, UserMinus, TrendingDown, Download, FileText } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, Tabs, Select, Badge, Alert, toast } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { BarsChart, TrendChart, DonutChart } from '../../../components/business'
import { fmtINR, fmtDate, downloadText, today } from '../../../lib/format'
import { currentPeriod, addMonths, periodLabel, periodShort, monthDays, dateOf, attendanceSummary, employedIn, LEAVE_TYPES, DEPARTMENTS } from '../../../store/slices/hr'
import { EmpCell, monthOptions, useCanSeeSalary } from './_parts'

const ded = (s, code) => s.deductions.filter((d) => d.code === code).reduce((a, d) => a + d.amount, 0)

export default function Reports() {
  const canSal = useCanSeeSalary()
  const [tab, setTab] = useState('headcount')
  return (
    <div>
      <PageHeader title="HR Reports" subtitle="Headcount, attendance, leave, payroll cost and statutory registers – all exportable" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { key: 'headcount', label: 'Headcount & attrition' }, { key: 'attendance', label: 'Attendance & absence' }, { key: 'leave', label: 'Leave summary' },
        ...(canSal ? [{ key: 'cost', label: 'Payroll cost' }, { key: 'statutory', label: 'Statutory registers' }] : []),
      ]} />
      {tab === 'headcount' && <Headcount />}
      {tab === 'attendance' && <AttendanceReport />}
      {tab === 'leave' && <LeaveReport />}
      {tab === 'cost' && canSal && <CostReport />}
      {tab === 'statutory' && canSal && <Statutory />}
    </div>
  )
}

function Headcount() {
  const employees = useStore((s) => s.employees || [])
  const cur = currentPeriod()
  const fyStart = cur.slice(5) >= '04' ? `${cur.slice(0, 4)}-04-01` : `${Number(cur.slice(0, 4)) - 1}-04-01`
  const months = Array.from({ length: 12 }, (_, i) => addMonths(cur, i - 11))
  const trend = months.map((p) => {
    const end = dateOf(p, monthDays(p))
    const start = dateOf(p, 1)
    return { label: periodShort(p), headcount: employees.filter((e) => e.doj <= end && (!e.exitDate || e.exitDate > end)).length, joiners: employees.filter((e) => e.doj >= start && e.doj <= end).length, exits: employees.filter((e) => e.exitDate && e.exitDate >= start && e.exitDate <= end && e.exitDate <= today()).length }
  })
  const active = employees.filter((e) => e.status !== 'EXITED')
  const joiners = employees.filter((e) => e.doj >= fyStart)
  const exits = employees.filter((e) => e.exitDate && e.exitDate >= fyStart && e.exitDate <= today())
  const avg = trend.slice(-7).reduce((a, t) => a + t.headcount, 0) / 7 || 1
  const monthsInFy = Math.max(1, Number(cur.slice(5)) - 3 + (cur.slice(5) < '04' ? 12 : 0))
  const attrition = (exits.length / avg) * (12 / monthsInFy) * 100
  const byDept = DEPARTMENTS.map((d) => ({ label: d, value: active.filter((e) => e.dept === d).length })).filter((x) => x.value)
  const byLoc = Object.entries(active.reduce((m, e) => ({ ...m, [e.location]: (m[e.location] || 0) + 1 }), {})).map(([name, value]) => ({ name, value }))
  const tenure = (e) => ((new Date(e.exitDate && e.exitDate < today() ? e.exitDate : today()) - new Date(e.doj)) / (365.25 * 86400000))
  const movements = [...joiners.map((e) => ({ id: `j${e.id}`, emp: e, kind: 'Joined', date: e.doj, note: e.designation })), ...employees.filter((e) => e.exitDate).map((e) => ({ id: `x${e.id}`, emp: e, kind: e.status === 'NOTICE' ? 'Notice period' : 'Exited', date: e.exitDate, note: e.exitReason }))]
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat label="Active headcount" value={active.length} sub={`${active.filter((e) => e.gender === 'F').length} women · ${active.filter((e) => e.gender !== 'F').length} men`} icon={Users} />
        <Stat label="Joiners this FY" value={joiners.length} icon={UserPlus} tone="green" />
        <Stat label="Exits this FY" value={exits.length} sub={`${employees.filter((e) => e.status === 'NOTICE').length} on notice`} icon={UserMinus} tone="red" />
        <Stat label="Annualised attrition" value={`${attrition.toFixed(1)}%`} sub={`avg tenure ${(active.reduce((a, e) => a + tenure(e), 0) / (active.length || 1)).toFixed(1)} yrs`} icon={TrendingDown} tone="amber" />
      </Grid>
      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Headcount – last 12 months"><TrendChart data={trend} money={false} series={[{ key: 'headcount', label: 'Headcount' }]} height={240} /></Card>
        <Card title="By location"><DonutChart data={byLoc} money={false} height={200} /></Card>
        <Card className="xl:col-span-2" title="By department"><BarsChart data={byDept} layout="vertical" money={false} series={[{ key: 'value', label: 'Employees' }]} height={280} /></Card>
        <Card title="Joiners vs exits"><BarsChart data={trend.slice(-6)} money={false} series={[{ key: 'joiners', label: 'Joiners', color: '#0d9488' }, { key: 'exits', label: 'Exits', color: '#f2541f' }]} height={280} /></Card>
      </div>
      <DataTable rows={movements} exportName="joiners-and-exits" searchable={false} initialSort={{ key: 'date', dir: 'desc' }} columns={[
        { key: 'emp', header: 'Employee', render: (r) => <EmpCell emp={r.emp} />, value: (r) => r.emp.name },
        { key: 'dept', header: 'Department', value: (r) => r.emp.dept },
        { key: 'kind', header: 'Movement', render: (r) => <Badge tone={r.kind === 'Joined' ? 'green' : r.kind === 'Exited' ? 'red' : 'amber'}>{r.kind}</Badge> },
        { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
        { key: 'note', header: 'Details' },
      ]} />
    </div>
  )
}

function AttendanceReport() {
  const state = useStore()
  const [period, setPeriod] = useState(addMonths(currentPeriod(), -1))
  const rows = useMemo(() => (state.employees || []).filter((e) => employedIn(e, period)).map((e) => {
    const s = attendanceSummary(state, e, period)
    const work = s.present + s.absent + s.leave + s.lopLeave + s.halfDays * 0.5
    return { id: e.id, emp: e, dept: e.dept, ...s, absentLop: s.lop - s.notEmployed, rate: work ? (s.present / work) * 100 : 0 }
  }), [state, period])
  const byDept = DEPARTMENTS.map((d) => { const r = rows.filter((x) => x.dept === d); return { label: d, absent: r.reduce((a, x) => a + x.absentLop, 0), leave: r.reduce((a, x) => a + x.leave, 0) } }).filter((x) => x.absent + x.leave > 0)
  return (
    <div className="space-y-4">
      <Card title={`Absence by department – ${periodLabel(period)}`} actions={<Select value={period} onChange={(e) => setPeriod(e.target.value)} options={monthOptions(6)} />}>
        <BarsChart data={byDept} money={false} stacked series={[{ key: 'leave', label: 'Paid leave' }, { key: 'absent', label: 'Absent / LOP' }]} height={240} />
      </Card>
      <DataTable rows={rows} exportName={`Attendance-summary-${period}`} pageSize={15} initialSort={{ key: 'absentLop', dir: 'desc' }} columns={[
        { key: 'emp', header: 'Employee', render: (r) => <EmpCell emp={r.emp} />, value: (r) => r.emp.name },
        { key: 'dept', header: 'Department' },
        { key: 'present', header: 'Present', align: 'right' },
        { key: 'leave', header: 'Leave', align: 'right' },
        { key: 'absent', header: 'Absent', align: 'right', render: (r) => (r.absent ? <span className="text-red-600 font-medium">{r.absent}</span> : 0) },
        { key: 'halfDays', header: 'Half days', align: 'right' },
        { key: 'absentLop', header: 'LOP days', align: 'right' },
        { key: 'late', header: 'Late', align: 'right' },
        { key: 'early', header: 'Early exits', align: 'right' },
        { key: 'ot', header: 'OT hrs', align: 'right' },
        { key: 'rate', header: 'Attendance %', align: 'right', render: (r) => <span className={r.rate < 90 ? 'text-amber-700 font-medium' : ''}>{r.rate.toFixed(1)}%</span> },
      ]} filters={[{ key: 'dept', label: 'departments', options: DEPARTMENTS }]} />
    </div>
  )
}

function LeaveReport() {
  const leaves = useStore((s) => s.leaves || [])
  const employees = useStore((s) => s.employees || [])
  const balances = useStore((s) => s.leaveBalances || [])
  const year = currentPeriod().slice(0, 4)
  const approved = leaves.filter((l) => l.status === 'APPROVED' && l.from.startsWith(year))
  const rows = employees.filter((e) => e.status !== 'EXITED').map((e) => {
    const b = balances.find((x) => x.empId === e.id) || {}
    const r = { id: e.id, emp: e, dept: e.dept }
    for (const lt of LEAVE_TYPES) { r[`used_${lt.code}`] = lt.code === 'LOP' ? approved.filter((l) => l.empId === e.id && l.type === 'LOP').reduce((a, l) => a + l.days, 0) : b[lt.code]?.used || 0; r[`bal_${lt.code}`] = b[lt.code] ? b[lt.code].entitled - b[lt.code].used : 0 }
    r.total = LEAVE_TYPES.reduce((a, lt) => a + r[`used_${lt.code}`], 0)
    return r
  })
  const byType = LEAVE_TYPES.map((lt) => ({ name: lt.name, value: rows.reduce((a, r) => a + r[`used_${lt.code}`], 0) })).filter((x) => x.value)
  const monthly = Array.from({ length: 6 }, (_, i) => addMonths(currentPeriod(), i - 5)).map((p) => ({ label: periodShort(p), ...Object.fromEntries(LEAVE_TYPES.map((lt) => [lt.code, leaves.filter((l) => l.status === 'APPROVED' && l.type === lt.code && l.from.startsWith(p)).reduce((a, l) => a + l.days, 0)])) }))
  return (
    <div className="space-y-4">
      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Leave days taken by month"><BarsChart data={monthly} money={false} stacked series={LEAVE_TYPES.map((lt) => ({ key: lt.code, label: lt.name }))} height={240} /></Card>
        <Card title={`Leave used in ${year} by type`}><DonutChart data={byType} money={false} height={200} /></Card>
      </div>
      <DataTable rows={rows} exportName={`Leave-summary-${year}`} pageSize={15} initialSort={{ key: 'total', dir: 'desc' }} columns={[
        { key: 'emp', header: 'Employee', render: (r) => <EmpCell emp={r.emp} />, value: (r) => r.emp.name },
        { key: 'dept', header: 'Department' },
        ...LEAVE_TYPES.map((lt) => ({ key: `used_${lt.code}`, header: `${lt.code} used`, align: 'right' })),
        { key: 'total', header: 'Total used', align: 'right', render: (r) => <b>{r.total}</b> },
        { key: 'bal_EL', header: 'EL balance', align: 'right' },
      ]} filters={[{ key: 'dept', label: 'departments', options: DEPARTMENTS }]} />
    </div>
  )
}

function CostReport() {
  const runs = useStore((s) => (s.payrollRuns || []).filter((r) => r.status !== 'DRAFT'))
  const sorted = [...runs].sort((a, b) => a.period.localeCompare(b.period))
  const trend = sorted.map((r) => ({ label: periodShort(r.period), gross: Math.round(r.totalGross), employer: Math.round(r.erPf + r.erEsic), reimb: Math.round(r.totalReimb || 0) }))
  const depts = [...new Set(sorted.flatMap((r) => r.slips.map((s) => s.dept)))]
  const matrix = depts.map((d) => {
    const row = { id: d, dept: d }
    for (const r of sorted) row[r.period] = r.slips.filter((s) => s.dept === d && !s.hold).reduce((a, s) => a + s.gross + s.employer.pf + s.employer.esic, 0)
    row.total = sorted.reduce((a, r) => a + row[r.period], 0)
    return row
  })
  const totalCost = matrix.reduce((a, r) => a + r.total, 0)
  return (
    <div className="space-y-4">
      <Grid cols={3}>
        <Stat label={`Total cost (${sorted.length} months)`} value={fmtINR(totalCost)} icon={FileText} />
        <Stat label="Average monthly cost" value={fmtINR(totalCost / (sorted.length || 1))} icon={FileText} tone="ink" />
        <Stat label="Largest department" value={[...matrix].sort((a, b) => b.total - a.total)[0]?.dept || '—'} sub={fmtINR([...matrix].sort((a, b) => b.total - a.total)[0]?.total)} icon={Users} tone="green" />
      </Grid>
      <Card title="Payroll cost by month"><BarsChart data={trend} stacked series={[{ key: 'gross', label: 'Gross salary' }, { key: 'employer', label: 'Employer PF / ESIC' }, { key: 'reimb', label: 'Reimbursements' }]} height={260} /></Card>
      <DataTable rows={matrix} exportName="payroll-cost-by-department" searchable={false} initialSort={{ key: 'total', dir: 'desc' }} columns={[
        { key: 'dept', header: 'Department' },
        ...sorted.map((r) => ({ key: r.period, header: periodShort(r.period), align: 'right', render: (row) => fmtINR(row[r.period]) })),
        { key: 'total', header: 'Total', align: 'right', render: (row) => <b>{fmtINR(row.total)}</b> },
        { key: 'share', header: 'Share', align: 'right', value: (row) => (totalCost ? Math.round((row.total / totalCost) * 1000) / 10 : 0), render: (row) => `${totalCost ? ((row.total / totalCost) * 100).toFixed(1) : 0}%` },
      ]} />
    </div>
  )
}

function Statutory() {
  const runs = useStore((s) => (s.payrollRuns || []).filter((r) => r.status !== 'DRAFT').sort((a, b) => b.period.localeCompare(a.period)))
  const company = useStore((s) => s.settings.company)
  const [runId, setRunId] = useState(runs[0]?.id)
  const [reg, setReg] = useState('PF')
  const run = runs.find((r) => r.id === runId)
  if (!run) return <Alert tone="info">Statutory registers are generated once a payroll run is submitted.</Alert>
  const slips = run.slips.filter((s) => !s.hold)
  const pfRows = slips.filter((s) => s.pfWage > 0).map((s) => ({ id: s.empId, s, uan: s.uan, name: s.name, gross: s.gross, epf: s.pfWage, eps: s.pfWage, edli: s.pfWage, ee: ded(s, 'PF'), erEps: s.employer.eps, erEpf: s.employer.epf, ncp: s.lopDays }))
  const esicRows = slips.filter((s) => s.esicWage > 0).map((s) => ({ id: s.empId, s, ip: s.esicNo, name: s.name, days: s.paidDays, wages: s.esicWage, ee: ded(s, 'ESIC'), er: s.employer.esic }))
  const slabOf = (s) => { const pt = ded(s, 'PT'); if (!pt) return s.gender === 'F' ? 'Women ≤ ₹25,000 – nil' : 'Up to ₹7,500 – nil'; return pt === 175 ? '₹7,501 – ₹10,000 @ ₹175' : `Above ₹${s.gender === 'F' ? '25,000' : '10,000'} @ ₹${pt}` }
  const ptRows = Object.values(slips.reduce((m, s) => { const k = slabOf(s); m[k] ||= { id: k, slab: k, count: 0, wages: 0, tax: 0 }; m[k].count++; m[k].wages += s.gross; m[k].tax += ded(s, 'PT'); return m }, {}))
  const tdsRows = slips.filter((s) => ded(s, 'TDS') > 0).map((s) => ({ id: s.empId, s, pan: s.pan, name: s.name, gross: s.gross, tds: ded(s, 'TDS') }))
  const sumBy = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0)
  const ecr = () => {
    const lines = pfRows.map((r) => [r.uan, r.name.toUpperCase(), Math.round(r.gross), Math.round(r.epf), Math.round(r.eps), Math.round(r.edli), r.ee, r.erEps, r.erEpf, Math.round(r.ncp), 0].join('#~#'))
    downloadText(`ECR-${run.period}.txt`, lines.join('\n'))
    toast.success('ECR file generated', `${lines.length} members · upload on the EPFO unified portal`)
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {[['PF', 'PF – ECR'], ['ESIC', 'ESIC'], ['PT', 'Professional Tax'], ['TDS', 'TDS (24Q)']].map(([k, l]) => <Button key={k} size="sm" variant={reg === k ? 'dark' : 'secondary'} onClick={() => setReg(k)}>{l}</Button>)}
        </div>
        <Select value={runId} onChange={(e) => setRunId(e.target.value)} options={runs.map((r) => ({ value: r.id, label: `${r.periodLabel}${r.status !== 'PAID' ? ' (unpaid)' : ''}` }))} />
      </div>
      <div className="text-xs text-slate-500">{company.legalName} · PF establishment MH/BAN/0071245 · ESIC code 31000456780001019 · PT RC 27AAFCB7731R1P · TAN MUMB12345C</div>
      {reg === 'PF' && (
        <>
          <Grid cols={4}>
            <Stat label="Members" value={pfRows.length} /><Stat label="EPF wages" value={fmtINR(sumBy(pfRows, 'epf'))} />
            <Stat label="Employee share (12%)" value={fmtINR(sumBy(pfRows, 'ee'))} tone="ink" /><Stat label="Employer EPS + EPF" value={fmtINR(sumBy(pfRows, 'erEps') + sumBy(pfRows, 'erEpf'))} tone="green" />
          </Grid>
          <DataTable rows={pfRows} exportName={`PF-register-${run.period}`} pageSize={25} toolbar={<Button size="sm" icon={Download} onClick={ecr}>ECR text file</Button>} columns={[
            { key: 'uan', header: 'UAN' }, { key: 'name', header: 'Member name' },
            { key: 'gross', header: 'Gross wages', align: 'right', render: (r) => fmtINR(r.gross) }, { key: 'epf', header: 'EPF wages', align: 'right', render: (r) => fmtINR(r.epf) },
            { key: 'eps', header: 'EPS wages', align: 'right', render: (r) => fmtINR(r.eps) }, { key: 'ee', header: 'EE 12%', align: 'right', render: (r) => fmtINR(r.ee) },
            { key: 'erEps', header: 'ER EPS 8.33%', align: 'right', render: (r) => fmtINR(r.erEps) }, { key: 'erEpf', header: 'ER EPF 3.67%', align: 'right', render: (r) => fmtINR(r.erEpf) },
            { key: 'ncp', header: 'NCP days', align: 'right' },
          ]} />
        </>
      )}
      {reg === 'ESIC' && (
        <>
          <Grid cols={4}>
            <Stat label="Insured persons" value={esicRows.length} /><Stat label="ESIC wages" value={fmtINR(sumBy(esicRows, 'wages'))} />
            <Stat label="Employee 0.75%" value={fmtINR(sumBy(esicRows, 'ee'))} tone="ink" /><Stat label="Employer 3.25%" value={fmtINR(sumBy(esicRows, 'er'))} tone="green" />
          </Grid>
          <DataTable rows={esicRows} exportName={`ESIC-register-${run.period}`} columns={[
            { key: 'ip', header: 'IP number' }, { key: 'name', header: 'Name' }, { key: 'days', header: 'Days paid', align: 'right' },
            { key: 'wages', header: 'Wages', align: 'right', render: (r) => fmtINR(r.wages) }, { key: 'ee', header: 'EE 0.75%', align: 'right', render: (r) => fmtINR(r.ee) },
            { key: 'er', header: 'ER 3.25%', align: 'right', render: (r) => fmtINR(r.er) },
          ]} />
        </>
      )}
      {reg === 'PT' && (
        <>
          <Card title={`Form III summary – ${run.periodLabel}`} subtitle="Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975">
            <div className="text-2xl font-bold text-ink-900">{fmtINR(sumBy(ptRows, 'tax'))}</div><div className="text-xs text-slate-500">payable for {slips.length} employees</div>
          </Card>
          <DataTable rows={ptRows} exportName={`PT-register-${run.period}`} searchable={false} columns={[
            { key: 'slab', header: 'Monthly salary slab' }, { key: 'count', header: 'Employees', align: 'right' },
            { key: 'wages', header: 'Salary', align: 'right', render: (r) => fmtINR(r.wages) }, { key: 'tax', header: 'Tax deducted', align: 'right', render: (r) => fmtINR(r.tax) },
          ]} />
        </>
      )}
      {reg === 'TDS' && (
        <DataTable rows={tdsRows} exportName={`TDS-salary-${run.period}`} searchable={false} columns={[
          { key: 'pan', header: 'PAN' }, { key: 'name', header: 'Employee' },
          { key: 'gross', header: 'Salary paid', align: 'right', render: (r) => fmtINR(r.gross) }, { key: 'tds', header: 'TDS (sec 192)', align: 'right', render: (r) => fmtINR(r.tds) },
        ]} footer={<tr><td className="px-3 py-2" colSpan={2}>Total – deposit via challan ITNS 281 by the 7th</td><td className="px-3 py-2 text-right">{fmtINR(sumBy(tdsRows, 'gross'))}</td><td className="px-3 py-2 text-right">{fmtINR(sumBy(tdsRows, 'tds'))}</td></tr>} />
      )}
    </div>
  )
}
