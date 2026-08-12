import { build, context } from 'esbuild'

const watch = process.argv.includes('--watch')

/**
 * `vscode` is provided by the extension host, never bundled. Everything else the
 * extension needs is either a Node built-in or our own source — the manifest carries
 * no runtime dependency, and this bundle is what makes that verifiable.
 */
const options = {
  entryPoints: ['src/extension.mts'],
  outfile: 'dist/extension.js',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  sourcemap: watch,
  minify: !watch,
  logLevel: 'info',
}

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
} else {
  await build(options)
}
