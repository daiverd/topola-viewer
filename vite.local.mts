// Local development config: runs topola-viewer against the sibling ../topola
// checkout's TypeScript source instead of the published npm package.
// Usage (from topola-viewer/):  npx vite --config vite.local.mts
import {existsSync, readFileSync, statSync} from 'fs';
import {basename, resolve} from 'path';
import {defineConfig, mergeConfig, Plugin} from 'vite';
import baseConfig from './vite.config.mts';

const topolaSrc = resolve(__dirname, '../topola/src');
const sampleDirs = [
  resolve(__dirname, '../samples'),
  resolve(__dirname, '../topola/demo/data'),
];

/**
 * Serves sample GEDCOM/JSON files at /samples/<name>, looking first in
 * ../samples (our own test trees) and then in topola's demo data, so they can
 * be loaded with  #/view?url=/samples/family.ged&handleCors=false
 */
function serveSamples(): Plugin {
  return {
    name: 'serve-samples',
    configureServer(server) {
      server.middlewares.use('/samples', (req, res, next) => {
        const name = basename(
          decodeURIComponent((req.url || '').split('?')[0]),
        );
        const file = sampleDirs
          .map((dir) => resolve(dir, name))
          .find((f) => existsSync(f) && statSync(f).isFile());
        if (!file) return next();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(file));
      });
    },
  };
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [serveSamples()],
    resolve: {
      alias: [{find: /^topola$/, replacement: resolve(topolaSrc, 'index.ts')}],
      // Make sure the viewer and topola share one copy of each D3 module, so
      // d3-transition patches the same d3-selection prototype both use.
      dedupe: [
        'd3-array',
        'd3-hierarchy',
        'd3-selection',
        'd3-transition',
        'd3-interpolate',
      ],
    },
    optimizeDeps: {
      // topola is source now, not a prebundled dependency.
      exclude: ['topola'],
    },
    server: {
      fs: {allow: [resolve(__dirname, '..')]},
      watch: {
        // Pick up edits in the sibling checkout.
        ignored: ['!**/topola/src/**'],
      },
    },
  }),
);
