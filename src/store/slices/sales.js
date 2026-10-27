// Store actions for the Sales module: quotations, tasks, targets, schemes, price lists, nudges, dealer lifecycle.
import { addDays, fmtINR, makeAttachment, nowISO, today, uid } from '../../lib/format'
import { priceOrder } from '../../lib/pricing'

const DEFAULT_SLABS = [
  { achievePct: 90, incentivePct: 1 },
  { achievePct: 100, incentivePct: 2 },
  { achievePct: 120, incentivePct: 3 },
]

// eslint-disable-next-line no-unused-vars
export const salesSlice = (set, get, api) => ({
  // ------------------------------------------------------------ quotations
  createQuotation: ({ partnerId, lines, validTill, note = '', status = 'DRAFT' }) => {
    const s = get()
    const priced = priceOrder(s, partnerId, lines)
    const partner = s.partners.find((p) => p.id === partnerId)
    const number = get().nextNo('QT')
    const q = {
      id: uid('qt'), number, partnerId, date: today(), validTill: validTill || addDays(today(), 15),
      lines: priced.lines, subtotal: priced.subtotal, gst: priced.gst, total: priced.total, appliedSchemes: priced.appliedSchemes,
      status, soId: null, note, createdBy: s.session.userId, salespersonId: partner?.salespersonId || s.session.userId,
      timeline: [{ ts: nowISO(), text: 'Quotation created' }],
    }
    set((st) => ({ quotations: [q, ...(st.quotations || [])] }))
    get().audit('Created quotation', 'Quotation', number)
    return q
  },
  updateQuotation: (id, { partnerId, lines, validTill, note }) => {
    const s = get()
    const q0 = (s.quotations || []).find((x) => x.id === id)
    if (!q0) return null
    const pid = partnerId || q0.partnerId
    const priced = lines ? priceOrder(s, pid, lines) : null
    return get().updateItem('quotations', id, (x) => ({
      ...x, partnerId: pid, validTill: validTill || x.validTill, note: note ?? x.note,
      ...(priced ? { lines: priced.lines, subtotal: priced.subtotal, gst: priced.gst, total: priced.total, appliedSchemes: priced.appliedSchemes } : {}),
      timeline: [...(x.timeline || []), { ts: nowISO(), text: 'Quotation revised' }],
    }))
  },
  sendQuotation: (id) => {
    const s = get()
    const q = (s.quotations || []).find((x) => x.id === id)
    const p = s.partners.find((x) => x.id === q.partnerId)
    get().sendEmail({
      to: p.email, subject: `Quotation ${q.number} – Btali International`,
      body: `Dear ${p.contact},\n\nPlease find attached our quotation ${q.number} for ${fmtINR(q.total)} (incl. GST), valid till ${q.validTill}.\nPrices include your applicable price list, slab discounts and running schemes.\n\nRegards,\nBtali Sales`,
      attachments: [makeAttachment(`${q.number.replace(/\//g, '-')}.pdf`)], ref: q.number, kind: 'QUOTATION',
    })
    get().notify({ title: 'New quotation from Btali', body: `${q.number} · ${fmtINR(q.total)}`, partnerId: q.partnerId, link: '/dealer/orders' })
    get().updateItem('quotations', id, (x) => ({ ...x, status: 'SENT', sentAt: nowISO(), timeline: [...(x.timeline || []), { ts: nowISO(), text: `Emailed to ${p.email}` }] }))
    get().audit('Sent quotation', 'Quotation', q.number)
  },
  setQuotationStatus: (id, status, remark = '') => {
    const q = (get().quotations || []).find((x) => x.id === id)
    get().updateItem('quotations', id, (x) => ({ ...x, status, timeline: [...(x.timeline || []), { ts: nowISO(), text: `Marked ${status.toLowerCase()}${remark ? ` – ${remark}` : ''}` }] }))
    get().audit(`Quotation ${status.toLowerCase()}`, 'Quotation', q?.number)
  },
  convertQuotation: (id) => {
    const s = get()
    const q = (s.quotations || []).find((x) => x.id === id)
    if (!q || q.soId) return null
    const so = get().createSalesOrder({ partnerId: q.partnerId, lines: q.lines.filter((l) => !l.free).map((l) => ({ productId: l.productId, qty: l.qty })), source: 'SALES', note: `Converted from quotation ${q.number}`, quotationId: q.id })
    get().updateItem('quotations', id, (x) => ({ ...x, status: 'CONVERTED', soId: so.id, timeline: [...(x.timeline || []), { ts: nowISO(), text: `Converted to sales order ${so.number}` }] }))
    return so
  },

  // ------------------------------------------------------------ tasks
  addTask: (data) => {
    const by = get().session.userId
    const t = { id: uid('task'), status: 'OPEN', priority: 'MEDIUM', type: 'FOLLOW_UP', dueDate: today(), notes: '', outcome: '', createdBy: by, createdAt: nowISO(), ...data }
    set((s) => ({ tasks: [t, ...(s.tasks || [])] }))
    if (t.assigneeId && t.assigneeId !== by) {
      get().notify({ title: 'New task assigned', body: `${t.title} · due ${t.dueDate}`, link: '/erp/sales/tasks', userIds: [t.assigneeId] })
    }
    get().audit('Created task', 'Task', t.title)
    return t
  },
  updateTask: (id, patch) => get().updateItem('tasks', id, patch),
  completeTask: (id, outcome = '') => {
    const t = get().updateItem('tasks', id, (x) => ({ ...x, status: 'DONE', outcome, completedAt: nowISO(), completedBy: get().session.userId }))
    if (t?.partnerId && t.type === 'VISIT') get().updateItem('partners', t.partnerId, (p) => ({ ...p, lastVisitDate: today() }))
    get().audit('Completed task', 'Task', t?.title)
    return t
  },
  reopenTask: (id) => get().updateItem('tasks', id, (x) => ({ ...x, status: 'OPEN', completedAt: null, outcome: x.outcome })),
  deleteTask: (id) => get().removeItem('tasks', id),

  // ------------------------------------------------------------ targets
  upsertTarget: (t) => {
    const existing = (get().targets || []).find((x) => (t.id && x.id === t.id) || (!t.id && x.ownerType === t.ownerType && x.ownerId === t.ownerId && x.periodType === t.periodType && x.period === t.period))
    if (existing) return get().updateItem('targets', existing.id, { ...t, id: existing.id, updatedAt: nowISO() })
    const it = { id: uid('tg'), slabs: DEFAULT_SLABS, createdAt: nowISO(), ...t }
    set((s) => ({ targets: [it, ...(s.targets || [])] }))
    if (it.ownerType === 'DEALER') get().notify({ title: 'New sales target', body: `Target ${fmtINR(it.amount)} set for ${it.period}`, partnerId: it.ownerId, link: '/dealer' })
    return it
  },
  removeTarget: (id) => get().removeItem('targets', id),
  recordIncentivePayout: (targetId, { amount, achievedPct }) => {
    const t = get().updateItem('targets', targetId, (x) => ({ ...x, payout: { amount, achievedPct, approvedBy: get().session.userId, at: nowISO() } }))
    get().audit('Approved incentive payout', 'Target', `${t?.ownerId} ${t?.period} ${fmtINR(amount)}`)
    return t
  },

  // ------------------------------------------------------------ schemes & price lists
  upsertScheme: (sc) => {
    if (sc.id && get().schemes.some((x) => x.id === sc.id)) {
      get().updateItem('schemes', sc.id, { ...sc, updatedAt: nowISO() })
      get().audit('Updated scheme', 'Scheme', sc.code)
      return sc
    }
    const it = { id: uid('sc'), active: true, categories: [], productIds: [], regions: [], partnerIds: [], createdAt: nowISO(), createdBy: get().session.userId, ...sc }
    set((s) => ({ schemes: [it, ...s.schemes] }))
    get().notify({ title: 'New scheme launched', body: `${it.code} – ${it.name}`, roles: ['SALES_EXEC', 'SALES_MANAGER', 'DEALER', 'FRANCHISE'], link: '/erp/sales/schemes' })
    get().audit('Created scheme', 'Scheme', it.code)
    return it
  },
  toggleScheme: (id, active) => {
    const sc = get().updateItem('schemes', id, (x) => ({ ...x, active: active ?? !x.active }))
    get().audit(sc?.active ? 'Activated scheme' : 'Deactivated scheme', 'Scheme', sc?.code)
    return sc
  },
  removeScheme: (id) => get().removeItem('schemes', id),
  updatePriceList: (id, patch, { publish = true } = {}) => {
    const pl = get().updateItem('priceLists', id, (x) => ({ ...x, ...patch, ...(publish ? { version: (x.version || 1) + 1, publishedAt: today() } : {}) }))
    if (publish && pl) {
      const dealers = get().partners.filter((p) => p.priceListId === id && p.status === 'ACTIVE')
      for (const d of dealers) get().notify({ title: 'Price list updated', body: `${pl.name} v${pl.version} is now live`, partnerId: d.id, link: '/dealer/catalog' })
      get().audit('Published price list', 'PriceList', `${pl.name} v${pl.version}`)
    }
    return pl
  },
  assignPriceList: (partnerId, priceListId) => {
    const p = get().updateItem('partners', partnerId, { priceListId })
    get().audit('Assigned price list', 'Partner', `${p?.name} → ${priceListId}`)
    return p
  },

  // ------------------------------------------------------------ dealer lifecycle
  updatePartnerProfile: (id, patch) => {
    const p = get().updateItem('partners', id, (x) => ({ ...x, ...patch, updatedAt: nowISO() }))
    get().audit('Updated dealer profile', 'Partner', p?.name)
    return p
  },
  movePartnerStage: (id, stage, reason = '') => {
    const p = get().updateItem('partners', id, (x) => ({
      ...x, stage,
      status: stage === 'DEAD' ? 'INACTIVE' : stage === 'CURRENT' ? (x.status === 'PENDING_APPROVAL' ? x.status : 'ACTIVE') : x.status === 'ACTIVE' || x.status === 'INACTIVE' ? 'PROSPECT' : x.status,
      deadReason: stage === 'DEAD' ? reason : x.deadReason,
      notes: stage === 'DEAD' && reason ? reason : x.notes,
      stageHistory: [...(x.stageHistory || []), { ts: nowISO(), from: x.stage, to: stage, reason, by: get().session.userId }],
    }))
    get().notify({ title: 'Dealer stage changed', body: `${p?.name} → ${stage.replace('_', ' ').toLowerCase()}${reason ? ` (${reason})` : ''}`, roles: ['SALES_MANAGER'], link: `/erp/sales/dealers/${id}` })
    get().audit('Moved dealer stage', 'Partner', `${p?.name} → ${stage}`)
    return p
  },
  addPartnerKyc: (id, atts) => get().updateItem('partners', id, (x) => ({ ...x, kyc: [...(x.kyc || []), ...atts] })),
  removePartnerKyc: (id, attId) => get().updateItem('partners', id, (x) => ({ ...x, kyc: (x.kyc || []).filter((a) => a.id !== attId) })),

  // ------------------------------------------------------------ reorder nudges
  actionNudge: (partnerId, { action, note = '', productIds = [] }) => {
    const rec = { id: uid('na'), partnerId, action, note, productIds, date: today(), ts: nowISO(), by: get().session.userId }
    set((s) => ({ nudgeActions: [rec, ...(s.nudgeActions || [])] }))
    get().audit('Actioned reorder nudge', 'Partner', `${partnerId} · ${action}`)
    return rec
  },
  sendReorderReminder: (partnerId, productIds = []) => {
    const s = get()
    const p = s.partners.find((x) => x.id === partnerId)
    const items = productIds.map((id) => s.products.find((x) => x.id === id)).filter(Boolean)
    get().sendEmail({
      to: p.email, subject: `Time to restock – Btali International`,
      body: `Dear ${p.contact},\n\nBased on your recent ordering pattern${items.length ? ' and the stock you reported' : ''}, it may be time to restock${items.length ? `:\n${items.map((x) => `• ${x.shortName} (${x.sku})`).join('\n')}` : '.'}\n\nCurrent schemes are auto-applied when you order on the Btali Dealer Portal.\n\nRegards,\nBtali Sales`,
      ref: p.code, kind: 'REORDER_NUDGE',
    })
    get().notify({ title: 'Restock reminder', body: items.length ? `${items.length} items running low` : 'Your usual reorder is due', partnerId, link: '/dealer/orders' })
    return get().actionNudge(partnerId, { action: 'EMAIL', productIds, note: 'Reminder emailed' })
  },
})
