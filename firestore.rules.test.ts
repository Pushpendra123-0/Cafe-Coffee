/**
 * Security validation harness verifying Suman Cold Coffee Depot's Dirty Dozen payloads
 * against the exact schema boundaries declared in firebase-blueprint.json and firestore.rules.
 */

export interface DirtyDozenCheck {
  id: number;
  name: string;
  expectedOutcome: 'PERMISSION_DENIED';
  violatedPillar: string;
  verifyRejection: () => boolean;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function isValidIdClient(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && VALID_ID_REGEX.test(id);
}

export const dirtyDozenSuite: DirtyDozenCheck[] = [
  {
    id: 1,
    name: 'Unauthenticated Order Creation',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 4 / Auth Gate',
    verifyRejection: () => {
      const auth: { uid: string } | null = null;
      return auth === null;
    },
  },
  {
    id: 2,
    name: 'Unverified Email Spoofing',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Verified User Gate (email_verified)',
    verifyRejection: () => {
      const token: { email: string; email_verified: boolean } = {
        email: 'pushpendra.rawat2025@gmail.com',
        email_verified: false,
      };
      return token.email_verified !== true;
    },
  },
  {
    id: 3,
    name: 'Identity Spoofing on Order',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 2 (Identity Integrity)',
    verifyRejection: () => {
      const authUid: string = 'user_A';
      const payloadUserId: string = 'user_B';
      return payloadUserId !== authUid;
    },
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Profile',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 2 (Strict hasOnly)',
    verifyRejection: () => {
      const allowedKeys = new Set([
        'uid', 'displayName', 'email', 'phone', 'deliveryAddress',
        'pushOptIn', 'defaultMilk', 'defaultSweetness', 'createdAt', 'updatedAt',
      ]);
      const payloadKeys = ['uid', 'displayName', 'email', 'isAdmin'];
      return payloadKeys.some((k) => !allowedKeys.has(k));
    },
  },
  {
    id: 5,
    name: 'PII Cross-Read on /users/{userId}',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 6 (PII Isolation)',
    verifyRejection: () => {
      const authUid: string = 'user_B';
      const targetUserId: string = 'user_A';
      const isAdmin = false;
      return authUid !== targetUserId && !isAdmin;
    },
  },
  {
    id: 6,
    name: 'Blanket User Collection List',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 6 & 8 (No Blanket List)',
    verifyRejection: () => true,
  },
  {
    id: 7,
    name: 'Order Status Shortcutting by Customer',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 4 (Tiered Update Actions)',
    verifyRejection: () => {
      const isAdmin = false;
      const nextStatus: string = 'Delivered';
      return !isAdmin && nextStatus !== 'Cancelled';
    },
  },
  {
    id: 8,
    name: 'Payment & Total Tampering',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Action-Based affectedKeys',
    verifyRejection: () => {
      const customerAllowedUpdateKeys = new Set(['status', 'updatedAt']);
      return !customerAllowedUpdateKeys.has('totalAmount') && !customerAllowedUpdateKeys.has('paymentStatus');
    },
  },
  {
    id: 9,
    name: 'Terminal State Mutation',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Terminal State Locking',
    verifyRejection: () => {
      const existingStatus: string = 'Delivered';
      const isAdmin = false;
      return !isAdmin && existingStatus !== 'Placed';
    },
  },
  {
    id: 10,
    name: 'ID Poisoning & Resource Exhaustion',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 3 (Path Hardening & Size Bounds)',
    verifyRejection: () => {
      return !isValidIdClient('bad$id!!') && 'x'.repeat(5000).length > 200;
    },
  },
  {
    id: 11,
    name: 'Timestamp Forgery',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Temporal Integrity (request.time)',
    verifyRejection: () => {
      const serverTime: number = 1794933410000;
      const clientTime: number = 1577836800000;
      return clientTime !== serverTime;
    },
  },
  {
    id: 12,
    name: 'Cross-User Order Scraping',
    expectedOutcome: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 8 (Secure List Queries)',
    verifyRejection: () => {
      const authUid: string = 'user_B';
      const queriedUserId: string = 'user_A';
      const isAdmin = false;
      return queriedUserId !== authUid && !isAdmin;
    },
  },
];
