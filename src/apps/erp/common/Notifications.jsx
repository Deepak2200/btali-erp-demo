import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bell, CheckCheck, AlertTriangle, Info, Siren, Settings2, Send, ExternalLink, Save, RotateCcw, Radio } from 'lucide-react'
import { useStore, useUser } from '../../../store'
import { PageHeader, Card, Grid, Stat, Badge, Button, Tabs, EmptyState, toast, cx, Segmented, SearchInput, Field, NumberInput, FormGrid, Alert, Input } from '../../../components/ui'
import { fmtDateTime, timeAgo, fmtINR } from '../../../lib/format'
import { notificationVisible } from '../../../components/AppShell'
import { computeAlerts, alertsForUser, ALERT_KINDS } from './_alerts'

const SEV_TONE = { critical: 'red', warning: 'amber', info: 'blue' }
const DEFAULT_RULES = { dealerInactiveDays: 45, receivableBuckets: [30, 60, 90], highValuePayment: 500000, containerDelayDays: 3, stockCoverDays: 30, preEtaDays: 3 }

function NotificationList({ user }) {
  const nav = useNavigate()
  const notifications = useStore((s) => s.notifications)
  const markRead = useStore((s) => s.markNotificationRead)
  const markAll = useStore((s) => s.markAllNotificationsRead)
  const [f, setF] = useState('all')
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const mine = useMemo(() => notifications.filter((n) => notificationVisible(n, user)), [notifications, user])
  const list = mine.filter((n) => (f === 'all' || (f === 'unread' ? !n.read : n.read)) && (type === 'all' || n.type === type) && (!q || `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase())))
  const unread = mine.filter((n) => !n.read)
  const open = (n) => { markRead(n.id); if (n.link) nav(n.link) }
  return (
    <Card padded={false}>
      <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between p-3 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Search notifications…" className="sm:w-64" />
          <Segmented size="sm" value={f} onChange={setF} options={[{ key: 'all', label: `All (${mine.length})` }, { key: 'unread', label: `Unread (${unread.length})` }, { key: 'read', label: 'Read' }]} />
          <Segmented size="sm" value={type} onChange={setType} options={[{ key: 'all', label: 'Any type' }, { key: 'warning', label: 'Warnings' }, { key: 'info', label: 'Info' }]} />
        </div>
        <Button size="sm" variant="secondary" icon={CheckCheck} disabled={!unread.length} onClick={() => { markAll(unread.map((n) => n.id)); toast.success(`${unread.length} notification${unread.length > 1 ? 's' : ''} marked as read`) }}>Mark all read</Button>
      </div>
      {list.length === 0 ? <EmptyState icon={Bell} title="No notifications" message={q || f !== 'all' || type !== 'all' ? 'Try a different filter.' : 'You are all caught up.'} /> : (
        <ul className="divide-y divide-slate-100">
          {list.map((n) => (
            <li key={n.id} onClick={() => open(n)} className={cx('flex gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50', !n.read && 'bg-brand-50/40')}>
              <span className={cx('p-2 rounded-lg h-fit shrink-0', n.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600')}>{n.type === 'warning' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cx('text-sm truncate', n.read ? 'text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</span>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />}
                </div>
                {n.body && <div className="text-sm text-slate-500 mt-0.5">{n.body}</div>}
                <div className="text-[11px] text-slate-400 mt-1" title={fmtDateTime(n.ts)}>{timeAgo(n.ts)}{n.roles?.length ? ` · ${n.roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', ')}` : ''}</div>
              </div>
              <div className="flex items-start gap-1" onClick={(e) => e.stopPropagation()}>
                {!n.read && <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>}
                {n.link && <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => open(n)}>Open</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function LiveAlerts({ alerts }) {
  const nav = useNavigate()
  const notify = useStore((s) => s.notify)
  const audit = useStore((s) => s.audit)
  const [kind, setKind] = useState('ALL')
  const [sev, setSev] = useState('all')
  const kinds = Object.entries(ALERT_KINDS).map(([k, v]) => ({ key: k, label: v.label, count: alerts.filter((a) => a.kind === k).length })).filter((k) => k.count)
  const list = alerts.filter((a) => (kind === 'ALL' || a.kind === kind) && (sev === 'all' || a.severity === sev))
  const broadcast = (a) => {
    notify({ title: a.title, body: a.body, type: a.severity === 'info' ? 'info' : 'warning', link: a.link, roles: ALERT_KINDS[a.kind].roles })
    audit('Broadcast alert', ALERT_KINDS[a.kind].label, a.title)
    toast.success('Alert sent to team', ALERT_KINDS[a.kind].roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', '))
  }
  const broadcastAll = () => {
    const crit = list.filter((a) => a.severity === 'critical')
    crit.forEach((a) => notify({ title: a.title, body: a.body, type: 'warning', link: a.link, roles: ALERT_KINDS[a.kind].roles }))
    audit('Broadcast critical alerts', 'Alerts', `${crit.length} alerts`)
    toast.success(`${crit.length} critical alert${crit.length === 1 ? '' : 's'} pushed to the responsible teams`)
  }
  return (
    <div className="space-y-3">
      <Tabs value={kind} onChange={setKind} tabs={[{ key: 'ALL', label: 'All alerts', count: alerts.length }, ...kinds]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented size="sm" value={sev} onChange={setSev} options={[{ key: 'all', label: 'All severities' }, { key: 'critical', label: 'Critical' }, { key: 'warning', label: 'Warning' }, { key: 'info', label: 'Info' }]} />
        <Button size="sm" variant="dark" icon={Send} disabled={!list.some((a) => a.severity === 'critical')} onClick={broadcastAll}>Notify teams of critical alerts</Button>
      </div>
      {list.length === 0 ? <Card><EmptyState icon={Radio} title="No alerts match" message="Everything is within the configured thresholds." /></Card> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map((a) => (
            <div key={a.id} className={cx('bg-white border rounded-xl p-3.5 flex gap-3 shadow-card', a.severity === 'critical' ? 'border-red-200' : a.severity === 'warning' ? 'border-amber-200' : 'border-slate-200')}>
              <span className={cx('w-1 rounded-full shrink-0', a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500')} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <Badge tone={SEV_TONE[a.severity]}>{a.severity}</Badge>
                  <Badge tone="gray">{ALERT_KINDS[a.kind].label}</Badge>
                </div>
                <div className="text-sm font-semibold text-slate-900">{a.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{a.body}</div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="soft" icon={ExternalLink} onClick={() => nav(a.link)}>Open</Button>
                  <Button size="sm" variant="ghost" icon={Send} onClick={() => broadcast(a)}>Notify team</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AlertRules() {
  const rules = useStore((s) => s.settings.alertRules)
  const updateSettings = useStore((s) => s.updateSettings)
  const audit = useStore((s) => s.audit)
  const [r, setR] = useState({ ...DEFAULT_RULES, ...rules })
  useEffect(() => setR({ ...DEFAULT_RULES, ...rules }), [rules])
  const set = (k) => (v) => setR((x) => ({ ...x, [k]: v }))
  const save = () => {
    const buckets = String(r.receivableBuckets).split(',').map((x) => Number(String(x).trim())).filter((x) => x > 0).sort((a, b) => a - b)
    if (!buckets.length) { toast.error('Enter at least one receivable bucket'); return }
    updateSettings({ alertRules: { ...r, receivableBuckets: buckets } })
    audit('Updated alert rules', 'Settings', '')
    toast.success('Alert rules saved', 'Live alerts have been recalculated.')
  }
  return (
    <Card title="Alert rules" subtitle="Thresholds used by the live alerts engine – changes apply immediately for every user">
      <FormGrid cols={3}>
        <Field label="Container delay – critical after (days past ETA)"><NumberInput min={0} value={r.containerDelayDays} onChange={set('containerDelayDays')} /></Field>
        <Field label="Pre-ETA alert window (days)"><NumberInput min={0} value={r.preEtaDays} onChange={set('preEtaDays')} /></Field>
        <Field label="Dealer inactive after (days without order)"><NumberInput min={1} value={r.dealerInactiveDays} onChange={set('dealerInactiveDays')} /></Field>
        <Field label="High-value supplier payment (₹)" hint={fmtINR(r.highValuePayment)}><NumberInput min={0} step={10000} value={r.highValuePayment} onChange={set('highValuePayment')} /></Field>
        <Field label="Receivable ageing buckets (days)" hint="Comma separated, e.g. 30, 60, 90"><Input value={Array.isArray(r.receivableBuckets) ? r.receivableBuckets.join(', ') : r.receivableBuckets} onChange={(e) => set('receivableBuckets')(e.target.value)} /></Field>
        <Field label="Target stock cover (days)"><NumberInput min={1} value={r.stockCoverDays} onChange={set('stockCoverDays')} /></Field>
      </FormGrid>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" icon={RotateCcw} onClick={() => setR({ ...DEFAULT_RULES })}>Restore defaults</Button>
        <Button icon={Save} onClick={save}>Save rules</Button>
      </div>
    </Card>
  )
}

export default function Notifications() {
  const state = useStore()
  const user = useUser()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'inbox'
  const alerts = useMemo(() => alertsForUser(computeAlerts(state), user), [state, user])
  const mine = useMemo(() => state.notifications.filter((n) => notificationVisible(n, user)), [state.notifications, user])
  const isAdmin = user?.role === 'ADMIN'
  const tabs = [
    { key: 'inbox', label: 'Notification centre', count: mine.filter((n) => !n.read).length },
    { key: 'alerts', label: 'Live alerts', count: alerts.length },
    ...(isAdmin ? [{ key: 'rules', label: 'Alert rules' }] : []),
  ]
  return (
    <div>
      <PageHeader title="Notifications & Alerts" subtitle="System notifications for your role and live risk alerts computed from current data" />
      <Grid cols={4} className="mb-5">
        <Stat label="Unread notifications" value={mine.filter((n) => !n.read).length} icon={Bell} tone="brand" onClick={() => setSp({ tab: 'inbox' })} />
        <Stat label="Critical alerts" value={alerts.filter((a) => a.severity === 'critical').length} icon={Siren} tone="red" onClick={() => setSp({ tab: 'alerts' })} />
        <Stat label="Warnings" value={alerts.filter((a) => a.severity === 'warning').length} icon={AlertTriangle} tone="amber" onClick={() => setSp({ tab: 'alerts' })} />
        <Stat label="Alert types active" value={new Set(alerts.map((a) => a.kind)).size} icon={Settings2} tone="ink" sub={isAdmin ? 'configure in Alert rules' : 'set by Director'} onClick={isAdmin ? () => setSp({ tab: 'rules' }) : undefined} />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={(t) => setSp({ tab: t }, { replace: true })} tabs={tabs} />
      {tab === 'inbox' && <NotificationList user={user} />}
      {tab === 'alerts' && <LiveAlerts alerts={alerts} />}
      {tab === 'rules' && isAdmin && <AlertRules />}
      {tab === 'rules' && !isAdmin && <Alert tone="info">Alert rules are maintained by the Director.</Alert>}
    </div>
  )
}
