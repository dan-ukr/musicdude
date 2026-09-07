/**
 * Dark-only for v1 (placeholder palette — will be revised).
 * Token structure mirrors WeatherDude's ColorPalette so a light theme can be
 * added later without touching screens.
 */
export type ColorPalette = {
  BG: string;
  SURFACE: string;
  SURFACE_2: string;
  INK: string;
  MUTED: string;
  ACCENT: string;
  ACCENT_SOFT: string;
  CYAN: string;
  AMBER: string;
  DANGER: string;
  INPUT_BG: string;
  INPUT_BORDER: string;
  TAB_BAR: string;
  TAB_ACTIVE_TEXT: string;
  TAB_INACTIVE_TEXT: string;
  CARD_BORDER: string;
  DIVIDER: string;
};

export const DARK: ColorPalette = {
  BG: '#0A0A0F',
  SURFACE: '#141420',
  SURFACE_2: '#1C1C2E',
  INK: '#FFFFFF',
  MUTED: 'rgba(255,255,255,0.55)',
  ACCENT: '#8B5CF6',
  ACCENT_SOFT: 'rgba(139,92,246,0.18)',
  CYAN: '#22D3EE',
  AMBER: '#F5B950',
  DANGER: '#FF6B6B',
  INPUT_BG: '#141420',
  INPUT_BORDER: 'rgba(139,92,246,0.4)',
  TAB_BAR: '#101018',
  TAB_ACTIVE_TEXT: '#FFFFFF',
  TAB_INACTIVE_TEXT: 'rgba(255,255,255,0.45)',
  CARD_BORDER: 'rgba(139,92,246,0.22)',
  DIVIDER: 'rgba(255,255,255,0.08)',
};

/** Active palette. v1 is dark-only. */
export const C = DARK;
