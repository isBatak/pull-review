import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { createContext, use } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { css, cx } from 'styled-system/css'

const HTML_COMMENT = /<!--[\s\S]*?-->/g

const INLINE_TAGS = new Set(['sub', 'sup'])

interface MarkdownNode {
  type: string
  value?: string
  children?: MarkdownNode[]
  data?: { hName?: string }
}

function tagOf(node: MarkdownNode, closing: boolean) {
  const match = node.type === 'html' ? /^<(\/?)([a-z]+)>$/i.exec(node.value?.trim() ?? '') : null
  const name = match?.[2]?.toLowerCase()
  return match && name && INLINE_TAGS.has(name) && Boolean(match[1]) === closing ? name : null
}

function wrapInlineTags(node: MarkdownNode) {
  const children = node.children
  if (!children)
    return
  for (let index = 0; index < children.length; index++) {
    const name = tagOf(children[index]!, false)
    if (!name)
      continue
    const end = children.findIndex((child, position) => position > index && tagOf(child, true) === name)
    if (end === -1)
      continue
    children.splice(index, end - index + 1, { type: 'emphasis', data: { hName: name }, children: children.slice(index + 1, end) })
  }
  children.forEach(wrapInlineTags)
}

// GitLab renders a few inline HTML tags in comments; turning only these into elements keeps all other HTML escaped.
function remarkInlineTags() {
  return wrapInlineTags
}

const prose = css({
  fontSize: 'sm',
  lineHeight: '1.6',
  wordBreak: 'break-word',
  '& > * + *': { mt: '2' },
  '& a': { color: 'accent.fg', textDecoration: 'underline', textUnderlineOffset: '2px' },
  '& code': { fontFamily: 'mono', fontSize: '0.85em', bg: 'bg.muted', px: '1', py: '0.5', borderRadius: 'sm' },
  '& pre': { fontFamily: 'mono', fontSize: 'xs', bg: 'bg.muted', p: '3', borderRadius: 'md', overflowX: 'auto' },
  '& pre code': { bg: 'transparent', p: '0' },
  '& ul': { listStyle: 'disc', pl: '5' },
  '& ol': { listStyle: 'decimal', pl: '5' },
  '& blockquote': { borderLeftWidth: '3px', borderColor: 'border.strong', pl: '3', color: 'fg.muted' },
  '& h1, & h2, & h3': { fontWeight: 'semibold', fontSize: 'md' },
  '& table': { borderCollapse: 'collapse', fontSize: 'xs' },
  '& th, & td': { borderWidth: '1px', borderColor: 'border.default', px: '2', py: '1' },
  '& img': { maxW: 'full', borderRadius: 'md' },
  '& input[type=checkbox]': { mr: '1.5' },
  '& sub': { fontSize: 'xs', color: 'fg.subtle', verticalAlign: 'baseline' },
})

export type CodeBlockRenderer = (language: string | null, code: string) => ReactNode | null

export const CodeBlockRendererContext = createContext<CodeBlockRenderer | null>(null)

interface CodeElementProps {
  className?: string
  children?: ReactNode
}

function codeBlockOf(children: ReactNode) {
  const element = children as ReactElement<CodeElementProps> | null
  const language = /language-(\S+)/.exec(element?.props?.className ?? '')?.[1] ?? null
  return { language, code: String(element?.props?.children ?? '') }
}

// Module-level components keep their identity across renders; inline ones would remount every link and code block, which drops text selections.
const ActiveCodeBlockRenderer = createContext<CodeBlockRenderer | null>(null)

function CodeBlock({ node: _node, children, ...props }: ComponentProps<'pre'> & { node?: unknown }) {
  const renderer = use(ActiveCodeBlockRenderer)
  if (!renderer)
    return <pre {...props}>{children}</pre>
  const { language, code } = codeBlockOf(children)
  return renderer(language, code) ?? <pre {...props}>{children}</pre>
}

function Link({ node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  return <a {...props} target="_blank" rel="noreferrer" />
}

const COMPONENTS: Components = { a: Link, pre: CodeBlock }

export function Markdown({ children, className, baseUrl, renderCodeBlock }: { children: string, className?: string, baseUrl?: string, renderCodeBlock?: CodeBlockRenderer }) {
  const contextRenderer = use(CodeBlockRendererContext)
  return (
    <div className={cx(prose, className)}>
      <ActiveCodeBlockRenderer value={renderCodeBlock ?? contextRenderer}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkInlineTags]}
          urlTransform={url => defaultUrlTransform(baseUrl && url.startsWith('/') ? `${baseUrl}${url}` : url)}
          components={COMPONENTS}
        >
          {children.replace(HTML_COMMENT, '')}
        </ReactMarkdown>
      </ActiveCodeBlockRenderer>
    </div>
  )
}
