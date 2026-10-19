import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, Route, Routes, useLocation } from 'react-router'
import { parseMrRef } from '../shared/mr-ref'
import { HomePage } from './pages/home-page'
import { ReviewPage } from './pages/review-page'
import { UpdateDialog } from './components/update-dialog'
import { preloadDiffHighlighter } from './lib/code-tokens'
import { isTinyApp, routeExternalLinks } from './lib/platform'
import { useZoomController } from './lib/zoom'
import { ErrorState } from './pages/states'
import '@pierre/truncate/style.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

function MrRoute() {
  const location = useLocation()
  const ref = parseMrRef(location.pathname)
  if (!ref)
    return <ErrorState title="Not a merge request" message={`${location.pathname} does not look like /<host>/<project>/-/merge_requests/<iid>.`} />
  return <ReviewPage key={location.pathname} mrRef={ref} />
}

function ZoomController() {
  useZoomController()
  return null
}

const Router = isTinyApp ? HashRouter : BrowserRouter

routeExternalLinks()
void preloadDiffHighlighter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ZoomController />
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<MrRoute />} />
        </Routes>
      </Router>
      {isTinyApp && <UpdateDialog />}
    </QueryClientProvider>
  </StrictMode>,
)
