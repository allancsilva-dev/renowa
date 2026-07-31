import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `shared` compila para CommonJS (o backend Nest consome assim), e o
      // `index.js` reexporta tudo via `__exportStar`. O Rollup não enxerga nomes
      // através desse padrão: `import { formatRoleName } from '@renowa/shared'`
      // quebra no build de produção, embora `tsc` e o Vitest resolvam. Apontar
      // para a fonte TS resolve sem duplicar build nem mexer no consumo do
      // backend. A checagem de tipos segue usando `shared/dist/*.d.ts`.
      '@renowa/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
