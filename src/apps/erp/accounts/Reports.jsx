import React, { useMemo, useState } from 'react'
import { Download, FileCode2, FileBarChart, Scale, TrendingUp, Droplets, Boxes, Hourglass, Container, ArrowLeftRight, ShoppingBag, Truck, Upload } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Button, Card, Field, Input, NumberInput, Select, Segmented, Badge, toast, EmptyState, cx, KV } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { PrintArea, DocHeader, BarsChart } from '../../../components/business'
import { fmtINR, fmtDate, fmtNum, fmtPct, today, round2, sum, exportCSV, downloadText, groupBy, monthLabel } from '../../../lib/format'
import { trialBalance, profitAndLoss, ageing, BUCKETS, billPayable, fyLabel, cogsOf } from './_books'
import { useBooks, drcr, periodPresets } from './_ui'

const REPORTS = [
  { key: 'BS', label: 'Balance Sheet', icon: Scale, group: 'Financial statements' },
  { key: 'PL', label: 'Profit & Loss', icon: TrendingUp, group: 'Financial statements' },
  { key: 'TB', label: 'Trial Balance', icon: FileBarChart, group: 'Financial statements' },
  { key: 'CF', label: 'Cash Flow', icon: Droplets, group: 'Financial statements' },
  { key: 'STOCK', label: 'Stock Valuation', icon: Boxes, group: 'MIS' },
  { key: 'AGE', label: 'Receivables & Payables', icon: Hourglass, group: 'MIS' },
  { key: 'CONT', label: 'Container Costing', icon: Container, group: 'MIS' },
  { key: 'MOVE', label: 'Product Movement', icon: ArrowLeftRight, group: 'MIS' },
  { key: 'SALES', label: 'Product-wise Sales', icon: ShoppingBag, group: 'MIS' },
  { key: 'LOGI', label: 'GAF / Starex / Safex Payments', icon: Truck, group: 'MIS' },
  { key: 'TALLY', label: 'Tally Export', icon: Upload, group: 'Integration' },
]

export default function Reports() {
  const books = useBooks()
  const presets = periodPresets(books.booksStart)
  const [rep, setRep] = useState('PL')
  const [preset, setPreset] = useState('FYTD')
  const [range, setRange] = useState({ from: presets[0].from, to: presets[0].to })
  const setP = (k) => { setPreset(k); const p = presets.find((x) => x.key === k); if (p) setRange({ from: p.from, to: p.to }) }
  const cur = REPORTS.find((r) => r.key === rep)
  return (
    <div>
      <PageHeader title="Financial & MIS Reports" subtitle={`Derived live from invoices, receipts, bills, expenses, payroll & vouchers · ${fyLabel()}`} />
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        <Card padded={false} className="h-fit">
          <div className="lg:hidden p-3"><Select value={rep} onChange={(e) => setRep(e.target.value)} options={REPORTS.map((r) => ({ value: r.key, label: r.label }))} /></div>
          <nav className="hidden lg:block py-2">
            {['Financial statements', 'MIS', 'Integration'].map((g) => (
              <div key={g} className="mb-2">
                <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{g}</div>
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <button key={r.key} type="button" onClick={() => setRep(r.key)} className={cx('w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left', rep === r.key ? 'bg-brand-50 text-brand-700 font-medium border-r-2 border-brand-500' : 'text-slate-600 hover:bg-slate-50')}>
                    <r.icon className="w-4 h-4" />{r.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </Card>
        <div className="min-w-0 space-y-3">
          <Card padded>
            <div className="flex flex-col md:flex-row gap-3 md:items-end">
              <div className="flex-1"><div className="text-lg font-semibold text-ink-900">{cur.label}</div><div className="text-xs text-slate-500">{rep === 'BS' || rep === 'STOCK' ? `As on ${fmtDate(range.to)}` : `${fmtDate(range.from)} – ${fmtDate(range.to)}`}</div></div>
              <Segmented size="sm" value={preset} onChange={setP} options={presets.map((p) => ({ key: p.key, label: p.label }))} />
              <Field label="From"><Input type="date" value={range.from} min={books.booksStart} onChange={(e) => { setPreset('C'); setRange({ ...range, from: e.target.value < books.booksStart ? books.booksStart : e.target.value }) }} /></Field>
              <Field label="To"><Input type="date" value={range.to} onChange={(e) => { setPreset('C'); setRange({ ...range, to: e.target.value }) }} /></Field>
            </div>
          </Card>
          {rep === 'BS' && <BalanceSheet books={books} range={range} />}
          {rep === 'PL' && <PL books={books} range={range} />}
          {rep === 'TB' && <TB books={books} range={range} />}
          {rep === 'CF' && <CashFlow books={books} range={range} />}
          {rep === 'STOCK' && <StockValuation />}
          {rep === 'AGE' && <AgeingReport books={books} />}
          {rep === 'CONT' && <ContainerCosting />}
          {rep === 'MOVE' && <Movement range={range} />}
          {rep === 'SALES' && <ProductSales range={range} />}
          {rep === 'LOGI' && <Logistics range={range} />}
          {rep === 'TALLY' && <Tally books={books} range={range} />}
        </div>
      </div>
    </div>
  )
}

const Row = ({ label, v, bold, indent, neg }) => (
  <div className={cx('flex justify-between py-1 text-sm', bold && 'font-semibold border-t border-slate-200 mt-1 pt-1.5', indent && 'pl-4 text-slate-600')}>
    <span>{label}</span><span className="tabular-nums">{neg ? `(${fmtINR(Math.abs(v))})` : fmtINR(v)}</span>
  </div>
)

function BalanceSheet({ books, range }) {
  const { rows } = useMemo(() => trialBalance(books.postings, books.chart, { from: books.booksStart, to: range.to }), [books, range.to])
  const pl = profitAndLoss(rows)
  const by = (pred) => rows.filter((r) => pred(r.account) && Math.abs(r.closing) > 0.5)
  const debtors = rows.find((r) => r.account.id === '1210')?.closing || 0
  const assetsRows = by((a) => a.group === 'Assets' && a.id !== '1150').filter((r) => !((r.account.subgroup === 'Bank Accounts' || r.account.id === '1210') && r.closing < 0))
  const creditAssets = by((a) => (a.subgroup === 'Bank Accounts' || a.id === '1210')).filter((r) => r.closing < 0)
  const accDep = -(rows.find((r) => r.account.id === '1150')?.closing || 0)
  const subgroups = [...new Set(assetsRows.map((r) => r.account.subgroup))]
  const liab = by((a) => a.group === 'Liabilities')
  const eq = by((a) => a.group === 'Equity')
  const assetTotal = round2(sum(assetsRows, (r) => r.closing) - accDep)
  const liabTotal = round2(-sum(liab, (r) => r.closing) - sum(creditAssets, (r) => r.closing))
  const eqTotal = round2(-sum(eq, (r) => r.closing) + pl.net)
  const csv = () => exportCSV(`balance-sheet-${range.to}.csv`, [...assetsRows.map((r) => ({ side: 'Assets', g: r.account.subgroup, name: r.account.name, v: r.closing })), { side: 'Assets', g: 'Fixed Assets', name: 'Less: Accumulated depreciation', v: -accDep }, ...liab.map((r) => ({ side: 'Liabilities', g: r.account.subgroup, name: r.account.name, v: -r.closing })), ...creditAssets.map((r) => ({ side: 'Liabilities', g: 'Current Liabilities', name: r.account.id === '1210' ? 'Advances from dealers' : r.account.name, v: -r.closing })), ...eq.map((r) => ({ side: 'Equity', g: r.account.subgroup, name: r.account.name, v: -r.closing })), { side: 'Equity', g: 'Reserves & Surplus', name: 'Profit & Loss A/c (current year)', v: pl.net }], [{ header: 'Side', key: 'side' }, { header: 'Group', key: 'g' }, { header: 'Ledger', key: 'name' }, { header: 'Amount', key: 'v' }])
  return (
    <PrintArea title="Balance Sheet">
      <DocHeader title="Balance Sheet" date={range.to} right={<Button size="sm" variant="ghost" icon={Download} className="no-print mt-1" onClick={csv}>CSV</Button>} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Equity & Liabilities</div>
          {[...new Set(eq.map((r) => r.account.subgroup))].map((g) => <div key={g}><Row label={g} v={-sum(eq.filter((r) => r.account.subgroup === g), (r) => r.closing) + (g === 'Reserves & Surplus' ? pl.net : 0)} />{eq.filter((r) => r.account.subgroup === g).map((r) => <Row key={r.account.id} indent label={r.account.name} v={-r.closing} />)}{g === 'Reserves & Surplus' && <Row indent label="Profit & Loss A/c (current year)" v={pl.net} neg={pl.net < 0} />}</div>)}
          {[...new Set(liab.map((r) => r.account.subgroup))].map((g) => <div key={g} className="mt-2"><Row label={g} v={-sum(liab.filter((r) => r.account.subgroup === g), (r) => r.closing)} />{liab.filter((r) => r.account.subgroup === g).map((r) => <Row key={r.account.id} indent label={r.account.name} v={-r.closing} />)}</div>)}
          {creditAssets.length > 0 && <div className="mt-2"><Row label="Other current liabilities" v={-sum(creditAssets, (r) => r.closing)} />{creditAssets.map((r) => <Row key={r.account.id} indent label={r.account.id === '1210' ? 'Advances received from dealers' : `${r.account.name} (overdraft)`} v={-r.closing} />)}</div>}
          <Row bold label="Total" v={round2(liabTotal + eqTotal)} />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Assets</div>
          {subgroups.map((g) => {
            const l = assetsRows.filter((r) => r.account.subgroup === g)
            const tot = sum(l, (r) => r.closing) - (g === 'Fixed Assets' ? accDep : 0)
            return <div key={g} className="mt-2 first:mt-0"><Row label={g === 'Fixed Assets' ? 'Fixed assets (net block)' : g} v={tot} />{l.map((r) => <Row key={r.account.id} indent label={r.account.name} v={r.closing} />)}{g === 'Fixed Assets' && <Row indent label="Less: Accumulated depreciation" v={accDep} neg />}</div>
          })}
          <Row bold label="Total" v={assetTotal} />
        </div>
      </div>
      <div className={cx('mt-4 text-xs', Math.abs(assetTotal - liabTotal - eqTotal) < 1 ? 'text-emerald-600' : 'text-red-600')}>{Math.abs(assetTotal - liabTotal - eqTotal) < 1 ? '✓ Balance sheet tallies' : `Difference ${fmtINR(assetTotal - liabTotal - eqTotal)}`}{debtors < 0 ? ' · Dealer advances shown under liabilities' : ''}</div>
    </PrintArea>
  )
}

function PL({ books, range }) {
  const { rows } = useMemo(() => trialBalance(books.postings, books.chart, range), [books, range])
  const p = profitAndLoss(rows)
  const pct = (v) => (p.revenue ? ` (${((v / p.revenue) * 100).toFixed(1)}%)` : '')
  const csv = () => exportCSV(`profit-loss-${range.from}-${range.to}.csv`, [...p.sales, ...p.cogs, ...p.direct, ...p.otherIncome, ...p.indirect, ...p.finance, ...p.dep].map((r) => ({ g: r.account.subgroup, n: r.account.name, v: r.amount })), [{ header: 'Group', key: 'g' }, { header: 'Ledger', key: 'n' }, { header: 'Amount', key: 'v' }])
  return (
    <PrintArea title="Profit and Loss">
      <DocHeader title="Profit & Loss Statement" right={<><div className="text-xs text-slate-500">{fmtDate(range.from)} – {fmtDate(range.to)}</div><Button size="sm" variant="ghost" icon={Download} className="no-print" onClick={csv}>CSV</Button></>} />
      <div className="max-w-2xl">
        <Row label="Revenue from operations" v={p.revenue} bold />
        {p.sales.map((r) => <Row key={r.account.id} indent label={r.account.name} v={r.amount} />)}
        <Row label="Less: Cost of goods sold (at landed cost)" v={p.cogsTotal} neg />
        <Row label="Less: Direct expenses (freight, CHA, port, warehousing, carriage)" v={p.directTotal} neg />
        {p.direct.map((r) => <Row key={r.account.id} indent label={r.account.name} v={r.amount} />)}
        <Row bold label={`Gross profit${pct(p.gross)}`} v={p.gross} neg={p.gross < 0} />
        <Row label="Add: Other income" v={p.otherIncomeTotal} />
        {p.otherIncome.map((r) => <Row key={r.account.id} indent label={r.account.name} v={r.amount} neg={r.amount < 0} />)}
        <Row label="Less: Indirect expenses" v={p.indirectTotal} neg />
        {p.indirect.map((r) => <Row key={r.account.id} indent label={r.account.name} v={r.amount} />)}
        <Row bold label={`EBITDA${pct(p.ebitda)}`} v={p.ebitda} neg={p.ebitda < 0} />
        <Row label="Less: Finance cost (interest)" v={p.financeTotal} neg />
        <Row label="Less: Depreciation" v={p.depTotal} neg />
        <Row bold label={`Net ${p.net >= 0 ? 'profit' : 'loss'} before tax${pct(p.net)}`} v={p.net} neg={p.net < 0} />
      </div>
    </PrintArea>
  )
}

function TB({ books, range }) {
  const { rows, totals } = useMemo(() => trialBalance(books.postings, books.chart, range), [books, range])
  const list = rows.filter((r) => Math.abs(r.opening) > 0.5 || r.dr || r.cr).sort((a, b) => a.account.code.localeCompare(b.account.code)).map((r) => ({ ...r, id: r.account.id }))
  return (
    <>
      <DataTable rows={list} pageSize={80} exportName={`trial-balance-${range.to}`} searchable={false} columns={[
        { key: 'code', header: 'Code', value: (r) => r.account.code, render: (r) => <span className="font-mono text-xs">{r.account.code}</span> },
        { key: 'name', header: 'Ledger', value: (r) => r.account.name },
        { key: 'group', header: 'Group', value: (r) => r.account.group },
        { key: 'opening', header: 'Opening', align: 'right', render: (r) => drcr(r.opening) },
        { key: 'dr', header: 'Debit', align: 'right', render: (r) => (r.dr ? fmtINR(r.dr, true) : '—') },
        { key: 'cr', header: 'Credit', align: 'right', render: (r) => (r.cr ? fmtINR(r.cr, true) : '—') },
        { key: 'cdr', header: 'Closing Dr', align: 'right', value: (r) => (r.closing > 0 ? r.closing : 0), render: (r) => (r.closing > 0.004 ? fmtINR(r.closing, true) : '') },
        { key: 'ccr', header: 'Closing Cr', align: 'right', value: (r) => (r.closing < 0 ? -r.closing : 0), render: (r) => (r.closing < -0.004 ? fmtINR(-r.closing, true) : '') },
      ]} footer={<tr><td colSpan={6} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(totals.dr, true)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtINR(totals.cr, true)}</td></tr>} />
      <div className={cx('text-xs', Math.abs(totals.dr - totals.cr) < 1 ? 'text-emerald-600' : 'text-red-600')}>{Math.abs(totals.dr - totals.cr) < 1 ? '✓ Trial balance tallies' : `Difference ${fmtINR(totals.dr - totals.cr)}`} · P&L before {fmtDate(range.from)} carried to Reserves & Surplus</div>
    </>
  )
}

const CASH = ['1220', '1221', '1230', '1231']
function CashFlow({ books, range }) {
  const data = useMemo(() => {
    const byVid = groupBy(books.postings, 'vid')
    const lines = {}
    const add = (sec, label, v) => { lines[sec] = lines[sec] || {}; lines[sec][label] = round2((lines[sec][label] || 0) + v) }
    for (const [, ps] of Object.entries(byVid)) {
      if (ps[0].date < range.from || ps[0].date > range.to) continue
      const cash = ps.filter((p) => CASH.includes(p.account))
      if (!cash.length) continue
      const net = sum(cash, (p) => p.dr - p.cr)
      if (Math.abs(net) < 0.01) continue
      const other = ps.filter((p) => !CASH.includes(p.account)).sort((a, b) => (b.dr + b.cr) - (a.dr + a.cr))[0]
      const a = books.accById.get(other?.account) || {}
      if (['Fixed Assets', 'Investments'].includes(a.subgroup)) add('Investing', a.subgroup === 'Investments' ? 'Fixed deposits (net)' : 'Purchase / sale of fixed assets', net)
      else if (['Secured Loans', 'Unsecured Loans', 'Capital Account'].includes(a.subgroup) || a.id === '5211') add('Financing', a.id === '5211' ? 'Interest paid' : a.subgroup === 'Unsecured Loans' ? 'Unsecured loans (net)' : a.subgroup === 'Capital Account' ? 'Capital introduced' : 'Term / vehicle loan repayments', net)
      else if (a.id === '1210') add('Operating', 'Receipts from dealers', net)
      else if (['2101', '2102', '1201', '1260'].includes(a.id)) add('Operating', 'Payments to suppliers & logistics vendors', net)
      else if (a.subgroup === 'Duties & Taxes' || a.subgroup === 'Duties & Taxes (ITC)') add('Operating', 'GST, customs duty & TDS paid', net)
      else if (['5201', '2230'].includes(a.id)) add('Operating', 'Salaries paid', net)
      else add('Operating', net > 0 ? 'Other receipts' : 'Operating expenses paid', net)
    }
    const openBal = sum(CASH, (id) => books.balanceOf(id, prevDay(range.from)))
    const closeBal = sum(CASH, (id) => books.balanceOf(id, range.to))
    return { lines, openBal, closeBal }
  }, [books, range])
  const secs = ['Operating', 'Investing', 'Financing']
  const tot = (s) => sum(Object.values(data.lines[s] || {}))
  return (
    <PrintArea title="Cash Flow">
      <DocHeader title="Cash Flow Statement (direct method)" right={<div className="text-xs text-slate-500">{fmtDate(range.from)} – {fmtDate(range.to)}</div>} />
      <div className="max-w-2xl">
        <Row label="Opening cash & bank balance" v={data.openBal} bold />
        {secs.map((s) => (
          <div key={s} className="mt-3">
            <div className="text-xs font-semibold uppercase text-slate-500">{s} activities</div>
            {Object.entries(data.lines[s] || {}).map(([k, v]) => <Row key={k} indent label={k} v={v} neg={v < 0} />)}
            <Row label={`Net cash from ${s.toLowerCase()} activities`} v={tot(s)} neg={tot(s) < 0} bold />
          </div>
        ))}
        <Row label="Closing cash & bank balance" v={data.closeBal} bold />
        <div className={cx('text-xs mt-2', Math.abs(data.openBal + tot('Operating') + tot('Investing') + tot('Financing') - data.closeBal) < 1 ? 'text-emerald-600' : 'text-red-600')}>Reconciles with HDFC, ICICI OD, cash and petty cash ledgers (internal contra transfers excluded)</div>
      </div>
    </PrintArea>
  )
}
const prevDay = (d) => new Date(new Date(d).getTime() - 864e5).toISOString().slice(0, 10)

function StockValuation() {
  const products = useStore((s) => s.products)
  const stock = useStore((s) => s.stock)
  const locations = useStore((s) => s.locations)
  const markup = useStore((s) => s.settings.stockValuationMarkupPct)
  const updateSettings = useStore((s) => s.updateSettings)
  const rows = products.map((p) => {
    const qty = sum(Object.entries(stock).filter(([l]) => l !== 'WH-TRANSIT'), ([, m]) => m[p.id] || 0)
    const cost = round2(qty * p.landedCost)
    return { id: p.id, sku: p.sku, name: p.shortName, category: p.category, qty, rate: p.landedCost, cost, marked: round2(cost * (1 + markup / 100)), mrpValue: qty * p.mrp }
  }).filter((r) => r.qty > 0)
  const byCat = Object.entries(groupBy(rows, 'category')).map(([label, l]) => ({ label, cost: Math.round(sum(l, (r) => r.cost)), marked: Math.round(sum(l, (r) => r.marked)) }))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><div className="text-xs text-slate-500">Stock at landed cost</div><div className="text-xl font-bold">{fmtINR(sum(rows, (r) => r.cost))}</div></Card>
        <Card><div className="text-xs text-slate-500">Valuation @ +{markup}%</div><div className="text-xl font-bold text-brand-700">{fmtINR(sum(rows, (r) => r.marked))}</div></Card>
        <Card><div className="text-xs text-slate-500">Stock at MRP</div><div className="text-xl font-bold">{fmtINR(sum(rows, (r) => r.mrpValue))}</div></Card>
        <Card><Field label="Valuation markup %" hint={`Locations: ${locations.filter((l) => l.id !== 'WH-TRANSIT').map((l) => l.code).join(', ')}`}><NumberInput value={markup} onChange={(v) => { updateSettings({ stockValuationMarkupPct: Number(v) || 0 }) }} /></Field></Card>
      </div>
      <Card title="By category"><BarsChart data={byCat} series={[{ key: 'cost', label: 'Landed cost' }, { key: 'marked', label: `+${markup}%` }]} height={220} /></Card>
      <DataTable rows={rows} exportName={`stock-valuation-${today()}`} initialSort={{ key: 'cost', dir: 'desc' }} filters={[{ key: 'category', label: 'categories', options: [...new Set(rows.map((r) => r.category))] }]} columns={[
        { key: 'sku', header: 'SKU', className: 'font-mono text-xs' }, { key: 'name', header: 'Product' }, { key: 'category', header: 'Category' },
        { key: 'qty', header: 'Qty', align: 'right', render: (r) => fmtNum(r.qty) }, { key: 'rate', header: 'Landed cost', align: 'right', render: (r) => fmtINR(r.rate) },
        { key: 'cost', header: 'Value at cost', align: 'right', render: (r) => fmtINR(r.cost) }, { key: 'marked', header: `Value @ +${markup}%`, align: 'right', render: (r) => <b>{fmtINR(r.marked)}</b> },
      ]} />
    </div>
  )
}

function AgeingReport({ books }) {
  const partners = useStore((s) => s.partners)
  const vendors = useStore((s) => s.vendors)
  const sos = useStore((s) => s.salesOrders)
  const bills = useStore((s) => s.vendorBills) || []
  const rec = ageing(books.postings, 'DEALER')
  const pay = ageing(books.postings, 'VENDOR')
  const t = today()
  const pendingAdv = sos.filter((s) => s.status === 'CONFIRMED' && s.paymentStatus !== 'PAID')
  const openBills = bills.filter((b) => ['APPROVED', 'PENDING_BOSS'].includes(b.status))
  const tot = (rows, k) => sum(rows, (r) => r[k])
  const Tbl = ({ title, rows, list }) => (
    <Card title={title} padded={false}>
      <table className="w-full text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-4 py-2">Party</th>{BUCKETS.map((b) => <th key={b.key} className="text-right px-3 py-2">{b.label}</th>)}<th className="text-right px-4 py-2">Total</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((r) => <tr key={r.partyId}><td className="px-4 py-1.5">{list.find((x) => x.id === r.partyId)?.name}</td>{BUCKETS.map((b) => <td key={b.key} className="px-3 py-1.5 text-right tabular-nums">{r[b.key] ? fmtINR(r[b.key]) : '—'}</td>)}<td className="px-4 py-1.5 text-right font-semibold tabular-nums">{fmtINR(r.total)}</td></tr>)}
          {!rows.filter((r) => r.total > 0.5).length && <tr><td colSpan={6} className="px-4 py-4 text-center text-slate-400">Nothing outstanding</td></tr>}</tbody>
        <tfoot className="bg-slate-50 font-semibold"><tr><td className="px-4 py-2">Total</td>{BUCKETS.map((b) => <td key={b.key} className="px-3 py-2 text-right tabular-nums">{fmtINR(tot(rows, b.key))}</td>)}<td className="px-4 py-2 text-right tabular-nums">{fmtINR(tot(rows, 'total'))}</td></tr></tfoot></table>
    </Card>
  )
  return (
    <PrintArea title="Receivables and Payables">
      <DocHeader title="Receivables & Payables" date={t} />
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card><div className="text-xs text-slate-500">Receivables (books)</div><div className="text-lg font-bold">{fmtINR(tot(rec, 'total'))}</div></Card>
          <Card><div className="text-xs text-slate-500">Advances pending on confirmed orders</div><div className="text-lg font-bold">{fmtINR(sum(pendingAdv, (s) => s.total - (s.paidAmount || 0)))}</div></Card>
          <Card><div className="text-xs text-slate-500">Payables (books)</div><div className="text-lg font-bold">{fmtINR(tot(pay, 'total'))}</div></Card>
          <Card><div className="text-xs text-slate-500">Bills awaiting approval/payment</div><div className="text-lg font-bold">{fmtINR(sum(openBills, billPayable))}</div></Card>
        </div>
        <Tbl title="Receivables ageing (dealers)" rows={rec.filter((r) => r.total > 0.5)} list={partners} />
        <Tbl title="Payables ageing (vendors)" rows={pay.filter((r) => r.total > 0.5)} list={vendors} />
        <Card title="Outstanding vendor bills by due date" padded={false}>
          <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">{openBills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((b) => <tr key={b.id}><td className="px-4 py-1.5">{b.number}</td><td className="px-3 py-1.5">{vendors.find((v) => v.id === b.vendorId)?.name}</td><td className={cx('px-3 py-1.5', b.dueDate < t && 'text-red-600')}>{fmtDate(b.dueDate)}</td><td className="px-3 py-1.5"><Badge tone={b.status === 'APPROVED' ? 'blue' : 'amber'}>{b.status === 'APPROVED' ? 'Approved' : 'Pending Boss'}</Badge></td><td className="px-4 py-1.5 text-right tabular-nums">{fmtINR(billPayable(b))}</td></tr>)}</tbody></table>
        </Card>
      </div>
    </PrintArea>
  )
}

function ContainerCosting() {
  const shipments = useStore((s) => s.shipments)
  const pos = useStore((s) => s.purchaseOrders)
  const fx = useStore((s) => s.settings.fx)
  const bills = useStore((s) => s.vendorBills) || []
  const vendors = useStore((s) => s.vendors)
  const rows = shipments.map((sh) => {
    const shPos = pos.filter((p) => sh.poIds.includes(p.id))
    const fob = round2(sum(shPos, (p) => sum(p.lines, (l) => l.qty * l.rate) * (fx[p.currency] || 1)))
    const qty = sum(shPos, (p) => sum(p.lines, (l) => l.qty))
    const lc = sh.landedCost || {}
    const charges = ['freightINR', 'insurance', 'duty', 'cha', 'portTransport', 'other'].reduce((a, k) => a + (Number(lc[k]) || 0), 0)
    const actualBills = round2(sum(bills.filter((b) => b.shipmentId === sh.id && b.category !== 'SUPPLIER' && b.status !== 'REJECTED'), (b) => b.amountINR))
    return { id: sh.id, number: sh.number, container: `${sh.containerNo} · ${sh.containerType}`, vendor: vendors.find((v) => v.id === sh.vendorId)?.name, status: sh.status, finalized: lc.finalized, fob, freight: lc.freightINR || 0, insurance: lc.insurance || 0, duty: lc.duty || 0, cha: lc.cha || 0, port: lc.portTransport || 0, other: lc.other || 0, landed: round2(fob + charges), igst: lc.igst || 0, qty, pct: fob ? (charges / fob) * 100 : 0, actualBills }
  })
  return (
    <DataTable rows={rows} searchable={false} exportName="container-costing" columns={[
      { key: 'number', header: 'Shipment', render: (r) => <div><div className="font-medium">{r.number}</div><div className="text-[11px] text-slate-500">{r.container}</div></div> },
      { key: 'vendor', header: 'Supplier' },
      { key: 'fob', header: 'FOB (₹)', align: 'right', render: (r) => fmtINR(r.fob) },
      { key: 'freight', header: 'Freight', align: 'right', render: (r) => fmtINR(r.freight) },
      { key: 'duty', header: 'Duty', align: 'right', render: (r) => fmtINR(r.duty) },
      { key: 'cha', header: 'CHA + port + ins.', align: 'right', value: (r) => r.cha + r.port + r.insurance + r.other, render: (r) => fmtINR(r.cha + r.port + r.insurance + r.other) },
      { key: 'landed', header: 'Landed cost', align: 'right', render: (r) => <b>{fmtINR(r.landed)}</b> },
      { key: 'pct', header: 'Charges % FOB', align: 'right', render: (r) => fmtPct(r.pct) },
      { key: 'perUnit', header: 'Avg / unit', align: 'right', value: (r) => (r.qty ? r.landed / r.qty : 0), render: (r) => (r.qty ? fmtINR(r.landed / r.qty) : '—') },
      { key: 'igst', header: 'Import IGST (ITC)', align: 'right', render: (r) => fmtINR(r.igst) },
      { key: 'actualBills', header: 'Logistics bills booked', align: 'right', render: (r) => fmtINR(r.actualBills) },
      { key: 'finalized', header: 'Costing', render: (r) => <Badge tone={r.finalized ? 'green' : 'amber'}>{r.finalized ? 'Finalised' : 'Provisional'}</Badge> },
    ]} />
  )
}

function useSalesLines(range) {
  const invoices = useStore((s) => s.invoices)
  const products = useStore((s) => s.products)
  return useMemo(() => {
    const m = {}
    for (const i of invoices) {
      if (i.date < range.from || i.date > range.to || i.type === 'FOC') continue
      for (const l of i.lines || []) {
        const p = products.find((x) => x.id === l.productId)
        if (!p) continue
        const r = (m[p.id] = m[p.id] || { id: p.id, sku: p.sku, name: p.shortName, category: p.category, qty: 0, revenue: 0, cogs: 0, invoices: 0 })
        r.qty += l.qty; r.revenue += l.amount ?? l.qty * l.price; r.cogs += cogsOf({ products }, [l]); r.invoices++
      }
    }
    return Object.values(m).map((r) => ({ ...r, revenue: round2(r.revenue), cogs: round2(r.cogs), margin: round2(r.revenue - r.cogs), marginPct: r.revenue ? ((r.revenue - r.cogs) / r.revenue) * 100 : 0 }))
  }, [invoices, products, range])
}

function ProductSales({ range }) {
  const rows = useSalesLines(range)
  const top = rows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((r) => ({ label: r.sku, revenue: Math.round(r.revenue), margin: Math.round(r.margin) }))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><div className="text-xs text-slate-500">Net sales</div><div className="text-xl font-bold">{fmtINR(sum(rows, (r) => r.revenue))}</div></Card>
        <Card><div className="text-xs text-slate-500">Gross margin (landed cost)</div><div className="text-xl font-bold">{fmtINR(sum(rows, (r) => r.margin))}</div></Card>
        <Card><div className="text-xs text-slate-500">Margin %</div><div className="text-xl font-bold">{fmtPct((sum(rows, (r) => r.margin) / (sum(rows, (r) => r.revenue) || 1)) * 100)}</div></Card>
      </div>
      <Card title="Top 10 products by sales"><BarsChart data={top} series={[{ key: 'revenue', label: 'Sales' }, { key: 'margin', label: 'Margin' }]} height={240} /></Card>
      <DataTable rows={rows} exportName={`product-sales-${range.from}-${range.to}`} initialSort={{ key: 'revenue', dir: 'desc' }} filters={[{ key: 'category', label: 'categories', options: [...new Set(rows.map((r) => r.category))] }]} columns={[
        { key: 'sku', header: 'SKU', className: 'font-mono text-xs' }, { key: 'name', header: 'Product' }, { key: 'category', header: 'Category' },
        { key: 'qty', header: 'Qty sold', align: 'right', render: (r) => fmtNum(r.qty) }, { key: 'revenue', header: 'Sales (taxable)', align: 'right', render: (r) => fmtINR(r.revenue) },
        { key: 'cogs', header: 'COGS', align: 'right', render: (r) => fmtINR(r.cogs) }, { key: 'margin', header: 'Margin', align: 'right', render: (r) => fmtINR(r.margin) },
        { key: 'marginPct', header: 'Margin %', align: 'right', render: (r) => <span className={r.marginPct < 8 ? 'text-red-600' : ''}>{fmtPct(r.marginPct)}</span> },
      ]} />
    </div>
  )
}

function Movement({ range }) {
  const products = useStore((s) => s.products)
  const stock = useStore((s) => s.stock)
  const shipments = useStore((s) => s.shipments)
  const moves = useStore((s) => s.stockMoves) || []
  const sales = useSalesLines(range)
  const days = Math.max(1, (new Date(range.to) - new Date(range.from)) / 864e5 + 1)
  const rows = products.map((p) => {
    const sold = sales.find((s) => s.id === p.id)?.qty || 0
    const inward = sum(shipments.filter((sh) => sh.inward?.date >= range.from && sh.inward?.date <= range.to), (sh) => sum((sh.inward.lines || []).filter((l) => l.productId === p.id), (l) => l.received)) + sum(moves.filter((m) => m.productId === p.id && m.qty > 0 && m.date >= range.from && m.date <= range.to && /GRN/i.test(m.reason)), (m) => m.qty)
    const onHand = sum(Object.values(stock), (m) => m[p.id] || 0)
    const perDay = sold / days
    const cover = perDay ? Math.round(onHand / perDay) : null
    return { id: p.id, sku: p.sku, name: p.shortName, category: p.category, inward, sold, onHand, cover, cls: perDay * 30 >= p.reorderLevel ? 'Fast' : perDay * 30 >= p.reorderLevel * 0.4 ? 'Medium' : 'Slow' }
  })
  return (
    <DataTable rows={rows} exportName={`product-movement-${range.from}-${range.to}`} initialSort={{ key: 'sold', dir: 'desc' }} filters={[{ key: 'cls', label: 'movement', options: ['Fast', 'Medium', 'Slow'] }, { key: 'category', label: 'categories', options: [...new Set(rows.map((r) => r.category))] }]} columns={[
      { key: 'sku', header: 'SKU', className: 'font-mono text-xs' }, { key: 'name', header: 'Product' }, { key: 'category', header: 'Category' },
      { key: 'inward', header: 'Inward (GRN)', align: 'right', render: (r) => fmtNum(r.inward) }, { key: 'sold', header: 'Sold', align: 'right', render: (r) => fmtNum(r.sold) },
      { key: 'onHand', header: 'On hand', align: 'right', render: (r) => fmtNum(r.onHand) }, { key: 'cover', header: 'Days cover', align: 'right', render: (r) => (r.cover == null ? '—' : <span className={r.cover < 30 ? 'text-red-600 font-medium' : ''}>{r.cover}</span>) },
      { key: 'cls', header: 'F / M / S', render: (r) => <Badge tone={r.cls === 'Fast' ? 'green' : r.cls === 'Medium' ? 'amber' : 'gray'}>{r.cls}</Badge> },
    ]} />
  )
}

function Logistics({ range }) {
  const bills = useStore((s) => s.vendorBills) || []
  const payments = useStore((s) => s.vendorPayments) || []
  const vendors = useStore((s) => s.vendors)
  const ww = useStore((s) => s.wrongWorkings) || []
  const ids = ['fw3', 'lg1', 'lg2', 'lg3', 'cha1']
  const rows = ids.map((id) => {
    const b = bills.filter((x) => x.vendorId === id && x.status !== 'REJECTED' && x.date >= range.from && x.date <= range.to)
    const p = payments.filter((x) => x.vendorId === id && x.date >= range.from && x.date <= range.to)
    const out = bills.filter((x) => x.vendorId === id && ['APPROVED', 'PENDING_BOSS'].includes(x.status))
    const w = ww.filter((x) => x.vendorId === id)
    return { id, name: vendors.find((v) => v.id === id)?.name, bills: b.length, billed: round2(sum(b, billPayable)), paid: round2(sum(p, (x) => x.amountINR)), outstanding: round2(sum(out, billPayable)), tds: round2(sum(b, (x) => x.tds || 0)), errors: w.length, recovered: sum(w, (x) => x.recoveredAmount || 0) }
  })
  const monthly = Object.entries(groupBy(bills.filter((b) => ids.includes(b.vendorId) && b.status !== 'REJECTED'), (b) => b.date.slice(0, 7))).sort().map(([m, l]) => ({ label: monthLabel(m), ...Object.fromEntries(ids.map((id) => [id, Math.round(sum(l.filter((b) => b.vendorId === id), billPayable))])) }))
  return (
    <div className="space-y-3">
      <DataTable rows={rows} searchable={false} exportName="logistics-payment-summary" columns={[
        { key: 'name', header: 'Vendor' }, { key: 'bills', header: 'Bills', align: 'right' }, { key: 'billed', header: 'Billed (net)', align: 'right', render: (r) => fmtINR(r.billed) },
        { key: 'paid', header: 'Paid', align: 'right', render: (r) => fmtINR(r.paid) }, { key: 'outstanding', header: 'Outstanding', align: 'right', render: (r) => <b>{fmtINR(r.outstanding)}</b> },
        { key: 'tds', header: 'TDS deducted', align: 'right', render: (r) => fmtINR(r.tds) }, { key: 'errors', header: 'Billing errors', align: 'right' }, { key: 'recovered', header: 'Recovered', align: 'right', render: (r) => fmtINR(r.recovered) },
      ]} />
      <Card title="Monthly billing by logistics vendor"><BarsChart data={monthly} stacked series={ids.map((id) => ({ key: id, label: vendors.find((v) => v.id === id)?.name }))} height={260} /></Card>
    </div>
  )
}

const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function Tally({ books, range }) {
  const logTallyExport = useStore((s) => s.logTallyExport)
  const company = useStore((s) => s.settings.company)
  const vouchers = useMemo(() => {
    const g = groupBy(books.postings.filter((p) => p.date >= range.from && p.date <= range.to), 'vid')
    return Object.values(g).map((ps) => ({ id: ps[0].vid, date: ps[0].date, vtype: ps[0].vtype, vno: ps[0].vno, narration: ps[0].narration, lines: ps, amount: round2(sum(ps, (p) => p.dr)) })).sort((a, b) => a.date.localeCompare(b.date))
  }, [books, range])
  const ledgerName = (p) => {
    const a = books.accById.get(p.account)
    if (p.partyId) return (p.partyType === 'VENDOR' ? books.st.vendors : books.st.partners).find((x) => x.id === p.partyId)?.name || a?.name
    return a?.name || p.account
  }
  const counts = Object.entries(groupBy(vouchers, 'vtype')).map(([k, l]) => ({ k, n: l.length, amt: sum(l, (v) => v.amount) }))
  const csv = () => {
    const rows = vouchers.flatMap((v) => v.lines.map((p) => ({ date: v.date, vtype: v.vtype, vno: v.vno, ledger: ledgerName(p), dr: p.dr || '', cr: p.cr || '', narration: v.narration })))
    exportCSV(`Tally-Vouchers-${range.from}-${range.to}.csv`, rows, [{ header: 'Date', key: 'date' }, { header: 'Voucher Type', key: 'vtype' }, { header: 'Voucher No', key: 'vno' }, { header: 'Ledger', key: 'ledger' }, { header: 'Debit', key: 'dr' }, { header: 'Credit', key: 'cr' }, { header: 'Narration', key: 'narration' }])
    logTallyExport('VOUCHERS_CSV', `Tally-Vouchers-${range.from}-${range.to}.csv`)
    toast.success('Voucher CSV downloaded', `${vouchers.length} vouchers`)
  }
  const xml = () => {
    const body = vouchers.map((v) => `   <TALLYMESSAGE xmlns:UDF="TallyUDF">\n    <VOUCHER VCHTYPE="${xmlEsc(v.vtype)}" ACTION="Create">\n     <DATE>${v.date.replace(/-/g, '')}</DATE>\n     <VOUCHERTYPENAME>${xmlEsc(v.vtype)}</VOUCHERTYPENAME>\n     <VOUCHERNUMBER>${xmlEsc(v.vno)}</VOUCHERNUMBER>\n     <NARRATION>${xmlEsc(v.narration)}</NARRATION>\n${v.lines.map((p) => `     <ALLLEDGERENTRIES.LIST>\n      <LEDGERNAME>${xmlEsc(ledgerName(p))}</LEDGERNAME>\n      <ISDEEMEDPOSITIVE>${p.dr ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n      <AMOUNT>${p.dr ? -p.dr : p.cr}</AMOUNT>\n     </ALLLEDGERENTRIES.LIST>`).join('\n')}\n    </VOUCHER>\n   </TALLYMESSAGE>`).join('\n')
    const out = `<ENVELOPE>\n <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>\n <BODY>\n  <IMPORTDATA>\n   <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEsc(company.legalName)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>\n   <REQUESTDATA>\n${body}\n   </REQUESTDATA>\n  </IMPORTDATA>\n </BODY>\n</ENVELOPE>\n`
    downloadText(`Tally-Vouchers-${range.from}-${range.to}.xml`, out, 'application/xml')
    logTallyExport('VOUCHERS_XML', `Tally-Vouchers-${range.from}-${range.to}.xml`)
    toast.success('Tally XML downloaded', 'Import via Gateway of Tally → Import Data → Vouchers')
  }
  const masters = () => {
    const parent = (a) => ({ 'Bank Accounts': 'Bank Accounts', 'Cash-in-Hand': 'Cash-in-Hand', 'Fixed Assets': 'Fixed Assets', 'Duties & Taxes': 'Duties & Taxes', 'Duties & Taxes (ITC)': 'Duties & Taxes', 'Sales Accounts': 'Sales Accounts', 'Direct Expenses': 'Direct Expenses', 'Indirect Expenses': 'Indirect Expenses', 'Indirect Income': 'Indirect Incomes', 'Secured Loans': 'Secured Loans', 'Unsecured Loans': 'Unsecured Loans', 'Capital Account': 'Capital Account', 'Reserves & Surplus': 'Reserves & Surplus', 'Provisions': 'Provisions', 'Loans & Advances': 'Loans & Advances (Asset)', 'Investments': 'Investments' }[a.subgroup] || (a.group === 'Assets' ? 'Current Assets' : 'Current Liabilities'))
    const led = [...books.chart.map((a) => ({ name: a.name, parent: parent(a), opening: a.nature === 'CR' ? a.opening : -a.opening })), ...books.st.partners.filter((p) => p.status === 'ACTIVE').map((p) => ({ name: p.name, parent: 'Sundry Debtors', gstin: p.gstin, opening: 0 })), ...books.st.vendors.map((v) => ({ name: v.name, parent: 'Sundry Creditors', gstin: v.gst, opening: 0 }))]
    const out = `<ENVELOPE>\n <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>\n <BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC><REQUESTDATA>\n${led.map((l) => `  <TALLYMESSAGE><LEDGER NAME="${xmlEsc(l.name)}" ACTION="Create"><NAME>${xmlEsc(l.name)}</NAME><PARENT>${xmlEsc(l.parent)}</PARENT>${l.gstin ? `<PARTYGSTIN>${l.gstin}</PARTYGSTIN>` : ''}<OPENINGBALANCE>${l.opening || 0}</OPENINGBALANCE></LEDGER></TALLYMESSAGE>`).join('\n')}\n </REQUESTDATA></IMPORTDATA></BODY>\n</ENVELOPE>\n`
    downloadText(`Tally-Masters-${today()}.xml`, out, 'application/xml')
    logTallyExport('MASTERS_XML', `Tally-Masters-${today()}.xml`)
    toast.success('Ledger masters exported', `${led.length} ledgers`)
  }
  return (
    <div className="space-y-3">
      <Card title="Export to Tally ERP 9 / TallyPrime" subtitle="Vouchers for the selected period with party-wise ledgers; masters include chart of accounts, dealers and vendors">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">{counts.map((c) => <div key={c.k} className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">{c.k}</div><div className="font-semibold">{c.n} vouchers</div><div className="text-xs text-slate-500">{fmtINR(c.amt)}</div></div>)}</div>
        <div className="flex flex-wrap gap-2"><Button icon={FileCode2} onClick={xml}>Download Tally XML</Button><Button variant="secondary" icon={Download} onClick={csv}>Download voucher CSV</Button><Button variant="secondary" icon={FileCode2} onClick={masters}>Download ledger masters</Button></div>
      </Card>
      <DataTable rows={vouchers} exportName={`vouchers-${range.from}-${range.to}`} filters={[{ key: 'vtype', label: 'voucher types', options: [...new Set(vouchers.map((v) => v.vtype))] }]} columns={[
        { key: 'date', header: 'Date', render: (v) => fmtDate(v.date) }, { key: 'vtype', header: 'Type' }, { key: 'vno', header: 'Voucher no.' },
        { key: 'narration', header: 'Narration', render: (v) => <span className="text-xs">{v.narration}</span> }, { key: 'amount', header: 'Amount', align: 'right', render: (v) => fmtINR(v.amount, true) },
      ]} empty={<EmptyState title="No vouchers in this period" />} />
    </div>
  )
}
