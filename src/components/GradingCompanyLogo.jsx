import React from 'react';

/**
 * Grading company badges styled to mimic each company's real slab labels.
 *
 * Each badge has:
 *   - A brand-colored container (matches the company's real packaging)
 *   - An inline SVG "wordmark" rendered with brand-appropriate typography
 *     and color treatments (e.g. BGS gold gradient, CGC red+gold)
 *   - A high-contrast grade pill on the right
 *
 * Public API is unchanged:
 *   <GradingBadge company="PSA" grade={9} />
 *   <GradingCompanyLogo company="BGS" grade={9.5} />
 */

// ---------- Brand-styled inline SVG wordmarks ----------
// These are deliberately rendered as SVG so they read cleanly at very small
// sizes, don't depend on external image hosts, and let us bake in
// brand-specific effects (gold gradients, etc.) that plain text can't do.

const WordmarkSvg = ({ text, fill, gradientId, gradientStops, letterSpacing = '-0.04em' }) => {
  // viewBox sized so the wordmark fills the badge height nicely
  const width = text.length * 14 + 4;
  return (
    <svg
      viewBox={`0 0 ${width} 22`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-full w-auto block"
      style={{ display: 'block' }}
    >
      {gradientStops && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            {gradientStops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
      )}
      <text
        x={width / 2}
        y="17"
        textAnchor="middle"
        fontFamily="'Helvetica Neue', 'Arial Black', Arial, sans-serif"
        fontSize="19"
        fontWeight="900"
        fill={gradientStops ? `url(#${gradientId})` : fill}
        letterSpacing={letterSpacing}
      >
        {text}
      </text>
    </svg>
  );
};

const PsaWordmark = () => (
  <WordmarkSvg text="PSA" fill="#ffffff" />
);

const BgsWordmark = () => (
  <WordmarkSvg
    text="BGS"
    gradientId="bgs-gold-gradient"
    gradientStops={[
      { offset: '0%', color: '#fef3c7' },
      { offset: '45%', color: '#d4af37' },
      { offset: '100%', color: '#8b6914' },
    ]}
  />
);

const CgcWordmark = () => (
  <WordmarkSvg
    text="CGC"
    gradientId="cgc-gold-gradient"
    gradientStops={[
      { offset: '0%', color: '#fef3c7' },
      { offset: '50%', color: '#fbbf24' },
      { offset: '100%', color: '#b45309' },
    ]}
  />
);

const SgcWordmark = () => (
  <WordmarkSvg text="SGC" fill="#ffffff" />
);

const AceWordmark = () => (
  <WordmarkSvg text="ACE" fill="#ffffff" />
);

const GenericWordmark = ({ text }) => (
  <WordmarkSvg text={text || '??'} fill="#ffffff" />
);

// ---------- Brand color schemes ----------
// Each company's slab label has a distinctive visual identity; we mirror
// that here so the badges feel like real grading labels rather than
// generic colored rectangles.

const COMPANY_STYLES = {
  PSA: {
    Wordmark: PsaWordmark,
    container: 'bg-gradient-to-b from-red-600 to-red-700 border-red-800',
    gradePill: 'bg-white text-red-700',
  },
  BGS: {
    Wordmark: BgsWordmark,
    container: 'bg-gradient-to-b from-neutral-900 to-black border-amber-600',
    gradePill: 'bg-amber-400 text-black',
  },
  CGC: {
    Wordmark: CgcWordmark,
    container: 'bg-gradient-to-b from-red-700 to-red-900 border-amber-500',
    gradePill: 'bg-amber-300 text-red-900',
  },
  SGC: {
    Wordmark: SgcWordmark,
    container: 'bg-gradient-to-b from-emerald-700 to-emerald-900 border-emerald-900',
    gradePill: 'bg-white text-emerald-800',
  },
  ACE: {
    Wordmark: AceWordmark,
    container: 'bg-gradient-to-b from-purple-600 to-purple-800 border-purple-900',
    gradePill: 'bg-white text-purple-700',
  },
};

const getStyle = (company) =>
  COMPANY_STYLES[company] || {
    Wordmark: () => <GenericWordmark text={company} />,
    container: 'bg-gradient-to-b from-gray-600 to-gray-700 border-gray-800',
    gradePill: 'bg-white text-gray-800',
  };

// ---------- Public components ----------

/**
 * Compact inline badge used in lists/tables. Backwards-compatible with the
 * previous text-only implementation: same props, drop-in replacement.
 */
export const GradingBadge = ({ company, grade, className = '' }) => {
  const { Wordmark, container, gradePill } = getStyle(company);

  return (
    <span
      className={`inline-flex items-stretch gap-0 rounded border shadow-sm overflow-hidden ${container} ${className}`}
      title={`${company || 'Graded'}${grade !== undefined && grade !== null && grade !== '' ? ` ${grade}` : ''}`}
    >
      <span className="flex items-center px-1.5 py-0.5 h-[20px]">
        <Wordmark />
      </span>
      {grade !== undefined && grade !== null && grade !== '' && (
        <span
          className={`flex items-center justify-center px-1.5 text-[11px] font-black leading-none ${gradePill}`}
        >
          {grade}
        </span>
      )}
    </span>
  );
};

/**
 * Larger sizeable variant. Same brand-styled rendering, sized via the `size`
 * prop. Used in modals / detail views.
 */
export const GradingCompanyLogo = ({ company, size = 'sm', grade, showText = true }) => {
  const { Wordmark, container, gradePill } = getStyle(company);

  const heightMap = {
    xs: 'h-4',
    sm: 'h-5',
    md: 'h-6',
    lg: 'h-7',
  };
  const textSizeMap = {
    xs: 'text-[10px]',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <span
      className={`inline-flex items-stretch rounded border shadow-sm overflow-hidden ${container} ${heightMap[size] || heightMap.sm}`}
      title={`${company || 'Graded'}${grade ? ` ${grade}` : ''}`}
    >
      <span className="flex items-center px-2">
        <Wordmark />
      </span>
      {showText && grade !== undefined && grade !== null && grade !== '' && (
        <span
          className={`flex items-center justify-center px-2 font-black leading-none ${gradePill} ${textSizeMap[size] || textSizeMap.sm}`}
        >
          {grade}
        </span>
      )}
    </span>
  );
};

export default GradingCompanyLogo;
