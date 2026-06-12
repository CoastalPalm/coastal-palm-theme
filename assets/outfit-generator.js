// =============================================================
//  Outfit Generator — /plan-your-trip
//  Form submit → /api/outfit-generator/create → grid render
//  Swap-this-piece → /api/outfit-generator/alternatives → modal
//  Add-the-whole-wardrobe → site bag (prototype) / Shopify cart (theme)
// =============================================================

(function () {
  const form        = document.getElementById('planForm');
  const result      = document.getElementById('planResult');
  const loading     = document.getElementById('planLoading');
  const submit      = document.getElementById('planSubmit');
  const countInput  = document.getElementById('planCount');
  const countValue  = document.getElementById('planCountValue');
  const swap        = document.getElementById('planSwap');
  const swapGrid    = document.getElementById('planSwapGrid');
  const swapSub     = document.getElementById('planSwapSub');
  if (!form) return;

  // Endpoint URLs come from the .plan-section's data-endpoint-* attributes
  // when set (Shopify theme passes the Vercel URL via theme settings). Falls
  // back to the same-origin /api/* paths for the local EJS prototype.
  const section = document.querySelector('.plan-section');
  const ENDPOINT_CREATE = section?.dataset.endpointCreate || '/api/outfit-generator/create';
  const ENDPOINT_ALT    = section?.dataset.endpointAlt    || '/api/outfit-generator/alternatives';

  let currentCapsule = null;     // {capsule_id, outfits:[{slug,occasion,reasoning,image,name,price,...}], ...}
  let swappingIdx    = -1;       // index of outfit being swapped

  // ---------- Slider ----------
  countInput.addEventListener('input', () => {
    countValue.textContent = countInput.value;
  });

  // ---------- Submit ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const occasions = fd.getAll('occasions');
    const payload = {
      destination: fd.get('destination') || '',
      dates: { start: fd.get('start') || '', end: fd.get('end') || '' },
      occasions,
      count: Number(fd.get('count') || 4),
      prefs: fd.get('prefs') || '',
      budget: fd.get('budget') || null,
    };

    setLoading(true);
    result.hidden = true;
    loading.hidden = false;

    try {
      const resp = await fetch(ENDPOINT_CREATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(`Palm couldn't pack the bag (${resp.status})`);
      const data = await resp.json();
      currentCapsule = data;
      renderResult(data);
    } catch (err) {
      renderError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
      loading.hidden = true;
      result.hidden = false;
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  function setLoading(on) {
    submit.disabled = on;
    submit.querySelector('.plan-submit-default').hidden = on;
    submit.querySelector('.plan-submit-loading').hidden = !on;
  }

  // ---------- Render ----------
  function renderResult(data) {
    const { summary, outfits, total, discount, discounted_total, bundle_applied, bundle_threshold, bundle_pct, discount_code } = data;
    const destination = form.querySelector('[name="destination"]').value || 'your trip';

    const head = `
      <div class="plan-result-head">
        <span class="eyebrow">Your capsule</span>
        <h2>Packed for <strong>${escapeHtml(destination)}</strong> · ${outfits.length} pieces</h2>
        ${summary ? `<p class="plan-result-summary">${escapeHtml(summary)}</p>` : ''}
      </div>`;

    const cards = outfits.map((o, i) => `
      <article class="plan-card" data-idx="${i}">
        <a href="${o.url}" class="plan-card-image" aria-label="View ${escapeHtml(o.name)}">
          <img src="${o.image}" alt="${escapeHtml(o.name)}" loading="lazy">
        </a>
        <div class="plan-card-body">
          <span class="plan-card-occasion">${escapeHtml(o.occasion)}</span>
          <h3 class="plan-card-name"><a href="${o.url}">${escapeHtml(o.name)}</a></h3>
          <div class="plan-card-price">$${o.price}</div>
          ${o.reasoning ? `<p class="plan-card-reasoning">${escapeHtml(o.reasoning)}</p>` : ''}
          <button type="button" class="plan-card-swap" data-swap data-idx="${i}">Swap this piece</button>
        </div>
      </article>
    `).join('');

    const bundleLine = bundle_applied
      ? `<div class="plan-totals-row plan-totals-row--discount">
           <span>Bundle discount (${Math.round(bundle_pct * 100)}%)</span>
           <span>−$${discount}</span>
         </div>`
      : `<div class="plan-totals-hint">Add ${bundle_threshold - outfits.length} more piece${(bundle_threshold - outfits.length) === 1 ? '' : 's'} to unlock an 8% bundle discount.</div>`;

    const cta = `
      <div class="plan-totals">
        <div class="plan-totals-row"><span>Subtotal</span><span>$${total}</span></div>
        ${bundleLine}
        <div class="plan-totals-row plan-totals-row--final">
          <span>Pack this trip</span>
          <span>$${discounted_total}</span>
        </div>
        <button type="button" class="btn btn-primary plan-add-all" id="planAddAll">Add the whole wardrobe to bag</button>
        ${discount_code ? `<p class="plan-discount-code">Discount code <strong>${discount_code}</strong> will auto-apply at checkout.</p>` : ''}
        <button type="button" class="plan-save-link" id="planSaveLink">Or save this trip for later</button>
      </div>`;

    result.innerHTML = head + `<div class="plan-grid">${cards}</div>` + cta;
  }

  function renderError(message) {
    result.innerHTML = `
      <div class="plan-error">
        <h2>Palm needs a minute</h2>
        <p>${escapeHtml(message)}</p>
        <button type="button" class="btn btn-outline" onclick="window.location.reload()">Try again</button>
      </div>`;
  }

  // ---------- Swap ----------
  result.addEventListener('click', async (e) => {
    const swapBtn = e.target.closest('[data-swap]');
    if (swapBtn) {
      const idx = Number(swapBtn.dataset.idx);
      openSwap(idx);
      return;
    }
    if (e.target.closest('#planAddAll')) {
      addWholeWardrobe();
      return;
    }
    if (e.target.closest('#planSaveLink')) {
      saveForLater();
    }
  });

  async function openSwap(idx) {
    if (!currentCapsule) return;
    swappingIdx = idx;
    const piece = currentCapsule.outfits[idx];
    swapSub.textContent = `Alternatives Palm picked to replace ${piece.name}.`;
    swapGrid.innerHTML = '<p class="plan-swap-loading">Loading alternatives…</p>';
    swap.hidden = false;
    requestAnimationFrame(() => swap.classList.add('is-open'));

    try {
      const resp = await fetch(ENDPOINT_ALT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: piece.slug,
          capsule_slugs: currentCapsule.outfits.map(o => o.slug),
          count: 6,
        }),
      });
      const data = await resp.json();
      renderSwapAlternatives(data.alternatives || []);
    } catch {
      swapGrid.innerHTML = '<p class="plan-swap-loading">Couldn\'t load alternatives. Close and try again.</p>';
    }
  }

  function renderSwapAlternatives(alts) {
    if (!alts.length) {
      swapGrid.innerHTML = '<p class="plan-swap-loading">No alternatives found. Try a different swap.</p>';
      return;
    }
    swapGrid.innerHTML = alts.map(a => `
      <article class="plan-swap-card" data-pick="${a.slug}">
        <div class="plan-swap-image">
          <img src="${a.image}" alt="${escapeHtml(a.name)}" loading="lazy">
        </div>
        <div class="plan-swap-meta">
          <h4>${escapeHtml(a.name)}</h4>
          <div class="plan-swap-price">$${a.price}</div>
          ${a.reasoning ? `<p>${escapeHtml(a.reasoning)}</p>` : ''}
          <button type="button" class="btn btn-outline plan-swap-pick">Use this instead</button>
        </div>
      </article>
    `).join('');
  }

  swap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-swap]')) { closeSwap(); return; }
    const card = e.target.closest('[data-pick]');
    if (!card) return;
    const newSlug = card.dataset.pick;
    pickSwap(newSlug);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !swap.hidden) closeSwap();
  });

  function closeSwap() {
    swap.classList.remove('is-open');
    setTimeout(() => { swap.hidden = true; }, 200);
  }

  function pickSwap(newSlug) {
    if (swappingIdx < 0 || !currentCapsule) { closeSwap(); return; }
    const local = (window.__CP_CATALOG__ || {})[newSlug];
    if (!local) { closeSwap(); return; }
    const old = currentCapsule.outfits[swappingIdx];
    const replacement = {
      slug: newSlug,
      name: local.name,
      price: local.price,
      image: local.image,
      url: `/product/${newSlug}`,
      occasion: old.occasion,
      reasoning: 'Your pick — swapped in to match the same slot.',
    };
    currentCapsule.outfits[swappingIdx] = replacement;

    // Re-price the capsule client-side. Mirrors the server-side math.
    const BUNDLE_THRESHOLD = 5;
    const BUNDLE_PCT = 0.08;
    const total = currentCapsule.outfits.reduce((s, o) => s + o.price, 0);
    const eligible = currentCapsule.outfits.length >= BUNDLE_THRESHOLD;
    currentCapsule.total = total;
    currentCapsule.discount = eligible ? Math.round(total * BUNDLE_PCT) : 0;
    currentCapsule.discounted_total = total - currentCapsule.discount;
    currentCapsule.bundle_applied = eligible;

    renderResult(currentCapsule);
    closeSwap();
  }

  // ---------- Add whole wardrobe ----------
  function addWholeWardrobe() {
    if (!currentCapsule) return;
    // Prototype: rely on the existing site-wide bag (localStorage counter).
    // On Shopify, this same hook will call the Cart AJAX API — that wiring
    // lives in the Liquid mirror of this script. The button is one ladder
    // rung, two implementations.
    if (window.CoastalPalmBag) {
      currentCapsule.outfits.forEach(() => window.CoastalPalmBag.add());
    }
    if (window.CoastalPalmToast) {
      const code = currentCapsule.discount_code;
      window.CoastalPalmToast(`<strong>${currentCapsule.outfits.length} pieces added to bag</strong>${code ? ` · ${code} applies at checkout` : ''}`);
    }
  }

  function saveForLater() {
    const email = window.prompt('Drop your email and we\'ll save this trip — and send a 7-day discount code:');
    if (!email) return;
    // No backend persistence in v1 — capture-only. The PRD allows for
    // a Klaviyo-flow integration later; for now we just confirm.
    if (window.CoastalPalmToast) {
      window.CoastalPalmToast(`<strong>Saved.</strong> We'll email ${escapeHtml(email)} the link.`);
    }
  }

  // ---------- Helpers ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
})();
