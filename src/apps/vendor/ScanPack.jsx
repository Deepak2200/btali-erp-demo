import React, { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ScanLine, Boxes, Package, Weight, FileCheck2, Undo2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Grid, Stat, Select, Progress, Button, Badge, EmptyState, Alert, IconButton, toast, confirm, cx } from '../../components/ui'
import { ScanInput, ProductCell } from '../../components/business'
import { fmtNum, fmtDate } from '../../lib/format'
import { packingSummary } from '../../store/slices/vendor'
import { useVendorScope } from './_parts'

export default function ScanPack() {
  const { pos } = useVendorScope()
  const units = useStore((s) => s.units)
  const purchaseOrders = useStore((s) => s.purchaseOrders)
  const products = useStore((s) => s.products)
  const pack = useStore((s) => s.vndPackUnit)
  const unpack = useStore((s) => s.vndUnpackUnit)
  const generate = useStore((s) => s.vndGeneratePackingList)
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const eligible = pos.filter((p) => ['IN_PRODUCTION', 'QC_PENDING', 'READY_TO_SHIP'].includes(p.status) && units.some((u) => u.poId === p.id))
  const poId = params.get('po') || eligible.find((p) => units.some((u) => u.poId === p.id && u.status === 'GENERATED'))?.id || eligible[0]?.id || ''
  const po = purchaseOrders.find((p) => p.id === poId)
  const [log, setLog] = useState([])
  const sum = useMemo(() => (po ? packingSummary(useStore.getState(), po.id) : null), [po, units]) // eslint-disable-line
  const pending = units.filter((u) => u.poId === poId && u.status === 'GENERATED').map((u) => u.code)
  const packed = units.filter((u) => u.poId === poId && u.status === 'PACKED')

  const onScan = (code) => {
    const r = pack(poId, code)
    const u = r.unit || units.find((x) => x.code === code)
    const p = u && products.find((x) => x.id === u.productId)
    setLog((l) => [{ ts: Date.now(), code, ok: r.ok, msg: r.ok ? `${p?.shortName || p?.name} packed` : r.error, dup: r.duplicate }, ...l].slice(0, 50))
    if (!r.ok) toast.error(r.error)
  }
  const finish = async () => {
    const short = sum.totals.barcodes - sum.totals.packed
    if (!(await confirm({ title: 'Generate final packing list', message: short > 0 ? `${short} barcode(s) have not been scanned. They will be excluded from the packing list and treated as short shipment. Continue?` : `All ${sum.totals.packed} barcodes scanned. Generate the final packing list and send it to Btali?`, confirmText: 'Generate & send', tone: short > 0 ? 'danger' : undefined }))) return
    generate(poId)
    toast.success('Final packing list generated', 'Sent to Btali Purchase.')
    nav(`/vendor/orders/${poId}?tab=pl`)
  }

  if (!eligible.length) return (
    <div>
      <PageHeader title="Scan-to-Pack" subtitle="Generate packing lists by scanning Btali barcodes during loading" />
      <Card><EmptyState icon={ScanLine} title="No orders ready for packing" message="Orders appear here once Btali has issued barcodes and production is under way." /></Card>
    </div>
  )

  return (
    <div>
      <PageHeader title="Scan-to-Pack" subtitle="Scan every unit / carton while loading – the packing list is built from the scans"
        actions={<Button icon={FileCheck2} disabled={!sum?.totals.packed} onClick={finish}>Generate final packing list</Button>} />
      <Card className="mb-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="md:w-80">
            <div className="text-xs font-medium text-slate-600 mb-1">Purchase order</div>
            <Select value={poId} onChange={(e) => { setParams({ po: e.target.value }); setLog([]) }} options={eligible.map((p) => ({ value: p.id, label: `${p.number} · ${p.status.replace(/_/g, ' ').toLowerCase()}` }))} />
          </div>
          <ScanInput className="flex-1 flex-wrap sm:flex-nowrap [&>div:first-child]:basis-full sm:[&>div:first-child]:basis-auto" onScan={onScan} suggestions={pending} placeholder="Scan barcode with the handheld scanner" />
        </div>
        {po?.packingList?.generatedAt && <Alert tone="info" className="mt-3">A packing list was generated on {fmtDate(po.packingList.generatedAt)}. Generating again replaces it.</Alert>}
      </Card>
      <Grid cols={4} className="mb-4">
        <Stat label="Scanned" value={`${fmtNum(sum.totals.packed)} / ${fmtNum(sum.totals.barcodes)}`} icon={ScanLine} sub="barcodes" />
        <Stat label="Cartons" value={fmtNum(sum.totals.cartons)} icon={Boxes} tone="ink" />
        <Stat label="Volume" value={`${fmtNum(sum.totals.cbm)} CBM`} icon={Package} tone="blue" />
        <Stat label="Gross weight" value={`${fmtNum(sum.totals.weight)} kg`} icon={Weight} tone="violet" />
      </Grid>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Packed vs ordered" className="lg:col-span-2" padded={false}>
          <div className="divide-y divide-slate-100">
            {sum.lines.map((l) => {
              const done = l.barcodes > 0 && l.packedBarcodes === l.barcodes
              return (
                <div key={l.productId} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <ProductCell id={l.productId} sub={`${l.barcodes} barcodes`} />
                    <div className="text-right text-sm"><span className="font-bold tabular-nums">{fmtNum(l.qty)}</span><span className="text-slate-400"> / {fmtNum(l.ordered)} pcs</span>{done && <CheckCircle2 className="w-4 h-4 text-emerald-500 inline ml-1.5" />}</div>
                  </div>
                  <Progress className="mt-2" value={l.packedBarcodes} max={l.barcodes || 1} tone={done ? 'green' : 'brand'} showLabel />
                  <div className="text-[11px] text-slate-500 mt-1">{fmtNum(l.cartons)} cartons · {fmtNum(l.cbm)} CBM · {fmtNum(l.weight)} kg</div>
                </div>
              )
            })}
          </div>
        </Card>
        <Card title="Scan log" padded={false}>
          {log.length === 0 && packed.length === 0 ? <EmptyState icon={ScanLine} title="Start scanning" message="Each scan is validated against this order." /> : (
            <ul className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
              {log.map((e) => (
                <li key={e.ts + e.code} className={cx('px-4 py-2 flex items-center gap-2', !e.ok && 'bg-red-50/50')}>
                  {e.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : e.dup ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  <div className="flex-1 min-w-0"><div className="font-mono text-xs">{e.code}</div><div className="text-[11px] text-slate-500 truncate">{e.msg}</div></div>
                  {e.ok && units.find((u) => u.code === e.code)?.status === 'PACKED' && <IconButton icon={Undo2} title="Undo scan" onClick={() => { unpack(e.code); setLog((l) => l.filter((x) => x !== e)); toast.info(`${e.code} removed from packing`) }} />}
                </li>
              ))}
              {log.length === 0 && packed.slice(-20).reverse().map((u) => (
                <li key={u.code} className="px-4 py-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="font-mono text-xs flex-1">{u.code}</span><Badge tone="blue">Packed</Badge></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
