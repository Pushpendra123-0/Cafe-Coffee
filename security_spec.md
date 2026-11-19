# Security Specification: Suman Cold Coffee Depot

## 1. Data Invariants
1. **Menu Integrity**: All items in `/menuItems/{itemId}` are publicly readable for storefront browsing, but only verified admins (`isAdmin()`) may create, update, or delete menu items.
2. **PII Isolation**: Customer profiles in `/users/{userId}` contain PII (`email`, `phone`, `deliveryAddress`). `get` and `write` are restricted strictly to the profile owner (`request.auth.uid == userId`) or `isAdmin()`. Blanket `list` on `/users` is denied.
3. **Order Ownership & State Machine**: Every order in `/orders/{orderId}` must bind `userId == request.auth.uid` on creation, start with `status == 'Placed'`, and match `request.time` for `createdAt` and `updatedAt`. Customers may only list/get their own orders and may only cancel an order while it is still `'Placed'`. Terminal states (`'Delivered'`, `'Cancelled'`) are locked against non-admin updates.
4. **Notification Scoping**: Subcollection `/users/{userId}/notifications/{notificationId}` enforces the Master Gate on `userId`. Customers may mark their own notifications as `read`, while only the owner or an admin may create order notifications for that `userId`.
5. **Verified Identity & Strict Keys**: All writes require `request.auth != null && request.auth.token.email_verified == true`. Every collection enforces `keys().hasAll(...)` + `keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on update.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Order Creation**: Anonymous request attempts `create` on `/orders/order_1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoofing**: Authenticated user with `email_verified: false` (even matching admin email) attempts admin write on `/menuItems/item_1` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Order**: User A attempts `create` on `/orders/order_2` with `userId: "user_B"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Profile**: User attempts `create` on `/users/user_A` with extra ghost field `isAdmin: true` -> `PERMISSION_DENIED`.
5. **PII Cross-Read**: User B attempts `get` on `/users/user_A` -> `PERMISSION_DENIED`.
6. **Blanket User Scraping**: User A attempts `list` on `/users` -> `PERMISSION_DENIED`.
7. **Order Status Shortcutting**: Customer attempts `update` on `/orders/order_1` jumping `status` from `'Placed'` to `'Delivered'` -> `PERMISSION_DENIED`.
8. **Payment Tampering**: Customer attempts `update` on `/orders/order_1` changing `paymentStatus` to `'Paid'` or lowering `totalAmount` -> `PERMISSION_DENIED`.
9. **Terminal State Mutation**: Customer attempts `update` on `/orders/order_1` after `status == 'Delivered'` -> `PERMISSION_DENIED`.
10. **ID Poisoning / Resource Exhaustion**: Attacker attempts `create` on `/orders/bad$id!!` or injects a 5000-char `notes` string -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: Client sends backdated `createdAt` (`2020-01-01`) instead of `request.time` -> `PERMISSION_DENIED`.
12. **Cross-User Order Scraping**: User B attempts `list` on `/orders` without filtering `userId == user_B` -> `PERMISSION_DENIED`.
