import React, { useMemo, useState } from 'react'
import { Percent, FileJson, Download, Plus, Pencil, Trash2, Zap, PlugZap, RefreshCw, CheckCircle2, Truck, Receipt, Landmark } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Tabs, Button, Badge, StatusBadge, Card, Grid, Stat, Modal, FormGrid, Field, Input, NumberInput, Select, Switch, KV, Alert, toast, confirm, IconButton, EmptyState, Progress } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { fmtINR, fmtDate, fmtDateTime, today, round2, sum, exportCSV, downloadText, lastMonths, monthLabel, groupBy } from '../../../lib/format'
import { isIntraState, splitGst, TDS_SECTIONS, quarterOf, panFromGstin, noteTotal } from './_books'
import { useBooks } from './_ui'

const prevMonth = () => lastMonths(2)[0]

export default function Tax() {
  const [tab, setTab] = useState('GSTR1')
  const [month, setMonth] = useState(prevMonth())
  const months = lastMonths(7).reverse()
  return (
    <div>
      <PageHeader title="GST, TDS & e-Invoicing" subtitle="GST rate master by HSN · GSTR-1 & GSTR-3B working · TDS register & challans · IRN and e-way bill connector"
        actions={['GSTR1', 'GSTR3B'].includes(tab) && <Select value={month} onChange={(e) => setMonth(e.target.value)} options={months.map((m) => ({ value: m, label: `Return period ${monthLabel(m)}` }))} className="w-56" />} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'GSTR1', label: 'GSTR-1' }, { key: 'GSTR3B', label: 'GSTR-3B' }, { key: 'TDS', label: 'TDS' }, { key: 'EINV', label: 'e-Invoice & e-Way bill' }, { key: 'RATES', label: 'GST rates (HSN)' }]} />
      {tab === 'GSTR1' && <Gstr1 month={month} />}
      {tab === 'GSTR3B' && <Gstr3b month={month} />}
      {tab === 'TDS' && <Tds />}
      {tab === 'EINV' && <EInvoice />}
      {tab === 'RATES' && <Rates />}
    </div>
  )
}

const fp = (m) => `${m.slice(5, 7)}${m.slice(0, 4)}`
const heads = (gst, intra) => { const h = { igst: 0, cgst: 0, sgst: 0 }; for (const [k, a] of splitGst(gst, intra)) h[k === 'I' ? 'igst' : k === 'C' ? 'cgst' : 'sgst'] = a; return h }

function useGstr1(month) {
  const invoices = useStore((s) => s.invoices)
  const notes = useStore((s) => s.notes) || []
  const partners = useStore((s) => s.partners)
  const products = useStore((s) => s.products)
  const gstin = useStore((s) => s.settings.company.gstin)
  return useMemo(() => {
    const pmap = new Map(partners.map((p) => [p.id, p]))
    const inv = invoices.filter((i) => i.date.slice(0, 7) === month && i.type !== 'FOC').map((i) => {
      const p = pmap.get(i.partnerId)
      const intra = isIntraState(p?.gstin || p?.state)
      return { ...i, party: p, ctin: p?.gstin || '', pos: (p?.gstin || '27').slice(0, 2), ...heads(i.type === 'EXPORT' ? 0 : i.gst, intra) }
    })
    const b2b = inv.filter((i) => i.ctin && i.type !== 'EXPORT')
    const exp = inv.filter((i) => i.type === 'EXPORT')
    const byGstin = Object.values(groupBy(b2b, 'ctin')).map((l) => ({ id: l[0].ctin, ctin: l[0].ctin, name: l[0].party?.name, count: l.length, taxable: round2(sum(l, (x) => x.subtotal)), igst: round2(sum(l, (x) => x.igst)), cgst: round2(sum(l, (x) => x.cgst)), sgst: round2(sum(l, (x) => x.sgst)), total: round2(sum(l, (x) => x.total)) }))
    const hsn = {}
    for (const i of inv) {
      const intra = isIntraState(i.party?.gstin || i.party?.state)
      for (const l of i.lines || []) {
        const pr = products.find((x) => x.id === l.productId)
        const k = `${pr?.hsn || '8413'}-${pr?.gst ?? 18}`
        const txval = l.amount ?? l.qty * l.price
        const tax = i.type === 'EXPORT' ? 0 : round2((txval * (pr?.gst ?? 18)) / 100)
        const h = heads(tax, intra)
        hsn[k] = hsn[k] || { id: k, hsn: pr?.hsn || '8413', desc: pr?.category, uqc: 'NOS', rate: pr?.gst ?? 18, qty: 0, txval: 0, igst: 0, cgst: 0, sgst: 0 }
        Object.assign(hsn[k], { qty: hsn[k].qty + l.qty, txval: round2(hsn[k].txval + txval), igst: round2(hsn[k].igst + h.igst), cgst: round2(hsn[k].cgst + h.cgst), sgst: round2(hsn[k].sgst + h.sgst) })
      }
    }
    const cdn = notes.filter((n) => n.partnerId && n.status !== 'CANCELLED' && (n.date || '').slice(0, 7) === month).map((n) => { const p = pmap.get(n.partnerId); return { ...n, party: p, ctin: p?.gstin, ...heads(n.gst || 0, isIntraState(p?.gstin || p?.state)) } })
    return { gstin, inv, b2b, exp, byGstin, hsn: Object.values(hsn).sort((a, b) => a.hsn.localeCompare(b.hsn)), cdn }
  }, [invoices, notes, partners, products, month, gstin])
}

function Gstr1({ month }) {
  const d = useGstr1(month)
  const [view, setView] = useState('GSTIN')
  const totals = { taxable: sum(d.b2b, (i) => i.subtotal), igst: sum(d.b2b, (i) => i.igst), cgst: sum(d.b2b, (i) => i.cgst), sgst: sum(d.b2b, (i) => i.sgst) }
  const json = () => {
    const out = {
      gstin: d.gstin, fp: fp(month), version: 'GST3.1.6', hash: 'hash',
      b2b: d.byGstin.map((g) => ({ ctin: g.ctin, inv: d.b2b.filter((i) => i.ctin === g.ctin).map((i) => ({ inum: i.number, idt: fmtDate(i.date).replace(/ /g, '-'), val: i.total, pos: i.pos, rchrg: 'N', inv_typ: 'R', irn: i.irnAckNo ? i.irn : undefined, itms: [{ num: 1801, itm_det: { txval: i.subtotal, rt: 18, iamt: i.igst, camt: i.cgst, samt: i.sgst, csamt: 0 } }] })) })),
      exp: d.exp.length ? [{ exp_typ: 'WOPAY', inv: d.exp.map((i) => ({ inum: i.number, idt: i.date, val: i.total, itms: [{ txval: i.subtotal, rt: 0, iamt: 0 }] })) }] : [],
      cdnr: d.cdn.map((n) => ({ ctin: n.ctin, nt: [{ ntty: n.type === 'CREDIT' ? 'C' : 'D', nt_num: n.number, nt_dt: n.date, val: noteTotal(n), pos: (n.ctin || '27').slice(0, 2), itms: [{ num: 1, itm_det: { txval: n.amount, rt: n.gstRate, iamt: n.igst, camt: n.cgst, samt: n.sgst } }] }] })),
      hsn: { data: d.hsn.map((h, i) => ({ num: i + 1, hsn_sc: h.hsn, desc: h.desc, uqc: h.uqc, qty: h.qty, rt: h.rate, txval: h.txval, iamt: h.igst, camt: h.cgst, samt: h.sgst, csamt: 0 })) },
    }
    downloadText(`GSTR1_${d.gstin}_${fp(month)}.json`, JSON.stringify(out, null, 2), 'application/json')
    toast.success('GSTR-1 JSON downloaded', 'Upload it on the GST portal via Returns → GSTR-1 → Prepare offline')
  }
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat icon={Receipt} label="B2B invoices" value={d.b2b.length} sub={`${d.byGstin.length} GSTINs`} />
        <Stat tone="ink" label="Taxable value" value={fmtINR(totals.taxable)} />
        <Stat tone="amber" label="IGST" value={fmtINR(totals.igst)} />
        <Stat tone="green" label="CGST + SGST" value={fmtINR(totals.cgst + totals.sgst)} />
      </Grid>
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">{[['GSTIN', 'B2B by GSTIN'], ['INV', 'B2B invoices'], ['HSN', 'HSN summary'], ['CDN', `Credit/debit notes (${d.cdn.length})`]].map(([k, l]) => <Button key={k} size="sm" variant={view === k ? 'dark' : 'secondary'} onClick={() => setView(k)}>{l}</Button>)}</div>
        <div className="flex gap-2"><Button size="sm" variant="secondary" icon={Download} onClick={() => exportCSV(`GSTR1-B2B-${month}.csv`, d.b2b, [{ header: 'GSTIN', key: 'ctin' }, { header: 'Receiver', value: (i) => i.party?.name }, { header: 'Invoice', key: 'number' }, { header: 'Date', key: 'date' }, { header: 'Value', key: 'total' }, { header: 'POS', key: 'pos' }, { header: 'Taxable', key: 'subtotal' }, { header: 'IGST', key: 'igst' }, { header: 'CGST', key: 'cgst' }, { header: 'SGST', key: 'sgst' }, { header: 'IRN', value: (i) => (i.irnAckNo ? i.irn : '') }])}>CSV</Button><Button size="sm" icon={FileJson} onClick={json}>GSTR-1 JSON</Button></div>
      </div>
      {view === 'GSTIN' && <DataTable rows={d.byGstin} exportName={`gstr1-gstin-${month}`} columns={[{ key: 'ctin', header: 'GSTIN', className: 'font-mono text-xs' }, { key: 'name', header: 'Receiver' }, { key: 'count', header: 'Invoices', align: 'right' }, { key: 'taxable', header: 'Taxable', align: 'right', render: (r) => fmtINR(r.taxable, true) }, { key: 'igst', header: 'IGST', align: 'right', render: (r) => fmtINR(r.igst, true) }, { key: 'cgst', header: 'CGST', align: 'right', render: (r) => fmtINR(r.cgst, true) }, { key: 'sgst', header: 'SGST', align: 'right', render: (r) => fmtINR(r.sgst, true) }, { key: 'total', header: 'Invoice value', align: 'right', render: (r) => <b>{fmtINR(r.total, true)}</b> }]} />}
      {view === 'INV' && <DataTable rows={d.b2b} exportName={`gstr1-invoices-${month}`} columns={[{ key: 'number', header: 'Invoice' }, { key: 'date', header: 'Date', render: (i) => fmtDate(i.date) }, { key: 'ctin', header: 'GSTIN', className: 'font-mono text-xs' }, { key: 'p', header: 'Receiver', value: (i) => i.party?.name }, { key: 'pos', header: 'POS' }, { key: 'subtotal', header: 'Taxable', align: 'right', render: (i) => fmtINR(i.subtotal, true) }, { key: 'tax', header: 'Tax', align: 'right', value: (i) => i.igst + i.cgst + i.sgst, render: (i) => fmtINR(i.igst + i.cgst + i.sgst, true) }, { key: 'irn', header: 'e-Invoice', render: (i) => (i.irnAckNo || i.history ? <Badge tone="green">IRN</Badge> : <Badge tone="amber">Pending</Badge>) }]} />}
      {view === 'HSN' && <DataTable rows={d.hsn} searchable={false} exportName={`gstr1-hsn-${month}`} columns={[{ key: 'hsn', header: 'HSN' }, { key: 'desc', header: 'Description' }, { key: 'uqc', header: 'UQC' }, { key: 'qty', header: 'Qty', align: 'right' }, { key: 'rate', header: 'Rate', align: 'right', render: (h) => `${h.rate}%` }, { key: 'txval', header: 'Taxable', align: 'right', render: (h) => fmtINR(h.txval, true) }, { key: 'igst', header: 'IGST', align: 'right', render: (h) => fmtINR(h.igst, true) }, { key: 'cgst', header: 'CGST', align: 'right', render: (h) => fmtINR(h.cgst, true) }, { key: 'sgst', header: 'SGST', align: 'right', render: (h) => fmtINR(h.sgst, true) }]} />}
      {view === 'CDN' && <DataTable rows={d.cdn} searchable={false} empty={<EmptyState title="No credit/debit notes to dealers in this period" />} columns={[{ key: 'number', header: 'Note' }, { key: 'type', header: 'Type' }, { key: 'ctin', header: 'GSTIN', className: 'font-mono text-xs' }, { key: 'p', header: 'Party', value: (n) => n.party?.name }, { key: 'amount', header: 'Taxable', align: 'right', render: (n) => fmtINR(n.amount, true) }, { key: 'gst', header: 'GST', align: 'right', render: (n) => fmtINR(n.gst, true) }]} />}
    </div>
  )
}

function Gstr3b({ month }) {
  const d = useGstr1(month)
  const bills = useStore((s) => s.vendorBills) || []
  const expenses = useStore((s) => s.expenses) || []
  const shipments = useStore((s) => s.shipments)
  const vendors = useStore((s) => s.vendors)
  const journals = useStore((s) => s.journals) || []
  const gstin = useStore((s) => s.settings.company.gstin)
  const out = { tx: 0, igst: 0, cgst: 0, sgst: 0 }
  for (const i of d.inv.filter((x) => x.type !== 'EXPORT')) { out.tx += i.subtotal; out.igst += i.igst; out.cgst += i.cgst; out.sgst += i.sgst }
  for (const n of d.cdn) { const s = n.type === 'CREDIT' ? -1 : 1; out.tx += s * n.amount; out.igst += s * n.igst; out.cgst += s * n.cgst; out.sgst += s * n.sgst }
  const zero = sum(d.exp, (i) => i.subtotal)
  const imports = shipments.filter((s) => s.landedCost?.finalized && (s.ata || '').slice(0, 7) === month)
  const impIgst = sum(imports, (s) => s.landedCost.igst || 0)
  const itc = { igst: 0, cgst: 0, sgst: 0 }
  const itcRows = []
  for (const b of bills.filter((x) => ['APPROVED', 'PAID'].includes(x.status) && x.date.slice(0, 7) === month && x.gst > 0)) { const v = vendors.find((x) => x.id === b.vendorId); const h = heads(b.gst, isIntraState(v?.gst || '27')); itc.igst += h.igst; itc.cgst += h.cgst; itc.sgst += h.sgst; itcRows.push({ id: b.id, doc: b.number, party: v?.name, gstin: v?.gst, ...h }) }
  for (const e of expenses.filter((x) => ['APPROVED', 'PAID'].includes(x.status) && x.date.slice(0, 7) === month && x.gst > 0)) { const h = heads(e.gst, true); itc.igst += h.igst; itc.cgst += h.cgst; itc.sgst += h.sgst; itcRows.push({ id: e.id, doc: e.number, party: e.payee, gstin: '', ...h }) }
  const r = (v) => round2(v)
  const totalItcIgst = r(impIgst + itc.igst)
  // utilisation: IGST credit first against IGST, then CGST, then SGST
  let ig = totalItcIgst
  const payI = r(Math.max(0, out.igst - ig)); ig = Math.max(0, ig - out.igst)
  const useC = Math.min(ig, Math.max(0, out.cgst - itc.cgst)); ig -= useC
  const payC = r(Math.max(0, out.cgst - itc.cgst - useC))
  const useS = Math.min(ig, Math.max(0, out.sgst - itc.sgst)); ig -= useS
  const payS = r(Math.max(0, out.sgst - itc.sgst - useS))
  const paidJv = journals.find((j) => j.source === 'GST' && j.narration.includes(new Date(`${month}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })))
  const json = () => {
    const o = { gstin, ret_period: fp(month), sup_details: { osup_det: { txval: r(out.tx), iamt: r(out.igst), camt: r(out.cgst), samt: r(out.sgst), csamt: 0 }, osup_zero: { txval: r(zero), iamt: 0, csamt: 0 } }, itc_elg: { itc_avl: [{ ty: 'IMPG', iamt: r(impIgst), camt: 0, samt: 0, csamt: 0 }, { ty: 'OTH', iamt: r(itc.igst), camt: r(itc.cgst), samt: r(itc.sgst), csamt: 0 }], itc_net: { iamt: totalItcIgst, camt: r(itc.cgst), samt: r(itc.sgst) } } }
    downloadText(`GSTR3B_${gstin}_${fp(month)}.json`, JSON.stringify(o, null, 2), 'application/json')
    toast.success('GSTR-3B JSON downloaded')
  }
  const Row = ({ label, v, bold }) => <tr className={bold ? 'font-semibold bg-slate-50' : ''}><td className="px-3 py-2">{label}</td>{['tx', 'igst', 'cgst', 'sgst'].map((k) => <td key={k} className="px-3 py-2 text-right tabular-nums">{v[k] == null ? '' : fmtINR(r(v[k]), true)}</td>)}</tr>
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat label="Output tax" value={fmtINR(out.igst + out.cgst + out.sgst)} tone="amber" />
        <Stat label="ITC – import IGST (customs)" value={fmtINR(impIgst)} tone="blue" sub={`${imports.length} BOE`} />
        <Stat label="ITC – domestic purchases & services" value={fmtINR(itc.igst + itc.cgst + itc.sgst)} tone="green" />
        <Stat label="Net GST payable in cash" value={fmtINR(payI + payC + payS)} tone="red" sub={paidJv ? `Paid ${fmtDate(paidJv.date)} · ${paidJv.number}` : 'Due 20th of next month'} />
      </Grid>
      <Card title={`GSTR-3B working – ${monthLabel(month)}`} actions={<Button size="sm" icon={FileJson} onClick={json}>GSTR-3B JSON</Button>} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Table</th><th className="text-right px-3 py-2">Taxable</th><th className="text-right px-3 py-2">IGST</th><th className="text-right px-3 py-2">CGST</th><th className="text-right px-3 py-2">SGST</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              <Row label="3.1(a) Outward taxable supplies (net of credit/debit notes)" v={out} />
              <Row label="3.1(b) Zero-rated (exports)" v={{ tx: zero, igst: 0, cgst: null, sgst: null }} />
              <Row label="4(A)(1) ITC – Import of goods (IGST paid at customs)" v={{ tx: null, igst: impIgst, cgst: 0, sgst: 0 }} />
              <Row label="4(A)(5) ITC – All other (vendor bills & expenses)" v={{ tx: null, ...itc }} />
              <Row label="Net ITC available" v={{ tx: null, igst: totalItcIgst, cgst: itc.cgst, sgst: itc.sgst }} bold />
              <Row label="Tax payable in cash (after set-off)" v={{ tx: null, igst: payI, cgst: payC, sgst: payS }} bold />
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DataTable rows={imports.map((s) => ({ id: s.id, number: s.number, containerNo: s.containerNo, ata: s.ata, igst: s.landedCost.igst, duty: s.landedCost.duty }))} searchable={false} empty={<EmptyState title="No bills of entry this month" />} columns={[{ key: 'number', header: 'Shipment / BOE' }, { key: 'containerNo', header: 'Container' }, { key: 'ata', header: 'Arrival', render: (x) => fmtDate(x.ata) }, { key: 'duty', header: 'BCD', align: 'right', render: (x) => fmtINR(x.duty) }, { key: 'igst', header: 'Import IGST', align: 'right', render: (x) => fmtINR(x.igst) }]} />
        <DataTable rows={itcRows} searchable={false} empty={<EmptyState title="No domestic ITC this month" />} columns={[{ key: 'doc', header: 'Document' }, { key: 'party', header: 'Supplier' }, { key: 'igst', header: 'IGST', align: 'right', render: (x) => fmtINR(x.igst, true) }, { key: 'cg', header: 'CGST+SGST', align: 'right', value: (x) => x.cgst + x.sgst, render: (x) => fmtINR(x.cgst + x.sgst, true) }]} />
      </div>
    </div>
  )
}

function Tds() {
  const bills = useStore((s) => s.vendorBills) || []
  const expenses = useStore((s) => s.expenses) || []
  const challans = useStore((s) => s.tdsChallans) || []
  const banks = useStore((s) => s.bankAccounts) || []
  const { vendor } = useLookup()
  const { postings } = useBooks()
  const [dep, setDep] = useState(null)
  const register = [
    ...bills.filter((b) => b.tds > 0 && ['APPROVED', 'PAID'].includes(b.status)).map((b) => ({ id: b.id, date: b.date, doc: b.number, deductee: vendor(b.vendorId)?.name, pan: panFromGstin(vendor(b.vendorId)?.gst), section: b.tdsSection, base: b.amountINR, rate: b.tdsRate, tds: b.tds })),
    ...expenses.filter((e) => e.tds > 0 && ['APPROVED', 'PAID'].includes(e.status)).map((e) => ({ id: e.id, date: e.date, doc: e.number, deductee: e.payee, pan: '', section: e.tdsSection, base: e.amount, rate: e.tdsRate, tds: e.tds })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  const ACC = { 2210: '194C', 2211: '194J', 2212: '194Q', 2213: '194I', 2214: '194H' }
  const monthly = useMemo(() => {
    const m = {}
    for (const p of postings) {
      const sec = ACC[p.account]
      if (!sec || !p.cr) continue
      const k = p.date.slice(0, 7)
      m[k] = m[k] || {}
      m[k][sec] = round2((m[k][sec] || 0) + p.cr)
    }
    return Object.entries(m).sort().map(([period, secs]) => {
      const ch = challans.filter((c) => c.period === period)
      const deposited = round2(sum(ch, (c) => c.amount))
      const deducted = round2(sum(Object.values(secs)))
      const [y, mm] = period.split('-').map(Number)
      const due = mm === 3 ? `${y}-04-30` : new Date(Date.UTC(y, mm, 7)).toISOString().slice(0, 10)
      return { id: period, period, secs, deducted, deposited, balance: round2(deducted - deposited), challans: ch, due }
    }).reverse()
  }, [postings, challans]) // eslint-disable-line
  const quarters = Object.values(groupBy(monthly, (m) => quarterOf(`${m.period}-15`).key)).map((l) => {
    const q = quarterOf(`${l[0].period}-15`)
    const secTotals = {}
    for (const m of l) for (const [s, v] of Object.entries(m.secs)) secTotals[s] = round2((secTotals[s] || 0) + v)
    const dueMap = { 1: '31 Jul', 2: '31 Oct', 3: '31 Jan', 4: '31 May' }
    return { id: q.key, label: q.label, secTotals, deducted: round2(sum(l, (m) => m.deducted)), deposited: round2(sum(l, (m) => m.deposited)), filingDue: `${dueMap[q.q]}`, done: l.every((m) => m.balance <= 0.5) }
  })
  const pending = monthly.filter((m) => m.balance > 0.5)
  return (
    <div className="space-y-4">
      <Grid cols={4}>
        <Stat icon={Percent} label="TDS deducted (FY)" value={fmtINR(sum(monthly, (m) => m.deducted))} />
        <Stat icon={Landmark} tone="green" label="Deposited (challans)" value={fmtINR(sum(challans, (c) => c.amount))} sub={`${challans.length} challans`} />
        <Stat tone={pending.some((m) => m.due < today()) ? 'red' : 'amber'} label="To deposit" value={fmtINR(sum(pending, (m) => m.balance))} sub={pending.length ? `Next due ${fmtDate(pending[pending.length - 1].due)}` : 'All deposited'} />
        <Stat tone="ink" label="Deductee entries" value={register.length} sub="bills & expenses with TDS" />
      </Grid>
      <Card title="Monthly TDS liability & challans" padded={false}>
        <DataTable rows={monthly} searchable={false} className="border-0 shadow-none" columns={[
          { key: 'period', header: 'Month', render: (m) => monthLabel(m.period) },
          ...TDS_SECTIONS.map((s) => ({ key: s.code, header: s.code, align: 'right', value: (m) => m.secs[s.code] || 0, render: (m) => (m.secs[s.code] ? fmtINR(m.secs[s.code]) : '—') })),
          { key: 'deducted', header: 'Deducted', align: 'right', render: (m) => <b>{fmtINR(m.deducted)}</b> },
          { key: 'deposited', header: 'Deposited', align: 'right', render: (m) => fmtINR(m.deposited) },
          { key: 'challan', header: 'Challan (CIN)', render: (m) => <div className="text-xs font-mono">{m.challans.map((c) => <div key={c.id}>{c.challanNo} · {fmtDate(c.paidOn)}</div>)}</div> },
          { key: 'due', header: 'Due', render: (m) => <span className={m.balance > 0.5 && m.due < today() ? 'text-red-600 font-medium' : ''}>{fmtDate(m.due)}</span> },
          { key: 'act', header: '', sortable: false, render: (m) => (m.balance > 0.5 ? <Button size="sm" icon={Landmark} onClick={() => setDep(m)}>Deposit {fmtINR(m.balance)}</Button> : <StatusBadge status="PAID" label="Deposited" />) },
        ]} />
      </Card>
      <Card title="Quarterly summary (Form 26Q)" padded={false}>
        <DataTable rows={quarters} searchable={false} className="border-0 shadow-none" exportName="tds-quarterly" columns={[
          { key: 'label', header: 'Quarter' },
          ...TDS_SECTIONS.map((s) => ({ key: s.code, header: s.code, align: 'right', value: (q) => q.secTotals[s.code] || 0, render: (q) => (q.secTotals[s.code] ? fmtINR(q.secTotals[s.code]) : '—') })),
          { key: 'deducted', header: 'Deducted', align: 'right', render: (q) => fmtINR(q.deducted) },
          { key: 'deposited', header: 'Deposited', align: 'right', render: (q) => fmtINR(q.deposited) },
          { key: 'filingDue', header: '26Q due' },
          { key: 'done', header: 'Status', render: (q) => (q.done ? <Badge tone="green">Ready to file</Badge> : <Badge tone="amber">Deposit pending</Badge>) },
        ]} />
      </Card>
      <DataTable rows={register} exportName="tds-register" filters={[{ key: 'section', label: 'sections', options: TDS_SECTIONS.map((s) => s.code) }]} columns={[
        { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 'doc', header: 'Document' }, { key: 'deductee', header: 'Deductee' }, { key: 'pan', header: 'PAN', className: 'font-mono text-xs' },
        { key: 'section', header: 'Section', render: (r) => <Badge tone="ink">{r.section}</Badge> }, { key: 'base', header: 'Amount paid/credited', align: 'right', render: (r) => fmtINR(r.base, true) },
        { key: 'rate', header: 'Rate', align: 'right', render: (r) => `${r.rate}%` }, { key: 'tds', header: 'TDS', align: 'right', render: (r) => <b>{fmtINR(r.tds)}</b> },
      ]} />
      {dep && <DepositModal m={dep} banks={banks} onClose={() => setDep(null)} />}
    </div>
  )
}

function DepositModal({ m, banks, onClose }) {
  const depositTds = useStore((s) => s.depositTds)
  const [f, setF] = useState({ date: today(), bankId: 'bk1', challanNo: '' })
  const dep = {}
  let left = m.balance
  for (const [s, v] of Object.entries(m.secs)) { const already = sum(m.challans, (c) => c.sections?.[s] || 0); const x = round2(Math.max(0, Math.min(v - already, left))); if (x > 0) { dep[s] = x; left -= x } }
  return (
    <Modal open size="sm" onClose={onClose} title={`Deposit TDS – ${monthLabel(m.period)}`} subtitle="Challan ITNS 281 · posts a payment voucher against TDS payable"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { const r = depositTds(m.period, dep, f); if (r.ok) { toast.success('TDS deposited', `CIN ${r.challan.challanNo}`); onClose() } else toast.error(r.error) }}>Pay {fmtINR(m.balance)}</Button></>}>
      {Object.entries(dep).map(([s, v]) => <KV key={s} label={`Section ${s}`} value={fmtINR(v, true)} />)}
      <FormGrid cols={1} className="mt-3">
        <Field label="Paid from"><Select value={f.bankId} onChange={(e) => setF({ ...f, bankId: e.target.value })} options={banks.map((b) => ({ value: b.id, label: b.name }))} /></Field>
        <Field label="Payment date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Challan identification no. (CIN)" hint="Leave blank to use the bank-generated CIN"><Input value={f.challanNo} onChange={(e) => setF({ ...f, challanNo: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  )
}

function EInvoice() {
  const invoices = useStore((s) => s.invoices)
  const cfg = useStore((s) => s.accountsSettings?.einvoice) || {}
  const transporters = useStore((s) => s.transporters)
  const { updateEinvoiceSettings, testEinvoiceConnection, generateIrn, generateEwayBill } = useStore.getState()
  const { partner } = useLookup()
  const [ewb, setEwb] = useState(null)
  const recent = useMemo(() => invoices.filter((i) => !i.history && i.type !== 'FOC').sort((a, b) => b.date.localeCompare(a.date)), [invoices])
  const needIrn = recent.filter((i) => !i.irnAckNo)
  const needEwb = recent.filter((i) => !i.ewbValidTill && i.total >= 50000)
  const allFy = invoices.filter((i) => i.type !== 'FOC')
  const pct = allFy.length ? ((allFy.length - needIrn.length) / allFy.length) * 100 : 100
  const bulk = () => {
    let n = 0, e = []
    for (const i of needIrn) { const r = generateIrn(i.id); r.ok ? n++ : e.push(`${i.number}: ${r.error}`) }
    n ? toast.success(`${n} IRN(s) generated`, e.length ? `${e.length} skipped` : 'Signed QR codes attached to invoices') : toast.error('No IRNs generated', e.join('\n'))
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="GSP connector" subtitle="e-Invoice (IRP) & e-Way bill APIs" actions={<Badge tone={cfg.connected ? 'green' : 'red'} dot>{cfg.connected ? 'Connected' : 'Disconnected'}</Badge>}>
          <KV label="Provider" value={cfg.provider} />
          <KV label="Environment" value={cfg.env} />
          <KV label="GSTIN" value={<span className="font-mono text-xs">{cfg.gstin}</span>} />
          <KV label="API user" value={cfg.apiUser} />
          <KV label="Last sync" value={fmtDateTime(cfg.lastSync)} />
          <div className="space-y-2 mt-3">
            <Switch checked={!!cfg.autoEwb} onChange={(v) => { updateEinvoiceSettings({ autoEwb: v }); toast.success(v ? 'E-way bills included in sync' : 'E-way bills excluded from sync') }} label="Also generate e-way bills (≥ ₹50,000) during sync" />
          </div>
          <Button className="mt-4 w-full" variant="secondary" icon={PlugZap} onClick={() => { const r = testEinvoiceConnection(); toast.success('Connection OK', `IRP responded in ${r.latencyMs} ms`) }}>Test connection</Button>
        </Card>
        <Card title="Compliance" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><div className="text-xs text-slate-500">Invoices with IRN</div><div className="text-2xl font-bold">{pct.toFixed(1)}%</div><Progress value={pct} tone="green" /></div>
            <div><div className="text-xs text-slate-500">Pending IRN</div><div className="text-2xl font-bold text-amber-600">{needIrn.length}</div></div>
            <div><div className="text-xs text-slate-500">Pending e-way bill (≥ ₹50,000)</div><div className="text-2xl font-bold text-amber-600">{needEwb.length}</div></div>
          </div>
          <Alert tone="info" className="mt-4">Invoice data is pushed to the IRP through the GSP; the signed IRN, acknowledgement number and QR code are stored on the invoice. E-way bills use the transporter and vehicle captured by Dispatch.</Alert>
          <div className="flex gap-2 mt-4"><Button icon={RefreshCw} disabled={!needIrn.length && !(cfg.autoEwb && needEwb.length)} onClick={bulk}>Sync pending with IRP ({needIrn.length + (cfg.autoEwb ? needEwb.length : 0)})</Button></div>
        </Card>
      </div>
      <DataTable rows={recent} exportName="einvoice-status" columns={[
        { key: 'number', header: 'Invoice', render: (i) => <div><div className="font-medium">{i.number}</div><div className="text-[11px] text-slate-500">{fmtDate(i.date)}</div></div> },
        { key: 'p', header: 'Buyer', value: (i) => partner(i.partnerId)?.name, render: (i) => <div>{partner(i.partnerId)?.name}<div className="text-[11px] font-mono text-slate-500">{partner(i.partnerId)?.gstin}</div></div> },
        { key: 'total', header: 'Value', align: 'right', render: (i) => fmtINR(i.total) },
        { key: 'irn', header: 'IRN', render: (i) => (i.irnAckNo ? <div className="text-xs"><Badge tone="green">Generated</Badge><div className="font-mono text-[10px] text-slate-500 mt-0.5" title={i.irn}>{i.irn.slice(0, 18)}… · Ack {i.irnAckNo}</div></div> : <Badge tone="amber">Pending</Badge>) },
        { key: 'ewb', header: 'e-Way bill', render: (i) => (i.ewbValidTill ? <div className="text-xs"><Badge tone="green">{i.ewayBill}</Badge><div className="text-[10px] text-slate-500 mt-0.5">{i.ewbVehicle} · valid till {fmtDate(i.ewbValidTill)}</div></div> : i.total < 50000 ? <span className="text-xs text-slate-400">Not required</span> : <Badge tone="amber">Pending</Badge>) },
        { key: 'act', header: '', sortable: false, render: (i) => (
          <div className="flex gap-1 justify-end">
            {!i.irnAckNo && <Button size="sm" icon={Zap} onClick={() => { const r = generateIrn(i.id); r.ok ? toast.success('IRN generated', `${i.number} · Ack ${r.ackNo}`) : toast.error('IRN not generated', r.error) }}>IRN</Button>}
            {!i.ewbValidTill && i.total >= 50000 && <Button size="sm" variant="secondary" icon={Truck} onClick={() => setEwb(i)}>e-Way bill</Button>}
          </div>
        ) },
      ]} />
      {ewb && <EwbModal inv={ewb} transporters={transporters} onClose={() => setEwb(null)} onDone={(r) => { toast.success('E-way bill generated', `EWB ${r.ewb} · valid till ${fmtDate(r.validTill)}`); setEwb(null) }} />}
    </div>
  )
}

function EwbModal({ inv, transporters, onClose, onDone }) {
  const tr = transporters.find((t) => t.id === inv.transporterId)
  const [f, setF] = useState({ transporterId: inv.transporterId || '', vehicleNo: inv.vehicleNo || tr?.vehicleNo || '', distanceKm: 350 })
  return (
    <Modal open size="sm" onClose={onClose} title={`e-Way bill – ${inv.number}`} subtitle={`Value ${fmtINR(inv.total)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Truck} onClick={() => { const r = useStore.getState().generateEwayBill(inv.id, f); r.ok ? onDone(r) : toast.error('E-way bill not generated', r.error) }}>Generate</Button></>}>
      <FormGrid cols={1}>
        <Field label="Transporter"><Select value={f.transporterId} onChange={(e) => setF({ ...f, transporterId: e.target.value, vehicleNo: transporters.find((t) => t.id === e.target.value)?.vehicleNo || f.vehicleNo })} options={transporters.map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Vehicle no. (Part-B)" required><Input value={f.vehicleNo} onChange={(e) => setF({ ...f, vehicleNo: e.target.value.toUpperCase() })} /></Field>
        <Field label="Approx. distance (km)" hint="Validity: 1 day per 200 km"><NumberInput value={f.distanceKm} onChange={(v) => setF({ ...f, distanceKm: v })} /></Field>
      </FormGrid>
    </Modal>
  )
}

function Rates() {
  const rates = useStore((s) => s.gstRates) || []
  const products = useStore((s) => s.products)
  const { saveGstRate, removeGstRate } = useStore.getState()
  const [edit, setEdit] = useState(null)
  return (
    <>
      <DataTable rows={rates} exportName="gst-rates" toolbar={<Button size="sm" icon={Plus} onClick={() => setEdit({ hsn: '', description: '', rate: 18, type: 'GOODS', effectiveFrom: today() })}>Add HSN / SAC</Button>} columns={[
        { key: 'hsn', header: 'HSN / SAC', className: 'font-mono' }, { key: 'description', header: 'Description' }, { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'GOODS' ? 'ink' : 'violet'}>{r.type === 'GOODS' ? 'Goods' : 'Service'}</Badge> },
        { key: 'rate', header: 'GST rate', align: 'right', render: (r) => <b>{r.rate}%</b> }, { key: 'split', header: 'CGST / SGST / IGST', render: (r) => <span className="text-xs text-slate-500">{r.rate / 2}% / {r.rate / 2}% / {r.rate}%</span> },
        { key: 'products', header: 'Products', align: 'right', value: (r) => products.filter((p) => p.hsn === r.hsn).length },
        { key: 'effectiveFrom', header: 'Effective', render: (r) => fmtDate(r.effectiveFrom) },
        { key: 'act', header: '', sortable: false, render: (r) => <div className="flex gap-1 justify-end"><IconButton icon={Pencil} title="Edit" onClick={() => setEdit(r)} /><IconButton icon={Trash2} tone="danger" title="Delete" onClick={async () => { if (await confirm({ title: `Remove HSN ${r.hsn}?`, tone: 'danger', confirmText: 'Remove' })) { removeGstRate(r.id); toast.success('Rate removed') } }} /></div> },
      ]} />
      {edit && (
        <Modal open size="sm" onClose={() => setEdit(null)} title={edit.id ? `Edit HSN ${edit.hsn}` : 'Add HSN / SAC rate'} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => { if (!/^\d{4,8}$/.test(edit.hsn)) return toast.error('HSN/SAC must be 4–8 digits'); saveGstRate(edit); toast.success('GST rate saved', `${edit.hsn} @ ${edit.rate}%`); setEdit(null) }}>Save</Button></>}>
          <FormGrid cols={1}>
            <Field label="HSN / SAC" required><Input value={edit.hsn} onChange={(e) => setEdit({ ...edit, hsn: e.target.value })} /></Field>
            <Field label="Description"><Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Type"><Select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })} options={[{ value: 'GOODS', label: 'Goods (HSN)' }, { value: 'SERVICE', label: 'Service (SAC)' }]} /></Field>
            <Field label="GST rate"><Select value={String(edit.rate)} onChange={(e) => setEdit({ ...edit, rate: Number(e.target.value) })} options={[0, 0.25, 3, 5, 12, 18, 28].map((r) => ({ value: String(r), label: `${r}%` }))} /></Field>
            <Field label="Effective from"><Input type="date" value={edit.effectiveFrom} onChange={(e) => setEdit({ ...edit, effectiveFrom: e.target.value })} /></Field>
          </FormGrid>
        </Modal>
      )}
    </>
  )
}
