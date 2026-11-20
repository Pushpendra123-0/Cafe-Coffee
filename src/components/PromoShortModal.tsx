import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Copy,
  Download,
  Lock,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

interface PromoShortModalProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
}

interface ShortChapter {
  id: string;
  timeSec: number;
  timeLabel: string;
  title: string;
  caption: string;
}

const SHORT_CHAPTERS: ShortChapter[] = [
  {
    id: 'hook',
    timeSec: 0,
    timeLabel: '0:00',
    title: '01. Fast Café Hook Montage',
    caption: 'Cold Coffee, Cheese Maggi & Rolls outside Amity Gate No. 4.',
  },
  {
    id: 'browse',
    timeSec: 3.0,
    timeLabel: '0:03',
    title: '02. Customer Taps + Add to Bag',
    caption: 'Animated selection of Cold Coffee & Maggi with zero login.',
  },
  {
    id: 'checkout',
    timeSec: 8.5,
    timeLabel: '0:08',
    title: '03. Name, Mobile & Address Checkout',
    caption: 'Direct guest entry and instant #SCCD-4821 order confirmation.',
  },
  {
    id: 'owner',
    timeSec: 15.0,
    timeLabel: '0:15',
    title: '04. Shop Owner Sound, Popup & Email',
    caption: 'Counter alert chime + Kitchen Console one-tap Start Brewing.',
  },
  {
    id: 'sync',
    timeSec: 22.5,
    timeLabel: '0:22',
    title: '05. Real-Time Customer Tracker Sync',
    caption: 'Progress sweeps live from Placed → Brewing → Out for Delivery.',
  },
  {
    id: 'outro',
    timeSec: 26.5,
    timeLabel: '0:26',
    title: '06. Safe-Zone YouTube Shorts Outro',
    caption: 'Clear of YouTube Like/Title overlays with website link & phones.',
  },
];

const YOUTUBE_SHORT_TITLE =
  'Order Cold Coffee & Maggi at Amity Gate 4 in 15 Sec — No Login! #shorts #amitynoida';

const YOUTUBE_SHORT_DESCRIPTION = `Order directly from Suman Cold Coffee Depot (opposite Amity University Gate No. 4, Noida) — NO sign-in or app download needed!

How it works:
1. Pick Shakes, Cold Coffee, Mojitos, Maggi, Rolls, or Parathas
2. Enter your Name, Mobile Number & Address
3. Shop owner gets instant alert + email and prepares your order live!

Order Website: https://suman-cold-coffee-depot.onrender.com/
Call Cafe Counter: 8505939149 / 9310923641

#shorts #youtubeshorts #coldcoffee #amityuniversity #noida #sector125 #cafevlog #maggi #streetfoodindia`;

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export function PromoShortModal({ open, user, onClose }: PromoShortModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string>('');
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [copiedField, setCopiedField] = useState<'title' | 'desc' | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !user) {
      setVideoBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      setIsPlaying(false);
      setLoadError('');
      return;
    }

    let cancelled = false;
    let createdUrl = '';
    setLoadingVideo(true);
    setLoadError('');

    user
      .getIdToken()
      .then((idToken) =>
        fetch('/api/manager/promo-short.mp4', {
          headers: { Authorization: `Bearer ${idToken}` },
        })
      )
      .then(async (resp) => {
        if (!resp.ok) {
          throw new Error('Could not authorize private YouTube Short download.');
        }
        return resp.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setVideoBlobUrl(createdUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : 'Could not load private YouTube Short.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingVideo(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [open, user]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !open || !videoBlobUrl) return;
    vid.currentTime = 0;
    vid.muted = isMuted;
    const playPromise = vid.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        vid.muted = true;
        setIsMuted(true);
        vid.play().catch(() => {});
      });
    }
  }, [open, videoBlobUrl]);

  if (!open) return null;

  const activeChapterIdx = SHORT_CHAPTERS.reduce((acc, ch, idx) => {
    return currentTime >= ch.timeSec - 0.15 ? idx : acc;
  }, 0);

  function togglePlay() {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }

  function toggleMute() {
    const vid = videoRef.current;
    if (!vid) return;
    const nextMuted = !vid.muted;
    vid.muted = nextMuted;
    setIsMuted(nextMuted);
  }

  function jumpToTime(sec: number) {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = sec;
    setCurrentTime(sec);
    if (vid.paused) {
      vid.play().catch(() => {});
    }
  }

  function handleScrub(val: number) {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = val;
    setCurrentTime(val);
  }

  async function copyText(field: 'title' | 'desc', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2500);
    } catch {
      // Ignore clipboard failure
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Private Suman Cold Coffee Depot YouTube Short"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 backdrop-blur-xs p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto shadow-2xl grid grid-cols-1 md:grid-cols-12">
        {/* Left: 9:16 Vertical YouTube Short Player */}
        <div className="md:col-span-5 bg-zinc-950 p-4 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-[320px] aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            {loadingVideo && (
              <p className="text-xs text-zinc-300 px-4 text-center">
                Loading your private YouTube Short...
              </p>
            )}

            {loadError && !loadingVideo && (
              <p className="text-xs text-red-400 px-4 text-center">{loadError}</p>
            )}

            {videoBlobUrl && (
              <video
                ref={videoRef}
                src={videoBlobUrl}
                playsInline
                loop
                preload="auto"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onLoadedMetadata={(e) => {
                  if (e.currentTarget.duration && Number.isFinite(e.currentTarget.duration)) {
                    setDuration(e.currentTarget.duration);
                  }
                }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onClick={togglePlay}
                className="w-full h-full object-cover cursor-pointer"
              />
            )}

            {videoBlobUrl && !isPlaying && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play YouTube Short"
                className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors cursor-pointer"
              >
                <span className="w-14 h-14 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-lg">
                  <Play className="w-6 h-6 ml-0.5" />
                </span>
              </button>
            )}

            {videoBlobUrl && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pt-6 pb-3 space-y-2">
                <input
                  type="range"
                  min={0}
                  max={duration || 30}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => handleScrub(Number(e.target.value))}
                  aria-label="Seek video timeline"
                  className="w-full accent-amber-500 h-1.5 cursor-pointer"
                />
                <div className="flex items-center justify-between text-xs text-white">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? 'Pause video' : 'Play video'}
                      className="p-1.5 rounded-md hover:bg-white/15 cursor-pointer"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <span className="font-mono tabular-nums text-[11px] text-zinc-200">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Unmute background music' : 'Mute background music'}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 hover:bg-white/25 text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isMuted ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Unmute</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Music On</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Owner-Only YouTube Shorts Pack */}
        <div className="md:col-span-7 p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-amber-800 inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Owner Only (Hidden from Website) · 1080×1920 MP4 · 30s</span>
                </p>
                <h2 className="font-display text-2xl font-semibold text-zinc-950 mt-1">
                  Your Private YouTube Short
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close short viewer"
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-zinc-600 leading-relaxed">
              This video is removed from the public website and accessible only when signed in as Suman Cold Coffee Depot. Download the 9:16 MP4 and upload it directly to your YouTube channel.
            </p>

            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                {videoBlobUrl ? (
                  <a
                    href={videoBlobUrl}
                    download="Suman-Cold-Coffee-YouTube-Short.mp4"
                    className="px-4 py-2.5 min-h-[42px] inline-flex items-center gap-2 text-sm font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download YouTube Short (.mp4)</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="px-4 py-2.5 min-h-[42px] inline-flex items-center gap-2 text-sm font-medium bg-zinc-300 text-zinc-600 rounded-lg whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>{loadingVideo ? 'Preparing Download...' : 'Unavailable'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => copyText('title', YOUTUBE_SHORT_TITLE)}
                  className="px-3.5 py-2.5 min-h-[42px] inline-flex items-center gap-1.5 text-xs font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedField === 'title' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Title Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy YT Title</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => copyText('desc', YOUTUBE_SHORT_DESCRIPTION)}
                  className="px-3.5 py-2.5 min-h-[42px] inline-flex items-center gap-1.5 text-xs font-medium border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedField === 'desc' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Description Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Description &amp; Tags</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Upload tip: In YouTube app tap <strong>+ → Upload a video</strong> (or Create a Short → gallery), select this 30s MP4, and paste the Title &amp; Description above.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-500">Scenes in This Short</p>
              <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                {SHORT_CHAPTERS.map((ch, idx) => {
                  const isActive = idx === activeChapterIdx;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      disabled={!videoBlobUrl}
                      onClick={() => jumpToTime(ch.timeSec)}
                      className={`w-full text-left px-3.5 py-2 flex items-start gap-3 transition-colors cursor-pointer disabled:opacity-60 ${
                        isActive ? 'bg-amber-50/90' : 'bg-white hover:bg-zinc-50'
                      }`}
                    >
                      <span
                        className={`font-mono text-xs tabular-nums mt-0.5 shrink-0 ${
                          isActive ? 'text-amber-800 font-semibold' : 'text-zinc-400'
                        }`}
                      >
                        {ch.timeLabel}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium leading-snug ${
                            isActive ? 'text-zinc-950' : 'text-zinc-800'
                          }`}
                        >
                          {ch.title}
                        </p>
                        <p className="text-xs text-zinc-500">{ch.caption}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
