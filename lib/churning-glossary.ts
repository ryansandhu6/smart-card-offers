// lib/churning-glossary.ts
// Abbreviations used in the churningcanada community README.

export const CHURNING_GLOSSARY: Record<string, string> = {
  AC:    'Air Canada',
  AF:    'Annual Fee',
  AM:    'Air Miles',
  CCG:   'CreditCardGenius',
  CPP:   'Cents Per Point',
  FCT:   'First Class Travel',
  FF:    'Frugal Flyer',
  FHR:   'Fine Hotels & Resorts',
  FW:    'FlyerWorld',
  FYF:   'First Year Free',
  GCR:   'GreatCanadianRebates',
  MC:    'Mastercard',
  MR:    'Amex Membership Rewards',
  MSR:   'Minimum Spend Requirement',
  NEXUS: 'NEXUS Trusted Traveller Program',
  NLL:   'No Lifetime Language',
  PP:    'Priority Pass',
  SUB:   'Sign Up Bonus',
  VI:    'Visa Infinite',
  WE:    'World Elite',
  WJ:    'WestJet Dollars',
  YMMV:  'Your Mileage May Vary',
  YYZ:   'Toronto Pearson Airport',
}

// Abbreviations that appear in welcome-bonus text and should be expanded for
// human-readable headlines.  Intentionally excludes portal names (CCG, FF, FW, GCR)
// and card-type shorthands (MC, VI, WE) that don't belong in bonus copy.
const BONUS_EXPAND = new Set(['MR', 'AM', 'WJ', 'SUB', 'PP', 'NLL'])

/**
 * Expand reward-program abbreviations in a welcome-bonus string.
 * Also expands lowercase "pts" → "Points" and numeric K-suffixes (30K → 30,000).
 *
 * "22,000 MR"       → "22,000 Amex Membership Rewards"
 * "3,000 AM"        → "3,000 Air Miles"
 * "60,000 pts WJ"   → "60,000 Points WestJet Dollars"
 * "30K pts"         → "30,000 Points"
 */
export function expandBonusAbbreviations(text: string): string {
  return text
    // Expand numeric K-suffix first so later passes see the full number
    .replace(/\b(\d+(?:\.\d+)?)[Kk]\b/g, (_, n) =>
      parseInt((parseFloat(n) * 1000).toString()).toLocaleString('en-CA')
    )
    // Expand uppercase reward-program abbreviations
    .replace(/\b([A-Z]{2,5})\b/g, (match) =>
      BONUS_EXPAND.has(match) ? (CHURNING_GLOSSARY[match] ?? match) : match
    )
    // Expand lowercase "pts" → "Points"
    .replace(/\bpts\b/g, 'Points')
}
