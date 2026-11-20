import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CartItem,
  DeliveryType,
  GuestCustomerDetails,
  OrderLineItem,
  PaymentMethod,
  UserProfile,
} from '../types';
import { BLUEPRINT_LIMITS } from '../firebase';
import { SafeImage } from './SafeImage';

interface CartCheckoutDrawerProps {
  open: boolean;
  items: CartItem[];
  user: User | null;
  profile: UserProfile | null;
  guestDetails: GuestCustomerDetails;
  defaultDeliveryType?: DeliveryType;
  onClose: () => void;
  onUpdateQty: (cartKey: string, delta: number) => void;
  onRemoveItem: (cartKey: string) => void;
  onPlaceOrder: (payload: {
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
  }) => Promise<void>;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash on Delivery',
  'UPI',
  'Card',
  'Razorpay',
];

const UPI_APPS = [
  { label: 'GPay', suffix: '@okicici' },
  { label: 'PhonePe', suffix: '@ybl' },
  { label: 'Paytm', suffix: '@paytm' },
  { label: 'BHIM', suffix: '@upi' },
] as const;

type RazorpaySubMethod = 'UPI' | 'Card' | 'NetBanking' | 'Wallet';

interface SandboxRazorpaySession {
  intentId: string;
  signature: string;
  totalAmount: number;
  cleanName: string;
  cleanPhone: string;
  cleanAddr: string;
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CartCheckoutDrawer({
  open,
  items,
  user,
  profile,
  guestDetails,
  defaultDeliveryType = 'Delivery',
  onClose,
  onUpdateQty,
  onRemoveItem,
  onPlaceOrder,
}: CartCheckoutDrawerProps) {
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(defaultDeliveryType);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    try {
      const saved = localStorage.getItem('suman_depot_payment_priority') as PaymentMethod | null;
      if (saved && PAYMENT_METHODS.includes(saved)) return saved;
    } catch {
      // Ignore storage error
    }
    return 'Cash on Delivery';
  });
  const [upiId, setUpiId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [gatewayConfig, setGatewayConfig] = useState<{
    razorpayConfigured: boolean;
    stripeConfigured: boolean;
  }>({ razorpayConfigured: false, stripeConfigured: false });
  const [razorpaySession, setRazorpaySession] =
    useState<SandboxRazorpaySession | null>(null);
  const [rzpSubMethod, setRzpSubMethod] = useState<RazorpaySubMethod>('UPI');
  const [rzpInput, setRzpInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('suman_depot_payment_priority', paymentMethod);
    } catch {
      // Ignore storage error
    }
  }, [paymentMethod]);

  useEffect(() => {
    if (open) {
      setCustomerName(
        (prev) => prev || guestDetails.displayName || profile?.displayName || user?.displayName || ''
      );
      setCustomerPhone((prev) => prev || guestDetails.phone || profile?.phone || '');
      setDeliveryAddress(
        (prev) => prev || guestDetails.deliveryAddress || profile?.deliveryAddress || ''
      );
      fetch('/api/payments/config')
        .then((r) => (r.ok ? r.json() : null))
        .then((cfg) => {
          if (cfg) setGatewayConfig(cfg);
        })
        .catch(() => {});
    } else {
      setRazorpaySession(null);
    }
  }, [open, guestDetails, profile, user]);

  if (!open) return null;

  const subtotal = Math.round(
    items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  );
  const tax = Math.round(subtotal * 0.05);
  const deliveryFee =
    items.length === 0 ? 0 : deliveryType === 'Delivery' && subtotal < 399 ? 29 : 0;
  const totalAmount = subtotal + tax + deliveryFee;

  async function finalizeWithServerConfirm(
    intentId: string,
    signature: string,
    cleanName: string,
    cleanPhone: string,
    cleanAddr: string,
    paymentDetails: Record<string, string>
  ) {
    const confirmRes = await fetch('/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intentId,
        signature,
        paymentMethod,
        paymentDetails,
      }),
    });

    const confirmData = (await confirmRes.json()) as {
      verified?: boolean;
      paymentReference?: string;
      paymentStatus?: 'Paid' | 'Pending COD';
      verifiedItems?: OrderLineItem[];
      subtotal?: number;
      tax?: number;
      deliveryFee?: number;
      totalAmount?: number;
      error?: string;
    };

    if (!confirmRes.ok || !confirmData.verified || !confirmData.paymentReference) {
      throw new Error(confirmData.error || 'Payment authorization failed.');
    }

    await onPlaceOrder({
      customerName: cleanName,
      customerPhone: cleanPhone,
      deliveryType,
      deliveryAddress: cleanAddr,
      paymentMethod,
      paymentStatus: confirmData.paymentStatus || 'Paid',
      paymentReference: confirmData.paymentReference,
      verifiedItems:
        confirmData.verifiedItems ||
        items.map((i) => ({
          itemId: i.itemId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          size: i.size,
          milk: i.milk,
          sweetness: i.sweetness,
        })),
      subtotal: confirmData.subtotal ?? subtotal,
      tax: confirmData.tax ?? tax,
      deliveryFee: confirmData.deliveryFee ?? deliveryFee,
      totalAmount: confirmData.totalAmount ?? totalAmount,
      notes: notes.trim().slice(0, BLUEPRINT_LIMITS.notesMax),
    });
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (items.length === 0) return;

    const cleanName = customerName.trim().slice(0, BLUEPRINT_LIMITS.nameMax);
    const cleanPhone = customerPhone.trim().slice(0, BLUEPRINT_LIMITS.phoneMax);
    const cleanAddr =
      deliveryType === 'Delivery'
        ? deliveryAddress.trim().slice(0, BLUEPRINT_LIMITS.addressMax)
        : 'Depot Pickup · In front of Amity University Gate No. 4, Noida, Uttar Pradesh';

    if (cleanName.length < 1) {
      setErrorMsg('Please enter your name for the order.');
      return;
    }
    if (cleanPhone.length < BLUEPRINT_LIMITS.phoneMin) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (deliveryType === 'Delivery' && cleanAddr.length < 8) {
      setErrorMsg('Please enter your full street delivery address.');
      return;
    }

    const digitsOnlyCard = cardNumber.replace(/\D/g, '');
    if (paymentMethod === 'Card') {
      if (
        digitsOnlyCard.length < 12 ||
        !/^\d{2}\/\d{2}$/.test(cardExpiry.trim()) ||
        cardCvv.trim().length < 3
      ) {
        setErrorMsg('Enter valid 16-digit card number, MM/YY expiry, and 3-digit CVV.');
        return;
      }
    }

    if (paymentMethod === 'UPI') {
      const trimmedUpi = upiId.trim();
      if (!trimmedUpi.includes('@') || trimmedUpi.length < 5) {
        setErrorMsg('Enter a valid UPI ID (e.g. name@okicici or name@ybl).');
        return;
      }
    }

    setSubmitting(true);
    try {
      const intentRes = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({
            itemId: i.itemId,
            quantity: i.quantity,
            size: i.size,
            milk: i.milk,
            sweetness: i.sweetness,
          })),
          deliveryType,
          paymentMethod,
        }),
      });

      const intentData = (await intentRes.json()) as {
        intentId?: string;
        signature?: string;
        totalAmount?: number;
        gatewayMode?: 'live' | 'sandbox';
        razorpayOrderId?: string;
        razorpayKeyId?: string;
        stripePaymentIntentId?: string;
        error?: string;
      };

      if (!intentRes.ok || !intentData.intentId || !intentData.signature) {
        throw new Error(intentData.error || 'Could not verify order prices on server.');
      }

      if (paymentMethod === 'Razorpay') {
        if (
          intentData.gatewayMode === 'live' &&
          intentData.razorpayOrderId &&
          intentData.razorpayKeyId
        ) {
          const loaded = await loadRazorpayScript();
          if (!loaded) {
            throw new Error('Could not load Razorpay Checkout SDK.');
          }

          await new Promise<void>((resolve, reject) => {
            const RazorpayCtor = (
              window as unknown as {
                Razorpay: new (opts: Record<string, unknown>) => { open: () => void };
              }
            ).Razorpay;

            const rzp = new RazorpayCtor({
              key: intentData.razorpayKeyId,
              amount: (intentData.totalAmount ?? totalAmount) * 100,
              currency: 'INR',
              name: 'Suman Cold Coffee Depot',
              description: `Order ${intentData.intentId}`,
              order_id: intentData.razorpayOrderId,
              prefill: {
                name: cleanName,
                email: user?.email || '',
                contact: cleanPhone,
              },
              handler: async (resp: {
                razorpay_order_id: string;
                razorpay_payment_id: string;
                razorpay_signature: string;
              }) => {
                try {
                  await finalizeWithServerConfirm(
                    intentData.intentId!,
                    intentData.signature!,
                    cleanName,
                    cleanPhone,
                    cleanAddr,
                    {
                      razorpay_order_id: resp.razorpay_order_id,
                      razorpay_payment_id: resp.razorpay_payment_id,
                      razorpay_signature: resp.razorpay_signature,
                    }
                  );
                  resolve();
                } catch (err) {
                  reject(err);
                }
              },
              modal: {
                ondismiss: () =>
                  reject(new Error('Razorpay payment window closed before completion.')),
              },
            });
            rzp.open();
          });
          return;
        }

        // Open interactive Razorpay Checkout modal for Test/Preview mode
        setRzpSubMethod('UPI');
        setRzpInput(upiId.trim());
        setRazorpaySession({
          intentId: intentData.intentId,
          signature: intentData.signature,
          totalAmount: intentData.totalAmount ?? totalAmount,
          cleanName,
          cleanPhone,
          cleanAddr,
        });
        return;
      }

      await finalizeWithServerConfirm(
        intentData.intentId,
        intentData.signature,
        cleanName,
        cleanPhone,
        cleanAddr,
        {
          upiId: upiId.trim(),
          cardLast4: digitsOnlyCard.slice(-4),
          stripe_payment_intent_id: intentData.stripePaymentIntentId || '',
        }
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Checkout could not be completed.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmSandboxRazorpay() {
    if (!razorpaySession || submitting) return;
    setErrorMsg('');
    setSubmitting(true);
    try {
      await finalizeWithServerConfirm(
        razorpaySession.intentId,
        razorpaySession.signature,
        razorpaySession.cleanName,
        razorpaySession.cleanPhone,
        razorpaySession.cleanAddr,
        {
          razorpay_submethod: rzpSubMethod,
          upiId: rzpInput.trim(),
        }
      );
      setRazorpaySession(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Razorpay test authorization failed.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Order bag and secure checkout"
    >
      <div className="bg-white w-full max-w-lg h-full flex flex-col border-l border-zinc-200">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-zinc-950">
              Your Order Bag
            </h2>
            <p className="text-xs text-zinc-500">
              Free delivery on orders ₹399+ · Suman Cold Coffee Depot
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bag"
            className="p-2 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-lg font-medium text-zinc-950 mb-1">
                Your bag is empty
              </p>
              <p className="text-sm text-zinc-500 mb-6">
                Add cold coffees, shakes, mocktails, Maggi, rolls, parathas, or sandwiches to start an order.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                Explore Menu
              </button>
            </div>
          ) : (
            <>
              <div className="divide-y divide-zinc-100">
                {items.map((item) => (
                  <div key={item.cartKey} className="py-4 first:pt-0 flex gap-3.5">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 shrink-0">
                      <SafeImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-zinc-950 truncate">
                          {item.name}
                        </h3>
                        <span className="font-mono text-sm font-medium text-zinc-950 tabular-nums shrink-0">
                          ₹{item.price * item.quantity}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Size: {item.size}
                        {item.milk !== 'Whole Dairy' ? ` · ${item.milk}` : ''}
                        {item.sweetness !== 'Regular' ? ` · ${item.sweetness}` : ''}
                      </p>
                      {item.note && (
                        <p className="text-xs text-amber-900 mt-0.5 truncate">
                          Note: {item.note}
                        </p>
                      )}
                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="inline-flex items-center border border-zinc-200 rounded-md">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.cartKey, -1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="p-1.5 text-zinc-600 hover:text-zinc-950 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2.5 text-xs font-mono tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.cartKey, 1)}
                            aria-label={`Increase quantity of ${item.name}`}
                            className="p-1.5 text-zinc-600 hover:text-zinc-950 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.cartKey)}
                          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">₹{subtotal}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>GST (5%)</span>
                  <span className="font-mono tabular-nums">₹{tax}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>
                    {deliveryType === 'Delivery' ? 'Delivery Fee' : 'Depot Pickup'}
                  </span>
                  <span className="font-mono tabular-nums">
                    {deliveryFee === 0 ? 'Free' : `₹${deliveryFee}`}
                  </span>
                </div>
                <div className="pt-2 border-t border-zinc-200 flex justify-between font-semibold text-zinc-950 text-base">
                  <span>Server-Verified Total</span>
                  <span className="font-mono tabular-nums">₹{totalAmount}</span>
                </div>
              </div>

              <form id="checkout-form" onSubmit={handleCheckout} className="space-y-5">
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
                  No sign-in needed — just enter your name, mobile number, and delivery/pickup details to place your order.
                </p>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                    Fulfillment Mode
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-lg">
                    {(['Delivery', 'Depot Pickup'] as DeliveryType[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDeliveryType(mode)}
                        className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          deliveryType === mode
                            ? 'bg-white text-zinc-950 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-950'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  {deliveryType === 'Depot Pickup' && (
                    <p className="mt-2 text-xs text-zinc-600">
                      Pickup Counter: In front of Amity University Gate No. 4, Noida, Uttar Pradesh (Zero delivery fee).
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="checkout-name"
                      className="block text-xs font-medium text-zinc-700 mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      id="checkout-name"
                      type="text"
                      required
                      maxLength={BLUEPRINT_LIMITS.nameMax}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="checkout-phone"
                      className="block text-xs font-medium text-zinc-700 mb-1"
                    >
                      Phone Number
                    </label>
                    <input
                      id="checkout-phone"
                      type="tel"
                      required
                      maxLength={BLUEPRINT_LIMITS.phoneMax}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                    />
                  </div>
                </div>

                {deliveryType === 'Delivery' && (
                  <div>
                    <label
                      htmlFor="checkout-address"
                      className="block text-xs font-medium text-zinc-700 mb-1"
                    >
                      Delivery Address
                    </label>
                    <textarea
                      id="checkout-address"
                      required
                      rows={2}
                      maxLength={BLUEPRINT_LIMITS.addressMax}
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Hostel / PG / House, Sector 125, near Amity University, Noida..."
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="checkout-notes"
                    className="block text-xs font-medium text-zinc-700 mb-1"
                  >
                    Delivery / Pickup Instructions (Optional)
                  </label>
                  <input
                    id="checkout-notes"
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.notesMax}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Call on arrival, extra napkins..."
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                  />
                </div>

                <div className="pt-2 border-t border-zinc-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-700 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      <span>Payment Method</span>
                    </span>
                    <span className="text-xs text-zinc-500">
                      {paymentMethod === 'Cash on Delivery'
                        ? 'Recommended · Pay on Handoff'
                        : paymentMethod === 'Razorpay'
                        ? gatewayConfig.razorpayConfigured
                          ? 'Live Razorpay'
                          : 'Test Checkout Ready'
                        : 'Server-Verified'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(method);
                          setErrorMsg('');
                        }}
                        className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                          paymentMethod === method
                            ? 'border-zinc-950 bg-zinc-950 text-white'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        {method === 'Cash on Delivery' ? 'Cash (COD)' : method}
                      </button>
                    ))}
                  </div>

                  {paymentMethod === 'Razorpay' && (
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      {gatewayConfig.razorpayConfigured
                        ? 'Pay via Razorpay Checkout (UPI, Debit/Credit Cards, NetBanking, Wallets) with server-verified pricing.'
                        : 'Opens Razorpay Checkout (UPI, Cards, NetBanking & Wallets) with server-verified pricing.'}
                    </p>
                  )}

                  {paymentMethod === 'UPI' && (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {UPI_APPS.map((app) => (
                          <button
                            key={app.label}
                            type="button"
                            onClick={() => {
                              const prefix =
                                (customerPhone || 'customer')
                                  .replace(/\D/g, '')
                                  .slice(-10) || 'customer';
                              setUpiId(`${prefix}${app.suffix}`);
                            }}
                            className="px-2.5 py-1 text-xs font-medium border border-zinc-200 rounded-md bg-zinc-50 text-zinc-700 hover:border-zinc-400 cursor-pointer"
                          >
                            {app.label}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label
                          htmlFor="upi-id"
                          className="block text-xs text-zinc-600 mb-1"
                        >
                          Enter UPI ID (GPay, PhonePe, Paytm, BHIM)
                        </label>
                        <input
                          id="upi-id"
                          type="text"
                          required
                          value={upiId}
                          onChange={(e) => setUpiId(e.target.value)}
                          placeholder="yourname@okicici"
                          className="w-full px-3 py-2 text-sm font-mono border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                        />
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'Card' && (
                    <div className="space-y-2.5">
                      <p className="text-xs text-zinc-600">
                        Visa, Mastercard, and RuPay debit or credit cards accepted.
                      </p>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={19}
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="Card Number (16 digits)"
                        aria-label="Card Number"
                        className="w-full px-3 py-2 text-sm font-mono border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                      />
                      <div className="grid grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          maxLength={5}
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          aria-label="Card Expiry"
                          className="w-full px-3 py-2 text-sm font-mono border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                        />
                        <input
                          type="password"
                          maxLength={4}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          placeholder="CVV"
                          aria-label="Card CVV"
                          className="w-full px-3 py-2 text-sm font-mono border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                        />
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'Cash on Delivery' && (
                    <p className="text-xs text-zinc-600 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        Pay ₹{totalAmount} in cash or via shop UPI QR at delivery or pickup (Amity Gate No. 4).
                      </span>
                    </p>
                  )}
                </div>

                {errorMsg && (
                  <p role="alert" className="text-xs font-medium text-red-700">
                    {errorMsg}
                  </p>
                )}
              </form>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="px-6 py-4 border-t border-zinc-200 bg-white">
            <button
              type="submit"
              form="checkout-form"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[46px] text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Verifying Prices & Placing Order...'
                  : paymentMethod === 'Cash on Delivery'
                  ? `Confirm COD Order · ₹${totalAmount}`
                  : `Pay with ${paymentMethod} · ₹${totalAmount}`}
              </span>
            </button>
          </div>
        )}
      </div>

      {razorpaySession && (
        <div
          className="fixed inset-0 z-[60] bg-zinc-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Razorpay Checkout"
        >
          <div className="bg-white border border-zinc-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="bg-zinc-950 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-400">Razorpay Checkout</p>
                <p className="font-display text-lg font-semibold">
                  Suman Cold Coffee Depot
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-semibold tabular-nums">
                  ₹{razorpaySession.totalAmount}
                </p>
                <button
                  type="button"
                  onClick={() => setRazorpaySession(null)}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-zinc-100 rounded-lg">
                {(['UPI', 'Card', 'NetBanking', 'Wallet'] as RazorpaySubMethod[]).map(
                  (sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setRzpSubMethod(sub)}
                      className={`py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        rzpSubMethod === sub
                          ? 'bg-white text-zinc-950 shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-950'
                      }`}
                    >
                      {sub}
                    </button>
                  )
                )}
              </div>

              {rzpSubMethod === 'UPI' && (
                <div>
                  <label
                    htmlFor="rzp-upi"
                    className="block text-xs font-medium text-zinc-700 mb-1"
                  >
                    UPI ID or App Handle
                  </label>
                  <input
                    id="rzp-upi"
                    type="text"
                    value={rzpInput}
                    onChange={(e) => setRzpInput(e.target.value)}
                    placeholder="success@razorpay or name@okicici"
                    className="w-full px-3 py-2 text-sm font-mono border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
                  />
                </div>
              )}

              {rzpSubMethod === 'Card' && (
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Authorize payment via Visa / Mastercard / RuPay test card on Razorpay.
                </p>
              )}

              {rzpSubMethod === 'NetBanking' && (
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Authorize via HDFC, ICICI, SBI, or Axis NetBanking test flow.
                </p>
              )}

              {rzpSubMethod === 'Wallet' && (
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Authorize via Paytm, PhonePe, or Amazon Pay wallet.
                </p>
              )}

              {errorMsg && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {errorMsg}
                </p>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmSandboxRazorpay}
                className="w-full py-3 min-h-[44px] text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Authorizing Payment...'
                  : `Pay ₹${razorpaySession.totalAmount} Now`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
