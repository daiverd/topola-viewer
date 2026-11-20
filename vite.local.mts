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

const sample = '#/view?url=/samples/a11y-test.ged&handleCors=false&indi=I1';
const startLinks: Array<[string, string]> = [
  ['Hourglass chart, HTML tree mode', `/${sample}`],
  ['Hourglass chart, SVG mode', `/${sample}&a11y=svg`],
  ['Hourglass chart, HTML tree mode, no side panel', `/${sample}&sidePanel=false`],
  ['Hourglass chart, SVG mode, no side panel', `/${sample}&a11y=svg&sidePanel=false`],
  ['All relatives chart (no accessibility work yet)', `/${sample}&view=relatives`],
  ['Fancy tree (no accessibility work yet)', `/${sample}&view=fancy`],
  ['Donatso chart (no accessibility work yet)', `/${sample}&view=donatso`],
];

/** A start page at /start linking to each test configuration. */
function startPage(): Plugin {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Chart accessibility prototype</title></head>
<body><main>
<h1>Chart accessibility prototype</h1>
<p>Test tree: Ada Kowal and family (samples/a11y-test.ged).
Each link opens a fresh page, so switching modes needs no reload.</p>
<ul>
${startLinks.map(([text, href]) => `<li><a href="${href.replace(/&/g, '&amp;')}">${text}</a></li>`).join('\n')}
</ul>
<p>In the chart, press H for the list of keys.</p>
</main></body></html>`;
  return {
    name: 'start-page',
    configureServer(server) {
      server.middlewares.use('/start', (_req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
  };
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [serveSamples(), startPage()],
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
