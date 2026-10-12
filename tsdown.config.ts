import type { UserConfig } from 'tsdown'
import { defineConfig } from 'tsdown'

const shared: UserConfig = {
  format: 'esm',
  outDir: 'out',
  clean: false,
  deps: { alwaysBundle: [/.*/] },
}

export default defineConfig([
  { ...shared, entry: { cli: 'src/server/cli.ts' }, platform: 'node', target: 'node20' },
  { ...shared, entry: { main: 'src/tiny/main.ts' }, outDir: 'out/app-backend', platform: 'browser', target: 'es2023' },
])
