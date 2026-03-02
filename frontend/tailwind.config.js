/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#07101c',
          900: '#0b1220',
          800: '#0f1929',
          700: '#152035',
          600: '#1a2a42',
          500: '#1e3055',
        },
        indigo: {
          DEFAULT: '#6366f1',
          light:   '#818cf8',
          subtle:  'rgba(99,102,241,0.08)',
          border:  'rgba(99,102,241,0.25)',
        },
      },
      boxShadow: {
        'card':       '0 1px 3px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.08)',
        'card-lg':    '0 4px 24px rgba(0,0,0,.16), 0 16px 48px rgba(0,0,0,.12)',
        'indigo-sm':  '0 0 12px rgba(99,102,241,0.2)',
        'indigo':     '0 0 24px rgba(99,102,241,0.25)',
        'indigo-glow':'0 4px 24px rgba(99,102,241,0.35)',
        'document':   '0 4px 24px rgba(0,0,0,.12)',
        'dark-doc':   '0 8px 48px rgba(0,0,0,.6)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        word:    ['Calibri', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      backgroundImage: {
        'indigo-gradient': 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%)',
        'navy-gradient':   'radial-gradient(ellipse at 60% 0%, rgba(99,102,241,0.06) 0%, transparent 65%)',
      },
    },
  },
  plugins: [],
};
