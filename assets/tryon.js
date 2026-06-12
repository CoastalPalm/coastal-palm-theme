// =============================================================
//  Coastal Palm — AI Try-On widget
//  Renders a full-screen modal that uploads a customer photo,
//  hits POST /api/tryon, and shows the generated result.
// =============================================================

(function () {
  // ---------- Modal markup (injected once on first open) ----------
  const MODAL_HTML = `
    <div class="tryon-modal" id="tryonModal" aria-hidden="true">
      <div class="tryon-backdrop" data-close></div>
      <div class="tryon-dialog" role="dialog" aria-modal="true" aria-labelledby="tryonTitle">
        <button class="tryon-close" data-close aria-label="Close">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <header class="tryon-header">
          <span class="ai-tag">AI Try-On</span>
          <h2 id="tryonTitle">See it on you</h2>
          <p id="tryonProductName">Palm Linen Midi Dress · Ivory</p>
        </header>

        <div class="tryon-body">
          <!-- LEFT: your photo -->
          <div class="tryon-pane">
            <div class="tryon-pane-label">Your photo</div>
            <div class="tryon-frame" id="userFrame">
              <div class="tryon-upload-prompt" id="uploadPrompt">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <p><strong>Drop a photo here</strong><br>or click to upload</p>
                <small>Full body, plain background, facing the camera works best</small>
              </div>
              <img class="tryon-img" id="userImg" alt="">
            </div>
            <input type="file" id="userPhotoInput" accept="image/*" hidden>
            <button class="btn btn-outline btn-sm tryon-change" id="changePhotoBtn" hidden>Change photo</button>
          </div>

          <!-- CENTER: arrow -->
          <div class="tryon-arrow" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </div>

          <!-- RIGHT: garment + result -->
          <div class="tryon-pane">
            <div class="tryon-pane-label">On you</div>
            <div class="tryon-frame" id="resultFrame">
              <img class="tryon-img garment-preview" id="garmentImg" alt="">
              <div class="tryon-loading" id="loadingOverlay" hidden>
                <div class="tryon-spinner"></div>
                <p><strong>Dressing you in linen…</strong></p>
                <small id="loadingHint">Usually 20–60 seconds</small>
              </div>
              <div class="tryon-error" id="errorOverlay" hidden>
                <p><strong>Hmm, that didn't work.</strong></p>
                <small id="errorMessage"></small>
                <button class="btn btn-outline btn-sm" data-retry>Try again</button>
              </div>
            </div>
          </div>
        </div>

        <div class="tryon-preview-banner" id="previewBanner" hidden>
          <strong>Preview mode</strong> — quick overlay using a transparent garment cutout. For photo-realistic AI try-on, fund Replicate credit in your account.
        </div>

        <footer class="tryon-footer">
          <small class="tryon-privacy">
            Your photo is sent to our AI partner for processing and not stored on our servers.
          </small>
          <div class="tryon-actions">
            <button class="btn btn-outline" id="generateBtn" disabled>Generate try-on</button>
            <button class="btn btn-primary" id="addToBagBtn" hidden>Add to bag — $118</button>
            <a class="btn btn-ghost" id="downloadBtn" hidden download="coastal-palm-tryon.png">Save image</a>
          </div>
        </footer>
      </div>
    </div>
  `;

  let currentProduct = null;
  let currentFile = null;
  let mounted = false;

  // ---------- Public API ----------
  window.CoastalPalmTryOn = {
    open(product) {
      currentProduct = product;
      mountIfNeeded();
      resetUI();
      document.getElementById('tryonProductName').textContent =
        `${product.name}${product.color ? ' · ' + product.color : ''}`;
      document.getElementById('garmentImg').src = product.image;
      document.getElementById('tryonModal').classList.add('open');
      document.body.style.overflow = 'hidden';
    },
    close() {
      const m = document.getElementById('tryonModal');
      if (m) m.classList.remove('open');
      document.body.style.overflow = '';
    },
  };

  // ---------- Mount ----------
  function mountIfNeeded() {
    if (mounted) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = MODAL_HTML;
    document.body.appendChild(wrap.firstElementChild);
    bindEvents();
    mounted = true;
  }

  function bindEvents() {
    const modal = document.getElementById('tryonModal');
    const input = document.getElementById('userPhotoInput');
    const frame = document.getElementById('userFrame');

    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]')) window.CoastalPalmTryOn.close();
      if (e.target.matches('[data-retry]')) handleGenerate();
    });

    document.getElementById('changePhotoBtn').addEventListener('click', () => input.click());
    frame.addEventListener('click', () => {
      if (!currentFile) input.click();
    });

    // Drag-and-drop
    ['dragover', 'dragenter'].forEach((ev) =>
      frame.addEventListener(ev, (e) => {
        e.preventDefault();
        frame.classList.add('drag');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      frame.addEventListener(ev, (e) => {
        e.preventDefault();
        frame.classList.remove('drag');
      })
    );
    frame.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });

    document.getElementById('generateBtn').addEventListener('click', handleGenerate);

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        window.CoastalPalmTryOn.close();
      }
    });
  }

  // ---------- File handling ----------
  async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }
    // Resize before showing/uploading so we don't ship a 12MB phone photo to the server
    const resized = await resizeImage(file, 1024);
    currentFile = resized;

    const img = document.getElementById('userImg');
    img.src = URL.createObjectURL(resized);
    img.style.display = 'block';
    document.getElementById('uploadPrompt').style.display = 'none';
    document.getElementById('changePhotoBtn').hidden = false;
    document.getElementById('generateBtn').disabled = false;

    // Reset result state when picking a new photo
    document.getElementById('garmentImg').classList.add('garment-preview');
    document.getElementById('loadingOverlay').hidden = true;
    document.getElementById('errorOverlay').hidden = true;
    document.getElementById('addToBagBtn').hidden = true;
    document.getElementById('downloadBtn').hidden = true;
    setPreviewBanner(false);
  }

  function setPreviewBanner(visible) {
    const el = document.getElementById('previewBanner');
    if (el) el.hidden = !visible;
  }

  function resizeImage(file, maxDim) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' })),
          'image/jpeg',
          0.88
        );
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- Generation ----------
  async function handleGenerate() {
    if (!currentFile || !currentProduct) return;

    document.getElementById('errorOverlay').hidden = true;
    document.getElementById('loadingOverlay').hidden = false;
    document.getElementById('generateBtn').disabled = true;
    document.getElementById('addToBagBtn').hidden = true;
    document.getElementById('downloadBtn').hidden = true;

    // Rotate friendly loading hints
    const hints = [
      'Usually 20–60 seconds',
      'Reading the fabric and fit…',
      'Matching the drape to your frame…',
      'Almost there — finishing the lighting…',
    ];
    let i = 0;
    const hintEl = document.getElementById('loadingHint');
    const hintTimer = setInterval(() => {
      i = (i + 1) % hints.length;
      hintEl.textContent = hints[i];
    }, 7000);

    try {
      // Replicate requires a full https:// URI for garment_url. Shopify's
      // image_url filter returns protocol-relative (//cdn.shopify.com/…) —
      // normalize any non-https input before posting.
      const normalizeUrl = (u) => {
        if (!u) return u;
        if (u.startsWith('//')) return 'https:' + u;
        if (u.startsWith('http://')) return 'https://' + u.slice(7);
        return u;
      };

      const fd = new FormData();
      fd.append('user_photo', currentFile);
      fd.append('garment_url', normalizeUrl(currentProduct.image));
      fd.append('garment_description', currentProduct.description);
      fd.append('category', currentProduct.category || 'dresses');
      // Demo-mode params: if the product has a transparent garment cutout,
      // the server can fall back to a sharp-based composite when Replicate is unavailable.
      if (currentProduct.garmentPng) fd.append('garment_png', currentProduct.garmentPng);
      if (currentProduct.garmentFit) fd.append('garment_fit', currentProduct.garmentFit);

      // currentProduct.endpoint is set on Shopify (theme settings → AI Try-On URL).
      // EJS prototype leaves it null and falls through to the same-origin path.
      const endpoint = (currentProduct && currentProduct.endpoint) || '/api/tryon';
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text();
        let msg;
        try { msg = JSON.parse(text).error; } catch { msg = text.slice(0, 120) || `Try-on failed (${res.status}).`; }
        throw new Error(msg);
      }
      const data = await res.json();

      // Swap the garment preview for the result
      const garmentImg = document.getElementById('garmentImg');
      garmentImg.src = data.result_url;
      garmentImg.classList.remove('garment-preview');

      // Surface preview-mode if the server fell back to local composite
      setPreviewBanner(data.mode === 'demo');

      document.getElementById('addToBagBtn').hidden = false;
      const dl = document.getElementById('downloadBtn');
      dl.href = data.result_url;
      dl.hidden = false;
    } catch (err) {
      document.getElementById('errorMessage').textContent =
        err.message + ' — try a full-body photo with a plain background.';
      document.getElementById('errorOverlay').hidden = false;
    } finally {
      clearInterval(hintTimer);
      document.getElementById('loadingOverlay').hidden = true;
      document.getElementById('generateBtn').disabled = false;
    }
  }

  function resetUI() {
    currentFile = null;
    const img = document.getElementById('userImg');
    if (img) {
      img.src = '';
      img.style.display = 'none';
    }
    const prompt = document.getElementById('uploadPrompt');
    if (prompt) prompt.style.display = '';
    const change = document.getElementById('changePhotoBtn');
    if (change) change.hidden = true;
    const gen = document.getElementById('generateBtn');
    if (gen) gen.disabled = true;
    const garmentImg = document.getElementById('garmentImg');
    if (garmentImg) garmentImg.classList.add('garment-preview');
    ['loadingOverlay', 'errorOverlay', 'previewBanner'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    ['addToBagBtn', 'downloadBtn'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
  }
})();
