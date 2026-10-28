import React, { useMemo, useState } from 'react'
import { Plus, Download, Mail, ChevronRight, ChevronDown, BookOpenCheck, Users, Hourglass } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Tabs, Button, Badge, Card, Drawer, Modal, FormGrid, Field, Input, NumberInput, Select, Combobox, Segmented, toast, EmptyState, Grid, Stat } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PrintArea, DocHeader, BarsChart } from '../../../components/business'
import { fmtINR, fmtDate, today, round2, sum, exportCSV } from '../../../lib/format'
import { GROUPS, partyStatement, ageing, BUCKETS } from './_books'
import { useBooks, drcr, DrCr, VoucherBadge } from './_ui'

export default function Ledgers() {
  const [tab, setTab] = useState('COA')
  return (
    <div>
      <PageHeader title="Chart of Accounts & Ledgers" subtitle="Indian chart of accounts with live balances · dealer & vendor statements · receivable / payable ageing" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'COA', label: 'Chart of accounts' }, { key: 'PARTY', label: 'Party ledgers' }, { key: 'AGE', label: 'Ageing' }]} />
      {tab === 'COA' && <Chart />}
      {tab === 'PARTY' && <PartyLedger />}
      {tab === 'AGE' && <Ageing />}
    </div>
  )
}

function Chart() {
  const { chart, balanceOf, postings } = useBooks()
  const [open, setOpen] = useState(() => new Set(GROUPS))
  const [acc, setAcc] = useState(null)
  const [add, setAdd] = useState(false)
  const bal = useMemo(() => Object.fromEntries(chart.map((a) => [a.id, balanceOf(a.id)])), [chart, balanceOf])
  const toggle = (g) => setOpen((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n })
  const groupTotal = (g) => round2(sum(chart.filter((a) => a.group === g), (a) => bal[a.id]))
  return (
    <>
      <Grid cols={5} className="mb-4">
        {GROUPS.map((g) => <Stat key={g} label={g} value={drcr(groupTotal(g))} sub={`${chart.filter((a) => a.group === g).length} ledgers`} tone={g === 'Assets' ? 'ink' : g === 'Liabilities' ? 'amber' : g === 'Equity' ? 'violet' : g === 'Income' ? 'green' : 'red'} />)}
      </Grid>
      <Card title="Ledger tree" subtitle="Balances include opening balances migrated from Tally (1-Apr) and all postings to date" padded={false}
        actions={<><Button size="sm" variant="secondary" icon={Download} onClick={() => exportCSV('chart-of-accounts.csv', chart, [{ header: 'Code', key: 'code' }, { header: 'Ledger', key: 'name' }, { header: 'Group', key: 'group' }, { header: 'Sub-group', key: 'subgroup' }, { header: 'Opening', value: (a) => a.opening }, { header: 'Closing (Dr+/Cr-)', value: (a) => bal[a.id] }])}>Export</Button><Button size="sm" icon={Plus} onClick={() => setAdd(true)}>New ledger</Button></>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2">Ledger</th><th className="text-left px-3 py-2">Sub-group</th><th className="text-right px-3 py-2">Opening</th><th className="text-right px-4 py-2">Closing balance</th></tr></thead>
            <tbody>
              {GROUPS.map((g) => (
                <React.Fragment key={g}>
                  <tr className="bg-slate-100/70 cursor-pointer" onClick={() => toggle(g)}>
                    <td className="px-4 py-2 font-semibold text-ink-900" colSpan={3}><span className="inline-flex items-center gap-1">{open.has(g) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}{g}</span></td>
                    <td className="px-4 py-2 text-right font-semibold"><DrCr v={groupTotal(g)} /></td>
                  </tr>
                  {open.has(g) && chart.filter((a) => a.group === g).map((a) => (
                    <tr key={a.id} className="border-t border-slate-100 hover:bg-brand-50/40 cursor-pointer" onClick={() => setAcc(a)}>
                      <td className="px-4 py-2 pl-10"><span className="font-mono text-xs text-slate-400 mr-2">{a.code}</span>{a.name}{!a.system && <Badge tone="blue" className="ml-2">Custom</Badge>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{a.subgroup}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-500 tabular-nums">{a.opening ? drcr(a.nature === 'CR' ? -a.opening : a.opening) : '—'}</td>
                      <td className="px-4 py-2 text-right"><DrCr v={bal[a.id]} className={Math.abs(bal[a.id]) < 0.5 ? 'text-slate-300' : ''} /></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {acc && <AccountDrawer acc={acc} postings={postings} onClose={() => setAcc(null)} />}
      {add && <NewLedger onClose={() => setAdd(false)} chart={chart} />}
    </>
  )
}

function AccountDrawer({ acc, postings, onClose }) {
  const { booksStart } = useBooks()
  const [from, setFrom] = useState(booksStart)
  const [to, setTo] = useState(today())
  const opening0 = acc.nature === 'CR' ? -(acc.opening || 0) : acc.opening || 0
  const ps = postings.filter((p) => p.account === acc.id && p.date <= to).sort((a, b) => a.date.localeCompare(b.date))
  let open = opening0
  const rows = []
  for (const p of ps) { if (p.date < from) open += p.dr - p.cr; else rows.push(p) }
  let bal = open
  const lines = rows.map((p, i) => { bal = round2(bal + p.dr - p.cr); return { ...p, id: `${p.vid}${i}`, balance: bal } })
  return (
    <Drawer open onClose={onClose} width="max-w-5xl" title={`${acc.code} · ${acc.name}`} subtitle={`${acc.group} › ${acc.subgroup}`}>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex gap-4 text-sm ml-auto"><span>Opening <b>{drcr(open)}</b></span><span>Dr <b>{fmtINR(sum(rows, (p) => p.dr))}</b></span><span>Cr <b>{fmtINR(sum(rows, (p) => p.cr))}</b></span><span>Closing <b>{drcr(bal)}</b></span></div>
      </div>
      <DataTable rows={lines.slice().reverse()} exportName={`ledger-${acc.code}`} pageSize={20} columns={[
        { key: 'date', header: 'Date', render: (p) => fmtDate(p.date) },
        { key: 'vtype', header: 'Type', render: (p) => <VoucherBadge type={p.vtype} /> },
        { key: 'vno', header: 'Voucher' },
        { key: 'narration', header: 'Narration', render: (p) => <span className="text-xs">{p.narration}</span> },
        { key: 'dr', header: 'Debit', align: 'right', render: (p) => (p.dr ? fmtINR(p.dr, true) : '') },
        { key: 'cr', header: 'Credit', align: 'right', render: (p) => (p.cr ? fmtINR(p.cr, true) : '') },
        { key: 'balance', header: 'Balance', align: 'right', render: (p) => drcr(p.balance) },
      ]} />
    </Drawer>
  )
}

function NewLedger({ onClose, chart }) {
  const save = useStore((s) => s.saveLedgerAccount)
  const [f, setF] = useState({ code: '', name: '', group: 'Expenses', subgroup: 'Indirect Expenses', nature: 'DR', opening: 0 })
  const subs = [...new Set(chart.filter((a) => a.group === f.group).map((a) => a.subgroup))]
  const submit = () => {
    if (!/^\d{4}$/.test(f.code)) return toast.error('Ledger code must be 4 digits')
    if (chart.some((a) => a.code === f.code)) return toast.error('Code already exists')
    if (!f.name.trim()) return toast.error('Ledger name is required')
    save({ ...f, opening: Number(f.opening) || 0 })
    toast.success('Ledger created', `${f.code} · ${f.name}`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="New ledger" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Create ledger</Button></>}>
      <FormGrid>
        <Field label="Code" required><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="e.g. 5218" /></Field>
        <Field label="Ledger name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Group"><Select value={f.group} onChange={(e) => { const g = e.target.value; setF({ ...f, group: g, subgroup: chart.find((a) => a.group === g)?.subgroup || '', nature: ['Assets', 'Expenses'].includes(g) ? 'DR' : 'CR' }) }} options={GROUPS} /></Field>
        <Field label="Sub-group"><Select value={f.subgroup} onChange={(e) => setF({ ...f, subgroup: e.target.value })} options={subs} /></Field>
        <Field label="Nature"><Select value={f.nature} onChange={(e) => setF({ ...f, nature: e.target.value })} options={[{ value: 'DR', label: 'Debit' }, { value: 'CR', label: 'Credit' }]} /></Field>
        <Field label="Opening balance (₹)"><NumberInput value={f.opening} onChange={(v) => setF({ ...f, opening: v })} /></Field>
      </FormGrid>
    </Modal>
  )
}

function PartyLedger() {
  const { postings, booksStart } = useBooks()
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const sendEmail = useStore((s) => s.sendEmail)
  const [type, setType] = useState('DEALER')
  const [id, setId] = useState('d1')
  const [from, setFrom] = useState(booksStart)
  const [to, setTo] = useState(today())
  const party = type === 'DEALER' ? partners.find((p) => p.id === id) : vendors.find((v) => v.id === id)
  const st = useMemo(() => partyStatement(postings, type, id, { from, to }), [postings, type, id, from, to])
  const opts = type === 'DEALER' ? partners.filter((p) => p.type !== 'EXPORT' || true).map((p) => ({ value: p.id, label: p.name, sub: `${p.code} · ${p.city}` })) : vendors.map((v) => ({ value: v.id, label: v.name, sub: v.type }))
  const csv = () => exportCSV(`ledger-${party?.code || id}-${from}-${to}.csv`, [{ date: from, vno: '', vtype: '', narration: 'Opening balance', dr: st.opening > 0 ? st.opening : 0, cr: st.opening < 0 ? -st.opening : 0, balance: st.opening }, ...st.lines], [
    { header: 'Date', key: 'date' }, { header: 'Voucher type', key: 'vtype' }, { header: 'Voucher no.', key: 'vno' }, { header: 'Particulars', key: 'narration' }, { header: 'Debit', key: 'dr' }, { header: 'Credit', key: 'cr' }, { header: 'Balance (Dr+/Cr-)', key: 'balance' },
  ])
  const email = () => {
    sendEmail({ to: party?.email, subject: `Statement of account ${fmtDate(from)} – ${fmtDate(to)} – Btali International`, body: `Dear ${party?.contact || 'Sir/Madam'},\n\nPlease find your statement of account for ${fmtDate(from)} to ${fmtDate(to)}.\nOpening: ${drcr(st.opening)}\nDebits: ${fmtINR(st.dr)} · Credits: ${fmtINR(st.cr)}\nClosing: ${drcr(st.closing)}\n\nKindly confirm the balance or report differences within 7 days.\n\nRegards,\nBtali Accounts`, ref: party?.code, kind: 'STATEMENT' })
    toast.success('Statement emailed', party?.email)
  }
  return (
    <div className="space-y-4">
      <Card padded>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <Segmented value={type} onChange={(v) => { setType(v); setId(v === 'DEALER' ? 'd1' : 'v1') }} options={[{ key: 'DEALER', label: 'Dealers' }, { key: 'VENDOR', label: 'Vendors' }]} />
          <Field label="Party" className="lg:w-80"><Combobox options={opts} value={id} onChange={setId} /></Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="flex gap-2 lg:ml-auto"><Button variant="secondary" icon={Download} onClick={csv}>Download CSV</Button><Button variant="secondary" icon={Mail} onClick={email}>Email statement</Button></div>
        </div>
      </Card>
      <PrintArea title={`Statement – ${party?.name}`}>
        <DocHeader title="Statement of Account" number={party?.code} date={to} right={<div className="text-xs text-slate-500">{fmtDate(from)} – {fmtDate(to)}</div>} />
        <div className="flex flex-col sm:flex-row justify-between gap-2 text-sm mb-3">
          <div><div className="font-semibold">{party?.name}</div><div className="text-slate-500">{party?.city}{party?.state ? `, ${party.state}` : party?.country ? `, ${party.country}` : ''} · GSTIN {party?.gstin || party?.gst || '—'}</div></div>
          <div className="flex gap-4"><span>Opening <b>{drcr(st.opening)}</b></span><span>Closing <b className={st.closing > 0 ? 'text-red-600' : 'text-emerald-700'}>{drcr(st.closing)}</b></span></div>
        </div>
        {st.lines.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">Voucher</th><th className="text-left px-3 py-2">Particulars</th><th className="text-right px-3 py-2">Debit</th><th className="text-right px-3 py-2">Credit</th><th className="text-right px-3 py-2">Balance</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-slate-50/50"><td className="px-3 py-1.5">{fmtDate(from)}</td><td colSpan={3} className="px-3 py-1.5 italic text-slate-500">Opening balance</td><td /><td /><td className="px-3 py-1.5 text-right">{drcr(st.opening)}</td></tr>
                {st.lines.map((p, i) => (
                  <tr key={i}><td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(p.date)}</td><td className="px-3 py-1.5">{p.vtype}</td><td className="px-3 py-1.5 whitespace-nowrap">{p.vno}</td><td className="px-3 py-1.5 text-xs text-slate-600">{p.narration}</td><td className="px-3 py-1.5 text-right tabular-nums">{p.dr ? fmtINR(p.dr, true) : ''}</td><td className="px-3 py-1.5 text-right tabular-nums">{p.cr ? fmtINR(p.cr, true) : ''}</td><td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{drcr(p.balance)}</td></tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold"><tr><td colSpan={4} className="px-3 py-2 text-right">Totals</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(st.dr, true)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(st.cr, true)}</td><td className="px-3 py-2 text-right">{drcr(st.closing)}</td></tr></tfoot>
            </table>
          </div>
        ) : <EmptyState title="No transactions in this period" />}
      </PrintArea>
    </div>
  )
}

function Ageing() {
  const { postings } = useBooks()
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const [side, setSide] = useState('DEALER')
  const rows = useMemo(() => ageing(postings, side).map((r) => ({ ...r, id: r.partyId, name: (side === 'DEALER' ? partners : vendors).find((p) => p.id === r.partyId)?.name || r.partyId })), [postings, side, partners, vendors])
  const totals = Object.fromEntries([...BUCKETS.map((b) => b.key), 'total', 'advance'].map((k) => [k, round2(sum(rows, (r) => r[k]))]))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Segmented value={side} onChange={setSide} options={[{ key: 'DEALER', label: 'Receivables (dealers)' }, { key: 'VENDOR', label: 'Payables (vendors)' }]} />
        <div className="text-xs text-slate-500">FIFO ageing of open {side === 'DEALER' ? 'invoices & debit notes' : 'bills & credits'} as on {fmtDate(today())}</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={side === 'DEALER' ? 'Receivables by age' : 'Payables by age'} className="lg:col-span-2">
          <BarsChart data={BUCKETS.map((b) => ({ label: b.label, amount: totals[b.key] }))} series={[{ key: 'amount', label: 'Outstanding', color: side === 'DEALER' ? '#0d9488' : '#f2541f' }]} height={220} />
        </Card>
        <Card title="Summary">
          {BUCKETS.map((b) => <div key={b.key} className="flex justify-between text-sm py-1"><span className="text-slate-500">{b.label}</span><span className="tabular-nums font-medium">{fmtINR(totals[b.key])}</span></div>)}
          <div className="flex justify-between text-sm py-1 border-t border-slate-100 mt-1 font-semibold"><span>Total outstanding</span><span>{fmtINR(totals.total)}</span></div>
          <div className="flex justify-between text-sm py-1 text-slate-500"><span>{side === 'DEALER' ? 'Advances received (unadjusted)' : 'Advances paid (unadjusted)'}</span><span>{fmtINR(totals.advance)}</span></div>
          {side === 'DEALER' && <p className="text-[11px] text-slate-400 mt-2">Dealers pay in advance, so receivables mainly arise from debit notes and part-paid invoices.</p>}
        </Card>
      </div>
      <DataTable rows={rows} exportName={side === 'DEALER' ? 'receivables-ageing' : 'payables-ageing'} initialSort={{ key: 'total', dir: 'desc' }}
        empty={<EmptyState icon={Hourglass} title="Nothing outstanding" />}
        columns={[
          { key: 'name', header: side === 'DEALER' ? 'Dealer' : 'Vendor' },
          ...BUCKETS.map((b) => ({ key: b.key, header: b.label, align: 'right', render: (r) => (r[b.key] ? <span className={b.key === 'b3' ? 'text-red-600 font-medium' : ''}>{fmtINR(r[b.key])}</span> : '—') })),
          { key: 'total', header: 'Total due', align: 'right', render: (r) => <b>{fmtINR(r.total)}</b> },
          { key: 'advance', header: 'Advance', align: 'right', render: (r) => (r.advance ? <span className="text-emerald-700">{fmtINR(r.advance)}</span> : '—') },
          { key: 'items', header: 'Open docs', align: 'right', value: (r) => r.items.length, render: (r) => <span title={r.items.map((i) => `${i.vno} (${i.days}d) ${fmtINR(i.open)}`).join('\n')}>{r.items.length}</span> },
        ]} />
    </div>
  )
}
