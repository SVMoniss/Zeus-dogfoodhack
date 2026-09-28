'use client';

type MarkProps = {
  size?: number;
  className?: string;
};

/**
 * DOGFOOD 2026 trophy mark — a gold cup on a deep-hackathon-blue tile,
 * topped with the "grand-prize" star. One shared component so the logo
 * is identical on every page (headers, auth screens, footer, favicon
 * artwork mirrors this in `src/app/icon.svg`).
 */
export function TrophyMark({ size = 28, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="DOGFOOD 2026 trophy logo"
      className={className}
    >
      <defs>
        <linearGradient
          id="df-trophy-bg"
          x1="0"
          y1="0"
          x2="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1F78D1" />
          <stop offset="1" stopColor="#0A2A52" />
        </linearGradient>
        <linearGradient
          id="df-trophy-gold"
          x1="14"
          y1="10"
          x2="34"
          y2="39"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FDE68A" />
          <stop offset="0.55" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#B45309" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#df-trophy-bg)" />
      {/* grand-prize star */}
      <path
        d="M24 4.6l1.15 2.7 2.7 1.15-2.7 1.15L24 12.3l-1.15-2.7-2.7-1.15 2.7-1.15L24 4.6z"
        fill="#FDE68A"
      />
      {/* cup handles */}
      <path
        d="M14.5 15.5c-2.7.4-4.7 2.7-4.7 5.5 0 3.2 2.8 5.6 6.2 5.6"
        stroke="url(#df-trophy-gold)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M33.5 15.5c2.7.4 4.7 2.7 4.7 5.5 0 3.2-2.8 5.6-6.2 5.6"
        stroke="url(#df-trophy-gold)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* cup bowl */}
      <path
        d="M15 14.5h18V21c0 5-3.6 8.6-8 9.4l-1 .2-1-.2c-4.4-.8-8-4.4-8-9.4v-6.5z"
        fill="url(#df-trophy-gold)"
      />
      {/* rim highlight */}
      <rect x="14" y="12.6" width="20" height="3" rx="1.5" fill="#FEF3C7" />
      {/* stem + foot */}
      <rect x="22.4" y="30.4" width="3.2" height="5" rx="1" fill="url(#df-trophy-gold)" />
      <rect x="17" y="35.8" width="14" height="3.2" rx="1.6" fill="url(#df-trophy-gold)" />
    </svg>
  );
}

type LockupProps = {
  /** pixel size of the trophy mark */
  markSize?: number;
  /** extra classes for the wordmark text (color/size adapt to context) */
  textClassName?: string;
  className?: string;
};

/** Trophy mark + "dogfood." wordmark, used for every site header. */
export function BrandLockup({ markSize = 28, textClassName = 'text-lg', className }: LockupProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <TrophyMark size={markSize} />
      <span className={`font-bold tracking-tight ${textClassName}`}>
        dogfood<span className="text-primary">.</span>
      </span>
    </span>
  );
}
