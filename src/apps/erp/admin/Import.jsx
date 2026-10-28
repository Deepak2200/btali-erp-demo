import React, { useMemo, useRef, useState } from 'react'
import { Upload, Download, FileSpreadsheet, Package, Store, Boxes, BookOpen, CheckCircle2, XCircle, Wand2, ArrowLeft, ArrowRight, FileCode2, History } from 'lucide-react'
import {
  PageHeader, Card, Tabs, Stepper, Button, Badge, Alert, Grid, Stat, StatusBadge, Segmented, toast, confirm, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { useStore } from '../../../store'
import { parseCSV, toCSV, downloadText, fmtDateTime, fmtINR, fmtNum, sum, today, round2 } from '../../../lib/format'

const CATS = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']
const REGIONS = ['North', 'South', 'East', 'West', 'Central']
const GST_RE = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/

const ENTITIES = {
  PRODUCTS: {
    label: 'Products & spares', icon: Package, desc: 'Item master – SKU, category, vendor, rates, MOQ and reorder levels. Existing SKUs are updated.',
    cols: ['sku', 'name', 'category', 'vendorCode', 'vendorRate', 'currency', 'mrp', 'landedCost', 'moq', 'reorderLevel', 'leadTimeDays', 'hsn', 'gst'],
    sample: [
      ['BT-JP15', 'Jet Pump 1.5 HP', 'Pumps', 'NHP', '38', 'USD', '9530', '4070', '60', '30', '75', '8413', '18'],
      ['BT-AC24', 'Oil-free Air Compressor 24 L', 'Air Compressors', 'TJC', '47.5', 'USD', '12040', '5080', '60', '35', '75', '8414', '18'],
      ['BT-CV12', 'Car Vacuum Cleaner 12 V', 'Vacuum Cleaners', 'SCV', '11', 'USD', '2760', '1180', '150', '60', '75', '8508', '18'],
      ['SP-MSX', 'Mechanical Seal 16 mm', 'Spare Parts', 'NHP', '1.1', 'USD', '280', '120', '500', '200', '75', '8413', '18'],
      ['BT-GW09', 'Garden Washer Mini', 'Garden Tools', 'ZAQ', '21', 'USD', '5270', '2250', '80', '40', '75', '8424', '18'],
      ['', 'Sprayer Nozzle Brass', 'Spare Parts', 'YGS', 'abc', 'USD', '90', '40', '300', '100', '75', '8424', '18'],
    ],
  },
  DEALERS: {
    label: 'Dealers', icon: Store, desc: 'Dealer master with GSTIN, region, salesperson and price list. Matching GSTIN or name updates the dealer.',
    cols: ['name', 'city', 'state', 'region', 'contact', 'phone', 'email', 'gstin', 'priceList', 'salesperson'],
    sample: [
      ['Vidarbha Agro Centre', 'Amravati', 'Maharashtra', 'Central', 'Nitin Deshmukh', '9822011223', 'vidarbha.agro@gmail.com', '27AAPFV1234K1Z5', 'pl1', 'rohit'],
      ['Mysuru Pump Point', 'Mysuru', 'Karnataka', 'South', 'K. Shivakumar', '9845022334', 'mysurupump@gmail.com', '29AAQFM5678L1Z2', 'pl1', 'ankita'],
      ['Haridwar Hardware', 'Haridwar', 'Uttarakhand', 'North', 'Deepak Rawat', '9897033445', 'hwr.hardware@gmail.com', '05ABCFH9012M1Z8', 'pl1', 'sameer'],
      ['Siliguri Tools House', 'Siliguri', 'West Bengal', 'Northeast', 'Pradip Saha', '9832044556', 'siliguritools@gmail', '19AAKFS34', 'pl1', 'amit'],
    ],
  },
  OPENING_STOCK: {
    label: 'Opening stock', icon: Boxes, desc: 'Physical stock per warehouse. Quantity replaces the current on-hand (difference posted as a stock move).',
    cols: ['sku', 'location', 'qty'],
    sample: [['BT-MB05', 'WH-BTALI', '240'], ['BT-PW16', 'WH-BTALI', '190'], ['BT-BS16', 'WH-BTALI', '420'], ['SP-IMP10', 'WH-GUJ', '150'], ['BT-XX99', 'WH-BTALI', '30'], ['BT-WD20', 'WH-BTALI', '-5']],
  },
  LEDGERS: {
    label: 'Tally ledgers & opening balances', icon: BookOpen, desc: 'Ledger masters exported from Tally with group and opening Dr/Cr balance as on 01-Apr.',
    cols: ['ledger', 'group', 'openingDr', 'openingCr', 'gstin'],
    sample: [
      ['HDFC Bank Current A/c', 'Bank Accounts', '4825000', '0', ''],
      ['Sharma Agro Traders', 'Sundry Debtors', '186400', '0', '03AAAF1000B1Z0'],
      ['Ningbo Hailong Pump Co., Ltd.', 'Sundry Creditors', '0', '2214000', ''],
      ['Btali 3PL Warehousing', 'Sundry Creditors', '0', '142500', '27AAFCS9981K1ZT'],
      ['Office Rent', 'Indirect Expenses', '0', '0', ''],
      ['Share Capital', 'Capital Account', '0', '5000000', ''],
      ['Misc Suspense', 'Suspense Group', '12000', '12000', ''],
    ],
  },
}
const LEDGER_GROUPS = ['Bank Accounts', 'Cash-in-Hand', 'Sundry Debtors', 'Sundry Creditors', 'Direct Expenses', 'Indirect Expenses', 'Direct Incomes', 'Indirect Incomes', 'Sales Accounts', 'Purchase Accounts', 'Duties & Taxes', 'Capital Account', 'Loans (Liability)', 'Fixed Assets', 'Current Assets', 'Current Liabilities', 'Stock-in-Hand']

const num = (v) => (v === '' || v == null ? NaN : Number(String(v).replace(/,/g, '')))

/** returns { errors:[], data } – data is the store-shaped record */
const validate = (entity, r, state, seen) => {
  const e = []
  if (entity === 'PRODUCTS') {
    if (!r.sku) e.push('SKU is required')
    else if (seen.has(r.sku.toUpperCase())) e.push('Duplicate SKU in file')
    if (!r.name) e.push('Name is required')
    if (!CATS.includes(r.category)) e.push(`Unknown category "${r.category}"`)
    const v = state.vendors.find((x) => x.code === r.vendorCode)
    if (!v) e.push(`Vendor code "${r.vendorCode}" not found`)
    for (const k of ['vendorRate', 'mrp', 'landedCost', 'moq', 'reorderLevel']) if (!(num(r[k]) >= 0)) e.push(`${k} must be a number`)
    if (r.sku) seen.add(r.sku.toUpperCase())
    const exists = state.products.some((p) => p.sku.toUpperCase() === String(r.sku).toUpperCase())
    return { errors: e, mode: exists ? 'UPDATE' : 'NEW', data: { sku: r.sku?.toUpperCase(), name: r.name, shortName: r.name, category: r.category, vendorId: v?.id, vendorIds: v ? [v.id] : [], vendorRate: num(r.vendorRate), currency: r.currency || v?.currency || 'USD', mrp: num(r.mrp), landedCost: num(r.landedCost), moq: num(r.moq), reorderLevel: num(r.reorderLevel), leadTimeDays: num(r.leadTimeDays) || 75, hsn: r.hsn || '8413', gst: num(r.gst) || 18, type: r.category === 'Spare Parts' ? 'SPARE' : 'FG' } }
  }
  if (entity === 'DEALERS') {
    if (!r.name) e.push('Name is required')
    if (!r.city) e.push('City is required')
    if (!REGIONS.includes(r.region)) e.push(`Region must be one of ${REGIONS.join('/')}`)
    if (r.email && !/^\S+@\S+\.\S+$/.test(r.email)) e.push('Invalid email')
    if (!GST_RE.test(r.gstin || '')) e.push('Invalid GSTIN')
    const pl = state.priceLists.find((p) => p.id === r.priceList)
    if (!pl) e.push(`Price list "${r.priceList}" not found`)
    const sp = state.users.find((u) => u.username === r.salesperson)
    if (r.salesperson && !sp) e.push(`Salesperson "${r.salesperson}" not found`)
    const exists = state.partners.some((p) => (r.gstin && p.gstin === r.gstin) || p.name.toLowerCase() === String(r.name).toLowerCase())
    return { errors: e, mode: exists ? 'UPDATE' : 'NEW', data: { name: r.name, city: r.city, state: r.state, region: r.region, contact: r.contact, phone: r.phone, email: r.email, gstin: r.gstin, pan: (r.gstin || '').slice(2, 12), priceListId: r.priceList, salespersonId: sp?.id, address: r.city } }
  }
  if (entity === 'OPENING_STOCK') {
    const p = state.products.find((x) => x.sku.toUpperCase() === String(r.sku).toUpperCase())
    if (!p) e.push(`SKU "${r.sku}" not in item master`)
    if (!state.locations.some((l) => l.id === r.location)) e.push(`Location "${r.location}" not found`)
    if (!(num(r.qty) >= 0)) e.push('Quantity must be zero or more')
    const cur = p ? state.stock?.[r.location]?.[p.id] || 0 : 0
    return { errors: e, mode: 'UPDATE', note: p ? `Current ${cur} → ${num(r.qty) || 0}` : '', data: { productId: p?.id, locationId: r.location, qty: num(r.qty) } }
  }
  // LEDGERS
  if (!r.ledger) e.push('Ledger name is required')
  if (!LEDGER_GROUPS.includes(r.group)) e.push(`Unknown Tally group "${r.group}"`)
  const dr = num(r.openingDr || 0), cr = num(r.openingCr || 0)
  if (!(dr >= 0) || !(cr >= 0)) e.push('Opening balances must be numbers')
  if (dr > 0 && cr > 0) e.push('Ledger cannot have both Dr and Cr opening')
  if (r.gstin && !GST_RE.test(r.gstin)) e.push('Invalid GSTIN')
  return { errors: e, mode: 'NEW', data: { ledger: r.ledger, group: r.group, openingDr: dr || 0, openingCr: cr || 0, gstin: r.gstin || '' } }
}

function Wizard() {
  const state = useStore()
  const doImport = useStore((s) => s.adminImport)
  const [step, setStep] = useState('entity')
  const [entity, setEntity] = useState('PRODUCTS')
  const [file, setFile] = useState(null) // {name, rows}
  const [view, setView] = useState('all')
  const [result, setResult] = useState(null)
  const input = useRef(null)
  const def = ENTITIES[entity]

  const checked = useMemo(() => {
    if (!file) return []
    const seen = new Set()
    return file.rows.map((r, i) => ({ row: i + 2, raw: r, ...validate(entity, r, state, seen) }))
  }, [file, entity, state])
  const valid = checked.filter((c) => !c.errors.length)
  const bad = checked.filter((c) => c.errors.length)

  const downloadTemplate = () => {
    downloadText(`Btali-${entity.toLowerCase()}-template.csv`, `${def.cols.join(',')}\n${def.sample[0].map((v) => (/[",]/.test(v) ? `"${v}"` : v)).join(',')}\n`, 'text/csv')
    toast.success('Template downloaded', 'Fill one row per record and keep the header row')
  }
  const loadText = (name, text) => {
    const rows = parseCSV(text)
    if (!rows.length) return toast.error('File has no data rows')
    const missing = def.cols.filter((c) => !(c in rows[0]))
    if (missing.length) return toast.error('Columns missing in file', missing.join(', '))
    setFile({ name, rows }); setStep('preview'); setView('all')
  }
  const onFile = async (f) => {
    if (!f) return
    if (!/\.(csv|txt)$/i.test(f.name)) return toast.error('Please upload a .csv file', 'Save the Excel/Tally sheet as CSV (comma delimited)')
    loadText(f.name, await f.text())
  }
  const loadSample = () => {
    const text = `${def.cols.join(',')}\n${def.sample.map((r) => r.map((v) => (/[",]/.test(v) ? `"${v}"` : v)).join(',')).join('\n')}`
    loadText(`${def.label.replace(/[^A-Za-z]+/g, '-')}-migration.csv`, text)
  }
  const run = async () => {
    if (!valid.length) return toast.error('No valid rows to import')
    const ok = await confirm({ title: `Import ${valid.length} ${def.label.toLowerCase()} row(s)?`, message: bad.length ? `${bad.length} row(s) with errors will be skipped and listed in the error report.` : 'All rows passed validation.', confirmText: 'Import now' })
    if (!ok) return
    const log = doImport(entity, valid.map((v) => v.data), { fileName: file.name, failed: bad.length })
    setResult({ log, bad })
    setStep('done')
    toast.success('Import completed', `${log.imported} new · ${log.updated} updated${log.failed ? ` · ${log.failed} skipped` : ''}`)
  }
  const errorReport = () => {
    const rows = bad.map((b) => ({ row: b.row, ...b.raw, errors: b.errors.join('; ') }))
    downloadText(`${file.name.replace(/\.csv$/i, '')}-errors.csv`, toCSV(rows, ['row', ...def.cols, 'errors'].map((k) => ({ key: k, header: k }))), 'text/csv')
  }
  const reset = () => { setFile(null); setResult(null); setStep('entity') }

  const steps = [{ key: 'entity', label: 'Choose data' }, { key: 'upload', label: 'Template & upload' }, { key: 'preview', label: 'Validate & preview' }, { key: 'done', label: 'Import' }]
  const shown = view === 'errors' ? bad : view === 'valid' ? valid : checked

  return (
    <Card>
      <Stepper steps={steps} current={step} className="mb-5" />
      {step === 'entity' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(ENTITIES).map(([k, v]) => {
              const I = v.icon
              return (
                <button key={k} type="button" onClick={() => setEntity(k)} className={cx('text-left border rounded-xl p-4 flex gap-3 transition-colors', entity === k ? 'border-brand-400 bg-brand-50/50 ring-2 ring-brand-100' : 'border-slate-200 hover:border-brand-200')}>
                  <div className={cx('p-2.5 rounded-lg h-fit', entity === k ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500')}><I className="w-5 h-5" /></div>
                  <div><div className="font-semibold text-slate-800 text-sm">{v.label}</div><div className="text-xs text-slate-500 mt-0.5">{v.desc}</div></div>
                </button>
              )
            })}
          </div>
          <div className="flex justify-end mt-5"><Button iconRight={ArrowRight} onClick={() => setStep('upload')}>Continue</Button></div>
        </>
      )}
      {step === 'upload' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" />1. Download the template</div>
              <p className="text-xs text-slate-500 mt-1">Columns for {def.label.toLowerCase()}:</p>
              <div className="flex flex-wrap gap-1 mt-2">{def.cols.map((c) => <code key={c} className="text-[11px] bg-slate-100 rounded px-1.5 py-0.5">{c}</code>)}</div>
              <Button variant="secondary" icon={Download} className="mt-3" onClick={downloadTemplate}>Download CSV template</Button>
            </div>
            <div className="border border-slate-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Upload className="w-4 h-4 text-brand-600" />2. Upload the filled file</div>
              <div onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]) }}
                className="mt-2 border-2 border-dashed border-slate-300 hover:border-brand-300 hover:bg-slate-50 rounded-xl p-5 text-center cursor-pointer">
                <Upload className="w-6 h-6 mx-auto text-slate-400" />
                <div className="text-sm text-slate-600 mt-1">Drop CSV here or click to browse</div>
                <div className="text-[11px] text-slate-400">Excel / Tally sheets saved as CSV (comma delimited)</div>
                <input ref={input} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
              </div>
              <Button variant="soft" size="sm" icon={Wand2} className="mt-3" onClick={loadSample}>Use migration sample file</Button>
            </div>
          </div>
          <div className="flex justify-between mt-5"><Button variant="secondary" icon={ArrowLeft} onClick={() => setStep('entity')}>Back</Button></div>
        </>
      )}
      {step === 'preview' && file && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">{file.name}</div>
              <div className="text-xs text-slate-500">{def.label} · {checked.length} data rows</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge tone="green">{valid.length} ready</Badge>
              {bad.length > 0 && <Badge tone="red">{bad.length} with errors</Badge>}
              {entity !== 'OPENING_STOCK' && entity !== 'LEDGERS' && <Badge tone="blue">{valid.filter((v) => v.mode === 'UPDATE').length} will update existing</Badge>}
            </div>
          </div>
          {bad.length > 0 && <Alert tone="warn" className="mb-3" title="Some rows failed validation" action={<Button size="sm" variant="secondary" icon={Download} onClick={errorReport}>Error report</Button>}>Rows with errors will be skipped. Fix them in the sheet and re-upload, or import the valid rows now.</Alert>}
          <Segmented size="sm" value={view} onChange={setView} options={[{ key: 'all', label: `All (${checked.length})` }, { key: 'valid', label: `Valid (${valid.length})` }, { key: 'errors', label: `Errors (${bad.length})` }]} />
          <div className="overflow-x-auto mt-3 border border-slate-200 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
                <tr><th className="px-2 py-2 text-left">Row</th><th className="px-2 py-2 text-left">Status</th>{def.cols.map((c) => <th key={c} className="px-2 py-2 text-left whitespace-nowrap">{c}</th>)}<th className="px-2 py-2 text-left min-w-[220px]">Validation</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((c) => (
                  <tr key={c.row} className={cx(c.errors.length && 'bg-red-50/50')}>
                    <td className="px-2 py-1.5 text-slate-400">{c.row}</td>
                    <td className="px-2 py-1.5">{c.errors.length ? <XCircle className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}</td>
                    {def.cols.map((k) => <td key={k} className="px-2 py-1.5 whitespace-nowrap text-slate-700">{c.raw[k] || <span className="text-slate-300">—</span>}</td>)}
                    <td className="px-2 py-1.5">{c.errors.length ? <span className="text-red-600">{c.errors.join(' · ')}</span> : <span className="text-emerald-700">{c.note || (c.mode === 'UPDATE' ? 'Updates existing record' : 'New record')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between mt-5">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => { setFile(null); setStep('upload') }}>Choose another file</Button>
            <Button icon={Upload} disabled={!valid.length} onClick={run}>Import {valid.length} row(s)</Button>
          </div>
        </>
      )}
      {step === 'done' && result && (
        <div className="text-center py-6">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <div className="text-lg font-semibold text-slate-800 mt-2">Import completed</div>
          <div className="text-sm text-slate-500">{result.log.fileName}</div>
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <div><div className="text-2xl font-bold text-ink-900">{result.log.imported}</div><div className="text-slate-500 text-xs">New</div></div>
            <div><div className="text-2xl font-bold text-ink-900">{result.log.updated}</div><div className="text-slate-500 text-xs">Updated</div></div>
            <div><div className="text-2xl font-bold text-red-600">{result.log.failed}</div><div className="text-slate-500 text-xs">Skipped</div></div>
          </div>
          <div className="flex justify-center gap-2 mt-5 flex-wrap">
            {result.bad.length > 0 && <Button variant="secondary" icon={Download} onClick={errorReport}>Download error report</Button>}
            <Button onClick={reset}>Start another import</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function TallyExport() {
  const state = useStore()
  const logExport = useStore((s) => s.adminLogExport)
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`)
  const [to, setTo] = useState(today())
  const ledgers = useMemo(() => {
    const out = []
    for (const p of state.partners.filter((x) => x.status === 'ACTIVE' || x.status === 'INACTIVE')) {
      const bal = sum(state.salesOrders.filter((s) => s.partnerId === p.id && ['INVOICED', 'DISPATCHED', 'DELIVERED'].includes(s.status)), (s) => s.total - (s.paidAmount || 0))
      out.push({ name: p.name, group: 'Sundry Debtors', gstin: p.gstin || '', state: p.state, closing: round2(bal), drcr: 'Dr' })
    }
    for (const v of state.vendors) {
      const bal = sum((state.vendorBills || []).filter((b) => b.vendorId === v.id && b.status !== 'PAID' && b.status !== 'REJECTED'), (b) => b.amountINR ?? b.amount)
      out.push({ name: v.name, group: 'Sundry Creditors', gstin: v.gst || '', state: v.country === 'India' ? '' : v.country, closing: round2(bal), drcr: 'Cr' })
    }
    for (const b of state.bankAccounts || []) out.push({ name: b.name || b.bank, group: 'Bank Accounts', gstin: '', state: '', closing: b.balance || 0, drcr: 'Dr' })
    for (const l of state.ledgerOpenings || []) if (!out.some((o) => o.name === l.ledger)) out.push({ name: l.ledger, group: l.group, gstin: l.gstin, state: '', closing: l.openingDr || l.openingCr, drcr: l.openingDr ? 'Dr' : 'Cr' })
    return out
  }, [state])
  const invs = state.invoices.filter((i) => i.date >= from && i.date <= to)
  const rcpts = state.receipts.filter((r) => r.date >= from && r.date <= to)
  const pname = (id) => state.partners.find((p) => p.id === id)?.name || ''

  const exLedgers = () => {
    const f = `Tally-Ledgers-${today()}.csv`
    downloadText(f, toCSV(ledgers, [{ key: 'name', header: 'Ledger Name' }, { key: 'group', header: 'Under Group' }, { key: 'gstin', header: 'GSTIN' }, { key: 'state', header: 'State' }, { key: 'closing', header: 'Closing Balance' }, { key: 'drcr', header: 'Dr/Cr' }]), 'text/csv')
    logExport('LEDGERS', f); toast.success('Ledger masters exported', `${ledgers.length} ledgers`)
  }
  const exVouchers = () => {
    const rows = [
      ...invs.map((i) => ({ date: i.date, type: 'Sales', no: i.number, party: pname(i.partnerId), ledger: 'Sales – GST 18%', taxable: i.subtotal, gst: i.gst, amount: i.total, narration: `Against ${state.salesOrders.find((s) => s.id === i.soId)?.number || ''}` })),
      ...rcpts.map((r) => ({ date: r.date, type: 'Receipt', no: r.number, party: pname(r.partnerId), ledger: 'HDFC Bank Current A/c', taxable: r.amount, gst: 0, amount: r.amount, narration: `${r.mode} ${r.ref || ''}` })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const f = `Tally-Vouchers-${from}-to-${to}.csv`
    downloadText(f, toCSV(rows, ['date', 'type', 'no', 'party', 'ledger', 'taxable', 'gst', 'amount', 'narration'].map((k) => ({ key: k, header: { date: 'Date', type: 'Voucher Type', no: 'Voucher No', party: 'Party Ledger', ledger: 'Account Ledger', taxable: 'Taxable Value', gst: 'GST', amount: 'Amount', narration: 'Narration' }[k] }))), 'text/csv')
    logExport('VOUCHERS', f); toast.success('Vouchers exported', `${rows.length} vouchers`)
  }
  const exXML = () => {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const d = (x) => x.replace(/-/g, '')
    const v = invs.map((i) => `   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="Sales" ACTION="Create">
     <DATE>${d(i.date)}</DATE><VOUCHERNUMBER>${esc(i.number)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(pname(i.partnerId))}</PARTYLEDGERNAME>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(pname(i.partnerId))}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${i.total}</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales – GST 18%</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${i.subtotal}</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output IGST/CGST+SGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${i.gst}</AMOUNT></ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>`).join('\n')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>\n <BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(state.settings.company.legalName)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>\n  <REQUESTDATA>\n${v}\n  </REQUESTDATA></IMPORTDATA></BODY>\n</ENVELOPE>\n`
    const f = `Tally-Sales-${from}-to-${to}.xml`
    downloadText(f, xml, 'application/xml')
    logExport('TALLY_XML', f); toast.success('Tally XML exported', `${invs.length} sales vouchers – import via Gateway of Tally › Import › Vouchers`)
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Ledger masters" subtitle="Dealers, vendors, banks and migrated ledgers with closing balances">
        <div className="text-3xl font-bold text-ink-900">{fmtNum(ledgers.length)}</div>
        <div className="text-xs text-slate-500">ledgers · {ledgers.filter((l) => l.group === 'Sundry Debtors').length} debtors · {ledgers.filter((l) => l.group === 'Sundry Creditors').length} creditors</div>
        <Button className="mt-4 w-full" variant="secondary" icon={Download} onClick={exLedgers}>Export ledgers (CSV)</Button>
      </Card>
      <Card title="Vouchers" subtitle="Sales invoices and customer receipts for the period" className="lg:col-span-2">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-600">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-slate-600">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
          <div className="text-sm text-slate-600 pb-1.5"><b>{invs.length}</b> invoices ({fmtINR(sum(invs, (i) => i.total))}) · <b>{rcpts.length}</b> receipts ({fmtINR(sum(rcpts, (r) => r.amount))})</div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="secondary" icon={Download} disabled={!invs.length && !rcpts.length} onClick={exVouchers}>Export vouchers (CSV)</Button>
          <Button variant="secondary" icon={FileCode2} disabled={!invs.length} onClick={exXML}>Export sales vouchers (Tally XML)</Button>
        </div>
      </Card>
    </div>
  )
}

function ImportLog() {
  const logs = useStore((s) => s.importLogs || [])
  const users = useStore((s) => s.users)
  const label = (e) => ENTITIES[e]?.label || { VOUCHERS: 'Tally vouchers', TALLY_XML: 'Tally XML', LEDGERS: 'Tally ledgers' }[e] || e
  return (
    <DataTable rows={logs} exportName="btali-import-log" initialSort={{ key: 'ts', dir: 'desc' }}
      filters={[{ key: 'status', label: 'types', options: [{ value: 'COMPLETED', label: 'Imports' }, { value: 'EXPORTED', label: 'Exports' }] }]}
      columns={[
        { key: 'ts', header: 'When', render: (l) => fmtDateTime(l.ts) },
        { key: 'entity', header: 'Data', value: (l) => label(l.entity) },
        { key: 'fileName', header: 'File', render: (l) => <span className="font-mono text-xs">{l.fileName}</span> },
        { key: 'imported', header: 'New', align: 'right' },
        { key: 'updated', header: 'Updated', align: 'right' },
        { key: 'failed', header: 'Skipped', align: 'right', render: (l) => <span className={l.failed ? 'text-red-600 font-medium' : ''}>{l.failed}</span> },
        { key: 'user', header: 'By', value: (l) => users.find((u) => u.id === l.userId)?.name || '—' },
        { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} label={l.status === 'EXPORTED' ? 'Exported' : 'Completed'} /> },
        { key: 'note', header: 'Note', render: (l) => <span className="text-xs text-slate-500">{l.note || '—'}</span> },
      ]} />
  )
}

export default function Import() {
  const [tab, setTab] = useState('import')
  const logs = useStore((s) => s.importLogs || [])
  const imports = logs.filter((l) => l.status === 'COMPLETED')
  return (
    <div>
      <PageHeader title="Data Import & Migration" subtitle="Migrate masters and opening balances from Excel / Tally, and export accounting data back to Tally" />
      <Grid cols={4} className="mb-5">
        <Stat label="Imports run" value={imports.length} icon={Upload} />
        <Stat label="Records created" value={fmtNum(sum(imports, (l) => l.imported))} icon={CheckCircle2} tone="green" />
        <Stat label="Records updated" value={fmtNum(sum(imports, (l) => l.updated))} icon={History} tone="blue" />
        <Stat label="Tally exports" value={logs.filter((l) => l.status === 'EXPORTED').length} icon={FileCode2} tone="ink" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'import', label: 'Import wizard' }, { key: 'tally', label: 'Tally export' }, { key: 'log', label: 'Import / export log', count: logs.length }]} />
      {tab === 'import' && <Wizard />}
      {tab === 'tally' && <TallyExport />}
      {tab === 'log' && <ImportLog />}
    </div>
  )
}
