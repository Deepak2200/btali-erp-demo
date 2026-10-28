import React, { useMemo, useState } from 'react'
import { Receipt, Mail, Wallet, Landmark, PiggyBank, HandCoins } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Card, Button, EmptyState, Badge, Progress, toast, cx } from '../../../components/ui'
import { TrendChart } from '../../../components/business'
import { fmtINR, fmtDate } from '../../../lib/format'
import { currentPeriod, periodShort, periodLabel } from '../../../store/slices/hr'
import { Payslip, useMyEmployee } from '../hr/_parts'

export default function MyPayslips() {
  const me = useMyEmployee()
  const runs = useStore((s) => s.payrollRuns || [])
  const loans = useStore((s) => (s.empLoans || []).filter((l) => l.empId === me?.id && l.status === 'ACTIVE'))
  const emailPayslip = useStore((s) => s.emailPayslip)
  const mine = useMemo(() => runs.filter((r) => r.status === 'PAID' && r.slips.some((s) => s.empId === me?.id && !s.hold)).sort((a, b) => b.period.localeCompare(a.period)), [runs, me])
  const [sel, setSel] = useState(null)
  if (!me) return <div><PageHeader title="My Payslips" /><EmptyState icon={Receipt} title="No employee record linked to your login" message="Please contact HR to link your user account to your employee profile." /></div>
  const run = mine.find((r) => r.id === sel) || mine[0]
  const slip = run?.slips.find((s) => s.empId === me.id)
  const cur = currentPeriod()
  const fy = cur.slice(5) >= '04' ? `${cur.slice(0, 4)}-04` : `${Number(cur.slice(0, 4)) - 1}-04`
  const ytd = mine.filter((r) => r.period >= fy).map((r) => r.slips.find((s) => s.empId === me.id))
  const d = (s, c) => s.deductions.filter((x) => x.code === c).reduce((a, x) => a + x.amount, 0)
  const trend = [...mine].reverse().map((r) => { const s = r.slips.find((x) => x.empId === me.id); return { label: periodShort(r.period), net: s.net, gross: s.gross } })
  return (
    <div>
      <PageHeader title="My Payslips" subtitle={`${me.name} · ${me.code} · ${me.designation}`} />
      <Grid cols={4} className="mb-4">
        <Stat label="Last net pay" value={slip ? fmtINR(mine[0].slips.find((s) => s.empId === me.id).net) : '—'} sub={mine[0] ? `credited ${fmtDate(mine[0].paymentDate)}` : ''} icon={Wallet} tone="green" />
        <Stat label="Gross earned FY to date" value={fmtINR(ytd.reduce((a, s) => a + s.gross, 0))} sub={`since ${periodLabel(fy)}`} icon={Receipt} />
        <Stat label="Tax deducted (TDS) FY" value={fmtINR(ytd.reduce((a, s) => a + d(s, 'TDS'), 0))} icon={Landmark} tone="amber" />
        <Stat label="PF contribution FY" value={fmtINR(ytd.reduce((a, s) => a + d(s, 'PF') + s.employer.pf, 0))} sub="your share + employer" icon={PiggyBank} tone="blue" />
      </Grid>
      {!mine.length ? <Card><EmptyState icon={Receipt} title="No payslips yet" message="Your payslip appears here once the month's salary is released." /></Card> : (
        <div className="grid xl:grid-cols-3 gap-4">
          <div className="space-y-4">
            <Card title="Payslips" padded={false}>
              <ul className="divide-y divide-slate-100">
                {mine.map((r) => {
                  const s = r.slips.find((x) => x.empId === me.id)
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => setSel(r.id)} className={cx('w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-50', run?.id === r.id && 'bg-brand-50/60')}>
                        <div><div className="text-sm font-medium text-slate-800">{r.periodLabel}</div><div className="text-[11px] text-slate-500">Paid {fmtDate(r.paymentDate)} · {s.paidDays}/{s.days} days</div></div>
                        <div className="text-right"><div className="text-sm font-semibold tabular-nums">{fmtINR(s.net)}</div>{s.lopDays > 0 && <Badge tone="amber">{s.lopDays} LOP</Badge>}</div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
            <Card title="Net pay trend"><TrendChart data={trend} series={[{ key: 'net', label: 'Net pay' }]} height={180} /></Card>
            {loans.length > 0 && (
              <Card title="My loans & advances" actions={<HandCoins className="w-4 h-4 text-slate-400" />}>
                {loans.map((l) => (
                  <div key={l.id} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-sm"><span>{l.number} · {l.type === 'ADVANCE' ? 'Salary advance' : 'Staff loan'}</span><span className="font-semibold">{fmtINR(l.balance)} left</span></div>
                    <Progress value={l.amount - l.balance} max={l.amount} showLabel className="mt-1" />
                    <div className="text-[11px] text-slate-500 mt-0.5">EMI {fmtINR(l.emi)} deducted from salary</div>
                  </div>
                ))}
              </Card>
            )}
          </div>
          <div className="xl:col-span-2">
            <div className="flex justify-end mb-2"><Button size="sm" variant="secondary" icon={Mail} onClick={() => { emailPayslip(run.id, me.id); toast.success('Payslip emailed', me.email) }}>Email to me</Button></div>
            {slip && <Payslip run={run} slip={slip} />}
          </div>
        </div>
      )}
    </div>
  )
}
