const path = require('path');
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [path.join(__dirname, '..', 'src', 'main.js')],
  bundle: true,
  outfile: path.join(__dirname, '..', 'dist', 'bundle.js'),
  format: 'iife',
  target: 'chrome120',
  platform: 'browser',
  sourcemap: watch ? 'inline' : false,
  minify: false,
  logLevel: 'info',
  loader: { '.svg': 'dataurl' }
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[build] watching...');
  } else {
    await esbuild.build(options);
    console.log('[build] done');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
