let uploadedFile = null;
let generatedVariants = [];
let results = [];
let running = false;
let variantCounter = 0;

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  const uploadArea = document.getElementById("uploadArea");
  const fileInput = document.getElementById("fileInput");
  const changeBtn = document.querySelector(".change-btn");
  const generateBtn = document.getElementById("generateBtn");
  const stopBtn = document.getElementById("stopBtn");

  uploadArea.addEventListener("click", () => fileInput.click());
  changeBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    uploadedFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById("previewImg").src = ev.target.result;
      document.getElementById("previewName").textContent = file.name;
      document.getElementById("previewSize").textContent =
        (file.size / 1024).toFixed(1) + " KB";
      document.getElementById("previewWrap").classList.add("visible");
      uploadArea.classList.add("has-image");
      uploadArea.style.display = "none";
      generateBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  });

  generateBtn.addEventListener("click", () => {
    startTargetSearch();
  });
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      running = false;
      showStatus("⏹ Testing stopped.", "");
    });
  }
});

// ─── Target helpers ───────────────────────────────────────────────────────────
function getTargetRange() {
  const minEl = document.getElementById("minShipping");
  const maxEl = document.getElementById("maxShipping");
  const min = minEl ? parseFloat(minEl.value) : NaN;
  const maxRaw = maxEl ? maxEl.value.trim() : "";
  const max = maxRaw === "" ? null : parseFloat(maxRaw);

  if (!Number.isFinite(min) || min < 0) return null;
  if (max !== null && (!Number.isFinite(max) || max < min)) return null;
  return { min, max };
}

function isTargetShipping(shipping, target) {
  if (!Number.isFinite(shipping)) return false;
  return (
    shipping >= target.min && (target.max === null || shipping <= target.max)
  );
}

// ─── Random Generators ─────────────────────────────────────────────────────────
function randomHex() {
  return (
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
  );
}

// Candidate palette: deliberately biased toward light/neutral backgrounds and
// thin, low-contrast borders. This is a search heuristic only; Meesho's actual
// shipping calculation remains the source of truth for every candidate.
const LIGHT_PALETTE = [
  "#FFFFFF",
  "#FAFAFA",
  "#F7F7F7",
  "#F5F5F5",
  "#F2F2F2",
  "#F8FBFF",
  "#F4F9FF",
  "#F7FBF7",
  "#FFF9F2",
  "#FFF7FA",
  "#F6F6FF",
  "#F9F7FF",
  "#F2FAFA",
  "#FCFCFC",
];
const SOFT_PALETTE = [
  "#EAF4FF",
  "#EAFBF3",
  "#FFF1E6",
  "#F4EEFF",
  "#FFEFF4",
  "#EEF7F7",
  "#F5F0E8",
  "#EDF2FF",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomGradient() {
  // 75% light-neutral, 20% soft-color, 5% unrestricted original random.
  const roll = Math.random();
  let palette = roll < 0.75 ? LIGHT_PALETTE : roll < 0.95 ? SOFT_PALETTE : null;
  const type = Math.random() < 0.78 ? "linear" : "radial";
  const angle = Math.floor(Math.random() * 360);
  if (!palette) {
    const c1 = randomHex(),
      c2 = randomHex();
    const c3 = Math.random() > 0.5 ? randomHex() : null;
    if (type === "linear") {
      return c3
        ? `linear-gradient(${angle}deg, ${c1}, ${c2}, ${c3})`
        : `linear-gradient(${angle}deg, ${c1}, ${c2})`;
    }
    return `radial-gradient(circle, ${c1}, ${c2})`;
  }

  const c1 = pick(palette);
  const c2 = pick(palette);
  if (type === "linear") return `linear-gradient(${angle}deg, ${c1}, ${c2})`;
  return `radial-gradient(circle, ${c1}, ${c2})`;
}

function randomBorderStyle() {
  // Bias toward no/very-thin border while retaining occasional variation.
  const roll = Math.random();
  const thickness = roll < 0.25 ? 0 : roll < 0.75 ? 2 : roll < 0.94 ? 4 : 6;
  const color = pick(["#D9D9D9", "#E5E5E5", "#CCCCCC", "#F0F0F0", "#FFFFFF"]);
  return {
    style: "solid",
    thickness,
    color,
    css: `${thickness}px solid ${color}`,
  };
}

// ─── Canvas Image Generator — PARALLEL BATCH ──────────────────────────────────
function getAutoVariantProfile(index) {
  // The six former manual controls are now applied automatically.
  // Every candidate gets a different mix instead of requiring any user selection.
  const n = Math.max(1, Number(index) || 1);
  const cycle = n % 12;
  const whiteBg = cycle === 0 || cycle === 6;
  const gradient = !whiteBg;
  const border = cycle % 5 !== 0;
  const randomSize = cycle % 3 === 0 || cycle % 3 === 1;
  const emoji = cycle === 4 || cycle === 9;
  const salesBadge = cycle === 5 || cycle === 10;
  return { gradient, border, randomSize, whiteBg, emoji, salesBadge };
}

function generateVariantImage(originalDataUrl, index) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 640;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      const profile = getAutoVariantProfile(index);

      if (profile.whiteBg) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
      } else if (profile.gradient) {
        applyGradientToCanvas(ctx, randomGradient(), size);
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
      }

      if (profile.border) {
        const border = randomBorderStyle();
        if (border.thickness > 0) {
          ctx.strokeStyle = border.color;
          ctx.lineWidth = border.thickness;
          ctx.setLineDash([]);
          const half = border.thickness / 2;
          ctx.strokeRect(
            half,
            half,
            size - border.thickness,
            size - border.thickness,
          );
        }
      }

      let pad;
      if (profile.randomSize) {
        const basePad = profile.border ? 60 : 40;
        pad = basePad + Math.floor(Math.random() * 120);
      } else {
        pad = profile.border ? 60 : 40;
      }

      const drawSize = size - pad * 2;
      const aspect = img.width / img.height;
      let dw, dh;
      if (aspect >= 1) {
        dw = drawSize;
        dh = drawSize / aspect;
      } else {
        dh = drawSize;
        dw = drawSize * aspect;
      }
      ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);

      // ── Emoji overlay ──
      if (profile.emoji) {
        const emojis = [
          "🔥",
          "✨",
          "💥",
          "🎉",
          "👑",
          "💎",
          "🌟",
          "🎯",
          "🏆",
          "💫",
          "🎁",
          "🛍️",
          "❤️",
          "😍",
          "🤩",
          "💯",
          "🔝",
          "⚡",
          "🌈",
          "🎀",
        ];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        const positions = [
          { x: size * 0.12, y: size * 0.12 }, // top-left
          { x: size * 0.88, y: size * 0.12 }, // top-right
          { x: size * 0.12, y: size * 0.88 }, // bottom-left
          { x: size * 0.88, y: size * 0.88 }, // bottom-right
          { x: size * 0.5, y: size * 0.1 }, // top-center
        ];
        const pos = positions[Math.floor(Math.random() * positions.length)];
        const emojiSize = Math.floor(Math.random() * 40) + 60; // 60-100px
        ctx.font = `${emojiSize}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji, pos.x, pos.y);
      }

      // ── Sales / Discount badge ──
      if (profile.salesBadge) {
        const badges = [
          { text: "SALE", bg: "#FF3CAC", text2: null },
          { text: "HOT", bg: "#FF4500", text2: null },
          { text: "NEW", bg: "#00C851", text2: null },
          { text: "% OFF", bg: "#FF6B35", text2: null },
          { text: "BEST\nDEAL", bg: "#6C0FFF", text2: null },
          { text: "TOP\nPICK", bg: "#E91E63", text2: null },
        ];
        const badge = badges[Math.floor(Math.random() * badges.length)];
        const bw = 110,
          bh = 110;
        const bx = size - bw - 10,
          by = 10;

        // Ribbon circle badge — top right corner
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx + bw / 2, by + bh / 2, bw / 2, 0, Math.PI * 2);
        ctx.fillStyle = badge.bg;
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Badge border ring
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        // Badge text
        const lines = badge.text.split("\n");
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (lines.length === 1) {
          ctx.font = `bold ${badge.text.length > 3 ? 22 : 28}px Arial`;
          ctx.fillText(badge.text, bx + bw / 2, by + bh / 2);
        } else {
          ctx.font = "bold 22px Arial";
          ctx.fillText(lines[0], bx + bw / 2, by + bh / 2 - 14);
          ctx.fillText(lines[1], bx + bw / 2, by + bh / 2 + 14);
        }
        ctx.restore();
      }

      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.82), index });
    };
    img.src = originalDataUrl;
  });
}

function applyGradientToCanvas(ctx, gradStr, size) {
  let gradient;
  if (gradStr.startsWith("linear")) {
    const angleMatch = gradStr.match(/(\d+)deg/);
    const angle = angleMatch ? parseInt(angleMatch[1]) : 135;
    const rad = ((angle - 90) * Math.PI) / 180;
    gradient = ctx.createLinearGradient(
      size / 2 - (Math.cos(rad) * size) / 2,
      size / 2 - (Math.sin(rad) * size) / 2,
      size / 2 + (Math.cos(rad) * size) / 2,
      size / 2 + (Math.sin(rad) * size) / 2,
    );
  } else {
    gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
  }
  const colors = gradStr.match(/#[0-9a-fA-F]{6}/g) || ["#ffffff", "#eeeeee"];
  colors.forEach((c, i) =>
    gradient.addColorStop(i / Math.max(colors.length - 1, 1), c),
  );
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
}

// ─── Shipping Test — original fast flow + stale-value protection ─────────────
async function getShippingForVariant(variantDataUrl, tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: async (imgData) => {
          function norm(str) {
            return String(str || "")
              .replace(/[\u00a0\u202f\u2009\u2007]/g, " ")
              .trim();
          }

          function extractAmt(txt) {
            const match = norm(txt).match(/₹\s*(\d+)/);
            if (!match) return null;
            const v = parseInt(match[1], 10);
            return v > 0 && v < 5000 ? v : null;
          }

          function readShipping() {
            const mlsEl = document.querySelector("[data-mls-applied]");
            if (mlsEl) {
              const v = parseInt(mlsEl.getAttribute("data-mls-applied"), 10);
              if (Number.isFinite(v) && v > 0) return v;
            }

            // Exact Meesho text used by the original extension.
            for (const el of document.querySelectorAll("p")) {
              const t = norm(el.textContent);
              if (/shipping/i.test(t) && /added separately/i.test(t)) {
                const v = extractAmt(t);
                if (v !== null) return v;
              }
            }

            for (const sel of [
              '[class*="shipping"]',
              '[class*="Shipping"]',
              '[id*="shipping"]',
              '[data-testid*="shipping"]',
            ]) {
              for (const el of document.querySelectorAll(sel)) {
                const v = extractAmt(el.textContent);
                if (v !== null) return v;
              }
            }

            for (const el of document.querySelectorAll(
              "p,span,div,h4,h5,h6,td,li",
            )) {
              if (el.children.length > 3) continue;
              const txt = norm(el.textContent);
              if (txt.length > 80) continue;
              if (/shipping/i.test(txt)) {
                const v = extractAmt(txt);
                if (v !== null) return v;
              }
            }
            return null;
          }

          async function triggerPrice() {
            const priceInput =
              document.getElementById("meesho_price") ||
              document.querySelector(
                'input[aria-describedby="meesho_price-helper-text"]',
              ) ||
              document.querySelector('input[name="meesho_price"]');
            if (!priceInput || !priceInput.value.trim()) return;

            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value",
            ).set;
            const originalVal = priceInput.value;
            const originalNum = parseFloat(originalVal);
            if (!Number.isFinite(originalNum)) return;

            const tempVal = String(
              originalNum > 1 ? originalNum - 1 : originalNum + 1,
            );
            priceInput.dispatchEvent(
              new FocusEvent("focus", { bubbles: true }),
            );
            setter.call(priceInput, tempVal);
            priceInput.dispatchEvent(new Event("input", { bubbles: true }));
            priceInput.dispatchEvent(new Event("change", { bubbles: true }));
            await new Promise((r) => setTimeout(r, 40));
            setter.call(priceInput, originalVal);
            priceInput.dispatchEvent(new Event("input", { bubbles: true }));
            priceInput.dispatchEvent(new Event("change", { bubbles: true }));
            priceInput.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
          }

          const input =
            document.querySelector('input[data-testid="changeFrontImage"]') ||
            document.querySelector("#changeFrontImage") ||
            document.querySelector('input[type="file"][accept*="jpeg"]') ||
            document.querySelector('input[type="file"][accept*="image"]');
          if (!input)
            return { shipping: null, error: "Upload input not found" };

          const oldShipping = readShipping();

          const res = await fetch(imgData);
          const blob = await res.blob();
          const file = new File([blob], "test_variant.jpg", {
            type: "image/jpeg",
          });
          const dt = new DataTransfer();
          dt.items.add(file);
          const fileSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "files",
          ).set;
          fileSetter.call(input, dt.files);
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.dispatchEvent(new Event("input", { bubbles: true }));

          // Fast path: ~0.8–1.2s per variant so whole search fits in ≤10s.
          await new Promise((r) => setTimeout(r, 350));
          await triggerPrice();
          await new Promise((r) => setTimeout(r, 80));

          const deadline = Date.now() + 900;
          let lastValue = null;
          let stableSince = Date.now();

          while (Date.now() < deadline) {
            const value = readShipping();
            if (value !== null) {
              if (value !== lastValue) {
                lastValue = value;
                stableSince = Date.now();
              }

              if (oldShipping === null || value !== oldShipping) {
                return { shipping: value };
              }

              if (Date.now() - stableSince >= 220) {
                return { shipping: value };
              }
            }
            await new Promise((r) => setTimeout(r, 50));
          }

          return { shipping: readShipping() };
        },
        args: [variantDataUrl],
      },
      (execResults) => {
        const r = execResults && execResults[0] && execResults[0].result;
        resolve(r ? r.shipping : null);
      },
    );
  });
}

// ─── Target Search Flow — continuous, fast batches, stop immediately on hit ───
async function startTargetSearch() {
  if (!uploadedFile || running) return;

  const target = getTargetRange();
  if (!target) {
    showStatus("⚠️ Target range invalid. Minimum/maximum check karo.", "error");
    return;
  }

  const tabs = await chrome.tabs.query({
    url: "https://supplier.meesho.com/*",
  });
  const targetTab = tabs.length ? tabs[0] : null;
  if (!targetTab) {
    showStatus("⚠️ Pehle Meesho Supplier catalog page kholo!", "error");
    return;
  }

  running = true;
  variantCounter = 0;
  generatedVariants = [];
  results = [];

  const SEARCH_BUDGET_MS = 10000;
  const searchStartedAt = Date.now();
  const timeLeft = () => SEARCH_BUDGET_MS - (Date.now() - searchStartedAt);

  const generateBtn = document.getElementById("generateBtn");
  const stopBtnEl = document.getElementById("stopBtn");
  generateBtn.disabled = true;
  generateBtn.style.display = "none";
  if (stopBtnEl) stopBtnEl.style.display = "block";
  document.getElementById("progressWrap").classList.add("visible");
  document.getElementById("resultsSection").classList.remove("visible");
  document.getElementById("resultsGrid").innerHTML = "";
  showStatus(
    `🎯 Target: ₹${target.min}${target.max === null ? "+" : "–₹" + target.max} — fast search (≤10s)...`,
    "",
  );

  // Small parallel batch so generation + tests fit inside 10s.
  const BATCH_SIZE = 8;

  function pickBestNearTarget() {
    const scored = results.filter((r) => r.shipping !== null);
    if (!scored.length) return null;
    scored.sort((a, b) => {
      const da = Math.abs(Number(a.shipping) - target.min);
      const db = Math.abs(Number(b.shipping) - target.min);
      if (da !== db) return da - db;
      return Number(a.shipping) - Number(b.shipping);
    });
    return scored[0];
  }

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const originalDataUrl = ev.target.result;
    let foundHit = false;
    try {
      while (running && timeLeft() > 600) {
        const batchStart = variantCounter + 1;
        const indexes = Array.from(
          { length: BATCH_SIZE },
          (_, i) => batchStart + i,
        );

        updateProgress(
          variantCounter,
          Math.max(variantCounter + 1, batchStart + BATCH_SIZE - 1),
          `🎨 Generating ${BATCH_SIZE} candidates... (${Math.max(0, Math.ceil(timeLeft() / 1000))}s left)`,
        );

        const batch = await Promise.all(
          indexes.map((index) => generateVariantImage(originalDataUrl, index)),
        );
        if (!running) break;

        generatedVariants.push(...batch);

        for (const variant of batch) {
          if (!running || timeLeft() < 500) break;

          variantCounter = variant.index;
          updateProgress(
            variantCounter,
            variantCounter + 1,
            `🚀 Testing #${variant.index} · ${Math.max(0, Math.ceil(timeLeft() / 1000))}s left`,
          );

          let shipping = null;
          try {
            shipping = await getShippingForVariant(
              variant.dataUrl,
              targetTab.id,
            );
          } catch (err) {
            console.error("[Vishnu Shipping] Shipping test error:", err);
          }

          if (!running) break;

          results.push({
            dataUrl: variant.dataUrl,
            shipping,
            index: variant.index,
            shippingSort: shipping === null ? 99999 : Number(shipping),
            shippingDisplay: shipping === null ? "N/A" : `₹${shipping}`,
          });

          if (shipping === null) {
            showStatus(
              `⏳ Variant #${variant.index}: shipping detect nahi hui — next...`,
              "",
            );
            continue;
          }

          const numericShipping = Number(shipping);
          const hit = isTargetShipping(numericShipping, target);
          showStatus(
            `🔍 Variant #${variant.index}: Shipping ₹${numericShipping}${hit ? " — 🎯 TARGET HIT!" : ""}`,
            hit ? "success" : "",
          );

          if (hit) {
            running = false;
            foundHit = true;
            showTargetResult(variant, numericShipping, target);
            await uploadSelectedVariant(variant.index);
            break;
          }
        }

        if (foundHit || !running || timeLeft() < 500) break;
      }

      if (!foundHit) {
        const best = pickBestNearTarget();
        if (best) {
          const variant = { dataUrl: best.dataUrl, index: best.index };
          showTargetResult(variant, Number(best.shipping), target);
          await uploadSelectedVariant(best.index);
          const elapsed = ((Date.now() - searchStartedAt) / 1000).toFixed(1);
          showStatus(
            `⏱ ${elapsed}s — exact target nahi mila. Closest ₹${best.shipping} upload kiya.`,
            "success",
          );
        } else {
          showStatus(
            "⚠️ 10s mein shipping detect nahi hui. Page refresh karke dobara try karo.",
            "error",
          );
        }
      }
    } catch (err) {
      console.error("[Vishnu Shipping] Search error:", err);
      showStatus("❌ Error: " + err.message, "error");
    } finally {
      running = false;
      const stopButton = document.getElementById("stopBtn");
      const generateButton = document.getElementById("generateBtn");
      if (stopButton) stopButton.style.display = "none";
      if (generateButton) {
        generateButton.style.display = "block";
        generateButton.disabled = !uploadedFile;
      }
    }
  };

  reader.readAsDataURL(uploadedFile);
}

function showTargetResult(variant, shipping, target) {
  const section = document.getElementById("resultsSection");
  const grid = document.getElementById("resultsGrid");
  const targetText =
    target.max === null ? `₹${target.min}+` : `₹${target.min}–₹${target.max}`;
  document.getElementById("progressFill").style.width = "100%";
  document.getElementById("progressText").textContent = "🎯 Target found!";
  document.getElementById("progressCount").textContent =
    `${variant.index} tested`;
  grid.innerHTML = `
    <div class="result-card rank-1">
      <div class="rank-badge">🎯</div>
      <div class="result-img-wrap" style="background:#111">
        <img src="${variant.dataUrl}" alt="target variant">
      </div>
      <div class="result-info">
        <div class="shipping-tag">TARGET SHIPPING</div>
        <div class="shipping-val">₹${shipping}</div>
        <div style="font-size:10px;color:#aaa;margin-top:3px">Target: ${targetText}</div>
        <button class="select-btn selected" id="targetUploadBtn">✅ Uploaded to Meesho</button>
        <a class="download-btn" href="${variant.dataUrl}" download="target_shipping_variant_${shipping}.jpg">⬇ Download</a>
      </div>
    </div>`;
  section.classList.add("visible");
  showStatus(
    `🎯 Target ₹${shipping} found! Image automatically uploaded.`,
    "success",
  );
}

// ─── Display Results ───────────────────────────────────────────────────────────
function displayResults(top6, autoSelectedIndex) {
  const grid = document.getElementById("resultsGrid");
  grid.innerHTML = "";
  const medals = ["🥇", "🥈", "🥉", "4", "5", "6"];
  const rankNames = [
    "rank-1",
    "rank-2",
    "rank-3",
    "rank-4",
    "rank-5",
    "rank-6",
  ];

  top6.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = `result-card ${rankNames[i]}`;
    const isAutoSelected = item.index === autoSelectedIndex;

    const shippingClass =
      item.shipping === null
        ? "shipping-na"
        : item.shipping <= 50
          ? "shipping-low"
          : item.shipping <= 100
            ? "shipping-mid"
            : "shipping-high";

    card.innerHTML = `
      <div class="rank-badge">${medals[i]}</div>
      <div class="result-img-wrap" style="background:#111">
        <img src="${item.dataUrl}" alt="variant ${i + 1}">
      </div>
      <div class="result-info">
        <div class="shipping-tag">Shipping</div>
        <div class="shipping-val ${shippingClass}">${item.shippingDisplay}</div>
        <button class="select-btn ${isAutoSelected ? "selected" : ""}" data-index="${item.index}" data-shipping="${item.shippingDisplay}">
          ${isAutoSelected ? "✅ Auto-Selected" : "☑ Select & Upload"}
        </button>
        <a class="download-btn" href="${item.dataUrl}" download="variant_rank${i + 1}_${item.shippingDisplay.replace("₹", "rs")}.jpg">⬇ Download</a>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll(".select-btn").forEach((btn) => {
    btn.addEventListener("click", async function () {
      grid.querySelectorAll(".select-btn").forEach((b) => {
        b.classList.remove("selected");
        b.textContent = "☑ Select & Upload";
      });
      this.classList.add("selected");
      this.textContent = "✅ Uploading...";
      const idx = parseInt(this.dataset.index);

      // Upload karo aur phir fresh shipping capture karo
      const tabs = await chrome.tabs.query({
        url: "https://supplier.meesho.com/*",
      });
      const targetTab = tabs.length > 0 ? tabs[0] : null;

      await uploadSelectedVariant(idx);
      this.textContent = "🔄 Shipping check...";

      // Fresh shipping capture (image upload ke baad)
      let freshShipping = null;
      if (targetTab) {
        try {
          const variant = generatedVariants.find((v) => v.index === idx);
          if (variant) {
            freshShipping = await getShippingForVariant(
              variant.dataUrl,
              targetTab.id,
            );
          }
        } catch (e) {
          freshShipping = null;
        }
      }

      // Card ka shipping display update karo
      const shippingValEl =
        this.closest(".result-info").querySelector(".shipping-val");
      if (shippingValEl) {
        if (freshShipping !== null) {
          const newDisplay = `₹${freshShipping}`;
          shippingValEl.textContent = newDisplay;
          shippingValEl.className =
            "shipping-val " +
            (freshShipping <= 50
              ? "shipping-low"
              : freshShipping <= 100
                ? "shipping-mid"
                : "shipping-high");
          this.dataset.shipping = newDisplay;
        } else {
          shippingValEl.textContent = "N/A";
          shippingValEl.className = "shipping-val shipping-na";
        }
      }

      this.textContent = "✅ Uploaded!";
    });
  });

  document.getElementById("resultsSection").classList.add("visible");
}

// ─── Upload Selected Variant to Meesho ────────────────────────────────────────
async function uploadSelectedVariant(index) {
  const variant = generatedVariants.find((v) => v.index === index);
  if (!variant) return;

  try {
    const tabs = await chrome.tabs.query({
      url: "https://supplier.meesho.com/*",
    });
    const targetTab = tabs.length > 0 ? tabs[0] : null;
    if (!targetTab) return;

    await chrome.tabs.update(targetTab.id, { active: true });
    await new Promise((r) => setTimeout(r, 150));

    const execution = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: async (imgData) => {
        const input =
          document.querySelector('input[data-testid="changeFrontImage"]') ||
          document.querySelector("#changeFrontImage") ||
          document.querySelector('input[type="file"][accept*="jpeg"]') ||
          document.querySelector('input[type="file"][accept*="image"]');
        if (!input) return { success: false };
        const res = await fetch(imgData);
        const blob = await res.blob();
        const file = new File([blob], "selected_variant.jpg", {
          type: "image/jpeg",
        });
        const dt = new DataTransfer();
        dt.items.add(file);
        const nativeFileSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "files",
        ).set;
        nativeFileSetter.call(input, dt.files);
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return { success: true };
      },
      args: [variant.dataUrl],
    });
    const r = execution && execution[0] && execution[0].result;
    if (r && r.success) {
      showStatus("✅ Target image automatically upload ho gayi!", "success");
    } else {
      showStatus(
        "⚠️ Target mil gaya, lekin image upload nahi ho saki.",
        "error",
      );
    }
  } catch (e) {
    console.error("Upload error:", e);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function updateProgress(current, total, text) {
  const pct = Math.round((current / total) * 100);
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressCount").textContent =
    `${current} / ${total}`;
  if (text) document.getElementById("progressText").textContent = text;
}

function showStatus(msg, type) {
  const el = document.getElementById("statusMsg");
  el.textContent = msg;
  el.className = "status-msg";
  if (msg) el.classList.add("visible");
  if (type) el.classList.add(type);
}
