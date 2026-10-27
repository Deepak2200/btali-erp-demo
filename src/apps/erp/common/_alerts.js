// Live alerts engine – computed from current data using settings.alertRules.
import { daysBetween, fmtINR, today, sum, fmtDate } from '../../../lib/format'
import { onHand } from '../../../lib/stock'

export const ALERT_KINDS = {
  CONTAINER_DELAY: { label: 'Container delay', roles: ['ADMIN', 'PURCHASE', 'FINANCE_HEAD', 'SALES_MANAGER'] },
  PRE_ETA: { label: 'Pre-ETA', roles: ['ADMIN', 'PURCHASE', 'ACCOUNTS', 'FINANCE_HEAD', 'DISPATCH'] },
  CUSTOMS_PENDING: { label: 'CAN / IGM / BOE', roles: ['ADMIN', 'PURCHASE', 'ACCOUNTS'] },
  REORDER: { label: 'Below reorder', roles: ['ADMIN', 'PURCHASE', 'SALES_MANAGER'] },
  DEALER_INACTIVE: { label: 'Dealer inactive', roles: ['ADMIN', 'SALES_MANAGER', 'SALES_EXEC'] },
  HIGH_VALUE_PAYMENT: { label: 'High-value payment', roles: ['ADMIN', 'FINANCE_HEAD', 'ACCOUNTS'] },
  RECEIVABLE: { label: 'Receivables ageing', roles: ['ADMIN', 'FINANCE_HEAD', 'ACCOUNTS', 'SALES_MANAGER'] },
}

export const computeAlerts = (state) => {
  const rules = { dealerInactiveDays: 45, receivableBuckets: [30, 60, 90], highValuePayment: 500000, containerDelayDays: 3, preEtaDays: 3, ...(state.settings?.alertRules || {}) }
  const t = today()
  const out = []
  const vname = (id) => state.vendors.find((v) => v.id === id)?.name || ''

  for (const sh of state.shipments || []) {
    if (sh.status === 'RECEIVED' || !sh.eta) continue
    const late = daysBetween(sh.eta, t)
    if (late > 0) {
      out.push({
        id: `cd-${sh.id}`, kind: 'CONTAINER_DELAY', severity: late >= rules.containerDelayDays ? 'critical' : 'warning', date: sh.eta,
        title: `${sh.number} delayed ${late} day${late > 1 ? 's' : ''}`,
        body: `${sh.containerNo || ''} · ${vname(sh.vendorId)} – ETA was ${fmtDate(sh.eta)}, status ${String(sh.status).replace(/_/g, ' ').toLowerCase()}`,
        link: '/erp/purchase/shipments',
      })
    } else if (-late <= rules.preEtaDays) {
      out.push({
        id: `pe-${sh.id}`, kind: 'PRE_ETA', severity: 'info', date: sh.eta,
        title: `${sh.number} arriving ${late === 0 ? 'today' : `in ${-late} day${-late > 1 ? 's' : ''}`}`,
        body: `${sh.containerNo || ''} · ${vname(sh.vendorId)} – arrange CHA, duty funds and Starex unloading slot`,
        link: '/erp/purchase/shipments',
      })
    }
    const pend = (sh.milestones || []).filter((m) => ['CAN', 'IGM', 'BOE'].includes(m.key) && !m.done && m.planned && m.planned <= t)
    if (pend.length) {
      out.push({
        id: `cp-${sh.id}`, kind: 'CUSTOMS_PENDING', severity: 'warning', date: pend[0].planned,
        title: `${pend.map((m) => m.key).join(' / ')} pending – ${sh.number}`,
        body: `${pend.map((m) => `${m.label} (planned ${fmtDate(m.planned)})`).join('; ')}`,
        link: '/erp/purchase/shipments',
      })
    }
  }

  for (const p of state.products) {
    if (!p.active) continue
    const oh = onHand(state, p.id)
    if (oh < p.reorderLevel) {
      out.push({
        id: `ro-${p.id}`, kind: 'REORDER', severity: oh <= p.reorderLevel * 0.25 ? 'critical' : 'warning', date: t,
        title: `${p.shortName} below reorder level`, body: `${p.sku}: on hand ${oh} vs reorder level ${p.reorderLevel} (MOQ ${p.moq})`,
        link: '/erp/purchase/reorder',
      })
    }
  }

  for (const d of state.partners) {
    if (d.type !== 'DEALER' || d.stage !== 'CURRENT' || d.status !== 'ACTIVE') continue
    const since = d.lastOrderDate ? daysBetween(d.lastOrderDate, t) : 999
    if (since > rules.dealerInactiveDays) {
      out.push({
        id: `di-${d.id}`, kind: 'DEALER_INACTIVE', severity: since > rules.dealerInactiveDays * 2 ? 'critical' : 'warning', date: d.lastOrderDate,
        title: `${d.name} inactive for ${since > 900 ? 'a long time' : `${since} days`}`, body: `${d.city} · ${d.region} – last order ${d.lastOrderDate ? fmtDate(d.lastOrderDate) : 'never'}`,
        link: '/erp/sales/dealers',
      })
    }
  }

  for (const b of state.vendorBills || []) {
    if (!['PENDING_BOSS', 'APPROVED'].includes(b.status)) continue
    const amt = b.amountINR ?? b.amount ?? 0
    if (amt < rules.highValuePayment) continue
    out.push({
      id: `hv-${b.id}`, kind: 'HIGH_VALUE_PAYMENT', severity: b.status === 'PENDING_BOSS' ? 'critical' : 'warning', date: b.dueDate || b.date,
      title: `${fmtINR(amt)} ${b.status === 'PENDING_BOSS' ? 'awaiting Director approval' : 'awaiting payment release'}`,
      body: `${b.number} · ${vname(b.vendorId)}${b.dueDate ? ` · due ${fmtDate(b.dueDate)}` : ''}`,
      link: b.status === 'PENDING_BOSS' ? '/erp/accounts/vendor-bills' : '/erp/accounts/payments',
    })
  }

  const buckets = [...(rules.receivableBuckets || [30, 60, 90])].sort((a, b) => a - b)
  for (const so of state.salesOrders) {
    if (so.status !== 'CONFIRMED' || so.paymentStatus === 'PAID') continue
    const age = daysBetween(so.date, t)
    const hit = buckets.filter((b) => age >= b).pop()
    if (!hit) continue
    const due = so.total - (so.paidAmount || 0)
    const pt = state.partners.find((p) => p.id === so.partnerId)
    out.push({
      id: `ar-${so.id}`, kind: 'RECEIVABLE', severity: hit >= buckets[buckets.length - 1] ? 'critical' : hit >= (buckets[1] || hit) ? 'warning' : 'info', date: so.date,
      title: `${fmtINR(due)} outstanding ${hit}+ days`, body: `${so.number} · ${pt?.name || ''} – ${age} days since confirmation`,
      link: `/erp/sales/orders/${so.id}`,
    })
  }
  const rank = { critical: 0, warning: 1, info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || String(b.date || '').localeCompare(String(a.date || '')))
}

export const alertsForUser = (alerts, user) => {
  if (!user) return []
  if (user.role === 'ADMIN') return alerts
  return alerts.filter((a) => ALERT_KINDS[a.kind]?.roles.includes(user.role))
}

export const receivablesAgeing = (state) => {
  const t = today()
  const b = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  for (const so of state.salesOrders) {
    if (so.status === 'CANCELLED' || so.paymentStatus === 'PAID' || !['CONFIRMED', 'INVOICED', 'DISPATCHED', 'DELIVERED'].includes(so.status)) continue
    const due = so.total - (so.paidAmount || 0)
    if (due <= 0) continue
    const age = daysBetween(so.date, t)
    b[age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+'] += due
  }
  return { buckets: b, total: sum(Object.values(b)) }
}
