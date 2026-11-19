import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Clock, MapPin, PackageCheck, XCircle } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Order, OrderStatus } from '../types';
import type { BrowserPushStatus } from '../utils/notifications';

interface LiveTrackerViewProps {
  user: User | null;
  orders: Order[];
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onCancelOrder: (order: Order) => Promise<void>;
  onSignIn: () => Promise<void>;
  onBrowseMenu: () => void;
  pushOptIn: boolean;
  browserPushStatus: BrowserPushStatus;
  onEnablePush: () => Promise<void>;
}

const TRACKER_STEPS: { status: OrderStatus; title: string; detail: string }[] = [
  {
    status: 'Placed',
    title: 'Order Confirmed',
    detail: 'Ticket received by the depot baristas',
  },
  {
    status: 'Brewing',
    title: 'Chilling & Brewing',
    detail: 'Pulling fresh espresso & blending cold foam',
  },
  {
    status: 'Quality Check',
    title: 'Sealed & Ice-Packed',
    detail: 'Insulated sleeve & spill-proof lid check',
  },
  {
    status: 'Out for Delivery',
    title: 'On the Way',
    detail: 'Rider en route or ready at pickup bar',
  },
  {
    status: 'Delivered',
    title: 'Completed',
    detail: 'Enjoy your Suman Cold Coffee',
  },
];

function getStepIndex(status: OrderStatus): number {
  const idx = TRACKER_STEPS.findIndex((s) => s.status === status);
  return idx === -1 ? 0 : idx;
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function LiveTrackerView({
  user,
  orders,
  selectedOrderId,
  onSelectOrder,
  onCancelOrder,
  onSignIn,
  onBrowseMenu,
  pushOptIn,
  browserPushStatus,
  onEnablePush,
}: LiveTrackerViewProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fallbackTimestampsRef = useRef<Record<string, number>>({});

  const activeOrder =
    orders.find((o) => o.id === selectedOrderId) ||
    orders.find((o) => o.status !== 'Delivered' && o.status !== 'Cancelled') ||
    orders[0];

  const activeOrderId = activeOrder?.id;
  const activeOrderStatus = activeOrder?.status;

  useEffect(() => {
    if (!activeOrderId) return;
    if (!fallbackTimestampsRef.current[activeOrderId]) {
      fallbackTimestampsRef.current[activeOrderId] = Date.now();
    }
    if (activeOrderStatus === 'Delivered' || activeOrderStatus === 'Cancelled') {
      return;
    }
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeOrderId, activeOrderStatus]);

  if (!user) {
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center">
          <h1 className="font-display text-3xl font-semibold text-zinc-950 mb-3">
            Real-Time Order Tracking
          </h1>
          <p className="text-sm text-zinc-600 max-w-md mx-auto mb-6 leading-relaxed">
            Sign in with Google to monitor live barista progress, courier ETAs, and push updates synced directly from our cloud kitchen.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="px-5 py-2.5 min-h-[44px] text-sm font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </section>
    );
  }

  if (orders.length === 0 || !activeOrder) {
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center">
          <h1 className="font-display text-3xl font-semibold text-zinc-950 mb-3">
            No Active Orders Yet
          </h1>
          <p className="text-sm text-zinc-600 max-w-md mx-auto mb-6 leading-relaxed">
            Once you check out, every stage from espresso extraction to doorstep handoff updates live right here.
          </p>
          <button
            type="button"
            onClick={onBrowseMenu}
            className="px-5 py-2.5 min-h-[44px] text-sm font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            Browse Cold Coffee Menu
          </button>
        </div>
      </section>
    );
  }

  const currentIdx = getStepIndex(activeOrder.status);
  const isCancelled = activeOrder.status === 'Cancelled';
  const isDelivered = activeOrder.status === 'Delivered';

  const fallbackStart =
    fallbackTimestampsRef.current[activeOrder.id] ?? nowMs;
  const createdAtMs = activeOrder.createdAt?.seconds
    ? activeOrder.createdAt.seconds * 1000 +
      Math.floor((activeOrder.createdAt.nanoseconds ?? 0) / 1e6)
    : fallbackStart;
  const anchorMs = activeOrder.updatedAt?.seconds
    ? activeOrder.updatedAt.seconds * 1000 +
      Math.floor((activeOrder.updatedAt.nanoseconds ?? 0) / 1e6)
    : createdAtMs;

  const estimatedMs = Math.max(1, activeOrder.estimatedMinutes) * 60 * 1000;
  const targetMs = anchorMs + estimatedMs;
  const remainingMs = isDelivered ? 0 : Math.max(0, targetMs - nowMs);
  const totalSpanMs = Math.max(60_000, targetMs - createdAtMs);
  const elapsedMs = Math.max(0, totalSpanMs - remainingMs);
  const progressPercent = isDelivered
    ? 100
    : remainingMs === 0
    ? 98
    : Math.min(98, Math.max(4, Math.round((elapsedMs / totalSpanMs) * 100)));

  const readyClockStr = new Date(targetMs).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const countdownText = formatCountdown(remainingMs);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-amber-800 mb-1">
            Cloud-Synced Barista Feed
          </p>
          <h1 className="font-display text-3xl font-semibold text-zinc-950">
            Live Order Tracker
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(!pushOptIn || browserPushStatus !== 'granted') && (
            <button
              type="button"
              onClick={onEnablePush}
              className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] text-xs font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-50 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-amber-800" />
              <span>Enable Push Alerts</span>
            </button>
          )}

          {orders.length > 1 && (
            <select
              aria-label="Select order to track"
              value={activeOrder.id}
              onChange={(e) => onSelectOrder(e.target.value)}
              className="px-3 py-2 min-h-[40px] text-xs font-mono border border-zinc-200 bg-white rounded-lg focus:outline-none focus:border-zinc-950"
            >
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} · {order.status} · ₹{order.totalAmount}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                <span className="font-mono font-medium text-zinc-950">
                  {activeOrder.orderNumber}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeOrder.deliveryType}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {activeOrder.paymentStatus} ({activeOrder.paymentReference})
                </span>
              </div>
              <h2 className="font-display text-2xl font-semibold text-zinc-950">
                {isCancelled
                  ? 'Order Cancelled'
                  : isDelivered
                  ? 'Order Delivered'
                  : remainingMs === 0
                  ? `${activeOrder.status} — Finishing up`
                  : `${activeOrder.status} — Ready in ~${Math.max(1, Math.ceil(remainingMs / 60000))} min`}
              </h2>
            </div>

            <div className="flex items-center gap-2 text-sm font-medium text-zinc-950 bg-zinc-100 px-3.5 py-2 rounded-lg tabular-nums">
              <Clock className="w-4 h-4 text-amber-800" />
              <span>
                {isDelivered || isCancelled
                  ? activeOrder.status
                  : `Est. ${readyClockStr}`}
              </span>
            </div>
          </div>

          {!isCancelled && (
            <div className="pb-6 border-b border-zinc-100 space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-zinc-700">
                    {isDelivered
                      ? 'Order completed'
                      : remainingMs === 0
                      ? 'Ready any moment now'
                      : 'Estimated time remaining'}
                  </p>
                  {!isDelivered && (
                    <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                      Target handoff at {readyClockStr}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <span className="font-mono text-2xl sm:text-3xl font-semibold text-zinc-950 tabular-nums">
                    {isDelivered ? '0:00' : countdownText}
                  </span>
                  {!isDelivered && (
                    <span className="block text-xs text-zinc-500 tabular-nums">
                      min : sec
                    </span>
                  )}
                </div>
              </div>

              <div
                role="progressbar"
                aria-label="Estimated order preparation progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                className="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                    isDelivered ? 'bg-emerald-700' : 'bg-amber-800'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 tabular-nums">
                <span>Current stage: {activeOrder.status}</span>
                <span className="font-mono">{progressPercent}%</span>
              </div>
            </div>
          )}

          {isCancelled ? (
            <div className="py-6 flex items-start gap-3 text-sm text-zinc-700">
              <XCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-zinc-950">
                  This order was cancelled before preparation began.
                </p>
                <p className="text-zinc-500 mt-1">
                  If you paid digitally ({activeOrder.paymentReference}), any refund is processed automatically within 2–3 business days.
                </p>
              </div>
            </div>
          ) : (
            <ol className="space-y-5">
              {TRACKER_STEPS.map((step, index) => {
                const completed = index <= currentIdx;
                const isCurrent = index === currentIdx && !isDelivered;
                return (
                  <li key={step.status} className="flex items-start gap-4">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-mono border transition-colors ${
                        completed
                          ? 'bg-zinc-950 border-zinc-950 text-white'
                          : 'bg-white border-zinc-300 text-zinc-400'
                      }`}
                    >
                      {completed ? (
                        <Check className="w-4 h-4" strokeWidth={2.25} />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div className="pt-0.5 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-sm font-semibold ${
                            completed ? 'text-zinc-950' : 'text-zinc-400'
                          }`}
                        >
                          {step.title}
                        </p>
                        {isCurrent && (
                          <span className="text-xs font-medium text-amber-800">
                            In Progress
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-xs mt-0.5 ${
                          completed ? 'text-zinc-600' : 'text-zinc-400'
                        }`}
                      >
                        {step.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {activeOrder.status === 'Placed' && (
            <div className="pt-6 border-t border-zinc-100 flex items-center justify-between gap-4">
              <p className="text-xs text-zinc-500">
                Changed your mind? You can cancel before the barista starts brewing.
              </p>
              <button
                type="button"
                onClick={() => onCancelOrder(activeOrder)}
                className="px-3.5 py-2 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel Order
              </button>
            </div>
          )}
        </div>

        <aside className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-zinc-950 mb-3 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-zinc-600" />
              <span>Order Receipt</span>
            </h3>
            <ul className="space-y-2.5 text-sm">
              {activeOrder.items.map((item, idx) => (
                <li
                  key={`${item.itemId}-${idx}`}
                  className="flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-zinc-900">
                      <span className="font-mono tabular-nums">
                        {item.quantity}×
                      </span>{' '}
                      {item.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.size} · {item.milk}
                    </p>
                  </div>
                  <span className="font-mono text-zinc-900 tabular-nums shrink-0">
                    ₹{item.price * item.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-zinc-100 space-y-1.5 text-xs text-zinc-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">₹{activeOrder.subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span>GST</span>
              <span className="font-mono tabular-nums">₹{activeOrder.tax}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery</span>
              <span className="font-mono tabular-nums">
                {activeOrder.deliveryFee === 0
                  ? 'Free'
                  : `₹${activeOrder.deliveryFee}`}
              </span>
            </div>
            <div className="pt-2 border-t border-zinc-100 flex justify-between text-sm font-semibold text-zinc-950">
              <span>Total</span>
              <span className="font-mono tabular-nums">
                ₹{activeOrder.totalAmount}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 text-xs text-zinc-600 space-y-1.5">
            <p className="font-medium text-zinc-950 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-zinc-500" />
              <span>{activeOrder.customerName}</span>
            </p>
            <p>{activeOrder.deliveryAddress}</p>
            <p className="font-mono">{activeOrder.customerPhone}</p>
            {activeOrder.notes && (
              <p className="text-amber-900 pt-1">Note: {activeOrder.notes}</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
