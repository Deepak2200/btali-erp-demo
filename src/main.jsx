import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useStore } from './store'

// Recharts 2.x still declares defaultProps on its axis components, which React 18.3 warns about on every chart.
// The warning comes from inside the library; filter just that message so real errors stay visible.
const consoleError = console.error
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Support for defaultProps will be removed')) return
  consoleError(...args)
}

// Deep-link sign-in for demos: index.html?as=u3#/erp/purchase
const as = new URLSearchParams(window.location.search).get('as')
if (as && useStore.getState().users.some((u) => u.id === as)) useStore.getState().login(as)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
