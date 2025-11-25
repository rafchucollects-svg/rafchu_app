import { Star, Award, Globe } from 'lucide-react';

/**
 * CardBadges - v2.1
 * Displays variant, graded, and language indicators for cards
 */

const VARIANT_LABELS = {
  'regular-holo': 'Holo',
  'reverse-holo': 'Reverse',
  '1st-edition': '1st Ed',
  'shadowless': 'Shadowless',
  'unlimited': 'Unlimited',
  'promo': 'Promo',
  'full-art': 'Full Art',
  'secret-rare': 'Secret',
  'alt-art': 'Alt Art',
};

const LANGUAGE_FLAGS = {
  'English': '🇺🇸',
  'Japanese': '🇯🇵',
  'French': '🇫🇷',
  'German': '🇩🇪',
  'Spanish': '🇪🇸',
  'Italian': '🇮🇹',
  'Portuguese': '🇵🇹',
  'Korean': '🇰🇷',
  'Chinese': '🇨🇳',
};

export function CardBadges({ item, size = 'sm' }) {
  const badges = [];

  // Language badge
  if (item.language && item.language !== 'English') {
    const flag = LANGUAGE_FLAGS[item.language] || '🌍';
    badges.push({
      key: 'language',
      icon: <Globe className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />,
      label: `${flag} ${item.language}`,
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      tooltip: `Language: ${item.language}`,
    });
  }

  // Variant badge
  if (item.variant) {
    const label = VARIANT_LABELS[item.variant] || item.variant;
    badges.push({
      key: 'variant',
      icon: <Star className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />,
      label: label,
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      tooltip: `Variant: ${label}`,
    });
  }

  // Graded badge
  if (item.isGraded && item.gradingCompany && item.grade) {
    badges.push({
      key: 'graded',
      icon: <Award className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />,
      label: `${item.gradingCompany} ${item.grade}`,
      color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      tooltip: `Graded: ${item.gradingCompany} ${item.grade}`,
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map(badge => (
        <span
          key={badge.key}
          title={badge.tooltip}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}
        >
          {badge.icon}
          {badge.label}
        </span>
      ))}
    </div>
  );
}

/**
 * CardPriceInfo - v2.1
 * Displays price with support for manual overrides, graded prices, etc.
 */
export function CardPriceInfo({ item, formatPrice }) {
  // Priority: manual price > graded price > calculated price
  const displayPrice = item.manualPrice || item.gradedPrice || item.calculatedSuggestedPrice || 0;
  const hasOverride = Boolean(item.manualPrice);
  const isGradedPrice = Boolean(item.isGraded && item.gradedPrice && !item.manualPrice);

  return (
    <div className="text-sm">
      <div className="font-semibold text-green-600">
        {formatPrice(displayPrice)}
        {hasOverride && (
          <span className="ml-1 text-xs text-gray-500" title="Manual price override">
            (Manual)
          </span>
        )}
        {isGradedPrice && (
          <span className="ml-1 text-xs text-gray-500" title="Graded card price">
            (Graded)
          </span>
        )}
      </div>
      {item.notes && (
        <div className="text-xs text-gray-500 mt-1 italic">
          {item.notes}
        </div>
      )}
    </div>
  );
}

/**
 * GradedCardInfo - v2.1
 * Detailed graded card information for expanded views
 */
export function GradedCardInfo({ item, formatPrice }) {
  if (!item.isGraded) return null;

  return (
    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
      <div className="flex items-center gap-2 mb-1">
        <Award className="h-4 w-4 text-yellow-600" />
        <span className="font-semibold text-yellow-700">Graded Card</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-600">Company:</span>
          <span className="ml-1 font-medium">{item.gradingCompany}</span>
        </div>
        <div>
          <span className="text-gray-600">Grade:</span>
          <span className="ml-1 font-medium">{item.grade}</span>
        </div>
        {item.gradedPrice && (
          <div className="col-span-2">
            <span className="text-gray-600">Graded Value:</span>
            <span className="ml-1 font-medium text-green-600">
              {formatPrice(item.gradedPrice)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * VariantInfo - v2.1
 * Detailed variant information for expanded views
 */
export function VariantInfo({ item }) {
  if (!item.variant) return null;

  const label = VARIANT_LABELS[item.variant] || item.variant;

  return (
    <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded-md text-sm">
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 text-purple-600" />
        <span className="font-semibold text-purple-700">Variant: {label}</span>
      </div>
      {item.variantSource === 'user-specified' && (
        <p className="text-xs text-gray-600 mt-1">
          User-specified variant (not from API)
        </p>
      )}
    </div>
  );
}










