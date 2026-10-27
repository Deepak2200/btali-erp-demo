// Store actions for the "admin" module: users & roles, data import, communication log, franchise network toggles.
import { nowISO, uid, today } from '../../lib/format'

// eslint-disable-next-line no-unused-vars
export const adminSlice = (set, get, api) => ({
  // ------------------------------------------------------------ users
  adminSaveUser: (data) => {
    const s = get()
    const uname = String(data.username || '').trim().toLowerCase()
    if (!data.name?.trim()) return { ok: false, error: 'Name is required' }
    if (!uname) return { ok: false, error: 'Username is required' }
    if (s.users.some((u) => u.username?.toLowerCase() === uname && u.id !== data.id)) return { ok: false, error: `Username "${uname}" is already taken` }
    const app = { VENDOR: 'vendor', DEALER: 'dealer', FRANCHISE: 'franchise', STAREX: 'starex' }[data.role] || 'erp'
    if (data.id && s.users.some((u) => u.id === data.id)) {
      const user = get().updateItem('users', data.id, (u) => ({ ...u, ...data, username: uname, app, updatedAt: nowISO() }))
      get().audit('Updated user', 'User', user.name)
      return { ok: true, user }
    }
    const n = s.users.reduce((m, u) => Math.max(m, Number(String(u.id).replace(/\D/g, '')) || 0), 0) + 1
    const user = { id: `u${n}`, active: true, createdAt: nowISO(), ...data, username: uname, app }
    set((st) => ({ users: [...st.users, user] }))
    if (user.email) {
      get().sendEmail({
        to: user.email,
        subject: 'Your Btali ERP account is ready',
        body: `Dear ${user.name},\n\nAn account has been created for you on Btali ERP.\nUsername: ${uname}\nA temporary password has been sent separately – please change it at first sign-in.\n\nRegards,\nBtali Administration`,
        ref: uname,
        kind: 'USER_INVITE',
      })
    }
    get().audit('Created user', 'User', user.name)
    return { ok: true, user }
  },
  adminSetUserActive: (id, active) => {
    const u = get().updateItem('users', id, { active, deactivatedAt: active ? null : nowISO() })
    get().audit(active ? 'Re-activated user' : 'Deactivated user', 'User', u?.name)
    return u
  },
  adminResetPassword: (id) => {
    const u = get().users.find((x) => x.id === id)
    if (!u) return
    get().sendEmail({ to: u.email, subject: 'Btali ERP – password reset', body: `Dear ${u.name},\n\nYour Btali ERP password has been reset by the administrator. Use the one-time link in this mail to set a new password within 24 hours.\n\nRegards,\nBtali Administration`, ref: u.username, kind: 'PASSWORD_RESET' })
    get().audit('Password reset', 'User', u.name)
  },

  // ------------------------------------------------------------ data import
  /** rows already validated by the wizard. entity: PRODUCTS | DEALERS | OPENING_STOCK | LEDGERS */
  adminImport: (entity, rows, { fileName = 'import.csv', failed = 0 } = {}) => {
    let imported = 0
    let updated = 0
    const s = get()
    if (entity === 'PRODUCTS') {
      for (const r of rows) {
        const ex = s.products.find((p) => p.sku.toUpperCase() === String(r.sku).toUpperCase())
        if (ex) { get().updateItem('products', ex.id, r); updated++ } else {
          const n = get().products.length + 1
          const isSpare = r.category === 'Spare Parts'
          const p = {
            id: `p${n}_${uid('').slice(1, 5)}`, type: isSpare ? 'SPARE' : 'FG', uom: 'Nos', gst: 18, hsn: '8413', currency: 'USD', vendorIds: [r.vendorId], moq: 1, reorderLevel: 10,
            maxLevel: 40, leadTimeDays: 75, popularity: 3, weightKg: 1, cbm: 0.01, cartonQty: isSpare ? 50 : 1, warrantyMonths: 12, specs: {}, bom: [], parents: [], media: [], active: true, createdAt: today(),
            ...r, shortName: r.shortName || r.name, name: r.name.startsWith('Btali') ? r.name : `Btali ${r.name}`,
          }
          p.maxLevel = (p.reorderLevel || 10) * 4
          set((st) => ({ products: [...st.products, p] }))
          imported++
        }
      }
    } else if (entity === 'DEALERS') {
      for (const r of rows) {
        const ex = s.partners.find((p) => (r.gstin && p.gstin === r.gstin) || p.name.toLowerCase() === r.name.toLowerCase())
        if (ex) { get().updateItem('partners', ex.id, r); updated++ } else {
          const code = `DLR-${200 + get().partners.length}`
          set((st) => ({ partners: [...st.partners, { id: uid('d'), code, type: 'DEALER', tier: 'C', stage: 'CURRENT', status: 'ACTIVE', stock: {}, stockMin: {}, kyc: [], priceListId: 'pl1', extraDiscountPct: 0, paymentTerms: 'Advance', creditDays: 0, portalAccess: false, onboardedAt: today(), authorizedCategories: [], ...r }] }))
          imported++
        }
      }
    } else if (entity === 'OPENING_STOCK') {
      for (const r of rows) {
        const cur = get().stock?.[r.locationId]?.[r.productId] || 0
        const delta = Number(r.qty) - cur
        if (delta) get().adjustStock(r.locationId, r.productId, delta, 'Opening stock import', fileName)
        updated++
      }
    } else if (entity === 'LEDGERS') {
      const recs = rows.map((r) => ({ id: uid('lo'), ...r, importedAt: nowISO() }))
      set((st) => ({ ledgerOpenings: [...recs, ...(st.ledgerOpenings || []).filter((x) => !recs.some((y) => y.ledger.toLowerCase() === String(x.ledger).toLowerCase()))] }))
      imported = recs.length
    }
    const log = { id: uid('imp'), ts: nowISO(), entity, fileName, total: rows.length + failed, imported, updated, failed, userId: get().session.userId, status: 'COMPLETED', note: failed ? `${failed} row(s) skipped due to validation errors` : '' }
    set((st) => ({ importLogs: [log, ...(st.importLogs || [])] }))
    get().audit('Data import', entity, `${fileName} (${imported} new, ${updated} updated)`)
    get().notify({ title: 'Data import completed', body: `${fileName}: ${imported} new, ${updated} updated${failed ? `, ${failed} skipped` : ''}`, link: '/erp/admin/import', roles: ['ADMIN'] })
    return log
  },
  adminLogExport: (what, fileName) => {
    const log = { id: uid('imp'), ts: nowISO(), entity: what, fileName, total: 0, imported: 0, updated: 0, failed: 0, userId: get().session.userId, status: 'EXPORTED', note: 'Tally export' }
    set((st) => ({ importLogs: [log, ...(st.importLogs || [])] }))
    get().audit('Tally export', what, fileName)
  },

  // ------------------------------------------------------------ communication log
  resendEmail: (id) => {
    const e = get().emails.find((x) => x.id === id) || (get().emailArchive || []).find((x) => x.id === id)
    if (!e) return null
    const copy = get().sendEmail({ to: e.to, cc: e.cc, subject: e.subject, body: e.body, attachments: e.attachments, ref: e.ref, kind: e.kind })
    const mark = (x) => (x.id === copy.id ? { ...x, resentOf: id } : x.id === id ? { ...x, resentAt: nowISO() } : x)
    set((st) => ({ emails: st.emails.map(mark), emailArchive: (st.emailArchive || []).map(mark) }))
    get().audit('Re-sent communication', e.kind || 'EMAIL', e.subject)
    return copy
  },

  // ------------------------------------------------------------ franchise network
  setFranchiseAutoReplenish: (partnerId, on) => {
    const p = get().updateItem('partners', partnerId, { autoReplenish: !!on })
    get().audit(on ? 'Enabled auto-replenishment' : 'Disabled auto-replenishment', 'Franchise', p?.name)
    return p
  },
  updateFranchiseMinStock: (partnerId, productId, min) => {
    get().updateItem('partners', partnerId, (p) => ({ ...p, stockMin: { ...(p.stockMin || {}), [productId]: Math.max(0, Number(min) || 0) } }))
  },
  sendComplianceReminder: (partnerId, issues = []) => {
    const p = get().partners.find((x) => x.id === partnerId)
    if (!p) return
    get().sendEmail({ to: p.email, subject: `Process compliance reminder – ${p.name}`, body: `Dear ${p.contact},\n\nOur records show the following compliance gaps at your store:\n${issues.map((i) => `• ${i}`).join('\n') || '• Please review POS and barcode usage'}\n\nAs a Btali franchise, barcode scanning at inward/sale, POS billing and daily stock updates are mandatory.\n\nRegards,\nBtali Franchise Team`, ref: p.code, kind: 'COMPLIANCE' })
    get().notify({ title: 'Compliance reminder from Btali', body: issues.join(' · ') || 'Please review your store processes', partnerId, link: '/franchise/dashboard' })
    get().audit('Compliance reminder', 'Franchise', p.name)
  },
})
