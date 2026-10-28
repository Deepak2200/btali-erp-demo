// Core seed: masters, partners, users, purchase pipeline, sales history, units, warranties, tickets.
// All dates are relative to "today" so the demo always looks current.
import { addDays, daysAgo, today, nowISO, mulberry32, round2, makeAttachment } from '../../lib/format'

export const FX = { USD: 83.6, CNY: 11.55, INR: 1 }
export const CATEGORIES = ['Pumps', 'Air Compressors', 'Vacuum Cleaners', 'Pressure Washers', 'Spraying Equipment', 'Spare Parts']
export const REGIONS = ['North', 'South', 'East', 'West', 'Central']

const iso = (dateStr, h = 10) => `${dateStr}T${String(h).padStart(2, '0')}:15:00.000Z`

// ------------------------------------------------------------------ USERS / PERSONAS
export const seedUsers = () => [
  { id: 'u1', name: 'Vikram Mehta', title: 'Director (Boss)', role: 'ADMIN', email: 'vikram@btali.in', phone: '98200 11001', app: 'erp', username: 'vikram' },
  { id: 'u2', name: 'Neha Mehta', title: 'Finance Head (Madam)', role: 'FINANCE_HEAD', email: 'neha@btali.in', phone: '98200 11002', app: 'erp', username: 'neha' },
  { id: 'u3', name: 'Arjun Nair', title: 'Purchase Manager', role: 'PURCHASE', email: 'arjun@btali.in', phone: '98200 11003', app: 'erp', username: 'arjun' },
  { id: 'u4', name: 'Priya Desai', title: 'Sales Manager', role: 'SALES_MANAGER', email: 'priya@btali.in', phone: '98200 11004', app: 'erp', username: 'priya' },
  { id: 'u5', name: 'Rohit Kulkarni', title: 'Sales Executive – West & Central', role: 'SALES_EXEC', email: 'rohit@btali.in', phone: '98200 11005', app: 'erp', username: 'rohit', regions: ['West', 'Central'] },
  { id: 'u6', name: 'Sameer Khan', title: 'Sales Executive – North', role: 'SALES_EXEC', email: 'sameer@btali.in', phone: '98200 11006', app: 'erp', username: 'sameer', regions: ['North'] },
  { id: 'u7', name: 'Ankita Joshi', title: 'Sales Executive – South', role: 'SALES_EXEC', email: 'ankita@btali.in', phone: '98200 11007', app: 'erp', username: 'ankita', regions: ['South'] },
  { id: 'u18', name: 'Amit Verma', title: 'Sales Executive – East', role: 'SALES_EXEC', email: 'amit@btali.in', phone: '98200 11018', app: 'erp', username: 'amit', regions: ['East'] },
  { id: 'u8', name: 'Deepak Yadav', title: 'Dispatch Executive', role: 'DISPATCH', email: 'deepak@btali.in', phone: '98200 11008', app: 'erp', username: 'deepak' },
  { id: 'u9', name: 'Kavita Iyer', title: 'Accounts Executive', role: 'ACCOUNTS', email: 'kavita@btali.in', phone: '98200 11009', app: 'erp', username: 'kavita' },
  { id: 'u10', name: 'Meera Pillai', title: 'HR Manager', role: 'HR', email: 'meera@btali.in', phone: '98200 11010', app: 'erp', username: 'meera' },
  { id: 'u11', name: 'Imran Shaikh', title: 'Service Head', role: 'SERVICE', email: 'imran@btali.in', phone: '98200 11011', app: 'erp', username: 'imran' },
  { id: 'u12', name: 'Li Wei', title: 'Export Manager, Ningbo Hailong Pump', role: 'VENDOR', vendorId: 'v1', email: 'liwei@hailongpump.cn', phone: '+86 574 8811 2201', app: 'vendor', username: 'liwei' },
  { id: 'u13', name: 'Zhang Min', title: 'Sales Director, Zhejiang Aquajet', role: 'VENDOR', vendorId: 'v4', email: 'zhang@aquajet.cn', phone: '+86 576 8890 1123', app: 'vendor', username: 'zhang' },
  { id: 'u14', name: 'Rajesh Sharma', title: 'Owner, Sharma Agro Traders', role: 'DEALER', partnerId: 'd1', email: 'rajesh@sharmaagro.in', phone: '98140 22001', app: 'dealer', username: 'rajesh' },
  { id: 'u15', name: 'Ganesh Patil', title: 'Owner, Shree Ganesh Hardware', role: 'DEALER', partnerId: 'd2', email: 'ganesh@shreeganesh.in', phone: '98220 22002', app: 'dealer', username: 'ganesh' },
  { id: 'u16', name: 'Snehal Kadam', title: 'Store Manager, Btali Store Pune', role: 'FRANCHISE', partnerId: 'f1', email: 'pune.store@btali.in', phone: '98900 33001', app: 'franchise', username: 'snehal' },
  { id: 'u17', name: 'Sunil More', title: 'Btali Desk @ Btali Warehouse', role: 'BTALI', email: 'sunil.btali@btali.in', phone: '98200 11017', app: 'btali', username: 'sunil' },
]

// ------------------------------------------------------------------ VENDORS (suppliers, forwarders, CHA, logistics)
export const seedVendors = () => [
  { id: 'v1', code: 'NHP', name: 'Ningbo Hailong Pump Co., Ltd.', type: 'CHINA', country: 'China', city: 'Ningbo', currency: 'USD', contact: 'Li Wei', email: 'liwei@hailongpump.cn', phone: '+86 574 8811 2201', paymentTerms: { advancePct: 30, balancePct: 70, creditDays: 60 }, bank: 'Bank of China, Ningbo – SWIFT BKCHCNBJ92A', rating: 4.4, portal: true, gst: '', categories: ['Pumps', 'Spare Parts'] },
  { id: 'v2', code: 'TJC', name: 'Taizhou Jinfeng Compressor Co.', type: 'CHINA', country: 'China', city: 'Taizhou', currency: 'USD', contact: 'Chen Hao', email: 'chen@jinfengcomp.cn', phone: '+86 576 8122 4410', paymentTerms: { advancePct: 30, balancePct: 70, creditDays: 90 }, bank: 'ICBC Taizhou – SWIFT ICBKCNBJZJP', rating: 4.1, portal: true, categories: ['Air Compressors', 'Spare Parts'] },
  { id: 'v3', code: 'SCV', name: 'Suzhou Clearvac Electric Appliance', type: 'CHINA', country: 'China', city: 'Suzhou', currency: 'USD', contact: 'Wang Fang', email: 'fang@clearvac.cn', phone: '+86 512 6677 9012', paymentTerms: { advancePct: 20, balancePct: 80, creditDays: 60 }, bank: 'China Construction Bank – SWIFT PCBCCNBJJSX', rating: 4.6, portal: true, categories: ['Vacuum Cleaners', 'Spare Parts'] },
  { id: 'v4', code: 'ZAQ', name: 'Zhejiang Aquajet Cleaning Machinery', type: 'CHINA', country: 'China', city: 'Taizhou', currency: 'USD', contact: 'Zhang Min', email: 'zhang@aquajet.cn', phone: '+86 576 8890 1123', paymentTerms: { advancePct: 30, balancePct: 70, creditDays: 60 }, bank: 'Agricultural Bank of China – SWIFT ABOCCNBJ110', rating: 4.3, portal: true, categories: ['Pressure Washers', 'Spare Parts'] },
  { id: 'v5', code: 'YGS', name: 'Yongkang Greenfield Sprayer Co.', type: 'CHINA', country: 'China', city: 'Yongkang', currency: 'USD', contact: 'Liu Yang', email: 'liu@greenfieldspray.cn', phone: '+86 579 8723 5560', paymentTerms: { advancePct: 50, balancePct: 50, creditDays: 0 }, bank: 'Bank of Communications – SWIFT COMMCNSHJHA', rating: 3.9, portal: true, categories: ['Spraying Equipment', 'Spare Parts'] },
  { id: 'v6', code: 'RPP', name: 'Rajkot Precision Pumps Pvt. Ltd.', type: 'INDIA', country: 'India', city: 'Rajkot', currency: 'INR', contact: 'Hitesh Vaghela', email: 'sales@rajkotprecision.in', phone: '0281 245 7788', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 30 }, bank: 'HDFC Bank Rajkot – HDFC0000123', gst: '24AABCR4521K1Z5', rating: 4.2, portal: false, categories: ['Pumps', 'Spare Parts'] },
  { id: 'v7', code: 'CMW', name: 'Coimbatore Motor Works', type: 'INDIA', country: 'India', city: 'Coimbatore', currency: 'INR', contact: 'S. Ramasamy', email: 'orders@cbemotorworks.in', phone: '0422 239 4411', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 45 }, bank: 'Indian Bank – IDIB000C032', gst: '33AAFFC7712M1ZQ', rating: 4.0, portal: false, categories: ['Pumps'] },
  { id: 'fw1', code: 'OLS', name: 'Oceanlink Shipping (Ningbo)', type: 'FORWARDER', subtype: 'CHINA', country: 'China', city: 'Ningbo', currency: 'USD', contact: 'Kevin Zhou', email: 'kevin@oceanlink.cn', phone: '+86 574 2788 1000', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 15 }, rating: 4.2 },
  { id: 'fw2', code: 'TAF', name: 'Trans-Asia Freight Forwarders', type: 'FORWARDER', subtype: 'INDIA', country: 'India', city: 'Mumbai', currency: 'INR', contact: 'Nikhil Rao', email: 'nikhil@transasiafreight.in', phone: '022 6612 4400', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 15 }, gst: '27AAGCT8812L1Z2', rating: 4.0 },
  { id: 'fw3', code: 'GAF', name: 'GAF Logistics', type: 'FORWARDER', subtype: 'INDIA', country: 'India', city: 'Navi Mumbai', currency: 'INR', contact: 'Farhan Ghazi', email: 'ops@gaflogistics.in', phone: '022 2788 5100', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 15 }, gst: '27AAKFG1209P1ZB', rating: 4.3, note: 'Raises invoices ~15 days after container arrival' },
  { id: 'fw4', code: 'BWG', name: 'BlueWave Global Logistics', type: 'FORWARDER', subtype: 'INDIA', country: 'India', city: 'Nhava Sheva', currency: 'INR', contact: 'Sonal Mehra', email: 'sonal@bluewavegl.in', phone: '022 2724 9900', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 7 }, gst: '27AAHCB5521Q1Z8', rating: 3.8 },
  { id: 'fw5', code: 'CCA', name: 'Colombo Cargo Agents', type: 'FORWARDER', subtype: 'DESTINATION', country: 'Sri Lanka', city: 'Colombo', currency: 'USD', contact: 'Dinesh Perera', email: 'dinesh@colombocargo.lk', phone: '+94 11 244 8800', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 0 }, rating: 4.0 },
  { id: 'fw6', code: 'DFL', name: 'Dhaka Freight Link', type: 'FORWARDER', subtype: 'DESTINATION', country: 'Bangladesh', city: 'Dhaka', currency: 'USD', contact: 'Rafiq Hasan', email: 'rafiq@dhakafreight.bd', phone: '+880 2 988 1122', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 0 }, rating: 3.7 },
  { id: 'cha1', code: 'SCH', name: 'Seaport Customs House Agents', type: 'CHA', country: 'India', city: 'Nhava Sheva', currency: 'INR', contact: 'Mahesh Gawde', email: 'mahesh@seaportcha.in', phone: '022 2747 3300', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 7 }, gst: '27AAECS4410H1Z1', rating: 4.1 },
  { id: 'lg1', code: 'STX', name: 'Btali 3PL Warehousing', type: 'LOGISTICS', subtype: 'WAREHOUSE', country: 'India', city: 'Bhiwandi', currency: 'INR', contact: 'Prakash Shetty', email: 'mis@btali3pl.in', phone: '022 2520 7700', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 30 }, gst: '27AAFCS9981K1ZT', rating: 3.9 },
  { id: 'lg2', code: 'SFX', name: 'Safex Transport', type: 'LOGISTICS', subtype: 'TRANSPORT', country: 'India', city: 'Bhiwandi', currency: 'INR', contact: 'Ravi Bhosale', email: 'billing@safextransport.in', phone: '022 2520 8811', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 15 }, gst: '27AAKFS2231N1Z6', rating: 4.0 },
  { id: 'lg3', code: 'SST', name: 'Shiv Sai Transport', type: 'LOGISTICS', subtype: 'PORT_TRANSPORT', country: 'India', city: 'Uran', currency: 'INR', contact: 'Santosh Mhatre', email: 'shivsaitransport@gmail.com', phone: '98201 44556', paymentTerms: { advancePct: 0, balancePct: 100, creditDays: 15 }, gst: '27ABJPM4471C1ZK', rating: 4.2 },
]

// ------------------------------------------------------------------ PRODUCTS
// [sku, name, category, vendorId, vendorRate, moq, reorder, popularity, weightKg, cbm, warrantyMonths, specs]
const P = [
  ['BT-MB05', 'Monoblock Pump 0.5 HP', 'Pumps', 'v1', 18, 100, 60, 8, 9.5, 0.018, 12, { Power: '0.5 HP / 0.37 kW', Head: '22 m', Discharge: '1800 LPH', Phase: 'Single', Pipe: '1" x 1"' }],
  ['BT-MB10', 'Monoblock Pump 1 HP', 'Pumps', 'v1', 26, 100, 80, 10, 13, 0.024, 12, { Power: '1 HP / 0.75 kW', Head: '30 m', Discharge: '2700 LPH', Phase: 'Single', Pipe: '1" x 1"' }],
  ['BT-SP10', 'Self-Priming Pump 1 HP', 'Pumps', 'v1', 30, 80, 50, 6, 14, 0.026, 12, { Power: '1 HP', Head: '35 m', Suction: '8 m', Phase: 'Single' }],
  ['BT-OW10', 'Openwell Submersible 1 HP', 'Pumps', 'v1', 42, 60, 30, 5, 18, 0.032, 12, { Power: '1 HP', Head: '40 m', Stages: '3', Cable: '20 m' }],
  ['BT-V415', 'Borewell Submersible V4 1.5 HP', 'Pumps', 'v6', 6200, 40, 20, 4, 22, 0.035, 18, { Power: '1.5 HP', Head: '120 m', Stages: '15', Bore: '4 inch' }],
  ['BT-PB05', 'Pressure Booster Pump 0.5 HP', 'Pumps', 'v1', 35, 50, 25, 4, 8, 0.016, 12, { Power: '0.5 HP', 'Max Pressure': '3.5 bar', Tank: '24 L' }],
  ['BT-SW10', 'Sewage Pump 1 HP', 'Pumps', 'v7', 5100, 30, 15, 2, 16, 0.03, 12, { Power: '1 HP', Head: '12 m', 'Solids': '35 mm' }],
  ['BT-AC24', 'Oil-free Air Compressor 24 L', 'Air Compressors', 'v2', 48, 60, 30, 7, 19, 0.06, 12, { Motor: '1.5 HP', Tank: '24 L', Pressure: '8 bar', FAD: '110 LPM' }],
  ['BT-AC50', 'Air Compressor 50 L 2 HP', 'Air Compressors', 'v2', 85, 40, 20, 6, 38, 0.12, 12, { Motor: '2 HP', Tank: '50 L', Pressure: '8 bar', FAD: '206 LPM' }],
  ['BT-AC100', 'Belt-drive Compressor 100 L 3 HP', 'Air Compressors', 'v2', 160, 20, 10, 3, 85, 0.28, 12, { Motor: '3 HP', Tank: '100 L', Pressure: '10 bar', FAD: '340 LPM' }],
  ['BT-TI12', 'Portable Tyre Inflator 12 V', 'Air Compressors', 'v2', 9, 200, 100, 7, 1.6, 0.004, 6, { Voltage: '12 V DC', Pressure: '150 PSI', Display: 'Digital' }],
  ['BT-WD20', 'Wet & Dry Vacuum Cleaner 20 L', 'Vacuum Cleaners', 'v3', 32, 80, 40, 7, 7.5, 0.05, 12, { Power: '1200 W', Tank: '20 L Plastic', Suction: '18 kPa' }],
  ['BT-WD30', 'Wet & Dry Vacuum Cleaner 30 L SS', 'Vacuum Cleaners', 'v3', 44, 60, 30, 6, 10, 0.07, 12, { Power: '1400 W', Tank: '30 L Stainless', Suction: '20 kPa', Blower: 'Yes' }],
  ['BT-IV60', 'Industrial Vacuum 60 L Twin Motor', 'Vacuum Cleaners', 'v3', 95, 20, 10, 3, 21, 0.14, 12, { Power: '2400 W', Tank: '60 L SS', Motors: '2' }],
  ['BT-HV01', 'Handheld Cordless Vacuum', 'Vacuum Cleaners', 'v3', 22, 100, 40, 5, 1.8, 0.008, 6, { Battery: '14.4 V Li-ion', Runtime: '25 min' }],
  ['BT-PW16', 'Pressure Washer 1600 W 120 bar', 'Pressure Washers', 'v4', 38, 80, 50, 9, 8.5, 0.045, 12, { Power: '1600 W', Pressure: '120 bar', Flow: '6.5 L/min', Hose: '5 m' }],
  ['BT-PW22', 'Pressure Washer 2200 W 150 bar Induction', 'Pressure Washers', 'v4', 72, 50, 30, 6, 15, 0.07, 12, { Power: '2200 W Induction', Pressure: '150 bar', Flow: '7.5 L/min', Hose: '8 m' }],
  ['BT-PW30', 'Commercial Pressure Washer 3 kW 200 bar', 'Pressure Washers', 'v4', 140, 20, 10, 2, 32, 0.15, 12, { Power: '3 kW', Pressure: '200 bar', Pump: 'Triplex brass' }],
  ['BT-PWC20', 'Cordless Pressure Washer 20 V', 'Pressure Washers', 'v4', 34, 60, 25, 4, 3.2, 0.02, 6, { Battery: '20 V 4 Ah', Pressure: '24 bar' }],
  ['BT-BS16', 'Battery Sprayer 16 L 12 V', 'Spraying Equipment', 'v5', 14, 200, 120, 10, 5.2, 0.03, 6, { Tank: '16 L', Battery: '12 V 8 Ah', Pressure: '0.2–0.45 MPa' }],
  ['BT-BS20', 'Battery Sprayer 20 L Dual Motor', 'Spraying Equipment', 'v5', 19, 150, 80, 8, 6.4, 0.035, 6, { Tank: '20 L', Battery: '12 V 12 Ah', Motors: '2' }],
  ['BT-KP25', 'Knapsack Power Sprayer 25 L (2-stroke)', 'Spraying Equipment', 'v5', 45, 50, 25, 5, 11, 0.06, 6, { Engine: '25.4 cc 2-stroke', Tank: '25 L' }],
  ['BT-HTP', 'HTP Power Sprayer Portable', 'Spraying Equipment', 'v5', 62, 30, 15, 4, 24, 0.09, 12, { Engine: '5.5 HP petrol', Pressure: '35 bar', Pump: '3-piston' }],
  ['BT-MB3W', 'Mist Blower 3WF-3', 'Spraying Equipment', 'v5', 58, 30, 12, 3, 11, 0.07, 6, { Engine: '41.5 cc', Tank: '14 L', Range: '12 m' }],
  ['SP-MS12', 'Mechanical Seal 12 mm', 'Spare Parts', 'v1', 0.8, 500, 300, 9, 0.05, 0.0002, 3, { Fits: 'Monoblock / Self-priming' }],
  ['SP-IMP10', 'Brass Impeller 1 HP', 'Spare Parts', 'v6', 190, 200, 80, 6, 0.4, 0.0006, 3, { Material: 'Brass', Fits: 'BT-MB10, BT-SP10' }],
  ['SP-CAP25', 'Capacitor 25 µF', 'Spare Parts', 'v1', 0.6, 500, 250, 8, 0.08, 0.0002, 3, { Rating: '25 µF 440 V' }],
  ['SP-AF01', 'Compressor Air Filter', 'Spare Parts', 'v2', 0.7, 300, 120, 6, 0.06, 0.0003, 3, { Fits: 'BT-AC24, BT-AC50' }],
  ['SP-PSW8', 'Pressure Switch 8 bar', 'Spare Parts', 'v2', 3.2, 150, 60, 5, 0.3, 0.0008, 6, { Range: '6–8 bar' }],
  ['SP-SV14', 'Safety Valve 1/4"', 'Spare Parts', 'v2', 0.9, 300, 100, 4, 0.05, 0.0002, 3, { Size: '1/4 inch BSP' }],
  ['SP-HEPA', 'HEPA Filter (WD20/WD30)', 'Spare Parts', 'v3', 1.8, 300, 120, 6, 0.15, 0.001, 3, { Fits: 'BT-WD20, BT-WD30' }],
  ['SP-VH25', 'Vacuum Hose 2.5 m', 'Spare Parts', 'v3', 2.1, 200, 80, 4, 0.6, 0.003, 3, { Length: '2.5 m', Dia: '35 mm' }],
  ['SP-PWGUN', 'Pressure Washer Trigger Gun', 'Spare Parts', 'v4', 3.5, 200, 80, 6, 0.5, 0.002, 6, { Rating: '200 bar' }],
  ['SP-HPH8', 'High-pressure Hose 8 m', 'Spare Parts', 'v4', 4.0, 150, 60, 5, 1.1, 0.004, 6, { Length: '8 m', Rating: '180 bar' }],
  ['SP-NOZ', 'Turbo Nozzle Set', 'Spare Parts', 'v4', 1.2, 300, 100, 5, 0.1, 0.0004, 3, { Pieces: '5' }],
  ['SP-SPM12', 'Sprayer Pump Motor 12 V', 'Spare Parts', 'v5', 2.8, 300, 150, 8, 0.4, 0.001, 3, { Voltage: '12 V DC' }],
  ['SP-BAT8', 'Lithium Battery 12 V 8 Ah', 'Spare Parts', 'v5', 5.5, 200, 100, 7, 1.0, 0.002, 6, { Chemistry: 'Li-ion', Capacity: '8 Ah' }],
  ['SP-LANCE', 'Brass Sprayer Lance', 'Spare Parts', 'v5', 1.1, 300, 100, 4, 0.3, 0.001, 3, { Length: '60 cm' }],
  ['SP-CB', 'Carbon Brush Set', 'Spare Parts', 'v3', 0.4, 500, 200, 5, 0.02, 0.0001, 3, { Fits: 'Vacuum / Washer motors' }],
  ['SP-PRK', 'Piston Ring Kit', 'Spare Parts', 'v2', 1.5, 200, 60, 3, 0.1, 0.0003, 3, { Fits: 'BT-AC50, BT-AC100' }],
]
const BOM = {
  'BT-MB05': ['SP-MS12', 'SP-CAP25'], 'BT-MB10': ['SP-MS12', 'SP-CAP25', 'SP-IMP10'], 'BT-SP10': ['SP-MS12', 'SP-CAP25', 'SP-IMP10'],
  'BT-OW10': ['SP-CAP25'], 'BT-PB05': ['SP-MS12', 'SP-CAP25'], 'BT-AC24': ['SP-AF01', 'SP-PSW8', 'SP-SV14'], 'BT-AC50': ['SP-AF01', 'SP-PSW8', 'SP-SV14', 'SP-PRK'],
  'BT-AC100': ['SP-PSW8', 'SP-SV14', 'SP-PRK'], 'BT-WD20': ['SP-HEPA', 'SP-VH25', 'SP-CB'], 'BT-WD30': ['SP-HEPA', 'SP-VH25', 'SP-CB'], 'BT-IV60': ['SP-VH25', 'SP-CB'],
  'BT-PW16': ['SP-PWGUN', 'SP-HPH8', 'SP-NOZ', 'SP-CB'], 'BT-PW22': ['SP-PWGUN', 'SP-HPH8', 'SP-NOZ'], 'BT-PW30': ['SP-PWGUN', 'SP-HPH8', 'SP-NOZ'],
  'BT-BS16': ['SP-SPM12', 'SP-BAT8', 'SP-LANCE'], 'BT-BS20': ['SP-SPM12', 'SP-BAT8', 'SP-LANCE'], 'BT-KP25': ['SP-LANCE'], 'BT-HTP': ['SP-LANCE'],
}
export const CATEGORY_PREFIX = { Pumps: 'PUMP', 'Air Compressors': 'COMP', 'Vacuum Cleaners': 'VAC', 'Pressure Washers': 'PWS', 'Spraying Equipment': 'SPRY', 'Spare Parts': 'SP' }
const HSN = { Pumps: '8413', 'Air Compressors': '8414', 'Vacuum Cleaners': '8508', 'Pressure Washers': '8424', 'Spraying Equipment': '8424', 'Spare Parts': '8413' }

export const seedProducts = () =>
  P.map(([sku, name, category, vendorId, vendorRate, moq, reorderLevel, popularity, weightKg, cbm, warrantyMonths, specs], i) => {
    const currency = vendorId === 'v6' || vendorId === 'v7' ? 'INR' : 'USD'
    const rateINR = vendorRate * FX[currency]
    const isSpare = category === 'Spare Parts'
    const landedFactor = currency === 'INR' ? 1.06 : isSpare ? 1.32 : 1.28
    const landedCost = Math.round(rateINR * landedFactor)
    const mrp = Math.max(10, Math.round((rateINR * 3.6) / 10) * 10)
    return {
      id: `p${i + 1}`,
      sku,
      name: `Btali ${name}`,
      shortName: name,
      category,
      type: isSpare ? 'SPARE' : 'FG',
      hsn: HSN[category],
      gst: 18,
      uom: 'Nos',
      vendorId,
      vendorIds: [vendorId],
      currency,
      vendorRate,
      landedCost,
      mrp,
      moq,
      reorderLevel,
      maxLevel: reorderLevel * 4,
      leadTimeDays: currency === 'INR' ? 15 : 75,
      popularity,
      weightKg,
      cbm,
      cartonQty: isSpare ? 50 : 1,
      warrantyMonths,
      specs,
      description: `${name} – Btali branded, factory-tested, supplied with Btali warranty card and genuine spares support.`,
      bom: [],
      parents: [],
      media: [makeAttachment(`${sku}-brochure.pdf`, { kind: 'brochure' })],
      active: true,
      createdAt: daysAgo(400),
    }
  }).map((p, _i, all) => {
    const bySku = Object.fromEntries(all.map((x) => [x.sku, x.id]))
    p.bom = (BOM[p.sku] || []).map((s) => ({ productId: bySku[s], qty: 1 }))
    p.parents = Object.entries(BOM).filter(([, sp]) => sp.includes(p.sku)).map(([fg]) => bySku[fg])
    return p
  })

// ------------------------------------------------------------------ LOCATIONS / TRANSPORTERS
export const seedLocations = () => [
  { id: 'WH-BTALI', code: 'STX-BHW', name: 'Btali 3PL – Bhiwandi', type: 'WAREHOUSE', address: 'Gala 14-18, Btali Logistics Park, Vadape, Bhiwandi 421302', managedBy: 'Btali 3PL Warehousing', primary: true },
  { id: 'WH-GUJ', code: 'GUJ-FAC', name: 'Gujarat Manufacturing Facility (Virtual)', type: 'VIRTUAL', address: 'Plot 211, GIDC Metoda, Rajkot 360021', managedBy: 'Partner facility – direct delivery', note: 'Pending client confirmation' },
  { id: 'WH-TRANSIT', code: 'TRANSIT', name: 'In Transit (Import)', type: 'TRANSIT', address: '—', managedBy: 'System' },
]

export const seedTransporters = () => [
  { id: 't1', name: 'Safex Transport', contact: 'Ravi Bhosale', phone: '98201 22110', vehicleNo: 'MH04 KF 2210', isSafex: true, regions: ['West', 'Central'], note: 'Collects directly from warehouse; pickup charges via debit note' },
  { id: 't2', name: 'Om Sai Roadways', contact: 'Vinod Jadhav', phone: '98190 33221', vehicleNo: 'MH04 HD 7781', regions: ['West'] },
  { id: 't3', name: 'Rajdhani Roadways', contact: 'Harpreet Singh', phone: '98110 44312', vehicleNo: 'DL01 GC 4410', regions: ['North'] },
  { id: 't4', name: 'Southern Express Cargo', contact: 'K. Murugan', phone: '94440 55120', vehicleNo: 'TN09 BX 9012', regions: ['South'] },
  { id: 't5', name: 'Ganga Logistics', contact: 'Manoj Tiwari', phone: '94150 66201', vehicleNo: 'UP32 KT 1188', regions: ['North', 'East'] },
  { id: 't6', name: 'Deccan Cargo Movers', contact: 'Srinivas Rao', phone: '98480 77110', vehicleNo: 'TS07 UB 3321', regions: ['South'] },
  { id: 't7', name: 'Patel Freight Carriers', contact: 'Jignesh Patel', phone: '98250 88123', vehicleNo: 'GJ05 AZ 6650', regions: ['West'] },
  { id: 't8', name: 'Eastern Roadlink', contact: 'Subrata Das', phone: '98300 99012', vehicleNo: 'WB19 F 2299', regions: ['East'] },
  { id: 't9', name: 'Konkan Roadlines', contact: 'Sachin Naik', phone: '98220 10023', vehicleNo: 'MH08 AP 4512', regions: ['West', 'Central'] },
]

// ------------------------------------------------------------------ PARTNERS (dealers, franchisees, export customers)
// [name, city, state, region, salesperson, transporter, priceList, stage/status, tier]
const D = [
  ['Sharma Agro Traders', 'Ludhiana', 'Punjab', 'North', 'u6', 't3', 'pl2', 'CURRENT', 'A'],
  ['Shree Ganesh Hardware', 'Pune', 'Maharashtra', 'West', 'u5', 't1', 'pl1', 'CURRENT', 'A'],
  ['Kaveri Pumps & Motors', 'Coimbatore', 'Tamil Nadu', 'South', 'u7', 't4', 'pl2', 'CURRENT', 'A'],
  ['Bengal Machinery Mart', 'Kolkata', 'West Bengal', 'East', 'u18', 't8', 'pl1', 'CURRENT', 'B'],
  ['Patel Agri Equipments', 'Rajkot', 'Gujarat', 'West', 'u5', 't7', 'pl1', 'CURRENT', 'A'],
  ['Jain Industrial Supplies', 'Indore', 'Madhya Pradesh', 'Central', 'u5', 't9', 'pl1', 'CURRENT', 'B'],
  ['Royal Hardware Stores', 'Jaipur', 'Rajasthan', 'North', 'u6', 't3', 'pl1', 'CURRENT', 'B'],
  ['Sai Krishna Agencies', 'Hyderabad', 'Telangana', 'South', 'u7', 't6', 'pl1', 'CURRENT', 'B'],
  ['Mahalaxmi Tools Centre', 'Nagpur', 'Maharashtra', 'Central', 'u5', 't9', 'pl1', 'CURRENT', 'C'],
  ['Deccan Pump House', 'Bengaluru', 'Karnataka', 'South', 'u7', 't6', 'pl2', 'CURRENT', 'A'],
  ['Ganga Sales Corporation', 'Lucknow', 'Uttar Pradesh', 'North', 'u6', 't5', 'pl1', 'CURRENT', 'B'],
  ['Odisha Krishi Kendra', 'Bhubaneswar', 'Odisha', 'East', 'u18', 't8', 'pl1', 'CURRENT', 'C'],
  ['Kerala Machinery Co.', 'Kochi', 'Kerala', 'South', 'u7', 't4', 'pl1', 'CURRENT', 'B'],
  ['Amar Electricals & Pumps', 'New Delhi', 'Delhi', 'North', 'u6', 't3', 'pl2', 'CURRENT', 'A'],
  ['Gupta Brothers Trading', 'Patna', 'Bihar', 'East', 'u18', 't5', 'pl1', 'CURRENT', 'C'],
  ['Nashik Agro Solutions', 'Nashik', 'Maharashtra', 'West', 'u5', 't1', 'pl1', 'CURRENT', 'B'],
  ['Vijay Engineering Stores', 'Surat', 'Gujarat', 'West', 'u5', 't7', 'pl1', 'CURRENT', 'B'],
  ['Chennai Power Tools', 'Chennai', 'Tamil Nadu', 'South', 'u7', 't4', 'pl1', 'CURRENT', 'C'],
  ['Assam Agro Mart', 'Guwahati', 'Assam', 'East', 'u18', 't8', 'pl1', 'CURRENT', 'C'],
  ['Punjab Tractor & Pumps', 'Amritsar', 'Punjab', 'North', 'u6', 't3', 'pl1', 'DEAD', 'C'],
  ['Raipur Hardware Hub', 'Raipur', 'Chhattisgarh', 'Central', 'u5', 't9', 'pl1', 'IN_DECISION', 'C'],
  ['Goa Marine & Tools', 'Margao', 'Goa', 'West', 'u5', 't9', 'pl1', 'IN_DECISION', 'C'],
]
const STATE_CODE = { Punjab: '03', Maharashtra: '27', 'Tamil Nadu': '33', 'West Bengal': '19', Gujarat: '24', 'Madhya Pradesh': '23', Rajasthan: '08', Telangana: '36', Karnataka: '29', 'Uttar Pradesh': '09', Odisha: '21', Kerala: '32', Delhi: '07', Bihar: '10', Assam: '18', Chhattisgarh: '22', Goa: '30' }
const gstin = (state, i) => `${STATE_CODE[state] || '27'}AA${String.fromCharCode(65 + (i % 26))}F${String(1000 + i * 37).slice(0, 4)}${String.fromCharCode(66 + (i % 20))}1Z${i % 10}`

export const seedPartners = () => {
  const dealers = D.map(([name, city, state, region, sp, tr, pl, stage, tier], i) => ({
    id: `d${i + 1}`,
    code: `DLR-${String(101 + i)}`,
    name,
    type: 'DEALER',
    tier,
    stage,
    status: stage === 'IN_DECISION' ? (i === 21 ? 'PENDING_APPROVAL' : 'PROSPECT') : stage === 'DEAD' ? 'INACTIVE' : 'ACTIVE',
    city,
    state,
    region,
    address: `${12 + i}, Main Market Road, ${city}`,
    pincode: String(400001 + i * 977).slice(0, 6),
    contact: ['Rajesh Sharma', 'Ganesh Patil', 'R. Kumaravel', 'Sourav Ghosh', 'Hasmukh Patel', 'Anil Jain', 'Mahendra Singh', 'Srinivas Reddy', 'Pravin Wankhede', 'Manjunath Gowda', 'Alok Mishra', 'Bibhuti Sahoo', 'Thomas Varghese', 'Amarjeet Kaur', 'Sanjay Gupta', 'Yogesh Pawar', 'Vijay Desai', 'S. Prabhu', 'Dipankar Bora', 'Gurpreet Sandhu', 'Ramesh Sahu', 'Anthony Fernandes'][i],
    phone: `98${String(10000000 + i * 7311).slice(0, 8)}`,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '')}@gmail.com`,
    gstin: gstin(state, i),
    pan: gstin(state, i).slice(2, 12),
    salespersonId: sp,
    transporterId: tr,
    safex: tr === 't1',
    priceListId: pl,
    extraDiscountPct: tier === 'A' ? 2 : 0,
    creditDays: 0,
    creditLimit: 0,
    paymentTerms: 'Advance',
    authorizedCategories: CATEGORIES,
    onboardedAt: stage === 'IN_DECISION' ? null : daysAgo(500 - i * 11),
    kyc: stage === 'IN_DECISION' && i === 21 ? [makeAttachment('GST-Certificate.pdf'), makeAttachment('PAN-Card.pdf'), makeAttachment('Cancelled-Cheque.pdf')] : [makeAttachment('GST-Certificate.pdf'), makeAttachment('PAN-Card.pdf')],
    stock: {},
    stockUpdatedAt: null,
    posEnabled: i === 1,
    portalAccess: stage === 'CURRENT',
    notes: stage === 'DEAD' ? 'No orders for 9+ months; moved to competitor brand.' : '',
    lastOrderDate: null,
  }))
  const franchise = [
    ['Btali Store – Pune (Hadapsar)', 'Pune', 'Maharashtra', 'West', 'u5', 't2'],
    ['Btali Store – Ahmedabad', 'Ahmedabad', 'Gujarat', 'West', 'u5', 't7'],
    ['Btali Store – Bengaluru (Peenya)', 'Bengaluru', 'Karnataka', 'South', 'u7', 't6'],
    ['Btali Store – Lucknow', 'Lucknow', 'Uttar Pradesh', 'North', 'u6', 't5'],
  ].map(([name, city, state, region, sp, tr], i) => ({
    id: `f${i + 1}`,
    code: `FRN-${String(201 + i)}`,
    name,
    type: 'FRANCHISE',
    tier: 'F',
    stage: 'CURRENT',
    status: 'ACTIVE',
    city,
    state,
    region,
    address: `Shop ${3 + i}, Industrial Estate, ${city}`,
    contact: ['Snehal Kadam', 'Kunal Shah', 'Naveen Kumar', 'Rahul Srivastava'][i],
    phone: `98900${String(33001 + i)}`,
    email: `${city.toLowerCase()}.store@btali.in`,
    gstin: gstin(state, 40 + i),
    salespersonId: sp,
    transporterId: tr,
    priceListId: 'pl3',
    extraDiscountPct: 0,
    paymentTerms: 'Advance',
    authorizedCategories: CATEGORIES,
    onboardedAt: daysAgo(300 - i * 40),
    kyc: [makeAttachment('Franchise-Agreement.pdf'), makeAttachment('GST-Certificate.pdf')],
    stock: {},
    posEnabled: true,
    portalAccess: true,
    compliance: { barcodeScanPct: [98, 91, 86, 72][i], posUsagePct: [100, 96, 88, 70][i], stockUpdateLagDays: [0, 1, 3, 6][i] },
    autoReplenish: true,
  }))
  const exportCustomers = [
    ['Lanka Agro Machinery (Pvt) Ltd', 'Colombo', 'Sri Lanka', 'USD'],
    ['Dhaka Engineering Supplies', 'Dhaka', 'Bangladesh', 'USD'],
    ['Kathmandu Tools Trading', 'Kathmandu', 'Nepal', 'USD'],
  ].map(([name, city, country, currency], i) => ({
    id: `x${i + 1}`,
    code: `EXP-${301 + i}`,
    name,
    type: 'EXPORT',
    stage: 'CURRENT',
    status: 'ACTIVE',
    city,
    state: country,
    country,
    region: 'Export',
    currency,
    contact: ['Dinuka Silva', 'Mahmud Karim', 'Bishal Thapa'][i],
    phone: ['+94 77 123 4567', '+880 171 222 3344', '+977 98510 55443'][i],
    email: `${['dinuka', 'mahmud', 'bishal'][i]}@${['lankaagro.lk', 'dhakaeng.bd', 'ktmtools.np'][i]}`,
    salespersonId: 'u4',
    priceListId: 'pl4',
    paymentTerms: '100% Advance before vendor PO',
    onboardedAt: daysAgo(380 - i * 60),
    kyc: [],
    stock: {},
    portalAccess: false,
  }))
  return [...dealers, ...franchise, ...exportCustomers]
}

export const seedPriceLists = () => [
  { id: 'pl1', name: 'Standard Dealer', kind: 'DEALER', baseDiscountPct: 50, slabs: [{ minQty: 10, extraPct: 1 }, { minQty: 25, extraPct: 2 }, { minQty: 50, extraPct: 3 }], overrides: {}, active: true, version: 3, publishedAt: daysAgo(18), note: 'MRP less 50% base + bulk slabs' },
  { id: 'pl2', name: 'Premium Distributor', kind: 'DEALER', baseDiscountPct: 52, slabs: [{ minQty: 10, extraPct: 1 }, { minQty: 25, extraPct: 2.5 }, { minQty: 50, extraPct: 4 }], overrides: {}, active: true, version: 3, publishedAt: daysAgo(18), note: 'Tier-A distributors' },
  { id: 'pl3', name: 'Franchise Transfer', kind: 'FRANCHISE', baseDiscountPct: 55, slabs: [], overrides: {}, active: true, version: 2, publishedAt: daysAgo(40), note: 'Btali franchise stores' },
  { id: 'pl4', name: 'Export (Cost + Margin)', kind: 'EXPORT', baseDiscountPct: 0, marginPct: 22, slabs: [], overrides: {}, active: true, version: 1, publishedAt: daysAgo(90), note: 'Vendor base cost + Btali export margin' },
]

export const seedSchemes = () => [
  { id: 'sc1', code: 'DIWALI26', name: 'Diwali Bonanza – Pressure Washers & Vacuums', type: 'SEASONAL', discountPct: 4, from: daysAgo(20), to: addDays(today(), 15), categories: ['Pressure Washers', 'Vacuum Cleaners'], productIds: [], regions: [], partnerIds: [], active: true, description: 'Extra 4% on all pressure washers and vacuum cleaners during the festive season.' },
  { id: 'sc2', code: 'SPRAYCOMBO', name: 'Sprayer + Spare Battery Combo', type: 'COMBO', discountPct: 0, from: daysAgo(60), to: addDays(today(), 30), comboItems: [{ productId: 'p20', qty: 1 }, { productId: 'p37', qty: 1 }], comboDiscountPct: 12, categories: [], productIds: ['p20', 'p37'], regions: [], partnerIds: [], active: true, description: 'Buy Battery Sprayer 16 L with a spare 12 V battery and get 12% off the combo.' },
  { id: 'sc3', code: 'PUMPSLAB', name: 'Pump Volume Slab (North & West)', type: 'SLAB', minQty: 30, extraPct: 2, from: daysAgo(30), to: addDays(today(), 60), categories: ['Pumps'], productIds: [], regions: ['North', 'West'], partnerIds: [], active: true, description: 'Extra 2% on pumps when 30+ units are ordered in one order.' },
  { id: 'sc4', code: 'BOGO-NOZ', name: 'Buy 10 Trigger Guns, get 1 Nozzle Set free', type: 'BOGO', buyProductId: 'p33', buyQty: 10, freeProductId: 'p35', freeQty: 1, from: daysAgo(10), to: addDays(today(), 50), categories: [], productIds: ['p33'], regions: [], partnerIds: [], active: true, description: 'Free Turbo Nozzle Set with every 10 trigger guns.' },
  { id: 'sc5', code: 'MONSOON26', name: 'Monsoon Sprayer Push', type: 'SEASONAL', discountPct: 3, from: daysAgo(150), to: daysAgo(60), categories: ['Spraying Equipment'], productIds: [], regions: [], partnerIds: [], active: false, description: 'Ended scheme – 3% on sprayers.' },
]

// ------------------------------------------------------------------ SETTINGS
export const seedSettings = () => ({
  company: {
    name: 'Btali International',
    legalName: 'Btali International Pvt. Ltd.',
    gstin: '27AAFCB7731R1ZK',
    pan: 'AAFCB7731R',
    address: 'Unit 402, Business Square, Turbhe MIDC, Navi Mumbai 400705',
    email: 'accounts@btali.in',
    phone: '022 4012 7700',
    website: 'www.btali.in',
    fy: '2026-27',
  },
  fx: { ...FX },
  mrpMultiplier: 3.6,
  baseDiscountPct: 50,
  targetMarginPct: 12,
  exportMarginPct: 22,
  stockValuationMarkupPct: 30,
  reorderCycleDay: 15,
  landedCostMethod: 'VALUE',
  barcodeSeries: Object.fromEntries(Object.entries(CATEGORY_PREFIX).map(([c, p]) => [c, { prefix: p, next: 1001 }])),
  series: { PO: 112, SO: 0, INV: 0, QT: 18, SH: 24, RFQ: 9, EXP: 6, GRN: 21, TKT: 0, WCL: 6, RET: 5, VB: 41, EXPN: 77, JV: 140, CN: 9, DN: 14, POS: 0, REP: 3, CP: 4, PAY: 0, RCPT: 0, CLM: 12, PR: 9 },
  alertRules: { dealerInactiveDays: 45, receivableBuckets: [30, 60, 90], highValuePayment: 500000, containerDelayDays: 3, stockCoverDays: 30, preEtaDays: 3 },
  approvalMatrix: [
    { doc: 'Purchase Order', steps: ['Purchase Manager', 'Director'], threshold: 0 },
    { doc: 'Proforma Invoice', steps: ['Director'], threshold: 0 },
    { doc: 'Container Plan', steps: ['Director'], threshold: 0 },
    { doc: 'Freight Forwarder Selection', steps: ['Director'], threshold: 0 },
    { doc: 'Vendor Bill Payment', steps: ['Director (Boss)', 'Finance Head (Madam)'], threshold: 0 },
    { doc: 'Expense', steps: ['Director'], threshold: 5000 },
    { doc: 'Dealer Onboarding', steps: ['Sales Manager'], threshold: 0 },
    { doc: 'Warranty Claim', steps: ['Service Head'], threshold: 0 },
    { doc: 'Payroll', steps: ['HR Manager', 'Finance Head'], threshold: 0 },
  ],
  emailTemplates: [
    { key: 'SO_CONFIRM', name: 'Sales Order Confirmation', subject: 'Order {{so}} confirmed – Btali International', body: 'Dear {{dealer}},\n\nYour order {{so}} for {{amount}} has been confirmed. Please remit the advance to proceed with invoicing.\n\nRegards,\nBtali Sales' },
    { key: 'INVOICE', name: 'Tax Invoice', subject: 'Invoice {{invoice}} – Btali International', body: 'Dear {{dealer}},\n\nPlease find attached invoice {{invoice}}. Goods will be dispatched via {{transporter}}.\n\nRegards,\nBtali Dispatch' },
    { key: 'LR', name: 'LR Copy', subject: 'Dispatched: {{invoice}} – LR {{lr}}', body: 'Dear {{dealer}},\n\nYour goods against invoice {{invoice}} have been dispatched. LR No. {{lr}} is attached.\n\nRegards,\nBtali Dispatch' },
    { key: 'PAYMENT_REMINDER', name: 'Payment Due Reminder', subject: 'Payment due: {{bill}}', body: 'Reminder: {{bill}} for {{amount}} is due on {{due}}.' },
  ],
  numberFormats: { PO: 'PO/26-27/####', SO: 'SO/26-27/####', INV: 'BT/26-27/####' },
})

// ------------------------------------------------------------------ PURCHASE PIPELINE
const poLine = (productId, qty, products) => {
  const p = products.find((x) => x.id === productId)
  return { productId, qty, rate: p.vendorRate, mrp: p.mrp }
}
const MILESTONES = [
  ['VENDOR_DISPATCH', 'Vendor dispatch / Container stuffed'],
  ['ETD', 'Departed origin port'],
  ['CAN', 'Cargo Arrival Notice (CAN)'],
  ['IGM', 'IGM filed'],
  ['ARRIVED', 'Arrived Nhava Sheva'],
  ['BOE', 'Bill of Entry filed & duty paid'],
  ['CLEARED', 'Customs cleared'],
  ['TELEX', 'Telex release received'],
  ['PORT_TO_WH', 'Shiv Sai Transport – port to Btali'],
  ['INWARD', 'Inward at Btali (GRN)'],
]
export const SHIPMENT_MILESTONES = MILESTONES.map(([key, label]) => ({ key, label }))
// slip = days the vendor dispatched later than planned (affects vendor on-time delivery KPIs)
const milestones = (etd, eta, doneUpto, slip = 0) =>
  MILESTONES.map(([key, label], i) => {
    const plan = [addDays(etd, -3), etd, addDays(eta, -3), addDays(eta, -2), eta, addDays(eta, 1), addDays(eta, 3), addDays(eta, 3), addDays(eta, 4), addDays(eta, 5)][i]
    return { key, label, planned: plan, date: i < doneUpto ? (i === 0 ? addDays(plan, slip) : plan) : null, done: i < doneUpto }
  })
const docs = (names, by = 'u3') => names.map((n) => makeAttachment(n, { docType: n.split('-')[0], uploadedBy: by }))

export const seedPurchase = (products) => {
  const L = (id, q) => poLine(id, q, products)
  const pos = [
    { id: 'po1', number: 'PO/26-27/0112', type: 'IMPORT', vendorId: 'v1', date: daysAgo(1), status: 'PENDING_APPROVAL', lines: [L('p2', 300), L('p1', 200), L('p25', 1000), L('p27', 800)], createdBy: 'u3', source: 'REORDER_ALERT', note: 'Consolidated reorder for 15th cycle' },
    { id: 'po2', number: 'PO/26-27/0109', type: 'IMPORT', vendorId: 'v4', date: daysAgo(6), status: 'APPROVED', lines: [L('p16', 200), L('p17', 120), L('p33', 300), L('p34', 200)], createdBy: 'u3', approvedBy: 'u1', approvedAt: iso(daysAgo(5)) },
    { id: 'po3', number: 'PO/26-27/0106', type: 'IMPORT', vendorId: 'v5', date: daysAgo(12), status: 'PI_RECEIVED', lines: [L('p20', 600), L('p21', 300), L('p36', 500), L('p37', 400)], createdBy: 'u3', approvedBy: 'u1', approvedAt: iso(daysAgo(11)), pi: { number: 'YGS-PI-26-0918', amount: 0, file: makeAttachment('PI-YGS-26-0918.pdf'), uploadedAt: iso(daysAgo(3)), status: 'PENDING' } },
    { id: 'po4', number: 'PO/26-27/0101', type: 'IMPORT', vendorId: 'v2', date: daysAgo(28), status: 'IN_PRODUCTION', lines: [L('p8', 150), L('p9', 80), L('p11', 400), L('p28', 600), L('p29', 200)], createdBy: 'u3', approvedBy: 'u1', approvedAt: iso(daysAgo(27)), pi: { number: 'TJC-PI-2609-114', file: makeAttachment('PI-TJC-2609-114.pdf'), uploadedAt: iso(daysAgo(24)), status: 'APPROVED', stampedFile: makeAttachment('PI-TJC-2609-114-STAMPED.pdf'), approvedAt: iso(daysAgo(22)) }, mrpConfirmed: true, labelsSent: true, barcodesGenerated: false, stickerConfirmed: false, deliverySchedule: [{ id: 'ds1', date: addDays(today(), 10), qty: 1430, note: 'Full lot ready for stuffing' }] },
    { id: 'po5', number: 'PO/26-27/0097', type: 'IMPORT', vendorId: 'v3', date: daysAgo(46), status: 'QC_PENDING', lines: [L('p12', 160), L('p13', 100), L('p15', 120), L('p31', 600), L('p32', 200)], createdBy: 'u3', approvedBy: 'u1', approvedAt: iso(daysAgo(45)), pi: { number: 'SCV-PI-0826-33', file: makeAttachment('PI-SCV-0826-33.pdf'), uploadedAt: iso(daysAgo(43)), status: 'APPROVED', stampedFile: makeAttachment('PI-SCV-0826-33-STAMPED.pdf') }, mrpConfirmed: true, labelsSent: true, barcodesGenerated: true, stickerConfirmed: true, deliverySchedule: [{ id: 'ds2', date: addDays(today(), 4), qty: 1180, note: 'After QC approval' }], qc: [
      { id: 'qc1', kind: 'photo', file: makeAttachment('QC-WD30-branding-front.jpg'), caption: 'WD30 – branding & MRP sticker', status: 'PENDING', uploadedAt: iso(daysAgo(2)) },
      { id: 'qc2', kind: 'photo', file: makeAttachment('QC-WD20-carton-print.jpg'), caption: 'WD20 – carton print & barcode', status: 'PENDING', uploadedAt: iso(daysAgo(2)) },
      { id: 'qc3', kind: 'video', file: makeAttachment('QC-HV01-suction-test.mp4'), caption: 'HV01 – suction & runtime test', status: 'PENDING', uploadedAt: iso(daysAgo(2)) },
    ], improvements: [{ id: 'im1', text: 'WD30 – upgraded to brass drain plug (no cost change)', date: daysAgo(9), ack: false }] },
    { id: 'po6', number: 'PO/26-27/0094', type: 'IMPORT', vendorId: 'v1', date: daysAgo(58), status: 'READY_TO_SHIP', lines: [L('p3', 120), L('p4', 80), L('p6', 60), L('p25', 800)], createdBy: 'u3', approvedBy: 'u1', pi: { number: 'NHP-PI-0826-71', file: makeAttachment('PI-NHP-0826-71.pdf'), status: 'APPROVED', stampedFile: makeAttachment('PI-NHP-0826-71-STAMPED.pdf') }, mrpConfirmed: true, labelsSent: true, barcodesGenerated: true, stickerConfirmed: true, qc: [{ id: 'qc4', kind: 'photo', file: makeAttachment('QC-SP10-label.jpg'), caption: 'SP10 label', status: 'APPROVED', uploadedAt: iso(daysAgo(14)) }], qcApprovedAt: iso(daysAgo(12)), deliverySchedule: [{ id: 'ds3', date: daysAgo(5), qty: 1060, note: 'Ready at factory' }], packingList: { source: 'BARCODE_SCAN', generatedAt: iso(daysAgo(4)), lines: [] }, commercialInvoice: makeAttachment('CI-NHP-0826-71.pdf'), rfqId: 'rfq1' },
    { id: 'po7', number: 'PO/26-27/0088', type: 'IMPORT', vendorId: 'v4', date: daysAgo(80), status: 'SHIPPED', shipmentId: 'sh1', lines: [L('p16', 250), L('p19', 100), L('p35', 400)], createdBy: 'u3', approvedBy: 'u1', pi: { number: 'ZAQ-PI-0726-12', file: makeAttachment('PI-ZAQ-0726-12.pdf'), status: 'APPROVED', stampedFile: makeAttachment('PI-ZAQ-0726-12-STAMPED.pdf') }, mrpConfirmed: true, labelsSent: true, barcodesGenerated: true, stickerConfirmed: true, qcApprovedAt: iso(daysAgo(30)), commercialInvoice: makeAttachment('CI-ZAQ-0726-12.pdf') },
    { id: 'po8', number: 'PO/26-27/0082', type: 'IMPORT', vendorId: 'v2', date: daysAgo(96), status: 'SHIPPED', shipmentId: 'sh2', lines: [L('p8', 120), L('p10', 30), L('p30', 300), L('p40', 200)], createdBy: 'u3', approvedBy: 'u1', pi: { number: 'TJC-PI-0626-88', file: makeAttachment('PI-TJC-0626-88.pdf'), status: 'APPROVED', stampedFile: makeAttachment('PI-TJC-0626-88-STAMPED.pdf') }, mrpConfirmed: true, labelsSent: true, barcodesGenerated: true, stickerConfirmed: true, qcApprovedAt: iso(daysAgo(45)), commercialInvoice: makeAttachment('CI-TJC-0626-88.pdf') },
    { id: 'po9', number: 'PO/25-26/0071', type: 'IMPORT', vendorId: 'v5', date: daysAgo(130), status: 'RECEIVED', shipmentId: 'sh3', lines: [L('p20', 500), L('p21', 250), L('p22', 60), L('p36', 400)], createdBy: 'u3', approvedBy: 'u1', pi: { number: 'YGS-PI-0526-40', file: makeAttachment('PI-YGS-0526-40.pdf'), status: 'APPROVED', stampedFile: makeAttachment('PI-YGS-0526-40-STAMPED.pdf') }, mrpConfirmed: true, labelsSent: true, barcodesGenerated: true, stickerConfirmed: true, qcApprovedAt: iso(daysAgo(80)), commercialInvoice: makeAttachment('CI-YGS-0526-40.pdf') },
    { id: 'po10', number: 'PO/25-26/0058', type: 'IMPORT', vendorId: 'v3', date: daysAgo(190), status: 'CLOSED', shipmentId: 'sh4', lines: [L('p12', 200), L('p13', 120), L('p14', 40), L('p31', 500)], createdBy: 'u3', approvedBy: 'u1', pi: { number: 'SCV-PI-0326-11', file: makeAttachment('PI-SCV-0326-11.pdf'), status: 'APPROVED' }, mrpConfirmed: true, labelsSent: true, barcodesGenerated: true, stickerConfirmed: true },
    { id: 'po11', number: 'PO/26-27/0110', type: 'DOMESTIC', vendorId: 'v6', date: daysAgo(3), status: 'APPROVED', lines: [L('p5', 25)], createdBy: 'u3', approvedBy: 'u1', requiresCustomerPayment: true, linkedSoId: 'so_open_4', customerPaid: false, note: 'Back-to-back: Amar Electricals order. Vendor dispatch only after customer payment.' },
    { id: 'po12', number: 'PO/26-27/0099', type: 'DOMESTIC', vendorId: 'v7', date: daysAgo(35), status: 'RECEIVED', lines: [L('p7', 30)], createdBy: 'u3', approvedBy: 'u1', receivedAt: daysAgo(20), vendorDispatch: { lrNo: 'CMW/LR/5521', date: daysAgo(24) } },
  ].map((po) => ({
    currency: (po.vendorId === 'v6' || po.vendorId === 'v7') ? 'INR' : 'USD',
    paymentTerms: null,
    qc: [],
    improvements: [],
    deliverySchedule: [],
    docs: [],
    timeline: [{ ts: iso(po.date), text: `PO created by ${po.createdBy === 'u3' ? 'Arjun Nair' : 'system'}` }],
    mrpConfirmed: false,
    labelsSent: false,
    barcodesGenerated: false,
    stickerConfirmed: false,
    ...po,
  }))
  // document lockers
  const lock = {
    po6: ['PI-NHP-0826-71.pdf', 'PI-NHP-0826-71-STAMPED.pdf', 'MRP-Stickers-PO0094.pdf', 'Barcodes-PO0094.pdf', 'CI-NHP-0826-71.pdf', 'PL-NHP-0826-71.xlsx'],
    po7: ['PI-ZAQ-0726-12.pdf', 'PI-ZAQ-0726-12-STAMPED.pdf', 'MRP-Stickers-PO0088.pdf', 'CI-ZAQ-0726-12.pdf', 'PL-ZAQ-0726-12.xlsx', 'BL-OLS2609114.pdf', 'Insurance-ICICI-LOMBARD-8812.pdf', 'SWIFT-Advance-PO0088.pdf', 'Freight-Selection-RFQ7.pdf'],
    po8: ['PI-TJC-0626-88.pdf', 'CI-TJC-0626-88.pdf', 'PL-TJC-0626-88.xlsx', 'BL-OLS2608870.pdf', 'Insurance-8790.pdf', 'CAN-NSICT-2210.pdf', 'IGM-2610-4471.pdf', 'BOE-6612009.pdf', 'SWIFT-Advance-PO0082.pdf'],
    po9: ['PI-YGS-0526-40.pdf', 'CI-YGS-0526-40.pdf', 'PL-YGS-0526-40.xlsx', 'BL-OLS2607702.pdf', 'Insurance-8611.pdf', 'CAN-2608.pdf', 'IGM-2608-1180.pdf', 'BOE-6588120.pdf', 'SWIFT-Advance-PO0071.pdf', 'SWIFT-Balance-PO0071.pdf', 'TELEX-Release-PO0071.pdf', 'CHA-Bill-SCH-0912.pdf', 'GRN-Btali-0021.pdf'],
  }
  for (const po of pos) if (lock[po.id]) po.docs = docs(lock[po.id])

  const shipments = [
    { id: 'sh1', number: 'SH/26-27/0024', poIds: ['po7'], vendorId: 'v4', forwarderId: 'fw1', indianForwarderId: 'fw3', chaId: 'cha1', containerNo: 'TGHU 884120 3', containerType: '40HC', blNo: 'OLS2609114', etd: daysAgo(14), eta: addDays(today(), 12), status: 'IN_TRANSIT', telexReleased: false, milestones: milestones(daysAgo(14), addDays(today(), 12), 2), freight: { rate: 1850, currency: 'USD' } },
    { id: 'sh2', number: 'SH/26-27/0022', poIds: ['po8'], vendorId: 'v2', forwarderId: 'fw1', indianForwarderId: 'fw3', chaId: 'cha1', containerNo: 'MSKU 702213 6', containerType: '40FT', blNo: 'OLS2608870', etd: daysAgo(27), eta: daysAgo(1), status: 'AT_PORT', telexReleased: false, milestones: milestones(daysAgo(27), daysAgo(1), 5, 4), freight: { rate: 1720, currency: 'USD' } },
    { id: 'sh3', number: 'SH/26-27/0019', poIds: ['po9'], vendorId: 'v5', forwarderId: 'fw1', indianForwarderId: 'fw3', chaId: 'cha1', containerNo: 'CMAU 551809 1', containerType: '40HC', blNo: 'OLS2607702', etd: daysAgo(58), eta: daysAgo(30), ata: daysAgo(29), status: 'RECEIVED', telexReleased: true, milestones: milestones(daysAgo(58), daysAgo(30), 10, 6), freight: { rate: 1680, currency: 'USD' } },
    { id: 'sh4', number: 'SH/25-26/0015', poIds: ['po10'], vendorId: 'v3', forwarderId: 'fw1', indianForwarderId: 'fw2', chaId: 'cha1', containerNo: 'OOLU 330912 8', containerType: '40FT', blNo: 'OLS2604410', etd: daysAgo(150), eta: daysAgo(122), ata: daysAgo(120), status: 'RECEIVED', telexReleased: true, milestones: milestones(daysAgo(150), daysAgo(122), 10), freight: { rate: 1950, currency: 'USD' } },
  ].map((s) => ({
    landedCost: s.status === 'RECEIVED'
      ? { finalized: true, method: 'VALUE', freightINR: Math.round(s.freight.rate * FX.USD), insurance: 18500, duty: s.id === 'sh3' ? 186400 : 211000, igst: s.id === 'sh3' ? 402100 : 455000, cha: 28500, portTransport: 14500, other: 6200, finalizedAt: iso(addDays(s.ata, 6)) }
      : { finalized: false, method: 'VALUE', freightINR: Math.round(s.freight.rate * FX.USD), insurance: 0, duty: 0, igst: 0, cha: 0, portTransport: 0, other: 0 },
    inward: s.status === 'RECEIVED' ? { grnNo: s.id === 'sh3' ? 'GRN/26-27/0021' : 'GRN/25-26/0118', date: addDays(s.ata, 2), receivedBy: 'u17', discrepancies: s.id === 'sh3' ? [{ productId: 'p21', expected: 250, received: 246, type: 'SHORT', note: '4 cartons short – adjust in next PO', settled: false }, { productId: 'p36', expected: 400, received: 402, type: 'EXCESS', note: '2 extra pcs', settled: false }] : [] , qcMedia: s.id === 'sh3' ? docs(['Inward-QC-SPRY-pallets.jpg', 'Inward-QC-damaged-carton.jpg'], 'u17') : [] } : null,
    alerts: [],
    ...s,
  }))
  return { purchaseOrders: pos, shipments }
}

// ------------------------------------------------------------------ SALES HISTORY + OPEN ORDERS
const SEASON = {
  Pumps: [0.7, 0.8, 1.1, 1.5, 1.7, 1.4, 1.0, 0.9, 0.9, 0.8, 0.7, 0.6],
  'Air Compressors': [1, 1, 1.1, 1, 0.9, 0.8, 0.8, 0.9, 1, 1.2, 1.1, 1],
  'Vacuum Cleaners': [0.9, 0.9, 1, 0.9, 0.8, 0.9, 1, 1.1, 1.2, 1.5, 1.3, 1],
  'Pressure Washers': [0.9, 0.9, 1, 1, 0.9, 0.8, 0.8, 0.9, 1.1, 1.5, 1.3, 1],
  'Spraying Equipment': [0.6, 0.7, 0.9, 0.9, 1.1, 1.6, 1.8, 1.6, 1.2, 0.9, 0.7, 0.6],
  'Spare Parts': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
}
export const dealerUnitPrice = (product, priceList, partner) => {
  const disc = (priceList?.baseDiscountPct ?? 50) + (partner?.extraDiscountPct || 0)
  return round2(product.mrp * (1 - disc / 100))
}

export const seedSales = (products, partners, priceLists) => {
  const rnd = mulberry32(20261026)
  const plById = Object.fromEntries(priceLists.map((p) => [p.id, p]))
  const active = partners.filter((p) => (p.type === 'DEALER' || p.type === 'FRANCHISE') && (p.stage === 'CURRENT' || p.stage === 'DEAD'))
  const fgs = products.filter((p) => p.type === 'FG')
  const spares = products.filter((p) => p.type === 'SPARE')
  const weightPick = (arr) => {
    const total = arr.reduce((a, x) => a + x.popularity, 0)
    let r = rnd() * total
    for (const x of arr) { r -= x.popularity; if (r <= 0) return x }
    return arr[arr.length - 1]
  }
  const dealerWeight = { A: 3, B: 2, C: 1, F: 2 }
  const pickDealer = () => {
    const total = active.reduce((a, d) => a + dealerWeight[d.tier], 0)
    let r = rnd() * total
    for (const d of active) { r -= dealerWeight[d.tier]; if (r <= 0) return d }
    return active[0]
  }
  const salesOrders = []
  const invoices = []
  const receipts = []
  let soN = 0, invN = 0, rcN = 0
  const end = new Date()
  for (let back = 365; back >= 4; back -= 1) {
    const d = new Date(end)
    d.setDate(d.getDate() - back)
    const dateStr = d.toISOString().slice(0, 10)
    const month = d.getMonth()
    if (d.getDay() === 0) continue
    const perDay = rnd() < 0.55 ? 1 : rnd() < 0.5 ? 2 : 0
    for (let k = 0; k < perDay; k++) {
      let dealer = pickDealer()
      if (dealer.stage === 'DEAD' && back < 280) dealer = active[0]
      const pl = plById[dealer.priceListId]
      const nLines = 1 + Math.floor(rnd() * 4)
      const used = new Set()
      const lines = []
      for (let l = 0; l < nLines; l++) {
        const pool = rnd() < 0.72 ? fgs : spares
        const p = weightPick(pool)
        if (used.has(p.id)) continue
        used.add(p.id)
        const season = SEASON[p.category][month]
        const base = p.type === 'SPARE' ? 80 + rnd() * 320 : 10 + rnd() * (p.popularity * 9)
        const qty = Math.max(1, Math.round(base * season))
        const price = dealerUnitPrice(p, pl, dealer)
        lines.push({ productId: p.id, qty, price, discountPct: 0, amount: round2(qty * price) })
      }
      if (!lines.length) continue
      const subtotal = round2(lines.reduce((a, x) => a + x.amount, 0))
      const gst = round2(subtotal * 0.18)
      const total = round2(subtotal + gst)
      soN++; invN++; rcN++
      const soId = `soh${soN}`
      const invId = `invh${invN}`
      const invDate = addDays(dateStr, 1)
      const dispDate = addDays(dateStr, 2)
      salesOrders.push({ id: soId, number: `SO/${back > 207 ? '25-26' : '26-27'}/${String(soN).padStart(4, '0')}`, partnerId: dealer.id, date: dateStr, source: rnd() < 0.3 ? 'PORTAL' : 'SALES', salespersonId: dealer.salespersonId, lines, subtotal, gst, total, status: 'DISPATCHED', paymentStatus: 'PAID', paidAmount: total, invoiceId: invId, warehouseId: 'WH-BTALI', transporterId: dealer.transporterId, history: true })
      invoices.push({ id: invId, number: `BT/${back > 207 ? '25-26' : '26-27'}/${String(invN).padStart(4, '0')}`, soId, partnerId: dealer.id, date: invDate, lines, subtotal, gst, total, transporterId: dealer.transporterId, vehicleNo: '', status: 'DISPATCHED', lr: { number: `LR${String(700000 + invN * 13)}`, date: dispDate, uploadedBy: 'u8' }, dispatchDate: dispDate, sentToBtali: true, emailed: true, irn: `IRN${String(9.1e9 + invN * 7919)}`, ewayBill: `${String(3.81e11 + invN * 1031).slice(0, 12)}`, type: 'TAX', history: true, freightCost: Math.round(400 + rnd() * 2400), units: [] })
      receipts.push({ id: `rch${rcN}`, number: `RCPT/${String(rcN).padStart(4, '0')}`, partnerId: dealer.id, soId, amount: total, mode: rnd() < 0.7 ? 'NEFT' : rnd() < 0.5 ? 'RTGS' : 'UPI', ref: `UTR${String(5e10 + rcN * 7717).slice(0, 12)}`, date: dateStr, bankId: 'bk1', history: true })
    }
  }
  return { salesOrders, invoices, receipts, counters: { SO: soN, INV: invN, RCPT: rcN } }
}

export const seedOpenOrders = (products, partners, priceLists, counters) => {
  const plById = Object.fromEntries(priceLists.map((p) => [p.id, p]))
  const pr = (id) => products.find((p) => p.id === id)
  const partner = (id) => partners.find((p) => p.id === id)
  const mk = (id, partnerId, date, linesSpec, status, extra = {}) => {
    const d = partner(partnerId)
    const pl = plById[d.priceListId]
    const lines = linesSpec.map(([pid, qty]) => {
      const price = dealerUnitPrice(pr(pid), pl, d)
      return { productId: pid, qty, price, discountPct: 0, amount: round2(qty * price) }
    })
    const subtotal = round2(lines.reduce((a, x) => a + x.amount, 0))
    const gst = round2(subtotal * 0.18)
    const total = round2(subtotal + gst)
    counters.SO++
    return { id, number: `SO/26-27/${String(counters.SO).padStart(4, '0')}`, partnerId, date, source: 'SALES', salespersonId: d.salespersonId, lines, subtotal, gst, total, status, paymentStatus: status === 'CONFIRMED' || status === 'PENDING_REVIEW' ? 'UNPAID' : 'PAID', paidAmount: status === 'CONFIRMED' || status === 'PENDING_REVIEW' ? 0 : total, warehouseId: 'WH-BTALI', transporterId: d.transporterId, timeline: [{ ts: iso(date, 11), text: 'Order created' }], ...extra }
  }
  const so = [
    mk('so_open_1', 'd1', today(), [['p2', 20], ['p1', 15], ['p25', 100]], 'PENDING_REVIEW', { source: 'PORTAL', note: 'Placed via Dealer Portal' }),
    mk('so_open_2', 'd10', daysAgo(1), [['p16', 12], ['p33', 20], ['p34', 10]], 'PENDING_REVIEW', { source: 'PORTAL', note: 'Diwali stock-up' }),
    mk('so_open_3', 'd3', daysAgo(2), [['p2', 30], ['p3', 10], ['p26', 50]], 'CONFIRMED'),
    mk('so_open_4', 'd14', daysAgo(3), [['p5', 25]], 'CONFIRMED', { note: 'Back-to-back domestic procurement (PO/26-27/0110)' }),
    mk('so_open_5', 'd7', daysAgo(2), [['p12', 10], ['p13', 6], ['p31', 40]], 'CONFIRMED'),
    mk('so_open_6', 'd5', daysAgo(4), [['p20', 40], ['p37', 40]], 'CONFIRMED'),
    mk('so_open_7', 'd2', daysAgo(2), [['p16', 15], ['p17', 8], ['p12', 10]], 'PAID'),
    mk('so_open_8', 'd11', daysAgo(3), [['p2', 25], ['p27', 100]], 'PAID'),
    mk('so_open_9', 'd8', daysAgo(1), [['p9', 6], ['p8', 10], ['p28', 50]], 'PAID'),
    mk('so_open_10', 'd16', daysAgo(1), [['p20', 30], ['p21', 20]], 'PAID'),
    mk('so_open_11', 'd17', daysAgo(5), [['p4', 8], ['p1', 12]], 'INVOICED'),
    mk('so_open_12', 'd6', daysAgo(4), [['p13', 5], ['p16', 10]], 'INVOICED'),
    mk('so_open_13', 'd4', daysAgo(6), [['p20', 50], ['p36', 60]], 'INVOICED'),
    mk('so_open_14', 'd9', daysAgo(2), [['p2', 200]], 'PAID', { note: 'Large order – stock may be insufficient' }),
    // Gujarat facility (virtual warehouse WH-GUJ): delivered directly by the facility using client-arranged transport
    mk('so_guj_1', 'd5', daysAgo(2), [['p5', 6], ['p26', 40]], 'PAID', { warehouseId: 'WH-GUJ', gujarat: true, note: 'Gujarat facility direct delivery', gujTransport: { transporterName: 'Saurashtra Roadways', vehicleNo: 'GJ03 BV 4471', driver: 'Kanubhai Rathod', driverPhone: '98250 41187', notes: 'Client pickup from GIDC Metoda gate 2', capturedAt: `${daysAgo(2)}T12:00:00.000Z` } }),
    mk('so_guj_2', 'd17', daysAgo(1), [['p7', 4], ['p26', 20]], 'CONFIRMED', { warehouseId: 'WH-GUJ', gujarat: true, note: 'Gujarat facility direct delivery', gujTransport: { transporterName: 'Patel Freight Carriers', vehicleNo: 'GJ05 AZ 6650', driver: '', driverPhone: '', notes: '', capturedAt: `${daysAgo(1)}T15:00:00.000Z` } }),
  ]
  return so
}

// ------------------------------------------------------------------ UNITS (barcodes) + WARRANTIES + TICKETS
export const seedUnits = (products, partners) => {
  const units = []
  const series = {}
  const make = (productId, poId, vendorId, status, locationId, extra = {}) => {
    const p = products.find((x) => x.id === productId)
    const prefix = CATEGORY_PREFIX[p.category]
    series[prefix] = (series[prefix] || 1000) + 1
    const code = `${prefix}${String(series[prefix]).padStart(6, '0')}`
    const u = { code, productId, poId, vendorId, status, locationId, partnerId: null, invoiceId: null, history: [], ...extra }
    units.push(u)
    return u
  }
  // PO9 received units (sprayers) – in warehouse / at dealers / sold
  const sprayerDealers = ['d5', 'd2', 'd16', 'f1', 'f2']
  for (let i = 0; i < 60; i++) {
    const pid = i < 30 ? 'p20' : i < 48 ? 'p21' : 'p22'
    const u = make(pid, 'po9', 'v5', 'IN_WAREHOUSE', 'WH-BTALI')
    u.history.push({ ts: iso(daysAgo(130)), event: 'Barcode generated', ref: 'PO/25-26/0071' })
    u.history.push({ ts: iso(daysAgo(66)), event: 'Packed & scanned at factory', ref: 'Yongkang Greenfield' })
    u.history.push({ ts: iso(daysAgo(58)), event: 'Shipped in container CMAU 551809 1', ref: 'SH/26-27/0019' })
    u.history.push({ ts: iso(daysAgo(27)), event: 'Inward scanned at Btali', ref: 'GRN/26-27/0021' })
    if (i % 3 === 0 || i % 5 === 0) {
      const pid2 = sprayerDealers[i % sprayerDealers.length]
      u.status = 'AT_PARTNER'
      u.partnerId = pid2
      u.locationId = pid2
      u.history.push({ ts: iso(daysAgo(20 - (i % 7))), event: `Dispatched to ${partners.find((p) => p.id === pid2).name}`, ref: 'Invoice' })
      if (i % 2 === 0) {
        u.status = 'SOLD'
        u.saleDate = daysAgo(12 - (i % 9))
        u.history.push({ ts: iso(u.saleDate), event: 'Sold to end customer (warranty activated)', ref: 'POS' })
      }
    }
  }
  // PO7 / PO8 in transit units
  for (let i = 0; i < 24; i++) {
    const u = make(i < 16 ? 'p16' : 'p19', 'po7', 'v4', 'IN_TRANSIT', 'WH-TRANSIT')
    u.history.push({ ts: iso(daysAgo(80)), event: 'Barcode generated', ref: 'PO/26-27/0088' })
    u.history.push({ ts: iso(daysAgo(16)), event: 'Packed & scanned at factory', ref: 'Zhejiang Aquajet' })
    u.history.push({ ts: iso(daysAgo(14)), event: 'Shipped in container TGHU 884120 3', ref: 'SH/26-27/0024' })
  }
  // PO6 packed (ready to ship) & PO5 generated (not packed)
  for (let i = 0; i < 20; i++) {
    const u = make(i < 10 ? 'p3' : 'p4', 'po6', 'v1', 'PACKED', 'VENDOR')
    u.history.push({ ts: iso(daysAgo(58)), event: 'Barcode generated', ref: 'PO/26-27/0094' })
    u.history.push({ ts: iso(daysAgo(4)), event: 'Packed & scanned at factory', ref: 'Ningbo Hailong' })
  }
  for (let i = 0; i < 16; i++) {
    const u = make(i < 8 ? 'p12' : 'p13', 'po5', 'v3', 'GENERATED', 'VENDOR')
    u.history.push({ ts: iso(daysAgo(40)), event: 'Barcode generated', ref: 'PO/26-27/0097' })
  }
  // older pump & washer units sold through dealers / franchise (warranty base)
  const older = [['p2', 'd1'], ['p2', 'd3'], ['p1', 'f1'], ['p16', 'f1'], ['p17', 'd10'], ['p12', 'f3'], ['p9', 'd14'], ['p8', 'f2'], ['p13', 'd2'], ['p4', 'd3'], ['p16', 'd2'], ['p2', 'f4']]
  older.forEach(([pid, partnerId], i) => {
    const u = make(pid, 'po10', products.find((p) => p.id === pid).vendorId, 'SOLD', partnerId, { partnerId })
    u.saleDate = daysAgo(40 + i * 31)
    u.history.push({ ts: iso(daysAgo(200 + i)), event: 'Barcode generated', ref: 'PO/25-26/0058' })
    u.history.push({ ts: iso(daysAgo(118)), event: 'Inward scanned at Btali', ref: 'GRN/25-26/0118' })
    u.history.push({ ts: iso(daysAgo(60 + i * 31 > 110 ? 110 : 60 + i * 31)), event: `Dispatched to ${partners.find((p) => p.id === partnerId).name}`, ref: 'Invoice' })
    u.history.push({ ts: iso(u.saleDate), event: 'Sold to end customer (warranty activated)', ref: 'POS / Warranty card' })
  })
  return { units, series }
}

const CUSTOMERS = [
  ['Ramesh Gaikwad', '98220 45110', 'Pune'], ['Sunita Rao', '98450 22018', 'Bengaluru'], ['Harjit Singh', '98140 33019', 'Ludhiana'], ['Mohd. Arif', '98390 11220', 'Lucknow'],
  ['Kiran Patel', '98250 77801', 'Ahmedabad'], ['Lakshmi Narayanan', '94430 51190', 'Coimbatore'], ['Ajay Deshmukh', '98230 66012', 'Pune'], ['Pooja Bansal', '98110 90021', 'New Delhi'],
  ['Venkatesh Iyer', '98400 33110', 'Chennai'], ['Bhavesh Shah', '98790 44521', 'Surat'], ['Anita D\'Souza', '98200 77314', 'Mumbai'], ['Rakesh Yadav', '94150 88231', 'Lucknow'],
  ['Farmer Coop. Society, Baramati', '02112 224455', 'Baramati'], ['Gurdeep Farms', '98720 10021', 'Amritsar'], ['Shanti Car Wash', '98330 55120', 'Ahmedabad'],
]
export const seedWarranties = (units, products) => {
  const sold = units.filter((u) => u.status === 'SOLD')
  return sold.map((u, i) => {
    const p = products.find((x) => x.id === u.productId)
    const [name, phone, city] = CUSTOMERS[i % CUSTOMERS.length]
    const months = p.warrantyMonths
    const start = u.saleDate
    return {
      id: `w${i + 1}`,
      number: `WAR-${String(5001 + i)}`,
      barcode: u.code,
      productId: u.productId,
      partnerId: u.partnerId,
      customer: { name, phone, city, email: '' },
      saleDate: start,
      startDate: start,
      endDate: addDays(start, Math.round(months * 30.4)),
      months,
      partnerMonths: months + 3,
      vendorMonths: months + 6,
      source: u.partnerId?.startsWith('f') ? 'POS' : 'DEALER_PORTAL',
      invoiceRef: `CUST-${4400 + i}`,
      status: 'ACTIVE',
      createdAt: iso(start),
    }
  })
}

export const seedWarrantyRules = () => [
  { id: 'wr1', scope: 'CATEGORY', ref: 'Pumps', months: 12, partnerMonths: 15, vendorMonths: 18, exclusions: 'Dry running, voltage fluctuation damage, burnt winding due to single-phasing', extended: 'Optional +12 months for ₹499' },
  { id: 'wr2', scope: 'CATEGORY', ref: 'Air Compressors', months: 12, partnerMonths: 15, vendorMonths: 18, exclusions: 'Tank corrosion due to non-draining, physical damage', extended: '' },
  { id: 'wr3', scope: 'CATEGORY', ref: 'Vacuum Cleaners', months: 12, partnerMonths: 15, vendorMonths: 18, exclusions: 'Filters, hoses (consumables)', extended: '' },
  { id: 'wr4', scope: 'CATEGORY', ref: 'Pressure Washers', months: 12, partnerMonths: 15, vendorMonths: 18, exclusions: 'Seals, nozzles, hose wear; use without water', extended: 'Optional +12 months for ₹699' },
  { id: 'wr5', scope: 'CATEGORY', ref: 'Spraying Equipment', months: 6, partnerMonths: 9, vendorMonths: 12, exclusions: 'Chemical corrosion, battery after 6 months', extended: '' },
  { id: 'wr6', scope: 'CATEGORY', ref: 'Spare Parts', months: 6, partnerMonths: 6, vendorMonths: 12, exclusions: 'Wear & tear items', extended: '' },
  { id: 'wr7', scope: 'VENDOR', ref: 'v5', months: null, partnerMonths: null, vendorMonths: 12, exclusions: 'Greenfield covers motor & pump only', extended: '' },
  { id: 'wr8', scope: 'PRODUCT', ref: 'p5', months: 18, partnerMonths: 21, vendorMonths: 24, exclusions: 'Sand/silt damage', extended: '' },
]

export const seedTickets = () => {
  const t = (id, n, src, cat, subject, extra) => ({
    id, number: `TKT-${String(n).padStart(5, '0')}`, source: src, category: cat, subject, description: subject, priority: 'MEDIUM', stage: 'LOGGED', assigneeId: null, slaHours: 72, createdAt: iso(daysAgo(2)), updates: [], attachments: [], ...extra,
  })
  return [
    t('tk1', 1201, 'DEALER', 'PRODUCT_DEFECT', 'Monoblock 1 HP – motor humming, not starting', { partnerId: 'd1', productId: 'p2', barcode: null, priority: 'HIGH', stage: 'IN_PROGRESS', assigneeId: 'u11', createdAt: iso(daysAgo(4)), updates: [{ ts: iso(daysAgo(4)), by: 'u14', text: 'Customer reports humming sound, shaft jammed.' }, { ts: iso(daysAgo(3)), by: 'u11', text: 'Capacitor suspected. Replacement capacitor dispatched with next order.', stage: 'IN_PROGRESS' }] }),
    t('tk2', 1202, 'DEALER', 'SPARE_REQUIREMENT', 'Need 20 HEPA filters urgently', { partnerId: 'd2', productId: 'p31', stage: 'UNDER_REVIEW', assigneeId: 'u5', createdAt: iso(daysAgo(1)) }),
    t('tk3', 1203, 'BTALI', 'DAMAGE_IN_TRANSIT', '3 cartons of WD30 damaged at inward (SH/26-27/0019)', { productId: 'p13', orderRef: 'SH/26-27/0019', priority: 'HIGH', stage: 'LOGGED', createdAt: iso(daysAgo(6)), attachments: [makeAttachment('damage-WD30-carton.jpg')] }),
    t('tk4', 1204, 'VENDOR', 'VENDOR_ISSUE', 'Ningbo Hailong: request to revise MRP sticker font size', { vendorId: 'v1', orderRef: 'PO/26-27/0094', stage: 'RESOLVED', assigneeId: 'u3', createdAt: iso(daysAgo(15)), updates: [{ ts: iso(daysAgo(14)), by: 'u3', text: 'Approved new font (Arial Bold 9pt).', stage: 'RESOLVED' }] }),
    t('tk5', 1205, 'FRANCHISE', 'WARRANTY_CLAIM', 'Battery sprayer not holding charge', { partnerId: 'f1', productId: 'p20', stage: 'UNDER_REVIEW', assigneeId: 'u11', createdAt: iso(daysAgo(3)), claimId: 'wc2' }),
    t('tk6', 1206, 'WEBSITE', 'INSTALLATION', 'Openwell submersible – need installation help', { productId: 'p4', customer: { name: 'Lakshmi Narayanan', phone: '94430 51190', city: 'Coimbatore' }, stage: 'LOGGED', createdAt: iso(daysAgo(0)) }),
    t('tk7', 1207, 'DEALER', 'GENERAL', 'Invoice copy missing for SO/26-27 last week', { partnerId: 'd7', stage: 'CLOSED', assigneeId: 'u8', createdAt: iso(daysAgo(20)), updates: [{ ts: iso(daysAgo(19)), by: 'u8', text: 'Invoice re-sent by email.', stage: 'CLOSED' }] }),
    t('tk8', 1208, 'DEALER', 'PRODUCT_DEFECT', 'Pressure washer 2200 W – pressure drops after 10 min', { partnerId: 'd10', productId: 'p17', priority: 'HIGH', stage: 'IN_PROGRESS', assigneeId: 'u11', escalatedToVendor: true, vendorId: 'v4', vendorResponse: null, createdAt: iso(daysAgo(9)), updates: [{ ts: iso(daysAgo(8)), by: 'u11', text: 'Unloader valve defect suspected – batch issue. Escalated to Zhejiang Aquajet.', stage: 'IN_PROGRESS' }] }),
    t('tk9', 1209, 'BTALI', 'SHORTAGE', 'Short receipt: Battery Sprayer 20 L – 4 pcs', { productId: 'p21', orderRef: 'GRN/26-27/0021', stage: 'IN_PROGRESS', assigneeId: 'u3', createdAt: iso(daysAgo(27)) }),
    t('tk10', 1210, 'INTERNAL', 'GENERAL', 'Update brochure for BT-PW22 with new specs', { productId: 'p17', priority: 'LOW', stage: 'LOGGED', createdAt: iso(daysAgo(5)) }),
  ]
}

export const seedWarrantyClaims = (warranties) => {
  const w = (i) => warranties[i]
  return [
    { id: 'wc1', number: 'WCL-0001', warrantyId: w(0)?.id, barcode: w(0)?.barcode, productId: w(0)?.productId, partnerId: w(0)?.partnerId, issue: 'Motor not starting', requestType: 'REPAIR', status: 'CLOSED', bearer: 'VENDOR', cost: 1450, createdAt: iso(daysAgo(30)), timeline: [{ ts: iso(daysAgo(30)), text: 'Claim submitted' }, { ts: iso(daysAgo(28)), text: 'Approved – repair' }, { ts: iso(daysAgo(20)), text: 'Repair completed, closed' }] },
    { id: 'wc2', number: 'WCL-0002', warrantyId: w(1)?.id, barcode: w(1)?.barcode, productId: w(1)?.productId, partnerId: w(1)?.partnerId, issue: 'Battery not holding charge', requestType: 'REPLACEMENT', status: 'SUBMITTED', bearer: null, cost: 0, createdAt: iso(daysAgo(3)), ticketId: 'tk5', timeline: [{ ts: iso(daysAgo(3)), text: 'Claim submitted by franchise' }] },
    { id: 'wc3', number: 'WCL-0003', warrantyId: w(4)?.id, barcode: w(4)?.barcode, productId: w(4)?.productId, partnerId: w(4)?.partnerId, issue: 'Leakage from pump head', requestType: 'REPLACEMENT', status: 'VENDOR_ESCALATED', bearer: 'VENDOR', cost: 2600, createdAt: iso(daysAgo(10)), vendorClaim: { vendorId: 'v5', status: 'AWAITING_VENDOR', sentAt: iso(daysAgo(8)), response: null }, timeline: [{ ts: iso(daysAgo(10)), text: 'Claim submitted' }, { ts: iso(daysAgo(9)), text: 'Approved – replacement issued' }, { ts: iso(daysAgo(8)), text: 'Escalated to Yongkang Greenfield via Vendor Portal' }] },
    { id: 'wc4', number: 'WCL-0004', warrantyId: w(6)?.id, barcode: w(6)?.barcode, productId: w(6)?.productId, partnerId: w(6)?.partnerId, issue: 'Spray pressure weak', requestType: 'REPAIR', status: 'UNDER_REVIEW', bearer: null, cost: 0, createdAt: iso(daysAgo(1)), timeline: [{ ts: iso(daysAgo(1)), text: 'Claim submitted' }] },
  ].filter((c) => c.warrantyId)
}

export const seedStock = (products) => {
  // Btali on-hand; a few deliberately below reorder level to trigger alerts
  const low = { p2: 46, p20: 70, p25: 180, p27: 210, p11: 85, p36: 120 }
  const zero = { p10: 4, p18: 6 }
  const wh = {}
  for (const p of products) {
    if (low[p.id] != null) wh[p.id] = low[p.id]
    else if (zero[p.id] != null) wh[p.id] = zero[p.id]
    else wh[p.id] = Math.round(p.reorderLevel * (1.4 + ((p.popularity * 37) % 23) / 10))
  }
  wh.p21 = 246
  const guj = { p5: 18, p7: 22, p26: 140 }
  return { 'WH-BTALI': wh, 'WH-GUJ': guj }
}

export const seedPartnerStock = (partners, products) => {
  const rnd = mulberry32(77)
  for (const p of partners) {
    if (p.type === 'EXPORT' || p.stage !== 'CURRENT') continue
    if (p.type === 'DEALER' && rnd() < 0.45) continue
    const stock = {}
    for (const pr of products) {
      if (rnd() < (p.type === 'FRANCHISE' ? 0.75 : 0.35)) stock[pr.id] = Math.round((pr.type === 'SPARE' ? 10 : 1) + rnd() * (pr.type === 'SPARE' ? 40 : 12))
    }
    p.stock = stock
    p.stockUpdatedAt = daysAgo(Math.floor(rnd() * 9))
    p.stockMin = Object.fromEntries(Object.keys(stock).map((k) => [k, products.find((x) => x.id === k).type === 'SPARE' ? 10 : 3]))
  }
  return partners
}

export const seedNotifications = () => [
  { id: 'n1', ts: iso(today(), 9), title: 'Stock below reorder level', body: '6 items breached threshold incl. Monoblock Pump 1 HP (46 / 80).', type: 'warning', link: '/erp/purchase/reorder', roles: ['PURCHASE', 'ADMIN'], read: false },
  { id: 'n2', ts: iso(today(), 8), title: 'Container at port', body: 'SH/26-27/0022 (MSKU 702213 6) arrived Nhava Sheva – BOE filed, awaiting clearance.', type: 'info', link: '/erp/purchase/shipments', roles: ['PURCHASE', 'ACCOUNTS', 'ADMIN', 'FINANCE_HEAD', 'BTALI', 'DISPATCH'], read: false },
  { id: 'n3', ts: iso(daysAgo(1), 16), title: 'New portal order', body: 'Sharma Agro Traders placed an order via Dealer Portal – review required.', type: 'info', link: '/erp/sales/orders', roles: ['SALES_MANAGER', 'SALES_EXEC', 'ADMIN'], read: false },
  { id: 'n4', ts: iso(daysAgo(1), 12), title: 'PI uploaded by vendor', body: 'Yongkang Greenfield uploaded PI for PO/26-27/0106 – approval pending.', type: 'info', link: '/erp/purchase/orders', roles: ['PURCHASE', 'ADMIN'], read: false },
  { id: 'n5', ts: iso(daysAgo(2), 15), title: 'QC media awaiting review', body: 'Suzhou Clearvac uploaded 3 QC files for PO/26-27/0097.', type: 'info', link: '/erp/purchase/qc', roles: ['PURCHASE', 'ADMIN'], read: false },
  { id: 'n6', ts: iso(daysAgo(2), 10), title: 'Payments due this week', body: '3 vendor bills (₹18.4L) due in the next 7 days.', type: 'warning', link: '/erp/accounts/payments', roles: ['FINANCE_HEAD', 'ACCOUNTS', 'ADMIN'], read: false },
  { id: 'n7', ts: iso(daysAgo(3), 11), title: 'Dealer inactive', body: 'Gupta Brothers Trading has not ordered in 45+ days.', type: 'warning', link: '/erp/sales/dealers', roles: ['SALES_MANAGER', 'SALES_EXEC', 'ADMIN'], read: true },
]
