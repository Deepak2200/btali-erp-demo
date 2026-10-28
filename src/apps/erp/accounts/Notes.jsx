import React, { useMemo, useState } from 'react'
import { Plus, ScrollText, Truck, Mail, Ban, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Grid, Stat, Tabs, Button, Badge, StatusBadge, Modal, FormGrid, Field, Input, NumberInput, Select, Combobox, Textarea, Switch, toast, prompt, Segmented } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PrintArea, DocHeader } from '../../../components/business'
import { fmtINR, fmtDate, today, sum, round2 } from '../../../lib/format'
import { noteTotal, isIntraState, splitGst } from './_books'

const SRC = { SAFEX: ['Safex pickup', 'amber'], RETURN: ['Sales return', 'teal'], DISCREPANCY: ['Inward discrepancy', 'red'], MANUAL: ['Manual', 'gray'] }

export default function Notes() {
  const notes = useStore((s) => s.notes) || []
  const invoices = useStore((s) => s.invoices)
  const { partner, vendor } = useLookup()
  const [tab, setTab] = useState('ALL')
  const [create, setCreate] = useState(false)
  const [view, setView] = useState(null)
  const live = notes.filter((n) => n.status !== 'CANCELLED')
  const cn = live.filter((n) => n.type === 'CREDIT'), dn = live.filter((n) => n.type === 'DEBIT'), sfx = live.filter((n) => n.source === 'SAFEX')
  const rows = tab === 'ALL' ? notes : tab === 'SAFEX' ? notes.filter((n) => n.source === 'SAFEX') : notes.filter((n) => n.type === tab)
  const partyName = (n) => (n.partnerId ? partner(n.partnerId)?.name : vendor(n.vendorId)?.name)
  return (
    <div>
      <PageHeader title="Credit & Debit Notes" subtitle="Against invoices, dealers or vendors · Safex pickup debit notes raised by Dispatch appear automatically" actions={<Button icon={Plus} onClick={() => setCreate(true)}>New note</Button>} />
      <Grid cols={4} className="mb-5">
        <Stat icon={ArrowDownLeft} tone="green" label="Credit notes (FY)" value={fmtINR(sum(cn, noteTotal))} sub={`${cn.length} notes`} onClick={() => setTab('CREDIT')} />
        <Stat icon={ArrowUpRight} tone="brand" label="Debit notes (FY)" value={fmtINR(sum(dn, noteTotal))} sub={`${dn.length} notes`} onClick={() => setTab('DEBIT')} />
        <Stat icon={Truck} tone="amber" label="Safex pickup debit notes" value={fmtINR(sum(sfx, noteTotal))} sub={`${sfx.length} notes`} onClick={() => setTab('SAFEX')} />
        <Stat icon={ScrollText} tone="ink" label="GST adjusted via notes" value={fmtINR(sum(dn, (n) => n.gst || 0) - sum(cn, (n) => n.gst || 0))} sub="net output tax impact" />
      </Grid>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ key: 'ALL', label: 'All', count: notes.length }, { key: 'CREDIT', label: 'Credit notes', count: notes.filter((n) => n.type === 'CREDIT').length }, { key: 'DEBIT', label: 'Debit notes', count: notes.filter((n) => n.type === 'DEBIT').length }, { key: 'SAFEX', label: 'Safex', count: notes.filter((n) => n.source === 'SAFEX').length }]} />
      <DataTable rows={rows} onRowClick={setView} exportName="credit-debit-notes" initialSort={{ key: 'date', dir: 'desc' }}
        columns={[
          { key: 'number', header: 'Note no.', render: (n) => <span className="font-medium">{n.number}</span> },
          { key: 'date', header: 'Date', render: (n) => fmtDate(n.date) },
          { key: 'type', header: 'Type', render: (n) => <Badge tone={n.type === 'CREDIT' ? 'green' : 'brand'}>{n.type === 'CREDIT' ? 'Credit' : 'Debit'}</Badge> },
          { key: 'party', header: 'Party', value: partyName, render: (n) => <div><div>{partyName(n)}</div><div className="text-[11px] text-slate-500">{n.partnerId ? 'Dealer' : 'Vendor'}</div></div> },
          { key: 'against', header: 'Against', value: (n) => invoices.find((i) => i.id === n.invoiceId)?.number || '', render: (n) => invoices.find((i) => i.id === n.invoiceId)?.number || <span className="text-slate-300">—</span> },
          { key: 'source', header: 'Source', render: (n) => <Badge tone={(SRC[n.source] || SRC.MANUAL)[1]}>{(SRC[n.source] || SRC.MANUAL)[0]}</Badge> },
          { key: 'reason', header: 'Reason', render: (n) => <div className="max-w-xs truncate text-xs text-slate-600" title={n.reason}>{n.reason}</div> },
          { key: 'amount', header: 'Taxable', align: 'right', render: (n) => fmtINR(n.amount, true) },
          { key: 'gst', header: 'GST', align: 'right', render: (n) => fmtINR(n.gst || 0, true) },
          { key: 'total', header: 'Total', align: 'right', value: noteTotal, render: (n) => <b>{fmtINR(noteTotal(n), true)}</b> },
          { key: 'status', header: 'Status', render: (n) => <StatusBadge status={n.status} /> },
        ]} />
      {create && <NoteForm onClose={() => setCreate(false)} />}
      {view && <NoteView id={view.id} onClose={() => setView(null)} />}
    </div>
  )
}

function NoteView({ id, onClose }) {
  const n = useStore((s) => (s.notes || []).find((x) => x.id === id))
  const inv = useStore((s) => s.invoices.find((x) => x.id === n?.invoiceId))
  const { partner, vendor } = useLookup()
  const { emailNote, cancelNote } = useStore.getState()
  if (!n) return null
  const party = n.partnerId ? partner(n.partnerId) : vendor(n.vendorId)
  const intra = isIntraState(party?.gstin || party?.gst || party?.state)
  const heads = splitGst(n.gst || 0, intra)
  return (
    <Modal open size="lg" onClose={onClose} title={`${n.type === 'CREDIT' ? 'Credit' : 'Debit'} note ${n.number}`}
      footer={<>
        {n.status !== 'CANCELLED' && <Button variant="secondary" icon={Ban} onClick={async () => { const r = await prompt({ title: `Cancel ${n.number}?`, label: 'Reason', required: true, tone: 'danger', confirmText: 'Cancel note' }); if (r === null) return; cancelNote(n.id, r); toast.success('Note cancelled'); onClose() }}>Cancel note</Button>}
        <Button variant="secondary" icon={Mail} onClick={() => { emailNote(n.id); toast.success('Emailed', party?.email) }}>Email to party</Button>
      </>}>
      <PrintArea title={n.number}>
        <DocHeader title={`${n.type === 'CREDIT' ? 'Credit' : 'Debit'} Note`} number={n.number} date={n.date} right={n.status === 'CANCELLED' && <div className="text-red-600 font-bold mt-1">CANCELLED</div>} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-4">
          <div><div className="text-xs text-slate-500 uppercase">{n.type === 'CREDIT' ? 'Issued to' : 'Debited to'}</div><div className="font-semibold">{party?.name}</div><div className="text-slate-600">{party?.address || `${party?.city || ''}${party?.state ? `, ${party.state}` : ''}`}</div><div className="text-slate-600">GSTIN: {party?.gstin || party?.gst || 'Unregistered / overseas'}</div></div>
          <div className="sm:text-right"><div className="text-xs text-slate-500 uppercase">Reference</div><div>{inv ? `Original invoice ${inv.number} dated ${fmtDate(inv.date)}` : 'Not linked to an invoice'}</div><div className="text-slate-600">Place of supply: {party?.state || party?.country || 'Maharashtra'}</div></div>
        </div>
        <table className="w-full text-sm border border-slate-200">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Particulars</th><th className="text-right px-3 py-2 w-40">Amount (₹)</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="px-3 py-2">{n.reason}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(n.amount, true)}</td></tr>
            {heads.map(([h, a]) => <tr key={h}><td className="px-3 py-2 text-slate-600">{h === 'C' ? 'CGST' : h === 'S' ? 'SGST' : 'IGST'} @ {h === 'I' ? n.gstRate : (n.gstRate || 0) / 2}%</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(a, true)}</td></tr>)}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold"><tr><td className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(noteTotal(n), true)}</td></tr></tfoot>
        </table>
        <div className="text-xs text-slate-500 mt-3">Source: {(SRC[n.source] || SRC.MANUAL)[0]}{n.source === 'SAFEX' ? ' – Safex Transport collected the consignment directly from Btali; pickup charges recovered from the dealer.' : ''}</div>
        <div className="mt-10 text-xs text-right text-slate-500">For Btali International Pvt. Ltd.<br /><br />Authorised signatory</div>
      </PrintArea>
    </Modal>
  )
}

function NoteForm({ onClose }) {
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const invoices = useStore((s) => s.invoices)
  const bills = useStore((s) => s.vendorBills) || []
  const createNote = useStore((s) => s.createNote)
  const [f, setF] = useState({ type: 'CREDIT', side: 'DEALER', partnerId: '', vendorId: '', invoiceId: '', billId: '', amount: '', gstRate: 18, reason: '', source: 'MANUAL', date: today(), email: true })
  const invs = useMemo(() => invoices.filter((i) => i.partnerId === f.partnerId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40), [invoices, f.partnerId])
  const vb = bills.filter((b) => b.vendorId === f.vendorId)
  const gst = round2((Number(f.amount) || 0) * f.gstRate / 100)
  const save = () => {
    if (f.side === 'DEALER' ? !f.partnerId : !f.vendorId) return toast.error('Select the party')
    if (!(Number(f.amount) > 0)) return toast.error('Enter the amount')
    if (!f.reason.trim()) return toast.error('Reason is required')
    const n = createNote({ ...f, partnerId: f.side === 'DEALER' ? f.partnerId : null, vendorId: f.side === 'VENDOR' ? f.vendorId : null, invoiceId: f.side === 'DEALER' ? f.invoiceId || null : null, billId: f.side === 'VENDOR' ? f.billId || null : null, amount: Number(f.amount) })
    toast.success(`${n.type === 'CREDIT' ? 'Credit' : 'Debit'} note ${n.number} issued`, f.email ? 'Emailed to the party' : undefined)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="New credit / debit note" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Issue note · {fmtINR((Number(f.amount) || 0) + gst, true)}</Button></>}>
      <div className="flex flex-wrap gap-3 mb-4">
        <Segmented value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[{ key: 'CREDIT', label: 'Credit note' }, { key: 'DEBIT', label: 'Debit note' }]} />
        <Segmented value={f.side} onChange={(v) => setF({ ...f, side: v, gstRate: v === 'VENDOR' ? 0 : 18 })} options={[{ key: 'DEALER', label: 'Dealer' }, { key: 'VENDOR', label: 'Vendor' }]} />
      </div>
      <FormGrid>
        {f.side === 'DEALER' ? <>
          <Field label="Dealer" required><Combobox value={f.partnerId} onChange={(v) => setF({ ...f, partnerId: v, invoiceId: '' })} options={partners.filter((p) => p.status === 'ACTIVE').map((p) => ({ value: p.id, label: p.name, sub: `${p.city} · ${p.gstin}` }))} /></Field>
          <Field label="Against invoice"><Select value={f.invoiceId} onChange={(e) => setF({ ...f, invoiceId: e.target.value })} placeholder={f.partnerId ? 'Not linked' : 'Select dealer first'} options={invs.map((i) => ({ value: i.id, label: `${i.number} · ${fmtDate(i.date)} · ${fmtINR(i.total)}` }))} /></Field>
        </> : <>
          <Field label="Vendor" required><Combobox value={f.vendorId} onChange={(v) => setF({ ...f, vendorId: v, billId: '' })} options={vendors.map((v) => ({ value: v.id, label: v.name, sub: v.type }))} /></Field>
          <Field label="Against bill"><Select value={f.billId} onChange={(e) => setF({ ...f, billId: e.target.value })} placeholder="Not linked" options={vb.map((b) => ({ value: b.id, label: `${b.number} · ${b.vendorRef}` }))} /></Field>
        </>}
        <Field label="Source"><Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} options={Object.entries(SRC).map(([value, [label]]) => ({ value, label }))} /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Taxable amount (₹)" required><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="GST rate" hint={`GST ${fmtINR(gst, true)}`}><Select value={String(f.gstRate)} onChange={(e) => setF({ ...f, gstRate: Number(e.target.value) })} options={[0, 5, 12, 18, 28].map((r) => ({ value: String(r), label: r ? `${r}%` : 'Nil' }))} /></Field>
        <Field label="Reason" required className="md:col-span-2"><Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Rate difference on invoice / short supply / scheme discount" /></Field>
        <Switch checked={f.email} onChange={(v) => setF({ ...f, email: v })} label="Email the note to the party" />
      </FormGrid>
    </Modal>
  )
}
