const PALETTES = [
  'from-[#1f78d1] to-[#003e54]',
  'from-[#003e54] to-[#22a197]',
  'from-[#22a197] to-[#1f78d1]',
  'from-[#185fa5] to-[#22a197]',
  'from-[#0f3a63] to-[#1b69b8]',
];

function paletteFor(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 997;
  return PALETTES[h % PALETTES.length];
}

function monogram(title: string) {
  const words = title.split(/\s+/).filter(Boolean).slice(0, 2);
  return words.map((w) => w[0]).join('').toUpperCase() || '?';
}

/**
 * Split an event display name like "Demo Day 1790505288596" into a clean
 * title plus the meaningless trailing run number, shown as a small id tag.
 * Short numbers stay in the title, so years ("Sample Hack 2026") are kept.
 */
export function splitEventTitle(name: string): { title: string; runId: string | null } {
  const m = name.match(/^(.*?)\s+(\d{5,})$/);
  if (!m || !m[1].trim()) return { title: name, runId: null };
  return { title: m[1].trim(), runId: m[2] };
}

/** Small mono id tag rendered under event titles. */
export function EventIdTag({ runId }: { runId: string }) {
  return (
    <span className="mt-0.5 block font-mono text-[11px] tracking-wide text-muted-foreground">
      #{runId}
    </span>
  );
}

/** Banner artwork for listing cards: gradient + monogram + optional status ribbon. */
export function ListingThumb({
  title,
  ribbon,
  ribbonClass = 'bg-green-600',
}: {
  title: string;
  ribbon?: string;
  ribbonClass?: string;
}) {
  return (
    <div className={`listing-thumb bg-gradient-to-br ${paletteFor(title)}`}>
      {ribbon && <span className={`ribbon ${ribbonClass}`}>{ribbon}</span>}
      <span className="font-serif text-5xl italic opacity-90" aria-hidden="true">
        {monogram(title)}
      </span>
      <span
        className="pointer-events-none absolute inset-0 opacity-20"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.5) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
    </div>
  );
}

/** Wide banner for detail pages. */
export function DetailBanner({ title, ribbon, ribbonClass = 'bg-green-600' }: { title: string; ribbon?: string; ribbonClass?: string }) {
  return (
    <div className={`relative flex h-44 items-center overflow-hidden bg-gradient-to-r sm:h-56 ${paletteFor(title)}`}>
      {ribbon && <span className={`ribbon ${ribbonClass}`}>{ribbon}</span>}
      <span className="px-6 font-serif text-7xl italic text-white/90 sm:px-10 sm:text-8xl" aria-hidden="true">
        {monogram(title)}
      </span>
      <span
        className="pointer-events-none absolute inset-0 opacity-20"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.5) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
        }}
      />
    </div>
  );
}
