// Shared bits for management analytics screens (profitability, containers, demand).
import React, { useMemo } from 'react'
import { useStore } from '../../../store'
import { Segmented } from '../../../components/ui'
import { dateRangePresets } from '../../../lib/analytics'

/** Minimal state object for the analytics lib – re-computes only when these collections change. */
export const useAnalyticsState = () => {
  const products = useStore((s) => s.products)
  const invoices = useStore((s) => s.invoices)
  const partners = useStore((s) => s.partners)
  const salesOrders = useStore((s) => s.salesOrders)
  const purchaseOrders = useStore((s) => s.purchaseOrders)
  const shipments = useStore((s) => s.shipments)
  const stock = useStore((s) => s.stock)
  const settings = useStore((s) => s.settings)
  const units = useStore((s) => s.units)
  const vendors = useStore((s) => s.vendors)
  return useMemo(
    () => ({ products, invoices, partners, salesOrders, purchaseOrders, shipments, stock, settings, units, vendors }),
    [products, invoices, partners, salesOrders, purchaseOrders, shipments, stock, settings, units, vendors],
  )
}

export function PresetPicker({ value, onChange }) {
  const presets = dateRangePresets()
  return (
    <Segmented size="sm" value={value} onChange={onChange}
      options={Object.entries(presets).map(([k, v]) => ({ key: k, label: k === 'FY' ? 'FY YTD' : k === '12M' ? '12 months' : v.label.replace('Last ', '') }))} />
  )
}

export const marginTone = (pct, target) => (pct >= target + 5 ? 'text-emerald-700' : pct >= target ? 'text-emerald-600' : pct >= target - 5 ? 'text-amber-600' : 'text-red-600')

/** Heat colour from 0..1 (brand orange scale) */
export const heat = (r) => {
  const x = Math.max(0, Math.min(1, r || 0))
  if (x === 0) return { background: '#f8fafc', color: '#94a3b8' }
  const a = 0.08 + x * 0.82
  return { background: `rgba(242,84,31,${a.toFixed(3)})`, color: x > 0.55 ? '#fff' : '#7c2d12' }
}
