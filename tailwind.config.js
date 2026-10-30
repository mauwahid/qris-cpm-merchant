/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4fa', 100: '#dae3f2', 200: '#b6c7e4', 300: '#8aa3d0', 400: '#5d7cb8',
          500: '#3e5c9c', 600: '#2f4780', 700: '#243766', 800: '#1a2850', 900: '#111c3a', 950: '#0a1128',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
