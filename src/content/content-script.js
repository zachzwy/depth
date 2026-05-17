import { h, render } from 'preact';
import Panel from './panel/Panel.jsx';
import panelCss from './panel/panel.css?inline';

const HOST_ID = 'depth-host';
let shadowRoot = null;
let mounted = false;
let currentMeta = null;
let urlInterval = null;

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (host) {
    shadowRoot = host.shadowRoot;
    if (!shadowRoot) {
      host.remove();
      host = null;
    } else if (!shadowRoot.querySelector('.depth-root')) {
      const root = document.createElement('div');
      root.className = 'depth-root';
      shadowRoot.appendChild(root);
      return host;
    } else {
      return host;
    }
  }

  host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  document.documentElement.appendChild(host);

  shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = panelCss;
  shadowRoot.appendChild(style);

  const root = document.createElement('div');
  root.className = 'depth-root';
  shadowRoot.appendChild(root);

  return host;
}

function getMeta() {
  return { title: document.title, url: location.href };
}

function rerender() {
  if (!mounted) return;
  const root = shadowRoot.querySelector('.depth-root');
  render(
    h(Panel, {
      pageMeta: currentMeta,
      onClose: closePanel,
    }),
    root,
  );
}

function startUrlWatcher() {
  if (urlInterval) return;
  urlInterval = setInterval(() => {
    if (!mounted) return;
    const next = getMeta();
    if (next.url !== currentMeta.url) {
      currentMeta = next;
      rerender();
    } else if (next.title !== currentMeta.title) {
      // Title change without URL change — keep state but reflect new title
      currentMeta = next;
      rerender();
    }
  }, 1000);
}

function stopUrlWatcher() {
  if (urlInterval) {
    clearInterval(urlInterval);
    urlInterval = null;
  }
}

function openPanel() {
  ensureHost();
  if (mounted) return;
  currentMeta = getMeta();
  mounted = true;
  rerender();
  startUrlWatcher();
}

function closePanel() {
  if (!mounted) return;
  const root = shadowRoot.querySelector('.depth-root');
  render(null, root);
  mounted = false;
  stopUrlWatcher();
}

function togglePanel() {
  if (mounted) closePanel();
  else openPanel();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'depth:toggle') {
    togglePanel();
    sendResponse({ ok: true, open: mounted });
  }
});
