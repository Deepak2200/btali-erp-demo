// Builds the full initial dataset. Core first, then each module adds its own collections.
import { addDays, daysAgo, round2 } from '../../lib/format'
import {
  seedUsers, seedVendors, seedProducts, seedLocations, seedTransporters, seedPartners, seedPriceLists, seedSchemes,
  seedSettings, seedPurchase, seedSales, seedOpenOrders, seedUnits, seedWarranties, seedWarrantyRules, seedTickets,
  seedWarrantyClaims, seedStock, seedPartnerStock, seedNotifications,
} from './core'
import { purchaseSeed } from './purchase'
import { salesSeed } from './sales'
import { dispatchSeed } from './dispatch'
import { accountsSeed } from './accounts'
import { hrSeed } from './hr'
import { serviceSeed } from './service'
import { portalsSeed } from './portals'
import { aiSeed } from './ai'
import { adminSeed } from './admin'
import { procurementSeed } from './procurement'
import { vendorSeed } from './vendor'

export const createSeed = () => {
  const users = seedUsers()
  const vendors = seedVendors()
  const products = seedProducts()
  const priceLists = seedPriceLists()
  const partners = seedPartnerStock(seedPartners(), products)
  const settings = seedSettings()
  const { purchaseOrders, shipments } = seedPurchase(products)
  const hist = seedSales(products, partners, priceLists)
  const counters = { ...hist.counters }
  const openSOs = seedOpenOrders(products, partners, priceLists, counters)

  // open orders that are paid / invoiced need receipts + invoices
  const invoices = [...hist.invoices]
  const receipts = [...hist.receipts]
  for (const so of openSOs) {
    if (so.paymentStatus === 'PAID') {
      counters.RCPT++
      receipts.push({ id: `rc_${so.id}`, number: `RCPT/${String(counters.RCPT).padStart(4, '0')}`, partnerId: so.partnerId, soId: so.id, amount: so.total, mode: 'NEFT', ref: `UTR${String(6.2e10 + counters.RCPT * 911).slice(0, 12)}`, date: so.date, bankId: 'bk1', recordedBy: 'u9' })
      so.timeline.push({ ts: `${so.date}T13:00:00.000Z`, text: 'Advance payment received (Accounts)' })
    }
    if (so.status === 'INVOICED') {
      counters.INV++
      const id = `inv_${so.id}`
      const date = addDays(so.date, 1)
      invoices.push({ id, number: `BT/26-27/${String(counters.INV).padStart(4, '0')}`, soId: so.id, partnerId: so.partnerId, date, lines: so.lines, subtotal: so.subtotal, gst: so.gst, total: so.total, transporterId: so.transporterId, vehicleNo: '', status: 'ISSUED', lr: null, sentToBtali: true, emailed: true, irn: `IRN${String(9.4e9 + counters.INV * 31)}`, ewayBill: String(3.9e11 + counters.INV * 17).slice(0, 12), type: 'TAX', dispatchDate: addDays(date, 1), units: [] })
      so.invoiceId = id
      so.timeline.push({ ts: `${date}T11:00:00.000Z`, text: 'Invoice generated & emailed; pushed to Btali schedule' })
    }
  }
  const salesOrders = [...hist.salesOrders, ...openSOs]

  // last order date per partner
  for (const p of partners) {
    const mine = salesOrders.filter((s) => s.partnerId === p.id)
    p.lastOrderDate = mine.length ? mine.reduce((a, s) => (s.date > a ? s.date : a), '') : null
  }
  // a dealer going quiet (to show inactivity alerts)
  const quiet = partners.find((p) => p.id === 'd15')
  if (quiet) quiet.lastOrderDate = daysAgo(52)

  const { units, series } = seedUnits(products, partners)
  for (const [prefix, n] of Object.entries(series)) {
    const cat = Object.entries(settings.barcodeSeries).find(([, v]) => v.prefix === prefix)
    if (cat) settings.barcodeSeries[cat[0]].next = n + 1
  }
  const warranties = seedWarranties(units, products)
  settings.series.SO = counters.SO
  settings.series.INV = counters.INV
  settings.series.RCPT = counters.RCPT
  settings.series.TKT = 1210

  const core = {
    users, vendors, products, priceLists, partners, settings, purchaseOrders, shipments, salesOrders, invoices, receipts,
    locations: seedLocations(),
    transporters: seedTransporters(),
    schemes: seedSchemes(),
    stock: seedStock(products),
    stockMoves: [],
    units,
    warranties,
    warrantyRules: seedWarrantyRules(),
    warrantyClaims: seedWarrantyClaims(warranties),
    tickets: seedTickets(),
    notifications: seedNotifications(),
    emails: [],
    auditLog: [],
  }
  // sanity: round totals
  for (const so of core.salesOrders) so.total = round2(so.total)

  const modules = [purchaseSeed, procurementSeed, vendorSeed, salesSeed, dispatchSeed, accountsSeed, hrSeed, serviceSeed, portalsSeed, aiSeed, adminSeed]
  const extra = {}
  for (const fn of modules) Object.assign(extra, fn(core) || {})
  return { ...core, ...extra }
}
