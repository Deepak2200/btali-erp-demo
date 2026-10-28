import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, HandCoins, Landmark, Timer, AlertTriangle, Ship, ArrowRight, CalendarClock, Bell, CheckCircle2, FileWarning } from 'lucide-react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { useStore, useUser } from '../../../store'
import { PageHeader, Grid, Stat, Card, Badge, Button, Progress, EmptyState, cx } from '../../../components/ui'
import { BarsChart, CHART_COLORS } from '../../../components/business'
import { fmtINR, fmtCompact, fmtDate, today, addDays, daysBetween, round2, sum } from '../../../lib/format'
import { billPayable, expensePayable, nextMonth } from './_books'
import { useBooks, drcr } from './_ui'

export default function Dashboard() {
  const nav = useNavigate()
  const user = useUser()
  const books = useBooks()
  const { balanceOf, postings } = books
  const bills = useStore((s) => s.vendorBills) || []
  const sos = useStore((s) => s.salesOrders)
  const receipts = useStore((s) => s.receipts)
  const shipments = useStore((s) => s.shipments)
  const vendors = useStore((s) => s.vendors)
  const loans = useStore((s) => s.loans) || []
  const banks = useStore((s) => s.bankAccounts) || []
  const expenses = useStore((s) => s.expenses) || []
  const templates = useStore((s) => s.expenseTemplates) || []
  const cheques = useStore((s) => s.cheques) || []
  const stmt = useStore((s) => s.bankStatements) || []
  const ww = useStore((s) => s.wrongWorkings) || []
  const invoices = useStore((s) => s.invoices)
  const payrollRuns = useStore((s) => s.payrollRuns) || []
  const t = today()
  const vname = (id) => vendors.find((v) => v.id === id)?.name

  const open = bills.filter((b) => ['APPROVED', 'PENDING_BOSS'].includes(b.status))
  const awaiting = sos.filter((s) => s.status === 'CONFIRMED' && s.paymentStatus !== 'PAID')
  const bal = (s) => round2(s.total - (s.paidAmount || 0))
  const bankBal = banks.map((b) => ({ ...b, bal: balanceOf(b.ledgerId) }))
  const totalBank = sum(bankBal, (b) => b.bal)
  const odHeadroom = sum(bankBal.filter((b) => b.type === 'OD'), (b) => b.odLimit + Math.min(0, b.bal))
  const dueWeek = open.filter((b) => b.dueDate <= addDays(t, 7))

  // supplier dues by week
  const weeks = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ i, from: addDays(t, i * 7), to: addDays(t, i * 7 + 6), label: i === 0 ? 'This week' : `Wk ${fmtDate(addDays(t, i * 7)).slice(0, 6)}` })), [t])
  const wk = (d) => { if (d < t) return 0; const i = Math.floor(daysBetween(t, d) / 7); return i < 8 ? i : null }
  const duesByWeek = [{ label: 'Overdue', approved: 0, pending: 0 }, ...weeks.slice(0, 6).map((w) => ({ label: w.label, approved: 0, pending: 0 }))]
  for (const b of open) {
    const i = b.dueDate < t ? 0 : wk(b.dueDate) + 1
    if (i == null || i > 6) continue
    duesByWeek[i][b.status === 'APPROVED' ? 'approved' : 'pending'] += billPayable(b)
  }

  // 8-week cash forecast
  const forecast = useMemo(() => {
    const rows = weeks.map((w) => ({ label: w.label, inflow: 0, outflow: 0, items: [] }))
    const put = (d, v, what) => { const i = d < t ? 0 : wk(d); if (i == null) return; v > 0 ? (rows[i].inflow += v) : (rows[i].outflow += -v); rows[i].items.push(what) }
    for (const s of awaiting) { const adv = (s.paymentAdvices || []).some((a) => a.status === 'SUBMITTED'); put(adv ? t : addDays(s.date, 4), bal(s), `${s.number} advance`) }
    for (const c of cheques.filter((x) => x.direction === 'RECEIVED' && x.status === 'DEPOSITED' && !x.soId)) put(addDays(c.depositedOn || t, 2), c.amount, `Cheque ${c.number}`)
    for (const b of open) put(b.dueDate, -billPayable(b), `${b.number} ${vname(b.vendorId)}`)
    for (const e of expenses.filter((x) => x.status === 'APPROVED' || x.status === 'PENDING_APPROVAL')) put(t, -expensePayable(e), e.number)
    for (const l of loans) for (const r of l.schedule.filter((x) => x.status === 'DUE')) put(r.dueDate, -r.emi, `EMI ${l.lender}`)
    const nm = nextMonth(t.slice(0, 7))
    for (const tp of templates.filter((x) => x.active)) { const d = `${nm}-${String(tp.dayOfMonth || 1).padStart(2, '0')}`; put(d, -(tp.amount * (1 + (tp.gstRate || 0) / 100)), tp.name) }
    const gstDue = -(balanceOf('2201') + balanceOf('2202') + balanceOf('2203')) - Math.max(0, balanceOf('1240') + balanceOf('1241') + balanceOf('1242'))
    if (gstDue > 0) put(`${nm}-20`, -gstDue, 'GST (GSTR-3B)')
    const tdsDue = -['2210', '2211', '2212', '2213', '2214'].reduce((a, id) => a + balanceOf(id), 0)
    if (tdsDue > 0) put(`${nm}-07`, -tdsDue, 'TDS deposit')
    const lastPay = payrollRuns.filter((r) => r.totalNet).sort((a, b) => String(b.period).localeCompare(String(a.period)))[0]
    if (lastPay) put(`${nm}-01`, -lastPay.totalNet, 'Salaries')
    let run = totalBank
    return rows.map((r) => { run = round2(run + r.inflow - r.outflow); return { ...r, inflow: Math.round(r.inflow), outflow: Math.round(r.outflow), net: Math.round(r.inflow - r.outflow), closing: Math.round(run) } })
  }, [weeks, awaiting, cheques, open, expenses, loans, templates, payrollRuns, totalBank, balanceOf]) // eslint-disable-line

  // DSO / DPO
  const since = addDays(t, -90)
  const rc90 = receipts.filter((r) => r.date >= since && r.soId)
  const collDays = rc90.length ? sum(rc90, (r) => { const s = sos.find((x) => x.id === r.soId); return s ? Math.max(0, daysBetween(s.date, r.date)) : 0 }) / rc90.length : 0
  const sales90 = sum(invoices.filter((i) => i.date >= since), (i) => i.total)
  const debtors = Math.max(0, balanceOf('1210'))
  const dso = sales90 ? (debtors / (sales90 / 90)) : 0
  const purchases90 = sum(postings.filter((p) => p.vtype === 'Purchase' && p.date >= since && ['2101', '2102'].includes(p.account)), (p) => p.cr) + sum(postings.filter((p) => p.vtype === 'Journal' && p.date >= since && p.account === '2101'), (p) => p.cr)
  const creditors = -(balanceOf('2101') + balanceOf('2102'))
  const dpo = purchases90 ? creditors / (purchases90 / 90) : 0

  // ETA board
  const eta = shipments.filter((s) => s.status !== 'RECEIVED').sort((a, b) => a.eta.localeCompare(b.eta)).map((s) => {
    const sb = bills.filter((b) => b.shipmentId === s.id && b.category === 'SUPPLIER')
    const balBill = sb.find((b) => b.billType === 'BALANCE')
    const gaf = bills.find((b) => b.shipmentId === s.id && b.vendorId === (s.indianForwarderId || 'fw3'))
    return { ...s, balBill, gaf, days: daysBetween(t, s.eta) }
  })

  // alerts
  const alerts = []
  const overdue = open.filter((b) => b.status === 'APPROVED' && b.dueDate < t)
  if (overdue.length) alerts.push({ tone: 'red', text: `${overdue.length} approved bill(s) overdue – ${fmtINR(sum(overdue, billPayable))}`, link: '/erp/accounts/payments' })
  const pb = bills.filter((b) => b.status === 'PENDING_BOSS')
  if (pb.length) alerts.push({ tone: 'amber', text: `${pb.length} bill(s) waiting for Boss approval`, link: '/erp/accounts/vendor-bills' })
  for (const s of eta.filter((x) => !x.telexReleased && x.days <= 5)) alerts.push({ tone: 'red', text: `${s.number} ETA ${fmtDate(s.eta)} – telex not released${s.balBill && s.balBill.status !== 'PAID' ? ', supplier balance unpaid' : ''}`, link: '/erp/accounts/payments' })
  const stale = awaiting.filter((s) => daysBetween(s.date, t) >= 3)
  if (stale.length) alerts.push({ tone: 'amber', text: `${stale.length} confirmed order(s) awaiting advance for 3+ days`, link: '/erp/accounts/receipts' })
  const advices = awaiting.filter((s) => (s.paymentAdvices || []).some((a) => a.status === 'SUBMITTED'))
  if (advices.length) alerts.push({ tone: 'blue', text: `${advices.length} dealer payment advice(s) to verify`, link: '/erp/accounts/receipts' })
  const um = stmt.filter((l) => l.status === 'UNMATCHED').length
  if (um) alerts.push({ tone: 'blue', text: `${um} unreconciled bank statement line(s)`, link: '/erp/accounts/banking' })
  const pe = expenses.filter((e) => e.status === 'PENDING_APPROVAL')
  if (pe.length) alerts.push({ tone: 'amber', text: `${pe.length} expense(s) pending approval`, link: '/erp/accounts/expenses' })
  const recurDue = templates.filter((x) => x.active && (x.lastGenerated || '') < t.slice(0, 7))
  if (recurDue.length) alerts.push({ tone: 'amber', text: `${recurDue.length} recurring expense(s) not generated for this month`, link: '/erp/accounts/expenses' })
  const emiSoon = loans.flatMap((l) => l.schedule.filter((r) => r.status === 'DUE' && r.dueDate <= addDays(t, 7)).map((r) => ({ l, r })))
  for (const { l, r } of emiSoon) alerts.push({ tone: 'blue', text: `EMI ${fmtINR(r.emi)} to ${l.lender} on ${fmtDate(r.dueDate)}`, link: '/erp/accounts/loans' })
  const wwOpen = ww.filter((w) => w.status === 'OPEN')
  if (wwOpen.length) alerts.push({ tone: 'amber', text: `${wwOpen.length} logistics billing error(s) not yet raised with vendor`, link: '/erp/accounts/reconciliation' })
  const irnPending = invoices.filter((i) => !i.history && i.type !== 'FOC' && !i.irnAckNo).length
  if (irnPending) alerts.push({ tone: 'blue', text: `${irnPending} invoice(s) pending IRN registration`, link: '/erp/accounts/tax' })

  const emis = loans.flatMap((l) => l.schedule.filter((r) => r.status === 'DUE').slice(0, 3).map((r) => ({ ...r, lender: l.lender, acc: l.accountNo }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6)
  const toneCls = { red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-sky-500' }

  return (
    <div>
      <PageHeader title="Accounts Dashboard" subtitle={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user?.name?.split(' ')[0]} – payables, receivables, cash and imports at a glance`}
        actions={<><Button variant="secondary" onClick={() => nav('/erp/accounts/reports')}>Reports</Button><Button icon={Wallet} onClick={() => nav('/erp/accounts/payments')}>Payment dashboard</Button></>} />
      <Grid cols={4} className="mb-5">
        <Stat icon={Wallet} tone="red" label="Supplier dues – next 7 days" value={fmtINR(sum(dueWeek, billPayable))} sub={`${dueWeek.length} bills incl. overdue`} onClick={() => nav('/erp/accounts/payments')} />
        <Stat icon={HandCoins} tone="amber" label="Advance receivables pending" value={fmtINR(sum(awaiting, bal))} sub={`${awaiting.length} confirmed orders`} onClick={() => nav('/erp/accounts/receipts')} />
        <Stat icon={Landmark} tone="green" label="Bank balance (book)" value={fmtINR(totalBank)} sub={`+ OD headroom ${fmtCompact(odHeadroom)}`} onClick={() => nav('/erp/accounts/banking')} />
        <Stat icon={Timer} tone="ink" label="Collection days · DPO" value={`${collDays.toFixed(1)} d · ${Math.round(dpo)} d`} sub={`DSO ${dso.toFixed(1)} d (advance model)`} />
      </Grid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card title="8-week cash-flow forecast" subtitle="Expected advances from confirmed orders vs bills, EMIs, recurring costs, GST/TDS & salaries" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={270}>
            <ComposedChart data={forecast} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} tickFormatter={fmtCompact} />
              <Tooltip formatter={(v, n) => [fmtINR(v), { inflow: 'Inflows', outflow: 'Outflows', closing: 'Closing bank' }[n] || n]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => ({ inflow: 'Inflows', outflow: 'Outflows', closing: 'Closing bank balance' }[v])} />
              <Bar dataKey="inflow" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar dataKey="outflow" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Line dataKey="closing" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs min-w-[640px]">
              <tbody>
                {[['Inflows', 'inflow', 'text-emerald-700'], ['Outflows', 'outflow', 'text-red-600'], ['Closing', 'closing', 'font-semibold']].map(([l, k, c]) => (
                  <tr key={k} className="border-t border-slate-100"><td className="py-1 pr-2 text-slate-500">{l}</td>{forecast.map((r) => <td key={r.label} className={cx('py-1 px-1 text-right tabular-nums', c, k === 'closing' && r.closing < 0 && 'text-red-600')}>{fmtCompact(r[k])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Alerts" subtitle={`${alerts.length} items need attention`} actions={<Bell className="w-4 h-4 text-slate-400" />}>
          {alerts.length ? (
            <ul className="space-y-1.5 max-h-[360px] overflow-y-auto">
              {alerts.map((a, i) => (
                <li key={i}><button type="button" onClick={() => nav(a.link)} className="w-full flex items-start gap-2 text-left text-sm p-2 rounded-lg hover:bg-slate-50">
                  <span className={cx('w-2 h-2 rounded-full mt-1.5 shrink-0', toneCls[a.tone])} /><span className="flex-1 text-slate-700">{a.text}</span><ArrowRight className="w-3.5 h-3.5 text-slate-300 mt-1" />
                </button></li>
              ))}
            </ul>
          ) : <EmptyState icon={CheckCircle2} title="All clear" />}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card title="Supplier payment dues by week" subtitle="Approved (Madam to pay) vs awaiting Boss approval" className="xl:col-span-2">
          <BarsChart data={duesByWeek} stacked series={[{ key: 'approved', label: 'Approved', color: CHART_COLORS[1] }, { key: 'pending', label: 'Pending Boss', color: CHART_COLORS[3] }]} height={230} />
        </Card>
        <Card title="Payables vs bank balances">
          {bankBal.map((b) => <div key={b.id} className="flex justify-between text-sm py-1"><span className="text-slate-600">{b.name}</span><span className="tabular-nums font-medium">{drcr(b.bal)}</span></div>)}
          <div className="flex justify-between text-sm py-1"><span className="text-slate-600">Cash & petty cash</span><span className="tabular-nums">{fmtINR(balanceOf('1230') + balanceOf('1231'))}</span></div>
          <div className="flex justify-between text-sm py-1 border-t border-slate-100 mt-1"><span className="text-slate-600">Open vendor bills</span><span className="tabular-nums font-medium text-red-600">{fmtINR(sum(open, billPayable))}</span></div>
          <div className="flex justify-between text-sm py-1"><span className="text-slate-600">Creditors (books)</span><span className="tabular-nums">{fmtINR(creditors)}</span></div>
          <div className="mt-3"><div className="flex justify-between text-xs text-slate-500 mb-1"><span>Open bills cover</span><span>{totalBank > 0 ? `${((sum(open, billPayable) / totalBank) * 100).toFixed(0)}% of bank` : ''}</span></div><Progress value={sum(open, billPayable)} max={Math.max(totalBank, 1)} tone={sum(open, billPayable) > totalBank ? 'red' : 'green'} /></div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Digital ETA board" subtitle="Containers in transit / at port with payment & telex dependency" className="xl:col-span-2" padded={false}
          actions={<Button size="sm" variant="ghost" onClick={() => nav('/erp/purchase/shipments')}>Shipments</Button>}>
          {eta.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2">Shipment</th><th className="text-left px-3 py-2">ETA</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Supplier balance</th><th className="text-left px-3 py-2">Telex</th><th className="text-left px-3 py-2">GAF invoice</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {eta.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2"><div className="flex items-center gap-2"><Ship className="w-4 h-4 text-slate-400" /><div><div className="font-medium">{s.number}</div><div className="text-[11px] text-slate-500">{vname(s.vendorId)} · {s.containerNo}</div></div></div></td>
                      <td className="px-3 py-2"><div>{fmtDate(s.eta)}</div><div className={cx('text-[11px]', s.days < 0 ? 'text-red-600' : s.days <= 3 ? 'text-amber-600' : 'text-slate-500')}>{s.days < 0 ? `${-s.days}d past ETA` : s.days === 0 ? 'Today' : `in ${s.days}d`}</div></td>
                      <td className="px-3 py-2"><Badge tone={s.status === 'AT_PORT' ? 'violet' : 'blue'}>{s.status.replace(/_/g, ' ').toLowerCase()}</Badge></td>
                      <td className="px-3 py-2">{s.balBill ? <div><Badge tone={s.balBill.status === 'PAID' ? 'green' : s.balBill.dueDate < t ? 'red' : 'amber'}>{s.balBill.status === 'PAID' ? 'Paid' : s.balBill.status === 'APPROVED' ? `Due ${fmtDate(s.balBill.dueDate)}` : 'Pending Boss'}</Badge><div className="text-[11px] text-slate-500 mt-0.5">{fmtINR(billPayable(s.balBill))}</div></div> : <span className="text-xs text-slate-400">Not billed yet</span>}</td>
                      <td className="px-3 py-2">{s.telexReleased ? <Badge tone="green">Released</Badge> : <Badge tone={s.days <= 3 ? 'red' : 'amber'}>{s.balBill?.status === 'PAID' ? 'Requested' : 'Blocked – pay balance'}</Badge>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{s.gaf ? `${s.gaf.number}` : `~${fmtDate(addDays(s.ata || s.eta, 15))}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={Ship} title="No containers in transit" />}
        </Card>
        <Card title="Loan repayment schedule" subtitle="Upcoming EMIs" actions={<CalendarClock className="w-4 h-4 text-slate-400" />}>
          {emis.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-sm border-b border-slate-50 last:border-0">
              <div><div className="font-medium text-slate-700">{r.lender}</div><div className="text-[11px] text-slate-500">EMI {r.n} · {fmtDate(r.dueDate)}</div></div>
              <div className="text-right"><div className="tabular-nums font-medium">{fmtINR(r.emi)}</div><div className="text-[11px] text-slate-500">int. {fmtINR(r.interest)}</div></div>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="mt-2" iconRight={ArrowRight} onClick={() => nav('/erp/accounts/loans')}>All loans</Button>
        </Card>
      </div>
    </div>
  )
}
