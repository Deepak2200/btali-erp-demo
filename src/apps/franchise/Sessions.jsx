import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, LockOpen, Banknote, Smartphone, CreditCard, Receipt, AlertTriangle } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, Grid, Stat, Field, NumberInput, Textarea, Drawer, Alert, KV, EmptyState, toast, confirm, cx } from '../../components/ui'
import DataTable from '../../components/DataTable'
import { PrintArea, DocHeader } from '../../components/business'
import { fmtINR, fmtDateTime, fmtNum, round2, sum } from '../../lib/format'
import { usePortal } from '../dealer/_portal'
import { ReceiptModal } from './POS'

const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1]
export const summarize = (session, orders) => {
  const mine = orders.filter((o) => o.sessionId === session.id)
  const by = (m) => round2(sum(mine, (o) => sum((o.payments || []).filter((p) => p.method === m), (p) => p.amount)))
  const cash = by('CASH')
  return { orders: mine, bills: mine.length, total: round2(sum(mine, (o) => o.total)), cash, upi: by('UPI'), card: by('CARD'), expected: round2((session.openingCash || 0) + cash), units: sum(mine, (o) => sum(o.lines, (l) => l.qty)) }
}

export default function Sessions() {
  const nav = useNavigate()
  const { partnerId, partner } = usePortal()
  const all = useStore((s) => s.posSessions) || []
  const posOrders = useStore((s) => s.posOrders) || []
  const users = useStore((s) => s.users)
  const sessions = useMemo(() => all.filter((s) => s.partnerId === partnerId).sort((a, b) => b.openedAt.localeCompare(a.openedAt)), [all, partnerId])
  const open = sessions.find((s) => s.status === 'OPEN')
  const closed = sessions.filter((s) => s.status === 'CLOSED')
  const [sel, setSel] = useState(null)
  const rows = closed.map((s) => ({ ...s, sm: summarize(s, posOrders) }))

  return (
    <div>
      <PageHeader title="POS sessions" subtitle={`Day open / close with cash count · ${partner?.name}`} actions={!open && <Button icon={LockOpen} onClick={() => nav('/franchise/pos')}>Open session</Button>} />
      <Grid cols={4} className="mb-4">
        <Stat icon={open ? LockOpen : Lock} tone={open ? 'green' : 'amber'} label="Current session" value={open ? open.number : 'Closed'} sub={open ? `opened ${fmtDateTime(open.openedAt)}` : 'Open a session to bill'} />
        <Stat icon={Receipt} tone="ink" label="Sessions" value={closed.length} />
        <Stat icon={Banknote} tone="green" label="Session sales" value={fmtINR(sum(rows, (r) => r.sm.total))} />
        <Stat icon={AlertTriangle} tone={rows.some((r) => Math.abs(r.variance || 0) >= 1) ? 'red' : 'green'} label="Cash variance" value={fmtINR(sum(rows, (r) => r.variance || 0))} sub={`${rows.filter((r) => Math.abs(r.variance || 0) >= 1).length} session(s) with variance`} />
      </Grid>
      {open && <CloseCard session={open} posOrders={posOrders} />}
      <Card title="Session history" padded={false} className="mt-4">
        <DataTable rows={rows} onRowClick={(r) => setSel(r.id)} exportName={`POS-Sessions-${partner?.code}`} initialSort={{ key: 'openedAt', dir: 'desc' }} className="border-0 shadow-none"
          empty={<EmptyState title="No closed sessions yet" />}
          columns={[
            { key: 'number', header: 'Session', render: (r) => <span className="font-mono font-medium">{r.number}</span> },
            { key: 'openedAt', header: 'Opened', render: (r) => fmtDateTime(r.openedAt) },
            { key: 'closedAt', header: 'Closed', render: (r) => fmtDateTime(r.closedAt) },
            { key: 'bills', header: 'Bills', align: 'right', value: (r) => r.sm.bills },
            { key: 'sales', header: 'Sales', align: 'right', value: (r) => r.sm.total, render: (r) => fmtINR(r.sm.total) },
            { key: 'expectedCash', header: 'Expected cash', align: 'right', render: (r) => fmtINR(r.expectedCash) },
            { key: 'countedCash', header: 'Counted', align: 'right', render: (r) => fmtINR(r.countedCash) },
            { key: 'variance', header: 'Variance', align: 'right', render: (r) => <span className={cx('tabular-nums font-medium', r.variance < 0 ? 'text-red-600' : r.variance > 0 ? 'text-amber-600' : 'text-emerald-600')}>{r.variance ? fmtINR(r.variance) : 'Nil'}</span> },
            { key: 'by', header: 'Closed by', value: (r) => users.find((u) => u.id === r.closedBy)?.name || '' },
          ]} />
      </Card>
      <SessionDrawer session={rows.find((r) => r.id === sel)} onClose={() => setSel(null)} partner={partner} />
    </div>
  )
}

function CloseCard({ session, posOrders }) {
  const closePosSession = useStore((s) => s.closePosSession)
  const sm = summarize(session, posOrders)
  const [mode, setMode] = useState('denoms')
  const [d, setD] = useState({})
  const [direct, setDirect] = useState('')
  const [note, setNote] = useState('')
  const counted = mode === 'denoms' ? sum(DENOMS, (x) => x * (Number(d[x]) || 0)) : Number(direct) || 0
  const touched = mode === 'denoms' ? Object.values(d).some((v) => v !== '' && v != null) : direct !== ''
  const variance = round2(counted - sm.expected)
  const close = async () => {
    if (!(await confirm({ title: `Close ${session.number}?`, message: `Expected cash ${fmtINR(sm.expected)} · counted ${fmtINR(counted)} · variance ${fmtINR(variance)}.\nNo further bills can be added to this session.`, confirmText: 'Close session' }))) return
    const r = closePosSession(session.id, { countedCash: counted, denominations: mode === 'denoms' ? d : null, note })
    if (!r.ok) return toast.error('Could not close', r.error)
    toast.success('Session closed', `${session.number} · ${sm.bills} bills · ${fmtINR(sm.total)}${Math.abs(variance) >= 1 ? ` · variance ${fmtINR(variance)} reported` : ''}`)
  }
  return (
    <Card title={`Close ${session.number}`} subtitle={`Opened ${fmtDateTime(session.openedAt)} with ${fmtINR(session.openingCash)}`}>
      <div className="grid lg:grid-cols-3 gap-5">
        <div>
          <div className="text-[11px] uppercase text-slate-400 font-semibold mb-1">Session sales</div>
          <KV label="Bills" value={fmtNum(sm.bills)} />
          <KV label="Total sales" value={fmtINR(sm.total)} />
          <KV label={<span className="inline-flex items-center gap-1"><Banknote className="w-3.5 h-3.5" />Cash</span>} value={fmtINR(sm.cash)} />
          <KV label={<span className="inline-flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" />UPI</span>} value={fmtINR(sm.upi)} />
          <KV label={<span className="inline-flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" />Card</span>} value={fmtINR(sm.card)} />
          <div className="border-t border-slate-200 mt-1 pt-1"><KV label="Expected cash in drawer" value={<b>{fmtINR(sm.expected)}</b>} /></div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-2"><span className="text-[11px] uppercase text-slate-400 font-semibold">Cash count</span><Button size="sm" variant="link" onClick={() => setMode(mode === 'denoms' ? 'direct' : 'denoms')}>{mode === 'denoms' ? 'Enter total instead' : 'Count by notes'}</Button></div>
          {mode === 'denoms' ? (
            <div className="grid grid-cols-3 gap-2">
              {DENOMS.map((x) => <label key={x} className="text-xs text-slate-500">₹{x}<NumberInput min={0} value={d[x] ?? ''} onChange={(v) => setD({ ...d, [x]: v })} className="py-1 mt-0.5" /></label>)}
            </div>
          ) : <Field label="Counted cash (₹)"><NumberInput min={0} value={direct} onChange={setDirect} /></Field>}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <KV label="Counted" value={fmtINR(counted)} />
            <KV label="Variance" value={<span className={cx('font-bold', !touched ? 'text-slate-400' : Math.abs(variance) < 1 ? 'text-emerald-600' : 'text-red-600')}>{touched ? (Math.abs(variance) < 1 ? 'Nil' : `${variance > 0 ? '+' : ''}${fmtINR(variance)}`) : '—'}</span>} />
          </div>
          {touched && Math.abs(variance) >= 1 && <Alert tone="warn">Variance will be reported to Btali Accounts. Please add a reason.</Alert>}
          <Field label="Closing note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button className="w-full" icon={Lock} disabled={!touched || (Math.abs(variance) >= 1 && !note.trim())} onClick={close}>Close session</Button>
        </div>
      </div>
    </Card>
  )
}

function SessionDrawer({ session, onClose, partner }) {
  const products = useStore((s) => s.products)
  const [rcpt, setRcpt] = useState(null)
  if (!session) return null
  const sm = session.sm
  return (
    <Drawer open onClose={onClose} title={session.number} subtitle={`${fmtDateTime(session.openedAt)} – ${fmtDateTime(session.closedAt)}`}>
      <PrintArea title={`Z-report ${session.number}`}>
        <DocHeader title="Z-report" number={session.number} date={session.closedAt?.slice(0, 10)} right={<div className="text-xs text-slate-500">{partner?.name}</div>} />
        <div className="grid grid-cols-2 gap-x-6 text-sm">
          <KV label="Bills" value={sm.bills} /><KV label="Units sold" value={sm.units} />
          <KV label="Cash" value={fmtINR(sm.cash)} /><KV label="UPI" value={fmtINR(sm.upi)} />
          <KV label="Card" value={fmtINR(sm.card)} /><KV label="Total sales" value={<b>{fmtINR(sm.total)}</b>} />
          <KV label="Opening cash" value={fmtINR(session.openingCash)} /><KV label="Expected cash" value={fmtINR(session.expectedCash)} />
          <KV label="Counted cash" value={fmtINR(session.countedCash)} /><KV label="Variance" value={<span className={session.variance ? 'text-red-600 font-bold' : ''}>{session.variance ? fmtINR(session.variance) : 'Nil'}</span>} />
        </div>
        {session.note && <div className="text-xs text-slate-500 mt-2">Note: {session.note}</div>}
        <table className="w-full text-sm mt-4">
          <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr><th className="text-left px-2 py-1.5">Bill</th><th className="text-left px-2 py-1.5">Items</th><th className="text-left px-2 py-1.5">Paid by</th><th className="text-right px-2 py-1.5">Amount</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {sm.orders.map((o) => (
              <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setRcpt(o)}>
                <td className="px-2 py-1.5 font-mono text-xs">{o.number}</td>
                <td className="px-2 py-1.5 text-xs">{o.lines.map((l) => `${products.find((p) => p.id === l.productId)?.shortName} ×${l.qty}`).join(', ')}</td>
                <td className="px-2 py-1.5">{o.payments.map((p) => <Badge key={p.method} tone="gray" className="mr-1">{p.method}</Badge>)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtINR(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintArea>
      <ReceiptModal order={rcpt} partner={partner} onClose={() => setRcpt(null)} closeText="Close" />
    </Drawer>
  )
}
