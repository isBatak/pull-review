import type { DiffFile } from './types'
import type { FileTreeNode } from './file-tree'
import { describe, expect, it } from 'vitest'
import { buildFileTree, filesUnder, folderIds } from './file-tree'

function file(path: string): DiffFile {
  return {
    id: path,
    path,
    previousPath: null,
    status: 'modified',
    diff: '',
    additions: 0,
    deletions: 0,
    isBinary: false,
    tooLarge: false,
    generated: false,
    aMode: '100644',
    bMode: '100644',
  }
}

function shape(node: FileTreeNode): unknown {
  return node.children ? { [node.name]: node.children.map(shape) } : node.name
}

describe('buildFileTree', () => {
  it('compacts single child folder chains and lists folders before files', () => {
    const tree = buildFileTree([
      file('apps/frontend/app/src/proxy.ts'),
      file('apps/frontend/app/src/app/page.tsx'),
      file('apps/frontend/web/next-env.d.ts'),
      file('README.md'),
    ])
    expect(tree.children!.map(shape)).toEqual([
      {
        'apps/frontend': [
          { 'app/src': [{ app: ['page.tsx'] }, 'proxy.ts'] },
          { web: ['next-env.d.ts'] },
        ],
      },
      'README.md',
    ])
  })

  it('uses the full folder path as the folder id', () => {
    const tree = buildFileTree([file('a/b/c.ts'), file('a/d.ts')])
    expect(folderIds(tree)).toEqual(['dir:', 'dir:a', 'dir:a/b'])
  })
})

describe('filesUnder', () => {
  it('collects every file below a folder', () => {
    const tree = buildFileTree([file('a/b/c.ts'), file('a/d.ts'), file('e.ts')])
    expect(filesUnder(tree.children![0]!).map(f => f.path)).toEqual(['a/b/c.ts', 'a/d.ts'])
  })
})
