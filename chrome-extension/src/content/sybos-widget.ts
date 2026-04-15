import WIDGET_CSS from './sybos.css?raw';

// Helper to create DOM elements safely (no innerHTML for XSS prevention)
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  text?: string
): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        elem.className = value;
      } else {
        elem.setAttribute(key, value);
      }
    });
  }
  if (text) {
    elem.textContent = text;
  }
  return elem;
}

// State
let widget: HTMLDivElement;
let toggle: HTMLButtonElement;
let panel: HTMLDivElement;
let content: HTMLDivElement;
let panelOpen = false;
let onOpenCallback: (() => void) | null = null;

/** Replace the content area with a status message. */
export function showStatus(message: string): void {
  content.replaceChildren();
  content.appendChild(el('div', { className: 'ek-status' }, message));
}

/** Clear content and let a renderer populate it. */
export function renderContent(renderer: (content: HTMLElement) => void): void {
  content.replaceChildren();
  renderer(content);
}

function injectStyles() {
  if (document.getElementById('einsatzkarte-styles')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'einsatzkarte-styles';
  style.textContent = WIDGET_CSS;
  (document.head || document.documentElement).appendChild(style);
}

function buildWidget() {
  widget = el('div', { id: 'einsatzkarte-widget' });
  toggle = el('button', { className: 'ek-toggle' }, 'EK');
  panel = el('div', { className: 'ek-panel' });

  // Panel header
  const titleRow = el('div', { className: 'ek-title' });
  titleRow.appendChild(el('span', {}, 'Einsatzkarte'));
  const closeBtn = el('button', {
    style: 'background:none;border:none;cursor:pointer;font-size:16px;',
  }, '\u2715');
  titleRow.appendChild(closeBtn);
  panel.appendChild(titleRow);

  // Content area
  content = el('div', { className: 'ek-content' });
  content.appendChild(el('div', { className: 'ek-status' }, 'Lade...'));
  panel.appendChild(content);

  widget.appendChild(toggle);
  widget.appendChild(panel);

  // Open panel on pointerdown — click events don't fire reliably when
  // SYBOS rewrites the document between mousedown and mouseup
  toggle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setOpen(true);
  });
  closeBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setOpen(false);
  });
}

function setOpen(open: boolean) {
  panelOpen = open;
  panel.classList.toggle('open', open);
  toggle.style.display = open ? 'none' : 'block';
  if (open && onOpenCallback) onOpenCallback();
}

/**
 * SYBOS rewrites the entire document (DOM + stylesheets) from a jQuery
 * ready handler. Strategy: defer injection until the window "load" event,
 * embed CSS via a <style> element so it survives, and rebuild the widget
 * from scratch whenever it gets removed.
 *
 * @param onOpen called whenever the panel is (re)opened — used to (re)load
 *               firecall content after SYBOS wipes the DOM.
 */
export function initWidget(onOpen: () => void): void {
  onOpenCallback = onOpen;

  // Already injected?
  if (document.getElementById('einsatzkarte-widget')) {
    return;
  }

  // Body must exist and have content (SYBOS finished rendering)
  if (!document.body || document.body.children.length === 0) {
    setTimeout(() => initWidget(onOpen), 200);
    return;
  }

  injectStyles();
  buildWidget();
  document.body.appendChild(widget);

  // Keep watching — REBUILD widget from scratch if SYBOS removes it.
  // Can't just re-appendChild: elements created in the replaced document
  // have stale ownerDocument and their event listeners don't fire even
  // after re-attaching to the new document.
  // Polling at 200ms so the overlay does not visibly flicker for up to a
  // second on pages like "Mannschaft editieren" that rewrite the DOM.
  setInterval(() => {
    if (!document.getElementById('einsatzkarte-widget')) {
      buildWidget();
      document.body.appendChild(widget);
      // Restore open state AND reload content — after a DOM rewrite the
      // rebuilt panel starts empty ("Lade..."); without re-running
      // onOpenCallback the user sees an empty overlay.
      if (panelOpen) {
        panel.classList.add('open');
        toggle.style.display = 'none';
        if (onOpenCallback) onOpenCallback();
      }
    }
    if (!document.getElementById('einsatzkarte-styles')) {
      injectStyles();
    }
  }, 200);
}
