import React, { useMemo, useRef, useState } from 'react'
import { Landmark, Upload, Wand2, Link2, Unlink, FileSpreadsheet, Download, Plus, Wallet, Ban, CheckCircle2, Banknote, PiggyBank, Sparkles } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Tabs, Button, Badge, StatusBadge, Modal, Field, Input, NumberInput, Select, Combobox, Card, KV, Alert, toast, Segmented, EmptyState, Textarea, FormGrid, confirm } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate, today, daysAgo, round2, sum, parseCSV, downloadText, uid } from '../../../lib/format'
import { useBooks, accountOptions, accountLabel, drcr } from './_ui'

export default function Banking() {
  const banks = useStore((s) => s.bankAccounts) || []
  const stmt = useStore((s) => s.bankStatements) || []
  const { balanceOf } = useBooks()
  const [tab, setTab] = useState('RECON')
  const [bankId, setBankId] = useState('bk1')
  const unmatched = (id) => stmt.filter((l) => l.bankId === id && l.status === 'UNMATCHED').length
  const lastBal = (id) => { const ls = stmt.filter((l) => l.bankId === id && l.balance != null).sort((a, b) => a.date.localeCompare(b.date)); return ls.length ? ls[ls.length - 1] : null }
  return (
    <div>
      <PageHeader title="Banking" subtitle="Bank accounts, statement upload & reconciliation, cheque/DD register, cash and petty-cash books" />
      <Grid cols={4} className="mb-5">
        {banks.map((b) => {
          const lb = lastBal(b.id)
          return <Stat key={b.id} icon={Landmark} tone={b.type === 'OD' ? 'amber' : 'ink'} label={b.name} value={drcr(balanceOf(b.ledgerId))} sub={lb ? `Statement ${fmtINR(lb.balance)} on ${fmtDate(lb.date)} · ${unmatched(b.id)} unmatched` : `${unmatched(b.id)} unmatched lines`} onClick={() => { setBankId(b.id); setTab('RECON') }} />
        })}
        <Stat icon={Banknote} tone="green" label="Cash in hand" value={fmtINR(balanceOf('1230'))} onClick={() => setTab('CASH')} />
        <Stat icon={PiggyBank} tone="violet" label="Petty cash" value={fmtINR(balanceOf('1231'))} onClick={() => setTab('CASH')} />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'RECON', label: 'Bank reconciliation' }, { key: 'CHQ', label: 'Cheque / DD register' }, { key: 'CASH', label: 'Cash & petty cash' }]} />
      {tab === 'RECON' && <Recon bankId={bankId} setBankId={setBankId} />}
      {tab === 'CHQ' && <Cheques />}
      {tab === 'CASH' && <CashBook />}
    </div>
  )
}

const MATCH_LABEL = { RECEIPT: 'Receipt', VENDOR_PAYMENT: 'Vendor payment', EXPENSE: 'Expense', EMI: 'Loan EMI', JOURNAL: 'Voucher' }
const vidOf = (m) => (!m ? null : m.type === 'RECEIPT' ? `rc:${m.id}` : m.type === 'VENDOR_PAYMENT' ? `vp:${m.id}` : m.type === 'EXPENSE' ? `exp:${m.id}` : m.type === 'EMI' ? `emi:${m.id}` : `jv:${m.id}`)

function Recon({ bankId, setBankId }) {
  const banks = useStore((s) => s.bankAccounts) || []
  const stmt = useStore((s) => s.bankStatements) || []
  const imports = useStore((s) => s.bankStatementImports) || []
  const receipts = useStore((s) => s.receipts)
  const vps = useStore((s) => s.vendorPayments) || []
  const expenses = useStore((s) => s.expenses) || []
  const journals = useStore((s) => s.journals) || []
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const { importBankStatement, autoMatchBank, unmatchStatementLine, ignoreStatementLine } = useStore.getState()
  const { postings, balanceOf } = useBooks()
  const [matchLine, setMatchLine] = useState(null)
  const fileRef = useRef(null)
  const bank = banks.find((b) => b.id === bankId)
  const lines = useMemo(() => stmt.filter((l) => l.bankId === bankId).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [stmt, bankId])
  const from = lines.length ? lines[lines.length - 1].date : daysAgo(20)
  const to = lines.length ? lines[0].date : today()
  const withBal = lines.filter((l) => l.balance != null)
  const stmtBal = withBal.length ? withBal.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0].balance : null
  const bookBal = balanceOf(bank?.ledgerId || '1220', to)
  const matchedVids = new Set(stmt.filter((l) => l.match).map((l) => vidOf(l.match)))
  const bookOnly = postings.filter((p) => p.account === bank?.ledgerId && p.date >= from && p.date <= to && !matchedVids.has(p.vid))
  const bankOnly = lines.filter((l) => l.status === 'UNMATCHED')
  const describe = (m) => {
    if (!m) return null
    if (m.type === 'RECEIPT') { const r = receipts.find((x) => x.id === m.id); return r ? `${r.number} · ${partners.find((p) => p.id === r.partnerId)?.name}` : m.id }
    if (m.type === 'VENDOR_PAYMENT') { const p = vps.find((x) => x.id === m.id); return p ? `${p.number} · ${vendors.find((v) => v.id === p.vendorId)?.name}` : m.id }
    if (m.type === 'EXPENSE') { const e = expenses.find((x) => x.id === m.id); return e ? `${e.number} · ${e.payee || e.category}` : m.id }
    if (m.type === 'JOURNAL') { const j = journals.find((x) => x.id === m.id); return j ? `${j.number} · ${j.narration.slice(0, 36)}` : m.id }
    return `EMI ${m.id.split(':')[1]}`
  }

  const onFile = async (file) => {
    if (!file) return
    const text = await file.text()
    const raw = parseCSV(text)
    const num = (v) => Number(String(v || '').replace(/[₹,\s]/g, '')) || 0
    const pick = (r, keys) => { const k = Object.keys(r).find((h) => keys.includes(h.toLowerCase().replace(/[^a-z]/g, ''))); return k ? r[k] : '' }
    const toIso = (d) => { const s = String(d).trim(); const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return s.slice(0, 10) }
    const rows = raw.map((r) => ({ date: toIso(pick(r, ['date', 'txndate', 'transactiondate', 'valuedate'])), description: pick(r, ['description', 'narration', 'particulars', 'remarks']), ref: pick(r, ['ref', 'reference', 'chqrefno', 'refno', 'chequeno', 'utr']), debit: num(pick(r, ['debit', 'withdrawal', 'withdrawalamt', 'dr'])), credit: num(pick(r, ['credit', 'deposit', 'depositamt', 'cr'])), balance: pick(r, ['balance', 'closingbalance']) === '' ? null : num(pick(r, ['balance', 'closingbalance'])) })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && (r.debit || r.credit))
    if (!rows.length) return toast.error('No transactions found', 'Expected columns: Date, Description, Ref, Debit, Credit, Balance')
    const res = importBankStatement(bankId, rows, file.name)
    toast.success(`${res.count} lines imported`, `${res.matched} auto-matched by amount & reference`)
  }
  const sample = () => {
    const since = daysAgo(10)
    const have = new Set(stmt.map((l) => vidOf(l.match)).filter(Boolean))
    const refs = new Set(stmt.map((l) => l.ref))
    const out = []
    for (const r of receipts) if ((r.bankId || 'bk1') === bankId && r.date >= since && !have.has(`rc:${r.id}`) && !refs.has(r.ref)) out.push({ date: r.date, description: `${r.mode === 'UPI' ? 'UPI' : 'NEFT'} CR-${r.ref}-${(partners.find((p) => p.id === r.partnerId)?.name || '').toUpperCase().slice(0, 22)}`, ref: r.ref, credit: r.amount, debit: 0 })
    for (const p of vps) if (p.bankId === bankId && p.date >= since && !have.has(`vp:${p.id}`) && !refs.has(p.ref)) out.push({ date: p.date, description: `${p.mode === 'SWIFT / TT' ? 'TT REMIT' : 'NEFT DR'}-${p.ref}-${(vendors.find((v) => v.id === p.vendorId)?.name || '').toUpperCase().slice(0, 22)}`, ref: p.ref, debit: p.amountINR, credit: 0 })
    for (const e of expenses) if (e.status === 'PAID' && (e.payFrom || 'bk1') === bankId && e.paidAt?.slice(0, 10) >= since && !have.has(`exp:${e.id}`) && !refs.has(e.paymentRef)) out.push({ date: e.paidAt.slice(0, 10), description: `NEFT DR-${e.paymentRef}-${(e.payee || '').toUpperCase().slice(0, 20)}`, ref: e.paymentRef, debit: round2(e.amount + (e.gst || 0) - (e.tds || 0)), credit: 0 })
    out.push({ date: today(), description: 'CHRG: NEFT/RTGS CHARGES INCL GST', ref: `CHG${today().replace(/-/g, '')}`, debit: 236, credit: 0 })
    let bal = stmtBal ?? balanceOf(bank.ledgerId, daysAgo(11))
    out.sort((a, b) => a.date.localeCompare(b.date)).forEach((r) => { bal = round2(bal + r.credit - r.debit); r.balance = bal })
    const res = importBankStatement(bankId, out, `${bank.short}-eStatement-${today()}.csv`)
    toast.success(`Statement fetched – ${res.count} new lines`, `${res.matched} auto-matched`)
  }
  const template = () => downloadText('bank-statement-template.csv', 'Date,Description,Ref,Debit,Credit,Balance\n27/10/2026,NEFT CR-HDFCN2610271234-SHARMA AGRO TRADERS,HDFCN2610271234,,125000.00,8125000.00\n27/10/2026,NEFT DR-N2610279876-BTALI 3PL,N2610279876,218300.00,,7906700.00\n', 'text/csv')

  return (
    <div className="space-y-4">
      <Card padded>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Segmented value={bankId} onChange={setBankId} options={banks.map((b) => ({ key: b.id, label: b.short || b.name }))} />
            <span className="text-xs text-slate-500">A/c {bank?.accountNo} · {bank?.ifsc} · {imports.filter((i) => i.bankId === bankId).length} statement(s) imported</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
            <Button variant="secondary" size="sm" icon={Download} onClick={template}>CSV format</Button>
            <Button variant="secondary" size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>Upload statement (CSV)</Button>
            <Button variant="secondary" size="sm" icon={Sparkles} onClick={sample}>Fetch latest e-statement</Button>
            <Button size="sm" icon={Wand2} onClick={() => { const n = autoMatchBank(bankId); n ? toast.success(`${n} lines matched`) : toast.info('No further automatic matches', 'Use Match to reconcile the remaining lines manually') }}>Auto-match</Button>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Bank reconciliation statement" subtitle={`${bank?.name} · ${fmtDate(from)} – ${fmtDate(to)}`} className="lg:col-span-1">
          <KV label="Balance as per books" value={drcr(bookBal)} />
          <KV label="Add: credits in bank not in books" value={fmtINR(sum(bankOnly, (l) => l.credit))} />
          <KV label="Less: debits in bank not in books" value={fmtINR(sum(bankOnly, (l) => l.debit))} />
          <KV label="Less: book receipts not yet in bank" value={fmtINR(sum(bookOnly, (p) => p.dr))} />
          <KV label="Add: book payments not yet in bank" value={fmtINR(sum(bookOnly, (p) => p.cr))} />
          <KV label="Reconciled balance" value={fmtINR(round2(bookBal + sum(bankOnly, (l) => l.credit - l.debit) - sum(bookOnly, (p) => p.dr - p.cr)))} className="border-t border-slate-100 mt-1" />
          <KV label="Balance as per bank statement" value={stmtBal != null ? fmtINR(stmtBal) : '—'} />
          <div className="mt-3 text-xs text-slate-500">{lines.filter((l) => l.status === 'MATCHED').length} matched · {bankOnly.length} unmatched · {lines.filter((l) => l.status === 'IGNORED').length} ignored</div>
        </Card>
        <Card title="In books, not yet in statement" subtitle="Uncleared cheques, in-transit transfers" className="lg:col-span-2" padded={false}>
          <div className="max-h-64 overflow-y-auto">
            {bookOnly.length ? (
              <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">
                {bookOnly.map((p, i) => <tr key={i}><td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtDate(p.date)}</td><td className="px-2 py-2"><div className="font-medium text-slate-700">{p.vno}</div><div className="text-[11px] text-slate-500 truncate max-w-md">{p.narration}</div></td><td className="px-4 py-2 text-right tabular-nums">{p.dr ? <span className="text-emerald-700">+{fmtINR(p.dr)}</span> : <span className="text-red-600">−{fmtINR(p.cr)}</span>}</td></tr>)}
              </tbody></table>
            ) : <EmptyState icon={CheckCircle2} title="Everything in books is reflected in the statement" />}
          </div>
        </Card>
      </div>
      <DataTable rows={lines} exportName={`${bank?.short}-statement`} pageSize={15}
        filters={[{ key: 'status', label: 'statuses', options: ['MATCHED', 'UNMATCHED', 'IGNORED'] }]}
        rowClass={(l) => (l.status === 'UNMATCHED' ? 'bg-amber-50/40' : '')}
        columns={[
          { key: 'date', header: 'Date', render: (l) => fmtDate(l.date) },
          { key: 'description', header: 'Narration', render: (l) => <div className="min-w-[240px]"><div className="text-slate-800 text-xs font-mono">{l.description}</div><div className="text-[11px] text-slate-400">{l.ref}</div></div> },
          { key: 'debit', header: 'Withdrawal', align: 'right', render: (l) => (l.debit ? <span className="text-red-600">{fmtINR(l.debit, true)}</span> : '') },
          { key: 'credit', header: 'Deposit', align: 'right', render: (l) => (l.credit ? <span className="text-emerald-700">{fmtINR(l.credit, true)}</span> : '') },
          { key: 'balance', header: 'Balance', align: 'right', render: (l) => (l.balance != null ? fmtINR(l.balance, true) : '—') },
          { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} label={l.status === 'MATCHED' && l.matchedBy === 'system' ? 'Auto-matched' : undefined} /> },
          { key: 'match', header: 'Matched to', value: (l) => describe(l.match), render: (l) => (l.match ? <div className="text-xs"><Badge tone="ink">{MATCH_LABEL[l.match.type]}</Badge><div className="text-slate-600 mt-0.5 max-w-[200px] truncate">{describe(l.match)}</div></div> : <span className="text-slate-300">—</span>) },
          { key: 'act', header: '', sortable: false, export: false, render: (l) => (
            <div className="flex gap-1 justify-end">
              {l.status === 'UNMATCHED' && <Button size="sm" icon={Link2} onClick={() => setMatchLine(l)}>Match</Button>}
              {l.status === 'MATCHED' && <Button size="sm" variant="ghost" icon={Unlink} onClick={() => { unmatchStatementLine(l.id); toast.info('Line unmatched') }}>Unmatch</Button>}
              {l.status === 'IGNORED' && <Button size="sm" variant="ghost" onClick={() => { unmatchStatementLine(l.id) }}>Restore</Button>}
            </div>
          ) },
        ]}
        empty={<EmptyState icon={FileSpreadsheet} title="No statement lines yet" message="Upload the bank's CSV statement or fetch the latest e-statement." />} />
      {matchLine && <MatchModal line={matchLine} onClose={() => setMatchLine(null)} onIgnore={(r) => { ignoreStatementLine(matchLine.id, r); setMatchLine(null); toast.info('Line ignored') }} />}
    </div>
  )
}

function MatchModal({ line, onClose, onIgnore }) {
  const { bankMatchCandidates, matchStatementLine, createEntryFromStatement } = useStore.getState()
  const { chart } = useBooks()
  const cands = useMemo(() => bankMatchCandidates(line), [line]) // eslint-disable-line
  const [acc, setAcc] = useState(line.debit ? (/CHG|CHRG|CHARGES/i.test(line.description) ? '5210' : '') : /INT/i.test(line.description) ? '4030' : '')
  const [narr, setNarr] = useState(line.description)
  return (
    <Modal open size="lg" onClose={onClose} title="Reconcile bank line" subtitle={`${fmtDate(line.date)} · ${line.credit ? `Deposit ${fmtINR(line.credit, true)}` : `Withdrawal ${fmtINR(line.debit, true)}`}`}
      footer={<Button variant="ghost" icon={Ban} onClick={() => onIgnore('Not a business transaction')}>Ignore line</Button>}>
      <div className="text-xs font-mono bg-slate-50 rounded-lg p-2 mb-4">{line.description}</div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Matching entries in books (same amount, ±7 days)</div>
      {cands.length ? (
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 mb-5">
          {cands.map((c) => (
            <div key={c.type + c.id} className="flex items-center gap-3 px-3 py-2">
              <Badge tone="ink">{MATCH_LABEL[c.type]}</Badge>
              <div className="flex-1 min-w-0 text-sm"><div className="truncate">{c.label}</div><div className="text-[11px] text-slate-500">{fmtDate(c.date)} · ref {c.ref || '—'}</div></div>
              <span className="tabular-nums text-sm">{fmtINR(c.amount, true)}</span>
              <Button size="sm" onClick={() => { matchStatementLine(line.id, { type: c.type, id: c.id }); toast.success('Matched', c.label); onClose() }}>Match</Button>
            </div>
          ))}
        </div>
      ) : <Alert tone="info" className="mb-5">No receipt, payment or voucher of this amount found in the books. If the dealer paid an order, record it from Customer Receipts – it will match automatically.</Alert>}
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Or book it now (bank charges, interest, misc.)</div>
      <FormGrid cols={2}>
        <Field label={line.credit ? 'Credit ledger' : 'Debit ledger'}><Combobox options={accountOptions(chart, (a) => !['Bank Accounts'].includes(a.subgroup))} value={acc} onChange={setAcc} placeholder="Select ledger…" /></Field>
        <Field label="Narration"><Input value={narr} onChange={(e) => setNarr(e.target.value)} /></Field>
      </FormGrid>
      <div className="flex justify-end mt-3"><Button icon={Plus} disabled={!acc} onClick={() => { const r = createEntryFromStatement(line.id, { accountId: acc, narration: narr }); if (r.ok) { toast.success(`${line.credit ? 'Receipt' : 'Payment'} voucher posted & matched`, `${r.journal.number} · ${accountLabel(chart, acc)}`); onClose() } }}>Create {line.credit ? 'receipt' : 'payment'} voucher & match</Button></div>
    </Modal>
  )
}

function Cheques() {
  const cheques = useStore((s) => s.cheques) || []
  const { updateChequeStatus } = useStore.getState()
  const [add, setAdd] = useState(false)
  const act = async (c, status) => {
    if (status === 'BOUNCED' && !(await confirm({ title: `Mark ${c.number} as bounced?`, message: 'The dealer will be emailed and Sales notified.', tone: 'danger', confirmText: 'Mark bounced' }))) return
    updateChequeStatus(c.id, status)
    toast.success(`${c.instrument} ${c.number} – ${status.toLowerCase()}`, status === 'CLEARED' && c.soId ? 'Receipt recorded against the linked order' : undefined)
  }
  const pendingIn = cheques.filter((c) => c.direction === 'RECEIVED' && ['RECEIVED', 'DEPOSITED'].includes(c.status))
  const pendingOut = cheques.filter((c) => c.direction === 'ISSUED' && c.status === 'ISSUED')
  return (
    <div className="space-y-4">
      <Grid cols={3}>
        <Stat icon={Wallet} tone="blue" label="Received – awaiting clearance" value={fmtINR(sum(pendingIn, (c) => c.amount))} sub={`${pendingIn.length} instruments`} />
        <Stat icon={Wallet} tone="amber" label="Issued – not yet presented" value={fmtINR(sum(pendingOut, (c) => c.amount))} sub={`${pendingOut.length} instruments`} />
        <Stat icon={Ban} tone="red" label="Bounced (FY)" value={cheques.filter((c) => c.status === 'BOUNCED').length} />
      </Grid>
      <DataTable rows={cheques} exportName="cheque-register" toolbar={<Button size="sm" icon={Plus} onClick={() => setAdd(true)}>Record cheque / DD</Button>}
        filters={[{ key: 'direction', label: 'directions', options: ['RECEIVED', 'ISSUED'] }, { key: 'status', label: 'statuses', options: ['RECEIVED', 'DEPOSITED', 'ISSUED', 'CLEARED', 'BOUNCED', 'CANCELLED'] }]}
        columns={[
          { key: 'direction', header: 'In / out', render: (c) => <Badge tone={c.direction === 'RECEIVED' ? 'green' : 'amber'}>{c.direction === 'RECEIVED' ? 'Received' : 'Issued'}</Badge> },
          { key: 'number', header: 'Instrument', render: (c) => <div><div className="font-medium">{c.instrument} {c.number}</div><div className="text-[11px] text-slate-500">{c.bankName}</div></div> },
          { key: 'date', header: 'Cheque date', render: (c) => <div>{fmtDate(c.date)}{c.date > today() && <div className="text-[11px] text-violet-600">Post-dated</div>}</div> },
          { key: 'partyName', header: 'Party' },
          { key: 'amount', header: 'Amount', align: 'right', render: (c) => fmtINR(c.amount, true) },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status === 'BOUNCED' ? 'FAILED' : c.status === 'DEPOSITED' ? 'IN_PROGRESS' : c.status} label={c.status === 'BOUNCED' ? 'Bounced' : c.status === 'DEPOSITED' ? 'Deposited' : undefined} /> },
          { key: 'note', header: 'Note', render: (c) => <span className="text-xs text-slate-500">{c.note}</span> },
          { key: 'act', header: '', sortable: false, export: false, render: (c) => (
            <div className="flex gap-1 justify-end">
              {c.direction === 'RECEIVED' && c.status === 'RECEIVED' && <Button size="sm" variant="secondary" onClick={() => act(c, 'DEPOSITED')}>Deposit</Button>}
              {((c.direction === 'RECEIVED' && c.status === 'DEPOSITED') || (c.direction === 'ISSUED' && c.status === 'ISSUED')) && <Button size="sm" variant="success" onClick={() => act(c, 'CLEARED')}>Cleared</Button>}
              {c.direction === 'RECEIVED' && c.status === 'DEPOSITED' && <Button size="sm" variant="secondary" onClick={() => act(c, 'BOUNCED')}>Bounced</Button>}
              {c.direction === 'ISSUED' && c.status === 'ISSUED' && <Button size="sm" variant="ghost" onClick={() => act(c, 'CANCELLED')}>Cancel</Button>}
            </div>
          ) },
        ]} />
      {add && <ChequeForm onClose={() => setAdd(false)} />}
    </div>
  )
}

function ChequeForm({ onClose }) {
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const sos = useStore((s) => s.salesOrders)
  const banks = useStore((s) => s.bankAccounts) || []
  const addCheque = useStore((s) => s.addCheque)
  const [f, setF] = useState({ direction: 'RECEIVED', instrument: 'CHEQUE', number: '', date: today(), bankName: '', partyId: '', partyName: '', amount: '', soId: '', bankId: 'bk1', note: '' })
  const openSo = sos.filter((s) => s.partnerId === f.partyId && s.status === 'CONFIRMED' && s.paymentStatus !== 'PAID')
  const save = () => {
    if (!f.number || !(Number(f.amount) > 0) || !(f.partyId || f.partyName)) return toast.error('Instrument no., party and amount are required')
    const party = f.direction === 'RECEIVED' ? partners.find((p) => p.id === f.partyId) : vendors.find((v) => v.id === f.partyId)
    addCheque({ ...f, partyType: f.direction === 'RECEIVED' ? 'DEALER' : f.partyId ? 'VENDOR' : 'OTHER', partyName: party?.name || f.partyName, soId: f.soId || null })
    toast.success(`${f.instrument} ${f.number} recorded`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Record cheque / DD" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <FormGrid>
        <Field label="Direction"><Select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value, partyId: '', soId: '' })} options={[{ value: 'RECEIVED', label: 'Received from dealer' }, { value: 'ISSUED', label: 'Issued by Btali' }]} /></Field>
        <Field label="Instrument"><Select value={f.instrument} onChange={(e) => setF({ ...f, instrument: e.target.value })} options={['CHEQUE', 'DD']} /></Field>
        <Field label="Cheque / DD no." required><Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
        <Field label="Instrument date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label={f.direction === 'RECEIVED' ? 'Dealer' : 'Vendor'} required><Combobox value={f.partyId} onChange={(v) => setF({ ...f, partyId: v })} options={(f.direction === 'RECEIVED' ? partners.filter((p) => p.status === 'ACTIVE') : vendors).map((p) => ({ value: p.id, label: p.name }))} /></Field>
        {f.direction === 'ISSUED' && !f.partyId && <Field label="Or payee name"><Input value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} /></Field>}
        <Field label="Amount (₹)" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Drawn on bank"><Input value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} placeholder="e.g. State Bank of India" /></Field>
        <Field label={f.direction === 'RECEIVED' ? 'Deposit into' : 'Issued from'}><Select value={f.bankId} onChange={(e) => setF({ ...f, bankId: e.target.value })} options={banks.map((b) => ({ value: b.id, label: b.name }))} /></Field>
        {f.direction === 'RECEIVED' && <Field label="Against order" hint="On clearance the receipt is recorded automatically"><Select value={f.soId} onChange={(e) => setF({ ...f, soId: e.target.value })} placeholder={openSo.length ? 'Not linked' : 'No unpaid orders'} options={openSo.map((s) => ({ value: s.id, label: `${s.number} · ${fmtINR(s.total - (s.paidAmount || 0))}` }))} /></Field>}
        <Field label="Note" className="md:col-span-2"><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  )
}

function CashBook() {
  const { postings, chart, accById } = useBooks()
  const addCashEntry = useStore((s) => s.addCashEntry)
  const [book, setBook] = useState('1230')
  const [add, setAdd] = useState(null)
  const acc = accById.get(book)
  const ps = postings.filter((p) => p.account === book).sort((a, b) => a.date.localeCompare(b.date))
  let bal = acc?.opening || 0
  const rows = ps.map((p, i) => { bal = round2(bal + p.dr - p.cr); return { ...p, id: `${p.vid}-${i}`, balance: bal } }).reverse()
  const t = today()
  const todayIn = sum(ps.filter((p) => p.date === t), (p) => p.dr), todayOut = sum(ps.filter((p) => p.date === t), (p) => p.cr)
  return (
    <div className="space-y-4">
      <Card padded>
        <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
          <Segmented value={book} onChange={setBook} options={[{ key: '1230', label: 'Cash book' }, { key: '1231', label: 'Petty cash book' }]} />
          <div className="flex gap-4 text-sm items-center flex-wrap">
            <span>Opening (1-Apr): <b>{fmtINR(acc?.opening || 0)}</b></span>
            <span>Today: <span className="text-emerald-700">+{fmtINR(todayIn)}</span> / <span className="text-red-600">−{fmtINR(todayOut)}</span></span>
            <span>Closing: <b>{fmtINR(bal)}</b></span>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdd('IN')}>Cash in</Button>
            <Button size="sm" icon={Plus} onClick={() => setAdd('OUT')}>Cash out</Button>
          </div>
        </div>
      </Card>
      <DataTable rows={rows} exportName={book === '1230' ? 'cash-book' : 'petty-cash-book'} columns={[
        { key: 'date', header: 'Date', render: (p) => fmtDate(p.date) },
        { key: 'vno', header: 'Voucher' },
        { key: 'narration', header: 'Particulars', render: (p) => <span className="text-sm">{p.narration}</span> },
        { key: 'dr', header: 'Receipts', align: 'right', render: (p) => (p.dr ? <span className="text-emerald-700">{fmtINR(p.dr, true)}</span> : '') },
        { key: 'cr', header: 'Payments', align: 'right', render: (p) => (p.cr ? <span className="text-red-600">{fmtINR(p.cr, true)}</span> : '') },
        { key: 'balance', header: 'Balance', align: 'right', render: (p) => fmtINR(p.balance, true) },
      ]} />
      {add && <CashForm type={add} book={book === '1231' ? 'PETTY' : 'CASH'} chart={chart} onClose={() => setAdd(null)} onSave={(d) => { const c = addCashEntry(d); toast.success('Cash entry saved', c.number); setAdd(null) }} />}
    </div>
  )
}

function CashForm({ type, book, chart, onClose, onSave }) {
  const [f, setF] = useState({ type, book, date: today(), amount: '', accountId: type === 'OUT' ? '5207' : '4040', narration: '' })
  return (
    <Modal open size="sm" onClose={onClose} title={`${book === 'PETTY' ? 'Petty cash' : 'Cash'} ${type === 'IN' ? 'receipt' : 'payment'}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { if (!(Number(f.amount) > 0) || !f.narration.trim()) return toast.error('Amount and narration are required'); onSave(f) }}>Save</Button></>}>
      <FormGrid cols={1}>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount (₹)" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label={type === 'IN' ? 'Received against ledger' : 'Expense / ledger'}><Combobox options={accountOptions(chart, (a) => a.id !== (book === 'PETTY' ? '1231' : '1230'))} value={f.accountId} onChange={(v) => setF({ ...f, accountId: v })} /></Field>
        <Field label="Narration" required><Input value={f.narration} onChange={(e) => setF({ ...f, narration: e.target.value })} placeholder="e.g. Courier – dealer documents" /></Field>
      </FormGrid>
    </Modal>
  )
}
