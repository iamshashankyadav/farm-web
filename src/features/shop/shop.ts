import { useSyncExternalStore } from 'react'
import { api } from '@/api/http'
import { newId } from '@/api/id'
import type { Tone } from '@/components/ui'
import type { DeliveryMode, OrderDetail, OrderStatus, OrderSummary } from '@/features/farmer/orders'

export type { DeliveryMode }

/* ------------------------------------------------------------------ catalog search */

export type Unit = 'kg' | 'quintal' | 'dozen' | 'piece' | 'bunch' | 'litre'

/** One listing found by the search, with how far its pickup point is. */
export interface Produce {
  id: string
  farmId: string
  farmName: string
  farmRating: number | null
  farmRatingCount: number
  district: string
  village: string | null
  cropId: string
  cropName: string
  variety: string | null
  description: string | null
  qtyAvailable: number
  unit: Unit
  pricePerUnit: number
  harvestDate: string
  isOrganic: boolean
  mediaIds: string[]
  createdAt: string
  /** Only known when searching from a place; a farm's own page has none. */
  distanceM?: number
}

export type SortKey = 'distance' | 'price' | 'newest'

export interface SearchFilters {
  lat: number
  lng: number
  radiusKm: number
  organic: boolean
  sort: SortKey
  crop?: string
  maxPrice?: number
}

export function searchQuery(f: SearchFilters, cursor?: string | null) {
  const q = new URLSearchParams({ lat: String(f.lat), lng: String(f.lng), radius_km: String(f.radiusKm), sort: f.sort, limit: '48' })
  if (cursor) q.set('cursor', cursor)
  if (f.organic) q.set('organic', 'true')
  if (f.crop) q.set('crop', f.crop)
  if (f.maxPrice) q.set('max_price', String(f.maxPrice))
  return q.toString()
}

export interface CropInfo {
  id: string
  name: string
  category: string
  defaultUnit: Unit
}

export interface FarmInfo {
  id: string
  name: string
  village: string | null
  district: string
  state: string | null
  rating: number | null
  ratingCount: number
}

export const shopApi = {
  farm: (id: string) => api<FarmInfo>(`/catalog/farms/${id}`, { anonymous: true }),
  farmListings: (id: string) =>
    api<{ items: Produce[]; nextCursor: string | null }>(`/catalog/farms/${id}/listings?limit=50`, { anonymous: true }).then((r) => r.items),
  crops: () => api<CropInfo[]>('/catalog/crops', { anonymous: true }),
  // Searching needs no account, so the public catalog works signed out.
  search: (f: SearchFilters, cursor?: string | null) =>
    api<{ features: { properties: Produce }[]; nextCursor: string | null }>(`/catalog/listings/search?${searchQuery(f, cursor)}`, { anonymous: true }).then((r) => ({
      items: r.features.map((x) => x.properties),
      nextCursor: r.nextCursor,
    })),
}

/** Places to search from when the browser cannot say where the customer is. */
export const PLACES = [
  { name: 'Bhilai', lat: 21.2094, lng: 81.3784 },
  { name: 'Durg', lat: 21.1904, lng: 81.2849 },
  { name: 'Raipur', lat: 21.2514, lng: 81.6296 },
  { name: 'Bilaspur', lat: 22.0797, lng: 82.1409 },
  { name: 'Nagpur', lat: 21.1458, lng: 79.0882 },
]
export const DEFAULT_PLACE = PLACES[0]!

export const CATEGORY_LABEL: Record<string, string> = {
  vegetable: 'Vegetables',
  fruit: 'Fruit',
  leafy: 'Leafy greens',
  grain: 'Grains',
  pulse: 'Pulses',
  oilseed: 'Oilseeds',
  spice: 'Spices',
  cash: 'Cash crops',
}

export function formatKm(m: number) {
  return m < 1000 ? `${Math.max(100, Math.round(m / 100) * 100)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`
}

export function daysSince(iso: string, now = Date.now()) {
  const start = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime()
  return Math.max(0, Math.floor((now - start) / 86_400_000))
}

/** How fresh it is: a tone and a short text, from the harvest date. */
export function freshness(harvestDate: string, now = Date.now()): { tone: Tone; label: string; days: number } {
  const days = daysSince(harvestDate, now)
  if (days === 0) return { tone: 'good', label: 'Harvested today', days }
  if (days === 1) return { tone: 'good', label: 'Harvested yesterday', days }
  if (days <= 3) return { tone: 'good', label: `Harvested ${days} days ago`, days }
  if (days <= 7) return { tone: 'warn', label: `Harvested ${days} days ago`, days }
  return { tone: 'neutral', label: `Harvested ${days} days ago`, days }
}

export interface Refinement {
  category: string
  text: string
  crops: CropInfo[] | undefined
}

/** Filters what the search returned by crop group and by what the customer typed. */
export function refine(items: Produce[], { category, text, crops }: Refinement): Produce[] {
  const byId = new Map((crops ?? []).map((c) => [c.id, c.category]))
  const needle = text.trim().toLowerCase()
  return items.filter((p) => {
    if (category !== 'all' && byId.get(p.cropId) !== category) return false
    if (!needle) return true
    return [p.cropName, p.variety, p.farmName, p.village, p.district].some((s) => s?.toLowerCase().includes(needle))
  })
}

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/** Smallest step a customer can change a quantity by. */
export const stepOf = (unit: Unit) => (unit === 'kg' || unit === 'quintal' || unit === 'litre' ? 0.5 : 1)

/* ------------------------------------------------------------------ the cart (kept on this device) */

export interface CartLine {
  listingId: string
  farmId: string
  farmName: string
  name: string
  unit: Unit
  unitPrice: number
  qty: number
  /** Stock when it was added, so the cart can say when you ask for more than there is. */
  maxQty: number
  mediaId: string | null
}

const CART_KEY = 'farm.cart'
const listeners = new Set<() => void>()
let snapshot: CartLine[] = read()

function read(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? (raw as CartLine[]).filter((l) => l && typeof l.listingId === 'string' && l.qty > 0) : []
  } catch {
    return []
  }
}

function write(next: CartLine[]) {
  snapshot = next
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(next))
  } catch {
    // private mode: the cart still works until the page is closed
  }
  listeners.forEach((l) => l())
}

export const cartStore = {
  get: () => snapshot,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  add(p: Produce, qty: number) {
    const existing = snapshot.find((l) => l.listingId === p.id)
    const total = Math.min(p.qtyAvailable, (existing?.qty ?? 0) + qty)
    const line: CartLine = {
      listingId: p.id,
      farmId: p.farmId,
      farmName: p.farmName,
      name: p.variety ? `${p.cropName} (${p.variety})` : p.cropName,
      unit: p.unit,
      unitPrice: p.pricePerUnit,
      qty: total,
      maxQty: p.qtyAvailable,
      mediaId: p.mediaIds[0] ?? null,
    }
    write(existing ? snapshot.map((l) => (l.listingId === p.id ? line : l)) : [...snapshot, line])
  },
  setQty(listingId: string, qty: number) {
    write(qty <= 0 ? snapshot.filter((l) => l.listingId !== listingId) : snapshot.map((l) => (l.listingId === listingId ? { ...l, qty } : l)))
  },
  remove: (listingId: string) => write(snapshot.filter((l) => l.listingId !== listingId)),
  clear: () => write([]),
}

export const useCart = () => useSyncExternalStore(cartStore.subscribe, cartStore.get, cartStore.get)

/** The fee per farm for each delivery mode. Only a fallback: the real fees come from GET /order/orders/delivery-options. */
export const FALLBACK_FEES: Record<DeliveryMode, number> = { IMMEDIATE: 20, FLEXIBLE: 10 }
export const DELIVERY_FEE_PER_FARM = FALLBACK_FEES.IMMEDIATE

export function cartTotals(lines: CartLine[], mode: DeliveryMode = 'IMMEDIATE', fees: Record<DeliveryMode, number> = FALLBACK_FEES) {
  const subtotal = lines.reduce((sum, l) => sum + Math.round(l.unitPrice * l.qty * 100) / 100, 0)
  const farms = new Set(lines.map((l) => l.farmId)).size
  const delivery = farms * fees[mode]
  return { subtotal, farms, delivery, total: subtotal + delivery }
}

/** What the customer can choose at checkout, from GET /order/orders/delivery-options. */
export interface DeliveryOptions {
  options: { mode: DeliveryMode; feePerOrder: number }[]
  /** Local time of the daily shared-delivery batch, "HH:MM". */
  batchTime: string
  nextBatchAt: string
}

export const deliveryOptionsApi = { get: () => api<DeliveryOptions>('/order/orders/delivery-options') }

export function feesOf(o: DeliveryOptions | undefined): Record<DeliveryMode, number> {
  const fees = { ...FALLBACK_FEES }
  for (const x of o?.options ?? []) fees[x.mode] = x.feePerOrder
  return fees
}

/** "10:00" -> "10:00 am" */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h! % 12 || 12}:${String(m ?? 0).padStart(2, '0')} ${h! < 12 ? 'am' : 'pm'}`
}

/** When a shared-delivery batch runs, in words: "today 10:00 am", "tomorrow 10:00 am" or "Fri, 28 Nov, 10:00 am". */
export function batchWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000)
  if (day(at) === day(now)) return `today ${time}`
  if (day(at) === day(tomorrow)) return `tomorrow ${time}`
  return `${at.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}, ${time}`
}

/** "today 10:00 am" -> the translation key and its words, so the day can be translated. */
export function whenParts(iso: string): [string, Record<string, string>] {
  const w = batchWhen(iso)
  const [day, ...rest] = w.split(' ')
  if (day === 'today' || day === 'tomorrow') return [day === 'today' ? 'today {time}' : 'tomorrow {time}', { time: rest.join(' ') }]
  return ['{when}', { when: w }]
}

/* ------------------------------------------------------------------ checkout and the customer's orders */

export interface Address {
  line1: string
  line2?: string
  city: string
  pincode: string
  contactPhone?: string
  location: { type: 'Point'; coordinates: [number, number] }
}

export type AddressForm = { line1: string; line2: string; city: string; pincode: string; phone: string; lat: string; lng: string }

/** Checks the address the way the order service does; returns the body, or the problem to show. */
export function addressPayload(f: AddressForm): Address | string {
  if (f.line1.trim().length < 3) return 'Enter the house number and street.'
  if (!f.city.trim()) return 'Enter the city or town.'
  if (!/^\d{6}$/.test(f.pincode.trim())) return 'Enter the 6-digit pincode.'
  if (f.phone.trim() && !/^\+?\d{10,13}$/.test(f.phone.replace(/[\s-]/g, ''))) return 'Enter a valid phone number, or leave it empty.'
  const lat = Number(f.lat)
  const lng = Number(f.lng)
  if (f.lat.trim() === '' || f.lng.trim() === '' || !(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180))
    return 'Set the delivery location with “Use my location”, or pick a nearby town.'
  const a: Address = { line1: f.line1.trim(), city: f.city.trim(), pincode: f.pincode.trim(), location: { type: 'Point', coordinates: [lng, lat] } }
  if (f.line2.trim()) a.line2 = f.line2.trim()
  if (f.phone.trim()) a.contactPhone = f.phone.replace(/[\s-]/g, '')
  return a
}

export interface Checkout {
  id: string
  total: number
  deliveryFee: number
  paymentStatus: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED'
  orders: { id: string; deliveryMode?: DeliveryMode; batchAt?: string | null }[]
}

export const customerOrdersApi = {
  list: () => api<{ items: OrderSummary[]; nextCursor: string | null }>('/order/orders?role=customer&limit=100').then((r) => r.items),
  get: (id: string) => api<CustomerOrder>(`/order/orders/${id}`),
  cancel: (id: string) => api<OrderDetail>(`/order/orders/${id}/cancel`, { method: 'POST', body: {} }),
  rate: (id: string, score: number, comment: string) =>
    api(`/order/orders/${id}/rating`, { method: 'POST', body: { score, ...(comment.trim() ? { comment: comment.trim() } : {}) } }),
  track: (id: string) => api<Tracking>(`/logistics/orders/${id}/track`),
  /** Pays the total, then places the orders. A new key per attempt; the same key on a retry never orders twice. */
  async checkout(
    lines: CartLine[],
    address: Address,
    notes: string,
    key: string,
    mode: DeliveryMode = 'IMMEDIATE',
    fees: Record<DeliveryMode, number> = FALLBACK_FEES,
  ): Promise<Checkout> {
    const { total } = cartTotals(lines, mode, fees)
    const intent = await api<{ id: string }>('/order/orders/payments/intent', { method: 'POST', body: { amount: total, kind: 'FULL' } })
    return api<Checkout>('/order/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: {
        items: lines.map((l) => ({ listingId: l.listingId, qty: l.qty })),
        deliveryAddress: address,
        deliveryMode: mode,
        paymentIntentId: intent.id,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
    })
  },
}
export const newCheckoutKey = newId

export interface CustomerOrder extends OrderDetail {
  deliveryFee: number
  subtotal: number
  balanceDue?: number
  rating: { score: number; comment: string | null } | null
  deliveryAddress: Address | null
  farmId: string | null
}

export interface Tracking {
  orderId: string
  eta: string | null
  partnerName: string | null
  partnerPhone: string | null
  partnerLat: number | null
  partnerLng: number | null
  partnerUpdatedAt: string | null
  status: string | null
  stop: { otp: string | null; eta: string | null; status: string; seq: number } | null
}

export const ORDER_TEXT: Record<OrderStatus, { label: string; tone: Tone; next: string }> = {
  PLACED: { label: 'Placed', tone: 'info', next: 'Waiting for payment to settle.' },
  CONFIRMED: { label: 'Confirmed', tone: 'info', next: 'The farmer has your order and will pack it.' },
  PACKED: { label: 'Packed', tone: 'info', next: 'Packed by the farmer. It waits for a delivery partner.' },
  READY_FOR_DISPATCH: { label: 'Packed', tone: 'good', next: 'Packed by the farmer. It joins a delivery route on the delivery day.' },
  POOLED: { label: 'On a route', tone: 'good', next: 'A delivery partner is assigned and will collect it.' },
  IN_TRANSIT: { label: 'On the way', tone: 'good', next: 'Your order is on its way. Keep the delivery code ready.' },
  DELIVERED: { label: 'Delivered', tone: 'good', next: 'Delivered. It becomes complete once the payout is settled.' },
  COMPLETED: { label: 'Completed', tone: 'good', next: 'All done. Tell us how it went.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', next: 'This order was cancelled and the payment refunded.' },
}

/** Statuses before an order is on a route: a FLEXIBLE order still waits for the shared-delivery batch. */
const BEFORE_ROUTE: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED', 'READY_FOR_DISPATCH']

/** True for an order the customer let wait for the shared-delivery batch, which has not left yet. */
export const waitsForBatch = (o: { status: OrderStatus; deliveryMode?: DeliveryMode }) => o.deliveryMode === 'FLEXIBLE' && BEFORE_ROUTE.includes(o.status)

/** Position on the journey for the status bar; cancelled is shown apart. */
export const JOURNEY: OrderStatus[] = ['CONFIRMED', 'PACKED', 'POOLED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED']
export function journeyStep(status: OrderStatus): number {
  if (status === 'PLACED') return 0
  if (status === 'READY_FOR_DISPATCH') return JOURNEY.indexOf('PACKED') + 1
  return JOURNEY.indexOf(status) + 1
}

/** A customer may cancel until the farmer packs the order (packing hands it to logistics). */
export const canCancel = (s: OrderStatus) => ['PLACED', 'CONFIRMED', 'PACKED'].includes(s)
