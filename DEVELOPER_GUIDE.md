# Btali ERP – Developer Guide

Frontend-only React app (Vite 5, React 18, React Router 6 HashRouter, Zustand with localStorage persistence, Tailwind 3, Recharts, lucide-react, JsBarcode, JSZip).
All data lives in the browser. The UI must behave like a finished product: every button changes state, sends the "email", raises the notification, or downloads the file it claims to.

```
npm run dev      # http://localhost:5173  (already running during development – do not start another)
npm run build
```
Sign in quickly with `http://localhost:5173/?as=u3#/erp/purchase` (user ids in `src/store/seed/core.js → seedUsers`). Password for the login form is `demo123`.

> Environment note: the C: drive is full. Never run `npm install`. If a tool needs temp space use `D:/Northstar project/.tmp`.

## 1. Project map

| Path | What |
|---|---|
| `src/nav.js` | **Single source of truth** for apps, menus, routes, role access. Each menu item maps `path` → `file` under `src/apps`. Every page is mounted at `<path>/*`, so a page can own nested routes. |
| `src/App.jsx` | Router. Lazy-loads every page from `nav.js`. |
| `src/components/ui.jsx` | Design system (Button, Card, PageHeader, Stat, Badge/StatusBadge, Tabs, Segmented, Modal, Drawer, Field/Input/NumberInput/Select/Textarea/Checkbox/Switch/SearchInput/Combobox, FormGrid, EmptyState, DescriptionList, Timeline, Stepper, Progress, Avatar, KV, Alert, ProductImage, Barcode, FileUpload, AttachmentList, MediaGrid, Kanban, SectionTitle, `toast`, `confirm()`, `prompt()`, `openAttachment`). |
| `src/components/DataTable.jsx` | Table with search, filters, sort, pagination, CSV export, bulk selection. |
| `src/components/business.jsx` | ProductCell, PartnerCell, VendorName, UserName, Money, LineItemsEditor, OrderLines, ScanInput, PrintArea + DocHeader (printable documents), TrendChart, BarsChart, DonutChart, FMSBadge, CHART_COLORS. |
| `src/lib/format.js` | fmtINR, fmtCompact, fmtNum, fmtPct, fmtMoney, fmtDate, fmtDateTime, timeAgo, today, addDays, daysAgo, daysBetween, lastMonths, monthLabel, uid, sum, groupBy, byId, round2, exportCSV, parseCSV, downloadText, downloadBlob, fileToAttachment, makeAttachment, fmtSize, titleCase. |
| `src/lib/pricing.js` | `quotePrice(state,{productId,partnerId,qty})`, `priceOrder(state, partnerId, lines)`, `priceListRow`, `mrpFromVendorRate`, `isSchemeLive`. |
| `src/lib/stock.js` | `onHand`, `bookStock` (paid, not invoiced), `available`, `incoming`, `incomingQty`, `pendingOrderQty`, `stockStatus`, `stockValue`, `MAIN_WH='WH-STAREX'`. |
| `src/lib/analytics.js` | `salesLines`, `aggregate`, `monthlySeries`, `fmsMap`, `profitability`, `productDemand`, `forecastDemand`, `reorderRecommendation`, `dealerNudges`, `dateRangePresets`. |
| `src/lib/warranty.js` | `resolveTerms`, `checkWarranty(state, barcodeOrWarrantyNo)` → customer / partner / vendor cover. |
| `src/lib/approvals.js` | `APPROVAL_TYPES` registry + `pendingApprovals(state,user)` (used by My Approvals). |
| `src/store/index.js` | Store + **core actions** (see §3). |
| `src/store/seed/core.js` | Core seed data. `src/store/seed/<module>.js` adds module collections. |
| `src/store/slices/<module>.js` | Module actions. |

## 2. Ownership rules (parallel work)
* Edit **only** the page files you were assigned, plus your own `src/store/slices/<module>.js` and `src/store/seed/<module>.js`. You may add private helper files inside your own page folder (e.g. `src/apps/erp/purchase/_parts.jsx`).
* Do **not** edit `src/store/index.js`, `src/store/seed/core.js`, `src/store/seed/index.js`, `src/components/*`, `src/lib/*`, `src/nav.js`, `src/App.jsx`. If you need a change there, work around it locally and mention it in your final report.
* Module seed: `export const xSeed = (core) => ({ newCollection: [...] })` – return **new** collections only; read core collections from `core` for ids. Never return a key that already exists in core.
* Module slice: `export const xSlice = (set, get) => ({ actionName: (...) => {...} })`. Use the core helpers (`get().addItem`, `get().updateItem`, `get().nextNo`, `get().notify`, `get().sendEmail`, `get().audit`, `get().adjustStock` …). Action names must be unique across modules – prefix if in doubt.

## 3. Core store API (already implemented)
Generic: `addItem(col,item)`, `updateItem(col,id,patch|fn)`, `removeItem(col,id)`, `getItem(col,id)`, `updateSettings(patch)`, `nextNo(key)` (keys: PO SO INV QT SH RFQ EXP GRN TKT WCL RET VB EXPN JV CN DN POS REP CP PAY RCPT CLM PR), `notify({title, body, type:'info'|'warning', link, roles:[], userIds:[], partnerId, vendorId})`, `sendEmail({to, subject, body, attachments, ref, kind})` (appears in Admin → Communication Log), `audit(action, entity, ref)`, `login`, `logout`, `resetDemo`.

Stock & units: `adjustStock(locationId, productId, delta, reason, ref)`, `transferStock(from,to,productId,qty)`, `adjustPartnerStock(partnerId, productId, delta)`, `updateUnits(codes, patch, event, ref)`, `generateBarcodes(poId)` (one per FG unit, one per carton for spares).

Purchase: `createPO({type:'IMPORT'|'DOMESTIC'|'EXPORT', vendorId, lines:[{productId,qty,rate}], note, source, draft, requiresCustomerPayment, linkedSoId, exportOrderId})`, `approvePO(id, ok, remark)`, `uploadPI(poId,{number,amount,file})`, `approvePI(poId, ok, remark)`, `receiveShipment(shipmentId,{lines:[{productId,expected,received}], qcMedia, remarks})` → GRN, stock in, units IN_WAREHOUSE, discrepancy ticket, `computeLandedAllocation(shipmentId, costs, method)` (preview), `finalizeLandedCost(shipmentId, costs, method)` (updates product.landedCost weighted). costs = `{freightINR, insurance, duty, igst, cha, portTransport, other}`; method `VALUE|WEIGHT|VOLUME`.

Sales → payment → invoice → LR: `priceOrder(partnerId, lines)`, `createSalesOrder({partnerId, lines:[{productId,qty}], source:'SALES'|'PORTAL', note, transporterId, quotationId})` (PORTAL → PENDING_REVIEW, else CONFIRMED + confirmation email), `approvePortalOrder(id, ok, remark)`, `cancelSalesOrder(id, reason)`, `sendOrderConfirmation(soId)`, `recordReceipt({soId, amount, mode, ref, date, bankId})` (full payment → SO `PAID`, unlocks linked domestic PO), `createInvoice(soId,{transporterId, vehicleNo})` → `{ok, error, shortages, invoice}` (**blocks when stock is short**; decrements stock; emails client; pushes to Starex; Safex → calls `raiseSafexDebitNote(invoiceId)` if defined), `uploadLR(invoiceId,{lrNo, date, file, vehicleNo})` (DISPATCHED, emails LR, units → partner, partner stock +).

Dealers: `submitDealerOnboarding(data)`, `approveDealer(id, ok, remark)`.
Tickets: `createTicket({source, category, subject, description, partnerId, vendorId, productId, barcode, orderRef, priority, customer, attachments})`, `updateTicket(id,{note, stage, assigneeId, ...})`, `escalateTicketToVendor(id, vendorId, note)`.
Warranty: `registerWarranty({barcode, customer:{name,phone,city,email}, partnerId, saleDate, source, invoiceRef})` → `{ok, error, warranty}`, `createWarrantyClaim({barcode, issue, requestType, partnerId, attachments})`, `decideWarrantyClaim(id, ok, remark)`.
POS: `posCheckout({partnerId, sessionId, lines:[{productId, barcode, qty, price}], payments:[{method, amount}], customer})` → posOrder (stock −, units SOLD, warranties auto-registered).

**Approval contract** – actions referenced by `src/lib/approvals.js` must exist with signature `(id, approved:boolean, remark:string)`:
`approvePO`, `approvePI`, `approvePortalOrder`, `approveDealer`, `decideWarrantyClaim` (core) · `approveContainerPlan` (purchase) · `approveFreight` (procurement) · `approveVendorBill`, `approveExpense` (accounts) · `approvePayroll`, `approveLeave`, `approveEmpClaim` (hr) · `approveWaCampaign` (ai). Field names the registry reads are listed in §4.

## 4. Data model (state keys)
Core (seeded in `seed/core.js`):
* `users` – personas `{id, name, title, role, email, phone, app, username, vendorId?, partnerId?, regions?}`. Roles: ADMIN (Director "Boss"), FINANCE_HEAD ("Madam"), PURCHASE, SALES_MANAGER, SALES_EXEC, DISPATCH, ACCOUNTS, HR, SERVICE, VENDOR, DEALER, FRANCHISE, STAREX.
* `vendors` – `{id, code, name, type:'CHINA'|'INDIA'|'FORWARDER'|'CHA'|'LOGISTICS', subtype, country, city, currency, contact, email, phone, paymentTerms:{advancePct,balancePct,creditDays}, bank, gst, rating, portal, categories}`. Ids: v1–v7 suppliers, fw1–fw6 forwarders (fw3 = GAF Logistics, fw5/fw6 destination), cha1, lg1 Starex 3PL, lg2 Safex, lg3 Shiv Sai Transport.
* `products` – `{id:'p1'..'p40', sku, name, shortName, category, type:'FG'|'SPARE', hsn, gst, uom, vendorId, vendorIds, currency, vendorRate, landedCost, mrp, moq, reorderLevel, maxLevel, leadTimeDays, popularity, weightKg, cbm, cartonQty, warrantyMonths, specs{}, description, bom:[{productId,qty}], parents:[ids], media:[att], active}`. Categories: Pumps, Air Compressors, Vacuum Cleaners, Pressure Washers, Spraying Equipment, Spare Parts.
* `partners` – dealers `d1–d22`, franchise `f1–f4`, export `x1–x3`: `{id, code, name, type:'DEALER'|'FRANCHISE'|'EXPORT', tier, stage:'IN_DECISION'|'CURRENT'|'DEAD', status:'ACTIVE'|'PENDING_APPROVAL'|'PROSPECT'|'INACTIVE'|'REJECTED', city, state, region, address, contact, phone, email, gstin, pan, salespersonId, transporterId, safex, priceListId, extraDiscountPct, paymentTerms, kyc:[att], stock:{productId:qty}, stockMin:{}, stockUpdatedAt, posEnabled, portalAccess, lastOrderDate, compliance?(franchise), country?(export)}`.
* `priceLists` `{id, name, kind, baseDiscountPct, marginPct?, slabs:[{minQty, extraPct}], overrides:{productId:price}, version, publishedAt}` · `schemes` `{id, code, name, type:'SEASONAL'|'COMBO'|'SLAB'|'BOGO', discountPct, minQty, extraPct, comboItems, comboDiscountPct, buyProductId, buyQty, freeProductId, freeQty, from, to, categories, productIds, regions, partnerIds, active, description}`.
* `settings` – `{company, fx:{USD,CNY,INR}, mrpMultiplier, baseDiscountPct, targetMarginPct, exportMarginPct, stockValuationMarkupPct, reorderCycleDay, landedCostMethod, barcodeSeries:{category:{prefix,next}}, series:{...}, alertRules, approvalMatrix, emailTemplates}`.
* `purchaseOrders` – `{id, number, type, vendorId, date, status, currency, lines:[{productId, qty, rate, mrp}], paymentTerms, createdBy, approvedBy, pi:{number, amount, file, uploadedAt, status:'PENDING'|'APPROVED'|'REJECTED', stampedFile}, mrpConfirmed, labelsSent, barcodesGenerated, stickerConfirmed, deliverySchedule:[{id,date,qty,note}], qc:[{id, kind:'photo'|'video', file, caption, status:'PENDING'|'APPROVED'|'REJECTED', remark, uploadedAt}], qcApprovedAt, improvements:[{id,text,date,ack}], packingList:{source, generatedAt, lines:[{productId, qty, cartons, cbm, weight}], scanned:[codes]}, commercialInvoice, docs:[att with docType], shipmentId, rfqId, requiresCustomerPayment, linkedSoId, customerPaid, exportOrderId, vendorDispatch, timeline:[{ts,text}]}`.
  Status flow: `DRAFT → PENDING_APPROVAL → APPROVED (sent to vendor) → PI_RECEIVED → IN_PRODUCTION (PI approved) → QC_PENDING → READY_TO_SHIP (QC approved) → SHIPPED → RECEIVED → CLOSED` (+ REJECTED / CANCELLED).
* `shipments` – `{id, number, poIds, vendorId, forwarderId, indianForwarderId, chaId, containerNo, containerType, blNo, etd, eta, ata, status:'BOOKED'|'IN_TRANSIT'|'AT_PORT'|'CLEARED'|'RECEIVED', telexReleased, milestones:[{key,label,planned,date,done}], freight:{rate,currency}, landedCost:{finalized, method, freightINR, insurance, duty, igst, cha, portTransport, other, allocation}, inward:{grnNo, date, receivedBy, discrepancies:[{productId, expected, received, type:'SHORT'|'EXCESS', note, settled}], qcMedia, remarks, lines}, alerts}`. Milestone keys: VENDOR_DISPATCH, ETD, CAN, IGM, ARRIVED, BOE, CLEARED, TELEX, PORT_TO_WH, INWARD (`SHIPMENT_MILESTONES` export in seed/core.js).
* `salesOrders` – `{id, number, partnerId, date, source:'SALES'|'PORTAL', salespersonId, lines:[{productId, qty, price, mrp, discountPct, discounts, schemeIds, amount, free?}], subtotal, gst, total, appliedSchemes, status:'PENDING_REVIEW'|'CONFIRMED'|'PAID'|'INVOICED'|'DISPATCHED'|'DELIVERED'|'CANCELLED', paymentStatus:'UNPAID'|'PARTIAL'|'PAID', paidAmount, invoiceId, warehouseId, transporterId, note, timeline, history?}` (≈300 historical + 14 open).
* `invoices` – `{id, number, soId, partnerId, date, lines, subtotal, gst, total, transporterId, vehicleNo, status:'ISSUED'|'DISPATCHED', lr:{number,date,file,uploadedBy}|null, sentToStarex, emailed, irn, ewayBill, type:'TAX'|'EXPORT'|'FOC', dispatchDate, units:[codes], safex, freightCost?}` · `receipts` `{id, number, partnerId, soId, amount, mode, ref, date, bankId}`.
* `locations` (WH-STAREX, WH-GUJ virtual, WH-TRANSIT) · `stock` `{[locationId]:{[productId]:qty}}` · `stockMoves` · `transporters` `{id, name, contact, phone, vehicleNo, isSafex, regions}` (t1 = Safex).
* `units` (barcodes) `{code, productId, poId, vendorId, status:'GENERATED'|'PACKED'|'IN_TRANSIT'|'IN_WAREHOUSE'|'INVOICED'|'AT_PARTNER'|'SOLD'|'RETURNED'|'REPLACED', locationId, partnerId, invoiceId, saleDate, history:[{ts,event,ref}]}`.
* `warranties` `{id, number, barcode, productId, partnerId, customer:{name,phone,city,email}, saleDate, startDate, endDate, months, partnerMonths, vendorMonths, source, invoiceRef, status}` · `warrantyRules` `{id, scope:'CATEGORY'|'VENDOR'|'PARTNER'|'PRODUCT', ref, months, partnerMonths, vendorMonths, exclusions, extended}` · `warrantyClaims` `{id, number, warrantyId, barcode, productId, partnerId, issue, requestType:'REPAIR'|'REPLACEMENT', status:'SUBMITTED'|'UNDER_REVIEW'|'APPROVED'|'REJECTED'|'VENDOR_ESCALATED'|'CLOSED', bearer:'BTALI'|'VENDOR', cost, replacementBarcode, vendorClaim:{vendorId,status,response,sentAt,docs}, ticketId, timeline}`.
* `tickets` `{id, number, source:'DEALER'|'FRANCHISE'|'VENDOR'|'STAREX'|'INTERNAL'|'WEBSITE'|'TOLL_FREE', category:'PRODUCT_DEFECT'|'INSTALLATION'|'SPARE_REQUIREMENT'|'WARRANTY_CLAIM'|'GENERAL'|'DAMAGE_IN_TRANSIT'|'SHORTAGE'|'MISLABEL'|'VENDOR_ISSUE', subject, description, partnerId, vendorId, productId, barcode, orderRef, priority:'LOW'|'MEDIUM'|'HIGH', stage:'LOGGED'|'UNDER_REVIEW'|'IN_PROGRESS'|'RESOLVED'|'CLOSED', assigneeId, slaHours, createdAt, resolvedAt, updates:[{ts,by,text,stage}], attachments, escalatedToVendor, vendorResponse, customer, claimId}`.
* `notifications`, `emails`, `auditLog`, `session`.

Module collections (each owned by one module seed; other modules may read/add at runtime with the same shape):
* purchase: `containerPlans {id, number, name, containerType:'20FT'|'40FT'|'40HC', capacityCbm, maxWeightKg, items:[{poId, productId, qty, cbm, weight, priority:'URGENT'|'NORMAL'}], status:'DRAFT'|'PENDING_APPROVAL'|'APPROVED'|'REJECTED', submittedAt, approvedBy, utilizationPct, weightPct, notes}`.
* procurement: `freightRfqs {id, number, route, poIds, shipmentId, containerType, quotes:[{id, forwarderId, rate, currency, transitDays, freeDays, extraCharges, validity, remarks}], recommendedQuoteId, selectedForwarderId, status:'OPEN'|'PENDING_APPROVAL'|'APPROVED'|'REJECTED', submittedAt, approvedAt, approvedBy}` · `exportOrders {id, number, customerId, date, currency:'USD', fxRate, marginPct, lines:[{productId, qty, vendorCost, price}], total, status:'QUOTED'|'ADVANCE_RECEIVED'|'PO_RELEASED'|'IN_PRODUCTION'|'SHIPPED'|'DELIVERED'|'CLOSED', advancePct, advanceReceived, fullPaid, poId, legs:[{leg:'CHINA'|'INDIA'|'DESTINATION', forwarderId, milestones:[{label, planned, date, done}]}], telexReleased, invoiceNo, fxGainLoss}` · `priceListVersions`.
* vendor: (vendor-side actions on `purchaseOrders`; may add `vendorDocs`).
* sales: `quotations {id, number, partnerId, date, validTill, lines, subtotal, gst, total, status:'DRAFT'|'SENT'|'ACCEPTED'|'EXPIRED'|'CONVERTED', soId}` · `tasks {id, title, type:'VISIT'|'FOLLOW_UP'|'COLLECTION'|'CALL'|'DEMO', partnerId, soId, assigneeId, dueDate, status:'OPEN'|'DONE', priority, notes, outcome, completedAt, createdBy, location}` · `targets {id, ownerType:'DEALER'|'SALESPERSON', ownerId, periodType:'MONTH'|'QUARTER', period, amount, slabs:[{achievePct, incentivePct}]}`.
* dispatch: `returns {id, number, invoiceId, partnerId, lines:[{productId, qty, barcode}], type:'REPAIR'|'REPLACEMENT'|'DISCOUNT', reason, status:'LOGGED'|'IN_PROCESS'|'CLOSED', focInvoiceNo, date}` · `misUploads {id, source:'STAREX'|'SAFEX'|'GAF', kind:'WEEKLY_TRUCK'|'MONTHLY_MIS'|'INVOICE', period, fileName, rows:[...], results:[{ref, status:'MATCH'|'MISMATCH'|'MISSING'|'EXTRA', note, amount}], uploadedBy, uploadedAt, status}`.
* accounts: `vendorBills {id, number, vendorId, vendorRef, poId, shipmentId, date, dueDate, currency, amount, fxRate, amountINR, gst, tds, category:'SUPPLIER'|'FREIGHT'|'CHA'|'WAREHOUSE'|'TRANSPORT'|'OTHER', status:'PENDING_BOSS'|'APPROVED'|'REJECTED'|'PAID', bossApprovedAt, paidAt, paymentRef, swift, attachments, history}` · `expenses {id, number, date, category, description, amount, recurring, frequency, status:'PENDING_APPROVAL'|'APPROVED'|'PAID'|'REJECTED', attachments}` · `notes {id, number, type:'CREDIT'|'DEBIT', partnerId, vendorId, invoiceId, amount, gst, reason, source:'SAFEX'|'RETURN'|'MANUAL'|'DISCREPANCY', date, status}` · `bankAccounts` (**must include `bk1` HDFC current a/c and `bk2`**) · `bankStatements` · `journals` · `chartOfAccounts` · `assets` · `loans` · `wrongWorkings`.
* hr: `employees {id, code, name, userId?, dept, designation, doj, ...}` (link internal users via `userId` for self-service) · `attendance` · `shifts` · `leaves {id, empId, type, from, to, days, reason, status:'PENDING'|'APPROVED'|'REJECTED', appliedAt}` · `leaveBalances` · `salaryStructures` · `payrollRuns {id, period, periodLabel, status:'DRAFT'|'PENDING_APPROVAL'|'APPROVED'|'PAID', slips, totalNet, submittedAt}` · `empClaims {id, empId, type, date, amount, status:'PENDING'|'APPROVED'|'REJECTED'|'PAID'}` · `empLoans`.
* portals: `carts {[partnerId]: [{productId, qty}]}` (sidebar badge reads `state.carts[partnerId].length`) · `posSessions` · `posOrders` · `replenishments`.
* ai: `aiLeads`, `aiCampaigns`, `aiCalls`, `aiScripts`, `aiAppointments`, `aiSettings`, `waConversations`, `waContacts`, `waCampaigns {…, status:'DRAFT'|'PENDING_APPROVAL'|'APPROVED'|'SCHEDULED'|'SENT'|'REJECTED', submittedAt}`, `waKnowledge`.
* admin/management: (alert rule edits live in `settings.alertRules`).

## 5. UI conventions
* Page skeleton: `<PageHeader title subtitle actions/>` → KPI `<Grid cols={4}><Stat/></Grid>` → `<Card>`s / `<DataTable>`. Detail views open in a `Drawer` or a nested route (`<Routes><Route index …/><Route path=":id" …/></Routes>` inside the page; use `useParams`, `useNavigate`, `useSearchParams`).
* Forms in `Modal`/`Drawer` with `FormGrid` + `Field`. Validate required fields; show `toast.success(...)` after each action, `toast.error` on failure. Destructive/irreversible steps use `await confirm({...})`; reject/hold reasons use `await prompt({title, label, required:true})`.
* Status chips: `<StatusBadge status="IN_TRANSIT"/>`. Money: `fmtINR`/`fmtCompact`; dates: `fmtDate`. Indian number formatting everywhere.
* Read state with selectors: `const pos = useStore(s => s.purchaseOrders)`; actions: `const approvePO = useStore(s => s.approvePO)`. For derived data use `useMemo`. Lookups: `useLookup()`. Current user: `useUser()`.
* Portal pages must scope data to the signed-in party: `user.partnerId` (dealer/franchise) or `user.vendorId` (vendor).
* Copy must read like a shipped product for Btali: no "mock", "demo", "prototype", "placeholder", "lorem", "TODO", "coming soon". No `alert()`/`window.confirm`. No dead buttons.
* Responsive down to 375 px (tables scroll horizontally inside their card; grids collapse).
* Charts: use the wrappers in `business.jsx` (`TrendChart`, `BarsChart`, `DonutChart`) or Recharts with `CHART_COLORS`.
* Generated documents (PO, invoice, payslip, label sheets…) use `PrintArea` + `DocHeader`; downloads use `exportCSV`/`downloadText`/`downloadBlob`; ZIP via `import JSZip from 'jszip'`.
* Uploads: `<FileUpload onFiles={(atts)=>…}/>` returns attachment objects to store on records; show them with `AttachmentList` / `MediaGrid`.
* Barcode scanning: `<ScanInput onScan={code=>…} suggestions={[codes…]}/>` (hardware scanners type + Enter; "Simulate scan" picks a valid code).

## 6. Verifying your work
Dev server runs on http://localhost:5173. Smoke-test your routes (from Git Bash):
```
cd "/d/Northstar project/.tools" && MSYS_NO_PATHCONV=1 node smoke.mjs http://localhost:5173 <userId> /erp/purchase /erp/purchase/orders ...
```
It reports console errors, page errors, crashes (error boundary) and blank pages. Screenshot a page to check layout:
```
MSYS_NO_PATHCONV=1 node shot.mjs http://localhost:5173 <userId> /erp/purchase "D:/Northstar project/.tmp/<name>.png" [width]
```
then view the PNG. Fix every reported problem. Do not run `vite build` (another agent may be building); the smoke test compiles your modules through the dev server.
