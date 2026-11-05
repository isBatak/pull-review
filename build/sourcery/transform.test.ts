import { describe, expect, it } from 'vitest'
import { transformJsx } from './transform'

function tag(code: string) {
  return transformJsx({ code, file: '/repo/src/web/page.tsx', root: '/repo', attribute: 'data-sourcery' })?.code ?? null
}

describe('sourcery transform', () => {
  it('tags host elements and components with their repository location', () => {
    expect(tag('export const A = () => <div className="a">\n  <Button />\n</div>')).toBe(
      'export const A = () => <div className="a" data-sourcery="src/web/page.tsx:1:24">\n  <Button data-sourcery="src/web/page.tsx:2:3" />\n</div>',
    )
  })

  it('leaves fragments, Suspense and already tagged elements alone', () => {
    expect(tag('const A = () => <><Suspense><p data-sourcery="x" /></Suspense></>')).toBeNull()
  })

  it('strips the attribute from props spread onto a fragment', () => {
    expect(tag('import { Fragment } from "react"\nconst A = (props) => <Fragment {...props} />')).toContain('(({ "data-sourcery": __sourcery, ...props }) => props)((props) ?? {})')
  })

  it('guards components that may be a fragment at runtime', () => {
    expect(tag('const A = ({ as: Tag }) => <Tag />')).toContain('{...(Tag === Symbol.for("react.fragment") ? null : { "data-sourcery": "src/web/page.tsx:1:28" })}')
  })

  it('skips files without JSX and files that do not parse', () => {
    expect(tag('export const a = 1 < 2')).toBeNull()
    expect(tag('const A = () => <div')).toBeNull()
  })
})
