// Must load before @openuidev/react-lang: this flag stops its dev-only devtools widget from mounting into the page.
(globalThis as Record<symbol, unknown>)[Symbol.for('openui.devtools.autoMount')] = true
