// Store actions for the Accounts module (Btali Books): vendor bills (Boss → Madam workflow), payments, receipts helpers,
// expenses & recurring templates, vouchers, banking & reconciliation, notes, assets, loans, GST/TDS & e-invoicing.
import { addDays, fmtINR, makeAttachment, nowISO, round2, today, uid } from '../../lib/format'
import {
  billPayable, expensePayable, tdsRateFor, panFromGstin, monthlyDep, emiSchedule, sourceName, EXPENSE_CATEGORIES, monthEnd, noteTotal,
} from '../../apps/erp/accounts/_books'

const pad = (n) => String(n).padStart(4, '0')
const ymLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// eslint-disable-next-line no-unused-vars
export const accountsSlice = (set, get, api) => {
  const me = () => get().session.userId
  const hist = (text) => ({ ts: nowISO(), by: me(), text })
  /** module-local document series (VP, CV, PV, RV, WW, FA, CB, PC, BS, TDS) */
  const docNo = (key, fmt) => {
    const st = get().accountsSettings || {}
    const n = ((st.counters || {})[key] || 0) + 1
    set((s) => ({ accountsSettings: { ...(s.accountsSettings || {}), counters: { ...((s.accountsSettings || {}).counters || {}), [key]: n } } }))
    return fmt ? fmt(n) : `${key}/26-27/${pad(n)}`
  }
  /** core series, skipping numbers already used by seeded documents */
  const coreNo = (key, col) => {
    let no = get().nextNo(key)
    let guard = 0
    while ((get()[col] || []).some((x) => x.number === no) && guard++ < 500) no = get().nextNo(key)
    return no
  }
  const vendorOf = (id) => get().vendors.find((v) => v.id === id)

  return {
    // ============================================================ vendor bills
    createVendorBill: (data) => {
      const v = vendorOf(data.vendorId)
      const currency = data.currency || v?.currency || 'INR'
      const fxRate = currency === 'INR' ? 1 : Number(data.fxRate) || get().settings.fx[currency] || 1
      const amount = Number(data.amount) || 0
      const amountINR = round2(amount * fxRate)
      const gstRate = Number(data.gstRate) || 0
      const gst = data.gst != null && data.gst !== '' ? round2(data.gst) : round2((amountINR * gstRate) / 100)
      const tdsRate = data.tdsSection ? (data.tdsRate != null && data.tdsRate !== '' ? Number(data.tdsRate) : tdsRateFor(data.tdsSection, panFromGstin(v?.gst))) : 0
      const tds = data.tds != null && data.tds !== '' ? Math.round(data.tds) : Math.round((amountINR * tdsRate) / 100)
      const number = coreNo('VB', 'vendorBills')
      const bill = {
        id: uid('vb'), number, vendorId: data.vendorId, vendorRef: data.vendorRef || '', poId: data.poId || null, shipmentId: data.shipmentId || null,
        date: data.date || today(), dueDate: data.dueDate || addDays(data.date || today(), v?.paymentTerms?.creditDays || 0), currency, amount, fxRate, amountINR, gstRate, gst,
        tdsSection: data.tdsSection || '', tdsRate, tds, category: data.category || 'OTHER', billType: data.billType || 'INVOICE', accountId: data.accountId || undefined, description: data.description || '',
        status: 'PENDING_BOSS', submittedBy: me(), submittedAt: nowISO(), bossApprovedAt: null, bossApprovedBy: null, bossRemark: '', paidAt: null, paymentId: null, paymentRef: '', swift: null,
        attachments: data.attachments || [], history: [hist('Bill entered and sent for Boss approval')],
      }
      if (!bill.accountId) delete bill.accountId
      set((s) => ({ vendorBills: [bill, ...(s.vendorBills || [])] }))
      get().notify({ title: 'Vendor bill awaiting your approval', body: `${number} · ${v?.name} · ${fmtINR(billPayable(bill))}`, link: '/erp/accounts/vendor-bills', roles: ['ADMIN'] })
      get().audit('Created vendor bill', 'VendorBill', number)
      return bill
    },
    /** edit a pending/rejected bill; a rejected bill is re-submitted to Boss */
    updateVendorBill: (id, data) => {
      const b0 = (get().vendorBills || []).find((x) => x.id === id)
      if (!b0 || !['PENDING_BOSS', 'REJECTED'].includes(b0.status)) return null
      const fxRate = (data.currency || b0.currency) === 'INR' ? 1 : Number(data.fxRate ?? b0.fxRate) || 1
      const amount = Number(data.amount ?? b0.amount) || 0
      const amountINR = round2(amount * fxRate)
      const gstRate = Number(data.gstRate ?? b0.gstRate) || 0
      const tdsRate = Number(data.tdsRate ?? b0.tdsRate) || 0
      const patch = { ...data, fxRate, amount, amountINR, gstRate, gst: round2((amountINR * gstRate) / 100), tdsRate, tds: Math.round((amountINR * tdsRate) / 100) }
      const resubmit = b0.status === 'REJECTED'
      const b = get().updateItem('vendorBills', id, (x) => ({ ...x, ...patch, status: 'PENDING_BOSS', bossRemark: resubmit ? '' : x.bossRemark, history: [...(x.history || []), hist(resubmit ? 'Corrected and re-submitted for Boss approval' : 'Bill details updated')] }))
      if (resubmit) get().notify({ title: 'Vendor bill re-submitted', body: `${b.number} · ${fmtINR(billPayable(b))}`, link: '/erp/accounts/vendor-bills', roles: ['ADMIN'] })
      get().audit('Updated vendor bill', 'VendorBill', b0.number)
      return b
    },
    approveVendorBill: (id, approved = true, remark = '') => {
      const b = (get().vendorBills || []).find((x) => x.id === id)
      if (!b) return
      const v = vendorOf(b.vendorId)
      get().updateItem('vendorBills', id, (x) => ({
        ...x, status: approved ? 'APPROVED' : 'REJECTED', bossApprovedAt: approved ? nowISO() : null, bossApprovedBy: me(), bossRemark: remark,
        history: [...(x.history || []), hist(approved ? `Approved by Boss${remark ? ` – ${remark}` : ''}; forwarded to Madam for payment` : `Rejected by Boss – ${remark}`)],
      }))
      if (approved) {
        const madam = get().users.find((u) => u.role === 'FINANCE_HEAD')
        get().notify({ title: 'Bill approved – ready for payment', body: `${b.number} · ${v?.name} · ${fmtINR(billPayable(b))} · due ${b.dueDate}`, link: '/erp/accounts/payments', roles: ['FINANCE_HEAD'] })
        if (madam) get().sendEmail({ to: madam.email, subject: `Payment release: ${b.number} – ${v?.name}`, body: `Dear ${madam.name.split(' ')[0]},\n\n${b.number} (${v?.name}, ref ${b.vendorRef}) for ${fmtINR(billPayable(b))} has been approved by the Director and is due on ${b.dueDate}.\nPlease release the payment from the Payment Dashboard.\n\nBtali Books`, ref: b.number, kind: 'APPROVAL' })
        get().notify({ title: 'Vendor bill approved', body: `${b.number} · ${v?.name}`, link: '/erp/accounts/vendor-bills', roles: ['ACCOUNTS'] })
      } else {
        get().notify({ title: 'Vendor bill rejected', body: `${b.number} · ${remark}`, type: 'warning', link: '/erp/accounts/vendor-bills', roles: ['ACCOUNTS'] })
      }
      get().audit(approved ? 'Approved vendor bill' : 'Rejected vendor bill', 'VendorBill', b.number)
    },
    /** Madam releases payment: bill → PAID, payment voucher, bank book reduced, remittance advice to vendor */
    payVendorBill: (id, { mode = 'NEFT', bankId = 'bk1', ref = '', date = today(), fxRate, swift = null, remark = '' } = {}) => {
      const b = (get().vendorBills || []).find((x) => x.id === id)
      if (!b || b.status !== 'APPROVED') return { ok: false, error: 'Only Boss-approved bills can be paid.' }
      const v = vendorOf(b.vendorId)
      const payFx = b.currency === 'INR' ? 1 : Number(fxRate) || b.fxRate
      const booked = billPayable(b)
      const amountINR = b.currency === 'INR' ? booked : round2(b.amount * payFx)
      const number = docNo('VP')
      const pm = { id: uid('vp'), number, billIds: [id], vendorId: b.vendorId, date, mode, bankId, ref, currency: b.currency, amountFC: b.currency === 'INR' ? null : b.amount, fxRate: payFx, bookedINR: booked, amountINR, swift, remark, paidBy: me(), createdAt: nowISO() }
      set((s) => ({ vendorPayments: [pm, ...(s.vendorPayments || [])] }))
      get().updateItem('vendorBills', id, (x) => ({ ...x, status: 'PAID', paidAt: nowISO(), paymentId: pm.id, paymentRef: ref, swift: swift || x.swift, attachments: swift ? [...(x.attachments || []), { ...swift, docType: 'SWIFT' }] : x.attachments, history: [...(x.history || []), hist(`Paid via ${mode} ${ref} from ${sourceName(get(), bankId)}${b.currency !== 'INR' ? ` @ ${payFx}` : ''}`)] }))
      // telex dependency: balance payment for a shipment releases telex request
      if (b.billType === 'BALANCE' && b.shipmentId) {
        const sh = get().shipments.find((x) => x.id === b.shipmentId)
        if (sh && !sh.telexReleased) {
          get().updateItem('shipments', sh.id, (x) => ({ ...x, balancePaidAt: nowISO(), alerts: [...(x.alerts || []), { ts: nowISO(), text: `Supplier balance paid (${number}) – telex release requested` }] }))
          get().sendEmail({ to: v?.email, subject: `Balance remitted – please release telex for ${sh.blNo}`, body: `Dear ${v?.contact},\n\nWe have remitted ${b.currency} ${b.amount.toLocaleString('en-IN')} against ${b.vendorRef} (SWIFT ref ${ref}). Kindly arrange telex release for BL ${sh.blNo} at the earliest.\n\nRegards,\nBtali Accounts`, attachments: swift ? [swift] : [], ref: b.number })
          get().notify({ title: 'Balance paid – telex awaited', body: `${sh.number} · ${v?.name}`, link: '/erp/purchase/shipments', roles: ['PURCHASE', 'ACCOUNTS'] })
        }
      }
      get().sendEmail({ to: v?.email, subject: `Remittance advice ${number} – Btali International`, body: `Dear ${v?.contact || 'Sir/Madam'},\n\nWe have released ${b.currency === 'INR' ? fmtINR(amountINR) : `${b.currency} ${b.amount.toLocaleString('en-IN')}`} against your invoice ${b.vendorRef} via ${mode} (ref ${ref || '—'}) on ${date}.${b.tds ? `\nTDS u/s ${b.tdsSection}: ${fmtINR(b.tds)} deducted.` : ''}\n\nRegards,\nBtali Accounts`, attachments: [makeAttachment(`Remittance-${number.replace(/\//g, '-')}.pdf`)], ref: b.number, kind: 'REMITTANCE' })
      get().notify({ title: 'Vendor payment released', body: `${b.number} · ${v?.name} · ${fmtINR(amountINR)}`, link: '/erp/accounts/vendor-bills', roles: ['ACCOUNTS'] })
      get().audit('Paid vendor bill', 'VendorBill', `${b.number} / ${number}`)
      return { ok: true, payment: pm }
    },
    /** reminders to Madam (and Boss for pending ones) for bills due within N days */
    sendBillReminders: (days = 7) => {
      const s = get()
      const lim = addDays(today(), days)
      const due = (s.vendorBills || []).filter((b) => ['APPROVED', 'PENDING_BOSS'].includes(b.status) && b.dueDate <= lim)
      if (!due.length) return 0
      const name = (id) => s.vendors.find((v) => v.id === id)?.name
      const lines = due.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((b) => `• ${b.number} – ${name(b.vendorId)} – ${fmtINR(billPayable(b))} – due ${b.dueDate}${b.dueDate < today() ? ' (OVERDUE)' : ''}${b.status === 'PENDING_BOSS' ? ' – awaiting Boss approval' : ''}`).join('\n')
      const madam = s.users.find((u) => u.role === 'FINANCE_HEAD')
      const boss = s.users.find((u) => u.role === 'ADMIN')
      get().sendEmail({ to: madam?.email, cc: boss?.email, subject: `Payment reminder: ${due.length} bill(s) due in the next ${days} days`, body: `Dear ${madam?.name?.split(' ')[0] || 'Madam'},\n\nThe following vendor bills fall due shortly:\n\n${lines}\n\nPlease release payments from the Payment Dashboard.\n\nBtali Books`, kind: 'REMINDER' })
      get().notify({ title: 'Payment reminder', body: `${due.length} bill(s) worth ${fmtINR(due.reduce((a, b) => a + billPayable(b), 0))} due within ${days} days`, type: 'warning', link: '/erp/accounts/payments', roles: ['FINANCE_HEAD'] })
      if (due.some((b) => b.status === 'PENDING_BOSS')) get().notify({ title: 'Bills due – approval pending', body: `${due.filter((b) => b.status === 'PENDING_BOSS').length} bill(s) due soon still need your approval`, type: 'warning', link: '/erp/accounts/vendor-bills', roles: ['ADMIN'] })
      set((st) => ({ accountsSettings: { ...st.accountsSettings, reminders: { ...(st.accountsSettings?.reminders || {}), lastSent: nowISO() } } }))
      get().audit('Sent payment reminders', 'VendorBill', `${due.length} bills`)
      return due.length
    },

    // ============================================================ expenses
    createExpense: (data) => {
      const amount = Number(data.amount) || 0
      const gstRate = Number(data.gstRate) || 0
      const gst = round2((amount * gstRate) / 100)
      const tdsRate = data.tdsSection ? tdsRateFor(data.tdsSection) : 0
      const tds = Math.round((amount * tdsRate) / 100)
      const threshold = (get().settings.approvalMatrix || []).find((m) => m.doc === 'Expense')?.threshold ?? 5000
      const auto = amount <= threshold
      const number = coreNo('EXPN', 'expenses')
      const e = {
        id: uid('ex'), number, date: data.date || today(), category: data.category, description: data.description || '', payee: data.payee || '', amount, gstRate, gst, tdsSection: data.tdsSection || '', tdsRate, tds,
        recurring: !!data.templateId, templateId: data.templateId || null, frequency: data.templateId ? 'MONTHLY' : null, status: auto ? 'APPROVED' : 'PENDING_APPROVAL', payFrom: data.payFrom || 'bk1', paymentMode: '',
        paidAt: null, paymentRef: '', submittedBy: me(), approvedBy: null, remark: '', attachments: data.attachments || [],
        history: [hist(data.templateId ? 'Generated from recurring template' : 'Expense logged'), ...(auto ? [{ ts: nowISO(), by: 'system', text: `Auto-approved (within ${fmtINR(threshold)} approval threshold)` }] : [])],
      }
      set((s) => ({ expenses: [e, ...(s.expenses || [])] }))
      if (!auto && !data.silent) get().notify({ title: 'Expense awaiting approval', body: `${number} · ${e.category} · ${fmtINR(amount + gst)}`, link: '/erp/accounts/expenses', roles: ['ADMIN', 'FINANCE_HEAD'] })
      get().audit('Logged expense', 'Expense', number)
      return e
    },
    approveExpense: (id, approved = true, remark = '') => {
      const e = (get().expenses || []).find((x) => x.id === id)
      if (!e) return
      get().updateItem('expenses', id, (x) => ({ ...x, status: approved ? 'APPROVED' : 'REJECTED', approvedBy: me(), approvedAt: nowISO(), remark, history: [...(x.history || []), hist(approved ? `Approved${remark ? ` – ${remark}` : ''}` : `Rejected – ${remark}`)] }))
      get().notify({ title: approved ? 'Expense approved – ready for payment' : 'Expense rejected', body: `${e.number} · ${e.category}${remark ? ` · ${remark}` : ''}`, type: approved ? 'info' : 'warning', link: '/erp/accounts/expenses', roles: ['ACCOUNTS'], userIds: e.submittedBy ? [e.submittedBy] : [] })
      get().audit(approved ? 'Approved expense' : 'Rejected expense', 'Expense', e.number)
    },
    payExpense: (id, { payFrom = 'bk1', mode = 'NEFT', ref = '', date = today() } = {}) => {
      const e = (get().expenses || []).find((x) => x.id === id)
      if (!e || e.status !== 'APPROVED') return { ok: false, error: 'Only approved expenses can be paid.' }
      get().updateItem('expenses', id, (x) => ({ ...x, status: 'PAID', payFrom, paymentMode: mode, paymentRef: ref, paidAt: `${date}T${new Date().toISOString().slice(11)}`, history: [...(x.history || []), hist(`Paid ${fmtINR(expensePayable(x))} from ${sourceName(get(), payFrom)} (${mode}${ref ? ` ${ref}` : ''})`)] }))
      get().audit('Paid expense', 'Expense', e.number)
      return { ok: true }
    },
    saveExpenseTemplate: (t) => {
      if (t.id && (get().expenseTemplates || []).some((x) => x.id === t.id)) return get().updateItem('expenseTemplates', t.id, t)
      const n = { id: uid('et'), active: true, lastGenerated: null, dayOfMonth: 1, payFrom: 'bk1', ...t }
      set((s) => ({ expenseTemplates: [...(s.expenseTemplates || []), n] }))
      get().audit('Created recurring template', 'Expense', n.name)
      return n
    },
    removeExpenseTemplate: (id) => get().removeItem('expenseTemplates', id),
    /** create this month's entries for every active template not yet generated */
    generateRecurringExpenses: (ym = today().slice(0, 7)) => {
      const tpls = (get().expenseTemplates || []).filter((t) => t.active && (t.lastGenerated || '') < ym)
      const created = []
      for (const t of tpls) {
        const d = `${ym}-${String(Math.min(28, t.dayOfMonth || 1)).padStart(2, '0')}`
        const e = get().createExpense({ date: d > today() && ym === today().slice(0, 7) ? today() : d, category: t.category, payee: t.payee, description: `${t.name} – ${ymLabel(ym)}`, amount: t.amount, gstRate: t.gstRate, tdsSection: t.tdsSection, payFrom: t.payFrom, templateId: t.id, silent: true })
        created.push(e)
        get().updateItem('expenseTemplates', t.id, { lastGenerated: ym })
      }
      const pending = created.filter((e) => e.status === 'PENDING_APPROVAL')
      if (pending.length) get().notify({ title: 'Recurring expenses for approval', body: `${pending.length} entries for ${ymLabel(ym)} · ${fmtINR(pending.reduce((a, e) => a + e.amount + e.gst, 0))}`, link: '/erp/accounts/expenses', roles: ['ADMIN', 'FINANCE_HEAD'] })
      if (created.length) get().audit('Generated recurring expenses', 'Expense', `${ymLabel(ym)} – ${created.length}`)
      return created
    },

    // ============================================================ journals & vouchers
    /** data: {type:'JOURNAL'|'CONTRA'|'PAYMENT'|'RECEIPT', date, narration, lines:[{accountId, dr, cr, partyType, partyId}], draft} */
    postJournal: (data) => {
      const lines = (data.lines || []).filter((l) => l.accountId && ((Number(l.dr) || 0) > 0 || (Number(l.cr) || 0) > 0)).map((l) => ({ accountId: l.accountId, dr: round2(l.dr || 0), cr: round2(l.cr || 0), partyType: l.partyType || null, partyId: l.partyId || null, note: l.note || '' }))
      const dr = round2(lines.reduce((a, l) => a + l.dr, 0)), cr = round2(lines.reduce((a, l) => a + l.cr, 0))
      if (!data.draft && (lines.length < 2 || Math.abs(dr - cr) > 0.009)) return { ok: false, error: `Debit (${fmtINR(dr, true)}) and credit (${fmtINR(cr, true)}) must be equal.` }
      const type = data.type || 'JOURNAL'
      const number = data.draft ? `DRAFT-${Date.now().toString().slice(-5)}` : type === 'CONTRA' ? docNo('CV') : type === 'PAYMENT' ? docNo('PV') : type === 'RECEIPT' ? docNo('RV') : coreNo('JV', 'journals')
      const j = { id: uid('jv'), number, type, date: data.date || today(), narration: data.narration || '', lines, status: data.draft ? 'DRAFT' : 'POSTED', source: data.source || 'MANUAL', createdBy: me(), postedBy: data.draft ? null : me(), createdAt: nowISO(), attachments: data.attachments || [], ...(data.extra || {}) }
      set((s) => ({ journals: [j, ...(s.journals || [])] }))
      get().audit(data.draft ? 'Saved draft voucher' : 'Posted voucher', 'Journal', number)
      return { ok: true, journal: j }
    },
    postDraftJournal: (id) => {
      const j = (get().journals || []).find((x) => x.id === id)
      if (!j || j.status !== 'DRAFT') return { ok: false, error: 'Not a draft' }
      const dr = round2(j.lines.reduce((a, l) => a + (l.dr || 0), 0)), cr = round2(j.lines.reduce((a, l) => a + (l.cr || 0), 0))
      if (Math.abs(dr - cr) > 0.009 || j.lines.length < 2) return { ok: false, error: 'Debit and credit must be equal before posting.' }
      const number = j.type === 'CONTRA' ? docNo('CV') : j.type === 'PAYMENT' ? docNo('PV') : j.type === 'RECEIPT' ? docNo('RV') : coreNo('JV', 'journals')
      get().updateItem('journals', id, { status: 'POSTED', number, postedBy: me(), postedAt: nowISO() })
      get().audit('Posted voucher', 'Journal', number)
      return { ok: true, number }
    },
    updateDraftJournal: (id, patch) => get().updateItem('journals', id, patch),
    deleteDraftJournal: (id) => get().removeItem('journals', id),
    reverseJournal: (id, date = today()) => {
      const j = (get().journals || []).find((x) => x.id === id)
      if (!j || j.status !== 'POSTED') return { ok: false }
      const r = get().postJournal({ type: j.type, date, narration: `Reversal of ${j.number} – ${j.narration}`, lines: j.lines.map((l) => ({ ...l, dr: l.cr, cr: l.dr })), source: 'REVERSAL', extra: { reversalOf: j.id } })
      if (r.ok) get().updateItem('journals', id, { reversedBy: r.journal.id })
      return r
    },
    saveLedgerAccount: (acc) => {
      if (acc.id && (get().chartOfAccounts || []).some((a) => a.id === acc.id)) return get().updateItem('chartOfAccounts', acc.id, acc)
      const a = { id: acc.code, opening: 0, active: true, system: false, ...acc }
      set((s) => ({ chartOfAccounts: [...(s.chartOfAccounts || []), a] }))
      get().audit('Created ledger', 'Ledger', `${a.code} ${a.name}`)
      return a
    },

    // ============================================================ banking
    /** rows: [{date, description, ref, debit, credit, balance}] */
    importBankStatement: (bankId, rows, fileName = 'statement.csv') => {
      const importId = uid('bsi')
      const lines = rows.map((r) => ({ id: uid('bs'), bankId, date: r.date, valueDate: r.valueDate || r.date, description: r.description || '', ref: r.ref || '', debit: round2(r.debit || 0), credit: round2(r.credit || 0), balance: r.balance != null && r.balance !== '' ? round2(r.balance) : null, status: 'UNMATCHED', match: null, importId }))
      const dates = lines.map((l) => l.date).sort()
      set((s) => ({ bankStatements: [...(s.bankStatements || []), ...lines], bankStatementImports: [{ id: importId, bankId, fileName, from: dates[0], to: dates[dates.length - 1], lines: lines.length, importedAt: nowISO(), by: me() }, ...(s.bankStatementImports || [])] }))
      get().audit('Imported bank statement', 'Bank', `${fileName} (${lines.length} lines)`)
      return { importId, count: lines.length, matched: get().autoMatchBank(bankId) }
    },
    /** candidates a statement line can be matched to */
    bankMatchCandidates: (line) => {
      const s = get()
      const amt = line.credit || line.debit
      const out = []
      const near = (d) => Math.abs((new Date(d) - new Date(line.date)) / 86400000) <= 7
      const used = new Set((s.bankStatements || []).filter((l) => l.match && l.id !== line.id).map((l) => `${l.match.type}:${l.match.id}`))
      const ledger = (s.bankAccounts || []).find((b) => b.id === line.bankId)?.ledgerId
      if (line.credit > 0) {
        for (const r of s.receipts || []) if ((r.bankId || 'bk1') === line.bankId && Math.abs(r.amount - amt) < 1 && near(r.date) && !used.has(`RECEIPT:${r.id}`)) out.push({ type: 'RECEIPT', id: r.id, label: `${r.number} · ${s.partners.find((p) => p.id === r.partnerId)?.name}`, ref: r.ref, date: r.date, amount: r.amount })
      } else {
        for (const p of s.vendorPayments || []) if (p.bankId === line.bankId && Math.abs(p.amountINR - amt) < 1 && near(p.date) && !used.has(`VENDOR_PAYMENT:${p.id}`)) out.push({ type: 'VENDOR_PAYMENT', id: p.id, label: `${p.number} · ${s.vendors.find((v) => v.id === p.vendorId)?.name}`, ref: p.ref, date: p.date, amount: p.amountINR })
        for (const e of s.expenses || []) if (e.status === 'PAID' && (e.payFrom || 'bk1') === line.bankId && Math.abs(expensePayable(e) - amt) < 1 && e.paidAt && near(e.paidAt.slice(0, 10)) && !used.has(`EXPENSE:${e.id}`)) out.push({ type: 'EXPENSE', id: e.id, label: `${e.number} · ${e.payee || e.category}`, ref: e.paymentRef, date: e.paidAt.slice(0, 10), amount: expensePayable(e) })
        for (const ln of s.loans || []) for (const r of ln.schedule || []) if (r.status === 'PAID' && ln.bankId === line.bankId && Math.abs(r.emi - amt) < 1 && near(r.paidOn) && !used.has(`EMI:${ln.id}:${r.n}`)) out.push({ type: 'EMI', id: `${ln.id}:${r.n}`, label: `EMI ${r.n} · ${ln.lender}`, ref: r.ref, date: r.paidOn, amount: r.emi })
      }
      for (const j of s.journals || []) {
        if (j.status !== 'POSTED' || used.has(`JOURNAL:${j.id}`) || !near(j.date)) continue
        const l = j.lines.find((x) => x.accountId === ledger)
        if (!l) continue
        if ((line.credit > 0 && Math.abs(l.dr - amt) < 1) || (line.debit > 0 && Math.abs(l.cr - amt) < 1)) out.push({ type: 'JOURNAL', id: j.id, label: `${j.number} · ${j.narration.slice(0, 40)}`, ref: j.number, date: j.date, amount: amt })
      }
      // reference match first
      const refHit = (c) => c.ref && line.ref && (String(line.description).includes(c.ref) || String(c.ref) === String(line.ref))
      return out.sort((a, b) => Number(refHit(b)) - Number(refHit(a)))
    },
    autoMatchBank: (bankId) => {
      let n = 0
      for (const l of (get().bankStatements || []).filter((x) => x.bankId === bankId && x.status === 'UNMATCHED')) {
        const c = get().bankMatchCandidates(l)
        const best = c.find((x) => x.ref && (String(l.description).includes(x.ref) || x.ref === l.ref)) || (c.length === 1 ? c[0] : null)
        if (best) { get().matchStatementLine(l.id, { type: best.type, id: best.id }, true); n++ }
      }
      if (n) get().audit('Auto-matched bank lines', 'Bank', `${n} lines`)
      return n
    },
    matchStatementLine: (lineId, match, auto = false) => get().updateItem('bankStatements', lineId, { status: 'MATCHED', match, matchedBy: auto ? 'system' : me(), matchedAt: nowISO() }),
    unmatchStatementLine: (lineId) => get().updateItem('bankStatements', lineId, { status: 'UNMATCHED', match: null, matchedBy: null, matchedAt: null }),
    ignoreStatementLine: (lineId, reason = '') => get().updateItem('bankStatements', lineId, { status: 'IGNORED', note: reason }),
    /** book an unrecorded bank line (charges, interest…) as a voucher and match it */
    createEntryFromStatement: (lineId, { accountId, narration }) => {
      const l = (get().bankStatements || []).find((x) => x.id === lineId)
      if (!l) return { ok: false }
      const ledger = (get().bankAccounts || []).find((b) => b.id === l.bankId)?.ledgerId || '1220'
      const amt = l.credit || l.debit
      const r = get().postJournal({ type: l.credit ? 'RECEIPT' : 'PAYMENT', date: l.date, narration: narration || l.description, lines: l.credit ? [{ accountId: ledger, dr: amt }, { accountId, cr: amt }] : [{ accountId, dr: amt }, { accountId: ledger, cr: amt }], source: 'BANK' })
      if (r.ok) get().matchStatementLine(lineId, { type: 'JOURNAL', id: r.journal.id })
      return r
    },
    setBankBalance: (bankId, { date = today(), balance, note = '' }) => {
      const e = { id: uid('mb'), date, balance: Number(balance) || 0, note, by: me(), at: nowISO() }
      get().updateItem('bankAccounts', bankId, (b) => ({ ...b, manualBalances: [...(b.manualBalances || []), e].sort((a, c) => a.date.localeCompare(c.date)) }))
      const b = (get().bankAccounts || []).find((x) => x.id === bankId)
      get().notify({ title: 'Bank balance updated', body: `${b?.name}: ${fmtINR(e.balance)} as on ${date}`, link: '/erp/accounts/loans', roles: ['ADMIN', 'FINANCE_HEAD'] })
      get().audit('Entered bank balance', 'Bank', `${b?.name} ${e.balance}`)
      return e
    },
    addCheque: (data) => {
      const c = { id: uid('cq'), status: data.direction === 'ISSUED' ? 'ISSUED' : 'RECEIVED', bankId: 'bk1', createdBy: me(), createdAt: nowISO(), ...data, amount: Number(data.amount) || 0 }
      set((s) => ({ cheques: [c, ...(s.cheques || [])] }))
      get().audit('Recorded instrument', 'Cheque', `${c.instrument} ${c.number}`)
      return c
    },
    /** status flow: RECEIVED → DEPOSITED → CLEARED | BOUNCED ; ISSUED → CLEARED | CANCELLED */
    updateChequeStatus: (id, status, { date = today(), note = '' } = {}) => {
      const c = (get().cheques || []).find((x) => x.id === id)
      if (!c) return
      const patch = { status, note: note || c.note }
      if (status === 'DEPOSITED') patch.depositedOn = date
      if (status === 'CLEARED') patch.clearedOn = date
      if (status === 'BOUNCED') patch.bouncedOn = date
      get().updateItem('cheques', id, patch)
      if (status === 'CLEARED' && c.direction === 'RECEIVED' && c.soId) {
        const so = get().salesOrders.find((x) => x.id === c.soId)
        if (so && so.paymentStatus !== 'PAID') {
          const rc = get().recordReceipt({ soId: c.soId, amount: Math.min(c.amount, round2(so.total - (so.paidAmount || 0))), mode: c.instrument === 'DD' ? 'DD' : 'CHEQUE', ref: `${c.instrument} ${c.number}`, date, bankId: c.bankId || 'bk1' })
          get().updateItem('cheques', id, { receiptId: rc.id })
        }
      }
      if (status === 'BOUNCED' && c.partyType === 'DEALER') {
        get().notify({ title: 'Cheque bounced', body: `${c.partyName} · ${c.instrument} ${c.number} · ${fmtINR(c.amount)}`, type: 'warning', link: '/erp/accounts/banking', roles: ['SALES_MANAGER', 'FINANCE_HEAD', 'ACCOUNTS'] })
        const p = get().partners.find((x) => x.id === c.partyId)
        if (p) get().sendEmail({ to: p.email, subject: `Cheque ${c.number} returned unpaid`, body: `Dear ${p.contact},\n\nYour ${c.instrument.toLowerCase()} no. ${c.number} dated ${c.date} for ${fmtINR(c.amount)} has been returned by the bank. Kindly arrange payment by NEFT/RTGS.\n\nRegards,\nBtali Accounts`, ref: c.number })
      }
      get().audit(`Instrument ${status.toLowerCase()}`, 'Cheque', c.number)
    },
    addCashEntry: (data) => {
      const book = data.book === 'PETTY' ? 'PETTY' : 'CASH'
      const number = docNo(book === 'PETTY' ? 'PC' : 'CB', (n) => `${book === 'PETTY' ? 'PC' : 'CB'}-${pad(n)}`)
      const c = { id: uid('cb'), number, book, type: data.type || 'OUT', date: data.date || today(), amount: Number(data.amount) || 0, accountId: data.accountId, narration: data.narration || '', by: me(), attachments: data.attachments || [] }
      set((s) => ({ cashEntries: [c, ...(s.cashEntries || [])] }))
      get().audit('Cash book entry', 'Cash', number)
      return c
    },

    // ============================================================ credit / debit notes
    createNote: (data) => {
      const type = data.type === 'DEBIT' ? 'DEBIT' : 'CREDIT'
      const number = coreNo(type === 'DEBIT' ? 'DN' : 'CN', 'notes')
      const amount = round2(data.amount || 0)
      const gstRate = Number(data.gstRate ?? 18)
      const gst = round2((amount * gstRate) / 100)
      const n = { id: uid(type === 'DEBIT' ? 'dn' : 'cn'), number, type, partnerId: data.partnerId || null, vendorId: data.vendorId || null, invoiceId: data.invoiceId || null, billId: data.billId || null, amount, gstRate, gst, total: round2(amount + gst), reason: data.reason || '', source: data.source || 'MANUAL', date: data.date || today(), status: 'ISSUED', createdBy: me(), createdAt: nowISO() }
      set((s) => ({ notes: [n, ...(s.notes || [])] }))
      const party = n.partnerId ? get().partners.find((p) => p.id === n.partnerId) : get().vendors.find((v) => v.id === n.vendorId)
      if (data.email !== false && party?.email) get().sendEmail({ to: party.email, subject: `${type === 'DEBIT' ? 'Debit' : 'Credit'} note ${number} – Btali International`, body: `Dear ${party.contact || 'Sir/Madam'},\n\nPlease find attached ${type.toLowerCase()} note ${number} for ${fmtINR(n.total)} (incl. GST ${fmtINR(gst)}).\nReason: ${n.reason}\n\nRegards,\nBtali Accounts`, attachments: [makeAttachment(`${number.replace(/\//g, '-')}.pdf`)], ref: number })
      if (n.partnerId) get().notify({ title: `${type === 'DEBIT' ? 'Debit' : 'Credit'} note issued`, body: `${number} · ${fmtINR(n.total)}`, partnerId: n.partnerId, link: '/dealer/documents' })
      get().audit(`Issued ${type.toLowerCase()} note`, 'Note', number)
      return n
    },
    cancelNote: (id, reason = '') => {
      const n = (get().notes || []).find((x) => x.id === id)
      get().updateItem('notes', id, { status: 'CANCELLED', cancelReason: reason, cancelledAt: nowISO() })
      get().audit('Cancelled note', 'Note', n?.number)
    },
    emailNote: (id) => {
      const n = (get().notes || []).find((x) => x.id === id)
      if (!n) return
      const party = n.partnerId ? get().partners.find((p) => p.id === n.partnerId) : get().vendors.find((v) => v.id === n.vendorId)
      get().sendEmail({ to: party?.email, subject: `${n.type === 'DEBIT' ? 'Debit' : 'Credit'} note ${n.number} – Btali International`, body: `Dear ${party?.contact || 'Sir/Madam'},\n\nPlease find attached ${n.type.toLowerCase()} note ${n.number} dated ${n.date} for ${fmtINR(noteTotal(n))}.\n\nRegards,\nBtali Accounts`, attachments: [makeAttachment(`${n.number.replace(/\//g, '-')}.pdf`)], ref: n.number })
    },

    // ============================================================ fixed assets
    createAsset: (data, { payFrom = null } = {}) => {
      const code = docNo('FA', (n) => `FA-${String(n).padStart(3, '0')}`)
      const a = { id: uid('fa'), code, status: 'ACTIVE', accumulatedDep: 0, openingAccDep: 0, lastDepPeriod: null, attachments: [], salvage: 0, rate: 0, lifeYears: 0, ...data, cost: Number(data.cost) || 0 }
      set((s) => ({ assets: [a, ...(s.assets || [])] }))
      if (payFrom) {
        const ledger = payFrom === 'CREDIT' ? '2102' : payFrom === 'CASH' ? '1230' : (get().bankAccounts || []).find((b) => b.id === payFrom)?.ledgerId || '1220'
        const r = get().postJournal({ type: payFrom === 'CREDIT' ? 'JOURNAL' : 'PAYMENT', date: a.purchaseDate, narration: `Capitalised ${a.code} – ${a.name}${a.vendor ? ` (${a.vendor})` : ''}`, lines: [{ accountId: a.ledgerId, dr: a.cost }, { accountId: ledger, cr: a.cost }], source: 'ASSET' })
        if (r.ok) get().updateItem('assets', a.id, { journalId: r.journal.id })
      }
      get().audit('Added fixed asset', 'Asset', code)
      return a
    },
    updateAsset: (id, patch) => get().updateItem('assets', id, patch),
    disposeAsset: (id, { date = today(), amount = 0, payTo = 'bk1' } = {}) => {
      const a = (get().assets || []).find((x) => x.id === id)
      if (!a) return
      const wdv = round2(a.cost - (a.accumulatedDep || 0))
      const gain = round2((Number(amount) || 0) - wdv)
      const bankLedger = (get().bankAccounts || []).find((b) => b.id === payTo)?.ledgerId || '1220'
      get().postJournal({ type: 'JOURNAL', date, narration: `Disposal of ${a.code} – ${a.name} (sale value ${fmtINR(amount)})`, lines: [
        { accountId: bankLedger, dr: Number(amount) || 0 }, { accountId: '1150', dr: a.accumulatedDep || 0 }, gain < 0 ? { accountId: '5212', dr: -gain } : { accountId: '4040', cr: gain }, { accountId: a.ledgerId, cr: a.cost },
      ], source: 'ASSET' })
      get().updateItem('assets', id, { status: 'DISPOSED', disposedOn: date, saleValue: Number(amount) || 0 })
      get().audit('Disposed asset', 'Asset', a.code)
    },
    /** post depreciation for a month (yyyy-mm) for all active assets – once per period */
    runDepreciation: (ym) => {
      const s = get()
      if ((s.depRuns || []).some((r) => r.period === ym)) return { ok: false, error: `Depreciation for ${ymLabel(ym)} is already posted.` }
      const list = (s.assets || []).filter((a) => a.status === 'ACTIVE' && a.purchaseDate.slice(0, 7) <= ym && (!a.lastDepPeriod || a.lastDepPeriod < ym))
      const detail = {}
      let total = 0
      for (const a of list) { const d = monthlyDep(a, a.accumulatedDep || 0); if (d > 0) { detail[a.id] = d; total = round2(total + d) } }
      if (!total) return { ok: false, error: 'No depreciable assets for this period.' }
      const r = get().postJournal({ type: 'JOURNAL', date: monthEnd(ym) > today() ? today() : monthEnd(ym), narration: `Depreciation for ${ymLabel(ym)} – ${Object.keys(detail).length} assets (SLM/WDV as per register)`, lines: [{ accountId: '5212', dr: total }, { accountId: '1150', cr: total }], source: 'DEPRECIATION', extra: { period: ym, detail } })
      set((st) => ({
        assets: st.assets.map((a) => (detail[a.id] ? { ...a, accumulatedDep: round2((a.accumulatedDep || 0) + detail[a.id]), lastDepPeriod: ym } : a)),
        depRuns: [...(st.depRuns || []), { period: ym, journalId: r.journal.id, by: me(), at: nowISO(), amount: total }],
      }))
      get().notify({ title: 'Depreciation posted', body: `${ymLabel(ym)} · ${fmtINR(total)} · ${r.journal.number}`, link: '/erp/accounts/assets', roles: ['FINANCE_HEAD'] })
      return { ok: true, amount: total, journal: r.journal }
    },

    // ============================================================ loans
    createLoan: (data) => {
      const { emi, rows } = emiSchedule({ principal: Number(data.principal), rate: Number(data.rate), tenureMonths: Number(data.tenureMonths), startDate: data.startDate, dayOfMonth: Number(data.dayOfMonth) || 5 })
      const ln = { id: uid('ln'), status: 'ACTIVE', attachments: [], bankId: 'bk1', ...data, principal: Number(data.principal), rate: Number(data.rate), tenureMonths: Number(data.tenureMonths), emi, schedule: rows }
      set((s) => ({ loans: [...(s.loans || []), ln] }))
      if (data.disburseTo) get().postJournal({ type: 'RECEIPT', date: data.startDate, narration: `Loan disbursed – ${ln.lender} ${ln.accountNo}`, lines: [{ accountId: (get().bankAccounts || []).find((b) => b.id === data.disburseTo)?.ledgerId || '1220', dr: ln.principal }, { accountId: ln.ledgerId, cr: ln.principal }], source: 'LOAN' })
      get().audit('Added loan', 'Loan', `${ln.lender} ${ln.accountNo}`)
      return ln
    },
    payEmi: (loanId, n, { date = today(), ref = '' } = {}) => {
      const ln = (get().loans || []).find((x) => x.id === loanId)
      if (!ln) return { ok: false }
      const row = ln.schedule.find((r) => r.n === n)
      if (!row || row.status === 'PAID') return { ok: false, error: 'EMI already paid' }
      get().updateItem('loans', loanId, (x) => ({ ...x, schedule: x.schedule.map((r) => (r.n === n ? { ...r, status: 'PAID', paidOn: date, ref: ref || `ACH-${date.replace(/-/g, '')}` } : r)), status: x.schedule.every((r) => r.n === n || r.status === 'PAID') ? 'CLOSED' : x.status }))
      get().audit('EMI paid', 'Loan', `${ln.lender} #${n}`)
      return { ok: true }
    },

    // ============================================================ logistics reconciliation
    reviewMisResult: (uploadId, idx, { status = 'REVIEWED', note = '' } = {}) => {
      get().updateItem('misUploads', uploadId, (u) => ({ ...u, results: (u.results || []).map((r, i) => (i === idx ? { ...r, review: { status, note, by: me(), at: nowISO() } } : r)) }))
    },
    markMisReviewed: (uploadId) => {
      get().updateItem('misUploads', uploadId, (u) => ({ ...u, accountsReviewed: { by: me(), at: nowISO() }, results: (u.results || []).map((r) => (r.review ? r : { ...r, review: { status: r.status === 'MATCH' ? 'REVIEWED' : 'QUERY', note: '', by: me(), at: nowISO() } })) }))
      get().audit('Reviewed MIS upload', 'MIS', uploadId)
    },
    createWrongWorking: (data) => {
      const number = docNo('WW', (n) => `WW-${pad(n)}`)
      const billed = Number(data.billedAmount) || 0, correct = Number(data.correctAmount) || 0
      const w = { id: uid('ww'), number, status: 'OPEN', recoveredAmount: 0, resolution: '', loggedBy: me(), loggedAt: nowISO(), ...data, billedAmount: billed, correctAmount: correct, difference: round2(billed - correct), history: [hist(data.misUploadId ? 'Logged from MIS reconciliation' : 'Logged in Wrong Workings tracker')] }
      set((s) => ({ wrongWorkings: [w, ...(s.wrongWorkings || [])] }))
      if (data.misUploadId != null && data.misIndex != null) get().reviewMisResult(data.misUploadId, data.misIndex, { status: 'LOGGED', note: number })
      get().notify({ title: 'Billing error logged', body: `${number} · ${data.issue} · ${fmtINR(w.difference)}`, type: 'warning', link: '/erp/accounts/reconciliation', roles: ['FINANCE_HEAD'] })
      get().audit('Logged wrong working', 'WrongWorking', number)
      return w
    },
    updateWrongWorking: (id, patch, note) => {
      const w = (get().wrongWorkings || []).find((x) => x.id === id)
      if (!w) return
      const resolved = ['RESOLVED', 'WRITTEN_OFF'].includes(patch.status) && !['RESOLVED', 'WRITTEN_OFF'].includes(w.status)
      get().updateItem('wrongWorkings', id, (x) => {
        const n = { ...x, ...patch }
        if (patch.billedAmount != null || patch.correctAmount != null) n.difference = round2((Number(n.billedAmount) || 0) - (Number(n.correctAmount) || 0))
        if (resolved) n.resolvedAt = nowISO()
        return { ...n, history: [...(x.history || []), hist(note || (patch.status && patch.status !== x.status ? `Status → ${patch.status.replace(/_/g, ' ').toLowerCase()}` : 'Updated'))] }
      })
      if (patch.status === 'RAISED_WITH_VENDOR' && w.status !== 'RAISED_WITH_VENDOR') {
        const v = vendorOf(w.vendorId)
        if (v) get().sendEmail({ to: v.email, subject: `Billing discrepancy ${w.number} – ${w.ref}`, body: `Dear ${v.contact},\n\nDuring reconciliation we found the following discrepancy:\n${w.issue}\nBilled: ${fmtINR(w.billedAmount)} · Correct: ${fmtINR(w.correctAmount)} · Difference: ${fmtINR(w.difference)}\n\nKindly issue a credit note / revised invoice.\n\nRegards,\nBtali Accounts`, ref: w.number })
      }
      get().audit('Updated wrong working', 'WrongWorking', w.number)
    },
    deleteWrongWorking: (id) => get().removeItem('wrongWorkings', id),

    // ============================================================ GST, TDS, e-invoicing
    saveGstRate: (r) => {
      if (r.id && (get().gstRates || []).some((x) => x.id === r.id)) return get().updateItem('gstRates', r.id, { ...r, rate: Number(r.rate) })
      const n = { id: uid('gr'), cess: 0, type: 'GOODS', effectiveFrom: today(), ...r, rate: Number(r.rate) }
      set((s) => ({ gstRates: [...(s.gstRates || []), n] }))
      get().audit('Added GST rate', 'GST', `${n.hsn} @ ${n.rate}%`)
      return n
    },
    removeGstRate: (id) => get().removeItem('gstRates', id),
    /** deposit TDS for a month (yyyy-mm): {amountBySection} → challan + payment voucher */
    depositTds: (period, sections, { date = today(), bankId = 'bk1', challanNo = '' } = {}) => {
      const acct = { '194C': '2210', '194J': '2211', '194Q': '2212', '194I': '2213', '194H': '2214' }
      const secs = Object.entries(sections).filter(([, v]) => v > 0)
      if (!secs.length) return { ok: false, error: 'Nothing to deposit' }
      const total = round2(secs.reduce((a, [, v]) => a + v, 0))
      const ledger = (get().bankAccounts || []).find((b) => b.id === bankId)?.ledgerId || '1220'
      const r = get().postJournal({ type: 'PAYMENT', date, narration: `TDS deposited for ${ymLabel(period)} – challan ITNS 281 (${secs.map(([s]) => s).join(', ')})`, lines: [...secs.map(([s, v]) => ({ accountId: acct[s], dr: v })), { accountId: ledger, cr: total }], source: 'TDS' })
      if (!r.ok) return r
      const no = challanNo || `0510308${date.replace(/-/g, '').slice(2)}${String(Math.floor(10000 + Math.random() * 89999))}`
      const c = { id: uid('tc'), period, sections: Object.fromEntries(secs), amount: total, challanNo: no, bsr: '0510308', paidOn: date, bankId, journalId: r.journal.id, by: me() }
      set((s) => ({ tdsChallans: [c, ...(s.tdsChallans || [])] }))
      get().audit('Deposited TDS', 'TDS', `${period} ${total}`)
      return { ok: true, challan: c }
    },
    updateEinvoiceSettings: (patch) => set((s) => ({ accountsSettings: { ...s.accountsSettings, einvoice: { ...(s.accountsSettings?.einvoice || {}), ...patch } } })),
    testEinvoiceConnection: () => {
      set((s) => ({ accountsSettings: { ...s.accountsSettings, einvoice: { ...(s.accountsSettings?.einvoice || {}), connected: true, lastSync: nowISO(), lastTest: nowISO() } } }))
      return { ok: true, latencyMs: 280 + Math.floor(Math.random() * 300) }
    },
    /** register invoice on IRP → IRN, Ack no., signed QR */
    generateIrn: (invoiceId) => {
      const inv = get().invoices.find((x) => x.id === invoiceId)
      if (!inv) return { ok: false, error: 'Invoice not found' }
      if (inv.irnAckNo) return { ok: false, error: 'IRN already generated' }
      const p = get().partners.find((x) => x.id === inv.partnerId)
      if (!p?.gstin && inv.type !== 'EXPORT') return { ok: false, error: `${p?.name || 'Buyer'} has no GSTIN – B2C invoice, IRN not applicable.` }
      const hex = Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
      const ack = `1${String(Date.now()).slice(-11)}${Math.floor(Math.random() * 90 + 10)}`
      get().updateItem('invoices', invoiceId, { irn: hex, irnAckNo: ack, irnAckDate: nowISO(), irnStatus: 'GENERATED', signedQr: `QR-${hex.slice(0, 16)}` })
      set((s) => ({ accountsSettings: { ...s.accountsSettings, einvoice: { ...(s.accountsSettings?.einvoice || {}), lastSync: nowISO() } } }))
      get().audit('Generated IRN', 'Invoice', inv.number)
      return { ok: true, irn: hex, ackNo: ack }
    },
    generateEwayBill: (invoiceId, { vehicleNo = '', distanceKm = 0, transporterId } = {}) => {
      const inv = get().invoices.find((x) => x.id === invoiceId)
      if (!inv) return { ok: false, error: 'Invoice not found' }
      if (inv.ewbValidTill) return { ok: false, error: 'E-way bill already generated' }
      if (inv.total < 50000) return { ok: false, error: 'Invoice value below ₹50,000 – e-way bill not mandatory.' }
      const tr = get().transporters.find((t) => t.id === (transporterId || inv.transporterId))
      const veh = vehicleNo || inv.vehicleNo || tr?.vehicleNo
      if (!veh) return { ok: false, error: 'Vehicle number is required (Part-B).' }
      const km = Number(distanceKm) || 0
      const validDays = Math.max(1, Math.ceil((km || 200) / 200))
      const ewb = String(Math.floor(1e11 + Math.random() * 9e11))
      get().updateItem('invoices', invoiceId, { ewayBill: ewb, ewbDate: nowISO(), ewbValidTill: addDays(today(), validDays), ewbVehicle: veh, ewbDistanceKm: km, vehicleNo: veh, ewbStatus: 'ACTIVE' })
      get().audit('Generated e-way bill', 'Invoice', inv.number)
      return { ok: true, ewb, validTill: addDays(today(), validDays) }
    },
    /** keeps a record when the books are exported to Tally */
    logTallyExport: (what, fileName) => {
      if (get().adminLogExport) get().adminLogExport(what, fileName)
      else get().audit('Tally export', what, fileName)
    },
    /** helper used by screens: does this expense category exist */
    expenseAccountOf: (cat) => EXPENSE_CATEGORIES[cat] || '5207',
  }
}
