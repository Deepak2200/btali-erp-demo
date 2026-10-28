import React, { useMemo, useState } from 'react'
import { Plus, Trash2, BookOpen, FileClock, RotateCcw, Send, Save, CalendarDays } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Grid, Stat, Tabs, Button, Badge, StatusBadge, Modal, Field, Input, Textarea, Combobox, NumberInput, Segmented, Alert, toast, confirm, IconButton, Card, EmptyState } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate, today, round2, sum } from '../../../lib/format'
import { useBooks, accountOptions, accountLabel, VoucherPrint, VoucherBadge, JTYPE_LABEL } from './_ui'

const PARTY_ACC = { '1210': 'DEALER', '2101': 'VENDOR', '2102': 'VENDOR' }
const SOURCE_LABEL = { MANUAL: 'Manual', TALLY: 'Tally migration', DEPRECIATION: 'Depreciation run', GST: 'GST payment', TDS: 'TDS challan', BANK: 'Bank reconciliation', ASSET: 'Fixed assets', LOAN: 'Loans', REVERSAL: 'Reversal', PAYROLL: 'Payroll' }

export default function Journals() {
  const journals = useStore((s) => s.journals) || []
  const { chart, postings } = useBooks()
  const [tab, setTab] = useState('ALL')
  const [edit, setEdit] = useState(null)
  const [view, setView] = useState(null)
  const t = today()
  const total = (j) => round2(sum(j.lines, (l) => l.dr || 0))
  const drafts = journals.filter((j) => j.status === 'DRAFT')
  const rows = tab === 'ALL' ? journals : tab === 'DRAFT' ? drafts : journals.filter((j) => j.type === tab)
  const monthCount = journals.filter((j) => j.status === 'POSTED' && j.date.slice(0, 7) === t.slice(0, 7)).length

  return (
    <div>
      <PageHeader title="Journals & Vouchers" subtitle="Journal, contra, payment and receipt vouchers against the Indian chart of accounts · debit must equal credit"
        actions={<Button icon={Plus} onClick={() => setEdit({ type: 'JOURNAL' })}>New voucher</Button>} />
      <Grid cols={4} className="mb-5">
        <Stat icon={BookOpen} label="Vouchers posted this month" value={monthCount} />
        <Stat icon={FileClock} tone="amber" label="Drafts to review" value={drafts.length} onClick={() => setTab('DRAFT')} />
        <Stat icon={CalendarDays} tone="ink" label="System postings (FY)" value={new Set(postings.map((p) => p.vid)).size} sub="invoices, receipts, bills, payments…" />
        <Stat icon={RotateCcw} tone="blue" label="Contra entries (FY)" value={journals.filter((j) => j.type === 'CONTRA' && j.status === 'POSTED').length} onClick={() => setTab('CONTRA')} />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'ALL', label: 'All vouchers', count: journals.length }, { key: 'JOURNAL', label: 'Journal' }, { key: 'CONTRA', label: 'Contra' }, { key: 'PAYMENT', label: 'Payment' }, { key: 'RECEIPT', label: 'Receipt' }, { key: 'DRAFT', label: 'Drafts', count: drafts.length }, { key: 'DAY', label: 'Day book' }]} />
      {tab === 'DAY' ? <DayBook postings={postings} chart={chart} /> : (
        <DataTable rows={rows} onRowClick={setView} exportName="vouchers" initialSort={{ key: 'date', dir: 'desc' }}
          filters={[{ key: 'source', label: 'sources', options: Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })) }]}
          columns={[
            { key: 'number', header: 'Voucher no.', render: (j) => <span className="font-medium">{j.number}</span> },
            { key: 'date', header: 'Date', render: (j) => fmtDate(j.date) },
            { key: 'type', header: 'Type', render: (j) => <VoucherBadge type={JTYPE_LABEL[j.type]} /> },
            { key: 'narration', header: 'Narration', render: (j) => <div className="min-w-[220px] max-w-md truncate" title={j.narration}>{j.narration}</div> },
            { key: 'accounts', header: 'Ledgers', value: (j) => j.lines.map((l) => chart.find((a) => a.id === l.accountId)?.name).join(', '), render: (j) => <div className="text-xs text-slate-500 max-w-xs truncate">{j.lines.map((l) => chart.find((a) => a.id === l.accountId)?.name).join(' · ')}</div> },
            { key: 'source', header: 'Source', render: (j) => <Badge tone={j.source === 'MANUAL' ? 'gray' : 'blue'}>{SOURCE_LABEL[j.source] || j.source}</Badge> },
            { key: 'amt', header: 'Amount', align: 'right', value: total, render: (j) => fmtINR(total(j), true) },
            { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.reversedBy ? 'CANCELLED' : j.status} label={j.reversedBy ? 'Reversed' : undefined} /> },
          ]} />
      )}
      {edit && <VoucherEditor init={edit} chart={chart} onClose={() => setEdit(null)} />}
      {view && <VoucherView id={view.id} chart={chart} onClose={() => setView(null)} onEdit={(j) => { setView(null); setEdit(j) }} />}
    </div>
  )
}

function DayBook({ postings, chart }) {
  const [d, setD] = useState(today())
  const list = postings.filter((p) => p.date === d)
  const vids = [...new Set(list.map((p) => p.vid))]
  return (
    <Card title="Day book" subtitle="Every voucher posted on the date – sales, receipts, purchases, payments and journals" actions={<Input type="date" value={d} onChange={(e) => setD(e.target.value)} className="w-40" />}>
      {!vids.length ? <EmptyState title="No vouchers on this date" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr><th className="text-left px-3 py-2">Voucher</th><th className="text-left px-3 py-2">Particulars</th><th className="text-right px-3 py-2">Debit</th><th className="text-right px-3 py-2">Credit</th></tr></thead>
            <tbody>
              {vids.map((vid) => {
                const ls = list.filter((p) => p.vid === vid)
                return ls.map((p, i) => (
                  <tr key={vid + i} className={i === 0 ? 'border-t border-slate-200' : ''}>
                    <td className="px-3 py-1.5 align-top">{i === 0 && <div><VoucherBadge type={p.vtype} /><div className="text-xs text-slate-600 mt-0.5">{p.vno}</div></div>}</td>
                    <td className="px-3 py-1.5">{accountLabel(chart, p.account)}{i === ls.length - 1 && <div className="text-[11px] text-slate-400 italic">{p.narration}</div>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.dr ? fmtINR(p.dr, true) : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.cr ? fmtINR(p.cr, true) : ''}</td>
                  </tr>
                ))
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold"><tr><td colSpan={2} className="px-3 py-2 text-right">Total ({vids.length} vouchers)</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(sum(list, (p) => p.dr), true)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(sum(list, (p) => p.cr), true)}</td></tr></tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}

function VoucherView({ id, chart, onClose, onEdit }) {
  const j = useStore((s) => (s.journals || []).find((x) => x.id === id))
  const { reverseJournal, postDraftJournal, deleteDraftJournal } = useStore.getState()
  if (!j) return null
  const title = `${JTYPE_LABEL[j.type]} Voucher`
  return (
    <Modal open size="lg" onClose={onClose} title={`${title} ${j.number}`}
      footer={<>
        {j.status === 'DRAFT' && <><Button variant="secondary" icon={Trash2} onClick={async () => { if (await confirm({ title: 'Delete this draft?', tone: 'danger', confirmText: 'Delete' })) { deleteDraftJournal(j.id); toast.success('Draft deleted'); onClose() } }}>Delete draft</Button><Button variant="secondary" onClick={() => onEdit(j)}>Edit</Button><Button icon={Send} onClick={() => { const r = postDraftJournal(j.id); if (r.ok) { toast.success('Voucher posted', r.number); onClose() } else toast.error(r.error) }}>Post voucher</Button></>}
        {j.status === 'POSTED' && !j.reversedBy && j.source !== 'REVERSAL' && <Button variant="secondary" icon={RotateCcw} onClick={async () => { if (!(await confirm({ title: `Reverse ${j.number}?`, message: 'A reversing voucher with swapped debit/credit will be posted today.', confirmText: 'Post reversal' }))) return; const r = reverseJournal(j.id); if (r.ok) { toast.success('Reversal posted', r.journal.number); onClose() } }}>Reverse</Button>}
      </>}>
      {j.status === 'DRAFT' && <Alert tone="warn" className="mb-3">Draft – not yet posted to ledgers.</Alert>}
      {j.reversedBy && <Alert tone="info" className="mb-3">This voucher has been reversed.</Alert>}
      <VoucherPrint title={title} number={j.number} date={j.date} narration={j.narration} lines={j.lines} chart={chart} />
    </Modal>
  )
}

function VoucherEditor({ init, chart, onClose }) {
  const postJournal = useStore((s) => s.postJournal)
  const updateDraft = useStore((s) => s.updateDraftJournal)
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const [type, setType] = useState(init.type || 'JOURNAL')
  const [date, setDate] = useState(init.date || today())
  const [narration, setNarration] = useState(init.narration || '')
  const [lines, setLines] = useState(init.lines?.length ? init.lines.map((l) => ({ ...l })) : [{ accountId: '', dr: '', cr: '' }, { accountId: '', dr: '', cr: '' }])
  const cashBank = (a) => ['Bank Accounts', 'Cash-in-Hand'].includes(a.subgroup)
  const opts = useMemo(() => accountOptions(chart, type === 'CONTRA' ? cashBank : undefined), [chart, type])
  const partyOpts = { DEALER: partners.filter((p) => p.status === 'ACTIVE').map((p) => ({ value: p.id, label: p.name, sub: p.city })), VENDOR: vendors.map((v) => ({ value: v.id, label: v.name, sub: v.type })) }
  const dr = round2(sum(lines, (l) => Number(l.dr) || 0)), cr = round2(sum(lines, (l) => Number(l.cr) || 0))
  const diff = round2(dr - cr)
  const upd = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch, ...(patch.accountId ? { partyType: PARTY_ACC[patch.accountId] || null, partyId: null } : {}) } : l)))
  const hint = { JOURNAL: 'Adjustments, provisions, reclassifications', CONTRA: 'Bank ↔ bank / cash transfers only', PAYMENT: 'Money going out of a bank or cash ledger', RECEIPT: 'Money coming into a bank or cash ledger' }[type]
  const valid = () => {
    const ls = lines.filter((l) => l.accountId && (Number(l.dr) > 0 || Number(l.cr) > 0))
    if (ls.length < 2) return 'Add at least two ledger lines'
    if (ls.some((l) => Number(l.dr) > 0 && Number(l.cr) > 0)) return 'A line cannot have both debit and credit'
    if (Math.abs(diff) > 0.009) return `Debit and credit differ by ${fmtINR(Math.abs(diff), true)}`
    if (['PAYMENT', 'RECEIPT'].includes(type) && !ls.some((l) => cashBank(chart.find((a) => a.id === l.accountId) || {}))) return `${JTYPE_LABEL[type]} voucher needs a bank or cash ledger`
    if (ls.some((l) => PARTY_ACC[l.accountId] && !l.partyId)) return 'Select the party for debtor/creditor lines'
    return null
  }
  const save = (draft) => {
    const err = draft ? null : valid()
    if (err) return toast.error(err)
    if (!narration.trim()) return toast.error('Narration is required')
    if (init.id && init.status === 'DRAFT') {
      updateDraft(init.id, { type, date, narration, lines: lines.map((l) => ({ ...l, dr: Number(l.dr) || 0, cr: Number(l.cr) || 0 })) })
      if (draft) { toast.success('Draft updated'); return onClose() }
      const r = useStore.getState().postDraftJournal(init.id)
      if (!r.ok) return toast.error(r.error)
      toast.success('Voucher posted', r.number)
      return onClose()
    }
    const r = postJournal({ type, date, narration, lines, draft })
    if (!r.ok) return toast.error(r.error)
    toast.success(draft ? 'Saved as draft' : 'Voucher posted', r.journal.number)
    onClose()
  }
  return (
    <Modal open size="xl" onClose={onClose} title={init.id ? `Edit ${init.number}` : 'New voucher'} subtitle={hint}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" icon={Save} onClick={() => save(true)}>Save draft</Button><Button icon={Send} onClick={() => save(false)} disabled={Math.abs(diff) > 0.009}>Post voucher</Button></>}>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-4">
        <Segmented value={type} onChange={setType} options={Object.entries(JTYPE_LABEL).map(([key, label]) => ({ key, label }))} />
        <Field label="Voucher date" className="sm:w-44"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Ledger</th><th className="text-left px-3 py-2 w-56">Party</th><th className="text-right px-3 py-2 w-36">Debit (₹)</th><th className="text-right px-3 py-2 w-36">Credit (₹)</th><th className="w-10" /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-2 py-1.5"><Combobox options={opts} value={l.accountId} onChange={(v) => upd(i, { accountId: v })} placeholder="Select ledger…" /></td>
                <td className="px-2 py-1.5">{PARTY_ACC[l.accountId] ? <Combobox options={partyOpts[PARTY_ACC[l.accountId]]} value={l.partyId} onChange={(v) => upd(i, { partyId: v })} placeholder={PARTY_ACC[l.accountId] === 'DEALER' ? 'Select dealer…' : 'Select vendor…'} /> : <span className="text-xs text-slate-300 px-2">—</span>}</td>
                <td className="px-2 py-1.5"><NumberInput min={0} step="0.01" value={l.dr} onChange={(v) => upd(i, { dr: v, cr: v ? '' : l.cr })} className="text-right" /></td>
                <td className="px-2 py-1.5"><NumberInput min={0} step="0.01" value={l.cr} onChange={(v) => upd(i, { cr: v, dr: v ? '' : l.dr })} className="text-right" /></td>
                <td className="px-1"><IconButton icon={Trash2} tone="danger" title="Remove line" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, j) => j !== i))} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td className="px-2 py-2"><Button size="sm" variant="ghost" icon={Plus} onClick={() => setLines([...lines, { accountId: '', dr: diff < 0 ? -diff : '', cr: diff > 0 ? diff : '' }])}>Add line</Button></td>
              <td className="px-3 py-2 text-right text-xs text-slate-500">Totals</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtINR(dr, true)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtINR(cr, true)}</td><td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-2 text-sm">{Math.abs(diff) > 0.009 ? <Badge tone="red">Difference {fmtINR(Math.abs(diff), true)} {diff > 0 ? '(debit higher)' : '(credit higher)'}</Badge> : dr > 0 ? <Badge tone="green">Balanced</Badge> : null}</div>
      <Field label="Narration" required className="mt-3"><Textarea rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Being …" /></Field>
    </Modal>
  )
}
