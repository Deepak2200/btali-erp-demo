import React, { useMemo, useState } from 'react'
import { Wallet, AlertTriangle, CalendarClock, Landmark, Send, CheckCircle2, Ship, Download, Printer, BellRing } from 'lucide-react'
import { useStore, useUser, useLookup } from '../../../store'
import {
  PageHeader, Grid, Stat, Card, Button, StatusBadge, Badge, Modal, FormGrid, Field, Input, NumberInput, Select, FileUpload, AttachmentList, Alert, KV, toast, Tabs, EmptyState, Progress,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate, fmtMoney, today, addDays, daysBetween, round2, sum, downloadText } from '../../../lib/format'
import { billPayable, PAY_MODES } from './_books'
import { useBooks, drcr, VoucherPrint } from './_ui'

export default function Payments() {
  const bills = useStore((s) => s.vendorBills) || []
  const payments = useStore((s) => s.vendorPayments) || []
  const shipments = useStore((s) => s.shipments)
  const banks = useStore((s) => s.bankAccounts) || []
  const sendBillReminders = useStore((s) => s.sendBillReminders)
  const lastSent = useStore((s) => s.accountsSettings?.reminders?.lastSent)
  const { vendor } = useLookup()
  const user = useUser()
  const { balanceOf, chart } = useBooks()
  const [payIds, setPayIds] = useState(null)
  const [tab, setTab] = useState('TO_PAY')
  const [voucher, setVoucher] = useState(null)
  const t = today()
  const in7 = addDays(t, 7)
  const approved = useMemo(() => bills.filter((b) => b.status === 'APPROVED').sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [bills])
  const overdue = approved.filter((b) => b.dueDate < t)
  const dueWeek = approved.filter((b) => b.dueDate >= t && b.dueDate <= in7)
  const pendingBoss = bills.filter((b) => b.status === 'PENDING_BOSS')
  const canPay = ['FINANCE_HEAD', 'ADMIN'].includes(user?.role)
  const shOf = (b) => shipments.find((s) => s.id === b.shipmentId)

  const bankCards = banks.map((b) => {
    const bal = balanceOf(b.ledgerId)
    const manual = (b.manualBalances || []).slice(-1)[0]
    return { ...b, bal, manual, available: b.type === 'OD' ? b.odLimit + bal : bal }
  })
  const totalAvail = sum(bankCards, (b) => b.available)
  const toPay = sum(approved, billPayable)

  const remind = () => {
    const n = sendBillReminders(7)
    if (!n) return toast.info('Nothing due in the next 7 days')
    toast.success('Reminders sent', `${n} bill(s) emailed to Finance Head (cc Director) and notified in-app`)
  }

  const telexCell = (b) => {
    const sh = shOf(b)
    if (!sh || b.category !== 'SUPPLIER') return <span className="text-slate-300">—</span>
    const d = daysBetween(t, sh.eta)
    return (
      <div className="text-xs">
        <div className="flex items-center gap-1"><Ship className="w-3.5 h-3.5 text-slate-400" />{sh.number} · ETA {fmtDate(sh.eta)}</div>
        <div className={sh.telexReleased ? 'text-emerald-600' : d <= 3 ? 'text-red-600 font-medium' : 'text-amber-600'}>{sh.telexReleased ? 'Telex released' : b.billType === 'BALANCE' ? `Telex blocked until paid${d < 0 ? ' · container at port' : ` · ${d}d to ETA`}` : 'Telex pending'}</div>
      </div>
    )
  }
  const columns = [
    { key: 'number', header: 'Bill', render: (b) => <div><div className="font-medium text-slate-800">{b.number}</div><div className="text-[11px] text-slate-500">{b.vendorRef}</div></div> },
    { key: 'vendor', header: 'Vendor', value: (b) => vendor(b.vendorId)?.name, render: (b) => <div className="min-w-[150px]">{vendor(b.vendorId)?.name}<div className="text-[11px] text-slate-500">{b.description?.slice(0, 48)}</div></div> },
    { key: 'dueDate', header: 'Due date', render: (b) => { const d = daysBetween(t, b.dueDate); return <div><div className={d < 0 ? 'text-red-600 font-semibold' : ''}>{fmtDate(b.dueDate)}</div><Badge tone={d < 0 ? 'red' : d <= 7 ? 'amber' : 'gray'}>{d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : `${d} day${d === 1 ? '' : 's'}`}</Badge></div> } },
    { key: 'telex', header: 'ETA / telex dependency', sortable: false, render: telexCell },
    { key: 'amount', header: 'Amount', align: 'right', render: (b) => <div><div className="font-semibold">{fmtINR(billPayable(b))}</div>{b.currency !== 'INR' && <div className="text-[11px] text-slate-500">{fmtMoney(b.amount, b.currency)}</div>}</div>, value: (b) => billPayable(b) },
    { key: 'approved', header: 'Boss approved', render: (b) => <span className="text-xs text-slate-500">{fmtDate(b.bossApprovedAt)}</span> },
    { key: 'act', header: '', sortable: false, export: false, render: (b) => canPay && <Button size="sm" icon={Wallet} onClick={(e) => { e.stopPropagation(); setPayIds([b.id]) }}>Mark paid</Button> },
  ]

  return (
    <div>
      <PageHeader title="Madam Payment Dashboard" subtitle="Boss-approved vendor bills awaiting release · balances, due dates and telex dependencies at a glance"
        actions={<>
          <Button variant="secondary" icon={BellRing} onClick={remind}>Send reminders (due in 7 days)</Button>
        </>} />
      <Grid cols={4} className="mb-5">
        <Stat icon={Wallet} tone="blue" label="Approved – to pay" value={fmtINR(toPay)} sub={`${approved.length} bills`} />
        <Stat icon={AlertTriangle} tone="red" label="Overdue" value={fmtINR(sum(overdue, billPayable))} sub={`${overdue.length} bills`} />
        <Stat icon={CalendarClock} tone="amber" label="Due in next 7 days" value={fmtINR(sum(dueWeek, billPayable))} sub={`${dueWeek.length} bills`} />
        <Stat icon={Landmark} tone="green" label="Funds available (book)" value={fmtINR(totalAvail)} sub={totalAvail >= toPay ? 'Covers all approved bills' : 'Short of approved bills'} />
      </Grid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {bankCards.map((b) => (
          <Card key={b.id} title={b.name} subtitle={`A/c ${b.accountNo} · ${b.branch}`}>
            <div className="text-2xl font-bold text-ink-900 tabular-nums">{drcr(b.bal)}</div>
            <div className="text-xs text-slate-500">Book balance{b.manual ? ` · bank confirmed ${fmtINR(b.manual.balance)} on ${fmtDate(b.manual.date)}` : ''}</div>
            {b.type === 'OD' && <div className="mt-3"><div className="flex justify-between text-xs text-slate-500 mb-1"><span>OD utilised {fmtINR(Math.max(0, -b.bal))}</span><span>Limit {fmtINR(b.odLimit)}</span></div><Progress value={Math.max(0, -b.bal)} max={b.odLimit} tone="amber" /></div>}
          </Card>
        ))}
        <Card title="Payables vs funds">
          <KV label="Approved bills" value={fmtINR(toPay)} />
          <KV label="Pending Boss approval" value={fmtINR(sum(pendingBoss, billPayable))} />
          <KV label="Funds available" value={fmtINR(totalAvail)} />
          <KV label="Headroom after approved bills" value={<span className={totalAvail - toPay < 0 ? 'text-red-600' : 'text-emerald-700'}>{fmtINR(totalAvail - toPay)}</span>} className="border-t border-slate-100 mt-1" />
          {lastSent && <div className="text-[11px] text-slate-400 mt-2">Last reminder sent {fmtDate(lastSent)}</div>}
        </Card>
      </div>

      {!canPay && <Alert tone="info" className="mb-4">Payments are released by the Finance Head. You can view status and send reminders.</Alert>}
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'TO_PAY', label: 'To pay', count: approved.length }, { key: 'BOSS', label: 'Awaiting Boss', count: pendingBoss.length }, { key: 'PAID', label: 'Payment history', count: payments.length }]} />
      {tab === 'TO_PAY' && (
        <DataTable columns={columns} rows={approved} exportName="bills-to-pay" rowClass={(b) => (b.dueDate < t ? 'bg-red-50/50' : b.dueDate <= in7 ? 'bg-amber-50/40' : '')}
          empty={<EmptyState icon={CheckCircle2} title="All approved bills are paid" message="New bills appear here as soon as the Director approves them." />}
          bulkActions={canPay ? (sel, clear) => <Button size="sm" icon={Wallet} onClick={() => { setPayIds(sel.map((b) => b.id)); clear() }}>Pay {sel.length} selected · {fmtINR(sum(sel, billPayable))}</Button> : undefined} />
      )}
      {tab === 'BOSS' && (
        <DataTable rows={pendingBoss} exportName="bills-awaiting-boss" columns={[
          { key: 'number', header: 'Bill' }, { key: 'v', header: 'Vendor', value: (b) => vendor(b.vendorId)?.name },
          { key: 'dueDate', header: 'Due', render: (b) => fmtDate(b.dueDate) }, { key: 'amt', header: 'Net payable', align: 'right', value: (b) => billPayable(b), render: (b) => fmtINR(billPayable(b)) },
          { key: 's', header: 'Status', render: () => <StatusBadge status="PENDING_BOSS" label="Awaiting Boss" /> },
        ]} />
      )}
      {tab === 'PAID' && (
        <DataTable rows={payments} exportName="vendor-payments" initialSort={{ key: 'date', dir: 'desc' }} onRowClick={(p) => setVoucher(p)} columns={[
          { key: 'number', header: 'Voucher' }, { key: 'date', header: 'Date', render: (p) => fmtDate(p.date) },
          { key: 'v', header: 'Vendor', value: (p) => vendor(p.vendorId)?.name },
          { key: 'bills', header: 'Bills', value: (p) => p.billIds.map((id) => bills.find((b) => b.id === id)?.number).join(', ') },
          { key: 'mode', header: 'Mode / ref', render: (p) => <div>{p.mode}<div className="text-[11px] text-slate-500">{p.ref}</div></div> },
          { key: 'bank', header: 'Bank', value: (p) => banks.find((b) => b.id === p.bankId)?.short || p.bankId },
          { key: 'amountINR', header: 'Paid (₹)', align: 'right', render: (p) => <div><div className="font-semibold">{fmtINR(p.amountINR, true)}</div>{p.amountFC && <div className="text-[11px] text-slate-500">{fmtMoney(p.amountFC, p.currency)} @ {p.fxRate}</div>}</div> },
          { key: 'fx', header: 'FX gain/(loss)', align: 'right', value: (p) => round2(p.bookedINR - p.amountINR), render: (p) => { const d = round2(p.bookedINR - p.amountINR); return d ? <span className={d < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtINR(d, true)}</span> : '—' } },
        ]} />
      )}
      {payIds && <PayModal ids={payIds} onClose={() => setPayIds(null)} />}
      {voucher && (
        <Modal open size="lg" onClose={() => setVoucher(null)} title={`Payment voucher ${voucher.number}`} footer={<Button variant="secondary" icon={Download} onClick={() => downloadText(`${voucher.number.replace(/\//g, '-')}-remittance.txt`, remittanceText(voucher, bills, vendor(voucher.vendorId)))}>Download remittance advice</Button>}>
          <VoucherPrint title="Payment Voucher" number={voucher.number} date={voucher.date} chart={chart} narration={`Paid to ${vendor(voucher.vendorId)?.name} via ${voucher.mode} ${voucher.ref}`}
            lines={[{ accountId: vendor(voucher.vendorId)?.type === 'CHINA' ? '2101' : '2102', dr: voucher.bookedINR, partyType: 'VENDOR', partyId: voucher.vendorId }, ...(voucher.amountINR !== voucher.bookedINR ? [voucher.amountINR > voucher.bookedINR ? { accountId: '4020', dr: round2(voucher.amountINR - voucher.bookedINR) } : { accountId: '4020', cr: round2(voucher.bookedINR - voucher.amountINR) }] : []), { accountId: banks.find((b) => b.id === voucher.bankId)?.ledgerId || '1220', cr: voucher.amountINR }]}
            footer={voucher.swift && <div className="mt-3"><AttachmentList items={[voucher.swift]} dense /></div>} />
        </Modal>
      )}
    </div>
  )
}

const remittanceText = (p, bills, v) => `BTALI INTERNATIONAL PVT. LTD. – REMITTANCE ADVICE\n\nVoucher: ${p.number}\nDate: ${p.date}\nPaid to: ${v?.name}\nMode: ${p.mode}  Ref: ${p.ref}\n\nBills settled:\n${p.billIds.map((id) => { const b = bills.find((x) => x.id === id); return `  ${b?.number}  (vendor ref ${b?.vendorRef})  ${b?.currency} ${b?.amount}` }).join('\n')}\n\nAmount: ${p.currency !== 'INR' ? `${p.currency} ${p.amountFC} @ ${p.fxRate} = ` : ''}INR ${p.amountINR}\n`

function PayModal({ ids, onClose }) {
  const bills = useStore((s) => s.vendorBills)
  const payVendorBill = useStore((s) => s.payVendorBill)
  const fx = useStore((s) => s.settings.fx)
  const banks = useStore((s) => s.bankAccounts) || []
  const { vendor } = useLookup()
  const list = ids.map((id) => bills.find((b) => b.id === id)).filter(Boolean)
  const anyUSD = list.some((b) => b.currency !== 'INR')
  const [f, setF] = useState({ mode: anyUSD ? 'SWIFT / TT' : 'NEFT', bankId: 'bk1', date: today(), ref: '', fxRate: fx.USD, swift: null })
  const total = sum(list, (b) => (b.currency === 'INR' ? billPayable(b) : round2(b.amount * (Number(f.fxRate) || b.fxRate))))
  const submit = () => {
    if (!f.ref.trim()) return toast.error(anyUSD ? 'Enter the SWIFT / UTR reference' : 'Enter the UTR / cheque reference')
    if (anyUSD && !f.swift) return toast.error('Upload the SWIFT copy for USD remittances')
    let n = 0
    list.forEach((b, i) => {
      const r = payVendorBill(b.id, { mode: f.mode, bankId: f.bankId, ref: list.length > 1 ? `${f.ref}-${i + 1}` : f.ref, date: f.date, fxRate: b.currency === 'INR' ? 1 : Number(f.fxRate), swift: b.currency !== 'INR' ? f.swift : null })
      if (r.ok) n++
    })
    toast.success(`${n} payment(s) released`, `${fmtINR(total)} debited from ${banks.find((b) => b.id === f.bankId)?.name}; remittance advice emailed`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Release payment – ${list.length} bill(s)`} subtitle="Marks bills PAID, posts the payment voucher and reduces the bank book balance"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" icon={Send} onClick={submit}>Confirm payment · {fmtINR(total)}</Button></>}>
      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 mb-4">
        {list.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div><div className="font-medium">{b.number} · {vendor(b.vendorId)?.name}</div><div className="text-xs text-slate-500">Due {fmtDate(b.dueDate)} · {b.vendorRef}</div></div>
            <div className="text-right tabular-nums">{b.currency !== 'INR' ? <><div>{fmtMoney(b.amount, b.currency)}</div><div className="text-xs text-slate-500">booked @ {b.fxRate}</div></> : fmtINR(billPayable(b), true)}</div>
          </div>
        ))}
      </div>
      <FormGrid cols={2}>
        <Field label="Payment mode"><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} options={PAY_MODES.filter((m) => m !== 'CASH')} /></Field>
        <Field label="Pay from"><Select value={f.bankId} onChange={(e) => setF({ ...f, bankId: e.target.value })} options={banks.map((b) => ({ value: b.id, label: `${b.name} · ${b.accountNo.slice(-4)}` }))} /></Field>
        <Field label={anyUSD ? 'SWIFT / TT reference' : 'UTR / cheque no.'} required><Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder={anyUSD ? 'HDFCTT26…' : 'HDFCN26…'} /></Field>
        <Field label="Payment date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        {anyUSD && <Field label="Remittance rate (₹ per USD)" hint="Difference vs booking rate is posted to FX gain/loss"><NumberInput step="0.01" value={f.fxRate} onChange={(v) => setF({ ...f, fxRate: v })} /></Field>}
        {anyUSD && (
          <Field label="SWIFT copy" required>
            {f.swift ? <AttachmentList dense items={[f.swift]} onRemove={() => setF({ ...f, swift: null })} /> : <FileUpload compact multiple={false} onFiles={(a) => setF({ ...f, swift: { ...a[0], docType: 'SWIFT' } })} label="Upload SWIFT MT103 copy" />}
          </Field>
        )}
      </FormGrid>
      {list.some((b) => b.billType === 'BALANCE' && b.shipmentId) && <Alert tone="info" className="mt-4">Supplier will be emailed to release telex once the balance is remitted.</Alert>}
    </Modal>
  )
}
