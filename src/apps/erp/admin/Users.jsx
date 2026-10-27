import React, { useMemo, useState } from 'react'
import { UserPlus, Pencil, KeyRound, UserX, UserCheck, Check, Eye, Users as UsersIcon, ShieldCheck, Building2, Store } from 'lucide-react'
import {
  PageHeader, Card, Grid, Stat, Tabs, Badge, StatusBadge, Button, IconButton, Modal, FormGrid, Field, Input, Select, Checkbox, Avatar, toast, confirm, cx,
} from '../../../components/ui'
import DataTable from '../../../components/DataTable'
import { useStore, useUser } from '../../../store'
import { ROLE_LABEL, ROLE_MODULES, APPS } from '../../../nav'
import { fmtDateTime, timeAgo } from '../../../lib/format'

const REGIONS = ['North', 'South', 'East', 'West', 'Central']
const PORTAL_ROLES = ['VENDOR', 'DEALER', 'FRANCHISE', 'STAREX']
const APP_LABEL = { erp: 'Btali ERP', vendor: 'Vendor Portal', dealer: 'Dealer Portal', franchise: 'Franchise Portal', starex: 'Starex Portal' }
const roleTone = (r) => (r === 'ADMIN' ? 'brand' : r === 'FINANCE_HEAD' ? 'violet' : PORTAL_ROLES.includes(r) ? 'teal' : 'ink')

const EMPTY = { name: '', title: '', role: 'SALES_EXEC', email: '', phone: '', username: '', regions: [], vendorId: '', partnerId: '' }

function UserForm({ open, initial, onClose }) {
  const save = useStore((s) => s.adminSaveUser)
  const vendors = useStore((s) => s.vendors)
  const partners = useStore((s) => s.partners)
  const [f, setF] = useState(initial || EMPTY)
  const [err, setErr] = useState({})
  React.useEffect(() => { setF(initial || EMPTY); setErr({}) }, [initial?.id, open]) // eslint-disable-line
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = () => {
    const e = {}
    if (!f.name?.trim()) e.name = 'Required'
    if (!f.username?.trim()) e.username = 'Required'
    if (!f.email?.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Valid email required'
    if (f.role === 'VENDOR' && !f.vendorId) e.vendorId = 'Select the vendor company'
    if (['DEALER', 'FRANCHISE'].includes(f.role) && !f.partnerId) e.partnerId = 'Select the partner'
    setErr(e)
    if (Object.keys(e).length) return
    const data = { ...f }
    if (data.role !== 'VENDOR') delete data.vendorId
    if (!['DEALER', 'FRANCHISE'].includes(data.role)) delete data.partnerId
    if (data.role !== 'SALES_EXEC') delete data.regions
    const r = save(data)
    if (!r.ok) return toast.error('Could not save user', r.error)
    toast.success(initial?.id ? 'User updated' : 'User created', initial?.id ? r.user.name : `Login details emailed to ${r.user.email}`)
    onClose()
  }
  const partnerOpts = partners.filter((p) => (f.role === 'FRANCHISE' ? p.type === 'FRANCHISE' : p.type === 'DEALER')).map((p) => ({ value: p.id, label: `${p.name} – ${p.city}` }))
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? `Edit user – ${initial.name}` : 'Add user'} subtitle="Access is controlled by role; portal users are linked to their company"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>{initial?.id ? 'Save changes' : 'Create user & send invite'}</Button></>}>
      <FormGrid>
        <Field label="Full name" required error={err.name}><Input value={f.name} onChange={(e) => up('name', e.target.value)} /></Field>
        <Field label="Title / designation"><Input value={f.title} onChange={(e) => up('title', e.target.value)} placeholder="e.g. Sales Executive – West" /></Field>
        <Field label="Role" required>
          <Select value={f.role} onChange={(e) => up('role', e.target.value)} options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
        </Field>
        <Field label="Username" required error={err.username} hint="Used for sign-in"><Input value={f.username} onChange={(e) => up('username', e.target.value.replace(/\s/g, '').toLowerCase())} /></Field>
        <Field label="Email" required error={err.email}><Input type="email" value={f.email} onChange={(e) => up('email', e.target.value)} /></Field>
        <Field label="Mobile"><Input value={f.phone} onChange={(e) => up('phone', e.target.value)} /></Field>
        {f.role === 'VENDOR' && (
          <Field label="Linked vendor" required error={err.vendorId} className="md:col-span-2">
            <Select value={f.vendorId || ''} onChange={(e) => up('vendorId', e.target.value)} placeholder="Select vendor…" options={vendors.filter((v) => ['CHINA', 'INDIA'].includes(v.type)).map((v) => ({ value: v.id, label: v.name }))} />
          </Field>
        )}
        {['DEALER', 'FRANCHISE'].includes(f.role) && (
          <Field label={f.role === 'FRANCHISE' ? 'Linked franchise store' : 'Linked dealer'} required error={err.partnerId} className="md:col-span-2">
            <Select value={f.partnerId || ''} onChange={(e) => up('partnerId', e.target.value)} placeholder="Select…" options={partnerOpts} />
          </Field>
        )}
        {f.role === 'SALES_EXEC' && (
          <Field label="Assigned regions" className="md:col-span-2">
            <div className="flex flex-wrap gap-4 pt-1">
              {REGIONS.map((r) => <Checkbox key={r} label={r} checked={(f.regions || []).includes(r)} onChange={(v) => up('regions', v ? [...(f.regions || []), r] : (f.regions || []).filter((x) => x !== r))} />)}
            </div>
          </Field>
        )}
      </FormGrid>
    </Modal>
  )
}

function PermissionMatrix() {
  const sections = APPS.erp.sections
  const roles = Object.keys(ROLE_MODULES)
  const users = useStore((s) => s.users)
  const access = (role, mod) => {
    const m = ROLE_MODULES[role]
    if (m === '*') return 'full'
    if (m.includes(mod)) return 'full'
    if (mod === 'purchase' && m.includes('purchase-view')) return 'view'
    if (mod === 'management' && m.includes('management-planner')) return 'view'
    if (mod === 'ai' && m.includes('ai-mobile')) return 'view'
    return null
  }
  return (
    <Card title="Role permission matrix" subtitle="Modules each internal role can open in Btali ERP. Portal roles (Vendor, Dealer, Franchise, Starex) see only their own portal and data." padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2.5 sticky left-0 bg-slate-50 min-w-[170px]">Module</th>
              {roles.map((r) => <th key={r} className="px-2 py-2.5 text-center whitespace-nowrap">{ROLE_LABEL[r]}<div className="text-[10px] normal-case font-normal text-slate-400">{users.filter((u) => u.role === r && u.active !== false).length} user(s)</div></th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sections.map((s) => (
              <tr key={s.label}>
                <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white">{s.label}<div className="text-[11px] text-slate-400 font-normal">{s.items.length} screens</div></td>
                {roles.map((r) => {
                  const a = s.module === 'admin' ? (r === 'ADMIN' ? 'full' : null) : access(r, s.module)
                  return (
                    <td key={r} className="px-2 py-2 text-center">
                      {a === 'full' ? <span className="inline-flex w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 items-center justify-center"><Check className="w-3.5 h-3.5" /></span>
                        : a === 'view' ? <span className="inline-flex w-6 h-6 rounded-full bg-sky-50 text-sky-600 items-center justify-center" title="Partial / view access"><Eye className="w-3.5 h-3.5" /></span>
                          : <span className="text-slate-300">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" />Full access</span>
        <span className="inline-flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-sky-600" />Partial / view-only screens</span>
        <span>Approval rights follow the approval matrix in System Configuration.</span>
      </div>
    </Card>
  )
}

function AuditLog() {
  const log = useStore((s) => s.auditLog)
  const users = useStore((s) => s.users)
  const uname = (id) => users.find((u) => u.id === id)?.name || 'System'
  const entities = [...new Set(log.map((a) => a.entity).filter(Boolean))].sort()
  return (
    <DataTable
      rows={log}
      exportName="btali-audit-log"
      searchPlaceholder="Search action, reference…"
      filters={[
        { key: 'userId', label: 'users', options: users.map((u) => ({ value: u.id, label: u.name })) },
        { key: 'entity', label: 'entities', options: entities },
      ]}
      pageSize={15}
      initialSort={{ key: 'ts', dir: 'desc' }}
      empty={<div className="text-center text-sm text-slate-400 py-10">No activity recorded yet. Actions such as approvals, imports and user changes appear here.</div>}
      columns={[
        { key: 'ts', header: 'When', render: (a) => <div><div className="text-sm">{fmtDateTime(a.ts)}</div><div className="text-[11px] text-slate-400">{timeAgo(a.ts)}</div></div> },
        { key: 'user', header: 'User', value: (a) => uname(a.userId), render: (a) => <div className="flex items-center gap-2"><Avatar name={uname(a.userId)} size="sm" /><span>{uname(a.userId)}</span></div> },
        { key: 'action', header: 'Action', render: (a) => <span className="font-medium text-slate-800">{a.action}</span> },
        { key: 'entity', header: 'Entity', render: (a) => a.entity ? <Badge tone="gray">{a.entity}</Badge> : '—' },
        { key: 'ref', header: 'Reference', render: (a) => <span className="font-mono text-xs">{a.ref || '—'}</span> },
      ]}
    />
  )
}

export default function Users() {
  const users = useStore((s) => s.users)
  const vendors = useStore((s) => s.vendors)
  const partners = useStore((s) => s.partners)
  const auditLog = useStore((s) => s.auditLog)
  const setActive = useStore((s) => s.adminSetUserActive)
  const resetPw = useStore((s) => s.adminResetPassword)
  const me = useUser()
  const [tab, setTab] = useState('users')
  const [edit, setEdit] = useState(null)
  const [open, setOpen] = useState(false)

  const rows = useMemo(() => users.map((u) => ({
    ...u,
    status: u.active === false ? 'INACTIVE' : 'ACTIVE',
    linked: u.vendorId ? vendors.find((v) => v.id === u.vendorId)?.name : u.partnerId ? partners.find((p) => p.id === u.partnerId)?.name : u.regions?.length ? u.regions.join(', ') : '',
    lastAct: auditLog.find((a) => a.userId === u.id)?.ts || null,
  })), [users, vendors, partners, auditLog])

  const internal = rows.filter((u) => u.app === 'erp')
  const toggle = async (u) => {
    if (u.id === me?.id) return toast.error('You cannot deactivate your own account')
    const deact = u.status === 'ACTIVE'
    const ok = await confirm({ title: deact ? `Deactivate ${u.name}?` : `Re-activate ${u.name}?`, message: deact ? 'The user will no longer be able to sign in. Their history and documents are retained.' : 'The user will be able to sign in again with their existing role.', confirmText: deact ? 'Deactivate' : 'Re-activate', tone: deact ? 'danger' : 'primary' })
    if (!ok) return
    setActive(u.id, !deact)
    toast.success(deact ? 'User deactivated' : 'User re-activated', u.name)
  }
  const reset = async (u) => {
    const ok = await confirm({ title: `Reset password for ${u.name}?`, message: `A reset link will be emailed to ${u.email}.`, confirmText: 'Send reset link' })
    if (!ok) return
    resetPw(u.id)
    toast.success('Password reset link sent', u.email)
  }

  return (
    <div>
      <PageHeader title="Users & Roles" subtitle="Manage who can access Btali ERP and the partner portals"
        actions={<Button icon={UserPlus} onClick={() => { setEdit(null); setOpen(true) }}>Add user</Button>} />
      <Grid cols={4} className="mb-5">
        <Stat label="Total users" value={rows.length} sub={`${rows.filter((u) => u.status === 'ACTIVE').length} active`} icon={UsersIcon} />
        <Stat label="Internal staff" value={internal.length} sub={`${new Set(internal.map((u) => u.role)).size} roles`} icon={ShieldCheck} tone="ink" />
        <Stat label="Vendor portal users" value={rows.filter((u) => u.role === 'VENDOR').length} icon={Building2} tone="violet" />
        <Stat label="Dealer / franchise / Starex" value={rows.filter((u) => ['DEALER', 'FRANCHISE', 'STAREX'].includes(u.role)).length} icon={Store} tone="green" />
      </Grid>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Users', count: rows.length }, { key: 'matrix', label: 'Role permissions' }, { key: 'audit', label: 'Audit log', count: auditLog.length }]} />
      {tab === 'users' && (
        <DataTable
          rows={rows}
          exportName="btali-users"
          searchPlaceholder="Search name, username, email…"
          filters={[
            { key: 'role', label: 'roles', options: Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v })) },
            { key: 'app', label: 'apps', options: Object.entries(APP_LABEL).map(([k, v]) => ({ value: k, label: v })) },
            { key: 'status', label: 'statuses', options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }] },
          ]}
          onRowClick={(u) => { setEdit(u); setOpen(true) }}
          rowClass={(u) => cx(u.status === 'INACTIVE' && 'opacity-60')}
          columns={[
            { key: 'name', header: 'User', render: (u) => <div className="flex items-center gap-2.5"><Avatar name={u.name} size="sm" /><div className="min-w-0"><div className="font-medium text-slate-800 truncate">{u.name}{u.id === me?.id && <span className="ml-1.5 text-[10px] text-brand-600">(you)</span>}</div><div className="text-[11px] text-slate-500 truncate">{u.title}</div></div></div> },
            { key: 'username', header: 'Username', render: (u) => <span className="font-mono text-xs">{u.username}</span> },
            { key: 'role', header: 'Role', value: (u) => ROLE_LABEL[u.role], render: (u) => <Badge tone={roleTone(u.role)}>{ROLE_LABEL[u.role] || u.role}</Badge> },
            { key: 'app', header: 'App', value: (u) => APP_LABEL[u.app], className: 'whitespace-nowrap' },
            { key: 'linked', header: 'Linked to / regions', render: (u) => <span className="text-xs text-slate-600">{u.linked || '—'}</span> },
            { key: 'email', header: 'Email', render: (u) => <span className="text-xs">{u.email}</span> },
            { key: 'lastAct', header: 'Last activity', render: (u) => <span className="text-xs text-slate-500">{u.lastAct ? timeAgo(u.lastAct) : '—'}</span> },
            { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
            {
              key: 'actions', header: '', sortable: false, export: false, render: (u) => (
                <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <IconButton icon={Pencil} title="Edit" onClick={() => { setEdit(u); setOpen(true) }} />
                  <IconButton icon={KeyRound} title="Reset password" onClick={() => reset(u)} />
                  <IconButton icon={u.status === 'ACTIVE' ? UserX : UserCheck} tone={u.status === 'ACTIVE' ? 'danger' : 'default'} title={u.status === 'ACTIVE' ? 'Deactivate' : 'Re-activate'} onClick={() => toggle(u)} />
                </div>
              ),
            },
          ]}
        />
      )}
      {tab === 'matrix' && <PermissionMatrix />}
      {tab === 'audit' && <AuditLog />}
      <UserForm open={open} initial={edit ? { ...EMPTY, ...edit } : null} onClose={() => setOpen(false)} />
    </div>
  )
}
