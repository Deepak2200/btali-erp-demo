// Module seed for "purchase". Receives the core seed (read-only) and returns NEW collections only.
import { daysAgo, round2 } from '../../lib/format'

const SPECS = { '20FT': { cbm: 33, kg: 21700 }, '40FT': { cbm: 67, kg: 26500 }, '40HC': { cbm: 76, kg: 26500 } }

const itemsFrom = (core, poIds, urgent = []) =>
  core.purchaseOrders
    .filter((po) => poIds.includes(po.id))
    .flatMap((po) =>
      po.lines.map((l) => {
        const p = core.products.find((x) => x.id === l.productId)
        return {
          id: `${po.id}-${l.productId}`,
          poId: po.id,
          productId: l.productId,
          qty: l.qty,
          cbm: round2(l.qty * (p?.cbm || 0)),
          weight: round2(l.qty * (p?.weightKg || 0)),
          priority: urgent.includes(l.productId) ? 'URGENT' : 'NORMAL',
          container: 0,
        }
      }),
    )

const plan = (base, items) => {
  const spec = SPECS[base.containerType]
  const cbm = items.reduce((a, x) => a + x.cbm, 0)
  const kg = items.reduce((a, x) => a + x.weight, 0)
  return {
    containerCount: 1,
    capacityCbm: spec.cbm,
    maxWeightKg: spec.kg,
    utilizationPct: round2((cbm / spec.cbm) * 100),
    weightPct: round2((kg / spec.kg) * 100),
    totalCbm: round2(cbm),
    totalWeight: round2(kg),
    poIds: [...new Set(items.map((i) => i.poId))],
    items,
    ...base,
  }
}

export const purchaseSeed = (core) => ({
  containerPlans: [
    plan(
      {
        id: 'cp4',
        number: 'CP/26-27/0004',
        name: 'Nov consolidation – Hailong pumps + Clearvac vacuums',
        containerType: '20FT',
        status: 'PENDING_APPROVAL',
        createdBy: 'u3',
        createdAt: `${daysAgo(1)}T09:40:00.000Z`,
        submittedAt: `${daysAgo(1)}T10:05:00.000Z`,
        approvedBy: null,
        notes: 'Self-priming & openwell pumps marked urgent – North dealers short before rabi season. Clearvac lot to be loaded after QC release.',
        history: [
          { ts: `${daysAgo(1)}T09:40:00.000Z`, text: 'Plan drafted from system suggestion (1 × 20FT)', by: 'u3' },
          { ts: `${daysAgo(1)}T10:05:00.000Z`, text: 'Submitted for Director approval', by: 'u3' },
        ],
      },
      itemsFrom(core, ['po6', 'po5'], ['p3', 'p4']),
    ),
    plan(
      {
        id: 'cp3',
        number: 'CP/26-27/0003',
        name: 'Sep consolidation – Aquajet washers + Jinfeng compressors',
        containerType: '20FT',
        status: 'APPROVED',
        createdBy: 'u3',
        createdAt: `${daysAgo(102)}T11:00:00.000Z`,
        submittedAt: `${daysAgo(101)}T09:30:00.000Z`,
        approvedBy: 'u1',
        approvedAt: `${daysAgo(100)}T16:10:00.000Z`,
        approvalRemark: 'Approved – go with Oceanlink booking',
        notes: 'Washers prioritised for Diwali season.',
        history: [
          { ts: `${daysAgo(102)}T11:00:00.000Z`, text: 'Plan drafted from system suggestion', by: 'u3' },
          { ts: `${daysAgo(101)}T09:30:00.000Z`, text: 'Submitted for Director approval', by: 'u3' },
          { ts: `${daysAgo(100)}T16:10:00.000Z`, text: 'Approved – go with Oceanlink booking', by: 'u1' },
        ],
      },
      itemsFrom(core, ['po7', 'po8'], ['p16']),
    ),
  ],
})
