import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ScanSearch, Factory, Ship, Warehouse, Store, User, ShieldCheck, Ticket, FileText, Package, Download } from 'lucide-react'
import { PageHeader, Card, Badge, StatusBadge, Alert, EmptyState, DescriptionList, SectionTitle, Barcode, Segmented, Button, Combobox, toast } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { ScanInput, ProductCell } from '../../../components/business'
import { useStore } from '../../../store'
import { fmtDate, fmtDateTime, fmtNum, exportCSV } from '../../../lib/format'
import { checkWarranty } from '../../../lib/warranty'

const STAGES = ['GENERATED', 'PACKED', 'IN_TRANSIT', 'IN_WAREHOUSE', 'INVOICED', 'AT_PARTNER', 'SOLD']
const STAGE_LABEL = { GENERATED: 'Barcode generated', PACKED: 'Packed at factory', IN_TRANSIT: 'In transit', IN_WAREHOUSE: 'At Btali', INVOICED: 'Invoiced', AT_PARTNER: 'At dealer / store', SOLD: 'Sold to customer' }
const eventIcon = (e) => (/generated/i.test(e) ? Package : /packed/i.test(e) ? Factory : /shipped|transit|container/i.test(e) ? Ship : /inward|warehouse/i.test(e) ? Warehouse : /dispatch|invoice/i.test(e) ? Store : /sold|warranty/i.test(e) ? User : FileText)

function CoverTile({ title, c, empty }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-600">{title}</span>
        <Badge tone={c.end ? (c.valid ? 'green' : 'red') : 'gray'}>{c.end ? (c.valid ? `Valid · ${c.daysLeft}d left` : 'Expired') : 'Not started'}</Badge>
      </div>
      <div className="text-sm mt-1.5 text-slate-800">{c.start ? `${fmtDate(c.start)} → ${fmtDate(c.end)}` : <span className="text-slate-400">{empty}</span>}</div>
    </div>
  )
}

function Journey({ code }) {
  const state = useStore()
  const r = useMemo(() => checkWarranty(state, code), [state, code])
  if (!r.found) return <Alert tone="error" title="Barcode not found">{code} is not registered in Btali records. Check the label and scan again.</Alert>
  const { unit, product, warranty, partner, vendor } = r
  const po = state.purchaseOrders.find((p) => p.id === unit?.poId)
  const sh = po ? state.shipments.find((s) => s.poIds.includes(po.id)) : null
  const inv = state.invoices.find((i) => i.id === unit?.invoiceId)
  const tickets = state.tickets.filter((t) => t.barcode === r.code)
  const idx = STAGES.indexOf(unit?.status)
  const history = [...(unit?.history || [])].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2 space-y-4">
        <Card>
          <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <ProductCell product={product} />
            </div>
            <div className="flex items-center gap-3"><Barcode value={r.code} height={36} /><StatusBadge status={unit?.status} /></div>
          </div>
          <div className="mt-4 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {STAGES.map((s, i) => (
              <React.Fragment key={s}>
                <div className={`shrink-0 text-[11px] px-2 py-1 rounded-full font-medium ${i < idx ? 'bg-emerald-50 text-emerald-700' : i === idx ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{STAGE_LABEL[s]}</div>
                {i < STAGES.length - 1 && <div className={`h-0.5 min-w-[10px] flex-1 ${i < idx ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
              </React.Fragment>
            ))}
          </div>
          {['RETURNED', 'REPLACED'].includes(unit?.status) && <Alert tone="warn" className="mt-3">Unit is {unit.status.toLowerCase()}.</Alert>}
        </Card>
        <Card title="Journey" subtitle={`${history.length} recorded events`}>
          <ol className="relative border-l border-slate-200 ml-3 space-y-5">
            {history.map((h, i) => {
              const I = eventIcon(h.event)
              return (
                <li key={i} className="ml-6">
                  <span className="absolute -left-3.5 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-slate-200 text-brand-600"><I className="w-3.5 h-3.5" /></span>
                  <div className="text-sm font-medium text-slate-800">{h.event}</div>
                  <div className="text-[11px] text-slate-500">{fmtDateTime(h.ts)}{h.ref ? ` · ${h.ref}` : ''}</div>
                </li>
              )
            })}
          </ol>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Linked records">
          <DescriptionList cols={1} items={[
            ['Vendor', vendor?.name],
            ['Purchase order', po ? <Link className="text-brand-600 hover:underline" to={`/erp/purchase/orders/${po.id}`}>{po.number}</Link> : '—'],
            ['Shipment', sh ? `${sh.number} · ${sh.containerNo}${sh.inward?.grnNo ? ` · ${sh.inward.grnNo}` : ''}` : '—'],
            ['Current location', state.locations.find((l) => l.id === unit?.locationId)?.name || partner?.name || unit?.locationId],
            ['Invoice', inv ? `${inv.number} · ${fmtDate(inv.date)}` : '—'],
            ['Dealer / franchise', partner ? <Link className="text-brand-600 hover:underline" to="/erp/sales/dealers">{partner.name}, {partner.city}</Link> : '—'],
            ['End customer', warranty ? `${warranty.customer.name} · ${warranty.customer.phone}` : '—'],
          ]} />
        </Card>
        <Card title="Warranty" actions={<ShieldCheck className="w-4 h-4 text-emerald-600" />}>
          <div className="space-y-2">
            {warranty && <div className="text-xs text-slate-500">{warranty.number} · registered via {warranty.source.replace(/_/g, ' ').toLowerCase()}</div>}
            <CoverTile title={`Customer (${r.terms.months} mo)`} c={r.customer} empty="Not yet sold to an end customer" />
            <CoverTile title={`Btali → partner (${r.terms.partnerMonths} mo)`} c={r.partnerCover} empty="Starts on dispatch" />
            <CoverTile title={`Vendor → Btali (${r.terms.vendorMonths} mo)`} c={r.vendorCover} empty="Starts on inward" />
          </div>
        </Card>
        <Card title="Claims & tickets" actions={<Ticket className="w-4 h-4 text-slate-400" />}>
          {r.claims.length + tickets.length === 0 ? <div className="text-sm text-slate-400">No claims or tickets for this unit.</div> : (
            <ul className="space-y-2 text-sm">
              {r.claims.map((c) => <li key={c.id} className="flex justify-between gap-2"><Link to="/erp/service/claims" className="text-brand-600 hover:underline">{c.number} · {c.issue}</Link><StatusBadge status={c.status} /></li>)}
              {tickets.map((t) => <li key={t.id} className="flex justify-between gap-2"><Link to="/erp/service/tickets" className="text-brand-600 hover:underline">{t.number} · {t.subject}</Link><StatusBadge status={t.stage} /></li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

export default function Trace() {
  const units = useStore((s) => s.units)
  const pos = useStore((s) => s.purchaseOrders)
  const products = useStore((s) => s.products)
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState('code')
  const [poId, setPoId] = useState('')
  const code = params.get('code') || ''
  const scan = (c) => { setParams({ code: c }); setMode('code') }
  const suggestions = useMemo(() => {
    const pick = (st) => units.find((u) => u.status === st)?.code
    return ['SOLD', 'AT_PARTNER', 'IN_WAREHOUSE', 'IN_TRANSIT', 'PACKED'].map(pick).filter(Boolean)
  }, [units])
  useEffect(() => { if (code) setMode('code') }, [code])
  const poOpts = pos.filter((p) => units.some((u) => u.poId === p.id)).map((p) => ({ value: p.id, label: p.number, sub: `${units.filter((u) => u.poId === p.id).length} barcodes` }))
  const poUnits = units.filter((u) => u.poId === poId)
  const pname = (id) => products.find((p) => p.id === id)

  return (
    <div>
      <PageHeader title="Barcode Traceability" subtitle="Follow any unit from factory to customer – PO, container, warehouse, invoice, dealer and warranty"
        actions={<Segmented value={mode} onChange={setMode} options={[{ key: 'code', label: 'By barcode' }, { key: 'po', label: 'By purchase order' }]} />} />
      {mode === 'code' ? (
        <>
          <Card className="mb-4"><ScanInput onScan={scan} suggestions={suggestions} placeholder="Scan or type a unit barcode / warranty number and press Enter" /></Card>
          {code ? <Journey code={code} /> : <Card><EmptyState icon={ScanSearch} title="Scan a barcode to trace it" message="Every Btali unit carries a unique barcode generated at PO stage. Scan it to see its complete journey and warranty position." /></Card>}
        </>
      ) : (
        <div className="space-y-4">
          <Card><div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Combobox className="sm:w-80" options={poOpts} value={poId} onChange={setPoId} placeholder="Select purchase order…" />
            {poId && <span className="text-sm text-slate-500">{fmtNum(poUnits.length)} barcodes · {STAGES.map((s) => { const n = poUnits.filter((u) => u.status === s).length; return n ? `${n} ${STAGE_LABEL[s].toLowerCase()}` : null }).filter(Boolean).join(' · ')}</span>}
          </div></Card>
          {poId ? (
            <DataTable rows={poUnits} rowKey="code" onRowClick={(u) => scan(u.code)} pageSize={15}
              toolbar={<Button size="sm" variant="secondary" icon={Download} onClick={() => { exportCSV(`barcodes-${pos.find((p) => p.id === poId)?.number.replace(/\//g, '-')}.csv`, poUnits, [{ header: 'Barcode', key: 'code' }, { header: 'SKU', value: (u) => pname(u.productId)?.sku }, { header: 'Status', key: 'status' }, { header: 'Location', key: 'locationId' }]); toast.success('Barcode list downloaded') }}>Export list</Button>}
              columns={[
                { key: 'code', header: 'Barcode', render: (u) => <span className="font-mono text-xs font-semibold text-brand-700">{u.code}</span> },
                { key: 'productId', header: 'Product', value: (u) => pname(u.productId)?.sku, render: (u) => <ProductCell id={u.productId} size="xs" /> },
                { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
                { key: 'locationId', header: 'Location' },
                { key: 'last', header: 'Last event', value: (u) => u.history?.[u.history.length - 1]?.event, render: (u) => <span className="text-xs">{u.history?.[u.history.length - 1]?.event} <span className="text-slate-400">{fmtDate(u.history?.[u.history.length - 1]?.ts)}</span></span> },
              ]} />
          ) : <Card><EmptyState icon={Package} title="Choose a purchase order" message="Lists every barcode generated for the order with its live status." /></Card>}
        </div>
      )}
    </div>
  )
}
