import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, IndianRupee, Target, Headphones, Truck, Tag, AlertTriangle, RotateCcw, Bell, ArrowRight, Phone, Mail, ShoppingCart, FileText, PackageOpen, BookOpen, RefreshCw } from 'lucide-react'
import { useStore } from '../../store'
import { PageHeader, Card, Button, Badge, StatusBadge, Grid, Stat, Progress, EmptyState, ProductImage, Avatar, toast } from '../../components/ui'
import { fmtINR, fmtCompact, fmtDate, fmtNum, sum, today, timeAgo, monthKey, lastMonths, monthLabel, round2 } from '../../lib/format'
import { isSchemeLive } from '../../lib/pricing'
import { usePortal, OrderStepper, SO_LABEL, balanceDue, BankBox, fulfilment, useStockState } from './_portal'
import { BarsChart } from '../../components/business'

const OPEN = ['PENDING_REVIEW', 'CONFIRMED', 'PAID', 'INVOICED']

export default function Dashboard() {
  const nav = useNavigate()
  const { user, partnerId, partner, base } = usePortal()
  const salesOrders = useStore((s) => s.salesOrders)
  const invoices = useStore((s) => s.invoices)
  const schemes = useStore((s) => s.schemes)
  const tickets = useStore((s) => s.tickets)
  const products = useStore((s) => s.products)
  const notifications = useStore((s) => s.notifications)
  const targets = useStore((s) => s.targets)
  const transporters = useStore((s) => s.transporters)
  const users = useStore((s) => s.users)
  const addLinesToCart = useStore((s) => s.addLinesToCart)
  const markRead = useStore((s) => s.markNotificationRead)
  const receipts = useStore((s) => s.receipts)
  const notes = useStore((s) => s.notes)
  const portalCfg = useStore((s) => s.settings.dealerPortal) || {}
  const sst = useStockState()

  const mine = useMemo(() => salesOrders.filter((o) => o.partnerId === partnerId).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number)), [salesOrders, partnerId])
  const open = mine.filter((o) => OPEN.includes(o.status))
  const awaiting = mine.filter((o) => o.status === 'CONFIRMED' && balanceDue(o) > 0)
  const dispatched = useMemo(() => invoices.filter((i) => i.partnerId === partnerId && i.lr).sort((a, b) => (b.lr.date || '').localeCompare(a.lr.date || '')).slice(0, 4), [invoices, partnerId])
  const liveSchemes = (schemes || []).filter((s) => isSchemeLive(s) && (!s.regions?.length || s.regions.includes(partner?.region)) && (!s.partnerIds?.length || s.partnerIds.includes(partnerId)))
  const myTickets = tickets.filter((t) => t.partnerId === partnerId && !['RESOLVED', 'CLOSED'].includes(t.stage))
  const low = Object.entries(partner?.stockMin || {}).filter(([pid, min]) => ((partner.stock || {})[pid] || 0) < min).map(([pid, min]) => ({ p: products.find((x) => x.id === pid), qty: (partner.stock || {})[pid] || 0, min })).filter((x) => x.p)
  const last = mine.find((o) => o.status !== 'CANCELLED')
  const myNotes = notifications.filter((n) => n.partnerId === partnerId).slice(0, 6)
  const mk = monthKey(today())
  const target = (targets || []).find((t) => t.ownerType === 'DEALER' && t.ownerId === partnerId && t.period === mk)
  const achieved = sum(invoices.filter((i) => i.partnerId === partnerId && monthKey(i.date) === mk), (i) => i.subtotal)
  const pct = target ? (achieved / target.amount) * 100 : 0
  const nextSlab = target?.slabs?.find((s) => pct < s.achievePct)
  const sp = users.find((u) => u.id === partner?.salespersonId)
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const pname = (id) => products.find((p) => p.id === id)?.shortName

  // purchases from Btali (Phase 1 = Btali's invoices to this partner, not the partner's own sell-out)
  const myInv = useMemo(() => invoices.filter((i) => i.partnerId === partnerId && i.type !== 'FOC'), [invoices, partnerId])
  const fyStart = `${Number(today().slice(0, 4)) - (Number(today().slice(5, 7)) < 4 ? 1 : 0)}-04-01`
  const fyPurchases = sum(myInv.filter((i) => i.date >= fyStart), (i) => i.total)
  const months = lastMonths(6)
  const purchaseTrend = months.map((m) => ({ label: monthLabel(m), value: round2(sum(myInv.filter((i) => monthKey(i.date) === m), (i) => i.subtotal)) }))
  // pending fulfilment across open orders
  const fulOpen = mine.filter((o) => !['CANCELLED', 'DELIVERED'].includes(o.status)).map((o) => ({ o, f: fulfilment(o, invoices, sst) })).filter((x) => x.f.pending > 0)
  const pendingUnits = sum(fulOpen, (x) => x.f.pending)
  const pendingValue = sum(fulOpen, (x) => sum(x.f.lines, (l) => (l.pending / Math.max(l.ordered, 1)) * (l.amount || 0)))
  // account ledger (Btali books, synced to Tally) – debit invoices & debit notes, credit receipts & credit notes
  const ledger = useMemo(() => {
    const rows = [
      ...myInv.map((i) => ({ date: i.date, ref: i.number, text: 'Sales invoice', dr: i.total, cr: 0 })),
      ...receipts.filter((r) => r.partnerId === partnerId).map((r) => ({ date: r.date, ref: r.number, text: `Receipt · ${r.mode}`, dr: 0, cr: r.amount })),
      ...(notes || []).filter((n) => n.partnerId === partnerId).map((n) => ({ date: n.date, ref: n.number, text: n.type === 'CREDIT' ? 'Credit note' : 'Debit note', dr: n.type === 'DEBIT' ? (n.amount || 0) + (n.gst || 0) : 0, cr: n.type === 'CREDIT' ? (n.amount || 0) + (n.gst || 0) : 0 })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    let bal = 0
    for (const r of rows) { bal = round2(bal + r.dr - r.cr); r.bal = bal }
    return { rows, balance: bal }
  }, [myInv, receipts, notes, partnerId])
  const unpaidAdvance = sum(awaiting, balanceDue)

  const reorder = () => {
    addLinesToCart(partnerId, last.lines.filter((l) => !l.free).map((l) => ({ productId: l.productId, qty: l.qty })))
    toast.success('Last order added to cart', last.number)
    nav(`${base}/cart`)
  }
  const restock = () => {
    addLinesToCart(partnerId, low.map((x) => ({ productId: x.p.id, qty: Math.max(x.min * 2 - x.qty, 1) })))
    toast.success('Low-stock items added to cart', `${low.length} products`)
    nav(`${base}/cart`)
  }

  return (
    <div>
      <PageHeader title={`${greet}, ${user?.name?.split(' ')[0]}`} subtitle={`${partner?.name} · ${partner?.code} · Tier ${partner?.tier} ${partner?.channel === 'DISTRIBUTOR' ? 'distributor' : 'dealer'}, ${partner?.city}`}
        actions={<><Button variant="secondary" icon={ClipboardList} onClick={() => nav(`${base}/orders`)}>My orders</Button><Button icon={ShoppingCart} onClick={() => nav(`${base}/catalog`)}>Place order</Button></>} />

      <Grid cols={4} className="mb-4">
        <Stat icon={ClipboardList} tone="ink" label="Open orders" value={fmtNum(open.length)} sub={`${open.filter((o) => o.status === 'PENDING_REVIEW').length} under review`} onClick={() => nav(`${base}/orders`)} />
        <Stat icon={IndianRupee} tone={awaiting.length ? 'red' : 'green'} label="Payment due" value={fmtINR(sum(awaiting, balanceDue))} sub={awaiting.length ? `${awaiting.length} order(s) confirmed` : 'Nothing due'} />
        <Stat icon={Target} tone="brand" label={`Purchases ${new Date().toLocaleDateString('en-GB', { month: 'short' })}`} value={fmtCompact(achieved)} sub={target ? `${pct.toFixed(0)}% of ${fmtINR(target.amount)} target` : 'No target set'} />
        <Stat icon={Headphones} tone="amber" label="Complaints" value={fmtNum(myTickets.length)} sub={myTickets.length ? `${myTickets.filter((t) => t.priority === 'HIGH').length} high priority` : 'All resolved'} onClick={() => nav(`${base}/support`)} />
      </Grid>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {awaiting.length > 0 && (
            <Card title="Payment required to release invoice" subtitle="Advance payment terms – remit and share the UTR" actions={<Badge tone="red">{fmtINR(sum(awaiting, balanceDue))}</Badge>}>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  {awaiting.map((o) => (
                    <div key={o.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex justify-between gap-2"><span className="font-mono font-semibold">{o.number}</span><span className="font-bold tabular-nums">{fmtINR(balanceDue(o))}</span></div>
                      <div className="text-xs text-slate-500 mt-0.5">Confirmed {fmtDate(o.date)} · {o.lines.length} lines{o.paymentAdvices?.length ? ' · UTR shared, verifying' : ''}</div>
                      <Button size="sm" className="mt-2" icon={IndianRupee} onClick={() => nav(`${base}/orders?so=${o.id}`)}>{o.paymentAdvices?.length ? 'View payment' : 'Pay & share UTR'}</Button>
                    </div>
                  ))}
                </div>
                <BankBox reference={awaiting[0].number} />
              </div>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Purchases from Btali" subtitle={`FY to date ${fmtINR(fyPurchases)} · ${myInv.filter((i) => i.date >= fyStart).length} invoices`}>
              <BarsChart data={purchaseTrend} series={[{ key: 'value', label: 'Purchases (excl. GST)' }]} height={170} />
              <div className="text-[11px] text-slate-400 mt-1">Phase 1 figures reflect your purchases from Btali, not sales to your own customers.</div>
            </Card>
            <Card title="Pending fulfilment" subtitle={`${fulOpen.length} order(s) · ${fmtNum(pendingUnits)} units · ${fmtCompact(pendingValue)}`} actions={<Button size="sm" variant="link" onClick={() => nav(`${base}/orders`)}>Orders</Button>}>
              {fulOpen.length === 0 ? <EmptyState icon={PackageOpen} title="Nothing pending" message="All your orders have been dispatched." /> : (
                <div className="space-y-2">
                  {fulOpen.slice(0, 4).map(({ o, f }) => (
                    <button key={o.id} type="button" onClick={() => nav(`${base}/orders?so=${o.id}`)} className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-brand-300">
                      <div className="flex justify-between gap-2 text-sm"><span className="font-mono font-medium">{o.number}</span><span className="tabular-nums text-amber-700 font-medium">{fmtNum(f.pending)} pending</span></div>
                      <div className="flex justify-between gap-2 text-[11px] text-slate-500 mt-0.5"><span>{fmtNum(f.dispatched)} of {fmtNum(f.ordered)} dispatched</span><span>{f.expected ? `Expected ${fmtDate(f.expected)}` : SO_LABEL[o.status]}</span></div>
                      <Progress value={f.dispatched} max={f.ordered} tone="green" className="mt-1.5" />
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card title="Orders in progress" actions={<Button size="sm" variant="link" onClick={() => nav(`${base}/orders`)}>View all</Button>}>
            {open.length === 0 ? <EmptyState icon={ClipboardList} title="No open orders" message="Everything has been dispatched." action={<Button size="sm" onClick={() => nav(`${base}/catalog`)}>Place an order</Button>} /> : (
              <div className="divide-y divide-slate-100 -my-2">
                {open.slice(0, 5).map((o) => (
                  <button key={o.id} type="button" onClick={() => nav(`${base}/orders?so=${o.id}`)} className="w-full text-left py-3 hover:bg-slate-50/60 -mx-2 px-2 rounded-lg">
                    <div className="flex flex-wrap justify-between gap-2 mb-2">
                      <div><span className="font-mono font-semibold text-sm">{o.number}</span><span className="text-xs text-slate-500 ml-2">{fmtDate(o.date)} · {fmtINR(o.total)}</span></div>
                      <StatusBadge status={o.status} label={SO_LABEL[o.status]} />
                    </div>
                    <OrderStepper so={o} />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Recently dispatched" subtitle="Invoices with LR copies" actions={<Button size="sm" variant="link" onClick={() => nav(`${base}/documents`)}>All documents</Button>}>
            {dispatched.length === 0 ? <div className="text-sm text-slate-400">No dispatches yet.</div> : (
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr><th className="text-left px-4 py-2">Invoice</th><th className="text-left px-3 py-2">LR</th><th className="text-left px-3 py-2">Transporter</th><th className="text-right px-4 py-2">Value</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {dispatched.map((i) => (
                      <tr key={i.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => nav(`${base}/documents?inv=${i.id}`)}>
                        <td className="px-4 py-2"><div className="font-mono font-medium">{i.number}</div><div className="text-[11px] text-slate-500">{fmtDate(i.date)}</div></td>
                        <td className="px-3 py-2"><div className="font-mono">{i.lr.number}</div><div className="text-[11px] text-slate-500">{fmtDate(i.lr.date)}</div></td>
                        <td className="px-3 py-2 text-slate-600">{transporters.find((t) => t.id === i.transporterId)?.name || '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtINR(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Live schemes for you" actions={<Button size="sm" variant="link" onClick={() => nav(`${base}/pricing`)}>Pricing & schemes</Button>}>
            {liveSchemes.length === 0 ? <div className="text-sm text-slate-400">No schemes running right now.</div> : (
              <div className="grid sm:grid-cols-2 gap-3">
                {liveSchemes.map((s) => (
                  <div key={s.id} className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-3">
                    <div className="flex items-center justify-between gap-2"><Badge tone="brand"><Tag className="w-3 h-3" />{s.code}</Badge><span className="text-[11px] text-slate-500">till {fmtDate(s.to)}</span></div>
                    <div className="font-semibold text-sm text-slate-900 mt-2">{s.name}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{s.description}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card title="Account ledger & outstanding" subtitle={<span className="inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" />{portalCfg.ledgerSource || 'Tally'} · synced {timeAgo(portalCfg.ledgerSyncedAt)}</span>}
            actions={<Button size="sm" variant="link" onClick={() => nav(`${base}/documents?tab=soa`)}>Statement</Button>}>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">Ledger balance</div><div className={`text-base font-bold tabular-nums ${ledger.balance > 1 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtINR(Math.abs(ledger.balance))} {ledger.balance > 1 ? 'Dr' : ledger.balance < -1 ? 'Cr' : ''}</div><div className="text-[11px] text-slate-400">{ledger.balance > 1 ? 'payable to Btali' : ledger.balance < -1 ? 'advance with Btali' : 'settled'}</div></div>
              <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">Advance due on orders</div><div className={`text-base font-bold tabular-nums ${unpaidAdvance ? 'text-amber-600' : 'text-ink-900'}`}>{fmtINR(unpaidAdvance)}</div><div className="text-[11px] text-slate-400">{awaiting.length} confirmed order(s)</div></div>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {ledger.rows.slice(-4).reverse().map((r) => (
                <div key={r.ref} className="flex justify-between gap-2 py-1.5"><span className="min-w-0"><span className="font-mono text-slate-700">{r.ref}</span><span className="text-slate-400"> · {fmtDate(r.date)}</span><span className="block text-slate-500">{r.text}</span></span><span className={`tabular-nums shrink-0 ${r.cr ? 'text-emerald-700' : 'text-slate-800'}`}>{r.cr ? `− ${fmtINR(r.cr)}` : fmtINR(r.dr)}</span></div>
              ))}
            </div>
          </Card>
          {!target && (
            <Card title="Monthly target">
              <div className="text-sm text-slate-500">No target has been assigned for this month. Your Btali sales executive will share targets and incentive slabs when they apply.</div>
            </Card>
          )}
          {target && (
            <Card title="Monthly target" subtitle={new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}>
              <div className="flex items-end justify-between mb-2"><span className="text-2xl font-bold tabular-nums">{pct.toFixed(0)}%</span><span className="text-xs text-slate-500">{fmtINR(achieved)} / {fmtINR(target.amount)}</span></div>
              <Progress value={pct} tone={pct >= 100 ? 'green' : pct >= 70 ? 'brand' : 'amber'} />
              <div className="text-xs text-slate-500 mt-2">{nextSlab ? `Reach ${nextSlab.achievePct}% (${fmtINR(target.amount * nextSlab.achievePct / 100)}) to earn ${nextSlab.incentivePct}% incentive.` : 'Top incentive slab achieved – well done!'}</div>
            </Card>
          )}
          {last && (
            <Card title="Quick reorder" subtitle={`Last order ${last.number} · ${fmtDate(last.date)}`}>
              <div className="space-y-1.5">
                {last.lines.filter((l) => !l.free).slice(0, 4).map((l) => <div key={l.productId} className="flex justify-between text-sm"><span className="truncate text-slate-700">{pname(l.productId)}</span><span className="tabular-nums text-slate-500 shrink-0 ml-2">× {l.qty}</span></div>)}
                {last.lines.length > 4 && <div className="text-xs text-slate-400">+{last.lines.length - 4} more</div>}
              </div>
              <Button className="w-full mt-3" variant="soft" icon={RotateCcw} onClick={reorder}>Reorder at today's prices</Button>
            </Card>
          )}
          <Card title="My stock alerts" subtitle={partner?.stockUpdatedAt ? `Stock updated ${fmtDate(partner.stockUpdatedAt)}` : 'Stock not reported yet'} actions={<Button size="sm" variant="link" onClick={() => nav(`${base}/stock`)}>Update</Button>}>
            {low.length === 0 ? <div className="text-sm text-slate-500">All items are above your minimum levels.</div> : (
              <>
                <div className="space-y-2">
                  {low.slice(0, 5).map((x) => (
                    <div key={x.p.id} className="flex items-center gap-2">
                      <ProductImage product={x.p} size="xs" />
                      <span className="flex-1 text-sm truncate">{x.p.shortName}</span>
                      <Badge tone={x.qty === 0 ? 'red' : 'amber'}>{x.qty} / {x.min}</Badge>
                    </div>
                  ))}
                </div>
                <Button size="sm" className="w-full mt-3" variant="secondary" icon={AlertTriangle} onClick={restock}>Add {low.length} low items to cart</Button>
              </>
            )}
          </Card>
          <Card title="Open complaints" actions={<Button size="sm" variant="link" onClick={() => nav(`${base}/support`)}>View</Button>}>
            {myTickets.length === 0 ? <div className="text-sm text-slate-500">No open tickets.</div> : (
              <div className="space-y-2">
                {myTickets.slice(0, 4).map((t) => (
                  <button key={t.id} type="button" onClick={() => nav(`${base}/support?t=${t.id}`)} className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-brand-300">
                    <div className="flex justify-between gap-2"><span className="font-mono text-xs text-slate-500">{t.number}</span><StatusBadge status={t.stage} /></div>
                    <div className="text-sm text-slate-800 line-clamp-1 mt-0.5">{t.subject}</div>
                  </button>
                ))}
              </div>
            )}
          </Card>
          <Card title="Notifications">
            {myNotes.length === 0 ? <div className="text-sm text-slate-400">You're all caught up.</div> : (
              <div className="space-y-3">
                {myNotes.map((n) => (
                  <button key={n.id} type="button" onClick={() => { markRead(n.id); if (n.link) nav(n.link.replace(/^\/dealer/, base)) }} className="w-full text-left flex gap-2.5">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-slate-200' : 'bg-brand-500'}`} />
                    <span className="min-w-0"><span className="block text-sm font-medium text-slate-800">{n.title}</span><span className="block text-xs text-slate-500 line-clamp-2">{n.body}</span><span className="block text-[11px] text-slate-400">{timeAgo(n.ts)}</span></span>
                  </button>
                ))}
              </div>
            )}
          </Card>
          {sp && (
            <Card title="Your Btali contact">
              <div className="flex items-center gap-3">
                <Avatar name={sp.name} />
                <div className="min-w-0"><div className="text-sm font-semibold">{sp.name}</div><div className="text-xs text-slate-500">{sp.title}</div></div>
              </div>
              <div className="flex gap-2 mt-3">
                <a href={`tel:${sp.phone.replace(/\s/g, '')}`} className="flex-1"><Button size="sm" variant="secondary" icon={Phone} className="w-full">{sp.phone}</Button></a>
                <a href={`mailto:${sp.email}`}><Button size="sm" variant="secondary" icon={Mail}>Email</Button></a>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
