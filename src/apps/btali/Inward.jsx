import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PackageCheck, ScanLine, CheckCircle2, AlertTriangle, Camera, ClipboardCheck } from 'lucide-react'
import { useStore, useLookup } from '../../store'
import { PageHeader, Card, Button, StatusBadge, Badge, Field, Select, NumberInput, Textarea, FileUpload, MediaGrid, Alert, EmptyState, Drawer, DescriptionList, SectionTitle, Progress, Input, confirm, toast, cx } from '../../components/ui'
import { ProductCell, ScanInput } from '../../components/business'
import DataTable from '../../components/DataTable'
import { fmtNum, fmtDate, sum } from '../../lib/format'
import { shipmentLines } from './Containers'

function GrnDrawer({ id, onClose }) {
  const sh = useStore((s) => s.shipments.find((x) => x.id === id))
  const { user } = useLookup()
  const inw = sh.inward
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={`${inw.grnNo} · ${sh.number}`} subtitle={`${sh.containerNo} · received ${fmtDate(inw.date)}`}>
      <DescriptionList cols={3} items={[['GRN', inw.grnNo], ['Received on', fmtDate(inw.date)], ['Received by', user(inw.receivedBy)?.name || 'Btali desk'], ['Discrepancies', inw.discrepancies?.length || 0], ['QC files', inw.qcMedia?.length || 0], ['Remarks', inw.remarks || '—']]} />
      {inw.lines?.length > 0 && (
        <>
          <SectionTitle className="mt-5">Received quantities</SectionTitle>
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Expected</th><th className="text-right px-3 py-2">Received</th><th className="text-right px-3 py-2">Variance</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {inw.lines.map((l) => (
                  <tr key={l.productId}><td className="px-3 py-2"><ProductCell id={l.productId} /></td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.expected)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.received)}</td>
                    <td className={cx('px-3 py-2 text-right tabular-nums font-medium', l.received < l.expected ? 'text-red-600' : l.received > l.expected ? 'text-violet-600' : 'text-emerald-600')}>{l.received - l.expected > 0 ? '+' : ''}{l.received - l.expected}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <SectionTitle className="mt-5">QC photos & videos</SectionTitle>
      {inw.qcMedia?.length ? <MediaGrid items={inw.qcMedia} /> : <div className="text-sm text-slate-400">No QC media recorded.</div>}
    </Drawer>
  )
}

export default function Inward() {
  const [params, setParams] = useSearchParams()
  const shipments = useStore((s) => s.shipments)
  const purchaseOrders = useStore((s) => s.purchaseOrders)
  const products = useStore((s) => s.products)
  const units = useStore((s) => s.units)
  const receiveShipment = useStore((s) => s.receiveShipment)
  const { product } = useLookup()
  const pending = shipments.filter((s) => s.status !== 'RECEIVED').sort((a, b) => (a.eta < b.eta ? -1 : 1))
  const [shId, setShId] = useState(() => params.get('shipment') || pending.find((s) => s.status === 'AT_PORT' || s.status === 'CLEARED')?.id || pending[0]?.id || '')
  const sh = shipments.find((s) => s.id === shId)
  const expected = useMemo(() => {
    if (!sh) return []
    const m = {}
    for (const l of shipmentLines(sh, purchaseOrders, products)) m[l.productId] = (m[l.productId] || 0) + l.qty
    return Object.entries(m).map(([productId, qty]) => ({ productId, expected: qty }))
  }, [sh, purchaseOrders, products])
  const shUnits = useMemo(() => (sh ? units.filter((u) => sh.poIds.includes(u.poId) && ['IN_TRANSIT', 'PACKED', 'GENERATED'].includes(u.status)) : []), [sh, units])
  const [recv, setRecv] = useState({})
  const [scanned, setScanned] = useState([])
  const [media, setMedia] = useState([])
  const [remarks, setRemarks] = useState('')
  const [result, setResult] = useState(null)
  const [openGrn, setOpenGrn] = useState(null)

  const pickShipment = (id) => {
    setShId(id); setRecv({}); setScanned([]); setMedia([]); setRemarks(''); setResult(null)
    setParams(id ? { shipment: id } : {}, { replace: true })
  }
  const onScan = (code) => {
    const u = shUnits.find((x) => x.code === code)
    if (!u) {
      const other = units.find((x) => x.code === code)
      return toast.error('Barcode not in this container', other ? `${code} belongs to ${product(other.productId)?.shortName} (${other.status.replace(/_/g, ' ').toLowerCase()})` : `${code} is not a Btali barcode`)
    }
    if (scanned.includes(code)) return toast.warn('Already scanned', code)
    setScanned((s) => [code, ...s])
    setRecv((r) => ({ ...r, [u.productId]: (r[u.productId] || 0) + (u.packQty || 1) }))
  }
  const suggestions = shUnits.map((u) => u.code).filter((c) => !scanned.includes(c))
  const lines = expected.map((l) => ({ ...l, received: recv[l.productId] ?? 0 }))
  const totExp = sum(lines, (l) => l.expected), totRec = sum(lines, (l) => l.received)
  const variances = lines.filter((l) => l.received !== l.expected)

  const submit = async () => {
    if (!totRec) return toast.error('Nothing received yet', 'Scan barcodes or enter received quantities.')
    const ok = await confirm({ title: `Post GRN for ${sh.number}?`, message: `${fmtNum(totRec)} of ${fmtNum(totExp)} units received.${variances.length ? `\n${variances.length} line(s) differ – a discrepancy ticket will be raised for Purchase.` : ''}\nStock at Btali will be updated immediately.`, confirmText: 'Post GRN' })
    if (!ok) return
    const r = receiveShipment(sh.id, { lines, qcMedia: media.map((m) => ({ ...m, caption: m.caption || m.name })), remarks })
    setResult({ ...r, number: sh.number })
    toast.success(`${r.grnNo} posted`, r.discrepancies.length ? `${r.discrepancies.length} discrepancies ticketed to Purchase` : 'Stock updated – no discrepancies')
    setShId(''); setRecv({}); setScanned([]); setMedia([]); setRemarks('')
  }

  const received = shipments.filter((s) => s.inward?.grnNo).sort((a, b) => (a.inward.date < b.inward.date ? 1 : -1))

  return (
    <div>
      <PageHeader title="Goods inward & QC" subtitle="Scan container cartons, record QC photos/videos and post the GRN to Btali ERP" />
      {result && (
        <Alert className="mb-4" tone={result.discrepancies.length ? 'warn' : 'success'} title={`${result.grnNo} posted for ${result.number}`}
          action={<Button size="sm" variant="secondary" onClick={() => setResult(null)}>Dismiss</Button>}>
          {result.discrepancies.length ? `${result.discrepancies.length} discrepancy line(s): ${result.discrepancies.map((d) => `${product(d.productId)?.sku} ${d.type.toLowerCase()} ${Math.abs(d.received - d.expected)}`).join(', ')} – ticket raised to Purchase.` : 'All quantities matched. Stock is live in ERP.'}
        </Alert>
      )}
      <Card>
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <Field label="Container / shipment" className="md:w-96">
            <Select value={shId} onChange={(e) => pickShipment(e.target.value)} placeholder="Select arriving container…" options={pending.map((s) => ({ value: s.id, label: `${s.number} · ${s.containerNo} · ETA ${fmtDate(s.eta)} · ${s.status.replace(/_/g, ' ')}` }))} />
          </Field>
          {sh && <div className="flex items-center gap-2 text-sm text-slate-600 flex-wrap"><StatusBadge status={sh.status} /><span>BL {sh.blNo}</span><span>· {expected.length} SKUs · {fmtNum(totExp)} units expected</span>{sh.btaliPlan?.bay && <Badge tone="green">{sh.btaliPlan.bay}</Badge>}</div>}
        </div>
      </Card>

      {!sh ? (
        <Card className="mt-4"><EmptyState icon={PackageCheck} title="Select a container to start inward" message={pending.length ? 'Choose an arriving container above.' : 'No containers pending inward.'} /></Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4 mt-4">
          <div className="lg:col-span-2 space-y-4">
            <Card title="Scan & count" subtitle={shUnits.length ? `${shUnits.length} barcoded units/cartons in this container` : 'Enter received quantities per product'}
              actions={<Button size="sm" variant="secondary" icon={ClipboardCheck} onClick={() => setRecv(Object.fromEntries(expected.map((l) => [l.productId, l.expected])))}>Fill as expected</Button>}>
              {shUnits.length > 0 && <ScanInput onScan={onScan} suggestions={suggestions} className="mb-3" />}
              <div className="mb-3"><Progress value={totRec} max={totExp || 1} tone={totRec > totExp ? 'amber' : 'green'} showLabel /></div>
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Expected</th><th className="text-right px-3 py-2 w-32">Received</th><th className="text-right px-3 py-2">Variance</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => {
                      const v = l.received - l.expected
                      return (
                        <tr key={l.productId}>
                          <td className="px-3 py-2"><ProductCell id={l.productId} /></td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.expected)}</td>
                          <td className="px-3 py-2"><NumberInput min={0} value={recv[l.productId] ?? ''} placeholder="0" onChange={(val) => setRecv((r) => ({ ...r, [l.productId]: val === '' ? 0 : val }))} className="text-right" /></td>
                          <td className={cx('px-3 py-2 text-right tabular-nums font-medium', v < 0 ? 'text-red-600' : v > 0 ? 'text-violet-600' : 'text-emerald-600')}>{v > 0 ? '+' : ''}{v}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {scanned.length > 0 && <div className="mt-3 text-xs text-slate-500"><ScanLine className="w-3.5 h-3.5 inline mr-1" />{scanned.length} scanned: <span className="font-mono">{scanned.slice(0, 8).join(', ')}{scanned.length > 8 ? ' …' : ''}</span></div>}
            </Card>
          </div>
          <div className="space-y-4">
            <Card title="QC documentation" subtitle="Photos / videos of seal, cartons and samples (record only)">
              <FileUpload accept="image/*,video/*" label="Add photos or videos" compact onFiles={(a) => setMedia((m) => [...m, ...a])} />
              {media.length > 0 && <div className="mt-3"><MediaGrid items={media} renderActions={(m) => <Button size="sm" variant="ghost" onClick={() => setMedia((x) => x.filter((y) => y.id !== m.id))}>Remove</Button>} /></div>}
              <Field label="QC remarks" className="mt-3"><Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Seal intact, 2 cartons crushed on top row…" /></Field>
            </Card>
            <Card>
              <div className="space-y-1 text-sm mb-3">
                <div className="flex justify-between"><span className="text-slate-500">Expected</span><span className="tabular-nums">{fmtNum(totExp)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Received</span><span className="tabular-nums font-semibold">{fmtNum(totRec)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Lines with variance</span><span className={variances.length ? 'text-red-600 font-semibold' : 'text-emerald-600'}>{variances.length}</span></div>
              </div>
              {variances.length > 0 && totRec > 0 && <Alert tone="warn" className="mb-3">A discrepancy ticket will be raised to Purchase on posting.</Alert>}
              <Button className="w-full" icon={CheckCircle2} onClick={submit}>Post GRN & update stock</Button>
            </Card>
          </div>
        </div>
      )}

      <h3 className="text-sm font-semibold text-slate-900 mt-6 mb-2">Inward history</h3>
      <DataTable rows={received} onRowClick={(r) => setOpenGrn(r.id)} pageSize={8} exportName="btali-grn"
        columns={[
          { key: 'grn', header: 'GRN', value: (r) => r.inward.grnNo, render: (r) => <span className="font-mono text-xs">{r.inward.grnNo}</span> },
          { key: 'number', header: 'Shipment' },
          { key: 'containerNo', header: 'Container' },
          { key: 'date', header: 'Received', value: (r) => r.inward.date, render: (r) => fmtDate(r.inward.date) },
          { key: 'qty', header: 'Units', align: 'right', value: (r) => sum(r.inward.lines || [], (l) => l.received) },
          { key: 'disc', header: 'Discrepancies', value: (r) => r.inward.discrepancies?.length || 0, render: (r) => r.inward.discrepancies?.length ? <Badge tone="red"><AlertTriangle className="w-3 h-3" />{r.inward.discrepancies.length}</Badge> : <Badge tone="green">None</Badge> },
          { key: 'qc', header: 'QC media', value: (r) => r.inward.qcMedia?.length || 0, render: (r) => <span className="text-xs text-slate-600"><Camera className="w-3.5 h-3.5 inline mr-1" />{r.inward.qcMedia?.length || 0}</span> },
        ]} empty={<EmptyState title="No GRNs posted yet" />} />
      {openGrn && <GrnDrawer id={openGrn} onClose={() => setOpenGrn(null)} />}
    </div>
  )
}
