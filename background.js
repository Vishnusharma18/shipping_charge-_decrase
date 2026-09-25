// Background service worker for ecomwithnabeel Meesho Shipping Optimizer

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Meesho Optimizer] Extension installed');
});

// Handle messages between popup and content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    chrome.action.openPopup();
    return;
  }
  if (request.action === 'testVariant') {
    handleVariantTest(request.tabId, request.dataUrl)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleVariantTest(tabId, dataUrl) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (imgData) => {
        const input = document.querySelector('input[data-testid="changeFrontImage"]') ||
                      document.querySelector('#changeFrontImage');

        if (!input) return { shipping: null, error: 'No input found' };

        const res = await fetch(imgData);
        const blob = await res.blob();
        const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 4000));

        // Read shipping
        const shippingEl = document.querySelector('[data-mls-applied]');
        const val = shippingEl ? parseInt(shippingEl.getAttribute('data-mls-applied')) : null;

        // Also try text-based
        if (!val) {
          const allEls = document.querySelectorAll('p,span,h4');
          for (const el of allEls) {
            if (el.textContent.includes('Shipping')) {
              const m = el.textContent.match(/₹(\d+)/);
              if (m) return { shipping: parseInt(m[1]) };
            }
          }
        }

        return { shipping: val };
      },
      args: [dataUrl]
    });

    return results[0]?.result || { shipping: null };
  } catch (err) {
    return { error: err.message, shipping: null };
  }
}
