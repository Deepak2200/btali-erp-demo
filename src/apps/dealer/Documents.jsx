import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, Truck, Download, Mail, Receipt, BookOpen, PackageCheck } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, StatusBadge, Tabs, Modal, Input, Field, EmptyState, Grid, Stat, toast, openAttachment } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { PrintArea, DocHeader } from '../../components/business'
import { fmtINR, fmtDate, sum, round2, exportCSV, daysAgo, today } from '../../lib/format'
import { usePortal, InvoiceDoc, LRDoc } from './_portal'
import { AckModal } from './Orders'

export default function Documents() {
  const [sp, setSp] = useSearchParams()
  const { partnerId, partner } = usePortal()
  const allInvoices = useStore((s) => s.invoices)
  const allReceipts = useStore((s) => s.receipts)
  const allNotes = useStore((s) => s.notes)
  const transporters = useStore((s) => s.transporters)
  const salesOrders = useStore((s) => s.salesOrders)
  const emailDoc = useStore((s) => s.emailPartnerDocument)
  const [tab, setTab] = useState(sp.get('tab') || 'invoices')
  const [doc, setDoc] = useState(null) // {kind, inv}
  const [ack, setAck] = useState(null)
  const invoices = useMemo(() => allInvoices.filter((i) => i.partnerId === partnerId).sort((a, b) => b.date.localeCompare(a.date)), [allInvoices, partnerId])
  const receipts = useMemo(() => allReceipts.filter((r) => r.partnerId === partnerId), [allReceipts, partnerId])
  const notes = useMemo(() => (allNotes || []).filter((n) => n.partnerId === partnerId), [allNotes, partnerId])
  const lrs = invoices.filter((i) => i.lr)
  const tr = (id) => transporters.find((t) => t.id === id)
  const soNo = (id) => salesOrders.find((s) => s.id === id)?.number

  const invParam = sp.get('inv')
  const paramInv = invParam && invoices.find((i) => i.id === invParam)
  const shown = doc || (paramInv ? { kind: 'inv', inv: paramInv } : null)
  const closeDoc = () => { setDoc(null); if (invParam) { const n = new URLSearchParams(sp); n.delete('inv'); setSp(n, { replace: true }) } }

  const resend = (inv) => {
    emailDoc(partnerId, { subject: `Invoice copy ${inv.number} – Btali International`, body: `Dear ${partner.contact},\n\nAs requested, please find attached a copy of invoice ${inv.number} dated ${fmtDate(inv.date)} for ${fmtINR(inv.total)}.${inv.lr ? `\nLR No. ${inv.lr.number}.` : ''}\n\nRegards,\nBtali Accounts`, fileName: `${inv.number.replace(/\//g, '-')}.pdf`, ref: inv.number })
    toast.success('Invoice emailed', `Copy sent to ${partner.email}`)
  }

  return (
    <div>
      <PageHeader title="Documents" subtitle="Invoices, LR copies, credit notes and statement of account" />
      <Grid cols={4} className="mb-4">
        <Stat icon={FileText} tone="ink" label="Invoices" value={invoices.length} sub={`${fmtINR(sum(invoices, (i) => i.total))} billed`} />
        <Stat icon={Truck} tone="blue" label="LR copies" value={lrs.length} />
        <Stat icon={Receipt} tone="green" label="Payments" value={fmtINR(sum(receipts, (r) => r.amount))} sub={`${receipts.length} receipts`} />
        <Stat icon={BookOpen} tone="violet" label="Notes" value={notes.length} />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'invoices', label: 'Invoices', count: invoices.length }, { key: 'lr', label: 'LR copies', count: lrs.length }, { key: 'notes', label: 'Credit notes', count: notes.length }, { key: 'soa', label: 'Statement of account' }]} />

      {tab === 'invoices' && (
        <DataTable rows={invoices} exportName={`Invoices-${partner?.code}`} initialSort={{ key: 'date', dir: 'desc' }} onRowClick={(i) => setDoc({ kind: 'inv', inv: i })}
          columns={[
            { key: 'number', header: 'Invoice', render: (i) => <span className="font-mono font-medium">{i.number}</span> },
            { key: 'date', header: 'Date', render: (i) => fmtDate(i.date) },
            { key: 'so', header: 'Order', value: (i) => soNo(i.soId) || '', render: (i) => <span className="font-mono text-xs">{soNo(i.soId) || '—'}</span> },
            { key: 'total', header: 'Amount', align: 'right', render: (i) => <span className="tabular-nums">{fmtINR(i.total)}</span> },
            { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.inward?.acknowledged ? 'RECEIVED' : i.status} /> },
            { key: 'act', header: '', sortable: false, export: false, render: (i) => (
              <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="secondary" icon={Download} onClick={() => setDoc({ kind: 'inv', inv: i })}>View</Button>
                <Button size="sm" variant="ghost" icon={Mail} onClick={() => resend(i)}>Email</Button>
                {(i.status === 'DISPATCHED' || i.lr) && !i.inward?.acknowledged && !i.history && <Button size="sm" icon={PackageCheck} onClick={() => setAck(i)}>Acknowledge</Button>}
              </div>
            ) },
          ]} />
      )}
      {tab === 'lr' && (
        <DataTable rows={lrs} exportName={`LR-${partner?.code}`} initialSort={{ key: 'lrdate', dir: 'desc' }} onRowClick={(i) => setDoc({ kind: 'lr', inv: i })}
          empty={<EmptyState icon={Truck} title="No LR copies yet" />}
          columns={[
            { key: 'lr', header: 'LR no.', value: (i) => i.lr.number, render: (i) => <span className="font-mono font-medium">{i.lr.number}</span> },
            { key: 'lrdate', header: 'Dispatched', value: (i) => i.lr.date, render: (i) => fmtDate(i.lr.date) },
            { key: 'number', header: 'Invoice', render: (i) => <span className="font-mono text-xs">{i.number}</span> },
            { key: 'tr', header: 'Transporter', value: (i) => tr(i.transporterId)?.name || '' },
            { key: 'veh', header: 'Vehicle', value: (i) => i.lr.vehicleNo || i.vehicleNo || tr(i.transporterId)?.vehicleNo || '' },
            { key: 'act', header: '', sortable: false, export: false, render: (i) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><Button size="sm" variant="secondary" icon={Download} onClick={() => (i.lr.file?.url ? openAttachment(i.lr.file) : setDoc({ kind: 'lr', inv: i }))}>LR copy</Button></div> },
          ]} />
      )}
      {tab === 'notes' && (
        <DataTable rows={notes} exportName={`Notes-${partner?.code}`} initialSort={{ key: 'date', dir: 'desc' }} onRowClick={(n) => setDoc({ kind: 'note', note: n })}
          empty={<EmptyState icon={BookOpen} title="No credit or debit notes" message="Credit notes for returns, schemes and discrepancies appear here." />}
          columns={[
            { key: 'number', header: 'Note', render: (n) => <span className="font-mono font-medium">{n.number}</span> },
            { key: 'type', header: 'Type', render: (n) => <Badge tone={n.type === 'CREDIT' ? 'green' : 'amber'}>{n.type === 'CREDIT' ? 'Credit note' : 'Debit note'}</Badge> },
            { key: 'date', header: 'Date', render: (n) => fmtDate(n.date) },
            { key: 'reason', header: 'Reason' },
            { key: 'amount', header: 'Amount', align: 'right', value: (n) => (n.amount || 0) + (n.gst || 0), render: (n) => <span className="tabular-nums">{fmtINR((n.amount || 0) + (n.gst || 0))}</span> },
          ]} />
      )}
      {tab === 'soa' && <Statement partner={partner} invoices={invoices} receipts={receipts} notes={notes} />}

      <Modal open={!!shown} onClose={closeDoc} size="lg" title={shown?.kind === 'lr' ? `LR copy – ${shown?.inv?.lr?.number}` : shown?.kind === 'note' ? shown.note.number : `Invoice ${shown?.inv?.number}`}>
        {shown?.kind === 'inv' && <InvoiceDoc inv={shown.inv} partner={partner} transporter={tr(shown.inv.transporterId)} />}
        {shown?.kind === 'lr' && <LRDoc inv={shown.inv} partner={partner} transporter={tr(shown.inv.transporterId)} />}
        {shown?.kind === 'note' && (
          <PrintArea title={shown.note.number}>
            <DocHeader title={shown.note.type === 'CREDIT' ? 'Credit note' : 'Debit note'} number={shown.note.number} date={shown.note.date} />
            <div className="text-sm space-y-2">
              <div><span className="text-slate-500">Party: </span><b>{partner?.name}</b>, {partner?.city} · GSTIN {partner?.gstin}</div>
              <div><span className="text-slate-500">Reason: </span>{shown.note.reason}</div>
              <div className="border-t border-slate-200 pt-2 flex justify-between"><span>Taxable value</span><span className="tabular-nums">{fmtINR(shown.note.amount)}</span></div>
              <div className="flex justify-between"><span>GST</span><span className="tabular-nums">{fmtINR(shown.note.gst || 0)}</span></div>
              <div className="flex justify-between font-bold"><span>Total</span><span className="tabular-nums">{fmtINR((shown.note.amount || 0) + (shown.note.gst || 0))}</span></div>
            </div>
          </PrintArea>
        )}
      </Modal>
      {ack && <AckModal inv={ack} onClose={() => setAck(null)} />}
    </div>
  )
}

function Statement({ partner, invoices, receipts, notes }) {
  const [from, setFrom] = useState(daysAgo(90))
  const [to, setTo] = useState(today())
  const rows = useMemo(() => {
    const all = [
      ...invoices.map((i) => ({ date: i.date, ref: i.number, particulars: 'Sales invoice', debit: i.total, credit: 0 })),
      ...receipts.map((r) => ({ date: r.date, ref: r.number, particulars: `Payment received – ${r.mode} ${r.ref || ''}`, debit: 0, credit: r.amount })),
      ...notes.map((n) => ({ date: n.date, ref: n.number, particulars: `${n.type === 'CREDIT' ? 'Credit' : 'Debit'} note – ${n.reason || ''}`, debit: n.type === 'DEBIT' ? (n.amount || 0) + (n.gst || 0) : 0, credit: n.type === 'CREDIT' ? (n.amount || 0) + (n.gst || 0) : 0 })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (b.debit - a.debit))
    const before = all.filter((r) => r.date < from)
    let bal = round2(sum(before, (r) => r.credit - r.debit))
    const opening = bal
    const out = all.filter((r) => r.date >= from && r.date <= to).map((r) => { bal = round2(bal + r.credit - r.debit); return { ...r, balance: bal } })
    return { opening, rows: out, closing: bal }
  }, [invoices, receipts, notes, from, to])
  const balLabel = (v) => `${fmtINR(Math.abs(v))} ${v > 0.5 ? 'Cr' : v < -0.5 ? 'Dr' : ''}`
  const csv = () => exportCSV(`Statement-${partner?.code}-${from}-to-${to}.csv`, [{ date: from, ref: '', particulars: 'Opening balance', debit: '', credit: '', balance: rows.opening }, ...rows.rows], [
    { header: 'Date', value: (r) => r.date }, { header: 'Reference', value: (r) => r.ref }, { header: 'Particulars', value: (r) => r.particulars }, { header: 'Debit', value: (r) => r.debit || '' }, { header: 'Credit', value: (r) => r.credit || '' }, { header: 'Balance (Cr+/Dr-)', value: (r) => r.balance },
  ])
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="flex gap-2 sm:ml-auto"><Button variant="secondary" icon={Download} onClick={csv}>Download CSV</Button></div>
        </div>
      </Card>
      <PrintArea title={`Statement ${partner?.code}`}>
        <DocHeader title="Statement of account" number={partner?.code} right={<div className="text-xs text-slate-500">{fmtDate(from)} – {fmtDate(to)}</div>} />
        <div className="text-sm mb-3"><b>{partner?.name}</b>, {partner?.city} · GSTIN {partner?.gstin || '—'}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr><th className="text-left px-2 py-2">Date</th><th className="text-left px-2 py-2">Reference</th><th className="text-left px-2 py-2">Particulars</th><th className="text-right px-2 py-2">Debit</th><th className="text-right px-2 py-2">Credit</th><th className="text-right px-2 py-2">Balance</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50/50"><td className="px-2 py-1.5">{fmtDate(from)}</td><td /><td className="px-2 py-1.5 font-medium">Opening balance</td><td /><td /><td className="px-2 py-1.5 text-right tabular-nums">{balLabel(rows.opening)}</td></tr>
              {rows.rows.map((r, i) => (
                <tr key={i}><td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(r.date)}</td><td className="px-2 py-1.5 font-mono text-xs">{r.ref}</td><td className="px-2 py-1.5">{r.particulars}</td><td className="px-2 py-1.5 text-right tabular-nums">{r.debit ? fmtINR(r.debit) : ''}</td><td className="px-2 py-1.5 text-right tabular-nums">{r.credit ? fmtINR(r.credit) : ''}</td><td className="px-2 py-1.5 text-right tabular-nums">{balLabel(r.balance)}</td></tr>
              ))}
              <tr className="font-bold bg-slate-50"><td className="px-2 py-2" colSpan={3}>Closing balance</td><td className="px-2 py-2 text-right tabular-nums">{fmtINR(sum(rows.rows, (r) => r.debit))}</td><td className="px-2 py-2 text-right tabular-nums">{fmtINR(sum(rows.rows, (r) => r.credit))}</td><td className="px-2 py-2 text-right tabular-nums">{balLabel(rows.closing)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-slate-500 mt-3">Cr = advance lying with Btali · Dr = amount payable to Btali. Advances against orders not yet invoiced appear as credit balance.</div>
      </PrintArea>
    </div>
  )
}
