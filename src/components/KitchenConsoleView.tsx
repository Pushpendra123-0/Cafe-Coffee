import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Database,
  ExternalLink,
  Mail,
  PlayCircle,
  Plus,
  Search,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  SizeCode,
  SizePrices,
} from '../types';
import {
  isEmbeddedIframe,
  playNewOrderChime,
  type BrowserPushStatus,
} from '../utils/notifications';
import { BLUEPRINT_LIMITS } from '../firebase';
import { DEFAULT_MENU_ITEMS } from '../data/defaultMenu';
import { OrderQrCard } from './OrderQrSection';
import { PromoShortModal } from './PromoShortModal';

interface KitchenConsoleViewProps {
  user: User | null;
  isAdmin: boolean;
  orders: Order[];
  menuItems: MenuItem[];
  isMenuSeeded: boolean;
  browserPushStatus: BrowserPushStatus;
  soundAlertsEnabled: boolean;
  onEnablePush: () => Promise<void>;
  onToggleSoundAlerts: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onAdvanceOrderStatus: (order: Order, nextStatus: OrderStatus) => Promise<void>;
  onMarkCodPaid: (order: Order) => Promise<void>;
  onSeedMenu: () => Promise<void>;
  onToggleAvailability: (item: MenuItem) => Promise<void>;
  onUpdatePrice: (
    item: MenuItem,
    newPrice: number,
    newSizePrices?: SizePrices
  ) => Promise<void>;
  onAddMenuItem: (item: Omit<MenuItem, 'updatedAt'>) => Promise<void>;
}

const NEXT_STATUS_MAP: Partial<Record<OrderStatus, OrderStatus>> = {
  Placed: 'Brewing',
  Brewing: 'Quality Check',
  'Quality Check': 'Out for Delivery',
  'Out for Delivery': 'Delivered',
};

const CATEGORIES: MenuCategory[] = [
  'Shakes',
  'Hot Beverages',
  'Mocktails & Mojitos',
  'Maggi',
  'Pasta & Eggs',
  'Rolls',
  'Paratha',
  'Sandwich',
  'Kurkuria Sandwich',
];

const SIZE_CODES: SizeCode[] = ['S', 'M', 'L', 'XL'];

function CatalogItemRow({
  item,
  onToggleAvailability,
  onUpdatePrice,
}: {
  item: MenuItem;
  onToggleAvailability: (item: MenuItem) => Promise<void>;
  onUpdatePrice: (
    item: MenuItem,
    newPrice: number,
    newSizePrices?: SizePrices
  ) => Promise<void>;
}) {
  const [priceDraft, setPriceDraft] = useState(String(item.price));
  const [sizeDrafts, setSizeDrafts] = useState<Record<SizeCode, string>>({
    S: String(item.sizePrices?.S ?? item.price),
    M: String(item.sizePrices?.M ?? item.price),
    L: String(item.sizePrices?.L ?? item.price),
    XL: String(item.sizePrices?.XL ?? item.price),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPriceDraft(String(item.price));
    if (item.sizePrices) {
      setSizeDrafts({
        S: String(item.sizePrices.S),
        M: String(item.sizePrices.M),
        L: String(item.sizePrices.L),
        XL: String(item.sizePrices.XL),
      });
    }
  }, [
    item.price,
    item.sizePrices?.S,
    item.sizePrices?.M,
    item.sizePrices?.L,
    item.sizePrices?.XL,
  ]);

  const parsedSingle = Number(priceDraft);
  const isSingleValid =
    Number.isFinite(parsedSingle) && parsedSingle >= 1 && parsedSingle <= 5000;
  const hasSingleChanged = isSingleValid && Math.round(parsedSingle) !== item.price;

  const parsedSizes: SizePrices | null = item.sizePrices
    ? {
        S: Math.round(Number(sizeDrafts.S)),
        M: Math.round(Number(sizeDrafts.M)),
        L: Math.round(Number(sizeDrafts.L)),
        XL: Math.round(Number(sizeDrafts.XL)),
      }
    : null;

  const areSizesValid = parsedSizes
    ? SIZE_CODES.every(
        (code) =>
          Number.isFinite(parsedSizes[code]) &&
          parsedSizes[code] >= 1 &&
          parsedSizes[code] <= 5000
      )
    : false;

  const haveSizesChanged =
    Boolean(item.sizePrices && parsedSizes && areSizesValid) &&
    SIZE_CODES.some((code) => parsedSizes![code] !== item.sizePrices![code]);

  async function handleSaveSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!isSingleValid || saving) return;
    setSaving(true);
    try {
      await onUpdatePrice(item, Math.round(parsedSingle));
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickStep(delta: number) {
    if (saving) return;
    const nextPrice = Math.max(1, Math.min(5000, item.price + delta));
    setPriceDraft(String(nextPrice));
    setSaving(true);
    try {
      await onUpdatePrice(item, nextPrice);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSizes(e: React.FormEvent) {
    e.preventDefault();
    if (!parsedSizes || !areSizesValid || saving) return;
    setSaving(true);
    try {
      await onUpdatePrice(item, parsedSizes.S, parsedSizes);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-3.5 first:pt-0 last:pb-0 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-950 truncate">
            {item.name}
          </p>
          <p className="text-xs text-zinc-500">
            {item.category} ·{' '}
            <span className="font-mono tabular-nums">
              {item.sizePrices
                ? `₹${item.sizePrices.S} / ₹${item.sizePrices.M} / ₹${item.sizePrices.L} / ₹${item.sizePrices.XL}`
                : `₹${item.price}`}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => onToggleAvailability(item)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap shrink-0 ${
            item.available
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {item.available ? 'In Stock' : 'Sold Out'}
        </button>
      </div>

      {item.sizePrices ? (
        <form
          onSubmit={handleSaveSizes}
          className="flex flex-wrap items-center gap-2"
        >
          {SIZE_CODES.map((code) => (
            <label
              key={code}
              className="inline-flex items-center gap-1 text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1"
            >
              <span className="font-medium text-zinc-700">{code}</span>
              <span className="text-zinc-400">₹</span>
              <input
                type="number"
                min={1}
                max={5000}
                required
                aria-label={`${item.name} ${code} price`}
                value={sizeDrafts[code]}
                onChange={(e) =>
                  setSizeDrafts((prev) => ({ ...prev, [code]: e.target.value }))
                }
                className="w-14 bg-transparent font-mono text-xs text-zinc-950 tabular-nums focus:outline-none"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={!haveSizesChanged || saving}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={handleSaveSingle}
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            disabled={saving || item.price <= 1}
            onClick={() => handleQuickStep(-10)}
            className="px-2.5 py-1.5 text-xs font-mono border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-40 cursor-pointer tabular-nums whitespace-nowrap shrink-0"
          >
            -₹10
          </button>
          <button
            type="button"
            disabled={saving || item.price >= 5000}
            onClick={() => handleQuickStep(10)}
            className="px-2.5 py-1.5 text-xs font-mono border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-40 cursor-pointer tabular-nums whitespace-nowrap shrink-0"
          >
            +₹10
          </button>
          <label className="inline-flex items-center gap-1 text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1">
            <span className="text-zinc-500">₹</span>
            <input
              type="number"
              min={1}
              max={5000}
              required
              aria-label={`${item.name} price`}
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              className="w-16 bg-transparent font-mono text-xs text-zinc-950 tabular-nums focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={!hasSingleChanged || saving}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      )}
    </div>
  );
}

export function KitchenConsoleView({
  user,
  isAdmin,
  orders,
  menuItems,
  isMenuSeeded,
  browserPushStatus,
  soundAlertsEnabled,
  onEnablePush,
  onToggleSoundAlerts,
  onSignIn,
  onSignOut,
  onAdvanceOrderStatus,
  onMarkCodPaid,
  onSeedMenu,
  onToggleAvailability,
  onUpdatePrice,
  onAddMenuItem,
}: KitchenConsoleViewProps) {
  const [orderFilter, setOrderFilter] = useState<'All' | 'Active' | 'Pending COD' | 'Completed'>('All');
  const [catalogCategory, setCatalogCategory] = useState<'All' | MenuCategory>('All');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MenuCategory>('Shakes');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('80');
  const [prepTimeMins, setPrepTimeMins] = useState('5');
  const [calories, setCalories] = useState('180');
  const [caffeineMg, setCaffeineMg] = useState('0');
  const [savingItem, setSavingItem] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [alertConfig, setAlertConfig] = useState<{
    managerDisplayName: string;
    emailConfigured: boolean;
    provider: string;
  }>({
    managerDisplayName: 'Suman Cold Coffee Depot',
    emailConfigured: false,
    provider: 'none',
  });
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [privateShortOpen, setPrivateShortOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin || !user) return;
    user
      .getIdToken()
      .then((idToken) =>
        fetch('/api/orders/manager-alert-config', {
          headers: { Authorization: `Bearer ${idToken}` },
        })
      )
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg && typeof cfg.emailConfigured === 'boolean') {
          setAlertConfig(cfg);
        }
      })
      .catch(() => {});
  }, [isAdmin, user]);

  async function handleSendTestEmail() {
    if (!user || sendingTestEmail) return;
    setSendingTestEmail(true);
    setEmailFeedback(null);
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/orders/test-manager-email', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = (await resp.json()) as {
        sent?: boolean;
        configured?: boolean;
        managerEmail?: string;
        error?: string;
      };
      if (resp.ok && data.sent) {
        setEmailFeedback({
          ok: true,
          message: `Test order email sent to Suman Cold Coffee Depot's registered manager inbox.`,
        });
      } else {
        setEmailFeedback({
          ok: false,
          message:
            data.error ||
            'Could not send email. Check your Gmail App Password or Resend key in Secrets.',
        });
      }
    } catch {
      setEmailFeedback({
        ok: false,
        message: 'Network error while testing manager email alert.',
      });
    } finally {
      setSendingTestEmail(false);
    }
  }

  const metrics = useMemo(() => {
    const validOrders = orders.filter((o) => o.status !== 'Cancelled');
    const totalRevenue = validOrders.reduce((s, o) => s + o.totalAmount, 0);
    const paidOnline = validOrders
      .filter((o) => o.paymentStatus === 'Paid')
      .reduce((s, o) => s + o.totalAmount, 0);
    const pendingCod = validOrders
      .filter((o) => o.paymentStatus === 'Pending COD')
      .reduce((s, o) => s + o.totalAmount, 0);
    const activeCount = validOrders.filter((o) => o.status !== 'Delivered').length;
    return { totalRevenue, paidOnline, pendingCod, activeCount };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (orderFilter === 'Active') {
        return o.status !== 'Delivered' && o.status !== 'Cancelled';
      }
      if (orderFilter === 'Pending COD') {
        return o.paymentStatus === 'Pending COD' && o.status !== 'Cancelled';
      }
      if (orderFilter === 'Completed') {
        return o.status === 'Delivered';
      }
      return true;
    });
  }, [orders, orderFilter]);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return menuItems.filter((m) => {
      const catMatch =
        catalogCategory === 'All' || m.category === catalogCategory;
      const textMatch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [menuItems, catalogCategory, catalogSearch]);

  if (!user) {
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center">
          <h1 className="font-display text-3xl font-semibold text-zinc-950 mb-3">
            Suman Cold Coffee Depot · Manager Sign-In
          </h1>
          <p className="text-sm text-zinc-600 max-w-md mx-auto mb-6 leading-relaxed">
            Customers do not need to sign in to order. Sign in here with the authorized Suman Cold Coffee Depot owner account to manage live orders, payments, and the cafe menu.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="px-5 py-2.5 min-h-[44px] text-sm font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            Manager Sign in with Google
          </button>
        </div>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-zinc-200 rounded-xl p-10 space-y-4">
          <div className="flex items-center gap-2.5 text-amber-800">
            <ShieldAlert className="w-5 h-5" />
            <span className="text-xs font-medium">Role-Based Access Control</span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-zinc-950">
            Depot Manager Authorization Required
          </h1>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Signed in as <span className="font-mono">{user.email}</span>. Customer order fulfillment, payment ledgers, and cloud menu management are restricted exclusively to Suman Cold Coffee Depot.
          </p>
          <button
            type="button"
            onClick={onSignOut}
            className="px-4 py-2 text-xs font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-50 cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </section>
    );
  }

  async function handleCreateMenuItem(e: React.FormEvent) {
    e.preventDefault();
    setFeedback('');
    const cleanName = name.trim().slice(0, BLUEPRINT_LIMITS.menuNameMax);
    const cleanDesc = description.trim().slice(0, BLUEPRINT_LIMITS.descriptionMax);
    const numPrice = Math.max(1, Math.min(5000, Number(price) || 80));

    if (cleanName.length < 2 || cleanDesc.length < 4) {
      setFeedback('Enter a valid item name and description.');
      return;
    }

    const slug =
      cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || `item_${Date.now()}`;

    const defaultImage =
      DEFAULT_MENU_ITEMS.find((m) => m.category === category)?.imageUrl ||
      DEFAULT_MENU_ITEMS[0].imageUrl;

    setSavingItem(true);
    try {
      await onAddMenuItem({
        id: `${slug}_${Date.now().toString(36)}`,
        name: cleanName,
        category,
        description: cleanDesc,
        price: numPrice,
        imageUrl: defaultImage,
        available: true,
        prepTimeMins: Math.max(1, Math.min(60, Number(prepTimeMins) || 5)),
        calories: Math.max(0, Math.min(2000, Number(calories) || 180)),
        caffeineMg: Math.max(0, Math.min(500, Number(caffeineMg) || 0)),
        featured: false,
      });
      setName('');
      setDescription('');
      setFeedback('Menu item published to Cloud Firestore.');
    } finally {
      setSavingItem(false);
    }
  }

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200">
        <div>
          <p className="text-xs font-medium text-amber-800 mb-1">
            Suman Cold Coffee Depot · Manager Console
          </p>
          <h1 className="font-display text-3xl font-semibold text-zinc-950">
            Customer Orders, Payments & Live Menu
          </h1>
        </div>

        <button
          type="button"
          onClick={onSeedMenu}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
        >
          <Database className="w-3.5 h-3.5" />
          <span>
            {isMenuSeeded
              ? `Re-Sync Real Shop Menu (${DEFAULT_MENU_ITEMS.length} Items)`
              : `Sync Real Shop Menu (${DEFAULT_MENU_ITEMS.length} Items)`}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500 mb-1">Total Sales</p>
          <p className="font-mono text-2xl font-semibold text-zinc-950 tabular-nums">
            ₹{metrics.totalRevenue}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500 mb-1">Paid Online</p>
          <p className="font-mono text-2xl font-semibold text-emerald-800 tabular-nums">
            ₹{metrics.paidOnline}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500 mb-1">Pending COD</p>
          <p className="font-mono text-2xl font-semibold text-amber-800 tabular-nums">
            ₹{metrics.pendingCod}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500 mb-1">Active Orders</p>
          <p className="font-mono text-2xl font-semibold text-zinc-950 tabular-nums">
            {metrics.activeCount}
          </p>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-zinc-950 flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-800" />
              <span>Depot Manager Order Notifications</span>
            </h2>
            <p className="text-xs text-zinc-600 leading-relaxed">
              New order alerts route internally to{' '}
              <span className="font-medium text-zinc-950">
                {alertConfig.managerDisplayName}
              </span>
              &apos;s configured manager email along with desktop popups and sound chimes while you work in other apps or tabs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleSoundAlerts}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-50 whitespace-nowrap cursor-pointer"
            >
              {soundAlertsEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Sound Chime: On</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Sound Chime: Off</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                playNewOrderChime();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-50 whitespace-nowrap cursor-pointer"
            >
              <span>Test Chime</span>
            </button>

            {browserPushStatus !== 'granted' && (
              <button
                type="button"
                onClick={onEnablePush}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-50 whitespace-nowrap cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-amber-800" />
                <span>Enable Desktop Alerts</span>
              </button>
            )}

            {isEmbeddedIframe() && (
              <a
                href="/?view=kitchen"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-50 whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-800" />
                <span>Open in Own Tab</span>
              </a>
            )}

            <button
              type="button"
              disabled={sendingTestEmail}
              onClick={handleSendTestEmail}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[38px] text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{sendingTestEmail ? 'Sending Test...' : 'Send Test Email'}</span>
            </button>
          </div>
        </div>

        {(isEmbeddedIframe() || browserPushStatus === 'denied') && browserPushStatus !== 'granted' && (
          <p className="text-xs text-zinc-600 pt-3 border-t border-zinc-100 leading-relaxed">
            Desktop popup notifications are blocked inside the preview frame. Click{' '}
            <span className="font-medium text-zinc-950">Open in Own Tab</span> above and allow Notifications there so popups appear even while you use other apps.
          </p>
        )}

        {!alertConfig.emailConfigured && (
          <p className="text-xs text-amber-900 pt-3 border-t border-zinc-100 leading-relaxed">
            Email alerts are waiting for credentials: add{' '}
            <span className="font-mono font-medium">GMAIL_USER</span> and{' '}
            <span className="font-mono font-medium">GMAIL_APP_PASSWORD</span> (a 16-character Google App Password) — or{' '}
            <span className="font-mono font-medium">RESEND_API_KEY</span> — in Secrets so every new order emails Suman Cold Coffee Depot&apos;s manager inbox.
          </p>
        )}

        {emailFeedback && (
          <p
            className={`text-xs font-medium pt-2 border-t border-zinc-100 ${
              emailFeedback.ok ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {emailFeedback.message}
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-zinc-950">
            Customer Orders & Payment Ledger ({filteredOrders.length})
          </h2>

          <div className="flex items-center gap-1 p-1 bg-zinc-200/70 rounded-lg overflow-x-auto">
            {(['All', 'Active', 'Pending COD', 'Completed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setOrderFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                  orderFilter === tab
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-8 text-sm text-zinc-500">
            No matching customer orders yet. Orders placed by customers appear here instantly with their items and payment details.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredOrders.map((order) => {
              const nextStatus = NEXT_STATUS_MAP[order.status];
              return (
                <article
                  key={order.id}
                  className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span className="font-mono font-semibold text-zinc-950">
                        {order.orderNumber}
                      </span>
                      <span
                        className={`font-medium ${
                          order.paymentStatus === 'Paid'
                            ? 'text-emerald-700'
                            : 'text-amber-800'
                        }`}
                      >
                        {order.paymentStatus} · {order.paymentMethod}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-zinc-950">
                        {order.customerName} ·{' '}
                        <span className="font-mono font-normal text-zinc-600">
                          {order.customerPhone}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {order.deliveryType}: {order.deliveryAddress}
                      </p>
                    </div>

                    <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-3 space-y-1.5">
                      {order.items.map((item, idx) => (
                        <div
                          key={`${item.itemId}-${idx}`}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-zinc-800">
                            <strong className="font-mono tabular-nums">
                              {item.quantity}×
                            </strong>{' '}
                            {item.name} ({item.size})
                          </span>
                          <span className="font-mono text-zinc-700 tabular-nums shrink-0">
                            ₹{item.price * item.quantity}
                          </span>
                        </div>
                      ))}
                      <div className="pt-1.5 border-t border-zinc-200 flex items-center justify-between text-xs font-semibold text-zinc-950">
                        <span className="font-mono text-zinc-500 font-normal">
                          Ref: {order.paymentReference}
                        </span>
                        <span className="font-mono tabular-nums">
                          Total ₹{order.totalAmount}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-700">
                      Status: <strong className="text-zinc-950">{order.status}</strong>
                    </span>

                    <div className="flex items-center gap-2">
                      {order.paymentStatus === 'Pending COD' &&
                        order.status !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() => onMarkCodPaid(order)}
                            className="px-3 py-2 text-xs font-medium border border-emerald-300 text-emerald-800 rounded-lg hover:bg-emerald-50 cursor-pointer whitespace-nowrap"
                          >
                            Mark COD Paid
                          </button>
                        )}

                      {nextStatus ? (
                        <button
                          type="button"
                          onClick={() => onAdvanceOrderStatus(order, nextStatus)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
                        >
                          <span>Move to {nextStatus}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{order.status}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-zinc-950">
              Live Catalog Controls ({filteredCatalog.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Filter item..."
                  aria-label="Filter catalog items"
                  className="pl-8 pr-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white w-40 focus:outline-none focus:border-zinc-950"
                />
              </div>
              <select
                aria-label="Filter catalog by category"
                value={catalogCategory}
                onChange={(e) =>
                  setCatalogCategory(e.target.value as 'All' | MenuCategory)
                }
                className="px-3 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white"
              >
                <option value="All">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-zinc-100 max-h-[560px] overflow-y-auto pr-1">
            {filteredCatalog.length === 0 ? (
              <p className="py-6 text-sm text-zinc-500">
                No menu items match your filter.
              </p>
            ) : (
              filteredCatalog.map((item) => (
                <CatalogItemRow
                  key={item.id}
                  item={item}
                  onToggleAvailability={onToggleAvailability}
                  onUpdatePrice={onUpdatePrice}
                />
              ))
            )}
          </div>
        </div>

        <form
          onSubmit={handleCreateMenuItem}
          className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
        >
          <h2 className="font-display text-xl font-semibold text-zinc-950">
            Publish New Menu Item
          </h2>

          <div>
            <label
              htmlFor="new-item-name"
              className="block text-xs font-medium text-zinc-700 mb-1"
            >
              Item Name
            </label>
            <input
              id="new-item-name"
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.menuNameMax}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Red Sauce Penne Pasta"
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="new-item-category"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Category
              </label>
              <select
                id="new-item-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as MenuCategory)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-950"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="new-item-price"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Price (₹)
              </label>
              <input
                id="new-item-price"
                type="number"
                min={1}
                max={5000}
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="new-item-desc"
              className="block text-xs font-medium text-zinc-700 mb-1"
            >
              Description
            </label>
            <textarea
              id="new-item-desc"
              rows={2}
              required
              maxLength={BLUEPRINT_LIMITS.descriptionMax}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Freshly prepared to order with house spices..."
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label
                htmlFor="new-item-prep"
                className="block text-xs text-zinc-600 mb-1"
              >
                Prep (m)
              </label>
              <input
                id="new-item-prep"
                type="number"
                min={1}
                max={60}
                value={prepTimeMins}
                onChange={(e) => setPrepTimeMins(e.target.value)}
                className="w-full px-2.5 py-2 text-sm font-mono border border-zinc-200 rounded-lg"
              />
            </div>
            <div>
              <label
                htmlFor="new-item-cal"
                className="block text-xs text-zinc-600 mb-1"
              >
                Calories
              </label>
              <input
                id="new-item-cal"
                type="number"
                min={0}
                max={2000}
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                className="w-full px-2.5 py-2 text-sm font-mono border border-zinc-200 rounded-lg"
              />
            </div>
            <div>
              <label
                htmlFor="new-item-caf"
                className="block text-xs text-zinc-600 mb-1"
              >
                Caffeine
              </label>
              <input
                id="new-item-caf"
                type="number"
                min={0}
                max={500}
                value={caffeineMg}
                onChange={(e) => setCaffeineMg(e.target.value)}
                className="w-full px-2.5 py-2 text-sm font-mono border border-zinc-200 rounded-lg"
              />
            </div>
          </div>

          {feedback && (
            <p className="text-xs font-medium text-emerald-700">{feedback}</p>
          )}

          <button
            type="submit"
            disabled={savingItem}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{savingItem ? 'Publishing...' : 'Add to Live Menu'}</span>
          </button>
        </form>
      </div>

      <OrderQrCard />

      <div className="bg-white border border-zinc-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-zinc-950">
            Your Private YouTube Short (Owner Only)
          </h2>
          <p className="text-xs text-zinc-600 leading-relaxed">
            Removed from the public website so only you can download the 9:16 MP4 and copy the title &amp; tags for your YouTube channel.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPrivateShortOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <PlayCircle className="w-4 h-4" />
          <span>Download / Preview YouTube Short</span>
        </button>
      </div>

      <PromoShortModal
        open={privateShortOpen}
        user={user}
        onClose={() => setPrivateShortOpen(false)}
      />
    </section>
  );
}
