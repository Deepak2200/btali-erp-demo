import React, { useState } from 'react'
import { Plus, PiggyBank, CalendarClock, Landmark, Percent, CheckCircle2, PencilLine } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Grid, Stat, Button, Badge, StatusBadge, Card, Drawer, Modal, FormGrid, Field, Input, NumberInput, Select, KV, Progress, toast, confirm, Tabs, Textarea } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { TrendChart } from '../../../components/business'
import { fmtINR, fmtDate, today, addDays, daysBetween, round2, sum } from '../../../lib/format'
import { loanOutstanding } from './_books'
import { useBooks, drcr } from './_ui'

export default function Loans() {
  const loans = useStore((s) => s.loans) || []
  const banks = useStore((s) => s.bankAccounts) || []
  const [tab, setTab] = useState('LOANS')
  const [open, setOpen] = useState(null)
  const [add, setAdd] = useState(false)
  const [bal, setBal] = useState(null)
  const t = today()
  const outstanding = sum(loans, (l) => loanOutstanding(l))
  const dueRows = loans.flatMap((l) => l.schedule.filter((r) => r.status === 'DUE').slice(0, 1).map((r) => ({ ...r, loan: l })))
  const next = dueRows.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const monthEmi = sum(loans.filter((l) => l.status === 'ACTIVE'), (l) => l.emi)
  const latestManual = banks.map((b) => (b.manualBalances || []).slice(-1)[0]).filter(Boolean)
  return (
    <div>
      <PageHeader title="Loans & Bank Balances" subtitle="Term & vehicle loans with EMI schedules · bank balances entered by Finance with full history"
        actions={<><Button variant="secondary" icon={PencilLine} onClick={() => setBal({ bankId: 'bk1' })}>Enter bank balance</Button><Button icon={Plus} onClick={() => setAdd(true)}>Add loan</Button></>} />
      <Grid cols={4} className="mb-5">
        <Stat icon={PiggyBank} label="Loans outstanding" value={fmtINR(outstanding)} sub={`${loans.filter((l) => l.status === 'ACTIVE').length} active loans`} />
        <Stat icon={CalendarClock} tone={next && daysBetween(t, next.dueDate) <= 7 ? 'amber' : 'blue'} label="Next EMI" value={next ? fmtINR(next.emi) : '—'} sub={next ? `${next.loan.lender} · ${fmtDate(next.dueDate)}` : 'No EMIs due'} />
        <Stat icon={Percent} tone="ink" label="Monthly EMI outflow" value={fmtINR(monthEmi)} />
        <Stat icon={Landmark} tone="green" label="Bank balances (as entered)" value={fmtINR(sum(latestManual, (m) => m.balance))} sub={latestManual.length ? `Updated ${fmtDate(latestManual.map((m) => m.date).sort().slice(-1)[0])}` : ''} onClick={() => setTab('BANK')} />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'LOANS', label: 'Loans', count: loans.length }, { key: 'BANK', label: 'Bank balances' }]} />
      {tab === 'LOANS' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {loans.map((l) => {
            const os = loanOutstanding(l)
            const paid = l.schedule.filter((r) => r.status === 'PAID').length
            const nx = l.schedule.find((r) => r.status === 'DUE')
            return (
              <Card key={l.id} title={`${l.lender} – ${l.type === 'TERM_LOAN' ? 'Term loan' : l.type === 'VEHICLE' ? 'Vehicle loan' : l.type}`} subtitle={`${l.accountNo} · ${l.purpose}`} actions={<StatusBadge status={l.status} />}>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs text-slate-500">Sanctioned</div><div className="font-semibold">{fmtINR(l.principal)}</div></div>
                  <div><div className="text-xs text-slate-500">Outstanding</div><div className="font-semibold text-brand-700">{fmtINR(os)}</div></div>
                  <div><div className="text-xs text-slate-500">Rate · EMI</div><div className="font-semibold">{l.rate}% · {fmtINR(l.emi)}</div></div>
                </div>
                <div className="mt-3"><div className="flex justify-between text-xs text-slate-500 mb-1"><span>{paid} of {l.tenureMonths} EMIs paid</span><span>{((1 - os / l.principal) * 100).toFixed(0)}% repaid</span></div><Progress value={l.principal - os} max={l.principal} tone="green" /></div>
                <div className="flex items-center justify-between mt-4">
                  <div className="text-xs text-slate-500">{nx ? <>Next EMI <b className={daysBetween(t, nx.dueDate) < 0 ? 'text-red-600' : ''}>{fmtDate(nx.dueDate)}</b> · auto-debit {banks.find((b) => b.id === l.bankId)?.short}</> : 'Fully repaid'}</div>
                  <Button size="sm" variant="secondary" onClick={() => setOpen(l.id)}>EMI schedule</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {tab === 'BANK' && <BankBalances onEnter={(bankId) => setBal({ bankId })} />}
      {open && <LoanDrawer id={open} onClose={() => setOpen(null)} />}
      {add && <LoanForm onClose={() => setAdd(false)} />}
      {bal && <BalanceForm init={bal} onClose={() => setBal(null)} />}
    </div>
  )
}

function BankBalances({ onEnter }) {
  const banks = useStore((s) => s.bankAccounts) || []
  const { balanceOf } = useBooks()
  const { user } = useLookup()
  const rows = banks.flatMap((b) => (b.manualBalances || []).map((m) => ({ ...m, bank: b.name, book: balanceOf(b.ledgerId, m.date) }))).sort((a, b) => b.date.localeCompare(a.date))
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const chart = dates.map((d) => ({ label: fmtDate(d).slice(0, 6), ...Object.fromEntries(banks.map((b) => [b.id, [...(b.manualBalances || [])].filter((m) => m.date <= d).slice(-1)[0]?.balance ?? null])) }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {banks.map((b) => {
          const m = (b.manualBalances || []).slice(-1)[0]
          const book = balanceOf(b.ledgerId)
          return (
            <Card key={b.id} title={b.name} subtitle={`A/c ${b.accountNo} · ${b.ifsc}${b.type === 'OD' ? ` · OD limit ${fmtINR(b.odLimit)} @ ${b.odRate}%` : ''}`} actions={<Button size="sm" icon={PencilLine} onClick={() => onEnter(b.id)}>Update</Button>}>
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-xs text-slate-500">Balance as entered</div><div className="text-xl font-bold tabular-nums">{m ? fmtINR(m.balance) : '—'}</div><div className="text-[11px] text-slate-500">{m ? `${fmtDate(m.date)} · ${user(m.by)?.name || ''}` : 'Not entered yet'}</div></div>
                <div><div className="text-xs text-slate-500">Book balance (ERP)</div><div className="text-xl font-bold tabular-nums">{drcr(book)}</div><div className="text-[11px] text-slate-500">Difference {m ? fmtINR(round2(m.balance - book)) : '—'} (uncleared items)</div></div>
              </div>
            </Card>
          )
        })}
      </div>
      {chart.length > 1 && <Card title="Balance trend (as entered)"><TrendChart data={chart} series={banks.map((b) => ({ key: b.id, label: b.short || b.name }))} type="line" height={220} /></Card>}
      <DataTable rows={rows} exportName="bank-balance-history" columns={[
        { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 'bank', header: 'Bank' },
        { key: 'balance', header: 'Balance entered', align: 'right', render: (r) => <b>{fmtINR(r.balance)}</b> },
        { key: 'book', header: 'Book balance', align: 'right', render: (r) => drcr(r.book) },
        { key: 'note', header: 'Note' }, { key: 'by', header: 'Entered by', value: (r) => user(r.by)?.name },
      ]} />
    </div>
  )
}

function BalanceForm({ init, onClose }) {
  const banks = useStore((s) => s.bankAccounts) || []
  const setBankBalance = useStore((s) => s.setBankBalance)
  const { balanceOf } = useBooks()
  const [f, setF] = useState({ bankId: init.bankId, date: today(), balance: '', note: '' })
  const b = banks.find((x) => x.id === f.bankId)
  return (
    <Modal open size="sm" onClose={onClose} title="Enter bank balance" subtitle="As seen on net-banking / bank statement"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { if (f.balance === '' || isNaN(Number(f.balance))) return toast.error('Enter the balance'); setBankBalance(f.bankId, f); toast.success('Balance recorded', `${b?.name} · ${fmtINR(Number(f.balance))}`); onClose() }}>Save balance</Button></>}>
      <FormGrid cols={1}>
        <Field label="Bank account"><Select value={f.bankId} onChange={(e) => setF({ ...f, bankId: e.target.value })} options={banks.map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="As on"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Balance (₹)" hint={`Book balance on this date: ${drcr(balanceOf(b?.ledgerId, f.date))}${b?.type === 'OD' ? ' · enter OD utilisation as negative' : ''}`}><NumberInput value={f.balance} onChange={(v) => setF({ ...f, balance: v })} /></Field>
        <Field label="Note"><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  )
}

function LoanDrawer({ id, onClose }) {
  const l = useStore((s) => (s.loans || []).find((x) => x.id === id))
  const payEmi = useStore((s) => s.payEmi)
  if (!l) return null
  const t = today()
  const firstDue = l.schedule.find((r) => r.status === 'DUE')
  const pay = async (r) => {
    if (!(await confirm({ title: `Mark EMI ${r.n} as paid?`, message: `${fmtINR(r.emi, true)} (principal ${fmtINR(r.principal, true)} + interest ${fmtINR(r.interest, true)}) will be posted against the bank.`, confirmText: 'Mark paid' }))) return
    payEmi(l.id, r.n, { date: r.dueDate < t ? r.dueDate : t })
    toast.success(`EMI ${r.n} recorded`, `${l.lender} · ${fmtINR(r.emi, true)}`)
  }
  return (
    <Drawer open onClose={onClose} width="max-w-4xl" title={`${l.lender} · ${l.accountNo}`} subtitle={`${fmtINR(l.principal)} @ ${l.rate}% for ${l.tenureMonths} months · EMI ${fmtINR(l.emi, true)}`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card><KV label="Outstanding" value={fmtINR(loanOutstanding(l), true)} /></Card>
        <Card><KV label="Interest paid (FY)" value={fmtINR(sum(l.schedule.filter((r) => r.status === 'PAID' && r.paidOn >= `${t.slice(0, 4) - (Number(t.slice(5, 7)) < 4 ? 1 : 0)}-04-01`), (r) => r.interest), true)} /></Card>
        <Card><KV label="Security" value={<span className="text-xs">{l.security}</span>} /></Card>
      </div>
      <DataTable rows={l.schedule.map((r) => ({ ...r, id: r.n }))} searchable={false} pageSize={12} exportName={`emi-schedule-${l.accountNo}`} initialSort={null}
        rowClass={(r) => (r.status === 'DUE' && r.dueDate < t ? 'bg-red-50/50' : r.n === firstDue?.n ? 'bg-amber-50/50' : '')}
        columns={[
          { key: 'n', header: '#', align: 'right' }, { key: 'dueDate', header: 'Due date', render: (r) => fmtDate(r.dueDate) },
          { key: 'emi', header: 'EMI', align: 'right', render: (r) => fmtINR(r.emi, true) }, { key: 'principal', header: 'Principal', align: 'right', render: (r) => fmtINR(r.principal, true) },
          { key: 'interest', header: 'Interest', align: 'right', render: (r) => fmtINR(r.interest, true) }, { key: 'balance', header: 'Closing balance', align: 'right', render: (r) => fmtINR(r.balance, true) },
          { key: 'status', header: 'Status', render: (r) => (r.status === 'PAID' ? <StatusBadge status="PAID" label={`Paid ${fmtDate(r.paidOn)}`} /> : r.dueDate < t ? <StatusBadge status="OVERDUE" /> : <Badge tone="gray">Due</Badge>) },
          { key: 'act', header: '', sortable: false, render: (r) => (r.status === 'DUE' && r.n === firstDue?.n && r.dueDate <= addDays(t, 10) ? <Button size="sm" icon={CheckCircle2} onClick={() => pay(r)}>Mark paid</Button> : null) },
        ]} />
    </Drawer>
  )
}

function LoanForm({ onClose }) {
  const createLoan = useStore((s) => s.createLoan)
  const banks = useStore((s) => s.bankAccounts) || []
  const chart = useStore((s) => s.chartOfAccounts) || []
  const [f, setF] = useState({ lender: '', type: 'TERM_LOAN', purpose: '', accountNo: '', principal: '', rate: 10, tenureMonths: 36, startDate: today(), dayOfMonth: 5, bankId: 'bk1', ledgerId: '2301', security: '', disburseTo: 'bk1' })
  const save = () => {
    if (!f.lender || !f.accountNo || !(Number(f.principal) > 0)) return toast.error('Lender, account no. and amount are required')
    const l = createLoan({ ...f, short: f.lender.split(' ')[0].toUpperCase(), disburseTo: f.disburseTo === 'NONE' ? null : f.disburseTo })
    toast.success('Loan added', `EMI ${fmtINR(l.emi, true)} × ${l.tenureMonths}`)
    onClose()
  }
  return (
    <Modal open size="lg" onClose={onClose} title="Add loan" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Create loan & schedule</Button></>}>
      <FormGrid cols={3}>
        <Field label="Lender" required><Input value={f.lender} onChange={(e) => setF({ ...f, lender: e.target.value })} placeholder="e.g. Bajaj Finance" /></Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={[{ value: 'TERM_LOAN', label: 'Term loan' }, { value: 'VEHICLE', label: 'Vehicle loan' }, { value: 'BUSINESS', label: 'Business loan' }]} /></Field>
        <Field label="Loan account no." required><Input value={f.accountNo} onChange={(e) => setF({ ...f, accountNo: e.target.value })} /></Field>
        <Field label="Principal (₹)" required><NumberInput value={f.principal} onChange={(v) => setF({ ...f, principal: v })} /></Field>
        <Field label="Interest rate % p.a."><NumberInput step="0.05" value={f.rate} onChange={(v) => setF({ ...f, rate: v })} /></Field>
        <Field label="Tenure (months)"><NumberInput value={f.tenureMonths} onChange={(v) => setF({ ...f, tenureMonths: v })} /></Field>
        <Field label="Disbursed on"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="EMI day of month"><NumberInput min={1} max={28} value={f.dayOfMonth} onChange={(v) => setF({ ...f, dayOfMonth: v })} /></Field>
        <Field label="EMI debited from"><Select value={f.bankId} onChange={(e) => setF({ ...f, bankId: e.target.value })} options={banks.map((b) => ({ value: b.id, label: b.name }))} /></Field>
        <Field label="Loan ledger"><Select value={f.ledgerId} onChange={(e) => setF({ ...f, ledgerId: e.target.value })} options={chart.filter((a) => a.subgroup?.includes('Loans')).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} /></Field>
        <Field label="Disbursement"><Select value={f.disburseTo} onChange={(e) => setF({ ...f, disburseTo: e.target.value })} options={[...banks.map((b) => ({ value: b.id, label: `Credited to ${b.name}` })), { value: 'NONE', label: 'Paid directly to supplier / already booked' }]} /></Field>
        <Field label="Purpose"><Input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field>
        <Field label="Security" className="md:col-span-3"><Input value={f.security} onChange={(e) => setF({ ...f, security: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  )
}
