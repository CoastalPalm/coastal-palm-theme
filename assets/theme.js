// =============================================================
//  Coastal Palm — site-wide UI behavior
//  Mobile drawer, cart badge, toast notifications, micro-interactions.
//  Kept dependency-free and small (one file, one place to look).
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

  // ---------- Cart badge + bag state ----------
  // localStorage-backed cart with real product data.
  const BAG_KEY = 'cp_bag_items';
  const badge = document.getElementById('cartBadge');

  function getBag() {
    try { return JSON.parse(localStorage.getItem(BAG_KEY)) || []; } catch(e) { return []; }
  }
  function saveBag(items) {
    localStorage.setItem(BAG_KEY, JSON.stringify(items));
  }
  function bagCount() {
    return getBag().reduce((sum, i) => sum + i.qty, 0);
  }

  const renderBadge = () => {
    const n = bagCount();
    if (!badge) return;
    badge.textContent = String(n);
    badge.hidden = n === 0;
  };
  renderBadge();

  window.CoastalPalmBag = {
    /** Add a product to the bag. Pass product info or it auto-detects from the page. */
    add(product) {
      const items = getBag();
      const info = product || detectProduct();
      // Try to merge with existing item (same slug + size)
      const existing = items.find(i => i.slug === info.slug && i.size === info.size);
      if (existing) {
        existing.qty++;
      } else {
        items.push({
          slug:  info.slug  || 'item-' + Date.now(),
          name:  info.name  || 'Item',
          price: info.price || 0,
          image: info.image || '',
          size:  info.size  || 'One Size',
          qty:   1
        });
      }
      saveBag(items);
      renderBadge();
      const n = bagCount();
      toast('<strong>Added to bag</strong> · ' + n + ' item' + (n === 1 ? '' : 's') + '<span class="toast-view">View bag →</span>');
    },
    remove(index) {
      const items = getBag();
      items.splice(index, 1);
      saveBag(items);
      renderBadge();
    },
    updateQty(index, delta) {
      const items = getBag();
      if (!items[index]) return;
      items[index].qty = Math.max(1, items[index].qty + delta);
      saveBag(items);
      renderBadge();
    },
    clear() {
      saveBag([]);
      renderBadge();
    },
    getItems() { return getBag(); }
  };

  /** Auto-detect product info from the current page context */
  function detectProduct() {
    // PDP page
    const pdpName = document.querySelector('.pdp-info h1');
    if (pdpName) {
      const priceEl = document.querySelector('.pdp-price span');
      const img = document.querySelector('.pdp-gallery img');
      const activeSize = document.querySelector('.size-pills button.active');
      const slug = window.location.pathname.split('/').pop() || '';
      return {
        slug:  slug,
        name:  pdpName.textContent.trim(),
        price: parseFloat((priceEl?.textContent || '0').replace(/[^0-9.]/g, '')),
        image: img?.src || '',
        size:  activeSize?.textContent.trim() || 'One Size'
      };
    }
    // Fallback for quick-add from product grid
    return { slug: 'item-' + Date.now(), name: 'Item', price: 0, image: '', size: 'One Size' };
  }

  // ---------- Cart drawer ----------
  let cartDrawer = null;
  function openCartDrawer() {
    if (!cartDrawer) {
      cartDrawer = document.createElement('div');
      cartDrawer.className = 'cart-drawer';
      cartDrawer.innerHTML =
        '<div class="cart-drawer-backdrop"></div>' +
        '<aside class="cart-drawer-panel">' +
          '<div class="cart-drawer-header">' +
            '<h3>Your Bag</h3>' +
            '<button class="cart-drawer-close" aria-label="Close">&times;</button>' +
          '</div>' +
          '<div class="cart-drawer-body"></div>' +
          '<div class="cart-drawer-footer"></div>' +
        '</aside>';
      document.body.appendChild(cartDrawer);
      cartDrawer.querySelector('.cart-drawer-backdrop').addEventListener('click', closeCartDrawer);
      cartDrawer.querySelector('.cart-drawer-close').addEventListener('click', closeCartDrawer);
    }
    renderCartDrawer();
    requestAnimationFrame(() => cartDrawer.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }

  function closeCartDrawer() {
    if (cartDrawer) {
      cartDrawer.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  function renderCartDrawer() {
    if (!cartDrawer) return;
    const items = getBag();
    const n = items.reduce((s, i) => s + i.qty, 0);
    const body = cartDrawer.querySelector('.cart-drawer-body');
    const footer = cartDrawer.querySelector('.cart-drawer-footer');
    const header = cartDrawer.querySelector('.cart-drawer-header h3');
    header.textContent = 'Your Bag (' + n + ')';

    if (n === 0) {
      body.innerHTML =
        '<div class="cart-empty">' +
          '<div class="cart-empty-icon">🌴</div>' +
          '<p><strong>Your bag is empty</strong></p>' +
          '<p>Looks like you haven\'t added anything yet.</p>' +
          '<a href="/shop" class="btn btn-primary" style="margin-top:16px;">Start shopping</a>' +
        '</div>';
      footer.innerHTML = '';
      return;
    }

    // Render item cards
    let itemsHTML = '';
    let subtotal = 0;
    items.forEach((item, idx) => {
      const lineTotal = item.price * item.qty;
      subtotal += lineTotal;
      itemsHTML +=
        '<div class="cart-item" data-index="' + idx + '">' +
          '<div class="cart-item-img">' +
            (item.image ? '<img src="' + item.image + '" alt="' + item.name + '">' : '<div class="cart-item-placeholder">🌴</div>') +
          '</div>' +
          '<div class="cart-item-info">' +
            '<div class="cart-item-name">' + item.name + '</div>' +
            '<div class="cart-item-meta">Size: ' + item.size + '</div>' +
            '<div class="cart-item-price">$' + lineTotal.toFixed(0) + '</div>' +
            '<div class="cart-item-actions">' +
              '<div class="cart-qty">' +
                '<button class="cart-qty-btn" data-action="minus" data-idx="' + idx + '" aria-label="Decrease quantity">−</button>' +
                '<span class="cart-qty-val">' + item.qty + '</span>' +
                '<button class="cart-qty-btn" data-action="plus" data-idx="' + idx + '" aria-label="Increase quantity">+</button>' +
              '</div>' +
              '<button class="cart-item-remove" data-idx="' + idx + '" aria-label="Remove item">Remove</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    body.innerHTML = '<div class="cart-items">' + itemsHTML + '</div>';

    // Wire up quantity and remove buttons
    body.querySelectorAll('.cart-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        const delta = btn.dataset.action === 'plus' ? 1 : -1;
        window.CoastalPalmBag.updateQty(idx, delta);
        renderCartDrawer();
      });
    });
    body.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        window.CoastalPalmBag.remove(Number(btn.dataset.idx));
        renderCartDrawer();
      });
    });

    // Footer with subtotal
    footer.innerHTML =
      '<div class="cart-subtotal">' +
        '<span>Subtotal</span>' +
        '<span>$' + subtotal.toFixed(0) + '</span>' +
      '</div>' +
      '<button class="btn btn-primary" style="width:100%;margin-top:12px;">Checkout</button>' +
      '<button class="btn btn-outline cart-clear-btn" style="width:100%;margin-top:8px;">Clear bag</button>';
    footer.querySelector('.cart-clear-btn').addEventListener('click', () => {
      window.CoastalPalmBag.clear();
      renderCartDrawer();
    });
  }

  const cartBtn = document.getElementById('cartBtn');
  if (cartBtn) {
    cartBtn.addEventListener('click', openCartDrawer);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cartDrawer && cartDrawer.classList.contains('open')) closeCartDrawer();
  });

  // Any button labelled "Add to bag" triggers the bag — single hook, multiple places.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, a');
    if (!btn) return;
    const label = (btn.textContent || '').trim();
    if (/^Add to bag/i.test(label) || btn.dataset.addToBag === 'true') {
      // Try to extract product info from the card context (quick-add from grid)
      const card = btn.closest('.product-card') || btn.closest('.quick-view-dialog');
      let product = null;
      if (card) {
        const name = card.querySelector('h4, h3')?.textContent?.trim() || 'Item';
        const priceText = card.querySelector('.product-card-price, .qv-price')?.textContent || '';
        const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
        const img = card.querySelector('img')?.src || '';
        const link = card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || '';
        const slug = link.split('/').pop() || 'item-' + Date.now();
        product = { slug, name, price, image: img, size: 'One Size' };
      }
      window.CoastalPalmBag.add(product);
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
      // Clicking the toast opens the cart drawer
      toastEl.addEventListener('click', () => {
        toastEl.classList.remove('show');
        clearTimeout(toastTimer);
        openCartDrawer();
      });
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = html;
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }
  window.CoastalPalmToast = toast;

  // ---------- #6 Scroll reveal ----------
  const revealEls = document.querySelectorAll('section > .container, .pdp-layout, .pdp-accordion');
  revealEls.forEach(el => el.classList.add('reveal'));
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  revealEls.forEach(el => revealObserver.observe(el));

  // ---------- #7 Back to top ----------
  const btt = document.createElement('button');
  btt.className = 'back-to-top';
  btt.setAttribute('aria-label', 'Back to top');
  btt.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
  document.body.appendChild(btt);
  btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', () => {
    btt.classList.toggle('show', window.scrollY > 400);
  }, { passive: true });

  // ---------- #9 Sticky add-to-bag bar (PDP only) ----------
  const pdpActions = document.querySelector('.pdp-actions');
  if (pdpActions) {
    const bar = document.createElement('div');
    bar.className = 'sticky-add-bar';
    const nameEl = document.querySelector('.pdp-info h1');
    const priceEl = document.querySelector('.pdp-price span');
    bar.innerHTML = '<span class="product-name">' + (nameEl ? nameEl.textContent : '') + '</span>' +
      '<span class="product-price">' + (priceEl ? priceEl.textContent : '') + '</span>' +
      '<button class="btn btn-primary">Add to bag</button>';
    document.body.appendChild(bar);
    const stickyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        bar.classList.toggle('show', !entry.isIntersecting);
      });
    }, { threshold: 0 });
    stickyObserver.observe(pdpActions);
  }

  // ---------- #1 Frosted glass header on scroll ----------
  const siteHeader = document.querySelector('.site-header');
  if (siteHeader) {
    window.addEventListener('scroll', () => {
      siteHeader.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
  }

  // ---------- #4 Page transition fade-in ----------
  document.body.classList.add('page-transition');

  // ---------- Favorites (wishlist) system ----------
  const FAV_KEY = 'cp_favorites';
  function getFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch(e) { return []; } }
  function saveFavs(items) { localStorage.setItem(FAV_KEY, JSON.stringify(items)); }

  // Sync all heart icons with current favorites state
  function syncHearts() {
    const favs = getFavs();
    const slugs = favs.map(f => f.slug);
    document.querySelectorAll('.product-card-wishlist').forEach(heart => {
      const card = heart.closest('.product-card');
      if (!card) return;
      const link = card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || '';
      const slug = link.split('/').pop();
      heart.classList.toggle('liked', slugs.includes(slug));
    });
  }
  syncHearts();

  function handleHeartClick(heart) {
    const card = heart.closest('.product-card');
    const link = card?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || '';
    const slug = link.split('/').pop() || '';
    const name = card?.querySelector('h4')?.textContent?.trim() || 'Item';
    const priceText = card?.querySelector('.product-card-price')?.textContent || '';
    const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
    const img = card?.querySelector('.product-card-img img')?.src || '';

    const favs = getFavs();
    const idx = favs.findIndex(f => f.slug === slug);

    if (idx >= 0) {
      favs.splice(idx, 1);
      heart.classList.remove('liked');
      toast('<strong>Removed</strong> · Taken out of favorites');
    } else {
      favs.push({ slug, name, price, image: img });
      heart.classList.add('liked');
      const burst = document.createElement('span');
      burst.className = 'heart-burst';
      for (let i = 0; i < 6; i++) burst.appendChild(document.createElement('span'));
      heart.appendChild(burst);
      setTimeout(() => burst.remove(), 600);
      toast('<strong>Saved</strong> · Added to favorites ♡');
    }
    saveFavs(favs);
  }

  // Attach directly to each heart — inline stopPropagation blocks delegation
  document.querySelectorAll('.product-card-wishlist').forEach(heart => {
    heart.addEventListener('click', (e) => {
      e.stopPropagation();
      handleHeartClick(heart);
    });
  });

  // ---------- Favorites drawer (header wishlist icon) ----------
  let favDrawer = null;
  function openFavDrawer() {
    if (!favDrawer) {
      favDrawer = document.createElement('div');
      favDrawer.className = 'cart-drawer fav-drawer';
      favDrawer.innerHTML =
        '<div class="cart-drawer-backdrop"></div>' +
        '<aside class="cart-drawer-panel">' +
          '<div class="cart-drawer-header">' +
            '<h3>Favorites</h3>' +
            '<button class="cart-drawer-close" aria-label="Close">&times;</button>' +
          '</div>' +
          '<div class="cart-drawer-body"></div>' +
        '</aside>';
      document.body.appendChild(favDrawer);
      favDrawer.querySelector('.cart-drawer-backdrop').addEventListener('click', closeFavDrawer);
      favDrawer.querySelector('.cart-drawer-close').addEventListener('click', closeFavDrawer);
    }
    renderFavDrawer();
    requestAnimationFrame(() => favDrawer.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }
  function closeFavDrawer() {
    if (favDrawer) { favDrawer.classList.remove('open'); document.body.style.overflow = ''; }
  }
  function renderFavDrawer() {
    if (!favDrawer) return;
    const favs = getFavs();
    const body = favDrawer.querySelector('.cart-drawer-body');
    const header = favDrawer.querySelector('.cart-drawer-header h3');
    header.textContent = 'Favorites (' + favs.length + ')';

    if (favs.length === 0) {
      body.innerHTML =
        '<div class="cart-empty">' +
          '<div class="cart-empty-icon">♡</div>' +
          '<p><strong>No favorites yet</strong></p>' +
          '<p>Tap the heart on any piece to save it here.</p>' +
          '<a href="/shop" class="btn btn-primary" style="margin-top:16px;">Browse the collection</a>' +
        '</div>';
      return;
    }

    let html = '';
    favs.forEach((fav, idx) => {
      html +=
        '<div class="cart-item" data-index="' + idx + '">' +
          '<div class="cart-item-img">' +
            (fav.image ? '<img src="' + fav.image + '" alt="' + fav.name + '">' : '<div class="cart-item-placeholder">♡</div>') +
          '</div>' +
          '<div class="cart-item-info">' +
            '<a href="/product/' + fav.slug + '" class="cart-item-name" style="text-decoration:none;color:var(--ink);">' + fav.name + '</a>' +
            '<div class="cart-item-price">$' + fav.price + '</div>' +
            '<div class="cart-item-actions">' +
              '<button class="btn btn-sm fav-add-to-bag" data-idx="' + idx + '" style="font-size:0.78rem;padding:6px 14px;">Add to bag</button>' +
              '<button class="cart-item-remove fav-remove" data-idx="' + idx + '">Remove</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    });
    body.innerHTML = '<div class="cart-items">' + html + '</div>';

    body.querySelectorAll('.fav-add-to-bag').forEach(btn => {
      btn.addEventListener('click', () => {
        const fav = getFavs()[Number(btn.dataset.idx)];
        if (fav) window.CoastalPalmBag.add({ slug: fav.slug, name: fav.name, price: fav.price, image: fav.image, size: 'One Size' });
      });
    });
    body.querySelectorAll('.fav-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const favs = getFavs();
        favs.splice(Number(btn.dataset.idx), 1);
        saveFavs(favs);
        syncHearts();
        renderFavDrawer();
      });
    });
  }

  // Wire up the header wishlist (heart) icon
  const wishlistBtn = document.querySelector('.icon-btn[aria-label="Wishlist"]');
  if (wishlistBtn) wishlistBtn.addEventListener('click', openFavDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && favDrawer && favDrawer.classList.contains('open')) closeFavDrawer();
  });

  // ---------- #10 Quick-view modal ----------
  let qvOverlay = null;
  function openQuickView(card) {
    if (!qvOverlay) {
      qvOverlay = document.createElement('div');
      qvOverlay.className = 'quick-view-overlay';
      qvOverlay.addEventListener('click', (e) => {
        if (e.target === qvOverlay || e.target.closest('.quick-view-close')) {
          qvOverlay.classList.remove('open');
        }
      });
      document.body.appendChild(qvOverlay);
    }
    const img = card.querySelector('.product-card-img img');
    const name = card.querySelector('h4')?.textContent || '';
    const priceEl = card.querySelector('.product-card-price');
    const price = priceEl ? priceEl.innerHTML : '';
    const swatches = card.querySelectorAll('.product-card-colors span');
    const link = card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || '#';
    const desc = card.querySelector('.fulfillment-tag')?.textContent || '';

    let swatchHTML = '';
    swatches.forEach(s => {
      swatchHTML += '<span style="background:' + s.style.background + '"></span>';
    });

    qvOverlay.innerHTML = '<div class="quick-view-dialog" style="position:relative;">' +
      '<button class="quick-view-close" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>' +
      '<div class="quick-view-img"><img src="' + (img ? img.src : '') + '" alt="' + name + '"></div>' +
      '<div class="quick-view-info">' +
        '<h3>' + name + '</h3>' +
        '<div class="qv-price">' + price + '</div>' +
        (swatchHTML ? '<div class="qv-swatches">' + swatchHTML + '</div>' : '') +
        '<p>' + desc + '</p>' +
        '<div class="quick-view-actions">' +
          '<a href="' + link + '" class="btn btn-primary">View Details</a>' +
          '<button class="btn btn-outline" onclick="event.stopPropagation(); window.CoastalPalmBag && window.CoastalPalmBag.add(); document.querySelector(\'.quick-view-overlay\').classList.remove(\'open\');">Add to Bag</button>' +
        '</div>' +
      '</div></div>';

    requestAnimationFrame(() => qvOverlay.classList.add('open'));
  }

  document.addEventListener('click', (e) => {
    const qvBtn = e.target.closest('.product-card-quickview');
    if (!qvBtn) return;
    e.stopPropagation();
    const card = qvBtn.closest('.product-card');
    if (card) openQuickView(card);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qvOverlay && qvOverlay.classList.contains('open')) {
      qvOverlay.classList.remove('open');
    }
  });

  // ---------- Add-to-bag confetti burst ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, a');
    if (!btn) return;
    const label = (btn.textContent || '').trim();
    if (/^(Add to bag|Quick Add)/i.test(label) || btn.dataset.addToBag === 'true') {
      spawnConfetti(btn);
    }
  });

  function spawnConfetti(origin) {
    const rect = origin.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = ['#F0C4CC', '#E5ABB5', '#C9A35C', '#E8927C', '#A8C8DC', '#F1E4C7'];
    for (let i = 0; i < 18; i++) {
      const dot = document.createElement('span');
      dot.className = 'bag-confetti';
      dot.style.left = cx + 'px';
      dot.style.top = cy + 'px';
      dot.style.background = colors[i % colors.length];
      const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.6;
      const dist = 40 + Math.random() * 60;
      dot.style.setProperty('--cx', Math.cos(angle) * dist + 'px');
      dot.style.setProperty('--cy', Math.sin(angle) * dist - 30 + 'px');
      document.body.appendChild(dot);
      setTimeout(() => dot.remove(), 700);
    }
  }

  // ---------- Floating "Ask Palm" chat button ----------
  const palmBtn = document.createElement('button');
  palmBtn.className = 'palm-fab';
  palmBtn.setAttribute('aria-label', 'Ask Palm — AI stylist');
  palmBtn.innerHTML =
    '<span class="palm-fab-avatar">P</span>' +
    '<span class="palm-fab-label">Ask Palm</span>' +
    '<span class="palm-fab-dismiss" aria-label="Dismiss" title="Dismiss">&times;</span>';
  document.body.appendChild(palmBtn);

  // Dismiss button — hides FAB until page refresh
  palmBtn.querySelector('.palm-fab-dismiss').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.querySelector('.palm-chat-panel');
    if (panel) panel.remove();
    palmBtn.classList.add('dismissed');
    palmOpen = false;
  });

  // Mobile drawer "Ask Palm" link triggers the FAB
  const drawerPalmLink = document.querySelector('.mobile-drawer-palm');
  if (drawerPalmLink) {
    drawerPalmLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Un-dismiss if it was dismissed
      palmBtn.classList.remove('dismissed');
      // Open the chat after a short delay so the drawer closes first
      setTimeout(() => { if (!palmOpen) palmBtn.click(); }, 350);
    });
  }

  let palmOpen = false;
  palmBtn.addEventListener('click', () => {
    if (palmOpen) {
      const panel = document.querySelector('.palm-chat-panel');
      if (panel) panel.remove();
      palmBtn.classList.remove('active');
      palmOpen = false;
      return;
    }
    palmOpen = true;
    palmBtn.classList.add('active');

    const panel = document.createElement('div');
    panel.className = 'palm-chat-panel';
    panel.innerHTML =
      '<div class="palm-chat-header">' +
        '<div class="palm-chat-avatar">P</div>' +
        '<div><strong>Palm</strong><br><span style="font-size:0.75rem;color:var(--ink-soft);">Your AI stylist</span></div>' +
        '<button class="palm-chat-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="palm-chat-body">' +
        '<div class="chat-bubble bot">Hey! I\'m Palm, your personal stylist. Tell me what you\'re looking for — an occasion, a vibe, or even a color — and I\'ll pull pieces for you.</div>' +
      '</div>' +
      '<div class="palm-chat-input-row">' +
        '<input type="text" placeholder="Beach wedding outfit under $200..." class="palm-chat-input">' +
        '<button class="palm-chat-send">→</button>' +
      '</div>';
    document.body.appendChild(panel);

    panel.querySelector('.palm-chat-close').addEventListener('click', () => {
      panel.remove();
      palmBtn.classList.remove('active');
      palmOpen = false;
    });

    const input = panel.querySelector('.palm-chat-input');
    const sendBtn = panel.querySelector('.palm-chat-send');
    const body = panel.querySelector('.palm-chat-body');

    function sendMsg() {
      const text = input.value.trim();
      if (!text) return;
      body.innerHTML += '<div class="chat-bubble user">' + text + '</div>';
      input.value = '';
      body.scrollTop = body.scrollHeight;
      setTimeout(() => {
        body.innerHTML += '<div class="chat-bubble bot">Great taste! I\'d start with our <a href="/shop" style="color:var(--pink-btn-deep);font-weight:600;">new arrivals</a> — we just got some pieces that would be perfect. Want me to narrow it down?</div>';
        body.scrollTop = body.scrollHeight;
      }, 1200);
    }
    sendBtn.addEventListener('click', sendMsg);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
  });

  // ---------- #5 Interactive outfit builder ----------
  const outfitBuilder = document.querySelector('.outfit-builder');
  if (outfitBuilder) {
    const basePrice = Number(outfitBuilder.dataset.basePrice) || 0;
    const items = outfitBuilder.querySelectorAll('.outfit-item');
    const totalEl = outfitBuilder.querySelector('.outfit-total-price');

    function updateOutfitTotal() {
      let total = basePrice;
      items.forEach(item => {
        if (item.classList.contains('selected')) {
          total += Number(item.dataset.price) || 0;
        }
      });
      if (totalEl) totalEl.textContent = '$' + total;
    }

    items.forEach(item => {
      item.addEventListener('click', () => {
        item.classList.toggle('selected');
        updateOutfitTotal();
      });
    });
  }

  // ---------- #8 Size quiz modal ----------
  const quizTrigger = document.querySelector('.open-size-quiz');
  if (quizTrigger) {
    let quizOverlay = null;
    const steps = [
      { label: 'What\'s your usual dress size?', options: ['XS', 'S', 'M', 'L', 'XL', '2X'] },
      { label: 'How tall are you?', options: ['Under 5\'3"', '5\'3" – 5\'6"', '5\'7" – 5\'10"', 'Over 5\'10"'] },
      { label: 'What\'s your preferred fit?', options: ['Fitted', 'True to size', 'Relaxed', 'Oversized'] },
      { label: 'How do you like the length?', options: ['Above knee', 'At the knee', 'Below knee', 'Maxi'] }
    ];
    const answers = [];
    let currentStep = 0;

    quizTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      openSizeQuiz();
    });

    function openSizeQuiz() {
      if (!quizOverlay) {
        quizOverlay = document.createElement('div');
        quizOverlay.className = 'size-quiz-overlay';
        quizOverlay.addEventListener('click', (e) => { if (e.target === quizOverlay) closeSizeQuiz(); });
        document.body.appendChild(quizOverlay);
      }
      currentStep = 0;
      answers.length = 0;
      renderQuiz();
      requestAnimationFrame(() => quizOverlay.classList.add('open'));
    }

    function closeSizeQuiz() {
      if (quizOverlay) quizOverlay.classList.remove('open');
    }

    function renderQuiz() {
      const totalSteps = steps.length;
      let progressHTML = '';
      for (let i = 0; i < totalSteps; i++) {
        progressHTML += '<span class="' + (i < currentStep ? 'done' : '') + '"></span>';
      }

      if (currentStep >= totalSteps) {
        const rec = recommendSize(answers);
        quizOverlay.innerHTML =
          '<div class="size-quiz-dialog" style="position:relative;">' +
            '<button class="size-quiz-close" aria-label="Close">&times;</button>' +
            '<div class="quiz-progress">' + progressHTML.replace(/class=""/g, 'class="done"') + '</div>' +
            '<div class="quiz-result">' +
              '<span class="eyebrow">Your recommended size</span>' +
              '<div class="size-rec">' + rec.size + '</div>' +
              '<p>' + rec.note + '</p>' +
            '</div>' +
            '<div class="quiz-nav">' +
              '<button class="btn btn-outline quiz-restart">Retake quiz</button>' +
              '<button class="btn btn-primary quiz-apply">Select ' + rec.size + '</button>' +
            '</div>' +
          '</div>';
        quizOverlay.querySelector('.size-quiz-close').addEventListener('click', closeSizeQuiz);
        quizOverlay.querySelector('.quiz-restart').addEventListener('click', () => { currentStep = 0; answers.length = 0; renderQuiz(); });
        quizOverlay.querySelector('.quiz-apply').addEventListener('click', () => {
          const pills = document.querySelectorAll('.size-pills button');
          pills.forEach(p => {
            p.classList.remove('active');
            if (p.textContent.trim() === rec.size) p.classList.add('active');
          });
          closeSizeQuiz();
          toast('<strong>Size updated</strong> · ' + rec.size + ' selected');
        });
        return;
      }

      const step = steps[currentStep];
      let optionsHTML = '';
      step.options.forEach(opt => {
        const sel = answers[currentStep] === opt ? ' selected' : '';
        optionsHTML += '<button class="' + sel.trim() + '">' + opt + '</button>';
      });

      quizOverlay.innerHTML =
        '<div class="size-quiz-dialog" style="position:relative;">' +
          '<button class="size-quiz-close" aria-label="Close">&times;</button>' +
          '<h3>Find your perfect fit</h3>' +
          '<p class="quiz-sub">Step ' + (currentStep + 1) + ' of ' + totalSteps + '</p>' +
          '<div class="quiz-progress">' + progressHTML + '</div>' +
          '<label>' + step.label + '</label>' +
          '<div class="quiz-options">' + optionsHTML + '</div>' +
          '<div class="quiz-nav">' +
            (currentStep > 0 ? '<button class="btn btn-outline quiz-back">Back</button>' : '<span></span>') +
            '<button class="btn btn-primary quiz-next" ' + (answers[currentStep] ? '' : 'disabled') + '>Next</button>' +
          '</div>' +
        '</div>';

      quizOverlay.querySelector('.size-quiz-close').addEventListener('click', closeSizeQuiz);
      quizOverlay.querySelectorAll('.quiz-options button').forEach(btn => {
        btn.addEventListener('click', () => {
          quizOverlay.querySelectorAll('.quiz-options button').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          answers[currentStep] = btn.textContent.trim();
          quizOverlay.querySelector('.quiz-next').disabled = false;
        });
      });
      const nextBtn = quizOverlay.querySelector('.quiz-next');
      nextBtn.addEventListener('click', () => { if (answers[currentStep]) { currentStep++; renderQuiz(); } });
      const backBtn = quizOverlay.querySelector('.quiz-back');
      if (backBtn) backBtn.addEventListener('click', () => { currentStep--; renderQuiz(); });
    }

    function recommendSize(ans) {
      // Simple heuristic: base on dress size + fit preference
      const base = ans[0] || 'M';
      const fit = ans[2] || 'True to size';
      let size = base;
      const note = fit === 'Relaxed' || fit === 'Oversized'
        ? 'Based on your preferences, we suggest sizing up for that effortless drape.'
        : fit === 'Fitted'
          ? 'This style runs true — ' + size + ' should give you that polished look.'
          : 'Perfect — ' + size + ' is spot on for your frame and fit preference.';
      return { size, note };
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && quizOverlay && quizOverlay.classList.contains('open')) closeSizeQuiz();
    });
  }

  // ---------- Announcement bar slider + countdown ----------
  const announceTrack = document.getElementById('announceTrack');
  if (announceTrack) {
    const slideCount = announceTrack.children.length;
    let current = 0;
    let autoTimer = null;
    const AUTO_DELAY = 3500; // ms between auto-slides

    function goToSlide(idx) {
      current = ((idx % slideCount) + slideCount) % slideCount; // wrap around
      announceTrack.style.transform = 'translateX(-' + (current * 25) + '%)';
    }

    function startAuto() {
      clearInterval(autoTimer);
      autoTimer = setInterval(() => goToSlide(current + 1), AUTO_DELAY);
    }

    // Arrow buttons
    const prevBtn = document.querySelector('.announce-prev');
    const nextBtn = document.querySelector('.announce-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { goToSlide(current - 1); startAuto(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { goToSlide(current + 1); startAuto(); });

    // Start auto-sliding
    startAuto();
  }

  // Countdown timer (renders into #dropCountdown inside the track)
  const countdownEl = document.getElementById('dropCountdown');
  if (countdownEl) {
    function getNextDrop() {
      const now = new Date();
      const target = new Date(now);
      target.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7));
      target.setHours(12, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 7);
      return target;
    }
    const dropDate = getNextDrop();
    function updateCountdown() {
      const diff = dropDate - new Date();
      if (diff <= 0) { countdownEl.textContent = 'Dropping now!'; return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      countdownEl.innerHTML =
        '<span>' + d + '<small>d</small></span>' +
        '<span>' + h + '<small>h</small></span>' +
        '<span>' + m + '<small>m</small></span>' +
        '<span>' + s + '<small>s</small></span>';
    }
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  // ---------- Back to top button ----------
  var backToTop = document.getElementById('backToTop');
  if (backToTop) {
    window.addEventListener('scroll', function () {
      backToTop.classList.toggle('visible', window.scrollY > 400);
    });
    backToTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ---------- 15% off welcome popup ----------
  // Shows once. Dismissed permanently whether they close it or submit their email.
  if (!localStorage.getItem('cp_popup_dismissed')) {
    (function () {
      var overlay = document.createElement('div');
      overlay.className = 'welcome-popup-overlay';
      overlay.innerHTML =
        '<div class="welcome-popup">' +
          '<button class="welcome-popup-close" aria-label="Close">&times;</button>' +
          '<img src="/assets/Coastal_Palm_logo_pink.jpg" alt="Coastal Palm" class="welcome-popup-logo">' +
          '<h2>Welcome to Coastal Palm</h2>' +
          '<p>Sign up and get <strong>15% off</strong> your first order. Be the first to know about new arrivals, exclusive drops, and beach-ready style.</p>' +
          '<form class="welcome-popup-form" onsubmit="return false;">' +
            '<input type="email" placeholder="Enter your email" class="welcome-popup-input" required>' +
            '<button type="submit" class="btn btn-primary welcome-popup-btn">Get 15% Off</button>' +
          '</form>' +
          '<span class="welcome-popup-skip">No thanks, I\'ll pay full price</span>' +
        '</div>';
      document.body.appendChild(overlay);

      requestAnimationFrame(function () {
        overlay.classList.add('show');
      });

      // Close and never show again
      function closePopup() {
        localStorage.setItem('cp_popup_dismissed', '1');
        overlay.classList.remove('show');
        setTimeout(function () { overlay.remove(); }, 300);
      }

      overlay.querySelector('.welcome-popup-close').addEventListener('click', closePopup);
      overlay.querySelector('.welcome-popup-skip').addEventListener('click', closePopup);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closePopup();
      });

      // Only permanently dismiss when they actually sign up
      overlay.querySelector('.welcome-popup-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var email = overlay.querySelector('.welcome-popup-input').value;
        if (email) {
          localStorage.setItem('cp_popup_subscribed', '1');
          overlay.querySelector('.welcome-popup').innerHTML =
            '<img src="/assets/Coastal_Palm_logo_pink.jpg" alt="Coastal Palm" class="welcome-popup-logo">' +
            '<h2>You\'re in!</h2>' +
            '<p>Check your inbox for your <strong>15% off</strong> code. Welcome to the palm side.</p>' +
            '<button class="btn btn-primary welcome-popup-btn" onclick="this.closest(\'.welcome-popup-overlay\').classList.remove(\'show\'); setTimeout(function(){ document.querySelector(\'.welcome-popup-overlay\').remove(); }, 300);">Start Shopping</button>';
        }
      });
    })();
  }

})();
