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

  it('renders paired sub and sup tags and keeps other HTML escaped', () => {
    const html = renderToStaticMarkup(createElement(Markdown, { children: 'Text\n\n<sub>Found by **Claude**.</sub> x<sup>2</sup> <b>no</b> <sub>open' }))
    expect(html).toContain('<sub>Found by <strong>Claude</strong>.</sub>')
    expect(html).toContain('<sup>2</sup>')
    expect(html).toContain('&lt;b&gt;no&lt;/b&gt;')
    expect(html).toContain('&lt;sub&gt;open')
  })
})
