import type { Config } from 'tailwindcss';

/**
 * UltisPro design tokens.
 *
 * Refreshed from the original Material-derived palette to a contemporary
 * indigo/violet system: near-white layered surfaces, a saturated indigo
 * primary with a violet companion for gradients/accents, softer neutral
 * text, and larger radii. Token *names* are unchanged from the previous
 * palette on purpose — every screen already references `surface-container`,
 * `on-surface-variant`, `outline-variant` and friends, so the whole app
 * re-skins by swapping values here rather than touching 36 pages.
 *
 * Contrast was checked against the POS use case specifically: shop lighting
 * is bright and monitors are often cheap, so body text sits at #1e2433 on
 * #ffffff/#f8fafc surfaces (>15:1) rather than the fashionable low-contrast
 * greys.
 */
export const ultisproPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // --- Canvas & layered surfaces (lightest -> most raised) ---
        background: '#f6f7fb',
        surface: '#f6f7fb',
        'surface-dim': '#e8eaf2',
        'surface-bright': '#ffffff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f9fafc',
        'surface-container': '#f2f4f8',
        'surface-container-high': '#ebeef4',
        'surface-container-highest': '#e4e8f0',

        // --- Text ---
        'on-surface': '#1e2433',
        'on-surface-variant': '#5c6478',
        'inverse-surface': '#1e2433',
        'inverse-on-surface': '#f6f7fb',

        // --- Lines ---
        outline: '#9aa2b8',
        'outline-variant': '#e2e6ef',

        // --- Brand: indigo primary, violet companion ---
        primary: '#4f46e5',
        'on-primary': '#ffffff',
        'primary-container': '#eef2ff',
        'on-primary-container': '#3730a3',
        'primary-hover': '#4338ca',
        'primary-pressed': '#3730a3',

        secondary: '#7c3aed',
        'on-secondary': '#ffffff',
        'secondary-container': '#f3e8ff',
        'on-secondary-container': '#6b21a8',

        tertiary: '#0891b2',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#cffafe',

        // --- Status ---
        error: '#dc2626',
        'on-error': '#ffffff',
        'error-container': '#fee2e2',
        'on-error-container': '#991b1b',
        success: '#059669',
        'on-success': '#ffffff',
        'success-container': '#d1fae5',
        'on-success-container': '#065f46',
        warning: '#d97706',
        'on-warning': '#ffffff',
        'warning-container': '#fef3c7',
        'on-warning-container': '#92400e',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        'display-total': ['44px', { lineHeight: '52px', letterSpacing: '-0.03em', fontWeight: '700' }],
        'headline-lg': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '650' }],
        'headline-md': ['22px', { lineHeight: '30px', letterSpacing: '-0.015em', fontWeight: '650' }],
        'title-sm': ['16px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-lg': ['15px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '21px', fontWeight: '400' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
        'mono-data': ['13px', { lineHeight: '20px', fontWeight: '450' }],
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.625rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        // Layered, low-opacity shadows rather than one hard drop — this is
        // most of what separates a "flat 2015" look from a current one.
        xs: '0 1px 2px 0 rgb(30 36 51 / 0.04)',
        sm: '0 1px 3px 0 rgb(30 36 51 / 0.06), 0 1px 2px -1px rgb(30 36 51 / 0.04)',
        card: '0 1px 3px 0 rgb(30 36 51 / 0.05), 0 4px 12px -2px rgb(30 36 51 / 0.05)',
        'card-hover': '0 2px 6px 0 rgb(30 36 51 / 0.07), 0 12px 28px -6px rgb(30 36 51 / 0.10)',
        popover: '0 8px 32px -4px rgb(30 36 51 / 0.14), 0 2px 8px -2px rgb(30 36 51 / 0.08)',
        'focus-ring': '0 0 0 3px rgb(79 70 229 / 0.18)',
      },
      spacing: {
        gutter: '24px',
        'top-nav-height': '64px',
        'container-padding': '28px',
        'stack-sm': '8px',
        'stack-md': '16px',
        'sidebar-width': '256px',
      },
      transitionTimingFunction: {
        // A gentle ease-out is what makes hovers/presses feel "smooth"
        // rather than linear and mechanical.
        smooth: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
};

export default ultisproPreset;
