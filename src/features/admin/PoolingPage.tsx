import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '@/api/http'
import { adminApi, orderedStops, POOL_STATUS, poolSummary, todayISO, type BatchPreview, type Pool } from './admin'
import { PoolMap } from './PoolMap'

/** The gateway answers 404 for a route the logistics service does not have yet, 502/503 when it is down. */
const isUnavailable = (e: unknown) => e instanceof ApiError && [404, 501, 502, 503].includes(e.status)
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null

export function PoolingPage() {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayISO())
  const [selected, setSelected] = useState<string | null>(null)
  const pools = useQuery({ queryKey: ['pools', date], queryFn: () => adminApi.pools(date), retry: false })
  const run = useMutation({
    mutationFn: () => adminApi.runPooling(date),
    onSuccess: (data) => {
      queryClient.setQueryData(['pools', date], data)
      setSelected(data[0]?.id ?? null)
    },
  })

  const batch = useQuery({ queryKey: ['pool-batch'], queryFn: adminApi.batch, retry: false, refetchInterval: 60_000 })
  const runBatch = useMutation({
    mutationFn: () => adminApi.runBatch(date),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['pools'] })
      void queryClient.invalidateQueries({ queryKey: ['pool-batch'] })
      setSelected(data[0]?.id ?? null)
    },
  })

  const list = pools.data ?? []
  const error = run.error ?? pools.error
  const summary = poolSummary(list)
  const chosen = list.find((p) => p.id === selected) ?? null

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm font-semibold">
          Delivery date
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setSelected(null)
              run.reset()
            }}
            className="mt-1 input font-normal"
          />
        </label>
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={run.isPending || !date}
          className="btn-primary"
        >
          {run.isPending ? 'Running…' : list.length ? 'Run pooling again' : 'Run pooling'}
        </button>
        <p className="basis-full text-sm text-ink-soft">
          Groups orders due on this date whose drop points are within about 3 km into one route per vehicle.
        </p>
      </div>

      <BatchPanel preview={batch.data} loading={batch.isPending} failed={batch.isError} running={runBatch.isPending} created={runBatch.data?.length} onRun={() => runBatch.mutate()} />

      {error && (
        <p role="alert" className="font-semibold text-danger">
          {isUnavailable(error)
            ? 'Pooling is not available yet: the logistics service is not running. Try again once it is deployed.'
            : error instanceof ApiError
              ? error.message
              : 'Could not reach the server. Try again.'}
        </p>
      )}

      {pools.isPending ? (
        <p className="text-ink-soft">Loading pools…</p>
      ) : (
        !error && (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Pooling summary">
              <Stat label="Pools" value={String(summary.pools)} />
              <Stat label="Deliveries" value={String(summary.deliveries)} />
              <Stat label="Route distance" value={`${summary.routeKm} km`} />
              <Stat
                label="Distance saved"
                value={`${summary.savedKm} km`}
                note={summary.pools ? `${summary.savedPct}% less than separate trips` : undefined}
                strong
              />
            </dl>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <PoolMap pools={list} selectedId={selected} />
              <div>
                {list.length === 0 ? (
                  <p className="text-ink-soft">No pools for this date yet. Run pooling to group the day’s orders.</p>
                ) : (
                  <ul className="space-y-2" aria-label="Pools">
                    {list.map((pool, i) => (
                      <li key={pool.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(pool.id === selected ? null : pool.id)}
                          aria-pressed={selected === pool.id}
                          className="w-full card px-4 py-3 text-left transition-colors duration-150 hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary/15"
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold">Pool {i + 1}</span>
                            <span className="text-sm text-ink-soft">{POOL_STATUS[pool.status] ?? pool.status}</span>
                          </span>
                          <span className="block text-sm text-ink-soft">
                            {pool.stops.filter((s) => s.kind === 'DROP').length === 1 ? '1 delivery' : `${pool.stops.filter((s) => s.kind === 'DROP').length} deliveries`}, {pool.totalKm} km route,{' '}
                            <span className="font-semibold text-primary">{pool.savedKm} km saved</span>
                          </span>
                        </button>
                        {selected === pool.id && <StopList pool={pool} />}
                      </li>
                    ))}
                  </ul>
                )}
                {list.length > 0 && !chosen && <p className="mt-3 text-sm text-ink-soft">Choose a pool to see its stops in order.</p>}
              </div>
            </div>
          </>
        )
      )}
    </div>
  )
}

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h! % 12 || 12}:${String(m).padStart(2, '0')} ${h! < 12 ? 'am' : 'pm'}`
}

/** Orders whose customers chose "I can wait": held until the daily run, then grouped by neighbourhood. */
function BatchPanel({
  preview,
  loading,
  failed,
  running,
  created,
  onRun,
}: {
  preview?: BatchPreview
  loading: boolean
  failed: boolean
  running: boolean
  created?: number
  onRun: () => void
}) {
  if (failed) return null // an older logistics service without the batch: the rest of the page still works
  const routes = new Map<number, BatchPreview['orders']>()
  for (const o of preview?.orders ?? []) routes.set(o.route, [...(routes.get(o.route) ?? []), o])
  return (
    <section aria-labelledby="batch-title" className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="batch-title" className="font-display text-xl">
            Shared-delivery batch
          </h2>
          <p className="text-sm text-ink-soft">
            Orders whose customers chose “I can wait” are held and grouped by neighbourhood once a day
            {preview ? `, at ${clock(preview.batchTime)}` : ''}, so one partner serves each area.
          </p>
        </div>
        <button type="button" onClick={onRun} disabled={running || loading || !preview?.dueOrders} className="btn-primary">
          {running ? 'Running…' : 'Run the batch now'}
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-ink-soft">Checking the waiting orders…</p>
      ) : (
        preview && (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Batch summary">
              <Stat label="Waiting" value={String(preview.waitingOrders)} />
              <Stat label="Due at the next run" value={String(preview.dueOrders)} />
              <Stat label="Routes it would make" value={String(preview.estimatedRoutes)} strong />
              <Stat label="Weight" value={`${preview.totalWeightKg} kg`} />
            </dl>
            {created !== undefined && (
              <p role="status" className="text-sm font-semibold text-primary">
                {created === 1 ? '1 route was created.' : `${created} routes were created.`} Partners have been offered them.
              </p>
            )}
            {preview.dueOrders === 0 ? (
              <p className="text-sm text-ink-soft">
                {preview.waitingOrders ? 'Everything waiting is due on a later day.' : 'No packed orders are waiting for the batch.'}
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="Routes the next run would make">
                {[...routes.entries()].map(([n, orders]) => (
                  <li key={n} className="rounded-lg bg-paper px-3 py-2 text-sm">
                    <span className="font-semibold">
                      Route {n}: {orders.length === 1 ? '1 delivery' : `${orders.length} deliveries`}
                    </span>
                    <span className="block text-ink-soft">{orders.map((o) => o.address).filter(Boolean).slice(0, 3).join(' · ')}{orders.length > 3 ? ' …' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )
      )}
    </section>
  )
}

function Stat({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="card px-4 py-3">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className={`text-xl font-bold tabular-nums ${strong ? 'text-primary' : ''}`}>{value}</dd>
      {note && <dd className="text-sm text-ink-soft">{note}</dd>}
    </div>
  )
}

function StopList({ pool }: { pool: Pool }) {
  return (
    <ol className="mt-2 mb-1 space-y-1 border-l-2 border-line pl-4 text-sm" aria-label="Stops in order">
      {orderedStops(pool).map((stop) => (
        <li key={`${stop.orderId}-${stop.kind}-${stop.sequence}`} className="flex items-baseline gap-2">
          <span
            aria-hidden="true"
            className={`inline-block size-2.5 shrink-0 rounded-full ${stop.kind === 'PICKUP' ? 'bg-warn' : 'bg-primary'}`}
          />
          <span>
            <span className="font-semibold">
              {stop.sequence}. {stop.kind === 'PICKUP' ? 'Pick up' : 'Deliver'}
            </span>{' '}
            order {stop.orderId.slice(0, 8)}
            {time(stop.eta) && <span className="text-ink-soft">, around {time(stop.eta)}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
