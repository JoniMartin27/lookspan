/* ============================================================
   Lookspan landing — interactions + i18n
   ============================================================ */
(() => {
  const I18N = window.LOOKSPAN_I18N || { es: {}, en: {} };
  const STORAGE_KEY = 'lookspan-lang';

  /* ---------- Language detection ---------- */
  const readSaved = () => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'es' || v === 'en' ? v : null;
    } catch {
      return null;
    }
  };
  const save = (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* localStorage unavailable (private mode) — ignore */
    }
  };
  const detectLang = () => {
    const saved = readSaved();
    if (saved) return saved;
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    return String(nav).toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
  };

  let currentLang = I18N[detectLang()] ? detectLang() : 'es';
  const t = (key) =>
    (I18N[currentLang] && I18N[currentLang][key]) || (I18N.es && I18N.es[key]) || '';

  /* ---------- Apply a language across the page ---------- */
  const applyLang = (lang) => {
    currentLang = I18N[lang] ? lang : 'es';
    const dict = I18N[currentLang];
    document.documentElement.lang = currentLang;

    // Text / inline-HTML content
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = dict[el.getAttribute('data-i18n')];
      if (v != null) el.innerHTML = v;
    });
    // aria-label attributes
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const v = dict[el.getAttribute('data-i18n-aria')];
      if (v != null) el.setAttribute('aria-label', v);
    });
    // <title> + meta description
    if (dict['meta.title']) document.title = dict['meta.title'];
    const md = document.querySelector('meta[name="description"]');
    if (md && dict['meta.description']) md.setAttribute('content', dict['meta.description']);

    // Reflect active language on the toggle(s)
    document.querySelectorAll('[data-lang-btn]').forEach((b) => {
      const on = b.getAttribute('data-lang-btn') === currentLang;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });

    // Keep the menu toggle's label in sync with the current state + language
    if (toggle) {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-label', open ? t('menu.close') : t('menu.open'));
    }
  };

  const setLang = (lang) => {
    save(lang);
    applyLang(lang);
  };

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
  const setOpen = (open) => {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    toggle.setAttribute('aria-label', open ? t('menu.close') : t('menu.open'));
  };
  if (toggle && menu) {
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

  /* ---------- Language toggle buttons ---------- */
  document.querySelectorAll('[data-lang-btn]').forEach((b) => {
    b.addEventListener('click', () => setLang(b.getAttribute('data-lang-btn')));
  });

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
    if (label) label.textContent = t('copy.done');
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
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
  };
  tabs.forEach((tab) => tab.addEventListener('click', () => activate(tab.dataset.tab)));

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
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  /* ---------- Init: paint the detected language ---------- */
  applyLang(currentLang);
})();
