import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log("main.tsx: Starting mount process...");

try {
  const container = document.getElementById('root');
  if (!container) throw new Error("Root container not found");

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log("main.tsx: Render call completed");
} catch (err: any) {
  console.error("main.tsx: Mount failed!", err);
  const errorDisplay = document.getElementById('error-display');
  if (errorDisplay) {
    errorDisplay.innerText = "Mount Error: " + (err?.message || String(err));
  }
}
