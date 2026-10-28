import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Trash2, Banknote, Smartphone, CreditCard, Plus, ShieldCheck, Receipt, LockOpen, Lock, UserRound, X } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, Field, Input, NumberInput, Textarea, Combobox, ProductImage, Alert, Modal, IconButton, Barcode, toast, cx } from '../../components/ui'
import { ScanInput } from '../../components/business'
import { fmtINR, fmtNum, fmtDateTime, round2, sum, timeAgo } from '../../lib/format'
import { usePortal, isPendingInward } from '../dealer/_portal'

const METHODS = [{ key: 'CASH', label: 'Cash', icon: Banknote }, { key: 'UPI', label: 'UPI', icon: Smartphone }, { key: 'CARD', label: 'Card', icon: CreditCard }]
const MAX_DISC = 10

export function usePendingInwardCodes(partnerId) {
  const invoices = useStore((s) => s.invoices)
  return useMemo(() => new Set(invoices.filter((i) => isPendingInward(i, partnerId)).flatMap((i) => i.units || [])), [invoices, partnerId])
}

export default function POS() {
  const nav = useNavigate()
  const { partnerId, partner } = usePortal()
  const sessions = useStore((s) => s.posSessions) || []
  const session = sessions.find((s) => s.partnerId === partnerId && s.status === 'OPEN')
  const posOrders = useStore((s) => s.posOrders) || []
  const openPosSession = useStore((s) => s.openPosSession)
  const [opening, setOpening] = useState(2000)
  const [openNote, setOpenNote] = useState('')

  if (!session) {
    const last = sessions.filter((s) => s.partnerId === partnerId && s.status === 'CLOSED').sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''))[0]
    return (
      <div className="max-w-lg mx-auto">
        <PageHeader title="POS checkout" subtitle={partner?.name} />
        <Card>
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3"><Lock className="w-6 h-6" /></div>
            <div className="font-semibold text-slate-900">No open POS session</div>
            <div className="text-sm text-slate-500 mt-1">Count the cash drawer and open a session to start billing.</div>
            {last && <div className="text-xs text-slate-400 mt-2">Last session {last.number} closed {timeAgo(last.closedAt)} · counted {fmtINR(last.countedCash)}</div>}
          </div>
          <div className="space-y-3">
            <Field label="Opening cash in drawer (₹)" required><NumberInput min={0} value={opening} onChange={setOpening} /></Field>
            <Field label="Note"><Textarea rows={2} value={openNote} onChange={(e) => setOpenNote(e.target.value)} placeholder="Optional" /></Field>
            <Button size="lg" className="w-full" icon={LockOpen} disabled={opening === ''} onClick={() => { const s = openPosSession(partnerId, { openingCash: opening, note: openNote }); toast.success('Session opened', `${s.number} · opening cash ${fmtINR(opening)}`) }}>Open session</Button>
          </div>
        </Card>
      </div>
    )
  }
  const inSession = posOrders.filter((o) => o.sessionId === session.id)
  return (
    <div>
      <PageHeader title="POS checkout" subtitle={<span>{session.number} · opened {fmtDateTime(session.openedAt)} · {inSession.length} bills · {fmtINR(sum(inSession, (o) => o.total))}</span>}
        actions={<Button variant="secondary" icon={Lock} onClick={() => nav('/franchise/sessions')}>Close session</Button>} />
      <Checkout partnerId={partnerId} partner={partner} session={session} />
    </div>
  )
}

function Checkout({ partnerId, partner, session }) {
  const products = useStore((s) => s.products)
  const units = useStore((s) => s.units)
  const posCheckout = useStore((s) => s.posCheckout)
  const sendEmail = useStore((s) => s.sendEmail)
  const pending = usePendingInwardCodes(partnerId)
  const [lines, setLines] = useState([])
  const [cust, setCust] = useState({ name: '', phone: '', city: partner?.city || '' })
  const [pays, setPays] = useState([])
  const [err, setErr] = useState('')
  const [receipt, setReceipt] = useState(null)
  const product = (id) => products.find((p) => p.id === id)
  const stock = partner?.stock || {}
  const inCart = new Set(lines.map((l) => l.barcode).filter(Boolean))
  const sellable = units.filter((u) => u.partnerId === partnerId && u.status === 'AT_PARTNER' && !pending.has(u.code))
  const suggestions = sellable.filter((u) => !inCart.has(u.code)).map((u) => u.code)
  const qtyInCart = (pid) => sum(lines.filter((l) => l.productId === pid), (l) => l.qty)

  const priceOf = (l) => round2(l.mrp * (1 - (Number(l.discountPct) || 0) / 100))
  const total = round2(sum(lines, (l) => priceOf(l) * l.qty))
  const paid = round2(sum(pays, (p) => Number(p.amount) || 0))
  const balance = round2(total - paid)

  const scan = (code) => {
    setErr('')
    const u = units.find((x) => x.code.toUpperCase() === code)
    if (!u) return setErr(`${code} – not a Btali barcode`)
    if (inCart.has(u.code)) return setErr(`${code} is already in this bill`)
    if (u.status === 'SOLD') return setErr(`${code} was already sold${u.saleDate ? ` on ${u.saleDate}` : ''}`)
    if (u.partnerId !== partnerId || u.status !== 'AT_PARTNER') return setErr(`${code} is not in this store's stock`)
    if (pending.has(u.code)) return setErr(`${code} is in a consignment not yet inwarded – scan it in Stock Inward first`)
    const p = product(u.productId)
    setLines((s) => [...s, { key: u.code, productId: p.id, barcode: u.code, qty: 1, mrp: p.mrp, discountPct: 0 }])
    toast.success('Added', `${p.shortName} · ${u.code}`)
  }
  const addProduct = (pid) => {
    setErr('')
    const p = product(pid)
    if ((stock[pid] || 0) - qtyInCart(pid) <= 0) return setErr(`${p.shortName} – no stock in store`)
    if (p.type === 'FG' && sellable.some((u) => u.productId === pid)) toast.warn('Scan the unit barcode', 'Barcode scan is mandatory for finished goods so the warranty is activated')
    const ex = lines.find((l) => l.productId === pid && !l.barcode)
    if (ex) setLines((s) => s.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l)))
    else setLines((s) => [...s, { key: `${pid}-${Date.now()}`, productId: pid, barcode: null, qty: 1, mrp: p.mrp, discountPct: 0 }])
  }
  const upd = (key, patch) => setLines((s) => s.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const quickPay = (method) => setPays([{ method, amount: total }])
  const addPay = (method) => setPays((s) => [...s, { method, amount: Math.max(0, balance) }])
  const shortStock = lines.filter((l) => !l.barcode).find((l) => qtyInCart(l.productId) > (stock[l.productId] || 0))
  const badDisc = lines.find((l) => Number(l.discountPct) > MAX_DISC || Number(l.discountPct) < 0)
  const hasBarcode = lines.some((l) => l.barcode)
  const phoneOk = !cust.phone || /\d{10}/.test(cust.phone.replace(/\D/g, ''))
  const canPay = lines.length > 0 && Math.abs(balance) < 1 && !shortStock && !badDisc && phoneOk && (!hasBarcode || cust.name.trim())

  const checkout = () => {
    const customer = cust.name.trim() ? { name: cust.name.trim(), phone: cust.phone.trim(), city: cust.city.trim() } : null
    const order = posCheckout({
      partnerId, sessionId: session.id, customer,
      lines: lines.map((l) => ({ productId: l.productId, barcode: l.barcode, qty: l.qty, mrp: l.mrp, discountPct: Number(l.discountPct) || 0, price: priceOf(l) })),
      payments: pays.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: round2(p.amount) })),
    })
    if (customer?.phone) sendEmail({ to: customer.phone, subject: `Btali e-receipt ${order.number}`, body: `Thank you ${customer.name}! Bill ${order.number} for ${fmtINR(order.total)} at ${partner?.name}.${order.warrantyIds.length ? ` ${order.warrantyIds.length} warranty(ies) activated.` : ''}`, ref: order.number, kind: 'SMS' })
    toast.success(`Bill ${order.number} saved`, `${fmtINR(order.total)}${order.warrantyIds.length ? ` · ${order.warrantyIds.length} warranty activated` : ''}`)
    setReceipt(order)
    setLines([]); setPays([]); setCust({ name: '', phone: '', city: partner?.city || '' }); setErr('')
  }

  const options = products.filter((p) => p.active && (stock[p.id] || 0) > 0).map((p) => ({ value: p.id, label: `${p.sku} – ${p.shortName}`, sub: `MRP ${fmtINR(p.mrp)} · ${stock[p.id]} in store${p.type === 'FG' ? ' · scan barcode' : ''}` }))

  return (
    <div className="grid lg:grid-cols-5 gap-4 items-start">
      <div className="lg:col-span-3 space-y-4">
        <Card>
          <ScanInput onScan={scan} suggestions={suggestions} placeholder="Scan product barcode" />
          <div className="flex items-center gap-2 mt-2"><span className="text-xs text-slate-500 shrink-0">or search</span><Combobox className="flex-1" options={options} value="" onChange={addProduct} placeholder="Spares & accessories by name / SKU…" /></div>
          {err && <Alert tone="error" className="mt-3">{err}</Alert>}
        </Card>
        <Card padded={false} title={`Bill items (${lines.length})`} actions={lines.length > 0 && <Button size="sm" variant="ghost" icon={X} onClick={() => { setLines([]); setPays([]) }}>Clear</Button>}>
          {lines.length === 0 ? <div className="text-center text-sm text-slate-400 py-10"><Store className="w-6 h-6 mx-auto mb-2" />Scan a barcode to start the bill</div> : (
            <div className="divide-y divide-slate-100">
              {lines.map((l) => {
                const p = product(l.productId)
                return (
                  <div key={l.key} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3">
                    <ProductImage product={p} size="sm" />
                    <div className="flex-1 min-w-[140px]">
                      <div className="text-sm font-medium text-slate-900">{p.shortName}</div>
                      <div className="text-[11px] text-slate-500">{l.barcode ? <span className="font-mono inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-600" />{l.barcode}</span> : p.sku} · MRP {fmtINR(l.mrp)}</div>
                    </div>
                    {l.barcode ? <span className="text-sm text-slate-500 w-20 text-center">1 unit</span> : <NumberInput min={1} value={l.qty} onChange={(v) => upd(l.key, { qty: Math.max(1, Number(v) || 1) })} className="!w-20 text-center py-1" />}
                    <div className="flex items-center gap-1"><NumberInput min={0} max={MAX_DISC} value={l.discountPct} onChange={(v) => upd(l.key, { discountPct: v })} className={cx('!w-16 text-center py-1', Number(l.discountPct) > MAX_DISC && 'border-red-400')} /><span className="text-xs text-slate-500">% off</span></div>
                    <div className="w-24 text-right font-semibold tabular-nums">{fmtINR(priceOf(l) * l.qty)}</div>
                    <IconButton icon={Trash2} tone="danger" title="Remove" onClick={() => setLines((s) => s.filter((x) => x.key !== l.key))} />
                  </div>
                )
              })}
            </div>
          )}
          {badDisc && <div className="px-4 pb-3"><Alert tone="warn">Line discount is limited to {MAX_DISC}% of MRP.</Alert></div>}
          {shortStock && <div className="px-4 pb-3"><Alert tone="warn">{product(shortStock.productId)?.shortName}: only {stock[shortStock.productId] || 0} in store stock.</Alert></div>}
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-4">
        <Card title={<span className="inline-flex items-center gap-2"><UserRound className="w-4 h-4 text-slate-400" />Customer</span>} subtitle={hasBarcode ? 'Required – warranty is activated on these details' : 'Optional for spares'}>
          <div className="grid grid-cols-2 gap-2">
            <Input className="col-span-2" placeholder="Customer name" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} />
            <Input placeholder="Mobile" inputMode="tel" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} className={cx(!phoneOk && 'border-red-400')} />
            <Input placeholder="City" value={cust.city} onChange={(e) => setCust({ ...cust, city: e.target.value })} />
          </div>
        </Card>
        <Card title="Payment">
          <div className="flex justify-between items-baseline mb-3"><span className="text-slate-500 text-sm">Bill total (incl. GST)</span><span className="text-3xl font-bold text-ink-900 tabular-nums">{fmtINR(total)}</span></div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {METHODS.map((m) => <Button key={m.key} variant="secondary" icon={m.icon} disabled={!total} onClick={() => quickPay(m.key)}>{m.label}</Button>)}
          </div>
          {pays.map((p, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <Badge tone={p.method === 'CASH' ? 'green' : p.method === 'UPI' ? 'violet' : 'blue'} className="w-14 justify-center">{p.method}</Badge>
              <NumberInput min={0} value={p.amount} onChange={(v) => setPays((s) => s.map((x, j) => (j === i ? { ...x, amount: v } : x)))} className="flex-1 py-1.5" />
              {p.method === 'UPI' && <Input placeholder="UPI ref" value={p.ref || ''} onChange={(e) => setPays((s) => s.map((x, j) => (j === i ? { ...x, ref: e.target.value } : x)))} className="w-28 py-1.5" />}
              <IconButton icon={X} title="Remove" onClick={() => setPays((s) => s.filter((_, j) => j !== i))} />
            </div>
          ))}
          {pays.length > 0 && balance > 0.5 && (
            <div className="flex gap-1.5 flex-wrap mb-2"><span className="text-xs text-slate-500 self-center">Split balance {fmtINR(balance)}:</span>{METHODS.map((m) => <Button key={m.key} size="sm" variant="ghost" icon={Plus} onClick={() => addPay(m.key)}>{m.label}</Button>)}</div>
          )}
          {pays.length > 0 && <div className={cx('text-sm font-medium mb-2', Math.abs(balance) < 1 ? 'text-emerald-600' : 'text-red-600')}>{Math.abs(balance) < 1 ? 'Fully paid' : balance > 0 ? `Balance ${fmtINR(balance)}` : `Excess ${fmtINR(-balance)} – reduce amount (give change from cash)`}</div>}
          <Button size="lg" className="w-full" icon={Receipt} disabled={!canPay} onClick={checkout}>Complete sale</Button>
          {hasBarcode && !cust.name.trim() && <div className="text-[11px] text-amber-700 mt-2">Enter customer name to activate warranty.</div>}
        </Card>
      </div>
      <ReceiptModal order={receipt} partner={partner} onClose={() => setReceipt(null)} />
    </div>
  )
}

export function ReceiptModal({ order, partner, onClose, closeText = 'New sale' }) {
  const products = useStore((s) => s.products)
  const warranties = useStore((s) => s.warranties)
  const company = useStore((s) => s.settings.company)
  if (!order) return null
  const ws = warranties.filter((w) => order.warrantyIds?.includes(w.id))
  const print = () => {
    const el = document.getElementById('pos-receipt')
    const w = window.open('', '_blank', 'width=420,height=800')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>${order.number}</title><style>body{font-family:'Courier New',monospace;font-size:12px;width:72mm;margin:0 auto;padding:8px} table{width:100%;border-collapse:collapse} td{padding:2px 0;vertical-align:top} .r{text-align:right} .c{text-align:center} hr{border:0;border-top:1px dashed #000} svg{max-width:100%}</style></head><body>${el.innerHTML}</body></html>`)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 300)
  }
  const gst = round2(order.total - order.total / 1.18)
  return (
    <Modal open onClose={onClose} title={`Receipt ${order.number}`} size="sm" footer={<><Button variant="secondary" onClick={onClose}>{closeText}</Button><Button icon={Receipt} onClick={print}>Print receipt</Button></>}>
      <div id="pos-receipt" className="font-mono text-xs text-slate-900 bg-white border border-dashed border-slate-300 rounded p-3 max-w-[300px] mx-auto">
        <div className="c text-center"><b style={{ fontSize: 16 }}>BTALI</b><br />{partner?.name}<br />{partner?.address}<br />GSTIN {partner?.gstin}</div>
        <hr className="my-2 border-dashed border-slate-400" />
        <div>Bill: {order.number}<br />Date: {fmtDateTime(order.ts)}{order.customer?.name ? <><br />Customer: {order.customer.name}{order.customer.phone ? ` (${order.customer.phone})` : ''}</> : null}</div>
        <hr className="my-2 border-dashed border-slate-400" />
        <table className="w-full"><tbody>
          {order.lines.map((l, i) => {
            const p = products.find((x) => x.id === l.productId)
            return (
              <React.Fragment key={i}>
                <tr><td colSpan={2}>{p?.shortName}</td></tr>
                <tr><td className="text-slate-600">{l.qty} x {fmtINR(l.price)}{l.discountPct ? ` (-${l.discountPct}%)` : ''}{l.barcode ? <><br />SN {l.barcode}</> : null}</td><td className="r text-right">{fmtINR(l.qty * l.price)}</td></tr>
              </React.Fragment>
            )
          })}
        </tbody></table>
        <hr className="my-2 border-dashed border-slate-400" />
        <table className="w-full"><tbody>
          <tr><td>Taxable</td><td className="r text-right">{fmtINR(order.total - gst)}</td></tr>
          <tr><td>GST (incl.)</td><td className="r text-right">{fmtINR(gst)}</td></tr>
          <tr><td><b>TOTAL</b></td><td className="r text-right"><b>{fmtINR(order.total)}</b></td></tr>
          {order.payments.map((p, i) => <tr key={i}><td>Paid {p.method}</td><td className="r text-right">{fmtINR(p.amount)}</td></tr>)}
        </tbody></table>
        {ws.length > 0 && <><hr className="my-2 border-dashed border-slate-400" /><div>Warranty activated:<br />{ws.map((w) => <span key={w.id}>{w.number} till {w.endDate}<br /></span>)}</div></>}
        <hr className="my-2 border-dashed border-slate-400" />
        <div className="c text-center flex flex-col items-center"><Barcode value={order.number} height={30} fontSize={10} width={1.2} /><div>Thank you! Service: {company.phone}</div><div>{fmtNum(order.lines.length)} item(s)</div></div>
      </div>
    </Modal>
  )
}
