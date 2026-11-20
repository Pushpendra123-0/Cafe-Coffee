# Security Specification: Suman Cold Coffee Depot

## 1. Data Invariants
1. **Menu Integrity**: All items in `/menuItems/{itemId}` are publicly readable for storefront browsing, but only verified admins (`isAdmin()`) may create, update, or delete menu items.
2. **PII Isolation**: Customer profiles in `/users/{userId}` contain PII (`email`, `phone`, `deliveryAddress`). `get` and `write` are restricted strictly to the profile owner (`request.auth.uid == userId`) or `isAdmin()`. Blanket `list` on `/users` is denied.
3. **Guest Order Creation & Zero-PII Live Tracking**: Customers can place orders in `/orders/{orderId}` without signing in using a `guest_<id>` identifier (`^guest_[a-zA-Z0-9]{12,64}$`) and high-entropy `orderId` (`size >= 18`), strictly starting at `status == 'Placed'` with `createdAt == request.time` and `updatedAt == request.time`. Because `/orders/{orderId}` stores customer PII (`customerName`, `customerPhone`, `deliveryAddress`), unauthenticated `get`, `list`, `update`, and `delete` on `/orders` are strictly denied (`PERMISSION_DENIED`). Only the verified Depot Manager (`isAdmin()`) or matching signed-in owner can read `/orders`. Non-PII live order tracking updates are mirrored in `/orderStatus/{orderId}` (no name, phone, or address) with `allow list: if isAdmin();` and `allow get` gated on high-entropy `orderId.size() >= 18`.
4. **Notification Scoping**: Subcollection `/users/{userId}/notifications/{notificationId}` enforces the Master Gate on `userId`. Only the owner or admin may read or create notifications for that `userId`.
5. **Verified Identity & Strict Keys**: All admin and authenticated operations require `request.auth != null && request.auth.token.email_verified == true`. Every collection enforces `keys().hasAll(...)` + `keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on update.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Order PII Read**: Anonymous user attempts `get` or `list` on `/orders/{orderId}` to read customer phone/address -> `PERMISSION_DENIED`.
2. **Unverified Email Spoofing**: Authenticated user with `email_verified: false` (even matching admin email) attempts admin write on `/menuItems/item_1` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Signed-In Order**: Signed-in User A attempts `create` on `/orders/order_long_id_123456` with `userId: "user_B"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Guest Order**: Guest attempts `create` on `/orders/order_long_id_123456` with extra ghost field `isAdmin: true` or `status: 'Delivered'` -> `PERMISSION_DENIED`.
5. **PII Cross-Read**: User B attempts `get` on `/users/user_A` -> `PERMISSION_DENIED`.
6. **Blanket User Scraping**: Any user attempts `list` on `/users` or `/orderStatus` -> `PERMISSION_DENIED`.
7. **Order Status Shortcutting**: Non-admin guest or customer attempts `update` on `/orders/{orderId}` or `/orderStatus/{orderId}` jumping `status` to `'Delivered'` -> `PERMISSION_DENIED`.
8. **Payment Tampering**: Non-admin attempts `update` on `/orders/{orderId}` changing `paymentStatus` to `'Paid'` or lowering `totalAmount` -> `PERMISSION_DENIED`.
9. **Terminal State Mutation**: Non-admin customer attempts `update` on `/orders/{orderId}` after `status == 'Delivered'` -> `PERMISSION_DENIED`.
10. **ID Poisoning / Resource Exhaustion**: Attacker attempts `create` on `/orders/short` (under 18 chars), `/orders/bad$id!!`, or injects a 5000-char `notes` string -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: Client sends backdated `createdAt` (`2020-01-01`) instead of `request.time` -> `PERMISSION_DENIED`.
12. **Cross-User Order Scraping**: Non-admin user attempts `list` on `/orders` without filtering `userId == request.auth.uid` -> `PERMISSION_DENIED`.
