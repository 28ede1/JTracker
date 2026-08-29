// development-only tool built into react that helps find problems in react code
import { StrictMode } from 'react'

// this is a fundamental react function that creates the connection
// between react and an html element
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Could not find #root element in index.html')
}

// Attach React to the root element and render the application.
// <App /> is the top-level component of the React component tree.
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
