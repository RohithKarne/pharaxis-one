/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        qms: {
          ink: '#0D2024',
          teal: '#0F766E',
          mint: '#7DD3C5',
          amber: '#C97718',
          paper: '#F5F9F8'
        }
      },
      boxShadow: {
        aura: '0 16px 40px rgba(15, 118, 110, 0.18)'
      }
    }
  },
  plugins: []
};
