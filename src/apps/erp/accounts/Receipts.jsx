import React, { useMemo, useState } from 'react'
import { HandCoins, Clock, CheckCircle2, AlertTriangle, Mail, Printer, ArrowRight, Landmark } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Grid, Stat, Tabs, Button, StatusBadge, Badge, Modal, FormGrid, Field, Input, NumberInput, Select, Alert, KV, toast, EmptyState } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PartnerCell } from '../../../components/business'
import { fmtINR, fmtDate, today, daysBetween, round2, sum, makeAttachment, nowISO } from '../../../lib/format'
import { PAY_MODES } from './_books'
import { useBooks, VoucherPrint } from './_ui'

const adviceOf = (so) => (so.paymentAdvices || []).find((a) => a.status === 'SUBMITTED')

export default function Receipts() {
  const sos = useStore((s) => s.salesOrders)
  const receipts = useStore((s) => s.receipts)
  const cheques = useStore((s) => s.cheques) || []
  const banks = useStore((s) => s.bankAccounts) || []
  const { partner, user } = useLookup()
  const { chart, booksStart } = useBooks()
  const [tab, setTab] = useState('AWAIT')
  const [recordFor, setRecordFor] = useState(null)
  const [voucher, setVoucher] = useState(null)
  const t = today()
  const awaiting = useMemo(() => sos.filter((s) => s.status === 'CONFIRMED' && s.paymentStatus !== 'PAID').sort((a, b) => Number(!!adviceOf(b)) - Number(!!adviceOf(a)) || a.date.localeCompare(b.date)), [sos])
  const advised = awaiting.filter(adviceOf)
  const bal = (s) => round2(s.total - (s.paidAmount || 0))
  const register = useMemo(() => receipts.filter((r) => r.date >= booksStart).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [receipts, booksStart])
  const monthRc = register.filter((r) => r.date.slice(0, 7) === t.slice(0, 7))
  const todayRc = register.filter((r) => r.date === t)
  const partial = awaiting.filter((s) => s.paymentStatus === 'PARTIAL')
  const stale = awaiting.filter((s) => daysBetween(s.date, t) >= 3)
  const bounced = cheques.filter((c) => c.direction === 'RECEIVED' && c.status === 'BOUNCED')
  const exceptions = [...new Set([...stale, ...partial])]

  const remind = (s) => {
    const p = partner(s.partnerId)
    useStore.getState().sendEmail({ to: p.email, subject: `Payment pending – order ${s.number}`, body: `Dear ${p.contact},\n\nYour order ${s.number} dated ${fmtDate(s.date)} for ${fmtINR(s.total)} is confirmed and reserved for you. ${s.paidAmount ? `We have received ${fmtINR(s.paidAmount)}; ` : ''}balance ${fmtINR(bal(s))} is pending.\n\nBank: HDFC Bank, A/c 50200034871126, IFSC HDFC0000540 (Btali International Pvt. Ltd.)\n\nGoods are invoiced and dispatched as soon as the advance is received.\n\nRegards,\nBtali Accounts`, attachments: [makeAttachment(`${s.number.replace(/\//g, '-')}.pdf`)], ref: s.number, kind: 'PAYMENT_REMINDER' })
    useStore.getState().notify({ title: 'Payment reminder', body: `${s.number} · balance ${fmtINR(bal(s))}`, partnerId: s.partnerId, link: '/dealer/orders' })
    useStore.getState().updateItem('salesOrders', s.id, (x) => ({ ...x, lastPaymentReminder: nowISO(), timeline: [...(x.timeline || []), { ts: nowISO(), text: 'Payment reminder sent by Accounts' }] }))
    toast.success('Reminder sent', `${p.name} · ${p.email}`)
  }

  const soCols = (withRemind) => [
    { key: 'number', header: 'Order', render: (s) => { const a = adviceOf(s); return <div><div className="font-medium text-slate-800">{s.number}</div><div className="text-[11px] text-slate-500">{fmtDate(s.date)} · {s.source === 'PORTAL' ? 'Portal' : 'Sales'}</div>{a && <Badge tone="violet" className="mt-0.5" dot>Dealer reported payment · {a.mode} {a.utr} · {fmtINR(a.amount)}</Badge>}</div> } },
    { key: 'partner', header: 'Dealer', value: (s) => partner(s.partnerId)?.name, render: (s) => <PartnerCell id={s.partnerId} /> },
    { key: 'age', header: 'Waiting', value: (s) => daysBetween(s.date, t), render: (s) => { const d = daysBetween(s.date, t); return <Badge tone={d >= 5 ? 'red' : d >= 3 ? 'amber' : 'gray'}>{d === 0 ? 'Today' : `${d} day${d > 1 ? 's' : ''}`}</Badge> } },
    { key: 'sp', header: 'Salesperson', value: (s) => user(s.salespersonId)?.name },
    { key: 'total', header: 'Order value', align: 'right', render: (s) => fmtINR(s.total, true) },
    { key: 'paid', header: 'Received', align: 'right', value: (s) => s.paidAmount || 0, render: (s) => (s.paidAmount ? <span className="text-emerald-700">{fmtINR(s.paidAmount, true)}</span> : '—') },
    { key: 'bal', header: 'Balance due', align: 'right', value: bal, render: (s) => <span className="font-semibold">{fmtINR(bal(s), true)}</span> },
    { key: 'ps', header: 'Payment', render: (s) => <StatusBadge status={s.paymentStatus} /> },
    { key: 'act', header: '', sortable: false, export: false, render: (s) => (
      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
        {withRemind && <Button size="sm" variant="secondary" icon={Mail} onClick={() => remind(s)}>Remind</Button>}
        <Button size="sm" icon={HandCoins} onClick={() => setRecordFor(s)}>Record receipt</Button>
      </div>
    ) },
  ]

  return (
    <div>
      <PageHeader title="Customer Receipts" subtitle="Dealers pay in advance – record NEFT/RTGS/UPI/cheque receipts against confirmed orders. Full payment releases the order to Dispatch for invoicing." />
      <Grid cols={4} className="mb-5">
        <Stat icon={Clock} tone="amber" label="Awaiting advance" value={fmtINR(sum(awaiting, bal))} sub={`${awaiting.length} confirmed orders`} onClick={() => setTab('AWAIT')} />
        <Stat icon={AlertTriangle} tone="red" label="Exceptions" value={exceptions.length + bounced.length} sub={`${stale.length} waiting 3+ days · ${partial.length} partial`} onClick={() => setTab('EXC')} />
        <Stat icon={CheckCircle2} tone="green" label="Received today" value={fmtINR(sum(todayRc, (r) => r.amount))} sub={`${todayRc.length} receipts`} />
        <Stat icon={HandCoins} tone="blue" label="Received this month" value={fmtINR(sum(monthRc, (r) => r.amount))} sub={`${monthRc.length} receipts`} onClick={() => setTab('REG')} />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'AWAIT', label: 'Awaiting advance', count: awaiting.length }, { key: 'EXC', label: 'Pending-payment exceptions', count: exceptions.length + bounced.length }, { key: 'REG', label: 'Receipts register', count: register.length }]} />
      {tab === 'AWAIT' && (
        <>
          {advised.length > 0 && <Alert tone="warn" className="mb-3" title={`${advised.length} dealer(s) reported payment from the portal`}>Verify the UTR against the bank statement and record the receipt – details are pre-filled from the dealer's advice.</Alert>}
          <Alert tone="info" className="mb-3" title="Advance-payment workflow">Recording the full balance marks the order PAID and notifies Dispatch to raise the tax invoice (stock permitting). Part payments keep the order on hold here.</Alert>
          <DataTable columns={soCols(false)} rows={awaiting} exportName="awaiting-advance" empty={<EmptyState icon={CheckCircle2} title="No orders awaiting payment" message="Confirmed orders appear here until the advance is received." />} />
        </>
      )}
      {tab === 'EXC' && (
        <div className="space-y-4">
          <DataTable columns={soCols(true)} rows={exceptions} searchable={false} empty={<EmptyState title="No exceptions" message="All confirmed orders are within 3 days and none are part-paid." />} />
          {bounced.length > 0 && (
            <DataTable searchable={false} rows={bounced} columns={[
              { key: 'number', header: 'Instrument', render: (c) => `${c.instrument} ${c.number}` }, { key: 'partyName', header: 'Dealer' }, { key: 'bankName', header: 'Drawn on' },
              { key: 'bouncedOn', header: 'Returned on', render: (c) => fmtDate(c.bouncedOn) }, { key: 'amount', header: 'Amount', align: 'right', render: (c) => fmtINR(c.amount) },
              { key: 's', header: 'Status', render: () => <StatusBadge status="FAILED" label="Bounced" /> }, { key: 'note', header: 'Note' },
            ]} />
          )}
        </div>
      )}
      {tab === 'REG' && (
        <DataTable rows={register} exportName="receipts-register" onRowClick={setVoucher} columns={[
          { key: 'number', header: 'Receipt no.' }, { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'p', header: 'Dealer', value: (r) => partner(r.partnerId)?.name },
          { key: 'so', header: 'Order', value: (r) => sos.find((s) => s.id === r.soId)?.number },
          { key: 'mode', header: 'Mode' }, { key: 'ref', header: 'UTR / reference', className: 'font-mono text-xs' },
          { key: 'bank', header: 'Bank', value: (r) => banks.find((b) => b.id === (r.bankId || 'bk1'))?.short },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="font-semibold">{fmtINR(r.amount, true)}</span> },
          { key: 'pr', header: '', sortable: false, export: false, render: () => <Printer className="w-4 h-4 text-slate-400" /> },
        ]} filters={[{ key: 'mode', label: 'modes', options: [...new Set(register.map((r) => r.mode))] }]} />
      )}
      {recordFor && <RecordModal so={recordFor} onClose={() => setRecordFor(null)} />}
      {voucher && (
        <Modal open size="lg" onClose={() => setVoucher(null)} title={`Receipt ${voucher.number}`}>
          <VoucherPrint title="Receipt Voucher" number={voucher.number} date={voucher.date} chart={chart}
            narration={`Received from ${partner(voucher.partnerId)?.name} against ${sos.find((s) => s.id === voucher.soId)?.number || 'order'} via ${voucher.mode} ${voucher.ref || ''}`}
            lines={[{ accountId: banks.find((b) => b.id === (voucher.bankId || 'bk1'))?.ledgerId || '1220', dr: voucher.amount }, { accountId: '1210', cr: voucher.amount, partyType: 'DEALER', partyId: voucher.partnerId }]} />
        </Modal>
      )}
    </div>
  )
}

function RecordModal({ so, onClose }) {
  const recordReceipt = useStore((s) => s.recordReceipt)
  const stmt = useStore((s) => s.bankStatements) || []
  const banks = useStore((s) => s.bankAccounts) || []
  const matchStatementLine = useStore((s) => s.matchStatementLine)
  const { partner } = useLookup()
  const balance = round2(so.total - (so.paidAmount || 0))
  const advice = adviceOf(so)
  const [f, setF] = useState(() => advice ? { amount: Math.min(advice.amount, balance), mode: advice.mode || 'NEFT', ref: advice.utr || '', bankId: advice.bankId || 'bk1', date: advice.date || today(), lineId: null } : { amount: balance, mode: 'NEFT', ref: '', bankId: 'bk1', date: today(), lineId: null })
  const credits = stmt.filter((l) => l.status === 'UNMATCHED' && l.credit > 0 && l.credit <= balance + 1).slice(-6).reverse()
  const full = Number(f.amount) >= balance - 1
  const p = partner(so.partnerId)
  const save = () => {
    const amt = Number(f.amount)
    if (!(amt > 0)) return toast.error('Enter the amount received')
    if (amt > balance + 1) return toast.error(`Amount exceeds the balance of ${fmtINR(balance, true)}`)
    if (f.mode !== 'CASH' && !f.ref.trim()) return toast.error('Enter the UTR / cheque reference')
    const rc = recordReceipt({ soId: so.id, amount: amt, mode: f.mode, ref: f.ref, date: f.date, bankId: f.bankId })
    if (f.lineId) matchStatementLine(f.lineId, { type: 'RECEIPT', id: rc.id })
    if (advice) useStore.getState().updateItem('salesOrders', so.id, (x) => ({ ...x, paymentAdvices: (x.paymentAdvices || []).map((a) => (a.id === advice.id ? { ...a, status: 'RECORDED', receiptId: rc.id, recordedAt: new Date().toISOString() } : a)) }))
    toast.success(full ? 'Fully paid – sent to Dispatch' : 'Part payment recorded', `${rc.number} · ${fmtINR(amt, true)}${full ? ` · ${so.number} is ready for invoicing` : ` · balance ${fmtINR(balance - amt, true)}`}`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Record receipt – ${so.number}`} subtitle={`${p?.name} · ${p?.city}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={full ? ArrowRight : HandCoins} onClick={save}>{full ? 'Record & release to Dispatch' : 'Record part payment'}</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
        <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Order value</div><div className="font-semibold tabular-nums">{fmtINR(so.total, true)}</div></div>
        <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Already received</div><div className="font-semibold tabular-nums">{fmtINR(so.paidAmount || 0, true)}</div></div>
        <div className="bg-brand-50 rounded-lg p-3"><div className="text-xs text-brand-700">Balance due</div><div className="font-semibold tabular-nums text-brand-800">{fmtINR(balance, true)}</div></div>
      </div>
      {advice && <Alert tone="info" className="mb-4" title="Dealer reported payment via portal">{advice.mode} {advice.utr} · {fmtINR(advice.amount, true)} on {fmtDate(advice.date)}{advice.remarks ? ` · “${advice.remarks}”` : ''}{advice.file ? ' · proof attached' : ''}. Details pre-filled below.</Alert>}
      {credits.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Landmark className="w-3.5 h-3.5" />Unmatched bank credits – click to use</div>
          <div className="flex flex-wrap gap-2">
            {credits.map((l) => (
              <button key={l.id} type="button" onClick={() => setF({ ...f, amount: l.credit, ref: l.ref, date: l.date, bankId: l.bankId, lineId: l.id, mode: /IMPS/.test(l.description) ? 'IMPS' : /RTGS/.test(l.description) ? 'RTGS' : 'NEFT' })}
                className={`text-left border rounded-lg px-2.5 py-1.5 text-xs hover:border-brand-400 ${f.lineId === l.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                <div className="font-semibold tabular-nums">{fmtINR(l.credit, true)} · {fmtDate(l.date)}</div>
                <div className="text-slate-500 truncate max-w-[220px]">{l.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <FormGrid cols={2}>
        <Field label="Amount received (₹)" required hint="Part payments are allowed"><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} step="0.01" /></Field>
        <Field label="Mode"><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} options={PAY_MODES.filter((m) => m !== 'SWIFT / TT')} /></Field>
        <Field label="UTR / cheque / UPI reference" required={f.mode !== 'CASH'}><Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="e.g. UTR HDFCN26102…" /></Field>
        <Field label="Credited to"><Select value={f.bankId} onChange={(e) => setF({ ...f, bankId: e.target.value })} options={banks.map((b) => ({ value: b.id, label: b.name }))} /></Field>
        <Field label="Receipt date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </FormGrid>
      <Alert tone={full ? 'success' : 'warn'} className="mt-4">{full ? 'This clears the order. It moves to PAID and Dispatch is notified to raise the invoice.' : `Order stays on hold – balance ${fmtINR(Math.max(0, balance - (Number(f.amount) || 0)), true)} will remain due.`}</Alert>
      <KV label="Dealer email for receipt confirmation" value={p?.email} className="mt-2" />
    </Modal>
  )
}
