import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { SiteProvider, ThemeProvider, ToastProvider } from './lib/context'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <SiteProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </SiteProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
