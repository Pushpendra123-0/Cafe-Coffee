import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ExternalLink, QrCode, X } from 'lucide-react';

export const SHARED_PUBLIC_APP_URL =
  'https://suman-cold-coffee-depot.onrender.com';

export const DEV_PREVIEW_APP_URL =
  'https://ais-dev-vmdxcpg64uptxpzqyxsi6w-500434753167.asia-northeast1.run.app';

const SAVED_PUBLIC_URL_KEY = 'suman_depot_published_url';

export function getPublicOrderBaseUrl(): string {
  if (typeof window === 'undefined') return SHARED_PUBLIC_APP_URL;
  const origin = window.location.origin;
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
  const isAiStudioPreview =
    origin.startsWith('https://ais-dev-') || origin.startsWith('https://ais-pre-');

  if (!isLocal && !isAiStudioPreview) {
    return origin;
  }

  try {
    const saved = window.localStorage.getItem(SAVED_PUBLIC_URL_KEY);
    if (
      saved &&
      saved.trim().startsWith('http') &&
      !saved.includes('ais-pre-') &&
      !saved.includes('ais-dev-')
    ) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {
    // Ignore storage errors
  }

  return SHARED_PUBLIC_APP_URL;
}

export function getDevPreviewBaseUrl(): string {
  if (typeof window === 'undefined') return DEV_PREVIEW_APP_URL;
  const origin = window.location.origin;
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return DEV_PREVIEW_APP_URL;
  }
  if (origin.startsWith('https://ais-pre-')) {
    return origin.replace('https://ais-pre-', 'https://ais-dev-');
  }
  return origin;
}

type QrFlowMode = 'standard' | 'pickup';
type QrLinkTarget = 'shared' | 'dev';

export function OrderQrCard({ compact = false }: { compact?: boolean }) {
  const [flowMode, setFlowMode] = useState<QrFlowMode>('standard');
  const [linkTarget, setLinkTarget] = useState<QrLinkTarget>('shared');
  const [customUrl, setCustomUrl] = useState(() => getPublicOrderBaseUrl());
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  function handleSelectLinkTarget(next: QrLinkTarget) {
    setLinkTarget(next);
    setCustomUrl(next === 'shared' ? getPublicOrderBaseUrl() : getDevPreviewBaseUrl());
  }

  function handleCustomUrlChange(nextVal: string) {
    setCustomUrl(nextVal);
    if (linkTarget === 'shared') {
      try {
        const trimmed = nextVal.trim().replace(/\/+$/, '');
        if (trimmed.startsWith('http')) {
          window.localStorage.setItem(SAVED_PUBLIC_URL_KEY, trimmed);
        }
      } catch {
        // Ignore storage errors
      }
    }
  }

  const normalizedBase = customUrl.trim().replace(/\/+$/, '') || SHARED_PUBLIC_APP_URL;
  const targetUrl =
    flowMode === 'pickup' ? `${normalizedBase}/?mode=pickup` : `${normalizedBase}/`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(targetUrl, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#09090b',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});

    QRCode.toString(targetUrl, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#09090b',
        light: '#ffffff',
      },
    })
      .then((svg) => {
        if (active) setQrSvg(svg);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [targetUrl]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked in restricted browser contexts
    }
  }

  async function handleDownloadPosterPng() {
    if (!qrDataUrl || downloading) return;
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, 190);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
      ctx.fillText('Suman Cold Coffee Depot', 450, 86);

      ctx.fillStyle = '#d4d4d8';
      ctx.font = '500 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        'In front of Amity University Gate No. 4, Noida, Uttar Pradesh',
        450,
        136
      );

      ctx.fillStyle = '#09090b';
      ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        flowMode === 'pickup' ? 'Scan to Order · Counter Pickup' : 'Scan to Order Online',
        450,
        268
      );

      ctx.fillStyle = '#52525b';
      ctx.font = '400 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        'Shakes · Hot Coffee · Mocktails · Maggi · Rolls · Paratha · Sandwich',
        450,
        312
      );

      ctx.strokeStyle = '#e4e4e7';
      ctx.lineWidth = 3;
      ctx.strokeRect(185, 355, 530, 530);

      const qrImage = new Image();
      await new Promise<void>((resolve, reject) => {
        qrImage.onload = () => resolve();
        qrImage.onerror = () => reject(new Error('QR image draw error'));
        qrImage.src = qrDataUrl;
      });
      ctx.drawImage(qrImage, 205, 375, 490, 490);

      ctx.fillStyle = '#09090b';
      ctx.font = '600 24px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        'Point your phone camera or Google Lens at this QR code',
        450,
        952
      );

      ctx.fillStyle = '#52525b';
      ctx.font = '400 21px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        'Pay with Cash / Shop QR (COD), UPI, Card, or Razorpay',
        450,
        992
      );

      ctx.fillStyle = '#92400e';
      ctx.font = '600 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        'Call: 8505939149 / 9310923641',
        450,
        1038
      );

      ctx.fillStyle = '#f4f4f5';
      ctx.fillRect(0, 1085, canvas.width, 115);
      ctx.fillStyle = '#3f3f46';
      ctx.font = '500 18px monospace';
      ctx.fillText(targetUrl, 450, 1150);

      const link = document.createElement('a');
      link.download =
        flowMode === 'pickup'
          ? 'suman-depot-pickup-qr.png'
          : 'suman-depot-order-qr.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  function handleDownloadSvg() {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      flowMode === 'pickup'
        ? 'suman-depot-pickup-qr.svg'
        : 'suman-depot-order-qr.svg';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
      <div className="md:col-span-5 flex flex-col items-center justify-center bg-zinc-50 border border-zinc-200 rounded-xl p-5 text-center">
        <p className="text-xs font-medium text-amber-800 mb-2">
          Suman Cold Coffee Depot
        </p>
        <div className="w-52 h-52 bg-white border border-zinc-200 rounded-lg p-2.5 flex items-center justify-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Scan to order online at Suman Cold Coffee Depot"
              className="w-full h-full object-contain"
            />
          ) : (
            <QrCode className="w-16 h-16 text-zinc-300" />
          )}
        </div>
        <p className="mt-3 text-xs font-medium text-zinc-950">
          {flowMode === 'pickup'
            ? 'Scan for Counter Pickup'
            : 'Scan to Order Online'}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          Amity University Gate No. 4, Noida
        </p>
        <p className="text-xs font-mono text-amber-800 mt-1 tabular-nums">
          8505939149 / 9310923641
        </p>
      </div>

      <div className="md:col-span-7 space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-zinc-950">
            Customer Scan-to-Order QR Code
          </h2>
          <p className="text-sm text-zinc-600 mt-1 leading-relaxed">
            Print this QR standee for your counter or share it on WhatsApp. Anyone who scans it opens your live menu and can place an order directly with Cash (COD), UPI, Card, or Razorpay.
          </p>
        </div>

        <div>
          <span className="block text-xs font-medium text-zinc-700 mb-1.5">
            QR Destination Mode
          </span>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-lg">
            <button
              type="button"
              onClick={() => setFlowMode('standard')}
              className={`py-2 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                flowMode === 'standard'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Delivery &amp; Pickup
            </button>
            <button
              type="button"
              onClick={() => setFlowMode('pickup')}
              className={`py-2 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                flowMode === 'pickup'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Counter Pickup (?mode=pickup)
            </button>
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-zinc-700 mb-1.5">
            Storefront Link Environment
          </span>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-lg">
            <button
              type="button"
              onClick={() => handleSelectLinkTarget('shared')}
              className={`py-2 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                linkTarget === 'shared'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Public Website Link
            </button>
            <button
              type="button"
              onClick={() => handleSelectLinkTarget('dev')}
              className={`py-2 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                linkTarget === 'dev'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Dev Test Link (Your Phone)
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
            {linkTarget === 'shared'
              ? 'Uses your live public website URL (https://suman-cold-coffee-depot.onrender.com). You can also enter a custom .com/.in domain below anytime.'
              : 'Works on a phone signed into your Google account while previewing inside AI Studio.'}
          </p>
        </div>

        {!compact && (
          <div>
            <label
              htmlFor="qr-base-url"
              className="block text-xs font-medium text-zinc-700 mb-1"
            >
              Published Website URL
            </label>
            <input
              id="qr-base-url"
              type="url"
              value={customUrl}
              onChange={(e) => handleCustomUrlChange(e.target.value)}
              placeholder="https://your-published-app.run.app"
              className="w-full px-3 py-2 text-xs font-mono border border-zinc-200 rounded-lg bg-zinc-50 focus:outline-none focus:border-zinc-950"
            />
          </div>
        )}

        <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-zinc-700 truncate">
            {targetUrl}
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-950 whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open</span>
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-950 hover:text-amber-800 whitespace-nowrap cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            disabled={!qrDataUrl || downloading}
            onClick={handleDownloadPosterPng}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] text-xs font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {downloading ? 'Preparing Poster...' : 'Download Printable Poster (PNG)'}
            </span>
          </button>

          <button
            type="button"
            disabled={!qrSvg}
            onClick={handleDownloadSvg}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] text-xs font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-50 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download QR (SVG)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrderQrModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Shop Order QR Code"
    >
      <div className="w-full max-w-3xl relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close QR modal"
          className="absolute top-3 right-3 z-10 p-2 text-zinc-500 hover:text-zinc-950 bg-white hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
        <OrderQrCard />
      </div>
    </div>
  );
}
