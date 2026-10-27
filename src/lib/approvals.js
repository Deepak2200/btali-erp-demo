// Registry of everything that can sit in "My Approvals". Each entry maps a collection + filter to an action.
// Actions are store functions with signature (id, approved:boolean, remark:string).
import { fmtINR, sum } from './format'

const name = (arr, id) => arr?.find((x) => x.id === id)?.name || '—'

export const APPROVAL_TYPES = [
  {
    key: 'PO', label: 'Purchase Order', roles: ['ADMIN'], collection: 'purchaseOrders',
    filter: (x) => x.status === 'PENDING_APPROVAL', action: 'approvePO', link: (x) => `/erp/purchase/orders/${x.id}`,
    title: (x, s) => `${x.number} · ${name(s.vendors, x.vendorId)}`,
    amount: (x, s) => sum(x.lines, (l) => l.qty * l.rate * (s.settings.fx[x.currency] || 1)),
    by: (x) => x.createdBy, date: (x) => x.date,
  },
  {
    key: 'PI', label: 'Proforma Invoice', roles: ['ADMIN', 'PURCHASE'], collection: 'purchaseOrders',
    filter: (x) => x.pi?.status === 'PENDING', action: 'approvePI', link: (x) => `/erp/purchase/orders/${x.id}`,
    title: (x, s) => `PI ${x.pi.number} for ${x.number} · ${name(s.vendors, x.vendorId)}`,
    amount: (x, s) => sum(x.lines, (l) => l.qty * l.rate * (s.settings.fx[x.currency] || 1)), date: (x) => x.pi.uploadedAt,
  },
  {
    key: 'QC', label: 'QC Review', roles: ['ADMIN', 'PURCHASE'], collection: 'purchaseOrders',
    filter: (x) => (x.qc || []).some((q) => q.status === 'PENDING'), action: null, link: () => `/erp/purchase/qc`,
    title: (x, s) => `${(x.qc || []).filter((q) => q.status === 'PENDING').length} QC files · ${x.number} · ${name(s.vendors, x.vendorId)}`,
    date: (x) => x.qc.find((q) => q.status === 'PENDING')?.uploadedAt,
  },
  {
    key: 'CONTAINER_PLAN', label: 'Container Plan', roles: ['ADMIN'], collection: 'containerPlans',
    filter: (x) => x.status === 'PENDING_APPROVAL', action: 'approveContainerPlan', link: () => `/erp/purchase/container-planning`,
    title: (x) => `${x.number || x.name} · ${x.containerType}`, date: (x) => x.submittedAt,
  },
  {
    key: 'FREIGHT', label: 'Forwarder Selection', roles: ['ADMIN'], collection: 'freightRfqs',
    filter: (x) => x.status === 'PENDING_APPROVAL', action: 'approveFreight', link: () => `/erp/purchase/freight`,
    title: (x) => `${x.number} · ${x.route || ''}`, date: (x) => x.submittedAt,
  },
  {
    key: 'VENDOR_BILL', label: 'Vendor Bill (Boss)', roles: ['ADMIN'], collection: 'vendorBills',
    filter: (x) => x.status === 'PENDING_BOSS', action: 'approveVendorBill', link: () => `/erp/accounts/vendor-bills`,
    title: (x, s) => `${x.number} · ${name(s.vendors, x.vendorId)}`, amount: (x) => x.amountINR ?? x.amount, date: (x) => x.date,
  },
  {
    key: 'PAYMENT_RELEASE', label: 'Payment Release (Madam)', roles: ['FINANCE_HEAD'], collection: 'vendorBills',
    filter: (x) => x.status === 'APPROVED', action: null, link: () => `/erp/accounts/payments`,
    title: (x, s) => `${x.number} · ${name(s.vendors, x.vendorId)}`, amount: (x) => x.amountINR ?? x.amount, date: (x) => x.dueDate,
  },
  {
    key: 'EXPENSE', label: 'Expense', roles: ['ADMIN', 'FINANCE_HEAD'], collection: 'expenses',
    filter: (x) => x.status === 'PENDING_APPROVAL', action: 'approveExpense', link: () => `/erp/accounts/expenses`,
    title: (x) => `${x.number} · ${x.category} – ${x.description}`, amount: (x) => x.amount, date: (x) => x.date,
  },
  {
    key: 'DEALER', label: 'Dealer Onboarding', roles: ['ADMIN', 'SALES_MANAGER'], collection: 'partners',
    filter: (x) => x.status === 'PENDING_APPROVAL', action: 'approveDealer', link: (x) => `/erp/sales/onboarding`,
    title: (x) => `${x.name} · ${x.city}, ${x.state}`, date: (x) => x.submittedAt,
  },
  {
    key: 'PORTAL_ORDER', label: 'Dealer Portal Order', roles: ['ADMIN', 'SALES_MANAGER', 'SALES_EXEC'], collection: 'salesOrders',
    filter: (x) => x.status === 'PENDING_REVIEW', action: 'approvePortalOrder', link: (x) => `/erp/sales/orders/${x.id}`,
    title: (x, s) => `${x.number} · ${name(s.partners, x.partnerId)}`, amount: (x) => x.total, date: (x) => x.date,
  },
  {
    key: 'WARRANTY_CLAIM', label: 'Warranty Claim', roles: ['ADMIN', 'SERVICE'], collection: 'warrantyClaims',
    filter: (x) => x.status === 'SUBMITTED' || x.status === 'UNDER_REVIEW', action: 'decideWarrantyClaim', link: () => `/erp/service/claims`,
    title: (x, s) => `${x.number} · ${x.issue} · ${name(s.partners, x.partnerId)}`, date: (x) => x.createdAt,
  },
  {
    key: 'PAYROLL', label: 'Payroll Run', roles: ['FINANCE_HEAD', 'ADMIN'], collection: 'payrollRuns',
    filter: (x) => x.status === 'PENDING_APPROVAL', action: 'approvePayroll', link: () => `/erp/hr/payroll`,
    title: (x) => `Payroll ${x.periodLabel || x.period}`, amount: (x) => x.totalNet, date: (x) => x.submittedAt,
  },
  {
    key: 'LEAVE', label: 'Leave Request', roles: ['HR', 'ADMIN'], collection: 'leaves',
    filter: (x) => x.status === 'PENDING', action: 'approveLeave', link: () => `/erp/hr/leaves`,
    title: (x, s) => `${s.employees?.find((e) => e.id === x.empId)?.name || ''} · ${x.type} · ${x.days} day(s)`, date: (x) => x.appliedAt || x.from,
  },
  {
    key: 'EMP_CLAIM', label: 'Reimbursement', roles: ['HR', 'ADMIN', 'FINANCE_HEAD'], collection: 'empClaims',
    filter: (x) => x.status === 'PENDING', action: 'approveEmpClaim', link: () => `/erp/hr/claims`,
    title: (x, s) => `${s.employees?.find((e) => e.id === x.empId)?.name || ''} · ${x.type}`, amount: (x) => x.amount, date: (x) => x.date,
  },
  {
    key: 'WA_CAMPAIGN', label: 'WhatsApp Campaign', roles: ['ADMIN', 'SALES_MANAGER'], collection: 'waCampaigns',
    filter: (x) => x.status === 'PENDING_APPROVAL', action: 'approveWaCampaign', link: () => `/erp/whatsapp/campaigns`,
    title: (x) => x.name, date: (x) => x.submittedAt,
  },
]

export const pendingApprovals = (state, user) => {
  if (!user) return []
  const out = []
  for (const t of APPROVAL_TYPES) {
    if (user.role !== 'ADMIN' && !t.roles.includes(user.role)) continue
    for (const x of state[t.collection] || []) {
      if (!t.filter(x)) continue
      out.push({
        type: t.key,
        label: t.label,
        id: x.id,
        title: t.title(x, state),
        amount: t.amount ? t.amount(x, state) : null,
        amountLabel: t.amount ? fmtINR(t.amount(x, state)) : '',
        date: t.date ? t.date(x) : null,
        by: t.by ? t.by(x) : null,
        action: t.action,
        link: t.link(x),
      })
    }
  }
  return out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}
