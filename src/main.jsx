import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useStore } from './store'

// Deep-link sign-in for demos: index.html?as=u3#/erp/purchase
const as = new URLSearchParams(window.location.search).get('as')
if (as && useStore.getState().users.some((u) => u.id === as)) useStore.getState().login(as)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
