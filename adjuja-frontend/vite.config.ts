import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

// Ressources de pdf.js servies sous /pdfjs/ (2026-09-27). pdf.js 6 decode
// certaines images (JBIG2, fax CCITT des scans, JPEG 2000) par des modules
// WebAssembly et charge polices standard, CMaps et profils ICC a la demande :
// sans ces URL, les couches d'image d'un CPS scanne etaient ignorees et
// l'apercu montrait une page presque blanche. En dev elles sont servies depuis
// node_modules, au build copiees dans dist/pdfjs/ ; aucune dependance ajoutee.
const PDFJS_DIRS = ['wasm', 'cmaps', 'standard_fonts', 'iccs'];
const PDFJS_ROOT = join(__dirname, 'node_modules', 'pdfjs-dist');
const MIME: Record<string, string> = { '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.icc': 'application/vnd.iccprofile' };

function pdfjsAssets(): Plugin {
  return {
    name: 'adjuja-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0])).replace(/^[\\/]+/, '');
        if (!PDFJS_DIRS.includes(rel.split(/[\\/]/)[0]) || rel.includes('..')) return next();
        const file = join(PDFJS_ROOT, rel);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        const ext = file.slice(file.lastIndexOf('.'));
        res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const dir of PDFJS_DIRS) {
        cpSync(join(PDFJS_ROOT, dir), join(__dirname, 'dist', 'pdfjs', dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api':     { target: process.env.VITE_API_TARGET ?? 'http://localhost:8000', changeOrigin: true },
      '/health':  { target: process.env.VITE_API_TARGET ?? 'http://localhost:8000', changeOrigin: true },
      '/watcher': {
        target: process.env.VITE_WATCHER_TARGET ?? 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/watcher/, ''),
      },
      '/notifications': {
        target: process.env.VITE_NOTIFICATIONS_TARGET ?? 'http://localhost:8002',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/notifications/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
