export type MenuCategory =
  | 'Shakes'
  | 'Hot Beverages'
  | 'Mocktails & Mojitos'
  | 'Maggi'
  | 'Pasta & Eggs'
  | 'Rolls'
  | 'Paratha'
  | 'Sandwich'
  | 'Kurkuria Sandwich';

export type MilkOption = 'Whole Dairy' | 'Oat Milk' | 'Almond Milk' | 'Soy Milk';
export type SweetnessOption = 'Regular' | 'Less Sugar' | 'Sugar Free';
export type SizeCode = 'S' | 'M' | 'L' | 'XL';
export type SizeOption = SizeCode | 'Regular';

export interface SizePrices {
  S: number;
  M: number;
  L: number;
  XL: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  description: string;
  price: number;
  sizePrices?: SizePrices;
  imageUrl: string;
  available: boolean;
  prepTimeMins: number;
  calories: number;
  caffeineMg: number;
  featured: boolean;
  updatedAt?: unknown;
}

export interface CartItem {
  cartKey: string;
  itemId: string;
  name: string;
  basePrice: number;
  price: number;
  quantity: number;
  imageUrl: string;
  size: SizeOption;
  milk: MilkOption;
  sweetness: SweetnessOption;
  note?: string;
}

export type OrderStatus =
  | 'Placed'
  | 'Brewing'
  | 'Quality Check'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled';

export type PaymentMethod =
  | 'Razorpay'
  | 'Stripe'
  | 'UPI'
  | 'Card'
  | 'Wallet'
  | 'Cash on Delivery';

export type PaymentStatus = 'Paid' | 'Pending COD';
export type DeliveryType = 'Delivery' | 'Depot Pickup';

export interface OrderLineItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  size: string;
  milk: string;
  sweetness: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  deliveryType: DeliveryType;
  deliveryAddress: string;
  items: OrderLineItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference: string;
  status: OrderStatus;
  estimatedMinutes: number;
  notes: string;
  createdAt?: { seconds: number; nanoseconds: number } | null;
  updatedAt?: { seconds: number; nanoseconds: number } | null;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  deliveryAddress: string;
  pushOptIn: boolean;
  defaultMilk: MilkOption;
  defaultSweetness: SweetnessOption;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserNotification {
  id: string;
  userId: string;
  orderId: string;
  title: string;
  message: string;
  type: 'order_placed' | 'status_update' | 'promo';
  read: boolean;
  createdAt?: { seconds: number; nanoseconds: number } | null;
}

export interface GuestCustomerDetails {
  displayName: string;
  phone: string;
  deliveryAddress: string;
}

export type ActiveView = 'menu' | 'tracker' | 'profile' | 'kitchen';
