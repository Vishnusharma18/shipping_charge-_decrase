// Content script - runs on Meesho supplier pages
if (window.__vishnuOptimizerLoaded) {
  // Already injected — skip re-binding listeners
} else {
window.__vishnuOptimizerLoaded = true;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'uploadImage') {
    uploadImageToMeesho(request.dataUrl)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message, shipping: null }));
    return true;
  }
  if (request.action === 'getShipping') {
    sendResponse({ shipping: readShippingFromPage() });
  }
  if (request.action === 'ping') {
    sendResponse(pageReadyCheck());
  }
});

// ─── Inject Vishnu button near bankSettlementContainer ──────────────────────
function injectVishnuButton() {
  if (document.getElementById('vishnu-btn-wrap')) return;

  const container = document.querySelector('[data-testid="bankSettlementContainer"]');
  if (!container) return;

  const wrap = document.createElement('div');
  wrap.id = 'vishnu-btn-wrap';
  wrap.style.cssText = `
    display: flex;
    justify-content: center;
    padding: 10px 0 4px 0;
  `;

  wrap.innerHTML = `
    <button id="vishnu-glow-btn" style="
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
      animation: vishnu-pulse 2s infinite;
      letter-spacing: 0.3px;
      white-space: nowrap;
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      AI Shipping Optimise — Vishnu
    </button>
    <style>
      @keyframes vishnu-pulse {
        0%   { box-shadow: 0 0 8px #a855f7, 0 0 18px #FF3CAC55; }
        50%  { box-shadow: 0 0 18px #a855f7, 0 0 36px #FF3CAC99, 0 0 52px #6C0FFF44; }
        100% { box-shadow: 0 0 8px #a855f7, 0 0 18px #FF3CAC55; }
      }
    </style>
  `;

  container.parentNode.insertBefore(wrap, container);

  document.getElementById('vishnu-glow-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openPopup' });
  });
}

const observer = new MutationObserver(() => {
  injectVishnuButton();
});
observer.observe(document.body, { childList: true, subtree: true });

injectVishnuButton();
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
                     document.querySelector('input[aria-describedby="meesho_price-helper-text"]') ||
                     document.querySelector('input[name="meesho_price"]');
  if (!priceInput) return false;

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  const originalVal = (priceInput.value || '').trim() || '100';
  const originalNum = parseFloat(originalVal);
  const base = Number.isFinite(originalNum) ? originalNum : 100;

  priceInput.focus();
  priceInput.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await new Promise(r => setTimeout(r, 80));

  const tempVal = String(base > 1 ? base - 1 : base + 1);
  nativeInputValueSetter.call(priceInput, tempVal);
  priceInput.dispatchEvent(new Event('input',  { bubbles: true }));
  priceInput.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 120));

  nativeInputValueSetter.call(priceInput, String(base));
  priceInput.dispatchEvent(new Event('input',  { bubbles: true }));
  priceInput.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 80));

  priceInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  priceInput.blur();
  return true;
}

async function uploadImageToMeesho(dataUrl) {
  const input = document.querySelector('input[data-testid="changeFrontImage"]') ||
                document.querySelector('#changeFrontImage') ||
                document.querySelector('input[type="file"][accept*="jpeg"]') ||
                document.querySelector('input[type="file"][accept*="image"]');

  if (!input) return { success: false, error: 'Upload input not found — catalog edit page kholo', shipping: null };

  try {
    const oldShipping = readShippingFromPage();
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], 'meesho_test.jpg', { type: 'image/jpeg' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const nativeFileSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'files'
    ).set;
    nativeFileSetter.call(input, dataTransfer.files);

    // React-friendly change events
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Give Meesho time to accept + process the image
    await new Promise(r => setTimeout(r, 900));
    await prickPriceField();
    await new Promise(r => setTimeout(r, 250));

    let shipping = null;
    const deadline = Date.now() + 2800;
    let stableSince = Date.now();
    let lastValue = null;

    while (Date.now() < deadline) {
      shipping = readShippingFromPage();
      if (shipping !== null) {
        if (shipping !== lastValue) {
          lastValue = shipping;
          stableSince = Date.now();
        }
        // Prefer a value that changed vs previous image
        if (oldShipping === null || shipping !== oldShipping) {
          return { success: true, shipping };
        }
        // Same value but stable — accept it
        if (Date.now() - stableSince >= 450) {
          return { success: true, shipping };
        }
      }
      await new Promise(r => setTimeout(r, 120));
      // Re-prick once mid-wait if still empty
      if (shipping === null && Date.now() - (deadline - 2800) > 1200) {
        await prickPriceField();
      }
    }

    shipping = readShippingFromPage();
    return { success: true, shipping };
  } catch (err) {
    return { success: false, error: err.message, shipping: null };
  }
}

function readShippingFromPage() {
  function extractAmt(txt) {
    const t = String(txt || '').replace(/[\u00a0\u202f\u2009\u2007]/g, ' ').trim();
    // ₹49 / Rs.49 / Rs 49 / INR 49
    const match = t.match(/(?:₹|Rs\.?\s*|INR\s*)(\d{1,4})/i) || t.match(/(\d{1,4})\s*(?:₹|Rs\.?)/i);
    if (!match) return null;
    const v = parseInt(match[1], 10);
    return v > 0 && v < 5000 ? v : null;
  }

  const mlsEl = document.querySelector('[data-mls-applied]');
  if (mlsEl) {
    const val = parseInt(mlsEl.getAttribute('data-mls-applied'), 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // Strong signal: shipping + added separately (Meesho copy)
  for (const el of document.querySelectorAll('p, span, div, h4, h5, h6, td, li, label')) {
    if (el.children.length > 4) continue;
    const txt = (el.textContent || '').replace(/[\u00a0\u202f\u2009\u2007]/g, ' ').trim();
    if (txt.length > 120) continue;
    if (/shipping/i.test(txt)) {
      const v = extractAmt(txt);
      if (v !== null) return v;
    }
  }

  for (const sel of ['[class*="shipping"]','[class*="Shipping"]','[id*="shipping"]','[data-testid*="shipping"]','[data-mls-applied]']) {
    for (const el of document.querySelectorAll(sel)) {
      const v = extractAmt(el.textContent) || extractAmt(el.getAttribute('data-mls-applied'));
      if (v !== null) return v;
    }
  }

  return null;
}

function pageReadyCheck() {
  const input = document.querySelector('input[data-testid="changeFrontImage"]') ||
                document.querySelector('#changeFrontImage') ||
                document.querySelector('input[type="file"][accept*="jpeg"]') ||
                document.querySelector('input[type="file"][accept*="image"]');
  return {
    alive: true,
    hasUpload: !!input,
    shipping: readShippingFromPage()
  };
}

window.__meeshoOptimizerReady = true;
console.log('[Vishnu] Content script loaded');
} // end __vishnuOptimizerLoaded guard
