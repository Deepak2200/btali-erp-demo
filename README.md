# Btali ERP – Connected Platform Demo

A frontend demo of the Btali International ERP: one platform covering imports from China factories through the Starex warehouse to dealers, franchise stores, exports and end-customer warranty service.

It runs entirely in the browser (React 18 + Vite, Zustand persisted to `localStorage`) with a year of realistic sample data, so every screen and workflow can be demonstrated without a backend.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Sign in by picking a user on the login screen (password for the form is `demo123`), or deep-link: `http://localhost:5173/?as=u3#/erp/purchase`.
Use **Reset demo data** in the user menu to restore the original sample data.

## What's inside

| Portal | Users | Highlights |
|---|---|---|
| **ERP** (`/erp`) | Director, Finance Head, Purchase, Sales, Dispatch, Accounts, HR, Service | Purchase & imports (PO → PI → QC → container planning → freight → landed cost → inward), Sales (orders, schemes, Dealer 360, CRM pipeline, targets), Dispatch (stock-checked invoicing, LR, Starex reconciliation, returns/FOC, Safex), Accounts (double-entry books, GST/TDS, banking, P&L/BS), HR & payroll, Service & warranty, Management analytics & AI procurement planner, AI calling bot, WhatsApp chatbot, My Approvals |
| **Vendor Portal** (`/vendor`) | China suppliers | PI upload, stickers & barcodes, QC uploads, scan-to-pack packing list, escalations |
| **Dealer Portal** (`/dealer`) | Dealers | Catalog with live price & stock, cart with schemes, orders & payment advice, documents, warranty registration |
| **Franchise Portal** (`/franchise`) | Btali stores | POS with sessions & split payments, barcode inward, replenishment |
| **Starex Portal** (`/starex`) | Warehouse desk | Container inward & GRN, dispatch schedule, LR upload, MIS upload |
| **btali.in** (`/site`) | Customers (no login) | Warranty verification, service requests, ticket tracking, invoice/LR download |

## Suggested demo walk-throughs

- **Director (u1):** Home → My Approvals → Executive Dashboard → Product Profitability → AI Procurement Planner.
- **Purchase (u3):** Reorder Alerts → raise PO → approve PI with digital stamp → QC Review → Container Planning → Landed Cost.
- **Sales (u4):** Orders → confirm a portal order → new order with schemes & stock check → Dealer 360 → Pipeline.
- **Dispatch (u8):** Invoices (try `so_open_14` – blocked for insufficient stock) → LR → Reconciliation.
- **Finance (u2):** Payments → pay an approved supplier bill with SWIFT copy; HR payroll approval.
- **Dealer (u14) / Franchise (u16):** place an order and share UTR; open a POS session, scan, sell, close session.
- **Vendor (u12):** Scan-to-Pack → generate packing list.
- **Customer:** `/site/warranty` → verify `SPRY001007` → raise a service request → track it.

See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for architecture, data model and conventions.
