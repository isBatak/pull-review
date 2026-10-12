import type { DiffFile } from './types'
import { compareCompanionPaths } from './grouping'

export interface FileTreeNode {
  id: string
  name: string
  path: string
  file?: DiffFile
  children?: FileTreeNode[]
}

interface MutableFolder {
  name: string
  path: string
  folders: Map<string, MutableFolder>
  files: DiffFile[]
}

function createFolder(name: string, path: string): MutableFolder {
  return { name, path, folders: new Map(), files: [] }
}

function toNode(folder: MutableFolder): FileTreeNode {
  let current = folder
  let name = folder.name
  while (current.files.length === 0 && current.folders.size === 1) {
    const [only] = current.folders.values()
    current = only!
    name = name ? `${name}/${current.name}` : current.name
  }
  const folders = [...current.folders.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toNode)
  const files = [...current.files]
    .sort((a, b) => compareCompanionPaths(a.path, b.path))
    .map(file => ({ id: file.id, name: file.path.slice(file.path.lastIndexOf('/') + 1), path: file.path, file }))
  return { id: `dir:${current.path}`, name, path: current.path, children: [...folders, ...files] }
}

export function buildFileTree(files: DiffFile[]): FileTreeNode {
  const root = createFolder('', '')
  for (const file of files) {
    const segments = file.path.split('/')
    segments.pop()
    let folder = root
    for (const segment of segments) {
      const path = folder.path ? `${folder.path}/${segment}` : segment
      let next = folder.folders.get(segment)
      if (!next) {
        next = createFolder(segment, path)
        folder.folders.set(segment, next)
      }
      folder = next
    }
    folder.files.push(file)
  }
  const folders = [...root.folders.values()].sort((a, b) => a.name.localeCompare(b.name)).map(toNode)
  const rootFiles = root.files
    .sort((a, b) => compareCompanionPaths(a.path, b.path))
    .map(file => ({ id: file.id, name: file.path, path: file.path, file }))
  return { id: 'dir:', name: '', path: '', children: [...folders, ...rootFiles] }
}

export function filesUnder(node: FileTreeNode): DiffFile[] {
  if (node.file)
    return [node.file]
  return (node.children ?? []).flatMap(filesUnder)
}

export function folderIds(node: FileTreeNode): string[] {
  if (!node.children)
    return []
  return [node.id, ...node.children.flatMap(folderIds)]
}
