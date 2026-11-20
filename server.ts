import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const PAYMENT_SECRET =
  process.env.PAYMENT_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const DEPOT_MANAGER_EMAIL = (
  process.env.DEPOT_MANAGER_EMAIL || 'pushpendra.rawat2025@gmail.com'
).trim();
const GMAIL_USER = (process.env.GMAIL_USER || '').trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = (process.env.SMTP_USER || '').trim();
const SMTP_PASS = process.env.SMTP_PASS || '';

interface CatalogEntry {
  id: string;
  name: string;
  category: string;
  price: number;
  sizePrices?: { S: number; M: number; L: number; XL: number };
  available: boolean;
}

interface RequestedLineItem {
  itemId: string;
  quantity: number;
  size?: string;
  milk?: string;
  sweetness?: string;
}

interface VerifiedLineItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  size: string;
  milk: string;
  sweetness: string;
}

interface PaymentIntentRecord {
  intentId: string;
  verifiedItems: VerifiedLineItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  totalAmount: number;
  currency: string;
  deliveryType: 'Delivery' | 'Depot Pickup';
  paymentMethod: 'Razorpay' | 'Stripe' | 'UPI' | 'Card' | 'Wallet' | 'Cash on Delivery';
  gatewayMode: 'live' | 'sandbox';
  razorpayOrderId?: string;
  stripePaymentIntentId?: string;
  signature: string;
  expiresAt: number;
}

const pendingIntents = new Map<string, PaymentIntentRecord>();

function loadStaticCatalog(): Map<string, CatalogEntry> {
  const catalogPath = path.resolve(__dirname, 'shared', 'menuCatalog.json');
  const raw = fs.readFileSync(catalogPath, 'utf8');
  const items = JSON.parse(raw) as CatalogEntry[];
  const map = new Map<string, CatalogEntry>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

function loadFirebaseConfig(): { projectId?: string; firestoreDatabaseId?: string } {
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
      };
    }
  } catch {
    // Ignore missing config
  }
  return {};
}

interface FirestoreFieldValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  mapValue?: { fields?: Record<string, FirestoreFieldValue> };
}

function readNum(v?: FirestoreFieldValue): number | undefined {
  if (!v) return undefined;
  if (typeof v.doubleValue === 'number') return v.doubleValue;
  if (typeof v.integerValue === 'string') return Number(v.integerValue);
  return undefined;
}

async function fetchAuthoritativeCatalog(): Promise<Map<string, CatalogEntry>> {
  const catalog = loadStaticCatalog();
  const cfg = loadFirebaseConfig();
  if (!cfg.projectId || !cfg.firestoreDatabaseId) {
    return catalog;
  }

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents/menuItems?pageSize=200`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!resp.ok) return catalog;
    const json = (await resp.json()) as {
      documents?: Array<{ fields?: Record<string, FirestoreFieldValue> }>;
    };
    if (!Array.isArray(json.documents)) return catalog;

    for (const docItem of json.documents) {
      const f = docItem.fields;
      if (!f || !f.id?.stringValue || !f.name?.stringValue) continue;
      const spFields = f.sizePrices?.mapValue?.fields;
      const sizePrices = spFields
        ? {
            S: readNum(spFields.S) ?? 50,
            M: readNum(spFields.M) ?? 80,
            L: readNum(spFields.L) ?? 120,
            XL: readNum(spFields.XL) ?? 150,
          }
        : undefined;

      catalog.set(f.id.stringValue, {
        id: f.id.stringValue,
        name: f.name.stringValue,
        category: f.category?.stringValue || 'Shakes',
        price: readNum(f.price) ?? 50,
        sizePrices,
        available: f.available?.booleanValue ?? true,
      });
    }
  } catch {
    // Fall back gracefully to static catalog if Firestore REST lookup times out
  }

  return catalog;
}

const DRINK_CATEGORIES = new Set([
  'Shakes',
  'Hot Beverages',
  'Mocktails & Mojitos',
]);

const MILK_ADDON: Record<string, number> = {
  'Whole Dairy': 0,
  'Oat Milk': 35,
  'Almond Milk': 35,
  'Soy Milk': 25,
};

function resolveUnitPrice(entry: CatalogEntry, size?: string, milk?: string): number {
  let base = entry.price;
  if (entry.sizePrices && size && (size === 'S' || size === 'M' || size === 'L' || size === 'XL')) {
    base = entry.sizePrices[size];
  }
  const milkExtra = DRINK_CATEGORIES.has(entry.category) && milk ? MILK_ADDON[milk] || 0 : 0;
  return base + milkExtra;
}

function signIntent(intentId: string, totalAmount: number, expiresAt: number): string {
  return crypto
    .createHmac('sha256', PAYMENT_SECRET)
    .update(`${intentId}:${totalAmount}:${expiresAt}`)
    .digest('hex')
    .slice(0, 24);
}

interface ManagerOrderAlertPayload {
  orderId?: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  deliveryType: string;
  deliveryAddress: string;
  paymentMethod: string;
  paymentStatus: string;
  paymentReference: string;
  totalAmount: number;
  estimatedMinutes: number;
  notes?: string;
  items: Array<{
    name: string;
    quantity: number;
    size?: string;
    price: number;
  }>;
}

const notifiedOrderKeys = new Set<string>();

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMailProvider(): 'resend' | 'gmail' | 'smtp' | 'none' {
  if (RESEND_API_KEY) return 'resend';
  if (GMAIL_USER && GMAIL_APP_PASSWORD) return 'gmail';
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) return 'smtp';
  return 'none';
}

async function verifyFirebaseUserToken(
  idToken: string
): Promise<{ uid: string; email: string } | null> {
  try {
    const cfg = loadFirebaseConfig() as { apiKey?: string };
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    let apiKey = cfg.apiKey;
    if (!apiKey && fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { apiKey?: string };
      apiKey = parsed.apiKey;
    }
    if (!apiKey) return null;

    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const account = data.users?.[0];
    if (!account?.localId || !account?.email || !account.emailVerified) return null;
    return { uid: account.localId, email: account.email };
  } catch {
    return null;
  }
}

async function fetchPlacedOrderFromFirestore(
  orderId: string,
  idToken: string
): Promise<{ status?: string; orderNumber?: string } | null> {
  const cfg = loadFirebaseConfig();
  if (!cfg.projectId || !cfg.firestoreDatabaseId || !orderId) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(orderId)) return null;

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents/orders/${orderId}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    const docData = (await resp.json()) as {
      fields?: Record<string, FirestoreFieldValue>;
    };
    return {
      status: docData.fields?.status?.stringValue,
      orderNumber: docData.fields?.orderNumber?.stringValue,
    };
  } catch {
    return null;
  }
}

async function sendDepotManagerEmail(
  order: ManagerOrderAlertPayload,
  appOrigin: string,
  isTest = false
): Promise<{ sent: boolean; configured: boolean; provider: string; error?: string }> {
  const provider = getMailProvider();
  if (provider === 'none') {
    return {
      sent: false,
      configured: false,
      provider,
      error: 'Email transport not configured yet.',
    };
  }

  const kitchenUrl = `${appOrigin.replace(/\/+$/, '')}/?view=kitchen`;
  const timeIst = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const subjectPrefix = isTest ? '[TEST ALERT] ' : '';
  const subject = `${subjectPrefix}New Order ${order.orderNumber} · ₹${order.totalAmount} · ${order.deliveryType} (${order.paymentMethod})`;

  const textLines = [
    `Suman Cold Coffee Depot — ${isTest ? 'Test ' : ''}New Order Alert`,
    `Order: ${order.orderNumber} (${timeIst})`,
    `Fulfillment: ${order.deliveryType} (Est. ${order.estimatedMinutes} mins)`,
    `Payment: ${order.paymentMethod} — ${order.paymentStatus} (${order.paymentReference})`,
    `Customer: ${order.customerName} (${order.customerPhone})`,
    `Address: ${order.deliveryAddress}`,
    order.notes ? `Note: ${order.notes}` : '',
    '',
    'Items:',
    ...order.items.map(
      (i) => `- ${i.quantity}x ${i.name} (${i.size || 'Regular'}) — Rs.${i.price * i.quantity}`
    ),
    '',
    `Total: Rs.${order.totalAmount}`,
    `Manage & Complete Order: ${kitchenUrl}`,
  ].filter(Boolean);

  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:14px;color:#09090b;">
          <strong>${item.quantity}&times;</strong> ${escapeHtml(item.name)}
          <span style="color:#71717a;font-size:12px;">(${escapeHtml(item.size || 'Regular')})</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:14px;text-align:right;font-family:monospace;color:#09090b;">
          &#8377;${item.price * item.quantity}
        </td>
      </tr>`
    )
    .join('');

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fafafa;color:#09090b;">
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#92400e;">Suman Cold Coffee Depot · Amity Gate No. 4, Noida</p>
      <h1 style="margin:0 0 16px;font-size:22px;color:#09090b;">
        ${isTest ? 'Test Alert: ' : ''}Order ${escapeHtml(order.orderNumber)} · &#8377;${order.totalAmount}
      </h1>
      <p style="margin:0 0 16px;font-size:13px;color:#52525b;">
        Placed at ${escapeHtml(timeIst)} · <strong>${escapeHtml(order.deliveryType)}</strong> ·
        <strong>${escapeHtml(order.paymentMethod)}</strong> (${escapeHtml(order.paymentStatus)})
      </p>
      <div style="background:#f4f4f5;border-radius:8px;padding:12px 14px;margin-bottom:18px;font-size:13px;line-height:1.5;">
        <div><strong>Customer:</strong> ${escapeHtml(order.customerName)} · <a href="tel:${escapeHtml(order.customerPhone)}" style="color:#09090b;">${escapeHtml(order.customerPhone)}</a></div>
        <div><strong>Address:</strong> ${escapeHtml(order.deliveryAddress)}</div>
        ${order.notes ? `<div style="color:#92400e;margin-top:4px;"><strong>Note:</strong> ${escapeHtml(order.notes)}</div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${itemsHtml}
        <tr>
          <td style="padding-top:12px;font-size:15px;font-weight:700;">Total</td>
          <td style="padding-top:12px;font-size:15px;font-weight:700;text-align:right;font-family:monospace;">&#8377;${order.totalAmount}</td>
        </tr>
      </table>
      <a href="${escapeHtml(kitchenUrl)}" style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:11px 18px;border-radius:8px;">
        Open Kitchen Console to Complete Order
      </a>
    </div>
  </div>`;

  try {
    if (provider === 'resend') {
      const fromEmail =
        process.env.RESEND_FROM_EMAIL || 'Suman Cold Coffee Depot <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [DEPOT_MANAGER_EMAIL],
          subject,
          text: textLines.join('\n'),
          html,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const errText = await res.text();
        return { sent: false, configured: true, provider, error: errText };
      }
      return { sent: true, configured: true, provider };
    }

    const transporter =
      provider === 'gmail'
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
          })
        : nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASS },
          });

    const smtpFrom =
      process.env.SMTP_FROM ||
      (provider === 'gmail' ? `"Suman Cold Coffee Depot" <${GMAIL_USER}>` : SMTP_USER);

    await transporter.sendMail({
      from: smtpFrom,
      to: DEPOT_MANAGER_EMAIL,
      subject,
      text: textLines.join('\n'),
      html,
    });

    return { sent: true, configured: true, provider };
  } catch (err) {
    return {
      sent: false,
      configured: true,
      provider,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'suman-cold-coffee-depot' });
  });

  app.get('/api/payments/config', (_req, res) => {
    res.json({
      razorpayConfigured: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),
      stripeConfigured: Boolean(STRIPE_SECRET_KEY),
    });
  });

  app.post('/api/payments/create-intent', async (req, res) => {
    const body = req.body as {
      items?: RequestedLineItem[];
      deliveryType?: 'Delivery' | 'Depot Pickup';
      paymentMethod?: PaymentIntentRecord['paymentMethod'];
    };

    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) {
      res.status(400).json({ error: 'Order must include between 1 and 20 line items.' });
      return;
    }

    const catalog = await fetchAuthoritativeCatalog();
    const verifiedItems: VerifiedLineItem[] = [];

    for (const reqItem of body.items) {
      if (
        !reqItem ||
        typeof reqItem.itemId !== 'string' ||
        typeof reqItem.quantity !== 'number' ||
        reqItem.quantity < 1 ||
        reqItem.quantity > 25
      ) {
        res.status(400).json({ error: 'Invalid item identifier or quantity.' });
        return;
      }

      const catalogEntry = catalog.get(reqItem.itemId);
      if (!catalogEntry) {
        res.status(400).json({ error: `Unknown menu item: ${reqItem.itemId}` });
        return;
      }
      if (!catalogEntry.available) {
        res.status(409).json({ error: `${catalogEntry.name} is currently sold out.` });
        return;
      }

      const size = reqItem.size || (catalogEntry.sizePrices ? 'M' : 'Regular');
      const milk = reqItem.milk || 'Whole Dairy';
      const sweetness = reqItem.sweetness || 'Regular';
      const authoritativePrice = resolveUnitPrice(catalogEntry, size, milk);

      verifiedItems.push({
        itemId: catalogEntry.id,
        name: catalogEntry.name,
        price: authoritativePrice,
        quantity: Math.floor(reqItem.quantity),
        size,
        milk,
        sweetness,
      });
    }

    const deliveryType = body.deliveryType === 'Depot Pickup' ? 'Depot Pickup' : 'Delivery';
    const allowedMethods = new Set([
      'Razorpay',
      'Stripe',
      'UPI',
      'Card',
      'Wallet',
      'Cash on Delivery',
    ]);
    const paymentMethod = allowedMethods.has(body.paymentMethod || '')
      ? (body.paymentMethod as PaymentIntentRecord['paymentMethod'])
      : 'Razorpay';

    const subtotal = Math.round(
      verifiedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    );
    const tax = Math.round(subtotal * 0.05);
    const deliveryFee = deliveryType === 'Delivery' && subtotal < 399 ? 29 : 0;
    const totalAmount = subtotal + tax + deliveryFee;

    const intentId = `INT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const signature = signIntent(intentId, totalAmount, expiresAt);

    let gatewayMode: 'live' | 'sandbox' = 'sandbox';
    let razorpayOrderId: string | undefined;
    let stripePaymentIntentId: string | undefined;
    let stripeClientSecret: string | undefined;

    if (paymentMethod === 'Razorpay' && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
      const authHeader = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: totalAmount * 100,
          currency: 'INR',
          receipt: intentId,
        }),
      });
      if (!rzpRes.ok) {
        const errText = await rzpRes.text();
        res.status(502).json({ error: `Razorpay order creation failed: ${errText}` });
        return;
      }
      const rzpData = (await rzpRes.json()) as { id: string };
      razorpayOrderId = rzpData.id;
      gatewayMode = 'live';
    } else if (paymentMethod === 'Stripe' && STRIPE_SECRET_KEY) {
      const form = new URLSearchParams({
        amount: String(totalAmount * 100),
        currency: 'inr',
        'automatic_payment_methods[enabled]': 'true',
        'metadata[intentId]': intentId,
      });
      const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      if (!stripeRes.ok) {
        const errText = await stripeRes.text();
        res.status(502).json({ error: `Stripe PaymentIntent failed: ${errText}` });
        return;
      }
      const stripeData = (await stripeRes.json()) as { id: string; client_secret: string };
      stripePaymentIntentId = stripeData.id;
      stripeClientSecret = stripeData.client_secret;
      gatewayMode = 'live';
    }

    const record: PaymentIntentRecord = {
      intentId,
      verifiedItems,
      subtotal,
      tax,
      deliveryFee,
      totalAmount,
      currency: 'INR',
      deliveryType,
      paymentMethod,
      gatewayMode,
      razorpayOrderId,
      stripePaymentIntentId,
      signature,
      expiresAt,
    };

    pendingIntents.set(intentId, record);

    res.json({
      intentId,
      verifiedItems,
      subtotal,
      tax,
      deliveryFee,
      totalAmount,
      currency: 'INR',
      deliveryType,
      paymentMethod,
      gatewayMode,
      razorpayOrderId,
      razorpayKeyId: gatewayMode === 'live' && paymentMethod === 'Razorpay' ? RAZORPAY_KEY_ID : undefined,
      stripePaymentIntentId,
      stripeClientSecret,
      signature,
      expiresAt,
    });
  });

  app.post('/api/payments/confirm', async (req, res) => {
    const body = req.body as {
      intentId?: string;
      signature?: string;
      paymentMethod?: PaymentIntentRecord['paymentMethod'];
      paymentDetails?: {
        upiId?: string;
        cardLast4?: string;
        walletProvider?: string;
        razorpay_order_id?: string;
        razorpay_payment_id?: string;
        razorpay_signature?: string;
        stripe_payment_intent_id?: string;
      };
    };

    if (!body.intentId || !body.signature) {
      res.status(400).json({ error: 'Missing payment intent credentials.' });
      return;
    }

    const record = pendingIntents.get(body.intentId);
    if (!record) {
      res.status(404).json({ error: 'Payment session not found or already completed.' });
      return;
    }

    if (Date.now() > record.expiresAt) {
      pendingIntents.delete(body.intentId);
      res.status(410).json({ error: 'Payment session expired. Please initiate checkout again.' });
      return;
    }

    const expectedSig = signIntent(record.intentId, record.totalAmount, record.expiresAt);
    if (body.signature !== expectedSig) {
      res.status(403).json({ error: 'Payment signature verification failed.' });
      return;
    }

    const method = body.paymentMethod || record.paymentMethod;
    let paymentReference = '';

    if (record.gatewayMode === 'live' && method === 'Razorpay') {
      const rzpOrderId = body.paymentDetails?.razorpay_order_id || '';
      const rzpPaymentId = body.paymentDetails?.razorpay_payment_id || '';
      const rzpSig = body.paymentDetails?.razorpay_signature || '';
      if (!rzpOrderId || !rzpPaymentId || !rzpSig || rzpOrderId !== record.razorpayOrderId) {
        res.status(400).json({ error: 'Invalid Razorpay payment response.' });
        return;
      }
      const computed = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${rzpOrderId}|${rzpPaymentId}`)
        .digest('hex');
      if (computed !== rzpSig) {
        res.status(403).json({ error: 'Razorpay signature verification failed.' });
        return;
      }
      paymentReference = rzpPaymentId;
    } else if (record.gatewayMode === 'live' && method === 'Stripe') {
      const piId = body.paymentDetails?.stripe_payment_intent_id || record.stripePaymentIntentId;
      if (!piId) {
        res.status(400).json({ error: 'Missing Stripe PaymentIntent ID.' });
        return;
      }
      const verifyRes = await fetch(`https://api.stripe.com/v1/payment_intents/${piId}`, {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      });
      if (!verifyRes.ok) {
        res.status(502).json({ error: 'Could not verify Stripe PaymentIntent.' });
        return;
      }
      const piData = (await verifyRes.json()) as { status: string; amount_received: number };
      if (piData.status !== 'succeeded' || piData.amount_received < record.totalAmount * 100) {
        res.status(402).json({ error: 'Stripe payment has not succeeded yet.' });
        return;
      }
      paymentReference = piId;
    } else {
      if (method === 'UPI') {
        const upi = (body.paymentDetails?.upiId || '').trim();
        if (!upi.includes('@') || upi.length < 5) {
          res.status(400).json({ error: 'Enter a valid UPI ID (for example, name@okicici).' });
          return;
        }
      }

      if (method === 'Card' || (method === 'Stripe' && record.gatewayMode === 'sandbox')) {
        const last4 = (body.paymentDetails?.cardLast4 || '').trim();
        if (!/^\d{4}$/.test(last4)) {
          res.status(400).json({ error: 'Enter valid 16-digit card details to authorize payment.' });
          return;
        }
      }

      const prefix =
        method === 'Cash on Delivery'
          ? 'COD'
          : method === 'Razorpay'
          ? 'RZP'
          : method === 'Stripe'
          ? 'STR'
          : 'PAY';
      paymentReference = `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    }

    pendingIntents.delete(body.intentId);

    const paymentStatus = method === 'Cash on Delivery' ? 'Pending COD' : 'Paid';

    res.json({
      verified: true,
      gatewayMode: record.gatewayMode,
      paymentReference,
      paymentStatus,
      verifiedItems: record.verifiedItems,
      subtotal: record.subtotal,
      tax: record.tax,
      deliveryFee: record.deliveryFee,
      totalAmount: record.totalAmount,
      currency: record.currency,
      authorizedAt: new Date().toISOString(),
    });
  });

  app.get('/api/orders/manager-alert-config', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const verifiedUser = await verifyFirebaseUserToken(token);
    if (!verifiedUser || verifiedUser.email.toLowerCase() !== DEPOT_MANAGER_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const provider = getMailProvider();
    res.json({
      managerDisplayName: 'Suman Cold Coffee Depot',
      emailConfigured: provider !== 'none',
      provider,
    });
  });

  app.get('/api/manager/promo-short.mp4', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Sign in as Suman Cold Coffee Depot owner to access this video.' });
      return;
    }
    const verifiedUser = await verifyFirebaseUserToken(token);
    if (!verifiedUser || verifiedUser.email.toLowerCase() !== DEPOT_MANAGER_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'This YouTube Short video is private to Suman Cold Coffee Depot.' });
      return;
    }

    const videoPath = path.resolve(__dirname, 'private_media', 'suman-cold-coffee-short.mp4');
    if (!fs.existsSync(videoPath)) {
      res.status(404).json({ error: 'Promo video file not found.' });
      return;
    }

    const stat = fs.statSync(videoPath);
    const total = stat.size;
    const range = req.headers.range;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');

    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
        if (start >= total || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', end - start + 1);
        fs.createReadStream(videoPath, { start, end }).pipe(res);
        return;
      }
    }

    res.setHeader('Content-Length', total);
    fs.createReadStream(videoPath).pipe(res);
  });

  app.post('/api/orders/notify-manager', async (req, res) => {
    const body = req.body as Partial<ManagerOrderAlertPayload>;
    const orderStatus = typeof body.status === 'string' ? body.status : 'Placed';

    if (orderStatus !== 'Placed') {
      res.status(200).json({
        notified: false,
        skipped: true,
        reason: 'Only new Placed orders trigger manager alert emails.',
      });
      return;
    }

    if (
      !body.orderNumber ||
      typeof body.orderNumber !== 'string' ||
      !Array.isArray(body.items) ||
      body.items.length === 0 ||
      body.items.length > 20 ||
      typeof body.totalAmount !== 'number'
    ) {
      res.status(400).json({ error: 'Invalid order alert payload.' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) {
      const verifiedUser = await verifyFirebaseUserToken(token);
      if (!verifiedUser) {
        res.status(401).json({ error: 'Invalid authentication token.' });
        return;
      }
      if (body.orderId) {
        const remoteOrder = await fetchPlacedOrderFromFirestore(body.orderId, token);
        if (remoteOrder && remoteOrder.status && remoteOrder.status !== 'Placed') {
          res.status(200).json({
            notified: false,
            skipped: true,
            reason: `Order status is already ${remoteOrder.status}.`,
          });
          return;
        }
      }
    }

    const dedupeKey = (body.orderId || body.orderNumber).trim().slice(0, 64);
    if (notifiedOrderKeys.has(dedupeKey)) {
      res.json({
        notified: true,
        duplicate: true,
        configured: getMailProvider() !== 'none',
        provider: getMailProvider(),
        managerEmail: DEPOT_MANAGER_EMAIL,
      });
      return;
    }

    const reqOrigin =
      process.env.APP_URL ||
      (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');

    const result = await sendDepotManagerEmail(
      {
        orderId: body.orderId ? String(body.orderId).slice(0, 64) : undefined,
        orderNumber: body.orderNumber.slice(0, 24),
        status: 'Placed',
        customerName: String(body.customerName || 'Guest').slice(0, 80),
        customerPhone: String(body.customerPhone || '').slice(0, 24),
        deliveryType: String(body.deliveryType || 'Delivery').slice(0, 24),
        deliveryAddress: String(body.deliveryAddress || '').slice(0, 240),
        paymentMethod: String(body.paymentMethod || 'Cash on Delivery').slice(0, 32),
        paymentStatus: String(body.paymentStatus || 'Pending COD').slice(0, 24),
        paymentReference: String(body.paymentReference || '').slice(0, 96),
        totalAmount: Math.round(body.totalAmount),
        estimatedMinutes: Number(body.estimatedMinutes || 15),
        notes: typeof body.notes === 'string' ? body.notes.slice(0, 200) : '',
        items: body.items.slice(0, 20).map((i) => ({
          name: String(i.name || 'Item').slice(0, 100),
          quantity: Math.max(1, Math.min(25, Math.floor(Number(i.quantity) || 1))),
          size: i.size ? String(i.size).slice(0, 16) : 'Regular',
          price: Math.max(0, Math.min(5000, Number(i.price) || 0)),
        })),
      },
      reqOrigin,
      false
    );

    if (result.sent) {
      if (notifiedOrderKeys.size > 500) {
        notifiedOrderKeys.clear();
      }
      notifiedOrderKeys.add(dedupeKey);
    } else if (result.configured && result.error) {
      console.error(`Manager email alert failed for ${body.orderNumber}: ${result.error}`);
    }

    res.json({
      notified: result.sent,
      configured: result.configured,
      provider: result.provider,
      managerEmail: DEPOT_MANAGER_EMAIL,
      error: result.error,
    });
  });

  app.post('/api/orders/test-manager-email', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Sign in as Depot Manager to test email alerts.' });
      return;
    }

    const verifiedUser = await verifyFirebaseUserToken(token);
    if (!verifiedUser || verifiedUser.email.toLowerCase() !== DEPOT_MANAGER_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Only the Depot Manager account can send a test email.' });
      return;
    }

    const reqOrigin =
      process.env.APP_URL ||
      (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'http://localhost:3000');

    const result = await sendDepotManagerEmail(
      {
        orderNumber: 'SCCD-TEST',
        status: 'Placed',
        customerName: 'Amity Student (Test)',
        customerPhone: '+91 9876543210',
        deliveryType: 'Depot Pickup',
        deliveryAddress: 'Depot Pickup · In front of Amity University Gate No. 4, Noida',
        paymentMethod: 'Cash on Delivery',
        paymentStatus: 'Pending COD',
        paymentReference: 'COD-TEST1234',
        totalAmount: 140,
        estimatedMinutes: 12,
        notes: 'Test notification from Kitchen Console',
        items: [
          { name: 'Cold Coffee', quantity: 1, size: 'M', price: 80 },
          { name: 'Veg Cheese Maggi', quantity: 1, size: 'Regular', price: 60 },
        ],
      },
      reqOrigin,
      true
    );

    if (!result.configured) {
      res.status(400).json({
        sent: false,
        configured: false,
        managerEmail: DEPOT_MANAGER_EMAIL,
        error:
          'Add RESEND_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD (or SMTP_HOST/USER/PASS) in AI Studio Secrets to deliver emails.',
      });
      return;
    }

    if (!result.sent) {
      res.status(502).json({
        sent: false,
        configured: true,
        managerEmail: DEPOT_MANAGER_EMAIL,
        error: result.error || 'Could not deliver test email.',
      });
      return;
    }

    res.json({
      sent: true,
      configured: true,
      provider: result.provider,
      managerEmail: DEPOT_MANAGER_EMAIL,
    });
  });

  const publicDir = path.resolve(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  const distPath = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Suman Cold Coffee Depot server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
