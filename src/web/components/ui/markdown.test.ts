import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './markdown'

describe('Markdown', () => {
  it('drops script URLs and keeps safe ones', () => {
    const html = renderToStaticMarkup(createElement(Markdown, {
      baseUrl: 'https://gitlab.example.com/group/project',
      children: '[bad](javascript:alert(1)) [data](data:text/html,x) [ok](https://example.com) [rel](/-/issues/1)',
    }))
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:text/html')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('href="https://gitlab.example.com/group/project/-/issues/1"')
  })
})
