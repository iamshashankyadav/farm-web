import { beforeEach, describe, expect, it } from 'vitest'
import { addressPayload, batchWhen, cartStore, cartTotals, clock12, feesOf, freshness, journeyStep, refine, searchQuery, stepOf, waitsForBatch, whenParts, type Produce } from './shop'

const produce = (over: Partial<Produce>): Produce => ({
  id: 'l1', farmId: 'f1', farmName: 'Sahu Farm', farmRating: null, farmRatingCount: 0, district: 'Durg', village: 'Patan',
  cropId: 'tomato', cropName: 'Tomato', variety: 'Hybrid', description: null, qtyAvailable: 20, unit: 'kg', pricePerUnit: 30,
  harvestDate: '2026-11-20', isOrganic: false, mediaIds: [], createdAt: '', distanceM: 1000, ...over,
})

describe('cart', () => {
  beforeEach(() => cartStore.clear())

  it('adds, merges and caps at the stock', () => {
    cartStore.add(produce({}), 5)
    cartStore.add(produce({}), 30)
    expect(cartStore.get()).toHaveLength(1)
    expect(cartStore.get()[0]!.qty).toBe(20)
  })

  it('removes a line when its quantity reaches zero', () => {
    cartStore.add(produce({}), 2)
    cartStore.setQty('l1', 0)
    expect(cartStore.get()).toEqual([])
  })

  it('charges one delivery fee per farm', () => {
    cartStore.add(produce({}), 2)
    cartStore.add(produce({ id: 'l2', farmId: 'f2' }), 1)
    cartStore.add(produce({ id: 'l3', farmId: 'f2' }), 1)
    expect(cartTotals(cartStore.get())).toEqual({ subtotal: 120, farms: 2, delivery: 40, total: 160 })
  })
})

describe('search', () => {
  it('builds the query the catalog expects', () => {
    const q = new URLSearchParams(searchQuery({ lat: 21.2, lng: 81.3, radiusKm: 25, organic: true, sort: 'price' }, 'abc'))
    expect(Object.fromEntries(q)).toMatchObject({ lat: '21.2', lng: '81.3', radius_km: '25', organic: 'true', sort: 'price', cursor: 'abc' })
    expect(Number(q.get('limit'))).toBeLessThanOrEqual(50)
  })

  it('filters by category and by words in the crop, farm or village', () => {
    const crops = [{ id: 'tomato', name: 'Tomato', category: 'vegetable', defaultUnit: 'kg' as const }, { id: 'wheat', name: 'Wheat', category: 'grain', defaultUnit: 'quintal' as const }]
    const items = [produce({}), produce({ id: 'l2', cropId: 'wheat', cropName: 'Wheat', variety: null, farmName: 'Tandon Grains' })]
    expect(refine(items, { category: 'grain', text: '', crops }).map((p) => p.id)).toEqual(['l2'])
    expect(refine(items, { category: 'all', text: 'patan', crops }).map((p) => p.id)).toEqual(['l1', 'l2'])
    expect(refine(items, { category: 'all', text: 'tandon', crops }).map((p) => p.id)).toEqual(['l2'])
  })
})

describe('freshness and steps', () => {
  const now = new Date('2026-11-22T12:00:00').getTime()
  it('labels the age of the harvest', () => {
    expect(freshness('2026-11-22', now).label).toBe('Harvested today')
    expect(freshness('2026-11-21', now).label).toBe('Harvested yesterday')
    expect(freshness('2026-11-10', now)).toMatchObject({ tone: 'neutral', days: 12 })
  })
  it('sells weight in half units and countables whole', () => {
    expect(stepOf('kg')).toBe(0.5)
    expect(stepOf('dozen')).toBe(1)
  })
  it('places statuses on the journey', () => {
    expect(journeyStep('CONFIRMED')).toBe(1)
    expect(journeyStep('READY_FOR_DISPATCH')).toBe(journeyStep('PACKED'))  // packing = ready, no quality step
    expect(journeyStep('COMPLETED')).toBe(6)
  })
})

describe('addressPayload', () => {
  const ok = { line1: '12 Test Road', line2: '', city: 'Bhilai', pincode: '490006', phone: '+91 98765 43210', lat: '21.2', lng: '81.3' }
  it('builds the order service body, longitude first', () => {
    expect(addressPayload(ok)).toEqual({ line1: '12 Test Road', city: 'Bhilai', pincode: '490006', contactPhone: '+919876543210', location: { type: 'Point', coordinates: [81.3, 21.2] } })
  })
  it('explains what is wrong', () => {
    expect(addressPayload({ ...ok, pincode: '49' })).toMatch(/pincode/)
    expect(addressPayload({ ...ok, line1: '' })).toMatch(/street/)
    expect(addressPayload({ ...ok, lat: '' })).toMatch(/location/)
  })
})

describe('delivery mode', () => {
  const lines = () => {
    cartStore.clear()
    cartStore.add(produce({}), 2)
    cartStore.add(produce({ id: 'l2', farmId: 'f2' }), 1)
    return cartStore.get()
  }

  it('charges the lower shared-delivery fee for each farm when the customer can wait', () => {
    expect(cartTotals(lines(), 'IMMEDIATE').delivery).toBe(40)
    expect(cartTotals(lines(), 'FLEXIBLE').delivery).toBe(20)
  })

  it('uses the fees the order service reports, and the fallback until it answers', () => {
    expect(feesOf(undefined)).toEqual({ IMMEDIATE: 20, FLEXIBLE: 10 })
    const fees = feesOf({ options: [{ mode: 'FLEXIBLE', feePerOrder: 5 }, { mode: 'IMMEDIATE', feePerOrder: 25 }], batchTime: '10:00', nextBatchAt: '' })
    expect(cartTotals(lines(), 'FLEXIBLE', fees).delivery).toBe(10)
    expect(cartTotals(lines(), 'IMMEDIATE', fees).delivery).toBe(50)
  })

  it('writes the batch time on a 12-hour clock', () => {
    expect(clock12('10:00')).toBe('10:00 am')
    expect(clock12('00:30')).toBe('12:30 am')
    expect(clock12('15:05')).toBe('3:05 pm')
  })

  it('says whether the batch is today, tomorrow or on a later day (India time)', () => {
    const now = new Date('2026-11-24T02:00:00Z') // 07:30 in India
    expect(batchWhen('2026-11-24T04:30:00Z', now)).toBe('today 10:00 am')
    expect(batchWhen('2026-11-25T04:30:00Z', now)).toBe('tomorrow 10:00 am')
    expect(batchWhen('2026-11-28T04:30:00Z', now)).toMatch(/^Sat, 28 Nov, 10:00 am$/)
    expect(whenParts('2026-11-24T04:30:00Z').length).toBe(2)
  })

  it('only a FLEXIBLE order that has not left yet waits for the batch', () => {
    expect(waitsForBatch({ status: 'READY_FOR_DISPATCH', deliveryMode: 'FLEXIBLE' })).toBe(true)
    expect(waitsForBatch({ status: 'POOLED', deliveryMode: 'FLEXIBLE' })).toBe(false)
    expect(waitsForBatch({ status: 'READY_FOR_DISPATCH', deliveryMode: 'IMMEDIATE' })).toBe(false)
    expect(waitsForBatch({ status: 'CONFIRMED' })).toBe(false)
  })
})
