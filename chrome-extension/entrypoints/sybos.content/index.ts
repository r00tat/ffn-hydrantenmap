import { defineContentScript } from 'wxt/utils/define-content-script';
import { initWidget } from './sybos-widget';
import { loadFirecall } from './sybos-firecall';

export default defineContentScript({
  matches: ['https://sybos.lfv-bgld.at/*'],
  runAt: 'document_end',

  main() {
    if (document.readyState === 'complete') {
      initWidget(loadFirecall);
    } else {
      window.addEventListener('load', () => initWidget(loadFirecall));
      const fallback = setInterval(() => {
        if (document.readyState === 'complete') {
          clearInterval(fallback);
          initWidget(loadFirecall);
        }
      }, 500);
      setTimeout(() => clearInterval(fallback), 30_000);
    }

    setInterval(() => {
      if (!document.getElementById('einsatzkarte-widget') && document.body) {
        initWidget(loadFirecall);
      }
    }, 2000);
  },
});
