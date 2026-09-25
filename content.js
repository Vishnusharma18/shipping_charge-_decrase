// Content script - runs on Meesho supplier pages

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'uploadImage') {
    uploadImageToMeesho(request.dataUrl)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (request.action === 'getShipping') {
    sendResponse({ shipping: readShippingFromPage() });
  }
  if (request.action === 'ping') {
    sendResponse({ alive: true });
  }
});

// ─── Inject ecomwithnabeel Button near bankSettlementContainer ──────────────────────
function injectAdeebRanaButton() {
  // Already injected?
  if (document.getElementById('ecomeasy-btn-wrap')) return;

  const container = document.querySelector('[data-testid="bankSettlementContainer"]');
  if (!container) return;

  const wrap = document.createElement('div');
  wrap.id = 'ecomeasy-btn-wrap';
  wrap.style.cssText = `
    display: flex;
    justify-content: center;
    padding: 10px 0 4px 0;
  `;

  wrap.innerHTML = `
    <button id="ecomeasy-glow-btn" style="
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 11px 22px;
      border: none;
      border-radius: 30px;
      background: linear-gradient(135deg, #6C0FFF, #FF3CAC);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: sans-serif;
      box-shadow: 0 0 12px #a855f7, 0 0 24px #FF3CAC55;
      animation: ecomeasy-pulse 2s infinite;
      letter-spacing: 0.3px;
      white-space: nowrap;
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      AI Shipping Optimise — ecomwithnabeel
    </button>
    <style>
      @keyframes ecomeasy-pulse {
        0%   { box-shadow: 0 0 8px #a855f7, 0 0 18px #FF3CAC55; }
        50%  { box-shadow: 0 0 18px #a855f7, 0 0 36px #FF3CAC99, 0 0 52px #6C0FFF44; }
        100% { box-shadow: 0 0 8px #a855f7, 0 0 18px #FF3CAC55; }
      }
    </style>
  `;

  // Insert before the container
  container.parentNode.insertBefore(wrap, container);

  document.getElementById('ecomeasy-glow-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openPopup' });
  });
}

// Watch for bankSettlementContainer to appear (React renders it dynamically)
const observer = new MutationObserver(() => {
  injectAdeebRanaButton();
});
observer.observe(document.body, { childList: true, subtree: true });

// Also try immediately on load
injectAdeebRanaButton();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function triggerReactInputChange(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeInputValueSetter.call(element, value);
  element.dispatchEvent(new Event('input',  { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('blur',  { bubbles: true }));
}

async function prickPriceField() {
  const priceInput = document.getElementById('meesho_price') ||
                     document.querySelector('input[aria-describedby="meesho_price-helper-text"]');
  if (!priceInput) return false;

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  const originalVal = priceInput.value || '100';

  priceInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));

  const tempVal = originalVal === '100' ? '101' : '100';
  nativeInputValueSetter.call(priceInput, tempVal);
  priceInput.dispatchEvent(new Event('input',  { bubbles: true }));
  priceInput.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));

  nativeInputValueSetter.call(priceInput, originalVal);
  priceInput.dispatchEvent(new Event('input',  { bubbles: true }));
  priceInput.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));

  priceInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  return true;
}

async function uploadImageToMeesho(dataUrl) {
  const input = document.querySelector('input[data-testid="changeFrontImage"]') ||
                document.querySelector('#changeFrontImage') ||
                document.querySelector('input[type="file"][accept*="jpeg"]') ||
                document.querySelector('input[type="file"][accept*="image"]');

  if (!input) return { success: false, error: 'Upload input not found' };

  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], 'meesho_test.jpg', { type: 'image/jpeg' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const nativeFileSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'files'
    ).set;
    nativeFileSetter.call(input, dataTransfer.files);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input',  { bubbles: true }));

    await new Promise(r => setTimeout(r, 3000));
    await prickPriceField();
    await new Promise(r => setTimeout(r, 2000));

    let shipping = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      shipping = readShippingFromPage();
      if (shipping !== null) break;
      await new Promise(r => setTimeout(r, 800));
      if (attempt % 2 === 1) await prickPriceField();
    }

    return { success: true, shipping };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function readShippingFromPage() {
  const mlsEl = document.querySelector('[data-mls-applied]');
  if (mlsEl) {
    const val = parseInt(mlsEl.getAttribute('data-mls-applied'));
    if (!isNaN(val) && val > 0) return val;
  }

  for (const sel of ['[class*="shipping"]','[class*="Shipping"]','[id*="shipping"]','[data-testid*="shipping"]']) {
    for (const el of document.querySelectorAll(sel)) {
      const match = el.textContent.trim().match(/₹\s*(\d+)/);
      if (match) { const v = parseInt(match[1]); if (v > 0 && v < 5000) return v; }
    }
  }

  for (const el of document.querySelectorAll('p, span, div, h4, h5, h6, td, li')) {
    if (el.children.length > 3) continue;
    const txt = el.textContent.trim();
    if (txt.length > 80) continue;
    if (/shipping/i.test(txt) && /₹\s*\d+/.test(txt)) {
      const match = txt.match(/₹\s*(\d+)/);
      if (match) { const v = parseInt(match[1]); if (v > 0 && v < 5000) return v; }
    }
  }

  return null;
}

window.__meeshoOptimizerReady = true;
console.log('[ecomwithnabeel] Content script loaded');
