import React, { Suspense, lazy } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { APPS, homePathFor, canSeeModule } from './nav'
import { useUser } from './store'
import AppShell from './components/AppShell'
import SiteLayout from './apps/site/SiteLayout'
import Login from './apps/Login'
import { UIRoot, Spinner } from './components/ui'

// Every screen file under src/apps is lazy-loaded from the nav registry.
const pages = import.meta.glob('./apps/**/*.jsx')
const cache = {}
const pageFor = (file) => {
  if (!cache[file]) {
    const loader = pages[`./apps/${file}.jsx`]
    cache[file] = loader ? lazy(loader) : () => <div className="text-sm text-slate-500">Screen not found: {file}</div>
  }
  return cache[file]
}

function Guard({ appKey, children }) {
  const user = useUser()
  const app = APPS[appKey]
  if (!user) return <Navigate to="/login" replace />
  if (!app.roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />
  return children
}

function ModuleGuard({ module, children }) {
  const user = useUser()
  if (module && !canSeeModule(user?.role, module)) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="text-lg font-semibold text-ink-900">Access restricted</div>
        <p className="text-sm text-slate-500 mt-1">Your role does not have access to this screen. Switch persona from the user menu to explore it.</p>
      </div>
    )
  }
  return children
}

const Loading = () => <div className="flex items-center justify-center py-24"><Spinner className="w-7 h-7" /></div>

function Root() {
  const user = useUser()
  return <Navigate to={homePathFor(user)} replace />
}

export default function App() {
  return (
    <HashRouter>
      <UIRoot />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<Login />} />
          {Object.values(APPS).filter((a) => !a.public).map((app) => (
            <Route key={app.key} path={app.base} element={<Guard appKey={app.key}><AppShell appKey={app.key} /></Guard>}>
              <Route index element={<Root />} />
              {app.sections.flatMap((s) => s.items.map((it) => {
                const Page = pageFor(it.file)
                return <Route key={it.path} path={`${it.path}/*`} element={<ModuleGuard module={app.key === 'erp' ? it.module || s.module : null}><Suspense fallback={<Loading />}><Page /></Suspense></ModuleGuard>} />
              }))}
              <Route path="*" element={<Root />} />
            </Route>
          ))}
          <Route path="/site" element={<SiteLayout />}>
            <Route index element={<Navigate to="home" replace />} />
            {APPS.site.sections[0].items.map((it) => {
              const Page = pageFor(it.file)
              return <Route key={it.path} path={`${it.path}/*`} element={<Suspense fallback={<Loading />}><Page /></Suspense>} />
            })}
          </Route>
          <Route path="*" element={<Root />} />
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
