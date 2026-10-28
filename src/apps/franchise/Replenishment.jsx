import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Send, Sparkles, ClipboardList, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, StatusBadge, Grid, Stat, Checkbox, NumberInput, ProductImage, Textarea, Field, Modal, Drawer, Timeline, EmptyState, Alert, toast, confirm } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { LineItemsEditor } from '../../components/business'
import { fmtDate, fmtNum, sum, daysAgo, round2 } from '../../lib/format'
import { usePortal } from '../dealer/_portal'

export function useSuggestions(partner) {
  const products = useStore((s) => s.products)
  const posOrders = useStore((s) => s.posOrders) || []
  return useMemo(() => {
    if (!partner) return []
    const since = daysAgo(30)
    const sold = {}
    for (const o of posOrders.filter((x) => x.partnerId === partner.id && x.date >= since)) for (const l of o.lines) sold[l.productId] = (sold[l.productId] || 0) + l.qty
    const ids = new Set([...Object.keys(partner.stockMin || {}), ...Object.keys(sold)])
    return [...ids].map((pid) => {
      const p = products.find((x) => x.id === pid)
      if (!p) return null
      const stock = partner.stock?.[pid] || 0
      const min = partner.stockMin?.[pid] ?? (p.type === 'SPARE' ? 10 : 2)
      const perDay = (sold[pid] || 0) / 30
      const cover = perDay ? stock / perDay : null
      const need = Math.max(min * 2 - stock, Math.ceil(perDay * 30) - stock, 0)
      const reason = stock < min ? 'Below minimum' : cover != null && cover < 10 ? `Only ${Math.floor(cover)} days cover` : null
      return reason && need > 0 ? { p, pid, stock, min, sold30: sold[pid] || 0, perDay: round2(perDay), cover, qty: need, reason } : null
    }).filter(Boolean).sort((a, b) => a.stock / (a.min || 1) - b.stock / (b.min || 1))
  }, [partner, products, posOrders])
}

export default function Replenishment() {
  const nav = useNavigate()
  const { partnerId, partner } = usePortal()
  const all = useStore((s) => s.replenishments) || []
  const salesOrders = useStore((s) => s.salesOrders)
  const products = useStore((s) => s.products)
  const request = useStore((s) => s.requestReplenishment)
  const cancel = useStore((s) => s.cancelReplenishment)
  const sugg = useSuggestions(partner)
  const mine = useMemo(() => all.filter((r) => r.partnerId === partnerId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [all, partnerId])
  const [pick, setPick] = useState({})
  const [qty, setQty] = useState({})
  const [manual, setManual] = useState(false)
  const [lines, setLines] = useState([{ productId: '', qty: 1 }])
  const [note, setNote] = useState('')
  const [sel, setSel] = useState(null)
  const pendingPids = new Set(mine.filter((r) => r.status === 'REQUESTED').flatMap((r) => r.lines.map((l) => l.productId)))
  const chosen = sugg.filter((s) => pick[s.pid] ?? !pendingPids.has(s.pid))

  const raise = async () => {
    const ls = chosen.map((s) => ({ productId: s.pid, qty: Number(qty[s.pid] ?? s.qty) || 0 })).filter((l) => l.qty > 0)
    if (!ls.length) return toast.error('Select at least one item')
    if (!(await confirm({ title: 'Send replenishment request?', message: `${ls.length} item(s) · ${fmtNum(sum(ls, (l) => l.qty))} units to Btali Sales for approval.`, confirmText: 'Send request' }))) return
    const r = request({ partnerId, lines: ls, auto: true, note: 'Raised from POS sell-through suggestions' })
    if (r.ok) { toast.success(`${r.replenishment.number} sent`, 'Btali Sales will approve and convert it to an order'); setPick({}); setQty({}) }
  }
  const raiseManual = () => {
    const r = request({ partnerId, lines, note, auto: false })
    if (!r.ok) return toast.error('Could not send', r.error)
    toast.success(`${r.replenishment.number} sent`, 'Btali Sales has been notified')
    setManual(false); setLines([{ productId: '', qty: 1 }]); setNote('')
  }
  const pname = (id) => products.find((p) => p.id === id)?.shortName
  const r = mine.find((x) => x.id === sel)

  return (
    <div>
      <PageHeader title="Replenishment" subtitle={`Stock top-ups from Btali warehouse · auto-replenishment ${partner?.autoReplenish ? 'ON' : 'OFF'}`}
        actions={<Button variant="secondary" icon={ClipboardList} onClick={() => setManual(true)}>Manual request</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={Sparkles} tone="brand" label="To replenish" value={sugg.length} sub="Below min or < 10 days cover" />
        <Stat icon={Clock} tone="amber" label="Pending" value={mine.filter((x) => x.status === 'REQUESTED').length} />
        <Stat icon={CheckCircle2} tone="green" label="Ordered" value={mine.filter((x) => x.status === 'ORDERED').length} />
        <Stat icon={XCircle} tone="red" label="Rejected" value={mine.filter((x) => x.status === 'REJECTED').length} />
      </Grid>
      <Card title="Suggested replenishment" subtitle="Based on store minimums and last 30 days POS sell-through" className="mb-4"
        actions={sugg.length > 0 && <Button icon={Send} onClick={raise} disabled={!chosen.length}>Request {chosen.length} item(s)</Button>}>
        {sugg.length === 0 ? <EmptyState icon={CheckCircle2} title="Stock is healthy" message="No item is below minimum or running out within 10 days." /> : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="w-10 px-4" /><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">In store</th><th className="text-right px-3 py-2">Min</th><th className="text-right px-3 py-2">Sold 30d</th><th className="text-right px-3 py-2">Cover</th><th className="text-left px-3 py-2">Reason</th><th className="text-center px-3 py-2">Request qty</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sugg.map((s) => (
                  <tr key={s.pid}>
                    <td className="px-4"><Checkbox checked={pick[s.pid] ?? !pendingPids.has(s.pid)} onChange={(v) => setPick({ ...pick, [s.pid]: v })} /></td>
                    <td className="px-3 py-2"><div className="flex items-center gap-2"><ProductImage product={s.p} size="sm" /><div><div className="font-medium">{s.p.shortName}</div><div className="text-[11px] text-slate-500">{s.p.sku}{pendingPids.has(s.pid) ? ' · already requested' : ''}</div></div></div></td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.stock}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.min}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.sold30}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.cover == null ? '—' : `${Math.floor(s.cover)} d`}</td>
                    <td className="px-3 py-2"><Badge tone={s.stock === 0 ? 'red' : 'amber'}>{s.stock === 0 ? 'Out of stock' : s.reason}</Badge></td>
                    <td className="px-3 py-2"><NumberInput min={0} value={qty[s.pid] ?? s.qty} onChange={(v) => setQty({ ...qty, [s.pid]: v })} className="!w-20 mx-auto text-center py-1" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Requests" padded={false}>
        <DataTable rows={mine} className="border-0 shadow-none" onRowClick={(x) => setSel(x.id)} initialSort={{ key: 'createdAt', dir: 'desc' }} exportName={`Replenishments-${partner?.code}`}
          empty={<EmptyState icon={RotateCcw} title="No requests yet" />}
          columns={[
            { key: 'number', header: 'Request', render: (x) => <div><span className="font-mono font-medium">{x.number}</span>{x.auto && <Badge tone="violet" className="ml-2">Auto</Badge>}</div> },
            { key: 'createdAt', header: 'Date', render: (x) => fmtDate(x.createdAt || x.date) },
            { key: 'items', header: 'Items', value: (x) => x.lines.map((l) => `${pname(l.productId)} ×${l.qty}`).join(', '), render: (x) => <div className="text-xs text-slate-600 max-w-[320px] truncate">{x.lines.map((l) => `${pname(l.productId)} ×${l.qty}`).join(', ')}</div> },
            { key: 'units', header: 'Units', align: 'right', value: (x) => sum(x.lines, (l) => l.qty) },
            { key: 'so', header: 'Order', value: (x) => salesOrders.find((s) => s.id === x.soId)?.number || '', render: (x) => (x.soId ? <Button size="sm" variant="link" onClick={(e) => { e.stopPropagation(); nav(`/franchise/orders?so=${x.soId}`) }}>{salesOrders.find((s) => s.id === x.soId)?.number}</Button> : '—') },
            { key: 'status', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
          ]} />
      </Card>
      <Modal open={manual} onClose={() => setManual(false)} title="Manual replenishment request" size="lg"
        footer={<><Button variant="secondary" onClick={() => setManual(false)}>Cancel</Button><Button icon={Send} disabled={!lines.some((l) => l.productId && l.qty > 0)} onClick={raiseManual}>Send request</Button></>}>
        <LineItemsEditor lines={lines} onChange={setLines} mode="dealer" partnerId={partnerId} />
        <Field label="Note for Btali Sales" className="mt-3"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. customer pre-orders, upcoming local fair" /></Field>
      </Modal>
      <Drawer open={!!r} onClose={() => setSel(null)} title={r?.number} subtitle={r && `${fmtDate(r.createdAt || r.date)} · ${r.auto ? 'Auto-suggested' : 'Manual'}`}
        footer={r?.status === 'REQUESTED' && <Button variant="danger" onClick={() => { cancel(r.id); toast.success('Request withdrawn', r.number) }}>Withdraw request</Button>}>
        {r && (
          <div className="space-y-4">
            <StatusBadge status={r.status} />
            {r.remark && <Alert tone={r.status === 'REJECTED' ? 'error' : 'info'}>{r.remark}</Alert>}
            {r.note && <div className="text-sm text-slate-600">{r.note}</div>}
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">{r.lines.map((l) => <div key={l.productId} className="flex justify-between px-3 py-2 text-sm"><span>{pname(l.productId)}</span><span className="tabular-nums">× {l.qty}</span></div>)}</div>
            <Timeline items={[...(r.history || [])].reverse()} />
          </div>
        )}
      </Drawer>
    </div>
  )
}
