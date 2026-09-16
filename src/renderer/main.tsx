import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import logoUrl from './assets/logo.png'

const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement('link')
favicon.rel = 'icon'; favicon.href = logoUrl; document.head.appendChild(favicon)

const root = document.getElementById('root')
if (!root) throw new Error('Markz renderer root is missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
