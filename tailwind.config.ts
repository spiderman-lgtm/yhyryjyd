import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0f172a', soft: '#334155', mute: '#64748b' },
        brand: { DEFAULT: '#ea580c', dark: '#c2410c', light: '#fff7ed' },
        deal: { DEFAULT: '#16a34a', light: '#f0fdf4' },
      },
    },
  },
  plugins: [],
};

export default config;
