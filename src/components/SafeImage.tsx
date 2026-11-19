import { useState } from 'react';
import { Coffee } from 'lucide-react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function SafeImage({ src, alt, className = '', fallbackLabel }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-500 p-6 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Coffee className="w-8 h-8 mb-2 text-zinc-400" strokeWidth={1.5} />
        <span className="text-xs font-medium text-zinc-600 text-center">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
