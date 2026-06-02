/* ============================================================
   Lookspan landing — interactions
   ============================================================ */
(() => {
  'use strict';

  /* ---------- Header shadow on scroll ---------- */
  const header = document.querySelector('.site-header');
  const onScroll = () => {
    if (window.scrollY > 8) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('mobile-menu');
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    };
    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    // Reset the menu state when the viewport grows back to desktop.
    const desktop = window.matchMedia('(min-width: 901px)');
    desktop.addEventListener('change', (e) => {
      if (e.matches) setOpen(false);
    });
  }

  /* ---------- Copy to clipboard ---------- */
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }
  };

  const flashCopied = (btn) => {
    const label = btn.querySelector('.copy-label');
    const original = label ? label.textContent : null;
    btn.classList.add('copied');
    if (label) label.textContent = '¡Copiado!';
    setTimeout(() => {
      btn.classList.remove('copied');
      if (label && original !== null) label.textContent = original;
    }, 1600);
  };

  // Buttons with an explicit data-copy value
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (await copyText(btn.getAttribute('data-copy'))) flashCopied(btn);
    });
  });

  /* ---------- Code tabs + copy active panel ---------- */
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  const activate = (name) => {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
  };
  tabs.forEach((t) => t.addEventListener('click', () => activate(t.dataset.tab)));

  const copyCodeBtn = document.querySelector('.copy-code');
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', async () => {
      const active = document.querySelector('.tab-panel.is-active code');
      if (active && (await copyText(active.innerText))) flashCopied(copyCodeBtn);
    });
  }

  /* ---------- Reveal on scroll ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  /* ---------- Footer year (keep current if markup changes) ---------- */
  // Year is hardcoded in markup (2026); nothing to compute here.
})();
