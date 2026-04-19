import { initWidget } from './sybos-widget';
import { loadFirecall } from './sybos-firecall';

// Start injection — wait for window load (after all scripts including
// SYBOS's have finished rewriting the document), with poll fallback
if (document.readyState === 'complete') {
  initWidget(loadFirecall);
} else {
  window.addEventListener('load', () => initWidget(loadFirecall));
  // Fallback poll in case load event doesn't fire
  const fallback = setInterval(() => {
    if (document.readyState === 'complete') {
      clearInterval(fallback);
      initWidget(loadFirecall);
    }
  }, 500);
  setTimeout(() => clearInterval(fallback), 30_000);
}

// Safety net — retry every 2s if the widget somehow never got injected
setInterval(() => {
  if (!document.getElementById('einsatzkarte-widget') && document.body) {
    initWidget(loadFirecall);
  }
}, 2000);
