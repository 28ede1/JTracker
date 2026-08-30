// ---------------------------------------------------------------------------
// Entry point
//
// The one place that attaches React to the page. Everything else in the app is
// a component underneath App.
// ---------------------------------------------------------------------------

// StrictMode is a development-only tool built into React that helps find
// problems in React code.
import { StrictMode } from 'react'

// createRoot is the React function that creates the connection between React
// and an HTML element.
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Could not find #root element in index.html')
}

// Attach React to the root element and render the application. <App /> is the
// top-level component of the React component tree.
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
