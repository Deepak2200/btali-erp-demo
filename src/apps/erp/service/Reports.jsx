import React, { useMemo, useState } from 'react'
import { Activity, Clock, AlertTriangle, ShieldAlert, IndianRupee, Search } from 'lucide-react'
import { useStore, useLookup } from '../../../store'
import { PageHeader, Grid, Stat, Card, Tabs, StatusBadge, Badge, EmptyState, Input, SectionTitle } from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { BarsChart, DonutChart, TrendChart, ProductCell, PartnerCell } from '../../../components/business'
import { fmtINR, fmtDate, fmtPct, lastMonths, monthKey, monthLabel } from '../../../lib/format'
import { CATEGORY_LABEL, nearestPartner, slaState, resolvedAtOf } from '../../../store/slices/service'
import { useEscalations } from './Escalations'
import { fmtHours, SlaChip } from './_parts'

const count = (arr, fn) => {
  const m = {}
  arr.forEach((x) => { const k = fn(x); if (k) m[k] = (m[k] || 0) + 1 })
  return m
}
const resHours = (t) => { const r = resolvedAtOf(t); return r ? Math.max(1, Math.round((new Date(r) - new Date(t.createdAt)) / 3600000)) : null }

export default function Reports() {
  const tickets = useStore((s) => s.tickets)
  const claims = useStore((s) => s.warrantyClaims)
  const warranties = useStore((s) => s.warranties)
  const invoices = useStore((s) => s.invoices)
  const products = useStore((s) => s.products)
  const { partner, vendor, product } = useLookup()
  const esc = useEscalations()
  const [tab, setTab] = useState('volume')
  const [cq, setCq] = useState('')
  const state = useStore.getState()

  const regionOf = (t) => partner(t.routedPartnerId || t.partnerId)?.region || (t.customer ? nearestPartner(state, t.customer).region : null) || 'Btali internal'
  const vol = useMemo(() => {
    const byDealer = count(tickets.filter((t) => t.partnerId), (t) => partner(t.partnerId)?.name)
    const byRegion = count(tickets, regionOf)
    const byCat = count(tickets, (t) => CATEGORY_LABEL[t.category])
    const months = lastMonths(6).map((k) => ({ label: monthLabel(k), tickets: tickets.filter((t) => monthKey(t.createdAt) === k).length, claims: claims.filter((c) => monthKey(c.createdAt) === k).length }))
    const toArr = (m) => Object.entries(m).map(([label, value]) => ({ label, name: label, value })).sort((a, b) => b.value - a.value)
    return { dealer: toArr(byDealer).slice(0, 10), region: toArr(byRegion), cat: toArr(byCat), months }
  }, [tickets, claims]) // eslint-disable-line

  const sla = useMemo(() => {
    const done = tickets.filter((t) => resolvedAtOf(t))
    const byCat = Object.entries(CATEGORY_LABEL).map(([k, label]) => {
      const d = done.filter((t) => t.category === k)
      return { label, value: d.length ? Math.round(d.reduce((a, t) => a + resHours(t), 0) / d.length) : 0, n: d.length }
    }).filter((r) => r.n)
    const overdue = tickets.filter((t) => { const s = slaState(t); return !s.done && s.overdue })
    const breached = done.filter((t) => slaState(t).breached).length
    const avg = done.length ? Math.round(done.reduce((a, t) => a + resHours(t), 0) / done.length) : 0
    return { byCat, overdue, breached, avg, done: done.length, compliance: done.length ? ((done.length - breached) / done.length) * 100 : 100 }
  }, [tickets])

  const failure = useMemo(() => {
    const sold = {}
    invoices.forEach((inv) => (inv.lines || []).forEach((l) => { if (!l.free) sold[l.productId] = (sold[l.productId] || 0) + l.qty }))
    warranties.forEach((w) => { sold[w.productId] = Math.max(sold[w.productId] || 0, 0) + 0 })
    return products.filter((p) => p.type === 'FG').map((p) => {
      const c = claims.filter((x) => x.productId === p.id).length
      const d = tickets.filter((t) => t.productId === p.id && t.category === 'PRODUCT_DEFECT').length
      const units = Math.max(sold[p.id] || 0, warranties.filter((w) => w.productId === p.id).length)
      return { id: p.id, productId: p.id, name: p.shortName || p.name, vendorId: p.vendorId, sold: units, claims: c, defects: d, rate: units ? ((c + d) / units) * 100 : 0 }
    }).filter((r) => r.claims + r.defects > 0).sort((a, b) => b.rate - a.rate)
  }, [products, claims, tickets, invoices, warranties])

  const vend = useMemo(() => {
    const m = {}
    esc.forEach((r) => {
      m[r.vendorId] = m[r.vendorId] || { id: r.vendorId, label: vendor(r.vendorId)?.name, tickets: 0, claims: 0, resp: [], open: 0 }
      const v = m[r.vendorId]
      if (r.kind === 'CLAIM') v.claims++; else v.tickets++
      if (r.open) v.open++
      if (r.respH != null) v.resp.push(r.respH)
    })
    claims.forEach((c) => {
      const vid = c.vendorClaim?.vendorId || product(c.productId)?.vendorId
      m[vid] = m[vid] || { id: vid, label: vendor(vid)?.name, tickets: 0, claims: 0, resp: [], open: 0 }
      m[vid].cost = (m[vid].cost || 0) + (c.bearer === 'VENDOR' ? c.cost || 0 : 0)
      m[vid].btaliCost = (m[vid].btaliCost || 0) + (c.bearer === 'BTALI' ? c.cost || 0 : 0)
      m[vid].allClaims = (m[vid].allClaims || 0) + 1
    })
    return Object.values(m).map((v) => ({ ...v, avgResp: v.resp.length ? Math.round(v.resp.reduce((a, b) => a + b, 0) / v.resp.length) : null }))
  }, [esc, claims]) // eslint-disable-line

  const cost = { BTALI: claims.filter((c) => c.bearer === 'BTALI').reduce((a, c) => a + (c.cost || 0), 0), VENDOR: claims.filter((c) => c.bearer === 'VENDOR').reduce((a, c) => a + (c.cost || 0), 0) }

  const cust = useMemo(() => {
    const s = cq.trim().toLowerCase()
    if (s.length < 3) return null
    const ws = warranties.filter((w) => `${w.customer?.name} ${w.customer?.phone} ${w.barcode}`.toLowerCase().includes(s))
    const codes = new Set(ws.map((w) => w.barcode))
    const cl = claims.filter((c) => codes.has(c.barcode))
    const tk = tickets.filter((t) => (t.barcode && codes.has(t.barcode)) || `${t.customer?.name || ''} ${t.customer?.phone || ''}`.toLowerCase().includes(s))
    return { ws, cl, tk }
  }, [cq, warranties, claims, tickets])

  return (
    <div>
      <PageHeader title="Service Reports" subtitle="Service volumes, SLA performance, failure analysis, vendor escalations and warranty cost" />
      <Grid cols={4} className="mb-4">
        <Stat label="Tickets (all time)" value={tickets.length} icon={Activity} sub={`${claims.length} warranty claims`} />
        <Stat label="Avg. resolution" value={sla.avg ? fmtHours(sla.avg) : '—'} icon={Clock} tone="green" sub={`SLA compliance ${fmtPct(sla.compliance, 0)}`} />
        <Stat label="Overdue now" value={sla.overdue.length} icon={AlertTriangle} tone="red" />
        <Stat label="Warranty cost" value={fmtINR(cost.BTALI + cost.VENDOR)} icon={IndianRupee} tone="amber" sub={`${fmtINR(cost.VENDOR)} vendor-borne`} />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { key: 'volume', label: 'Service volume' }, { key: 'sla', label: 'SLA' }, { key: 'failure', label: 'Failure analysis' }, { key: 'vendor', label: 'Vendor escalations' }, { key: 'cost', label: 'Warranty cost' }, { key: 'customer', label: 'Customer history' },
      ]} />

      {tab === 'volume' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Monthly intake" subtitle="Tickets and warranty claims logged"><TrendChart data={vol.months} money={false} type="line" series={[{ key: 'tickets', label: 'Tickets' }, { key: 'claims', label: 'Claims' }]} /></Card>
          <Card title="By category"><DonutChart data={vol.cat} money={false} /></Card>
          <Card title="By dealer / franchise" subtitle="Top 10 raising partners"><BarsChart data={vol.dealer} layout="vertical" money={false} series={[{ key: 'value', label: 'Tickets' }]} height={Math.max(160, vol.dealer.length * 34)} /></Card>
          <Card title="By region"><BarsChart data={vol.region} money={false} series={[{ key: 'value', label: 'Tickets' }]} /></Card>
        </div>
      )}

      {tab === 'sla' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Average resolution time by category" subtitle="Hours from logging to resolution">
            {sla.byCat.length ? <BarsChart data={sla.byCat} money={false} series={[{ key: 'value', label: 'Hours' }]} /> : <EmptyState title="No resolved tickets yet" />}
          </Card>
          <Card title="SLA summary">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[['Resolved tickets', sla.done], ['Resolved within SLA', sla.done - sla.breached], ['Resolved after SLA', sla.breached], ['Open & overdue', sla.overdue.length]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{l}</div><div className="text-xl font-bold text-ink-900">{v}</div></div>
              ))}
            </div>
          </Card>
          <div className="lg:col-span-2">
            <SectionTitle>Overdue tickets</SectionTitle>
            <DataTable rows={sla.overdue} searchable={false} exportName="overdue-tickets" columns={[
              { key: 'number', header: 'Ticket' }, { key: 'subject', header: 'Subject' }, { key: 'category', header: 'Category', value: (t) => CATEGORY_LABEL[t.category] },
              { key: 'createdAt', header: 'Logged', render: (t) => fmtDate(t.createdAt) }, { key: 'stage', header: 'Stage', render: (t) => <StatusBadge status={t.stage} /> }, { key: 'sla', header: 'SLA', render: (t) => <SlaChip t={t} /> },
            ]} />
          </div>
        </div>
      )}

      {tab === 'failure' && (
        <div className="space-y-4">
          <Card title="Failure rate by product" subtitle="(Warranty claims + product-defect tickets) ÷ units sold">
            {failure.length ? <BarsChart data={failure.slice(0, 10).map((f) => ({ label: f.name, value: Math.round(f.rate * 100) / 100 }))} layout="vertical" money={false} series={[{ key: 'value', label: 'Failure %' }]} height={Math.max(160, Math.min(10, failure.length) * 34)} /> : <EmptyState title="No failures recorded" />}
          </Card>
          <DataTable rows={failure} exportName="failure-analysis" columns={[
            { key: 'name', header: 'Product', render: (r) => <ProductCell id={r.productId} /> },
            { key: 'vendor', header: 'Vendor', value: (r) => vendor(r.vendorId)?.name },
            { key: 'sold', header: 'Units sold', align: 'right' }, { key: 'claims', header: 'Claims', align: 'right' }, { key: 'defects', header: 'Defect tickets', align: 'right' },
            { key: 'rate', header: 'Failure rate', align: 'right', render: (r) => <span className={r.rate > 2 ? 'text-red-600 font-semibold' : ''}>{fmtPct(r.rate, 2)}</span> },
          ]} initialSort={{ key: 'rate', dir: 'desc' }} />
        </div>
      )}

      {tab === 'vendor' && (
        <div className="space-y-4">
          <Card title="Escalation volume by vendor"><BarsChart data={vend.map((v) => ({ label: v.label, tickets: v.tickets, claims: v.claims }))} money={false} stacked series={[{ key: 'tickets', label: 'Service tickets' }, { key: 'claims', label: 'Warranty claims' }]} /></Card>
          <DataTable rows={vend} exportName="vendor-escalations-report" columns={[
            { key: 'label', header: 'Vendor' }, { key: 'tickets', header: 'Tickets escalated', align: 'right' }, { key: 'claims', header: 'Claims escalated', align: 'right' }, { key: 'open', header: 'Open', align: 'right' },
            { key: 'avgResp', header: 'Avg. response', align: 'right', render: (v) => (v.avgResp != null ? fmtHours(v.avgResp) : 'No reply yet') },
            { key: 'cost', header: 'Vendor-borne cost', align: 'right', value: (v) => v.cost || 0, render: (v) => fmtINR(v.cost || 0) },
          ]} />
        </div>
      )}

      {tab === 'cost' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Btali-borne vs vendor-borne"><DonutChart data={[{ name: 'Btali-borne', value: cost.BTALI }, { name: 'Vendor-borne', value: cost.VENDOR }]} /></Card>
          <Card title="Cost by vendor"><BarsChart data={vend.filter((v) => v.cost || v.btaliCost).map((v) => ({ label: v.label, vendor: v.cost || 0, btali: v.btaliCost || 0 }))} stacked series={[{ key: 'btali', label: 'Btali-borne' }, { key: 'vendor', label: 'Vendor-borne' }]} /></Card>
          <div className="lg:col-span-2">
            <DataTable rows={claims.filter((c) => c.cost)} exportName="warranty-cost" columns={[
              { key: 'number', header: 'Claim' }, { key: 'product', header: 'Product', render: (c) => <ProductCell id={c.productId} sub={c.barcode} /> },
              { key: 'partner', header: 'Dealer', render: (c) => <PartnerCell id={c.partnerId} /> }, { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
              { key: 'bearer', header: 'Borne by', render: (c) => (c.bearer ? <Badge tone={c.bearer === 'VENDOR' ? 'violet' : 'amber'}>{c.bearer === 'VENDOR' ? 'Vendor' : 'Btali'}</Badge> : '—') },
              { key: 'cost', header: 'Cost', align: 'right', render: (c) => fmtINR(c.cost) },
            ]} />
          </div>
        </div>
      )}

      {tab === 'customer' && (
        <Card>
          <div className="relative max-w-md mb-4"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><Input className="pl-9" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Customer name, mobile or barcode (min. 3 characters)" /></div>
          {!cust ? <EmptyState icon={Search} title="Look up a customer" message="e.g. Ramesh, 98220 45110 or a barcode" /> : (
            <div className="space-y-5">
              <div>
                <SectionTitle>Warranties ({cust.ws.length})</SectionTitle>
                <DataTable rows={cust.ws} searchable={false} pageSize={6} columns={[
                  { key: 'number', header: 'Warranty' }, { key: 'barcode', header: 'Barcode' }, { key: 'p', header: 'Product', render: (w) => <ProductCell id={w.productId} /> },
                  { key: 'c', header: 'Customer', render: (w) => `${w.customer?.name} · ${w.customer?.phone}` }, { key: 'endDate', header: 'Valid till', render: (w) => fmtDate(w.endDate) },
                ]} />
              </div>
              <div>
                <SectionTitle>Claims ({cust.cl.length})</SectionTitle>
                <DataTable rows={cust.cl} searchable={false} pageSize={6} columns={[{ key: 'number', header: 'Claim' }, { key: 'issue', header: 'Issue' }, { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> }, { key: 'createdAt', header: 'Date', render: (c) => fmtDate(c.createdAt) }]} />
              </div>
              <div>
                <SectionTitle>Service tickets ({cust.tk.length})</SectionTitle>
                <DataTable rows={cust.tk} searchable={false} pageSize={6} columns={[{ key: 'number', header: 'Ticket' }, { key: 'subject', header: 'Subject' }, { key: 'stage', header: 'Stage', render: (t) => <StatusBadge status={t.stage} /> }, { key: 'createdAt', header: 'Date', render: (t) => fmtDate(t.createdAt) }]} />
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
