import type { UserConfig } from 'tsdown'
import { defineConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }

const shared: UserConfig = {
  format: 'esm',
  outDir: 'out',
  clean: false,
  deps: { alwaysBundle: [/.*/] },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
}

export default defineConfig([
  { ...shared, entry: { cli: 'src/server/cli.ts' }, platform: 'node', target: 'node20' },
  { ...shared, entry: { main: 'src/tiny/main.ts' }, outDir: 'out/app-backend', platform: 'browser', target: 'es2023' },
])
