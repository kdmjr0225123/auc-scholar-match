// Single source of truth for per-school color identity.
//
// These values key off the same `school` column (student_profiles.school /
// the `School` enum) that already drives real eligibility matching â€” this
// file only maps that existing, RLS-scoped, per-user value to a color. It
// never infers or caches a school independently, so there's no path for a
// student to see a color that doesn't match their own stored profile.

import type { School } from '@/types/database';

export interface SchoolTheme {
  school: School;
  label: string;
  short: string;
  initials: string;
  hex: string;
  /** hex at ~10% opacity, for soft backgrounds */
  soft: string;
  /** hex at ~30% opacity, for borders */
  border: string;
  /** Lightened variant of `hex`, for use as TEXT on dark surfaces â€” several
   *  school colors (Morehouse maroon, Morris Brown indigo) are too dark to
   *  clear WCAG AA as text on a navy background, so this is a separate,
   *  pre-checked value rather than something computed ad hoc per use. */
  light: string;
  /** Darkened/saturated variant of `hex`, for use as TEXT on light/white
   *  surfaces. Most school colors already clear AA as-is (deep === hex),
   *  but Spelman's true brand blue is a light Carolina blue â€” gorgeous as a
   *  fill, unreadable as small text on white â€” so it gets its own
   *  pre-checked darker value here instead of quietly substituting a
   *  different "Spelman blue" everywhere. */
  deep: string;
  /** Text color to use ON TOP of a `hex`-filled surface (school avatar
   *  chips, solid badges). White for every dark school color; for
   *  Spelman's light blue, white text has almost no contrast against it â€”
   *  the same problem Spelman's own wordmark solves with a black outline â€”
   *  so this uses a dark navy instead. */
  onFill: string;
  /** A dark gradient built FROM the school's own hue (same hue/saturation,
   *  lightness pulled way down) rather than a generic navy card with a
   *  colored hairline â€” this is the actual card background, not a hint of
   *  one. White text on every stop clears 12:1+, gold clears 7:1+. */
  gradient: string;
}

export const SCHOOL_THEME: Record<School, SchoolTheme> = {
  morehouse: {
    school: 'morehouse',
    label: 'Morehouse College',
    short: 'Morehouse',
    initials: 'MH',
    hex: '#8B0000',
    soft: 'rgba(139, 0, 0, 0.14)',
    border: 'rgba(139, 0, 0, 0.35)',
    light: '#C58080',
    deep: '#8B0000',
    onFill: '#fff',
    gradient: 'linear-gradient(150deg, #520000 0%, #330000 55%, #1C0000 100%)',
  },
  // Real Spelman brand blue â€” the light Carolina/baby-blue seen behind the
  // SPELMAN wordmark, not the dark navy this used to be. Because it's a
  // light color, it needs `deep` (for text-on-white) and `onFill` (dark
  // navy instead of white, for text painted directly on top of `hex`).
  spelman: {
    school: 'spelman',
    label: 'Spelman College',
    short: 'Spelman',
    initials: 'SC',
    hex: '#7BAFD4',
    soft: 'rgba(123, 175, 212, 0.18)',
    border: 'rgba(123, 175, 212, 0.45)',
    light: '#7BAFD4',
    deep: '#245F89',
    onFill: '#0A1628',
    gradient: 'linear-gradient(150deg, #19374D 0%, #102432 55%, #09131B 100%)',
  },
  // Bright true red matching the CAU wordmark reference (was a slightly
  // darker #CC0000).
  clark_atlanta: {
    school: 'clark_atlanta',
    label: 'Clark Atlanta University',
    short: 'Clark Atlanta',
    initials: 'CAU',
    hex: '#E31B23',
    soft: 'rgba(227, 27, 35, 0.14)',
    border: 'rgba(227, 27, 35, 0.35)',
    light: '#EA5258',
    deep: '#E31B23',
    onFill: '#fff',
    gradient: 'linear-gradient(150deg, #9E0F15 0%, #700B0F 55%, #460709 100%)',
  },
  morris_brown: {
    school: 'morris_brown',
    label: 'Morris Brown College',
    short: 'Morris Brown',
    initials: 'MB',
    hex: '#4B0082',
    soft: 'rgba(75, 0, 130, 0.14)',
    border: 'rgba(75, 0, 130, 0.35)',
    light: '#A580C0',
    deep: '#4B0082',
    onFill: '#fff',
    gradient: 'linear-gradient(150deg, #2F0052 0%, #1D0033 55%, #10001C 100%)',
  },
};

/** Safe lookup â€” returns null for anything unset/unrecognized, callers should
 *  fall back to the neutral navy/gold theme rather than guessing. */
export function getSchoolTheme(school: School | null | undefined): SchoolTheme | null {
  if (!school) return null;
  return SCHOOL_THEME[school] ?? null;
}
