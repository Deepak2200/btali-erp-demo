import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserCheck, UserX, Hourglass, ExternalLink } from 'lucide-react'
import { useStore } from '../../../store'
import { PageHeader, Grid, Stat, Kanban, Badge, Select, SearchInput, Card, prompt, toast, Avatar, Button } from '../../../components/ui'
import { fmtCompact, fmtDate, daysBetween, today } from '../../../lib/format'
import { useScope, ScopeToggle, STAGES, dealerStats, isInactive, REGIONS, SALES_PEOPLE } from './_shared'

export default function Pipeline() {
  const state = useStore()
  const partners = useStore((s) => s.partners)
  const users = useStore((s) => s.users)
  const settings = useStore((s) => s.settings)
  const movePartnerStage = useStore((s) => s.movePartnerStage)
  const scope = useScope()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [region, setRegion] = useState('')
  const [sp, setSp] = useState('')

  const list = useMemo(() => partners.filter((p) => p.type === 'DEALER' && p.status !== 'REJECTED' && scope.inScope(p.id)
    && (!region || p.region === region) && (!sp || p.salespersonId === sp)
    && (!q || `${p.name} ${p.city} ${p.code}`.toLowerCase().includes(q.toLowerCase()))), [partners, scope.mine, region, sp, q]) // eslint-disable-line

  const stats = useMemo(() => Object.fromEntries(list.map((p) => [p.id, dealerStats(state, p.id)])), [list, state.invoices, state.salesOrders]) // eslint-disable-line
  const count = (k) => list.filter((p) => p.stage === k).length
  const rev = (k) => list.filter((p) => p.stage === k).reduce((a, p) => a + (stats[p.id]?.rev12 || 0), 0)
  const activation = list.length ? Math.round((count('CURRENT') / list.length) * 100) : 0

  const onMove = async (p, to) => {
    let reason = ''
    if (to === 'DEAD') {
      reason = await prompt({ title: `Move ${p.name} to Dead Buyers`, label: 'Reason', placeholder: 'e.g. Moved to competitor brand, closed shop…', required: true, tone: 'danger', confirmText: 'Move to Dead' })
      if (!reason) return
    }
    if (to === 'CURRENT' && p.status === 'PENDING_APPROVAL') {
      toast.warn('Approval pending', 'Approve the onboarding first in Dealer Onboarding.')
      return
    }
    movePartnerStage(p.id, to, reason)
    toast.success(`${p.name} moved to ${STAGES.find((s) => s.key === to).label}`)
  }

  return (
    <div>
      <PageHeader title="Dealer Pipeline" subtitle="Lifecycle funnel – In-Decision → Current Dealers → Dead Buyers. Drag a card to move it." actions={<ScopeToggle scope={scope} />} />
      <Grid cols={4} className="mb-4">
        <Stat label="In-Decision" value={count('IN_DECISION')} icon={Hourglass} tone="amber" sub="prospects & pending approvals" />
        <Stat label="Current dealers" value={count('CURRENT')} icon={UserCheck} tone="green" sub={`${fmtCompact(rev('CURRENT'))} in last 12 months`} />
        <Stat label="Dead buyers" value={count('DEAD')} icon={UserX} tone="red" sub="win-back candidates" />
        <Stat label="Activation rate" value={`${activation}%`} icon={Users} tone="ink" sub={`${list.filter((p) => isInactive(p, settings)).length} current dealers inactive`} />
      </Grid>
      <Card className="mb-4" bodyClass="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search dealer, city, code…" className="sm:max-w-xs w-full" />
        <Select value={region} onChange={(e) => setRegion(e.target.value)} placeholder="All regions" options={REGIONS} className="sm:w-44" />
        <Select value={sp} onChange={(e) => setSp(e.target.value)} placeholder="All salespeople" options={SALES_PEOPLE.map((id) => ({ value: id, label: users.find((u) => u.id === id)?.name }))} className="sm:w-48" />
      </Card>
      <Kanban
        columns={STAGES}
        items={list}
        getColumn={(p) => p.stage}
        onMove={onMove}
        className="[&>div]:w-80"
        renderCard={(p) => {
          const st = stats[p.id] || {}
          const inactive = isInactive(p, settings)
          const owner = users.find((u) => u.id === p.salespersonId)
          return (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-500">{p.code} · {p.city} · {p.region}</div>
                </div>
                {p.tier && <Badge tone={p.tier === 'A' ? 'brand' : p.tier === 'B' ? 'ink' : 'gray'}>Tier {p.tier}</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><div className="text-slate-400">12m revenue</div><div className="font-semibold tabular-nums">{fmtCompact(st.rev12 || 0)}</div></div>
                <div><div className="text-slate-400">Last order</div><div className="font-medium">{p.lastOrderDate ? fmtDate(p.lastOrderDate) : '—'}</div></div>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.status === 'PENDING_APPROVAL' && <Badge tone="amber">Awaiting approval</Badge>}
                {p.status === 'PROSPECT' && <Badge tone="blue">Prospect</Badge>}
                {inactive && <Badge tone="red">Inactive {p.lastOrderDate ? `${daysBetween(p.lastOrderDate, today())}d` : ''}</Badge>}
                {p.stage === 'DEAD' && (p.deadReason || p.notes) && <span className="text-[11px] text-slate-500 italic line-clamp-2">{p.deadReason || p.notes}</span>}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-600"><Avatar name={owner?.name} size="sm" />{owner?.name || 'Unassigned'}</div>
                <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => navigate(`/erp/sales/dealers/${p.id}`)}>Open</Button>
              </div>
            </div>
          )
        }}
      />
    </div>
  )
}
