import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
// Ordem importa: @font-face antes de tudo, camadas do Tailwind, tema e markdown.
import './styles/fonts.css'
import './styles/index.css'
import './styles/theme.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
