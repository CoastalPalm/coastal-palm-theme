// =============================================================
//  Palm AI Stylist — client-side chat behavior
//
//  Powers /views/sections/stylist-drawer.ejs (and the Liquid mirror).
//  Reads its endpoint from the drawer's data-endpoint attribute so the
//  same script works on the EJS prototype (/api/stylist/chat) and the
//  Shopify theme (theme setting → https://coastalpalm.vercel.app/...).
// =============================================================

(function () {
  const drawer = document.getElementById('stylistDrawer');
  if (!drawer) return;

  const ENDPOINT = drawer.dataset.endpoint || '/api/stylist/chat';
  const STORAGE_KEY = 'cp_stylist_conv_v1';
  const MAX_HISTORY = 20; // total user+assistant messages we keep client-side

  const messagesEl = document.getElementById('stylistMessages');
  const formEl     = document.getElementById('stylistForm');
  const inputEl    = document.getElementById('stylistInput');
  const launcher   = document.querySelector('.stylist-launcher');
  const emptyState = drawer.querySelector('[data-stylist-empty]');

  // ---------- Conversation state ----------
  /** @type {{role:'user'|'assistant', content:string, segments?:Array}[]} */
  let messages = loadConversation();
  let isStreaming = false;

  function loadConversation() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
    } catch { return []; }
  }
  function saveConversation() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch {}
  }
  function clearConversation() {
    messages = [];
    sessionStorage.removeItem(STORAGE_KEY);
    renderAll();
  }

  // ---------- Open / close ----------
  function openDrawer() {
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('stylist-open');
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    // Focus input shortly after the slide-in finishes.
    setTimeout(() => inputEl?.focus({ preventScroll: true }), 250);
    renderAll();
  }
  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('stylist-open');
    setTimeout(() => { drawer.hidden = true; }, 240);
  }
  function toggleDrawer() {
    if (drawer.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  }

  // Anyone with [data-open-stylist] opens the drawer. Stylist-chat section
  // CTAs + the floating launcher + nav links all flow through this.
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open-stylist]');
    if (opener) { e.preventDefault(); openDrawer(); return; }
    const closer = e.target.closest('[data-close-stylist]');
    if (closer && drawer.contains(closer)) { e.preventDefault(); closeDrawer(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });

  // Quick-prompt chips fire as if the user typed and hit send.
  drawer.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-stylist-prompt]');
    if (!chip) return;
    const prompt = chip.dataset.stylistPrompt;
    if (prompt) submitMessage(prompt);
  });

  // ---------- Form submit ----------
  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = (inputEl.value || '').trim();
    if (!text || isStreaming) return;
    submitMessage(text);
    inputEl.value = '';
  });

  function submitMessage(text) {
    messages.push({ role: 'user', content: text });
    saveConversation();
    renderAll();
    streamReply();
  }

  // ---------- Streaming + SSE parsing ----------
  async function streamReply() {
    if (isStreaming) return;
    isStreaming = true;
    formEl.classList.add('is-loading');
    inputEl.disabled = true;

    // Append a fresh assistant message that we'll mutate in place.
    const assistantIdx = messages.push({ role: 'assistant', content: '', segments: [{ type: 'text', text: '' }] }) - 1;
    const messageEl = renderMessage(messages[assistantIdx], assistantIdx);
    appendMessage(messageEl);

    const typing = renderTypingIndicator(messageEl);

    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({
          messages: messages.slice(0, assistantIdx).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`Palm couldn't connect (${resp.status})`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });

        // SSE framing: events split by blank line. Each event is one or more
        // 'data: <json>' lines. We assume a single data line per event.
        const frames = pending.split('\n\n');
        pending = frames.pop() || '';
        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let evt;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }
          handleStreamEvent(evt, assistantIdx, messageEl);
        }
      }
    } catch (err) {
      const msg = messages[assistantIdx];
      msg.segments = [{ type: 'text', text: `Sorry — Palm hit a snag. ${err.message || 'Try again in a moment.'}` }];
      msg.content = msg.segments[0].text;
      renderAssistantBody(messageEl, msg);
    } finally {
      typing.remove();
      isStreaming = false;
      formEl.classList.remove('is-loading');
      inputEl.disabled = false;
      saveConversation();
      inputEl.focus({ preventScroll: true });
    }
  }

  function handleStreamEvent(evt, assistantIdx, messageEl) {
    const msg = messages[assistantIdx];
    if (!msg.segments) msg.segments = [{ type: 'text', text: '' }];

    if (evt.type === 'token' || evt.type === 'text') {
      // Append text to the most recent text segment, or open a new one
      // if the last segment was a product card.
      const last = msg.segments[msg.segments.length - 1];
      if (last && last.type === 'text') {
        last.text += evt.text;
      } else {
        msg.segments.push({ type: 'text', text: evt.text });
      }
      msg.content += evt.text;
    } else if (evt.type === 'product') {
      // Close any open text segment, push a product card, open a new
      // empty text segment for whatever follows.
      msg.segments.push({ type: 'product', slug: evt.slug });
      msg.segments.push({ type: 'text', text: '' });
    } else if (evt.type === 'done') {
      // Nothing to do — the reader loop ends naturally.
    } else if (evt.type === 'error') {
      msg.segments = [{ type: 'text', text: evt.message || 'Palm hit a snag — try again.' }];
      msg.content = msg.segments[0].text;
    }
    renderAssistantBody(messageEl, msg);
    scrollToBottom();
  }

  // ---------- Render ----------
  function renderAll() {
    // Empty state vs. transcript
    if (messages.length === 0) {
      emptyState.hidden = false;
      // Wipe any rendered messages
      Array.from(messagesEl.querySelectorAll('.stylist-message')).forEach(n => n.remove());
      return;
    }
    emptyState.hidden = true;
    Array.from(messagesEl.querySelectorAll('.stylist-message')).forEach(n => n.remove());
    messages.forEach((m, i) => appendMessage(renderMessage(m, i)));
    scrollToBottom();
  }

  function renderMessage(msg, idx) {
    const el = document.createElement('div');
    el.className = `stylist-message stylist-message--${msg.role}`;
    el.dataset.idx = String(idx);

    if (msg.role === 'user') {
      const bubble = document.createElement('div');
      bubble.className = 'stylist-bubble stylist-bubble--user';
      bubble.textContent = msg.content;
      el.appendChild(bubble);
    } else {
      const body = document.createElement('div');
      body.className = 'stylist-message-body';
      el.appendChild(body);
      renderAssistantBody(el, msg);
    }
    return el;
  }

  function renderAssistantBody(messageEl, msg) {
    let body = messageEl.querySelector('.stylist-message-body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'stylist-message-body';
      messageEl.appendChild(body);
    }
    body.innerHTML = '';

    const segments = msg.segments && msg.segments.length ? msg.segments : [{ type: 'text', text: msg.content }];
    for (const seg of segments) {
      if (seg.type === 'text') {
        if (!seg.text) continue;
        const p = document.createElement('div');
        p.className = 'stylist-bubble stylist-bubble--bot';
        p.textContent = seg.text;
        body.appendChild(p);
      } else if (seg.type === 'product') {
        body.appendChild(renderProductCard(seg.slug));
      }
    }
  }

  function renderProductCard(slug) {
    const card = document.createElement('div');
    card.className = 'stylist-product';
    card.dataset.slug = slug;
    // Optimistic render — name + price filled from local catalog if available
    const local = (window.__CP_CATALOG__ || {})[slug];
    const fallback = { name: titleCase(slug.replace(/-/g, ' ')), price: null, image: '/assets/garments/' + slug + '.png' };
    const p = local || fallback;
    card.innerHTML = `
      <a class="stylist-product-image" href="/product/${slug}" aria-label="View ${p.name}">
        <img src="${p.image}" alt="" loading="lazy" onerror="this.style.opacity='0.2'">
      </a>
      <div class="stylist-product-meta">
        <a class="stylist-product-name" href="/product/${slug}">${escapeHtml(p.name)}</a>
        ${p.price ? `<div class="stylist-product-price">$${p.price}</div>` : ''}
        <div class="stylist-product-actions">
          <a class="stylist-product-view" href="/product/${slug}">View</a>
          <button type="button" class="stylist-product-add" data-add-to-bag="true" data-slug="${slug}">Add to bag</button>
        </div>
      </div>
    `;
    return card;
  }

  function renderTypingIndicator(parent) {
    const dots = document.createElement('div');
    dots.className = 'stylist-bubble stylist-bubble--bot stylist-typing';
    dots.innerHTML = '<span></span><span></span><span></span>';
    const body = parent.querySelector('.stylist-message-body') || parent;
    body.appendChild(dots);
    return dots;
  }

  function appendMessage(node) {
    messagesEl.appendChild(node);
    scrollToBottom();
  }
  function scrollToBottom() {
    // Defer to next frame so layout has settled.
    requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
  }

  // ---------- Helpers ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function titleCase(s) {
    return s.replace(/\b\w/g, c => c.toUpperCase());
  }

  // ---------- Float launcher ----------
  if (launcher) launcher.hidden = false;

  // ---------- Deep link ----------
  // /stylist redirects to /?open=stylist — auto-open if that flag is present.
  const params = new URLSearchParams(window.location.search);
  if (params.get('open') === 'stylist') {
    openDrawer();
    params.delete('open');
    const q = params.toString();
    history.replaceState(null, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
  }

  // ---------- Public hook ----------
  window.CoastalPalmStylist = {
    open: openDrawer,
    close: closeDrawer,
    ask(text) { openDrawer(); if (text) submitMessage(text); },
    clear: clearConversation,
  };
})();
