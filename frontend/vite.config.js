// EcoTrack/frontend/vite.config.js
// Vite is the build tool. It runs the fast dev server while you code, and
// bundles everything into the dist/ folder when you deploy.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    // The backend .env already allows http://localhost:5173 through CORS,
    // so keep this port unless you change the backend too
    port: 5173,
    // Fail loudly instead of silently moving to port 5174, which would then
    // be blocked by CORS and look like a mysterious network error
    strictPort: true,
    // Set this to true if you would rather the browser opened by itself
    // every time you run "npm run dev"
    open: false,
  },

  build: {
    // Firebase Hosting is configured to publish this folder
    outDir: 'dist',
    sourcemap: false,

    rollupOptions: {
      output: {
        // Splitting the big libraries into separate files means the browser can
        // cache them. Your app code changes often; Chart.js and Firebase do not.
        //
        // The function form is used rather than a plain object because it only
        // ever sees modules that are actually part of the build. Listing a
        // library that nothing imports yet would break the build.
        manualChunks(id) {
          // id is the full path of the module being bundled
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/')) {
            return 'vendor-react';
          }
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'vendor-firebase';
          }
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
            return 'vendor-charts';
          }
          if (id.includes('framer-motion') || id.includes('gsap')) {
            return 'vendor-motion';
          }
          if (id.includes('tsparticles')) {
            return 'vendor-particles';
          }

          // Everything else goes into the default vendor chunk
          return undefined;
        },
      },
    },
  },
});
