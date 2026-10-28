// Single source of truth for apps, menus, routes and role access.
// Each item: { label, path (relative to app base), file (under src/apps, no ext), icon, roles? }
import {
  LayoutDashboard, CheckSquare, Bell, Users, Settings, Upload, Mail, Package, Building2, Truck, MapPin, ShieldCheck, Boxes, ScanSearch, ArrowLeftRight,
  ShoppingCart, AlertTriangle, FileText, Tag, Barcode, ClipboardCheck, Ship, Container, Scale, Calculator, FolderArchive, PackageCheck, ListOrdered, Globe2, BarChart3,
  Gauge, UserPlus, KanbanSquare, Contact, BadgePercent, Gift, Target, FileSignature, ClipboardList, Lightbulb, ListTodo, PieChart, Receipt, Send, CalendarClock, GitCompare, RotateCcw, Split,
  Wallet, FileInput, CreditCard, HandCoins, FileSearch, Banknote, BookOpen, Landmark, Percent, HardDrive, PiggyBank, FileBarChart, UserCog, Clock, CalendarDays, Layers, Coins, ReceiptText, HandHeart, Activity,
  TrendingUp, Brain, Award, Wrench, Ticket, ShieldAlert, Headphones, Store, PhoneCall, Megaphone, PhoneIncoming, FileCode2, Smartphone, MessageCircle, MessagesSquare, History, Clock4, BookMarked,
  LineChart, User, Factory, Warehouse, Search, ScrollText, Home,
} from 'lucide-react'

export const ROLE_LABEL = {
  ADMIN: 'Director', FINANCE_HEAD: 'Finance Head', PURCHASE: 'Purchase', SALES_MANAGER: 'Sales Manager', SALES_EXEC: 'Sales Executive', DISPATCH: 'Dispatch',
  ACCOUNTS: 'Accounts', HR: 'HR', SERVICE: 'Service', VENDOR: 'Vendor', DEALER: 'Dealer', FRANCHISE: 'Franchise', STAREX: 'Starex Warehouse',
}

// modules visible per role inside the internal ERP
export const ROLE_MODULES = {
  ADMIN: '*',
  FINANCE_HEAD: ['home', 'common', 'accounts', 'management', 'inventory', 'masters', 'hr', 'purchase-view', 'me'],
  PURCHASE: ['home', 'common', 'purchase', 'purchase-view', 'masters', 'inventory', 'service', 'management-planner', 'me'],
  SALES_MANAGER: ['home', 'common', 'sales', 'inventory', 'service', 'franchise', 'management', 'ai', 'ai-mobile', 'masters', 'purchase-view', 'me'],
  SALES_EXEC: ['home', 'common', 'sales', 'inventory', 'ai-mobile', 'purchase-view', 'me'],
  DISPATCH: ['home', 'common', 'dispatch', 'inventory', 'masters', 'service', 'purchase-view', 'me'],
  ACCOUNTS: ['home', 'common', 'accounts', 'inventory', 'purchase-view', 'masters', 'me'],
  HR: ['home', 'common', 'hr', 'me'],
  SERVICE: ['home', 'common', 'service', 'inventory', 'me'],
}

export const APPS = {
  erp: {
    key: 'erp', base: '/erp', name: 'Btali ERP', tagline: 'Internal operations', roles: ['ADMIN', 'FINANCE_HEAD', 'PURCHASE', 'SALES_MANAGER', 'SALES_EXEC', 'DISPATCH', 'ACCOUNTS', 'HR', 'SERVICE'],
    sections: [
      { label: 'Overview', module: 'home', items: [
        { label: 'Home', path: 'home', file: 'erp/common/Home', icon: Home },
        { label: 'My Approvals', path: 'approvals', file: 'erp/common/Approvals', icon: CheckSquare, badge: 'approvals' },
        { label: 'Notifications & Alerts', path: 'notifications', file: 'erp/common/Notifications', icon: Bell },
      ] },
      { label: 'Management', module: 'management', items: [
        { label: 'Executive Dashboard', path: 'management', file: 'erp/management/Executive', icon: Gauge },
        { label: 'Product Profitability', path: 'management/profitability', file: 'erp/management/Profitability', icon: TrendingUp },
        { label: 'Container Profitability', path: 'management/containers', file: 'erp/management/ContainerProfit', icon: Container },
        { label: 'Demand Analytics', path: 'management/demand', file: 'erp/management/Demand', icon: LineChart },
        { label: 'AI Procurement Planner', path: 'management/planner', file: 'erp/management/Planner', icon: Brain, module: 'management-planner' },
        { label: 'Dealer & Logistics Perf.', path: 'management/performance', file: 'erp/management/Performance', icon: Award },
      ] },
      { label: 'Purchase', module: 'purchase', items: [
        { label: 'Purchase Dashboard', path: 'purchase', file: 'erp/purchase/Dashboard', icon: LayoutDashboard },
        { label: 'Reorder Alerts', path: 'purchase/reorder', file: 'erp/purchase/Reorder', icon: AlertTriangle },
        { label: 'Purchase Orders', path: 'purchase/orders', file: 'erp/purchase/Orders', icon: ShoppingCart },
        { label: 'MRP & Labels', path: 'purchase/mrp-labels', file: 'erp/purchase/MrpLabels', icon: Tag },
        { label: 'Barcodes & Stickers', path: 'purchase/barcodes', file: 'erp/purchase/Barcodes', icon: Barcode },
        { label: 'QC Review', path: 'purchase/qc', file: 'erp/purchase/QCReview', icon: ClipboardCheck },
        { label: 'Import Shipments & ETA', path: 'purchase/shipments', file: 'erp/purchase/Shipments', icon: Ship, module: 'purchase-view' },
        { label: 'Container Planning', path: 'purchase/container-planning', file: 'erp/purchase/ContainerPlanning', icon: Container },
        { label: 'Freight Comparison', path: 'purchase/freight', file: 'erp/purchase/Freight', icon: Scale },
        { label: 'Customs & Landed Cost', path: 'purchase/landed-cost', file: 'erp/purchase/LandedCost', icon: Calculator },
        { label: 'Order Documents', path: 'purchase/documents', file: 'erp/purchase/Documents', icon: FolderArchive, module: 'purchase-view' },
        { label: 'Inward & Discrepancies', path: 'purchase/inward', file: 'erp/purchase/Inward', icon: PackageCheck },
        { label: 'Price List Generator', path: 'purchase/price-lists', file: 'erp/purchase/PriceLists', icon: ListOrdered },
        { label: 'Export Orders', path: 'purchase/exports', file: 'erp/purchase/Exports', icon: Globe2 },
        { label: 'Purchase Reports', path: 'purchase/reports', file: 'erp/purchase/Reports', icon: BarChart3 },
      ] },
      { label: 'Sales', module: 'sales', items: [
        { label: 'Sales Dashboard', path: 'sales', file: 'erp/sales/Dashboard', icon: LayoutDashboard },
        { label: 'Sales Orders', path: 'sales/orders', file: 'erp/sales/Orders', icon: ShoppingCart },
        { label: 'Quotations', path: 'sales/quotations', file: 'erp/sales/Quotations', icon: FileSignature },
        { label: 'Dealer 360', path: 'sales/dealers', file: 'erp/sales/Dealers', icon: Contact },
        { label: 'Dealer Pipeline', path: 'sales/pipeline', file: 'erp/sales/Pipeline', icon: KanbanSquare },
        { label: 'Dealer Onboarding', path: 'sales/onboarding', file: 'erp/sales/Onboarding', icon: UserPlus },
        { label: 'Price Lists & Discounts', path: 'sales/pricing', file: 'erp/sales/Pricing', icon: BadgePercent },
        { label: 'Schemes & Promotions', path: 'sales/schemes', file: 'erp/sales/Schemes', icon: Gift },
        { label: 'Targets & Incentives', path: 'sales/targets', file: 'erp/sales/Targets', icon: Target },
        { label: 'Reorder Nudges', path: 'sales/nudges', file: 'erp/sales/Nudges', icon: Lightbulb },
        { label: 'Sales Tasks', path: 'sales/tasks', file: 'erp/sales/Tasks', icon: ListTodo },
        { label: 'Sales Reports', path: 'sales/reports', file: 'erp/sales/Reports', icon: PieChart },
      ] },
      { label: 'Dispatch', module: 'dispatch', items: [
        { label: 'Dispatch Dashboard', path: 'dispatch', file: 'erp/dispatch/Dashboard', icon: LayoutDashboard },
        { label: 'Sales Invoices', path: 'dispatch/invoices', file: 'erp/dispatch/Invoices', icon: Receipt },
        { label: 'Dispatch & LR', path: 'dispatch/lr', file: 'erp/dispatch/LR', icon: Send },
        { label: 'Daily Dispatch Schedule', path: 'dispatch/schedule', file: 'erp/dispatch/Schedule', icon: CalendarClock },
        { label: 'Starex Reconciliation', path: 'dispatch/reconciliation', file: 'erp/dispatch/Reconciliation', icon: GitCompare },
        { label: 'Returns & FOC', path: 'dispatch/returns', file: 'erp/dispatch/Returns', icon: RotateCcw },
        { label: 'Safex & Special Flows', path: 'dispatch/special', file: 'erp/dispatch/SpecialFlows', icon: Split },
      ] },
      { label: 'Accounts', module: 'accounts', items: [
        { label: 'Accounts Dashboard', path: 'accounts', file: 'erp/accounts/Dashboard', icon: LayoutDashboard },
        { label: 'Vendor Bills', path: 'accounts/vendor-bills', file: 'erp/accounts/VendorBills', icon: FileInput },
        { label: 'Payment Dashboard', path: 'accounts/payments', file: 'erp/accounts/Payments', icon: CreditCard },
        { label: 'Customer Receipts', path: 'accounts/receipts', file: 'erp/accounts/Receipts', icon: HandCoins },
        { label: 'Logistics Reconciliation', path: 'accounts/reconciliation', file: 'erp/accounts/Reconciliation', icon: FileSearch },
        { label: 'Expenses', path: 'accounts/expenses', file: 'erp/accounts/Expenses', icon: Wallet },
        { label: 'Journals & Vouchers', path: 'accounts/journals', file: 'erp/accounts/Journals', icon: BookOpen },
        { label: 'Banking', path: 'accounts/banking', file: 'erp/accounts/Banking', icon: Landmark },
        { label: 'Credit / Debit Notes', path: 'accounts/notes', file: 'erp/accounts/Notes', icon: ScrollText },
        { label: 'Chart of Accounts & Ledgers', path: 'accounts/ledgers', file: 'erp/accounts/Ledgers', icon: Banknote },
        { label: 'GST, TDS & e-Invoicing', path: 'accounts/tax', file: 'erp/accounts/Tax', icon: Percent },
        { label: 'Fixed Assets', path: 'accounts/assets', file: 'erp/accounts/Assets', icon: HardDrive },
        { label: 'Loans & Bank Balances', path: 'accounts/loans', file: 'erp/accounts/Loans', icon: PiggyBank },
        { label: 'Financial & MIS Reports', path: 'accounts/reports', file: 'erp/accounts/Reports', icon: FileBarChart },
      ] },
      { label: 'Inventory', module: 'inventory', items: [
        { label: 'Stock Overview', path: 'inventory/stock', file: 'erp/inventory/Stock', icon: Boxes },
        { label: 'Barcode Traceability', path: 'inventory/trace', file: 'erp/inventory/Trace', icon: ScanSearch },
        { label: 'Stock Moves & Transfers', path: 'inventory/moves', file: 'erp/inventory/Moves', icon: ArrowLeftRight },
      ] },
      { label: 'Service & Warranty', module: 'service', items: [
        { label: 'Service Ticket Desk', path: 'service/tickets', file: 'erp/service/Tickets', icon: Ticket },
        { label: 'Warranty Registry', path: 'service/warranties', file: 'erp/service/Warranties', icon: ShieldCheck },
        { label: 'Warranty Claims', path: 'service/claims', file: 'erp/service/Claims', icon: ShieldAlert },
        { label: 'Vendor Escalations', path: 'service/escalations', file: 'erp/service/Escalations', icon: Factory },
        { label: 'Service Reports', path: 'service/reports', file: 'erp/service/Reports', icon: BarChart3 },
      ] },
      { label: 'Franchise', module: 'franchise', items: [
        { label: 'Franchise Network', path: 'franchise', file: 'erp/franchise/Network', icon: Store },
      ] },
      { label: 'HR & Payroll', module: 'hr', items: [
        { label: 'Employees', path: 'hr/employees', file: 'erp/hr/Employees', icon: UserCog },
        { label: 'Attendance & Shifts', path: 'hr/attendance', file: 'erp/hr/Attendance', icon: Clock },
        { label: 'Leave Management', path: 'hr/leaves', file: 'erp/hr/Leaves', icon: CalendarDays },
        { label: 'Salary Structures', path: 'hr/salary-structures', file: 'erp/hr/SalaryStructures', icon: Layers },
        { label: 'Payroll', path: 'hr/payroll', file: 'erp/hr/Payroll', icon: Coins },
        { label: 'Reimbursements', path: 'hr/claims', file: 'erp/hr/Claims', icon: ReceiptText },
        { label: 'Loans & Advances', path: 'hr/loans', file: 'erp/hr/Loans', icon: HandHeart },
        { label: 'HR Reports', path: 'hr/reports', file: 'erp/hr/Reports', icon: Activity },
      ] },
      { label: 'AI Calling Bot', module: 'ai', phase: 2, items: [
        { label: 'Calling Dashboard', path: 'ai-calling', file: 'erp/ai/CallDashboard', icon: PhoneCall },
        { label: 'Leads', path: 'ai-calling/leads', file: 'erp/ai/Leads', icon: Users },
        { label: 'Call Campaigns', path: 'ai-calling/campaigns', file: 'erp/ai/CallCampaigns', icon: Megaphone },
        { label: 'Call Logs', path: 'ai-calling/calls', file: 'erp/ai/CallLogs', icon: PhoneIncoming },
        { label: 'Business Info & Scripts', path: 'ai-calling/scripts', file: 'erp/ai/Scripts', icon: FileCode2 },
        { label: 'Calling Reports', path: 'ai-calling/reports', file: 'erp/ai/CallReports', icon: BarChart3 },
        { label: 'Calling Settings', path: 'ai-calling/settings', file: 'erp/ai/CallSettings', icon: Settings },
        { label: 'Sales Mobile App', path: 'ai-calling/mobile', file: 'erp/ai/SalesMobile', icon: Smartphone, module: 'ai-mobile' },
      ] },
      { label: 'WhatsApp Chatbot', module: 'ai', phase: 2, items: [
        { label: 'WhatsApp Dashboard', path: 'whatsapp', file: 'erp/whatsapp/Dashboard', icon: MessageCircle },
        { label: 'Live Conversations', path: 'whatsapp/inbox', file: 'erp/whatsapp/Inbox', icon: MessagesSquare },
        { label: 'Chat History & Customers', path: 'whatsapp/history', file: 'erp/whatsapp/History', icon: History },
        { label: 'Campaigns & Contacts', path: 'whatsapp/campaigns', file: 'erp/whatsapp/Campaigns', icon: Megaphone },
        { label: 'Broadcast Scheduler', path: 'whatsapp/scheduler', file: 'erp/whatsapp/Scheduler', icon: Clock4 },
        { label: 'Knowledge Base & FAQ', path: 'whatsapp/knowledge', file: 'erp/whatsapp/Knowledge', icon: BookMarked },
        { label: 'WhatsApp Analytics', path: 'whatsapp/analytics', file: 'erp/whatsapp/Analytics', icon: BarChart3 },
      ] },
      { label: 'Masters', module: 'masters', items: [
        { label: 'Products & Spares', path: 'masters/products', file: 'erp/masters/Products', icon: Package },
        { label: 'Vendors & Logistics', path: 'masters/vendors', file: 'erp/masters/Vendors', icon: Building2 },
        { label: 'Transport Master', path: 'masters/transporters', file: 'erp/masters/Transporters', icon: Truck },
        { label: 'Warehouses & Locations', path: 'masters/locations', file: 'erp/masters/Locations', icon: MapPin },
        { label: 'Warranty Terms', path: 'masters/warranty-terms', file: 'erp/masters/WarrantyTerms', icon: ShieldCheck },
      ] },
      { label: 'My Self-Service', module: 'me', phase: 2, items: [
        { label: 'My Payslips', path: 'me/payslips', file: 'erp/me/Payslips', icon: Receipt },
        { label: 'Apply Leave', path: 'me/leave', file: 'erp/me/Leave', icon: CalendarDays },
        { label: 'My Claims', path: 'me/claims', file: 'erp/me/Claims', icon: ReceiptText },
        { label: 'My Profile', path: 'me/profile', file: 'erp/me/Profile', icon: User },
      ] },
      { label: 'Administration', module: 'admin', items: [
        { label: 'Users & Roles', path: 'admin/users', file: 'erp/admin/Users', icon: Users },
        { label: 'System Configuration', path: 'admin/settings', file: 'erp/admin/Settings', icon: Settings },
        { label: 'Data Import & Migration', path: 'admin/import', file: 'erp/admin/Import', icon: Upload },
        { label: 'Communication Log', path: 'admin/outbox', file: 'erp/admin/Outbox', icon: Mail },
      ] },
    ],
  },
  vendor: {
    key: 'vendor', base: '/vendor', name: 'Vendor Portal', tagline: 'For Btali manufacturing partners', roles: ['VENDOR'],
    sections: [{ label: 'Vendor', items: [
      { label: 'Dashboard', path: 'dashboard', file: 'vendor/Dashboard', icon: LayoutDashboard },
      { label: 'Purchase Orders', path: 'orders', file: 'vendor/Orders', icon: ShoppingCart },
      { label: 'Scan-to-Pack', path: 'scan-pack', file: 'vendor/ScanPack', icon: ScanSearch },
      { label: 'Tickets & Warranty', path: 'tickets', file: 'vendor/Tickets', icon: Ticket },
      { label: 'Company Profile', path: 'profile', file: 'vendor/Profile', icon: Building2 },
    ] }],
  },
  dealer: {
    key: 'dealer', base: '/dealer', name: 'Dealer Portal', tagline: 'Btali dealer network', roles: ['DEALER'],
    sections: [{ label: 'Dealer', items: [
      { label: 'Dashboard', path: 'dashboard', file: 'dealer/Dashboard', icon: LayoutDashboard },
      { label: 'Product Catalog', path: 'catalog', file: 'dealer/Catalog', icon: Package },
      { label: 'Pricing & Schemes', path: 'pricing', file: 'dealer/Pricing', icon: BadgePercent },
      { label: 'Cart & Checkout', path: 'cart', file: 'dealer/Cart', icon: ShoppingCart, badge: 'cart' },
      { label: 'My Orders', path: 'orders', file: 'dealer/Orders', icon: ClipboardList },
      { label: 'Documents', path: 'documents', file: 'dealer/Documents', icon: FolderArchive },
      { label: 'My Stock', path: 'stock', file: 'dealer/Stock', icon: Boxes },
      { label: 'Complaints & Service', path: 'support', file: 'dealer/Support', icon: Headphones },
      { label: 'Warranty', path: 'warranty', file: 'dealer/Warranty', icon: ShieldCheck },
      { label: 'Reports', path: 'reports', file: 'dealer/Reports', icon: BarChart3 },
      { label: 'Profile & KYC', path: 'profile', file: 'dealer/Profile', icon: User },
    ] }],
  },
  franchise: {
    key: 'franchise', base: '/franchise', name: 'Franchise Portal', tagline: 'Btali company stores', roles: ['FRANCHISE'],
    sections: [
      { label: 'Store', items: [
        { label: 'Store Dashboard', path: 'dashboard', file: 'franchise/Dashboard', icon: LayoutDashboard },
        { label: 'POS Checkout', path: 'pos', file: 'franchise/POS', icon: Store },
        { label: 'POS Sessions', path: 'sessions', file: 'franchise/Sessions', icon: Clock },
        { label: 'Stock Inward (Scan)', path: 'inward', file: 'franchise/Inward', icon: PackageCheck },
        { label: 'Replenishment', path: 'replenishment', file: 'franchise/Replenishment', icon: RotateCcw },
        { label: 'Store Reports', path: 'reports', file: 'franchise/Reports', icon: BarChart3 },
      ] },
      { label: 'Ordering & Support', items: [
        { label: 'Product Catalog', path: 'catalog', file: 'dealer/Catalog', icon: Package },
        { label: 'Cart & Checkout', path: 'cart', file: 'dealer/Cart', icon: ShoppingCart, badge: 'cart' },
        { label: 'Orders', path: 'orders', file: 'dealer/Orders', icon: ClipboardList },
        { label: 'Documents', path: 'documents', file: 'dealer/Documents', icon: FolderArchive },
        { label: 'Store Stock', path: 'stock', file: 'dealer/Stock', icon: Boxes },
        { label: 'Service Requests', path: 'support', file: 'dealer/Support', icon: Headphones },
        { label: 'Warranty', path: 'warranty', file: 'dealer/Warranty', icon: ShieldCheck },
        { label: 'Profile', path: 'profile', file: 'dealer/Profile', icon: User },
      ] },
    ],
  },
  starex: {
    key: 'starex', base: '/starex', name: 'Starex Warehouse Portal', tagline: 'Btali desk at Starex 3PL', roles: ['STAREX'],
    sections: [{ label: 'Warehouse', items: [
      { label: 'Dashboard', path: 'dashboard', file: 'starex/Dashboard', icon: LayoutDashboard },
      { label: 'Upcoming Containers', path: 'containers', file: 'starex/Containers', icon: Ship },
      { label: 'Goods Inward & QC', path: 'inward', file: 'starex/Inward', icon: PackageCheck },
      { label: 'Dispatch Schedule', path: 'schedule', file: 'starex/Schedule', icon: CalendarClock },
      { label: 'LR Upload', path: 'lr', file: 'starex/LR', icon: Send },
      { label: 'MIS Upload', path: 'mis', file: 'starex/MIS', icon: Upload },
      { label: 'Stock on Hand', path: 'stock', file: 'starex/Stock', icon: Warehouse },
      { label: 'Complaints', path: 'complaints', file: 'starex/Complaints', icon: AlertTriangle },
    ] }],
  },
  site: {
    key: 'site', base: '/site', name: 'btali.in', tagline: 'Customer self-service', roles: [], public: true,
    sections: [{ label: 'Customer', items: [
      { label: 'Home', path: 'home', file: 'site/Home', icon: Home },
      { label: 'Verify Warranty', path: 'warranty', file: 'site/Warranty', icon: ShieldCheck },
      { label: 'Request Service', path: 'service', file: 'site/Service', icon: Wrench },
      { label: 'Track Request', path: 'track', file: 'site/Track', icon: Search },
      { label: 'Invoice & LR Download', path: 'documents', file: 'site/Documents', icon: FileText },
    ] }],
  },
}

export const canSeeModule = (role, module) => {
  const m = ROLE_MODULES[role]
  if (!m) return false
  if (m === '*') return true
  return m.includes(module)
}

/** Visible sections/items for a user in an app */
export const navFor = (appKey, user) => {
  const app = APPS[appKey]
  if (appKey !== 'erp') return app.sections
  return app.sections
    .map((s) => ({ ...s, items: s.items.filter((it) => canSeeModule(user?.role, it.module || s.module)) }))
    .filter((s) => s.items.length)
}

export const homePathFor = (user) => {
  if (!user) return '/login'
  if (user.role === 'VENDOR') return '/vendor/dashboard'
  if (user.role === 'DEALER') return '/dealer/dashboard'
  if (user.role === 'FRANCHISE') return '/franchise/dashboard'
  if (user.role === 'STAREX') return '/starex/dashboard'
  return '/erp/home'
}
