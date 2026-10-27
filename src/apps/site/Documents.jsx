import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, AlertCircle, Truck, Download } from 'lucide-react'
import { useStore } from '../../store'
import { Field, Input, Badge, Segmented } from '../../components/ui'
import { PrintArea, DocHeader, OrderLines } from '../../components/business'
import { fmtDate, fmtINR, downloadText } from '../../lib/format'
import { findPublicInvoice } from '../../store/slices/service'
import { SiteHero } from './Warranty'

export default function Documents() {
  const invoices = useStore((s) => s.invoices)
  const transporters = useStore((s) => s.transporters)
  const company = useStore((s) => s.settings.company)
  const [params, setParams] = useSearchParams()
  const [no, setNo] = useState(params.get('inv') || '')
  const [key, setKey] = useState(params.get('key') || '')
  const [doc, setDoc] = useState('INV')
  const res = useMemo(() => (params.get('inv') ? findPublicInvoice({ ...useStore.getState(), invoices }, params.get('inv'), params.get('key')) : null), [params, invoices])
  const inv = res?.ok ? res.invoice : null
  const p = res?.partner
  const tr = inv && transporters.find((t) => t.id === inv.transporterId)
  const qty = inv ? inv.lines.reduce((a, l) => a + l.qty, 0) : 0

  const downloadLR = () => {
    const txt = `LORRY RECEIPT – COPY\n\nLR No: ${inv.lr.number}\nDate: ${fmtDate(inv.lr.date)}\nTransporter: ${tr?.name || ''}\nVehicle: ${inv.lr.vehicleNo || inv.vehicleNo || ''}\n\nConsignor: ${company.legalName}, ${company.address}\nConsignee: ${p.name}, ${p.address}, ${p.state}\nInvoice: ${inv.number} dated ${fmtDate(inv.date)}\nPackages: ${qty}\nInvoice value: ${fmtINR(inv.total)}\nE-way bill: ${inv.ewayBill || ''}\n`
    downloadText(`LR-${inv.lr.number}.txt`, txt)
  }

  return (
    <div className="bg-slate-50 min-h-full">
      <SiteHero icon={FileText} title="Invoice & LR download" text="Dealers and customers can download a copy of their tax invoice and transport LR using the invoice number and registered mobile number or GSTIN." />
      <div className="max-w-4xl mx-auto px-4 -mt-6 pb-14">
        <form onSubmit={(e) => { e.preventDefault(); setParams({ inv: no.trim(), key: key.trim() }); setDoc('INV') }} className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Field label="Invoice number"><Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="BT/26-27/0001" className="font-mono uppercase placeholder:normal-case" /></Field>
          <Field label="Registered mobile or GSTIN"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="98XXXXXXXX or 27ABCDE1234F1Z5" className="uppercase placeholder:normal-case" /></Field>
          <button className="bg-ink-900 hover:bg-ink-800 text-white font-semibold px-5 py-2 rounded-lg h-[38px] disabled:opacity-50" disabled={!no.trim() || !key.trim()}>Find</button>
        </form>

        {res && !res.ok && <div className="mt-5 bg-white rounded-2xl border border-red-200 p-5 flex gap-3"><AlertCircle className="w-5 h-5 text-red-500 shrink-0" /><div className="text-sm text-slate-700">{res.error}</div></div>}

        {inv && (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <Segmented value={doc} onChange={setDoc} options={[{ key: 'INV', label: 'Tax invoice' }, { key: 'LR', label: 'LR copy' }]} />
              <div className="flex items-center gap-2 text-sm">
                <Badge tone={inv.status === 'DISPATCHED' ? 'teal' : 'violet'}>{inv.status === 'DISPATCHED' ? 'Dispatched' : 'Invoiced – awaiting dispatch'}</Badge>
                {doc === 'LR' && inv.lr && <button type="button" onClick={downloadLR} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 bg-white rounded-lg px-2.5 py-1.5"><Download className="w-3.5 h-3.5" />Download LR</button>}
              </div>
            </div>
            {doc === 'INV' ? (
              <PrintArea title={`Invoice ${inv.number}`}>
                <DocHeader title="Tax Invoice" number={inv.number} date={inv.date} right={<div className="text-[11px] text-slate-500 mt-1">IRN {inv.irn}<br />E-way bill {inv.ewayBill}</div>} />
                <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
                  <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Bill to</div><div className="font-semibold">{p.name}</div><div className="text-slate-600 text-xs">{p.address}, {p.state}<br />GSTIN {p.gstin}</div></div>
                  <div className="sm:text-right"><div className="text-[11px] uppercase tracking-wide text-slate-400">Dispatch</div><div className="text-xs text-slate-600">{tr?.name || '—'}{inv.vehicleNo ? ` · ${inv.vehicleNo}` : ''}<br />{inv.lr ? `LR ${inv.lr.number} · ${fmtDate(inv.lr.date)}` : 'LR awaited'}</div></div>
                </div>
                <OrderLines lines={inv.lines} subtotal={inv.subtotal} gst={inv.gst} total={inv.total} />
                <div className="mt-6 flex justify-between text-[11px] text-slate-500"><span>This is a computer-generated invoice.</span><span>For {company.legalName}</span></div>
              </PrintArea>
            ) : inv.lr ? (
              <PrintArea title={`LR ${inv.lr.number}`}>
                <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-4">
                  <div><div className="text-lg font-bold text-ink-900 flex items-center gap-2"><Truck className="w-5 h-5 text-brand-500" />{tr?.name || 'Transporter'}</div><div className="text-xs text-slate-500">Lorry receipt – consignee copy</div></div>
                  <div className="text-right"><div className="font-mono font-bold">{inv.lr.number}</div><div className="text-xs text-slate-500">{fmtDate(inv.lr.date)}</div></div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div><div className="text-[11px] uppercase text-slate-400">Consignor</div><div className="font-semibold">{company.legalName}</div><div className="text-xs text-slate-600">{company.address}</div></div>
                  <div><div className="text-[11px] uppercase text-slate-400">Consignee</div><div className="font-semibold">{p.name}</div><div className="text-xs text-slate-600">{p.address}, {p.state}</div></div>
                </div>
                <table className="w-full text-sm mt-5 border border-slate-200">
                  <tbody className="divide-y divide-slate-100">
                    {[['Invoice', `${inv.number} dated ${fmtDate(inv.date)}`], ['Packages', `${qty} nos.`], ['Declared value', fmtINR(inv.total)], ['Vehicle', inv.lr.vehicleNo || inv.vehicleNo || '—'], ['E-way bill', inv.ewayBill], ['Freight', 'To pay / as per contract']].map(([k, v]) => (
                      <tr key={k}><td className="px-3 py-2 text-slate-500 w-40">{k}</td><td className="px-3 py-2">{v}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-6 text-[11px] text-slate-500">Goods received in good condition for carriage at owner’s risk.</div>
              </PrintArea>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-600 flex gap-3"><Truck className="w-5 h-5 text-slate-400" />The LR copy will be available here as soon as the goods are dispatched. You will also receive it by email.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
