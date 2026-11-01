import type { SourceMap } from 'magic-string'
import path from 'node:path'
import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'

export interface TransformInput {
  code: string
  file: string
  root: string
  attribute: string
  ignoreTags?: string[]
}

export interface TransformOutput {
  code: string
  map: SourceMap
}

interface AstNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

interface JsxName extends AstNode {
  name?: string | JsxName
  object?: JsxName
  property?: JsxName
}

interface JsxOpeningElement extends AstNode {
  name: JsxName
  attributes: (AstNode & { name?: JsxName })[]
  selfClosing: boolean
}

const SOURCE_FILE = /\.(?:jsx|tsx|js|mjs|ts|mts)$/
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

export const DEFAULT_IGNORE_TAGS = ['fragment', 'suspense', 'script', 'style', 'template', 'slot']

export function canTransform(file: string) {
  return SOURCE_FILE.test(file)
}

export function transformJsx({ code, file, root, attribute, ignoreTags = [] }: TransformInput): TransformOutput | null {
  if (!canTransform(file) || !code.includes('<'))
    return null

  const program = parseProgram(code, file)
  if (!program)
    return null

  const source = path.relative(root, file).replaceAll('\\', '/')
  const lines = getLineStarts(code)
  const output = new MagicString(code)
  const fragments = new Set(['fragment', ...collectFragmentAliases(program)].map(tag => tag.toLowerCase()))
  const ignored = new Set([...DEFAULT_IGNORE_TAGS, ...ignoreTags, ...fragments].map(tag => tag.toLowerCase()))
  const bindings = collectDynamicBindings(program)

  visit(program, (node) => {
    if (node.type !== 'JSXOpeningElement')
      return
    const element = node as JsxOpeningElement
    const tag = getTagName(element.name).toLowerCase()
    if (fragments.has(tag))
      omitSpreadAttribute(element, output, attribute)
    if (ignored.has(tag) || hasAttribute(element, attribute))
      return
    const { line, column } = getPosition(lines, element.start)
    const insertAt = element.end - (element.selfClosing ? 2 : 1)
    const separator = /\s/.test(code[insertAt - 1] ?? '') ? '' : ' '
    const trailing = element.selfClosing ? ' ' : ''
    const value = `"${source}:${line}:${column}"`
    const tagged = bindings.has(getComponentRoot(element.name) ?? '')
      ? `{...(${code.slice(element.name.start, element.name.end)} === Symbol.for("react.fragment") ? null : { "${attribute}": ${value} })}`
      : `${attribute}=${value}`
    output.prependLeft(insertAt, `${separator}${tagged}${trailing}`)
  })

  if (!output.hasChanged())
    return null
  return { code: output.toString(), map: output.generateMap({ source: file, hires: 'boundary', includeContent: true }) }
}

function parseProgram(code: string, file: string) {
  const result = parseSync(file, code, { lang: getLang(file), sourceType: 'module' })
  return result.errors.length ? null : (result.program as unknown as AstNode & { body: AstNode[] })
}

function getLang(file: string): 'jsx' | 'ts' | 'tsx' {
  if (/\.[cm]?tsx$/.test(file))
    return 'tsx'
  if (/\.[cm]?ts$/.test(file))
    return 'ts'
  return 'jsx'
}

function visit(node: unknown, callback: (node: AstNode) => void) {
  if (!node || typeof node !== 'object')
    return
  if (Array.isArray(node)) {
    for (const child of node)
      visit(child, callback)
    return
  }
  if (typeof (node as AstNode).type === 'string')
    callback(node as AstNode)
  for (const value of Object.values(node))
    visit(value, callback)
}

function omitSpreadAttribute(element: JsxOpeningElement, output: MagicString, attribute: string) {
  for (const item of element.attributes) {
    if (item.type !== 'JSXSpreadAttribute')
      continue
    const argument = item.argument as AstNode
    output.prependRight(argument.start, `(({ "${attribute}": __sourcery, ...props }) => props)((`)
    output.appendLeft(argument.end, `) ?? {})`)
  }
}

function collectFragmentAliases(program: AstNode) {
  const aliases = new Set<string>()
  visit(program, (node) => {
    if (node.type === 'ImportSpecifier') {
      const imported = node.imported as JsxName
      const local = node.local as JsxName
      if (getTagName(imported) === 'Fragment' && typeof local.name === 'string')
        aliases.add(local.name)
      return
    }
    if (node.type === 'AssignmentPattern') {
      const left = node.left as JsxName
      if (left.type === 'Identifier' && typeof left.name === 'string' && referencesFragment(node.right))
        aliases.add(left.name)
      return
    }
    if (node.type !== 'VariableDeclarator' || !node.init)
      return
    const id = node.id as JsxName
    if (id.type === 'Identifier' && typeof id.name === 'string' && referencesFragment(node.init))
      aliases.add(id.name)
  })
  return aliases
}

function referencesFragment(node: unknown): boolean {
  const expression = node as AstNode & { name?: string, property?: JsxName }
  switch (expression.type) {
    case 'Identifier':
      return expression.name === 'Fragment'
    case 'MemberExpression':
      return expression.property ? getTagName(expression.property) === 'Fragment' : false
    case 'ConditionalExpression':
      return referencesFragment(expression.consequent) || referencesFragment(expression.alternate)
    case 'LogicalExpression':
      return referencesFragment(expression.left) || referencesFragment(expression.right)
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      return referencesFragment(expression.expression)
    default:
      return false
  }
}

function collectDynamicBindings(program: AstNode) {
  const names = new Set<string>()
  visit(program, (node) => {
    if (FUNCTIONS.has(node.type))
      addBindings(node.params, names)
    if (node.type !== 'VariableDeclarator')
      return
    if ((node.id as AstNode).type !== 'Identifier' || !definesComponent(node.init))
      addBindings(node.id, names)
  })
  return names
}

function definesComponent(node: unknown): boolean {
  const expression = node as (AstNode & { expression?: unknown, callee?: AstNode & { name?: string } }) | null
  switch (expression?.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ClassExpression':
    case 'TaggedTemplateExpression':
      return true
    case 'CallExpression':
      return !/^use[A-Z]/.test(expression.callee?.name ?? '')
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      return definesComponent(expression.expression)
    default:
      return false
  }
}

function addBindings(node: unknown, names: Set<string>) {
  if (Array.isArray(node)) {
    for (const item of node)
      addBindings(item, names)
    return
  }
  const pattern = node as (AstNode & Record<string, unknown>) | null
  switch (pattern?.type) {
    case 'Identifier':
      if (typeof pattern.name === 'string')
        names.add(pattern.name)
      return
    case 'ObjectPattern':
      for (const property of pattern.properties as AstNode[])
        addBindings(property.value ?? property, names)
      return
    case 'ArrayPattern':
      addBindings(pattern.elements, names)
      return
    case 'AssignmentPattern':
      addBindings(pattern.left, names)
      return
    case 'RestElement':
      addBindings(pattern.argument, names)
      return
    case 'TSParameterProperty':
      addBindings(pattern.parameter, names)
  }
}

function getComponentRoot(name: JsxName): string | undefined {
  if (name.type === 'JSXMemberExpression') {
    let object = name.object
    while (object?.type === 'JSXMemberExpression')
      object = object.object
    return object?.type === 'JSXIdentifier' && typeof object.name === 'string' ? object.name : undefined
  }
  return name.type === 'JSXIdentifier' && typeof name.name === 'string' && !/^[a-z]|-/.test(name.name)
    ? name.name
    : undefined
}

function getTagName(name: JsxName): string {
  if (name.type === 'JSXMemberExpression' && name.property)
    return getTagName(name.property)
  if (typeof name.name === 'string')
    return name.name
  return name.name ? getTagName(name.name) : ''
}

function hasAttribute(node: JsxOpeningElement, attribute: string) {
  return node.attributes.some(item => item.type === 'JSXAttribute' && item.name && getTagName(item.name) === attribute)
}

function getLineStarts(code: string) {
  const starts = [0]
  for (let index = code.indexOf('\n'); index !== -1; index = code.indexOf('\n', index + 1))
    starts.push(index + 1)
  return starts
}

function getPosition(lineStarts: number[], offset: number) {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if ((lineStarts[middle] ?? 0) <= offset)
      low = middle
    else
      high = middle - 1
  }
  return { line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 }
}
