import React from 'react';

/**
 * Displays the logo for a grading company
 * Falls back to styled text if logo isn't available
 */

// Logo URLs - using CDN/public URLs for grading company logos
const GRADING_COMPANY_LOGOS = {
  PSA: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Professional_Sports_Authenticator_logo.svg/512px-Professional_Sports_Authenticator_logo.svg.png',
  BGS: 'https://www.beckett.com/grading/images/bgs-logo-small.png',
  CGC: 'https://www.cgccomics.com/images/cgc-logo.svg',
  SGC: 'https://www.sgccard.com/wp-content/uploads/2021/03/SGC-Logo-Shield.png',
  ACE: 'https://www.acegrading.com/cdn/shop/files/Ace_Grading_-_Brandmark_Logo_-_Full_Color.svg',
};

// Fallback colors for each company (used for styled badges when logo unavailable)
const GRADING_COMPANY_COLORS = {
  PSA: { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700' },
  BGS: { bg: 'bg-black', text: 'text-yellow-400', border: 'border-yellow-500' },
  CGC: { bg: 'bg-green-600', text: 'text-white', border: 'border-green-700' },
  SGC: { bg: 'bg-blue-800', text: 'text-white', border: 'border-blue-900' },
  ACE: { bg: 'bg-purple-600', text: 'text-white', border: 'border-purple-700' },
  Other: { bg: 'bg-gray-600', text: 'text-white', border: 'border-gray-700' },
};

export const GradingCompanyLogo = ({ company, size = 'sm', showText = true, grade }) => {
  const sizeClasses = {
    xs: 'h-3 w-auto',
    sm: 'h-4 w-auto',
    md: 'h-5 w-auto',
    lg: 'h-6 w-auto',
  };

  const badgeSizes = {
    xs: 'text-[10px] px-1 py-0.5',
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-2.5 py-1',
  };

  const colors = GRADING_COMPANY_COLORS[company] || GRADING_COMPANY_COLORS.Other;
  const logoUrl = GRADING_COMPANY_LOGOS[company];

  // Use a simple styled badge instead of external images (more reliable)
  return (
    <span 
      className={`inline-flex items-center gap-1 font-bold rounded ${colors.bg} ${colors.text} ${colors.border} border ${badgeSizes[size]}`}
      title={`${company}${grade ? ` ${grade}` : ''}`}
    >
      <span className="font-black tracking-tight">{company}</span>
      {showText && grade && <span className="font-semibold">{grade}</span>}
    </span>
  );
};

/**
 * Simple inline badge version for compact displays
 */
export const GradingBadge = ({ company, grade, className = '' }) => {
  const colors = GRADING_COMPANY_COLORS[company] || GRADING_COMPANY_COLORS.Other;
  
  return (
    <span 
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border ${colors.bg} ${colors.text} ${colors.border} whitespace-nowrap ${className}`}
    >
      <span className="font-black">{company}</span>
      <span>{grade}</span>
    </span>
  );
};

export default GradingCompanyLogo;

