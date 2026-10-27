import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calculator, CheckCircle2, Send, Save, RotateCcw, Tag } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Card, Button, Select, Field, NumberInput, Badge, StatusBadge, Alert, EmptyState, Barcode, toast, confirm, Grid, Stat } from '../../../components/ui'
import { ProductCell, PrintArea } from '../../../components/business'
import { fmtINR, fmtMoney, fmtNum, fmtDateTime } from '../../../lib/format'
import { mrpFromVendorRate } from '../../../lib/pricing'
import { useCanEdit, PoLink } from './_purchaseKit'

const ELIGIBLE = (p) => p.type !== 'DOMESTIC' && !['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED'].includes(p.status)

export function LabelCard({ product, mrp, company, code }) {
  return (
    <div className="border-2 border-ink-900 rounded-lg p-3 bg-white text-ink-900 w-full max-w-[340px] break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
      <div className="flex items-start justify-between gap-2 border-b border-ink-900/20 pb-1.5">
        <div className="text-xl font-black italic tracking-tight leading-none"><span>B</span><span className="text-brand-500">TALI</span></div>
        <div className="text-[9px] text-right leading-tight text-slate-600">{product.category}<br />Model {product.sku}</div>
      </div>
      <div className="text-[13px] font-bold mt-1.5 leading-snug">{product.name}</div>
      <div className="text-[9px] text-slate-600 mt-0.5 leading-snug">{Object.entries(product.specs || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
      <div className="flex items-end justify-between mt-2">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-slate-500">M.R.P. (incl. of all taxes)</div>
          <div className="text-2xl font-black tabular-nums leading-none">{fmtINR(mrp)}</div>
          <div className="text-[9px] text-slate-500 mt-0.5">Qty: 1 {product.uom === 'Nos' ? 'N' : product.uom} · Month/Yr of mfg: as on pack</div>
        </div>
        <Barcode value={code || product.sku} height={26} width={1} fontSize={9} />
      </div>
      <div className="text-[8.5px] text-slate-600 mt-1.5 leading-snug border-t border-ink-900/20 pt-1">
        Imported & Marketed by: {company.legalName}, {company.address}.<br />
        Customer care: {company.phone} · care@btali.in · {company.website} · Country of origin: China
      </div>
    </div>
  )
}

export default function MrpLabels() {
  const [sp, setSp] = useSearchParams()
  const s = useStore()
  const { canEdit } = useCanEdit()
  const pos = s.purchaseOrders.filter(ELIGIBLE)
  const poId = sp.get('po') || pos.find((p) => !p.mrpConfirmed)?.id || pos[0]?.id
  const po = s.purchaseOrders.find((p) => p.id === poId)
  const [mult, setMult] = useState(s.settings.mrpMultiplier)
  const [over, setOver] = useState({})
  useEffect(() => setOver({}), [poId])

  const rows = useMemo(() => (po ? po.lines.map((l) => {
    const p = s.products.find((x) => x.id === l.productId)
    const fx = s.settings.fx[po.currency] || 1
    const calc = mrpFromVendorRate(l.rate, po.currency, { fx: s.settings.fx, mrpMultiplier: Number(mult) || 3 })
    const final = over[l.productId] ?? calc
    return { l, p, fx, calc, final, current: p.mrp, landed: p.landedCost, margin: p.landedCost ? ((final * 0.5 - p.landedCost) / (final * 0.5)) * 100 : null }
  }) : []), [po, s.products, s.settings, mult, over])

  const confirmMrp = async () => {
    if (!(await confirm({ title: 'Confirm MRP?', message: `MRP for ${rows.length} item(s) will be written to the product master and to ${po.number}. Sales price lists derive from the new MRP.`, confirmText: 'Confirm MRP' }))) return
    s.confirmMrp(po.id, Object.fromEntries(rows.map((r) => [r.p.id, r.final])))
    toast.success('MRP confirmed', 'Product master & PO updated')
  }
  const sendLabels = async () => {
    if (!(await confirm({ title: 'Send label artwork to vendor?', message: `${rows.length} label template(s) will be published on the Vendor Portal and emailed to ${s.vendors.find((v) => v.id === po.vendorId)?.name}.`, confirmText: 'Publish labels' }))) return
    s.sendLabelsToVendor(po.id)
    toast.success('Labels sent to vendor', 'Email + portal notification sent')
  }

  if (!pos.length) return <div><PageHeader title="MRP & Labels" /><Card><EmptyState icon={Tag} title="No approved import POs" message="MRP and labels are prepared once a PO is approved." /></Card></div>

  return (
    <div>
      <PageHeader title="MRP & Labels" subtitle="MRP = vendor rate × FX × multiplier (rounded to ₹10). Confirm, then publish branded labels to the vendor."
        actions={<div className="w-72"><Select value={poId} onChange={(e) => setSp({ po: e.target.value })} options={pos.map((p) => ({ value: p.id, label: `${p.number} · ${s.vendors.find((v) => v.id === p.vendorId)?.name.split(' ').slice(0, 2).join(' ')}${p.mrpConfirmed ? (p.labelsSent ? ' ✓ sent' : ' ✓ MRP') : ''}` }))} /></div>} />

      {po && <>
        <Grid cols={4}>
          <Stat label="Purchase order" value={<PoLink po={po} />} sub={<StatusBadge status={po.status} />} icon={Tag} />
          <Stat label={`FX ${po.currency} → INR`} value={`₹${s.settings.fx[po.currency]}`} sub="From Admin settings" icon={Calculator} tone="ink" />
          <Stat label="MRP status" value={po.mrpConfirmed ? 'Confirmed' : 'Pending'} sub={po.mrpConfirmedAt ? fmtDateTime(po.mrpConfirmedAt) : 'Review & confirm below'} icon={CheckCircle2} tone={po.mrpConfirmed ? 'green' : 'amber'} />
          <Stat label="Labels" value={po.labelsSent ? 'Sent to vendor' : 'Not sent'} sub={po.labelsSentAt ? fmtDateTime(po.labelsSentAt) : 'Publish after MRP confirmation'} icon={Send} tone={po.labelsSent ? 'green' : 'violet'} />
        </Grid>

        <Card className="mt-4" title="MRP calculation" subtitle="Override any line if a rounded market price point is required"
          actions={canEdit && <div className="flex items-end gap-2">
            <Field label="Multiplier" className="w-24"><NumberInput step="0.1" min={1} value={mult} onChange={setMult} /></Field>
            <Button size="sm" variant="secondary" icon={Save} disabled={Number(mult) === s.settings.mrpMultiplier || !mult} onClick={() => { s.updateSettings({ mrpMultiplier: Number(mult) }); toast.success(`Default multiplier set to ×${mult}`) }}>Save as default</Button>
          </div>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-slate-500 bg-slate-50">
                <tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Vendor rate</th><th className="text-right px-3 py-2">× FX</th><th className="text-right px-3 py-2">× Mult.</th><th className="text-right px-3 py-2">Calculated</th><th className="text-right px-3 py-2">Current MRP</th><th className="text-right px-3 py-2 w-36">Final MRP</th><th className="text-right px-3 py-2">Dealer margin*</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.p.id}>
                    <td className="px-3 py-2"><ProductCell product={r.p} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.l.rate, po.currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtINR(r.l.rate * r.fx, true)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">×{mult}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtINR(r.calc)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtINR(r.current)}</td>
                    <td className="px-3 py-2 text-right">
                      {canEdit && !po.labelsSent ? <div className="flex items-center gap-1 justify-end">
                        <NumberInput value={r.final} onChange={(v) => setOver((o) => ({ ...o, [r.p.id]: v }))} className={`text-right w-28 ${over[r.p.id] != null ? 'border-amber-400 bg-amber-50' : ''}`} />
                        {over[r.p.id] != null && <button title="Reset to calculated" className="text-slate-400 hover:text-slate-700" onClick={() => setOver((o) => { const n = { ...o }; delete n[r.p.id]; return n })}><RotateCcw className="w-3.5 h-3.5" /></button>}
                      </div> : <span className="font-semibold tabular-nums">{fmtINR(po.mrpConfirmed ? r.l.mrp : r.final)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.margin == null ? '—' : <Badge tone={r.margin >= s.settings.targetMarginPct ? 'green' : r.margin > 0 ? 'amber' : 'red'}>{r.margin.toFixed(1)}%</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">* Btali margin on dealer price (MRP less 50% base discount, GST extra) vs current landed cost; target {s.settings.targetMarginPct}%.</div>
          {canEdit && (
            <div className="flex flex-wrap gap-2 justify-end mt-3">
              {po.labelsSent && <Alert tone="success" className="mr-auto py-2">Labels already published to the vendor – MRP is locked for this PO.</Alert>}
              {!po.labelsSent && <Button variant={po.mrpConfirmed ? 'secondary' : 'primary'} icon={CheckCircle2} onClick={confirmMrp}>{po.mrpConfirmed ? 'Re-confirm MRP' : 'Confirm MRP'}</Button>}
              {!po.labelsSent && <Button icon={Send} disabled={!po.mrpConfirmed} title={!po.mrpConfirmed ? 'Confirm MRP first' : ''} onClick={sendLabels}>Send to Vendor Portal</Button>}
            </div>
          )}
        </Card>

        <Card className="mt-4" title="Label sheet" subtitle="Branded Btali MRP label – printed and applied by the vendor before QC">
          <PrintArea title={`MRP labels – ${po.number}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 justify-items-center">
              {rows.map((r) => <LabelCard key={r.p.id} product={r.p} mrp={po.mrpConfirmed ? r.l.mrp : r.final} company={s.settings.company} />)}
            </div>
            <div className="text-[10px] text-slate-400 mt-3 text-center">{po.number} · {rows.length} label template(s) · {fmtNum(po.lines.reduce((a, l) => a + l.qty, 0))} units to label</div>
          </PrintArea>
        </Card>
      </>}
    </div>
  )
}
