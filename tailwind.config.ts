import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        xs: '475px',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        border: 'hsl(var(--border))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      fontFamily: {
        /* Prefer system variable fonts — zero network cost, excellent quality */
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'Inter',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          '"SF Mono"',
          '"Cascadia Code"',
          '"Fira Code"',
          'monospace',
        ],
      },
      /* Radius scale — one source of truth, matches CSS vars */
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 3px)',
        sm: 'calc(var(--radius) - 6px)',
        pill: '9999px',
      },
      /* Typography scale */
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs:  ['0.75rem',   { lineHeight: '1.125rem' }],
        sm:  ['0.875rem',  { lineHeight: '1.35rem' }],
        base:['1rem',      { lineHeight: '1.6rem' }],
        lg:  ['1.125rem',  { lineHeight: '1.7rem' }],
        xl:  ['1.25rem',   { lineHeight: '1.75rem' }],
        '2xl':['1.5rem',   { lineHeight: '2rem', letterSpacing: '-0.02em' }],
        '3xl':['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em' }],
        '4xl':['2.25rem',  { lineHeight: '2.5rem',  letterSpacing: '-0.03em' }],
        '5xl':['3rem',     { lineHeight: '1',        letterSpacing: '-0.035em' }],
      },
      /* Elevation / shadow scale — three tiers */
      boxShadow: {
        sm:  'var(--shadow-sm, 0 1px 3px 0 rgb(0 0 0 / 0.08))',
        md:  'var(--shadow-md, 0 4px 16px -4px rgb(0 0 0 / 0.12))',
        lg:  'var(--shadow-lg, 0 12px 40px -12px rgb(0 0 0 / 0.18))',
        /* Brand glow variants */
        'glow-primary': '0 0 24px -6px hsl(var(--primary) / 0.50)',
        'glow-accent':  '0 0 24px -6px hsl(var(--accent) / 0.50)',
      },
      /* Keyframes — animation library (prefer CSS animations for perf) */
      keyframes: {
        pulseGlow: {
          '0%,100%': { opacity: '1', filter: 'drop-shadow(0 0 4px currentColor)' },
          '50%':     { opacity: '0.6', filter: 'drop-shadow(0 0 11px currentColor)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.94) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        toastIn: {
          '0%':   { opacity: '0', transform: 'translateX(14px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        spinSlow: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        livePulse: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%':     { opacity: '0.4', transform: 'scale(1.6)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        popIn: {
          '0%':   { opacity: '0', transform: 'scale(0.88)' },
          '60%':  { transform: 'scale(1.04)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        fadeOut: {
          '0%':   { opacity: '1' },
          '100%': { opacity: '0', pointerEvents: 'none' },
        },
      },
      animation: {
        pulseGlow:    'pulseGlow 2.2s ease-in-out infinite',
        fadeIn:       'fadeIn 240ms ease-out',
        fadeUp:       'fadeUp 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        scaleIn:      'scaleIn 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        toastIn:      'toastIn 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        spinSlow:     'spinSlow 1.5s linear infinite',
        livePulse:    'livePulse 1.8s ease-in-out infinite',
        shimmer:      'shimmer 2s linear infinite',
        slideDown:    'slideDown 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        slideInRight: 'slideInRight 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        slideInLeft:  'slideInLeft 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        popIn:        'popIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        fadeOut:      'fadeOut 600ms ease-in forwards',
      },
    },
  },
  plugins: [],
} satisfies Config;
