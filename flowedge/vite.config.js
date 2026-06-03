import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/quotes': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => {
          const symbols = new URL(path, 'http://localhost').searchParams.get('symbols') || '';
          return `/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,regularMarketDayHigh,regularMarketDayLow,marketCap,fiftyTwoWeekHigh,shortName`;
        },
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    },
  },
})
