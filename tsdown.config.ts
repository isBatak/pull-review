import type { UserConfig } from 'tsdown'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'
import { ownSourceMaps } from './build/own-source-maps.ts'
import pkg from './package.json' with { type: 'json' }

const shared: UserConfig = {
  format: 'esm',
  outDir: 'out',
  clean: false,
  sourcemap: true,
  plugins: [ownSourceMaps(fileURLToPath(new URL('.', import.meta.url)))],
  deps: { alwaysBundle: [/.*/] },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
}

export default defineConfig([
  { ...shared, entry: { cli: 'src/server/cli.ts' }, platform: 'node', target: 'node20' },
  { ...shared, entry: { loader: 'src/server/cli-loader.ts' }, platform: 'node', target: 'node20' },
  { ...shared, entry: { main: 'src/tiny/main.ts' }, outDir: 'out/app-backend', clean: true, platform: 'browser', target: 'es2023' },
])
