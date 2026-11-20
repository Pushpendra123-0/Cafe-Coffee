import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Bell, LogOut, RotateCcw, Save } from 'lucide-react';
import type {
  GuestCustomerDetails,
  MilkOption,
  Order,
  SweetnessOption,
  UserNotification,
  UserProfile,
} from '../types';
import { BLUEPRINT_LIMITS, BOOTSTRAPPED_ADMIN_EMAIL } from '../firebase';
import type { BrowserPushStatus } from '../utils/notifications';

interface ProfileViewProps {
  user: User | null;
  profile: UserProfile | null;
  guestDetails: GuestCustomerDetails;
  orders: Order[];
  notifications: UserNotification[];
  browserPushStatus: BrowserPushStatus;
  onSignOut: () => Promise<void>;
  onSaveProfile: (updates: {
    displayName: string;
    phone: string;
    deliveryAddress: string;
    pushOptIn: boolean;
    defaultMilk: MilkOption;
    defaultSweetness: SweetnessOption;
  }) => Promise<void>;
  onSaveGuestDetails: (details: GuestCustomerDetails) => void;
  onMarkNotificationRead: (notification: UserNotification) => Promise<void>;
  onEnableBrowserPush: () => Promise<void>;
  onReorder: (order: Order) => void;
  onTrackOrder: (orderId: string) => void;
}

export function ProfileView({
  user,
  profile,
  guestDetails,
  orders,
  notifications,
  browserPushStatus,
  onSignOut,
  onSaveProfile,
  onSaveGuestDetails,
  onMarkNotificationRead,
  onEnableBrowserPush,
  onReorder,
  onTrackOrder,
}: ProfileViewProps) {
  const [displayName, setDisplayName] = useState(
    profile?.displayName || user?.displayName || guestDetails.displayName || ''
  );
  const [phone, setPhone] = useState(profile?.phone || guestDetails.phone || '');
  const [deliveryAddress, setDeliveryAddress] = useState(
    profile?.deliveryAddress || guestDetails.deliveryAddress || ''
  );
  const [defaultMilk, setDefaultMilk] = useState<MilkOption>(
    profile?.defaultMilk || 'Whole Dairy'
  );
  const [defaultSweetness, setDefaultSweetness] = useState<SweetnessOption>(
    profile?.defaultSweetness || 'Regular'
  );
  const [pushOptIn, setPushOptIn] = useState(profile?.pushOptIn ?? true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setPhone(profile.phone);
      setDeliveryAddress(profile.deliveryAddress);
      setDefaultMilk(profile.defaultMilk);
      setDefaultSweetness(profile.defaultSweetness);
      setPushOptIn(profile.pushOptIn);
    } else if (user) {
      setDisplayName(
        user.email === BOOTSTRAPPED_ADMIN_EMAIL
          ? 'Suman Cold Coffee Depot'
          : user.displayName || 'Suman Cold Coffee Depot'
      );
    } else {
      setDisplayName(guestDetails.displayName);
      setPhone(guestDetails.phone);
      setDeliveryAddress(guestDetails.deliveryAddress);
    }
  }, [profile, user, guestDetails]);

  if (!user) {
    const guestTotalSpent = orders
      .filter((o) => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <div className="pb-6 border-b border-zinc-200">
          <p className="text-xs text-zinc-500 mb-1">
            No sign-in required · {orders.length} order{orders.length === 1 ? '' : 's'} on this device · ₹{guestTotalSpent} total
          </p>
          <h1 className="font-display text-3xl font-semibold text-zinc-950">
            My Orders &amp; Delivery Info
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSaveGuestDetails({
                displayName: displayName.trim().slice(0, BLUEPRINT_LIMITS.nameMax),
                phone: phone.trim().slice(0, BLUEPRINT_LIMITS.phoneMax),
                deliveryAddress: deliveryAddress.trim().slice(0, BLUEPRINT_LIMITS.addressMax),
              });
              setSavedNotice('Delivery details saved for faster checkout.');
            }}
            className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-semibold text-zinc-950">
              Quick Checkout Details
            </h2>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Saved on your device so you do not have to retype your mobile or hostel/street address next time.
            </p>

            <div>
              <label
                htmlFor="guest-name"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Full Name
              </label>
              <input
                id="guest-name"
                type="text"
                maxLength={BLUEPRINT_LIMITS.nameMax}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>

            <div>
              <label
                htmlFor="guest-phone"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Mobile Number
              </label>
              <input
                id="guest-phone"
                type="tel"
                maxLength={BLUEPRINT_LIMITS.phoneMax}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>

            <div>
              <label
                htmlFor="guest-address"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Default Delivery Address
              </label>
              <textarea
                id="guest-address"
                rows={2}
                maxLength={BLUEPRINT_LIMITS.addressMax}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Amity hostel, block, or Noida street address..."
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              {savedNotice ? (
                <span className="text-xs text-emerald-700 font-medium">
                  {savedNotice}
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Details</span>
              </button>
            </div>
          </form>

          <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
            <h2 className="font-display text-xl font-semibold text-zinc-950">
              Orders Placed From This Device
            </h2>

            {orders.length === 0 ? (
              <p className="text-sm text-zinc-500 py-8">
                You have not placed any orders from this device yet. Add items from the menu and check out directly with your name, mobile number, and address.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {orders.map((order) => (
                  <article key={order.id} className="py-5 first:pt-0 last:pb-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-zinc-500 flex items-center gap-2">
                        <span className="font-mono font-semibold text-zinc-950">
                          {order.orderNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{order.status}</span>
                        <span aria-hidden="true">·</span>
                        <span>{order.paymentMethod}</span>
                      </div>
                      <span className="font-mono text-sm font-semibold text-zinc-950 tabular-nums">
                        ₹{order.totalAmount}
                      </span>
                    </div>

                    <p className="text-sm text-zinc-700">
                      {order.items
                        .map((item) => `${item.quantity}× ${item.name}`)
                        .join(', ')}
                    </p>

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => onTrackOrder(order.id)}
                        className="px-3.5 py-1.5 text-xs font-medium border border-zinc-300 text-zinc-900 rounded-lg hover:bg-zinc-50 cursor-pointer"
                      >
                        Track Order
                      </button>
                      <button
                        type="button"
                        onClick={() => onReorder(order)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reorder</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedNotice('');
    try {
      await onSaveProfile({
        displayName: displayName.trim().slice(0, BLUEPRINT_LIMITS.nameMax) || 'Guest',
        phone: phone.trim().slice(0, BLUEPRINT_LIMITS.phoneMax),
        deliveryAddress: deliveryAddress.trim().slice(0, BLUEPRINT_LIMITS.addressMax),
        pushOptIn,
        defaultMilk,
        defaultSweetness,
      });
      setSavedNotice('Profile saved to Cloud Firestore.');
    } finally {
      setSaving(false);
    }
  }

  const completedCount = orders.filter((o) => o.status === 'Delivered').length;
  const totalSpent = orders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200">
        <div>
          <p className="text-xs text-zinc-500 mb-1">
            {user.email === BOOTSTRAPPED_ADMIN_EMAIL ? 'Suman Cold Coffee Depot' : user.email} ·{' '}
            {orders.length} orders · {completedCount} delivered · ₹{totalSpent} lifetime
          </p>
          <h1 className="font-display text-3xl font-semibold text-zinc-950">
            {user.email === BOOTSTRAPPED_ADMIN_EMAIL
              ? profile?.displayName && !profile.displayName.includes('@')
                ? profile.displayName
                : 'Suman Cold Coffee Depot'
              : profile?.displayName || user.displayName || 'Your Depot Profile'}
          </h1>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] text-xs font-medium border border-zinc-300 bg-white text-zinc-800 rounded-lg hover:bg-zinc-50 self-start sm:self-auto cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-semibold text-zinc-950">
              Preferences & Delivery
            </h2>

            <div>
              <label
                htmlFor="profile-name"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Display Name
              </label>
              <input
                id="profile-name"
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.nameMax}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>

            <div>
              <label
                htmlFor="profile-phone"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Mobile Number
              </label>
              <input
                id="profile-phone"
                type="tel"
                maxLength={BLUEPRINT_LIMITS.phoneMax}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>

            <div>
              <label
                htmlFor="profile-address"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Default Delivery Address
              </label>
              <textarea
                id="profile-address"
                rows={2}
                maxLength={BLUEPRINT_LIMITS.addressMax}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Street, apartment, landmark..."
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="profile-milk"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Default Milk
                </label>
                <select
                  id="profile-milk"
                  value={defaultMilk}
                  onChange={(e) => setDefaultMilk(e.target.value as MilkOption)}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-950"
                >
                  <option>Whole Dairy</option>
                  <option>Oat Milk</option>
                  <option>Almond Milk</option>
                  <option>Soy Milk</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="profile-sweetness"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Sweetness
                </label>
                <select
                  id="profile-sweetness"
                  value={defaultSweetness}
                  onChange={(e) =>
                    setDefaultSweetness(e.target.value as SweetnessOption)
                  }
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-950"
                >
                  <option>Regular</option>
                  <option>Less Sugar</option>
                  <option>Sugar Free</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Order Push Notifications
                </p>
                <p className="text-xs text-zinc-500">
                  Browser status: {browserPushStatus}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const next = !pushOptIn;
                  setPushOptIn(next);
                  if (next && browserPushStatus !== 'granted') {
                    await onEnableBrowserPush();
                  }
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  pushOptIn
                    ? 'bg-zinc-950 border-zinc-950 text-white'
                    : 'bg-white border-zinc-300 text-zinc-700'
                }`}
              >
                {pushOptIn ? 'Enabled' : 'Paused'}
              </button>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              {savedNotice ? (
                <span className="text-xs text-emerald-700 font-medium">
                  {savedNotice}
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </div>
          </form>

          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-zinc-950 flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-800" />
                <span>Notification Inbox</span>
              </h2>
              <span className="text-xs font-mono text-zinc-500 tabular-nums">
                {notifications.filter((n) => !n.read).length} unread
              </span>
            </div>

            {notifications.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4">
                Real-time order confirmations and barista status alerts will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {notifications.slice(0, 8).map((n) => (
                  <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={`text-sm ${
                            n.read
                              ? 'text-zinc-700 font-medium'
                              : 'text-zinc-950 font-semibold'
                          }`}
                        >
                          {n.title}
                        </p>
                        <p className="text-xs text-zinc-600 mt-0.5">
                          {n.message}
                        </p>
                      </div>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => onMarkNotificationRead(n)}
                          className="text-xs font-medium text-amber-800 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
          <h2 className="font-display text-xl font-semibold text-zinc-950">
            Past & Active Orders
          </h2>

          {orders.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8">
              You have not placed any orders yet.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {orders.map((order) => (
                <article key={order.id} className="py-5 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-zinc-500 flex items-center gap-2">
                      <span className="font-mono font-semibold text-zinc-950">
                        {order.orderNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{order.status}</span>
                      <span aria-hidden="true">·</span>
                      <span>{order.paymentMethod}</span>
                    </div>
                    <span className="font-mono text-sm font-semibold text-zinc-950 tabular-nums">
                      ₹{order.totalAmount}
                    </span>
                  </div>

                  <p className="text-sm text-zinc-700">
                    {order.items
                      .map((item) => `${item.quantity}× ${item.name}`)
                      .join(', ')}
                  </p>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => onTrackOrder(order.id)}
                      className="px-3.5 py-1.5 text-xs font-medium border border-zinc-300 text-zinc-900 rounded-lg hover:bg-zinc-50 cursor-pointer"
                    >
                      Track Order
                    </button>
                    <button
                      type="button"
                      onClick={() => onReorder(order)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reorder</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
