import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, Route, Routes, useLocation } from 'react-router'
import { parseMrRef } from '../shared/mr-ref'
import { BOOT_READY_METHOD } from '../shared/self-improve'
import { FeedbackPage } from './pages/feedback-page'
import { HomePage } from './pages/home-page'
import { ReleasesPage } from './pages/releases-page'
import { ReviewPage } from './pages/review-page'
import { UpdateDialog } from './components/update-dialog'
import { FEEDBACK_PATH, SelfImproveProvider } from './feedback/self-improve'
import { preloadDiffHighlighter } from './lib/code-tokens'
import { callApp, isTinyApp, routeExternalLinks } from './lib/platform'
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

function BootReady() {
  useEffect(() => {
    void callApp(BOOT_READY_METHOD, { url: location.href }).catch(() => null)
  }, [])
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
        <SelfImproveProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/releases/:kind?" element={<ReleasesPage />} />
            <Route path={FEEDBACK_PATH} element={<FeedbackPage />} />
            <Route path="*" element={<MrRoute />} />
          </Routes>
        </SelfImproveProvider>
      </Router>
      {isTinyApp && <UpdateDialog />}
      {isTinyApp && <BootReady />}
    </QueryClientProvider>
  </StrictMode>,
)
