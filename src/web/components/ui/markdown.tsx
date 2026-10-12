import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { css, cx } from 'styled-system/css'

const HTML_COMMENT = /<!--[\s\S]*?-->/g

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
})

export function Markdown({ children, className, baseUrl }: { children: string, className?: string, baseUrl?: string }) {
  return (
    <div className={cx(prose, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={url => defaultUrlTransform(baseUrl && url.startsWith('/') ? `${baseUrl}${url}` : url)}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {children.replace(HTML_COMMENT, '')}
      </ReactMarkdown>
    </div>
  )
}
