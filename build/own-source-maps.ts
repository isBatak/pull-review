import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { trimSourceMap } from '../src/shared/source-maps.ts'

const SOURCE_MAPPING_URL = /\n?\/\/# sourceMappingURL=\S+\s*$/

interface WrittenBundle {
  [fileName: string]: { type: string, fileName: string }
}

export function ownSourceMaps(root: string) {
  return {
    name: 'pull-review:own-source-maps',
    async writeBundle(options: { dir?: string }, bundle: WrittenBundle) {
      if (!options.dir)
        return
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk')
          continue
        const codePath = join(options.dir, output.fileName)
        const mapPath = `${codePath}.map`
        if (!existsSync(mapPath))
          continue
        const trimmed = trimSourceMap(JSON.parse(await readFile(mapPath, 'utf8')), dirname(mapPath), root)
        if (trimmed) {
          await writeFile(mapPath, JSON.stringify(trimmed))
          continue
        }
        await rm(mapPath)
        await writeFile(codePath, (await readFile(codePath, 'utf8')).replace(SOURCE_MAPPING_URL, '\n'))
      }
    },
  }
}
