import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './index.css'
import App from './App.tsx'
import { RecorderWindow } from './components/RecorderOverlay.tsx'

const isRecorderWindow =
  '__TAURI_INTERNALS__' in window && getCurrentWindow().label === 'recorder'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isRecorderWindow ? <RecorderWindow /> : <App />}
  </StrictMode>,
)
