// Shared hooks & widgets for the Accounts screens.
import React, { useMemo } from 'react'
import { useStore } from '../../../store'
import { PrintArea, DocHeader } from '../../../components/business'
import { Badge, cx } from '../../../components/ui'
import { fmtINR, fmtDate, round2 } from '../../../lib/format'
import { buildPostings, fyStart, sourceName } from './_books'

const KEYS = ['invoices', 'receipts', 'vendorBills', 'vendorPayments', 'expenses', 'journals', 'notes', 'loans', 'shipments', 'payrollRuns', 'cashEntries', 'partners', 'vendors', 'bankAccounts', 'products', 'accountsSettings', 'chartOfAccounts']

/** state subset + derived postings (memoised on the source collections) */
export function useBooks() {
  const vals = KEYS.map((k) => useStore((s) => s[k])) // eslint-disable-line react-hooks/rules-of-hooks
  return useMemo(() => {
    const st = Object.fromEntries(KEYS.map((k, i) => [k, vals[i] || (k === 'accountsSettings' ? {} : [])]))
    const postings = buildPostings(st)
    const chart = st.chartOfAccounts
    const accById = new Map(chart.map((a) => [a.id, a]))
    const balanceOf = (id, asOf = '9999-12-31') => {
      const a = accById.get(id)
      let b = a ? (a.nature === 'CR' ? -(a.opening || 0) : a.opening || 0) : 0
      for (const p of postings) if (p.account === id && p.date <= asOf) b += p.dr - p.cr
      return round2(b)
    }
    return { st, postings, chart, accById, balanceOf, booksStart: st.accountsSettings?.booksStart || fyStart() }
  }, vals) // eslint-disable-line react-hooks/exhaustive-deps
}

export const accountLabel = (chart, id) => {
  const a = chart.find((x) => x.id === id)
  return a ? `${a.code} · ${a.name}` : id
}
export const accountOptions = (chart, filter) => chart.filter((a) => a.active !== false && (!filter || filter(a))).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, sub: `${a.group} › ${a.subgroup}` }))

export function PartyName({ type, id }) {
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  if (!id) return <span className="text-slate-400">—</span>
  const p = type === 'VENDOR' ? vendors.find((v) => v.id === id) : partners.find((x) => x.id === id)
  return <>{p?.name || id}</>
}
export const usePayFromOptions = (withCash = true) => {
  const banks = useStore((s) => s.bankAccounts) || []
  return [...banks.map((b) => ({ value: b.id, label: `${b.name} · ${b.accountNo.slice(-4)}` })), ...(withCash ? [{ value: 'CASH', label: 'Cash in Hand' }, { value: 'PETTY', label: 'Petty Cash' }] : [])]
}
export function SourceName({ id }) {
  const banks = useStore((s) => s.bankAccounts)
  return <>{sourceName({ bankAccounts: banks }, id)}</>
}

/** signed debit-positive balance shown as "₹x Dr" / "₹x Cr" */
export const drcr = (v) => (Math.abs(v) < 0.5 ? fmtINR(0) : `${fmtINR(Math.abs(v))} ${v > 0 ? 'Dr' : 'Cr'}`)
export function DrCr({ v, className }) {
  return <span className={cx('tabular-nums whitespace-nowrap', className)}>{drcr(v)}</span>
}
export function Amt({ v, className, muted }) {
  if (!v) return <span className={cx('tabular-nums text-slate-300', className)}>—</span>
  return <span className={cx('tabular-nums', muted && 'text-slate-500', className)}>{fmtINR(v, true)}</span>
}
export const VTYPE_TONE = { Sales: 'violet', Receipt: 'green', Purchase: 'amber', Payment: 'red', Journal: 'ink', Contra: 'blue', 'Credit Note': 'teal', 'Debit Note': 'brand' }
export const VoucherBadge = ({ type }) => <Badge tone={VTYPE_TONE[type] || 'gray'}>{type}</Badge>
export const JTYPE_LABEL = { JOURNAL: 'Journal', CONTRA: 'Contra', PAYMENT: 'Payment', RECEIPT: 'Receipt' }

/** printable voucher: lines [{accountId, dr, cr, partyType, partyId}] */
export function VoucherPrint({ title, number, date, narration, lines, chart, footer }) {
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const users = useStore((s) => s.users)
  const party = (l) => (l.partyId ? (l.partyType === 'VENDOR' ? vendors : partners).find((x) => x.id === l.partyId)?.name : '')
  const dr = round2(lines.reduce((a, l) => a + (Number(l.dr) || 0), 0))
  const cr = round2(lines.reduce((a, l) => a + (Number(l.cr) || 0), 0))
  return (
    <PrintArea title={`${title} ${number}`}>
      <DocHeader title={title} number={number} date={date} />
      <table className="w-full text-sm border border-slate-200">
        <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
          <tr><th className="text-left px-3 py-2">Particulars</th><th className="text-right px-3 py-2 w-36">Debit (₹)</th><th className="text-right px-3 py-2 w-36">Credit (₹)</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-800">{l.cr && !l.dr ? <span className="text-slate-400 mr-1">To</span> : <span className="text-slate-400 mr-1">By</span>}{accountLabel(chart, l.accountId)}</div>
                {party(l) && <div className="text-xs text-slate-500 ml-6">Party: {party(l)}</div>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{l.dr ? fmtINR(l.dr, true) : ''}</td>
              <td className="px-3 py-2 text-right tabular-nums">{l.cr ? fmtINR(l.cr, true) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50 font-semibold"><tr><td className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(dr, true)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(cr, true)}</td></tr></tfoot>
      </table>
      {narration && <div className="mt-3 text-sm"><span className="text-slate-500">Narration: </span>{narration}</div>}
      {footer}
      <div className="grid grid-cols-3 gap-6 mt-12 text-xs text-slate-500">
        <div className="border-t border-slate-300 pt-1">Prepared by<br /><span className="text-slate-700">{users.find((u) => u.role === 'ACCOUNTS')?.name}</span></div>
        <div className="border-t border-slate-300 pt-1">Checked by<br /><span className="text-slate-700">{users.find((u) => u.role === 'FINANCE_HEAD')?.name}</span></div>
        <div className="border-t border-slate-300 pt-1">Authorised signatory<br /><span className="text-slate-700">{users.find((u) => u.role === 'ADMIN')?.name}</span></div>
      </div>
      <div className="text-[10px] text-slate-400 mt-6">Generated from Btali ERP on {fmtDate(new Date().toISOString())}</div>
    </PrintArea>
  )
}

/** standard period picker values */
export const periodPresets = (booksStart) => {
  const t = new Date().toISOString().slice(0, 10)
  const ym = t.slice(0, 7)
  const prev = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7)
  const prevEnd = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10)
  return [
    { key: 'FYTD', label: 'FY to date', from: booksStart, to: t },
    { key: 'MTD', label: 'This month', from: `${ym}-01`, to: t },
    { key: 'LM', label: 'Last month', from: `${prev}-01`, to: prevEnd },
    { key: 'Q', label: 'Last 90 days', from: new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10), to: t },
  ]
}
