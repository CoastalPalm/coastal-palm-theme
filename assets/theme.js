// =============================================================
//  Coastal Palm — Shopify theme behavior
//  Mobile drawer, real Shopify cart integration, toast, quick-add.
//  Diverges from the EJS prototype (public/site.js) in one spot:
//  the bag here is the actual Shopify cart, not a localStorage counter.
// =============================================================
(function () {
  // ---------- Mobile drawer ----------
  const drawer = document.getElementById('mobileDrawer');
  const toggle = document.getElementById('navToggle');
  if (drawer && toggle) {
    const open = () => {
      drawer.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      drawer.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };
    toggle.addEventListener('click', open);
    drawer.addEventListener('click', (e) => {
      if (e.target.matches('[data-drawer-close]') || e.target.closest('[data-drawer-close]')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
  }

  // ---------- Cart badge ----------
  // Hydrate from Shopify's /cart.js on load, then refresh after each add.
  const badge = document.getElementById('cartBadge');
  const renderBadge = (count) => {
    if (!badge) return;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  };
  function refreshBadge() {
    return fetch('/cart.js', { headers: { 'Accept': 'application/json' } })
      .then(r => r.json())
      .then(cart => renderBadge(cart.item_count || 0))
      .catch(() => {});
  }
  refreshBadge();

  // ---------- Quick Add from product cards ----------
  // The card button carries data-quick-add="<variant_id>". We POST to
  // /cart/add.js, refresh the badge, show a toast. No page navigation.
  window.CoastalPalmQuickAdd = async function (btn) {
    const variantId = btn.dataset.quickAdd;
    if (!variantId) {
      toast('<strong>Heads up</strong> · Pick a size first.');
      // Send them to the PDP if no default variant.
      const card = btn.closest('.product-card');
      if (card && card.href) window.location.href = card.href;
      return;
    }
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Adding…';
    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const added = await res.json();
      await refreshBadge();
      const title = (added.items && added.items[0] && added.items[0].title)
        || added.product_title
        || 'Item';
      toast(`<strong>Added</strong> · ${title}`);
    } catch (err) {
      console.error('[quick-add]', err);
      toast('<strong>Couldn\'t add</strong> · Try the product page.');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  };

  // ---------- PDP Add to Bag (form fallback → AJAX) ----------
  // Catch the PDP form submit, do an AJAX cart-add so the page doesn't
  // refresh, then bounce the badge + toast.
  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute('action') !== '/cart/add' && !form.action.endsWith('/cart/add')) return;
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const item = await res.json();
      await refreshBadge();
      toast(`<strong>Added to bag</strong> · ${item.product_title || 'Item'}`);
    } catch (err) {
      console.error('[add-to-cart]', err);
      // If AJAX fails, fall back to a real submit so the user still ends up at /cart.
      form.submit();
    }
  });

  // ---------- Toast ----------
  let toastEl = null;
  let toastTimer = null;
  function toast(html) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'cp-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = html;
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }
  window.CoastalPalmToast = toast;
})();
