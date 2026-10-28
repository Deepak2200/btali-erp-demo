import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Wand2, Save, Send, CheckCircle2, XCircle, Trash2, Plus, Flame, Ship, ArrowLeft, Scale, Boxes, PackageOpen } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Card, Button, Select, Field, NumberInput, Input, Badge, StatusBadge, Grid, Stat, EmptyState, Checkbox, Alert, Timeline, Textarea, toast, confirm, prompt, cx, IconButton, SectionTitle } from '../../../components/ui'
import { ProductCell } from '../../../components/business'
import { fmtNum, fmtDate, fmtDateTime, round2, sum } from '../../../lib/format'
import { CONTAINERS, Bar, useCanEdit, PoLink } from './_purchaseKit'

const POOL_STATUS = ['READY_TO_SHIP', 'IN_PRODUCTION', 'QC_PENDING']
const keyOf = (poId, productId) => `${poId}-${productId}`

/** Suggest: urgent first, first-fit-decreasing by CBM; dense (heavy) lines go to the lightest-loaded container to balance weight. */
export function suggestPlan(lines, products, type, count) {
  const cap = CONTAINERS[type]
  const P = (id) => products.find((p) => p.id === id)
  const items = lines.filter((l) => l.qty > 0).map((l) => ({ ...l, uc: P(l.productId).cbm, uk: P(l.productId).weightKg, step: P(l.productId).type === 'SPARE' ? P(l.productId).cartonQty || 1 : 1 }))
  const avgDensity = sum(items, (i) => i.uk * i.qty) / (sum(items, (i) => i.uc * i.qty) || 1)
  items.sort((a, b) => (a.priority === 'URGENT' ? 0 : 1) - (b.priority === 'URGENT' ? 0 : 1) || b.uc * b.qty - a.uc * a.qty)
  const cont = Array.from({ length: count }, () => ({ cbm: 0, kg: 0 }))
  const placed = []
  const left = []
  for (const it of items) {
    let rem = it.qty
    const heavy = it.uk / (it.uc || 1) > avgDensity
    const fitQty = (c) => {
      const q = Math.min(Math.floor((cap.cbm - c.cbm) / (it.uc || 1e-9) + 1e-9), Math.floor((cap.kg - c.kg) / (it.uk || 1e-9) + 1e-9))
      return Math.max(0, it.step > 1 && q < rem ? Math.floor(q / it.step) * it.step : q)
    }
    let guard = 0
    while (rem > 0 && guard++ < 20) {
      const order = cont.map((c, i) => i)
      if (heavy) order.sort((a, b) => cont[a].kg / cap.kg - cont[b].kg / cap.kg)
      let idx = order.find((i) => fitQty(cont[i]) >= rem)
      let q = rem
      if (idx == null) {
        idx = order.reduce((best, i) => (fitQty(cont[i]) > (best == null ? 0 : fitQty(cont[best])) ? i : best), null)
        if (idx == null || fitQty(cont[idx]) <= 0) break
        q = fitQty(cont[idx])
      }
      cont[idx].cbm += q * it.uc
      cont[idx].kg += q * it.uk
      placed.push({ id: `${it.poId}-${it.productId}-${idx}`, poId: it.poId, productId: it.productId, qty: q, priority: it.priority, container: idx })
      rem -= q
    }
    if (rem > 0) left.push({ poId: it.poId, productId: it.productId, qty: rem, priority: it.priority })
  }
  return { items: placed, left }
}

export default function ContainerPlanning() {
  const s = useStore()
  const { user } = useLookup()
  const { canEdit, isAdmin } = useCanEdit()
  const plans = s.containerPlans || []
  const [edit, setEdit] = useState(null)

  const open = (plan) => setEdit(plan ? { ...plan, items: plan.items.map((i) => ({ ...i, container: i.container || 0 })), containerCount: plan.containerCount || 1, left: [] } : { id: null, name: `Consolidation – ${fmtDate(new Date().toISOString().slice(0, 10))}`, containerType: '40HC', containerCount: 1, items: [], notes: '', status: 'DRAFT', left: [] })

  const decide = async (p, ok) => {
    const r = await prompt(ok ? { title: `Approve ${p.number}`, label: 'Remark (optional)', confirmText: 'Approve plan' } : { title: `Reject ${p.number}`, label: 'Reason / changes required', required: true, tone: 'danger', confirmText: 'Reject plan' })
    if (r === null) return
    s.approveContainerPlan(p.id, ok, r)
    ok ? toast.success('Container plan approved', 'Purchase team notified') : toast.warn('Container plan rejected', 'Returned to Purchase for changes')
  }

  if (edit) return <PlanEditor plan={edit} onClose={() => setEdit(null)} canEdit={canEdit} isAdmin={isAdmin} decide={decide} />

  const pending = plans.filter((p) => p.status === 'PENDING_APPROVAL')
  return (
    <div>
      <PageHeader title="Container Planning" subtitle="Combine QC-released and in-production lots into containers – optimised for space, weight balance and urgency"
        actions={canEdit && <Button icon={Plus} onClick={() => open(null)}>New container plan</Button>} />
      <Grid cols={4}>
        <Stat label="Plans awaiting approval" value={pending.length} icon={Send} tone="amber" />
        <Stat label="Approved plans" value={plans.filter((p) => p.status === 'APPROVED').length} icon={CheckCircle2} tone="green" />
        <Stat label="Avg. space utilisation" value={plans.length ? `${Math.round(sum(plans, (p) => p.utilizationPct) / plans.length)}%` : '—'} sub="Across all plans" icon={Boxes} />
        <Stat label="POs available to plan" value={s.purchaseOrders.filter((p) => POOL_STATUS.includes(p.status)).length} sub="Ready to ship / in production" icon={PackageOpen} tone="blue" />
      </Grid>
      {isAdmin && pending.length > 0 && <Alert tone="warn" className="mt-4" title={`${pending.length} container plan(s) need your approval`}>Review utilisation and urgent items, then approve or send back.</Alert>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {plans.length === 0 && <Card className="lg:col-span-2"><EmptyState icon={Container} title="No container plans yet" action={canEdit && <Button icon={Plus} onClick={() => open(null)}>Create the first plan</Button>} /></Card>}
        {plans.map((p) => (
          <Card key={p.id} className="hover:border-brand-300 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 cursor-pointer" onClick={() => open(p)}>
                <div className="flex items-center gap-2 flex-wrap"><span className="font-mono font-semibold text-ink-900">{p.number}</span><StatusBadge status={p.status} /></div>
                <div className="text-sm text-slate-700 mt-0.5 truncate">{p.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.containerCount || 1} × {p.containerType} · {p.items.length} lines · {(p.poIds || [...new Set(p.items.map((i) => i.poId))]).map((id) => s.purchaseOrders.find((x) => x.id === id)?.number).join(', ')}</div>
              </div>
              <Container className="w-8 h-8 text-slate-300 shrink-0" />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <Bar label={`Space · ${fmtNum(p.totalCbm)} cbm`} pct={p.utilizationPct} />
              <Bar label={`Weight · ${fmtNum(Math.round(p.totalWeight || 0))} kg`} pct={p.weightPct} tone="ink" />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-slate-500">
              <span>By {user(p.createdBy)?.name || '—'}{p.submittedAt ? ` · submitted ${fmtDate(p.submittedAt)}` : ''}{p.approvedAt ? ` · ${p.status === 'APPROVED' ? 'approved' : 'decided'} ${fmtDate(p.approvedAt)}` : ''}</span>
              {p.items.some((i) => i.priority === 'URGENT') && <Badge tone="red"><Flame className="w-3 h-3" />Urgent items</Badge>}
              <div className="ml-auto flex gap-2">
                {isAdmin && p.status === 'PENDING_APPROVAL' && <><Button size="sm" variant="danger" icon={XCircle} onClick={() => decide(p, false)}>Reject</Button><Button size="sm" variant="success" icon={CheckCircle2} onClick={() => decide(p, true)}>Approve</Button></>}
                <Button size="sm" variant="secondary" onClick={() => open(p)}>Open</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function PlanEditor({ plan: initial, onClose, canEdit, isAdmin, decide }) {
  const s = useStore()
  const nav = useNavigate()
  const { user } = useLookup()
  const [plan, setPlan] = useState(initial)
  const live = (s.containerPlans || []).find((p) => p.id === plan.id)
  const status = live?.status || plan.status
  const locked = !canEdit || ['PENDING_APPROVAL', 'APPROVED'].includes(status)
  const cap = CONTAINERS[plan.containerType]
  const P = (id) => s.products.find((p) => p.id === id)
  const upd = (patch) => setPlan((p) => ({ ...p, ...patch }))

  // pool: lines of eligible POs minus quantities already in other live plans
  const pool = useMemo(() => {
    const used = {}
    for (const cp of s.containerPlans || []) {
      if (cp.id === plan.id || cp.status === 'REJECTED') continue
      for (const i of cp.items) used[keyOf(i.poId, i.productId)] = (used[keyOf(i.poId, i.productId)] || 0) + i.qty
    }
    return s.purchaseOrders.filter((po) => POOL_STATUS.includes(po.status) || plan.items.some((i) => i.poId === po.id))
      .flatMap((po) => po.lines.map((l) => ({ poId: po.id, po, productId: l.productId, qty: l.qty - (used[keyOf(po.id, l.productId)] || 0) })))
      .filter((l) => l.qty > 0)
  }, [s.containerPlans, s.purchaseOrders, plan.id, plan.items])

  const [sel, setSel] = useState(() => new Set(initial.items.length ? initial.items.map((i) => keyOf(i.poId, i.productId)) : []))
  const [urgent, setUrgent] = useState(() => new Set(initial.items.filter((i) => i.priority === 'URGENT').map((i) => keyOf(i.poId, i.productId))))
  const togglePO = (poId, v) => setSel((x) => { const n = new Set(x); pool.filter((l) => l.poId === poId).forEach((l) => (v ? n.add(keyOf(l.poId, l.productId)) : n.delete(keyOf(l.poId, l.productId)))); return n })

  const containers = Array.from({ length: plan.containerCount }, (_, i) => {
    const items = plan.items.filter((it) => it.container === i)
    const cbm = sum(items, (it) => it.qty * P(it.productId).cbm)
    const kg = sum(items, (it) => it.qty * P(it.productId).weightKg)
    return { i, items, cbm, kg }
  })
  const totalCbm = sum(containers, (c) => c.cbm)
  const over = containers.some((c) => c.cbm > cap.cbm || c.kg > cap.kg)

  const suggest = () => {
    const lines = pool.filter((l) => sel.has(keyOf(l.poId, l.productId))).map((l) => ({ ...l, priority: urgent.has(keyOf(l.poId, l.productId)) ? 'URGENT' : 'NORMAL' }))
    if (!lines.length) return toast.error('Select at least one PO line to plan')
    const r = suggestPlan(lines, s.products, plan.containerType, plan.containerCount)
    upd({ items: r.items, left: r.left })
    r.left.length ? toast.warn('Plan suggested – some quantity does not fit', `${r.left.length} line(s) left over. Add a container or switch to a bigger type.`) : toast.success('Plan suggested', `${r.items.length} lines across ${plan.containerCount} × ${plan.containerType}`)
  }
  const recommend = () => {
    const lines = pool.filter((l) => sel.has(keyOf(l.poId, l.productId)))
    const cbm = sum(lines, (l) => l.qty * P(l.productId).cbm)
    const kg = sum(lines, (l) => l.qty * P(l.productId).weightKg)
    const opts = Object.entries(CONTAINERS).map(([k, c]) => ({ k, n: Math.max(1, Math.ceil(Math.max(cbm / (c.cbm * 0.92), kg / c.kg))) })).map((o) => ({ ...o, util: cbm / (CONTAINERS[o.k].cbm * o.n) }))
    const best = opts.sort((a, b) => a.n - b.n || b.util - a.util)[0]
    upd({ containerType: best.k, containerCount: best.n })
    toast.info(`Recommended ${best.n} × ${best.k}`, `${fmtNum(round2(cbm))} cbm · ${fmtNum(Math.round(kg))} kg → ${Math.round(best.util * 100)}% space`)
  }

  const setItem = (idx, patch) => upd({ items: plan.items.map((it, j) => (j === idx ? { ...it, ...patch } : it)) })
  const toSave = () => ({
    ...plan, status: undefined,
    items: plan.items.filter((i) => i.qty > 0).map((it) => ({ ...it, id: it.id || `${it.poId}-${it.productId}-${it.container}`, cbm: round2(it.qty * P(it.productId).cbm), weight: round2(it.qty * P(it.productId).weightKg) })),
  })
  const save = () => {
    if (!plan.items.length) return toast.error('Plan is empty – suggest or add items first')
    const { status: _st, left: _l, ...rest } = toSave()
    const saved = s.savePurchaseContainerPlan({ ...rest, ...(live ? {} : { id: undefined }) })
    setPlan((p) => ({ ...p, id: saved.id, number: saved.number }))
    toast.success(`${saved.number} saved`)
    return saved
  }
  const submit = async () => {
    if (over) return toast.error('A container is over capacity – rebalance before submitting')
    if (!(await confirm({ title: 'Submit for Director approval?', message: `${plan.containerCount} × ${plan.containerType}, ${Math.round((totalCbm / (cap.cbm * plan.containerCount)) * 100)}% space utilisation.`, confirmText: 'Submit' }))) return
    const saved = save()
    if (!saved) return
    s.submitContainerPlan(saved.id)
    toast.success('Submitted for approval', 'Director notified')
  }
  const del = async () => {
    if (!(await confirm({ title: `Delete ${live.number}?`, tone: 'danger', confirmText: 'Delete' }))) return
    s.deleteContainerPlan(live.id)
    toast.success('Plan deleted')
    onClose()
  }
  const readyPos = [...new Set(plan.items.map((i) => i.poId))].filter((id) => s.purchaseOrders.find((p) => p.id === id)?.status === 'READY_TO_SHIP')
  const byPo = pool.reduce((m, l) => ((m[l.poId] = m[l.poId] || []).push(l), m), {})

  return (
    <div>
      <PageHeader breadcrumb={<button className="hover:underline inline-flex items-center gap-1" onClick={onClose}><ArrowLeft className="w-3 h-3" />Container planning</button>}
        title={<span className="flex items-center gap-2 flex-wrap">{live?.number || 'New container plan'} <StatusBadge status={status} /></span>}
        subtitle={live?.approvalRemark ? `Director: ${live.approvalRemark}` : 'Select lines → suggest plan → adjust → submit for approval'}
        actions={<>
          {isAdmin && status === 'PENDING_APPROVAL' && <><Button variant="danger" icon={XCircle} onClick={() => decide(live, false)}>Reject</Button><Button variant="success" icon={CheckCircle2} onClick={() => decide(live, true)}>Approve</Button></>}
          {status === 'APPROVED' && canEdit && <Button icon={Ship} disabled={!readyPos.length} title={!readyPos.length ? 'No POs in this plan are QC-released yet' : ''} onClick={() => nav(`/erp/purchase/shipments?create=1&pos=${readyPos.join(',')}&plan=${live.id}`)}>Create shipment</Button>}
          {!locked && live && status === 'DRAFT' && <Button variant="ghost" icon={Trash2} onClick={del}>Delete</Button>}
          {!locked && <Button variant="secondary" icon={Save} onClick={save}>Save draft</Button>}
          {!locked && <Button icon={Send} onClick={submit}>Submit for approval</Button>}
        </>} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="space-y-4">
          <Card title="Plan setup">
            <div className="space-y-3">
              <Field label="Plan name"><Input disabled={locked} value={plan.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Container type"><Select disabled={locked} value={plan.containerType} onChange={(e) => upd({ containerType: e.target.value })} options={Object.entries(CONTAINERS).map(([k, c]) => ({ value: k, label: `${k} · ${c.cbm} cbm` }))} /></Field>
                <Field label="Containers"><NumberInput disabled={locked} min={1} max={10} value={plan.containerCount} onChange={(v) => { const n = Math.max(1, Math.min(10, Number(v) || 1)); upd({ containerCount: n, items: plan.items.map((i) => ({ ...i, container: Math.min(i.container, n - 1) })) }) }} /></Field>
              </div>
              <div className="text-[11px] text-slate-500">Capacity per container: {cap.cbm} cbm · {fmtNum(cap.kg)} kg payload</div>
              <Field label="Notes for approver"><Textarea disabled={locked} rows={2} value={plan.notes || ''} onChange={(e) => upd({ notes: e.target.value })} /></Field>
              {!locked && <div className="flex gap-2"><Button variant="secondary" className="flex-1" icon={Scale} onClick={recommend}>Recommend size</Button><Button className="flex-1" icon={Wand2} onClick={suggest}>Suggest plan</Button></div>}
            </div>
          </Card>
          <Card title="Lines to plan" subtitle="Ready-to-ship and in-production POs (qty not in other plans). Flame = urgent.">
            {Object.keys(byPo).length === 0 ? <div className="text-sm text-slate-400">No open lines available.</div> : Object.entries(byPo).map(([poId, ls]) => (
              <div key={poId} className="mb-3 last:mb-0">
                <div className="flex items-center gap-2 mb-1">
                  {!locked && <Checkbox checked={ls.every((l) => sel.has(keyOf(l.poId, l.productId)))} onChange={(v) => togglePO(poId, v)} />}
                  <PoLink po={ls[0].po} /><StatusBadge status={ls[0].po.status} />
                </div>
                <ul className="ml-6 space-y-1">
                  {ls.map((l) => {
                    const k = keyOf(l.poId, l.productId)
                    const p = P(l.productId)
                    return (
                      <li key={k} className="flex items-center gap-2 text-xs">
                        {!locked && <Checkbox checked={sel.has(k)} onChange={(v) => setSel((x) => { const n = new Set(x); v ? n.add(k) : n.delete(k); return n })} />}
                        <span className="flex-1 truncate text-slate-700">{p.shortName}</span>
                        <span className="tabular-nums text-slate-500">{fmtNum(l.qty)} · {fmtNum(round2(l.qty * p.cbm))} cbm</span>
                        <button type="button" disabled={locked} title="Mark urgent" onClick={() => setUrgent((x) => { const n = new Set(x); n.has(k) ? n.delete(k) : n.add(k); return n })} className={cx('p-0.5 rounded', urgent.has(k) ? 'text-red-500' : 'text-slate-300 hover:text-slate-500')}><Flame className="w-3.5 h-3.5" /></button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </Card>
          {live?.history?.length > 0 && <Card title="Approval trail"><Timeline items={[...live.history].reverse().map((h) => ({ ...h, by: user(h.by)?.name }))} /></Card>}
        </div>

        <div className="xl:col-span-2 space-y-4">
          <Grid cols={3}>
            <Stat label="Total volume" value={`${fmtNum(round2(totalCbm))} cbm`} sub={`${Math.round((totalCbm / (cap.cbm * plan.containerCount)) * 100)}% of ${plan.containerCount} × ${plan.containerType}`} icon={Boxes} />
            <Stat label="Total weight" value={`${fmtNum(Math.round(sum(containers, (c) => c.kg)))} kg`} icon={Scale} tone="ink" />
            <Stat label="Urgent lines" value={plan.items.filter((i) => i.priority === 'URGENT').length} icon={Flame} tone="red" />
          </Grid>
          {over && <Alert tone="error" title="Over capacity">One or more containers exceed space or payload. Move items, reduce quantities or add a container.</Alert>}
          {plan.items.length === 0 && <Card><EmptyState icon={Wand2} title="No items planned yet" message="Select lines on the left and click Suggest plan. You can then move items between containers, change quantities and mark urgent items." /></Card>}
          {plan.items.length > 0 && containers.map((c) => (
            <Card key={c.i} title={`Container ${c.i + 1} · ${plan.containerType}`} subtitle={`${c.items.length} lines · ${fmtNum(round2(c.cbm))} / ${cap.cbm} cbm · ${fmtNum(Math.round(c.kg))} / ${fmtNum(cap.kg)} kg`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <Bar label="Space utilisation" pct={(c.cbm / cap.cbm) * 100} tone={c.cbm / cap.cbm > 0.85 ? 'green' : 'brand'} />
                <Bar label={`Weight (${c.kg / Math.max(c.cbm, 0.01) > cap.kg / cap.cbm ? 'heavy' : 'light'} mix)`} pct={(c.kg / cap.kg) * 100} tone="ink" />
              </div>
              {c.items.length === 0 ? <div className="text-sm text-slate-400 text-center py-4">Empty – move items here.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr><th className="text-left px-2 py-1.5">Item</th><th className="text-left px-2 py-1.5">PO</th><th className="text-right px-2 py-1.5 w-28">Qty</th><th className="text-right px-2 py-1.5">CBM</th><th className="text-right px-2 py-1.5">kg</th><th className="px-2 py-1.5">Container</th><th /></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {c.items.map((it) => {
                        const idx = plan.items.indexOf(it)
                        const p = P(it.productId)
                        const po = s.purchaseOrders.find((x) => x.id === it.poId)
                        return (
                          <tr key={idx} className={it.priority === 'URGENT' ? 'bg-red-50/40' : ''}>
                            <td className="px-2 py-1.5"><ProductCell product={p} /></td>
                            <td className="px-2 py-1.5 text-xs"><PoLink po={po} /></td>
                            <td className="px-2 py-1.5 text-right">{locked ? fmtNum(it.qty) : <NumberInput min={0} value={it.qty} onChange={(v) => setItem(idx, { qty: Number(v) || 0 })} className="text-right !py-1" />}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(round2(it.qty * p.cbm))}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(Math.round(it.qty * p.weightKg))}</td>
                            <td className="px-2 py-1.5">{locked ? `#${it.container + 1}` : <Select value={it.container} onChange={(e) => setItem(idx, { container: Number(e.target.value) })} options={containers.map((x) => ({ value: x.i, label: `#${x.i + 1}` }))} className="!py-1 w-20" />}</td>
                            <td className="px-1 whitespace-nowrap">
                              <IconButton icon={Flame} title={it.priority === 'URGENT' ? 'Unmark urgent' : 'Mark urgent'} disabled={locked} className={it.priority === 'URGENT' ? '!text-red-500' : ''} onClick={() => setItem(idx, { priority: it.priority === 'URGENT' ? 'NORMAL' : 'URGENT' })} />
                              {!locked && <IconButton icon={Trash2} tone="danger" title="Remove from plan" onClick={() => upd({ items: plan.items.filter((_, j) => j !== idx) })} />}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
          {plan.left?.length > 0 && (
            <Card title="Not planned (no space)" subtitle="Add a container or choose a bigger type, then suggest again">
              <ul className="text-sm divide-y divide-slate-100">{plan.left.map((l, i) => <li key={i} className="py-1.5 flex justify-between"><span>{P(l.productId).shortName} · {s.purchaseOrders.find((p) => p.id === l.poId)?.number}</span><span className="tabular-nums">{fmtNum(l.qty)} units</span></li>)}</ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
