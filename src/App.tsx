import { useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Bell, QrCode, Search, X } from 'lucide-react';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './firebase';
import { DEFAULT_MENU_ITEMS, HERO_IMAGE_URL } from './data/defaultMenu';
import type {
  ActiveView,
  CartItem,
  DeliveryType,
  GuestCustomerDetails,
  MenuCategory,
  MenuItem,
  MilkOption,
  Order,
  OrderLineItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  SizeOption,
  SizePrices,
  SweetnessOption,
  UserNotification,
  UserProfile,
} from './types';
import {
  dispatchBrowserPush,
  getBrowserPushStatus,
  isEmbeddedIframe,
  playNewOrderChime,
  requestBrowserPushPermission,
  type BrowserPushStatus,
} from './utils/notifications';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { SafeImage } from './components/SafeImage';
import { MenuSection } from './components/MenuSection';
import { ItemDetailModal } from './components/ItemDetailModal';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import { LiveTrackerView } from './components/LiveTrackerView';
import { ProfileView } from './components/ProfileView';
import { KitchenConsoleView } from './components/KitchenConsoleView';
import { OrderQrModal } from './components/OrderQrSection';

const MENU_CATEGORIES: MenuCategory[] = [
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

const CATEGORY_TABS: ('All' | MenuCategory)[] = ['All', ...MENU_CATEGORIES];

const SECTION_IMAGE_BY_CATEGORY: Record<MenuCategory, string> = {
  Shakes: '/src/assets/images/cafe_cold_coffee_shake_1794935514025.jpg',
  'Hot Beverages': '/src/assets/images/cafe_kulhad_chai_coffee_1794935515222.jpg',
  'Mocktails & Mojitos': '/src/assets/images/cafe_mojito_mocktails_1794935515521.jpg',
  Maggi: '/src/assets/images/cafe_masala_maggi_1794935516169.jpg',
  'Pasta & Eggs': '/src/assets/images/cafe_bread_omelet_bhurji_1794935517247.jpg',
  Rolls: '/src/assets/images/cafe_kathi_roll_1794935516327.jpg',
  Paratha: '/src/assets/images/cafe_aloo_paratha_1794935516475.jpg',
  Sandwich: '/src/assets/images/cafe_grilled_sandwich_1794935517232.jpg',
  'Kurkuria Sandwich': '/src/assets/images/cafe_grilled_sandwich_1794935517232.jpg',
};

const GUEST_ID_STORAGE_KEY = 'suman_depot_guest_id';
const GUEST_DETAILS_STORAGE_KEY = 'suman_depot_guest_details';
const GUEST_ORDERS_STORAGE_KEY = 'suman_depot_guest_orders';

function randomAlnum(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) {
      out += chars[buf[i] % chars.length];
    }
    return out;
  }
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function getOrCreateGuestId(): string {
  if (typeof window === 'undefined') return 'guest_default00000001';
  try {
    const existing = window.localStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (existing && /^guest_[a-zA-Z0-9]{12,64}$/.test(existing)) {
      return existing;
    }
    const created = `guest_${randomAlnum(16)}`;
    window.localStorage.setItem(GUEST_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return `guest_${randomAlnum(16)}`;
  }
}

function loadGuestDetails(): GuestCustomerDetails {
  if (typeof window === 'undefined') {
    return { displayName: '', phone: '', deliveryAddress: '' };
  }
  try {
    const raw = window.localStorage.getItem(GUEST_DETAILS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GuestCustomerDetails>;
      return {
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
        phone: typeof parsed.phone === 'string' ? parsed.phone : '',
        deliveryAddress:
          typeof parsed.deliveryAddress === 'string' ? parsed.deliveryAddress : '',
      };
    }
  } catch {
    // Ignore storage error
  }
  return { displayName: '', phone: '', deliveryAddress: '' };
}

function loadGuestOrders(): Order[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GUEST_ORDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Order[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore storage error
  }
  return [];
}

function serializeMenuItemForFirestore(item: Omit<MenuItem, 'updatedAt'>) {
  const payload: Record<string, unknown> = {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    price: item.price,
    imageUrl: item.imageUrl,
    available: item.available,
    prepTimeMins: item.prepTimeMins,
    calories: item.calories,
    caffeineMg: item.caffeineMg,
    featured: item.featured,
    updatedAt: serverTimestamp(),
  };
  if (item.sizePrices) {
    payload.sizePrices = item.sizePrices;
  }
  return payload;
}

function DepotApp() {
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window !== 'undefined') {
      const view = new URLSearchParams(window.location.search).get('view');
      if (view === 'kitchen' || view === 'tracker' || view === 'profile') {
        return view;
      }
    }
    return 'menu';
  });
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [cloudMenuItems, setCloudMenuItems] = useState<MenuItem[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [guestId] = useState<string>(() => getOrCreateGuestId());
  const [guestDetails, setGuestDetails] = useState<GuestCustomerDetails>(() =>
    loadGuestDetails()
  );
  const [guestOrders, setGuestOrders] = useState<Order[]>(() => loadGuestOrders());
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<'All' | MenuCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('suman_depot_cart');
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [defaultDeliveryType] = useState<DeliveryType>(() => {
    if (typeof window !== 'undefined') {
      const mode = new URLSearchParams(window.location.search).get('mode');
      if (mode === 'pickup') return 'Depot Pickup';
    }
    return 'Delivery';
  });

  const [browserPushStatus, setBrowserPushStatus] = useState<BrowserPushStatus>(() =>
    getBrowserPushStatus()
  );
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('suman_depot_manager_sound') !== 'false';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const knownOrderStatusesRef = useRef<Record<string, OrderStatus>>({});
  const initialOrdersLoadedRef = useRef(false);
  const soundAlertsEnabledRef = useRef(soundAlertsEnabled);
  const pushOptInRef = useRef(profile?.pushOptIn ?? true);

  soundAlertsEnabledRef.current = soundAlertsEnabled;
  pushOptInRef.current = profile?.pushOptIn ?? true;

  const isAdmin =
    Boolean(user?.emailVerified) && user?.email === BOOTSTRAPPED_ADMIN_EMAIL;

  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('suman_depot_cart', JSON.stringify(cart));
    } catch {
      // Ignore storage quota issues
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(GUEST_ORDERS_STORAGE_KEY, JSON.stringify(guestOrders.slice(0, 25)));
    } catch {
      // Ignore storage quota issues
    }
  }, [guestOrders]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      const isVerifiedAdmin =
        Boolean(nextUser?.emailVerified) &&
        nextUser?.email === BOOTSTRAPPED_ADMIN_EMAIL;

      if (nextUser && isVerifiedAdmin) {
        const userRef = doc(db, 'users', nextUser.uid);
        try {
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: nextUser.uid,
              displayName: 'Suman Cold Coffee Depot',
              email: (nextUser.email || BOOTSTRAPPED_ADMIN_EMAIL).slice(0, 120),
              phone: '',
              deliveryAddress: '',
              pushOptIn: true,
              defaultMilk: 'Whole Dairy',
              defaultSweetness: 'Regular',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${nextUser.uid}`);
        }
      } else if (!nextUser) {
        setProfile(null);
        setOrders([]);
        setNotifications([]);
        knownOrderStatusesRef.current = {};
        initialOrdersLoadedRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  const guestTrackIdsKey = useMemo(
    () =>
      guestOrders
        .slice(0, 10)
        .map((o) => o.id)
        .join(','),
    [guestOrders]
  );

  useEffect(() => {
    if (user || !guestTrackIdsKey) return;
    const ids = guestTrackIdsKey.split(',').filter((id) => id.length >= 18);
    const unsubs = ids.map((id) =>
      onSnapshot(
        doc(db, 'orderStatus', id),
        (snap) => {
          if (!snap.exists()) return;
          const mirror = snap.data() as {
            status?: OrderStatus;
            estimatedMinutes?: number;
            paymentStatus?: PaymentStatus;
            updatedAt?: { seconds: number; nanoseconds: number } | null;
          };
          setGuestOrders((prev) =>
            prev.map((existingOrder) => {
              if (existingOrder.id !== id) return existingOrder;
              if (
                mirror.status &&
                mirror.status !== existingOrder.status
              ) {
                const title = `Order ${existingOrder.orderNumber}: ${mirror.status}`;
                const body = `Your Suman Cold Coffee Depot order is now ${mirror.status}.`;
                showToast(title, body);
                dispatchBrowserPush(title, body, id);
              }
              return {
                ...existingOrder,
                status: mirror.status || existingOrder.status,
                estimatedMinutes:
                  typeof mirror.estimatedMinutes === 'number'
                    ? mirror.estimatedMinutes
                    : existingOrder.estimatedMinutes,
                paymentStatus: mirror.paymentStatus || existingOrder.paymentStatus,
                updatedAt: mirror.updatedAt || existingOrder.updatedAt,
              };
            })
          );
        },
        () => {
          // Ignore status lookup misses for legacy orders
        }
      )
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [user, guestTrackIdsKey]);

  useEffect(() => {
    const menuRef = collection(db, 'menuItems');
    const unsub = onSnapshot(
      menuRef,
      (snapshot) => {
        const loaded = snapshot.docs.map((d) => d.data() as MenuItem);
        setCloudMenuItems(loaded);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'menuItems');
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

    const profileRef = doc(db, 'users', user.uid);
    const unsubProfile = onSnapshot(
      profileRef,
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }
    );

    const ordersQuery = isAdmin
      ? query(collection(db, 'orders'))
      : query(collection(db, 'orders'), where('userId', '==', user.uid));

    const unsubOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({
            ...(d.data() as Omit<Order, 'id'>),
            id: d.id,
          }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setOrders(list);

        if (initialOrdersLoadedRef.current) {
          for (const order of list) {
            const prevStatus = knownOrderStatusesRef.current[order.id];
            if (!prevStatus && isAdmin && order.status === 'Placed') {
              const title = `New Order ${order.orderNumber} · ₹${order.totalAmount}`;
              const body = `${order.customerName} (${order.deliveryType}) · ${order.paymentMethod}`;
              showToast(title, body);
              dispatchBrowserPush(title, body, order.id);
              if (soundAlertsEnabledRef.current) {
                playNewOrderChime();
              }
              user
                .getIdToken()
                .then((idToken) =>
                  fetch('/api/orders/notify-manager', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                      orderId: order.id,
                      orderNumber: order.orderNumber,
                      status: order.status,
                      customerName: order.customerName,
                      customerPhone: order.customerPhone,
                      deliveryType: order.deliveryType,
                      deliveryAddress: order.deliveryAddress,
                      paymentMethod: order.paymentMethod,
                      paymentStatus: order.paymentStatus,
                      paymentReference: order.paymentReference,
                      totalAmount: order.totalAmount,
                      estimatedMinutes: order.estimatedMinutes,
                      notes: order.notes,
                      items: order.items.slice(0, 20),
                    }),
                  })
                )
                .catch(() => {});
            } else if (prevStatus && prevStatus !== order.status && order.userId === user.uid) {
              const title = `Order ${order.orderNumber}: ${order.status}`;
              const body = `Your Suman Cold Coffee Depot order is now ${order.status}.`;
              showToast(title, body);
              if (pushOptInRef.current !== false) {
                dispatchBrowserPush(title, body, order.id);
              }
            }
          }
        }
        const nextMap: Record<string, OrderStatus> = {};
        for (const order of list) {
          nextMap[order.id] = order.status;
        }
        knownOrderStatusesRef.current = nextMap;
        initialOrdersLoadedRef.current = true;
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
    );

    const notifQuery = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc')
    );
    const unsubNotifs = onSnapshot(
      notifQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => d.data() as UserNotification);
        setNotifications(items);
      },
      (err) => {
        handleFirestoreError(
          err,
          OperationType.LIST,
          `users/${user.uid}/notifications`
        );
      }
    );

    return () => {
      unsubProfile();
      unsubOrders();
      unsubNotifs();
    };
  }, [authReady, user, isAdmin]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isAdmin) {
      document.title = 'Suman Cold Coffee Depot';
      return;
    }
    const activeCount = orders.filter(
      (o) => o.status !== 'Delivered' && o.status !== 'Cancelled'
    ).length;
    document.title =
      activeCount > 0
        ? `(${activeCount} Active) Suman Cold Coffee Depot`
        : 'Suman Cold Coffee Depot';
  }, [isAdmin, orders]);

  function handleToggleSoundAlerts() {
    setSoundAlertsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('suman_depot_manager_sound', String(next));
      } catch {
        // Ignore storage error
      }
      if (next) {
        playNewOrderChime();
      }
      return next;
    });
  }

  function showToast(title: string, body: string) {
    setToast({ title, body });
    window.setTimeout(() => {
      setToast((current) =>
        current?.title === title && current?.body === body ? null : current
      );
    }, 5000);
  }

  const menuItems = useMemo(() => {
    if (cloudMenuItems.length === 0) return DEFAULT_MENU_ITEMS;
    const validCategories = new Set(CATEGORY_TABS);
    const defaultImageById = new Map(
      DEFAULT_MENU_ITEMS.map((item) => [item.id, item.imageUrl])
    );
    const cloudById = new Map<string, MenuItem>();

    for (const m of cloudMenuItems) {
      if (!validCategories.has(m.category)) continue;
      const mappedImage = defaultImageById.get(m.id);
      const normalized =
        mappedImage && m.imageUrl.includes('/menu_')
          ? { ...m, imageUrl: mappedImage }
          : m;
      cloudById.set(m.id, normalized);
    }

    const merged: MenuItem[] = DEFAULT_MENU_ITEMS.map(
      (def) => cloudById.get(def.id) ?? def
    );
    for (const cloudItem of cloudById.values()) {
      if (!defaultImageById.has(cloudItem.id)) {
        merged.push(cloudItem);
      }
    }
    return merged;
  }, [cloudMenuItems]);

  const filteredMenu = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menuItems.filter((item) => {
      const catMatch =
        selectedCategory === 'All' || item.category === selectedCategory;
      const textMatch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  const sectionsToRender = useMemo(() => {
    const categories =
      selectedCategory === 'All' ? MENU_CATEGORIES : [selectedCategory];
    return categories
      .map((cat) => ({
        category: cat,
        image: SECTION_IMAGE_BY_CATEGORY[cat],
        items: filteredMenu.filter((item) => item.category === cat),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [selectedCategory, filteredMenu]);

  const myOrders = useMemo(() => {
    if (!user) return guestOrders;
    return orders.filter((o) => o.userId === user.uid);
  }, [orders, user, guestOrders]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/popup-blocked') {
        showToast(
          'Allow Sign-In Popup',
          'Your browser blocked the sign-in window. Allow popups or open this link directly in Chrome or Safari.'
        );
        return;
      }
      if (code === 'auth/unauthorized-domain') {
        showToast(
          'Authorize This Domain',
          `Add "${window.location.hostname}" in Firebase Console → Authentication → Settings → Authorized domains.`
        );
        return;
      }
      showToast(
        'Sign-In Interrupted',
        err instanceof Error ? err.message : 'Please try Google Sign-In again.'
      );
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    setActiveView('menu');
  }

  function addItemToCart(payload: {
    item: MenuItem;
    quantity: number;
    size: SizeOption;
    milk: MilkOption;
    sweetness: SweetnessOption;
    note: string;
    unitPrice: number;
  }) {
    const cartKey = `${payload.item.id}::${payload.size}::${payload.milk}::${payload.sweetness}::${payload.note}`;
    setCart((prev) => {
      const existing = prev.find((c) => c.cartKey === cartKey);
      if (existing) {
        return prev.map((c) =>
          c.cartKey === cartKey
            ? { ...c, quantity: Math.min(20, c.quantity + payload.quantity) }
            : c
        );
      }
      return [
        ...prev,
        {
          cartKey,
          itemId: payload.item.id,
          name: payload.item.name,
          basePrice: payload.item.price,
          price: payload.unitPrice,
          quantity: payload.quantity,
          imageUrl: payload.item.imageUrl,
          size: payload.size,
          milk: payload.milk,
          sweetness: payload.sweetness,
          note: payload.note || undefined,
        },
      ];
    });
    setActiveItem(null);
    showToast(
      'Added to Bag',
      `${payload.quantity}× ${payload.item.name} (${payload.size})`
    );
  }

  function handleQuickAdd(item: MenuItem, size: SizeOption) {
    const unitPrice =
      item.sizePrices && (size === 'S' || size === 'M' || size === 'L' || size === 'XL')
        ? item.sizePrices[size]
        : item.price;

    addItemToCart({
      item,
      quantity: 1,
      size,
      milk: 'Whole Dairy',
      sweetness: 'Regular',
      note: '',
      unitPrice,
    });
  }

  function handleUpdateCartQty(cartKey: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) =>
          c.cartKey === cartKey ? { ...c, quantity: c.quantity + delta } : c
        )
        .filter((c) => c.quantity > 0)
    );
  }

  function handleRemoveCartItem(cartKey: string) {
    setCart((prev) => prev.filter((c) => c.cartKey !== cartKey));
  }

  async function handleEnablePush() {
    const status = await requestBrowserPushPermission();
    setBrowserPushStatus(status);
    if (user && profile) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: profile.displayName,
          phone: profile.phone,
          deliveryAddress: profile.deliveryAddress,
          pushOptIn: status === 'granted',
          defaultMilk: profile.defaultMilk,
          defaultSweetness: profile.defaultSweetness,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
    if (status === 'granted') {
      dispatchBrowserPush(
        'Push Alerts Active',
        'You will receive live order status notifications from Suman Cold Coffee Depot.'
      );
      playNewOrderChime();
      showToast('Push Alerts Active', 'Real-time desktop & sound alerts enabled.');
      return;
    }
    if (status === 'unsupported') {
      showToast(
        'Browser Does Not Support Desktop Push',
        'Use Sound Chime alerts, in-app notifications, or Gmail order alerts instead.'
      );
      return;
    }
    if (isEmbeddedIframe()) {
      showToast(
        'Open in Full Tab for Desktop Popups',
        'Browsers block notification prompts inside embedded previews. Open Kitchen Console in a separate browser tab to allow desktop alerts.'
      );
      return;
    }
    showToast(
      'Notifications Blocked by Browser',
      'Click the lock/settings icon in your browser address bar to allow Notifications for this site.'
    );
  }

  function handleSaveGuestDetails(details: GuestCustomerDetails) {
    setGuestDetails(details);
    try {
      localStorage.setItem(GUEST_DETAILS_STORAGE_KEY, JSON.stringify(details));
    } catch {
      // Ignore storage error
    }
  }

  async function handlePlaceOrder(payload: {
    customerName: string;
    customerPhone: string;
    deliveryType: DeliveryType;
    deliveryAddress: string;
    paymentMethod: PaymentMethod;
    paymentStatus: 'Paid' | 'Pending COD';
    paymentReference: string;
    verifiedItems: OrderLineItem[];
    subtotal: number;
    tax: number;
    deliveryFee: number;
    totalAmount: number;
    notes: string;
  }) {
    const orderUserId = user?.uid || guestId;
    const orderId = `ord_${Date.now().toString(36)}_${randomAlnum(12)}`;
    const orderNumber = `SCCD-${Math.floor(1000 + Math.random() * 9000)}`;
    const estimatedMinutes = Math.max(
      12,
      payload.verifiedItems.reduce((m, i) => Math.max(m, 14 + i.quantity * 2), 15)
    );

    const orderPayload = {
      orderNumber,
      userId: orderUserId,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      deliveryType: payload.deliveryType,
      deliveryAddress: payload.deliveryAddress,
      items: payload.verifiedItems.slice(0, 20),
      subtotal: payload.subtotal,
      tax: payload.tax,
      deliveryFee: payload.deliveryFee,
      totalAmount: payload.totalAmount,
      paymentMethod: payload.paymentMethod,
      paymentStatus: payload.paymentStatus,
      paymentReference: payload.paymentReference,
      status: 'Placed' as OrderStatus,
      estimatedMinutes,
      notes: payload.notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const itemsSummary = payload.verifiedItems
      .slice(0, 20)
      .map((i) => `${i.quantity}x ${i.name}${i.size && i.size !== 'Regular' ? ` (${i.size})` : ''}`)
      .join(', ')
      .slice(0, 240);

    const statusMirrorPayload = {
      orderId,
      orderNumber,
      status: 'Placed' as OrderStatus,
      estimatedMinutes,
      deliveryType: payload.deliveryType,
      paymentMethod: payload.paymentMethod,
      paymentStatus: payload.paymentStatus,
      totalAmount: payload.totalAmount,
      itemsSummary: itemsSummary || 'Cafe Order',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', orderId), orderPayload);
      batch.set(doc(db, 'orderStatus', orderId), statusMirrorPayload);
      await batch.commit();

      if (user && isAdmin) {
        const notifId = `notif_${Date.now().toString(36)}`;
        await setDoc(doc(db, 'users', user.uid, 'notifications', notifId), {
          id: notifId,
          userId: user.uid,
          orderId,
          title: `Order ${orderNumber} Confirmed`,
          message: `${payload.paymentStatus} via ${payload.paymentMethod} (${payload.paymentReference}). Estimated ${estimatedMinutes} mins.`,
          type: 'order_placed',
          read: false,
          createdAt: serverTimestamp(),
        });
      } else {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const localGuestOrder: Order = {
          id: orderId,
          orderNumber,
          userId: orderUserId,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          deliveryType: payload.deliveryType,
          deliveryAddress: payload.deliveryAddress,
          items: payload.verifiedItems.slice(0, 20),
          subtotal: payload.subtotal,
          tax: payload.tax,
          deliveryFee: payload.deliveryFee,
          totalAmount: payload.totalAmount,
          paymentMethod: payload.paymentMethod,
          paymentStatus: payload.paymentStatus,
          paymentReference: payload.paymentReference,
          status: 'Placed',
          estimatedMinutes,
          notes: payload.notes,
          createdAt: { seconds: nowSeconds, nanoseconds: 0 },
          updatedAt: { seconds: nowSeconds, nanoseconds: 0 },
        };
        setGuestOrders((prev) => [localGuestOrder, ...prev].slice(0, 25));
        handleSaveGuestDetails({
          displayName: payload.customerName,
          phone: payload.customerPhone,
          deliveryAddress:
            payload.deliveryType === 'Delivery'
              ? payload.deliveryAddress
              : guestDetails.deliveryAddress,
        });
      }

      setCart([]);
      setCartOpen(false);
      setSelectedOrderId(orderId);
      setActiveView('tracker');
      showToast(
        `Order ${orderNumber} Confirmed`,
        `Tracking live · ETA ~${estimatedMinutes} mins`
      );
      if (profile?.pushOptIn !== false) {
        dispatchBrowserPush(
          `Order ${orderNumber} Confirmed`,
          `Our baristas have received your order. ETA ~${estimatedMinutes} mins.`,
          orderId
        );
      }

      const sendManagerAlert = async () => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (user) {
          const idToken = await user.getIdToken();
          headers.Authorization = `Bearer ${idToken}`;
        }
        await fetch('/api/orders/notify-manager', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            orderId,
            orderNumber,
            status: 'Placed',
            customerName: payload.customerName,
            customerPhone: payload.customerPhone,
            deliveryType: payload.deliveryType,
            deliveryAddress: payload.deliveryAddress,
            paymentMethod: payload.paymentMethod,
            paymentStatus: payload.paymentStatus,
            paymentReference: payload.paymentReference,
            totalAmount: payload.totalAmount,
            estimatedMinutes,
            notes: payload.notes,
            items: payload.verifiedItems.slice(0, 20),
          }),
        });
      };
      sendManagerAlert().catch(() => {});
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
    }
  }

  async function handleCancelOrder(order: Order) {
    if (!user || order.status !== 'Placed') return;
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'Cancelled',
        updatedAt: serverTimestamp(),
      });
      updateDoc(doc(db, 'orderStatus', order.id), {
        status: 'Cancelled',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      showToast(`Order ${order.orderNumber} Cancelled`, 'Your order has been cancelled.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  }

  async function handleSaveProfile(updates: {
    displayName: string;
    phone: string;
    deliveryAddress: string;
    pushOptIn: boolean;
    defaultMilk: MilkOption;
    defaultSweetness: SweetnessOption;
  }) {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  async function handleMarkNotificationRead(notif: UserNotification) {
    if (!user) return;
    try {
      await updateDoc(
        doc(db, 'users', user.uid, 'notifications', notif.id),
        { read: true }
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `users/${user.uid}/notifications/${notif.id}`
      );
    }
  }

  function handleReorder(order: Order) {
    const newItems: CartItem[] = order.items.map((line, idx) => {
      const matched = menuItems.find((m) => m.id === line.itemId);
      return {
        cartKey: `${line.itemId}::${line.size}::${line.milk}::${line.sweetness}::reorder-${idx}`,
        itemId: line.itemId,
        name: line.name,
        basePrice: matched?.price || line.price,
        price: line.price,
        quantity: line.quantity,
        imageUrl: matched?.imageUrl || DEFAULT_MENU_ITEMS[0].imageUrl,
        size: (line.size as SizeOption) || 'Regular',
        milk: (line.milk as MilkOption) || 'Whole Dairy',
        sweetness: (line.sweetness as SweetnessOption) || 'Regular',
      };
    });
    setCart(newItems);
    setCartOpen(true);
  }

  async function handleAdvanceOrderStatus(order: Order, nextStatus: OrderStatus) {
    if (!isAdmin) return;
    const etaByStatus: Record<OrderStatus, number> = {
      Placed: 18,
      Brewing: 12,
      'Quality Check': 8,
      'Out for Delivery': 5,
      Delivered: 1,
      Cancelled: 1,
    };

    const nextPaymentStatus: PaymentStatus =
      nextStatus === 'Delivered' ? 'Paid' : order.paymentStatus;

    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: nextStatus,
        estimatedMinutes: etaByStatus[nextStatus],
        paymentStatus: nextPaymentStatus,
        updatedAt: serverTimestamp(),
      });

      updateDoc(doc(db, 'orderStatus', order.id), {
        status: nextStatus,
        estimatedMinutes: etaByStatus[nextStatus],
        paymentStatus: nextPaymentStatus,
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      if (!order.userId.startsWith('guest_')) {
        const notifId = `notif_${Date.now().toString(36)}`;
        setDoc(doc(db, 'users', order.userId, 'notifications', notifId), {
          id: notifId,
          userId: order.userId,
          orderId: order.id,
          title: `Order ${order.orderNumber} · ${nextStatus}`,
          message: `Your order status updated to ${nextStatus}.`,
          type: 'status_update',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      showToast(`Updated ${order.orderNumber}`, `Status set to ${nextStatus}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  }

  async function handleMarkCodPaid(order: Order) {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        paymentStatus: 'Paid',
        updatedAt: serverTimestamp(),
      });
      updateDoc(doc(db, 'orderStatus', order.id), {
        paymentStatus: 'Paid',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      showToast(`Payment Recorded`, `${order.orderNumber} marked as Paid.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  }

  async function handleSeedMenu() {
    if (!isAdmin) return;
    try {
      const batch = writeBatch(db);
      for (const item of DEFAULT_MENU_ITEMS) {
        batch.set(
          doc(db, 'menuItems', item.id),
          serializeMenuItemForFirestore(item)
        );
      }
      await batch.commit();
      showToast(
        'Menu Synced',
        `All ${DEFAULT_MENU_ITEMS.length} shop menu items published to Cloud Firestore.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'menuItems');
    }
  }

  async function handleToggleAvailability(item: MenuItem) {
    if (!isAdmin) return;
    try {
      await setDoc(
        doc(db, 'menuItems', item.id),
        serializeMenuItemForFirestore({ ...item, available: !item.available })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `menuItems/${item.id}`);
    }
  }

  async function handleUpdatePrice(
    item: MenuItem,
    newPrice: number,
    newSizePrices?: SizePrices
  ) {
    if (!isAdmin) return;
    const clampPrice = (val: number) =>
      Math.max(1, Math.min(5000, Math.round(Number.isFinite(val) ? val : item.price)));

    const sanitizedSizes: SizePrices | undefined = newSizePrices
      ? {
          S: clampPrice(newSizePrices.S),
          M: clampPrice(newSizePrices.M),
          L: clampPrice(newSizePrices.L),
          XL: clampPrice(newSizePrices.XL),
        }
      : item.sizePrices;

    const sanitizedPrice = sanitizedSizes ? sanitizedSizes.S : clampPrice(newPrice);

    try {
      await setDoc(
        doc(db, 'menuItems', item.id),
        serializeMenuItemForFirestore({
          ...item,
          price: sanitizedPrice,
          sizePrices: sanitizedSizes,
        })
      );
      showToast(
        'Price Updated',
        sanitizedSizes
          ? `${item.name}: S ₹${sanitizedSizes.S} / M ₹${sanitizedSizes.M} / L ₹${sanitizedSizes.L} / XL ₹${sanitizedSizes.XL}`
          : `${item.name} is now ₹${sanitizedPrice}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `menuItems/${item.id}`);
    }
  }

  async function handleAddMenuItem(item: Omit<MenuItem, 'updatedAt'>) {
    if (!isAdmin) return;
    try {
      await setDoc(
        doc(db, 'menuItems', item.id),
        serializeMenuItemForFirestore(item)
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `menuItems/${item.id}`);
    }
  }

  const unreadNotifCount = notifications.filter((n) => !n.read).length;
  const activeKitchenCount = isAdmin
    ? orders.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled').length
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-950">
      <Header
        activeView={activeView}
        onNavigate={setActiveView}
        cartCount={cartCount}
        unreadNotifCount={unreadNotifCount}
        activeKitchenCount={activeKitchenCount}
        onOpenCart={() => setCartOpen(true)}
      />

      <main className="flex-1">
        {activeView === 'menu' && (
          <>
            <section className="bg-white border-b border-zinc-200">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-between gap-6 py-1">
                  <div>
                    <p className="text-xs font-medium text-amber-800 mb-3">
                      In front of Amity University Gate No. 4, Noida, UP ·{' '}
                      <a
                        href="tel:+918505939149"
                        className="hover:underline underline-offset-2 tabular-nums"
                      >
                        8505939149
                      </a>
                      {' / '}
                      <a
                        href="tel:+919310923641"
                        className="hover:underline underline-offset-2 tabular-nums"
                      >
                        9310923641
                      </a>
                    </p>
                    <h1 className="font-display text-4xl sm:text-5xl font-semibold text-zinc-950 tracking-tight leading-[1.08]">
                      Shakes, Mojitos, Maggi &amp; Hot Cafe Eats.
                    </h1>
                    <p className="mt-4 text-base text-zinc-600 leading-relaxed max-w-xl">
                      Order from Suman Cold Coffee Depot (opposite Amity University Gate No. 4, Noida)—Shakes, Hot Beverages, Mocktails, Maggi, Rolls, Parathas, and Sandwiches with Cash/QR on Delivery &amp; Pickup and live tracking.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href="#menu-catalog"
                      className="px-5 py-3 min-h-[44px] inline-flex items-center text-sm font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      Order From Menu ({menuItems.length})
                    </a>
                    <button
                      type="button"
                      onClick={() => setActiveView('tracker')}
                      className="px-5 py-3 min-h-[44px] inline-flex items-center text-sm font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer"
                    >
                      Track Live Orders{myOrders.length > 0 ? ` (${myOrders.length})` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 hover:text-zinc-950 underline underline-offset-4 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Scan / Print Order QR</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6 aspect-[16/9] lg:aspect-auto rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200">
                  <SafeImage
                    src={HERO_IMAGE_URL}
                    alt="Cold coffee and Oreo shake at Suman Cold Coffee Depot"
                    fallbackLabel="Suman Cold Coffee Depot"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </section>

            <section
              id="menu-catalog"
              className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-semibold text-zinc-950">
                    {selectedCategory === 'All' ? 'Menu by Section' : selectedCategory}{' '}
                    <span className="font-mono text-base font-normal text-zinc-500 tabular-nums">
                      ({filteredMenu.length})
                    </span>
                  </h2>

                  <div className="relative w-full md:w-72">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search maggi, roll, shake..."
                      aria-label="Search menu items"
                      className="w-full pl-9 pr-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                    />
                  </div>
                </div>

                <div
                  role="tablist"
                  aria-label="Menu categories"
                  className="flex items-center gap-1 p-1 bg-zinc-200/70 rounded-lg overflow-x-auto"
                >
                  {CATEGORY_TABS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={selectedCategory === cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-white text-zinc-950 shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-950'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {sectionsToRender.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
                  <p className="font-display text-lg font-medium text-zinc-950">
                    No items match &ldquo;{searchQuery}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('All');
                    }}
                    className="mt-4 px-4 py-2 text-xs font-medium bg-zinc-950 text-white rounded-lg cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="space-y-8">
                  {sectionsToRender.map((section) => (
                    <MenuSection
                      key={section.category}
                      category={section.category}
                      sectionImage={section.image}
                      items={section.items}
                      cart={cart}
                      onQuickAdd={handleQuickAdd}
                      onUpdateCartQty={handleUpdateCartQty}
                      onCustomize={setActiveItem}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeView === 'tracker' && (
          <LiveTrackerView
            user={user}
            orders={myOrders}
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
            onCancelOrder={handleCancelOrder}
            onBrowseMenu={() => setActiveView('menu')}
            pushOptIn={profile?.pushOptIn ?? false}
            browserPushStatus={browserPushStatus}
            onEnablePush={handleEnablePush}
          />
        )}

        {activeView === 'profile' && (
          <ProfileView
            user={user}
            profile={profile}
            guestDetails={guestDetails}
            orders={myOrders}
            notifications={notifications}
            browserPushStatus={browserPushStatus}
            onSignOut={handleSignOut}
            onSaveProfile={handleSaveProfile}
            onSaveGuestDetails={handleSaveGuestDetails}
            onMarkNotificationRead={handleMarkNotificationRead}
            onEnableBrowserPush={handleEnablePush}
            onReorder={handleReorder}
            onTrackOrder={(orderId) => {
              setSelectedOrderId(orderId);
              setActiveView('tracker');
            }}
          />
        )}

        {activeView === 'kitchen' && (
          <KitchenConsoleView
            user={user}
            isAdmin={isAdmin}
            orders={orders}
            menuItems={menuItems}
            isMenuSeeded={cloudMenuItems.some((m) => m.category === 'Shakes')}
            browserPushStatus={browserPushStatus}
            soundAlertsEnabled={soundAlertsEnabled}
            onEnablePush={handleEnablePush}
            onToggleSoundAlerts={handleToggleSoundAlerts}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onMarkCodPaid={handleMarkCodPaid}
            onSeedMenu={handleSeedMenu}
            onToggleAvailability={handleToggleAvailability}
            onUpdatePrice={handleUpdatePrice}
            onAddMenuItem={handleAddMenuItem}
          />
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <p>
            © {new Date().getFullYear()} Suman Cold Coffee Depot · In front of Amity University Gate No. 4, Noida, Uttar Pradesh ·{' '}
            <a href="tel:+918505939149" className="hover:text-zinc-950 tabular-nums">
              8505939149
            </a>
            {' / '}
            <a href="tel:+919310923641" className="hover:text-zinc-950 tabular-nums">
              9310923641
            </a>
          </p>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveView('menu')}
              className="hover:text-zinc-950 cursor-pointer"
            >
              Menu
            </button>
            <button
              type="button"
              onClick={() => setActiveView('tracker')}
              className="hover:text-zinc-950 cursor-pointer"
            >
              Track Order
            </button>
            <button
              type="button"
              onClick={() => setActiveView('profile')}
              className="hover:text-zinc-950 cursor-pointer"
            >
              My Orders
            </button>
            <button
              type="button"
              onClick={() => setActiveView('kitchen')}
              className="hover:text-zinc-950 cursor-pointer"
            >
              Manager Console
            </button>
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="hover:text-zinc-950 cursor-pointer"
            >
              Order QR Code
            </button>
          </div>
        </div>
      </footer>

      {activeItem && (
        <ItemDetailModal
          item={activeItem}
          defaultMilk={profile?.defaultMilk || 'Whole Dairy'}
          defaultSweetness={profile?.defaultSweetness || 'Regular'}
          onClose={() => setActiveItem(null)}
          onAddToCart={addItemToCart}
        />
      )}

      <CartCheckoutDrawer
        open={cartOpen}
        items={cart}
        user={user}
        profile={profile}
        guestDetails={guestDetails}
        defaultDeliveryType={defaultDeliveryType}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onPlaceOrder={handlePlaceOrder}
      />

      <OrderQrModal open={qrModalOpen} onClose={() => setQrModalOpen(false)} />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm bg-zinc-950 text-white rounded-xl px-4 py-3.5 shadow-lg flex items-start gap-3"
        >
          <Bell className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">{toast.title}</p>
            <p className="text-xs text-zinc-300 mt-0.5">{toast.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <DepotApp />
    </ErrorBoundary>
  );
}
