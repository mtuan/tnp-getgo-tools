(() => {
  const root = document.documentElement;
  const icon = paths => `<svg aria-hidden="true" viewBox="0 0 24 24">${paths}</svg>`;
  const navigationIcons = {
    learning: icon('<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5Zm16 0A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z"/>'),
    activities: icon('<path d="M3 12h4l2-7 5 14 2-7h5"/>'),
    ranks: icon('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Zm4 8v5m-4 3h8M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4"/>'),
    profile: icon('<circle cx="12" cy="8" r="4"/><path d="M5 22a7 7 0 0 1 14 0"/>'),
  };
  const links = [
    ['learning', 'Học tập'], ['activities', 'Hoạt động'],
    ['ranks', 'Bảng xếp hạng'], ['profile', 'Hồ sơ'],
  ];

  function navigation(current, className, includeIcons = false) {
    return `<nav class="${className}" aria-label="Điều hướng học sinh">${links.map(([id, label]) =>
      `<a href="#${id}"${id === current ? ' aria-current="page"' : ''}>${includeIcons ? navigationIcons[id] : ''}<span>${label}</span></a>`
    ).join('')}</nav>`;
  }

  function studentChrome({ title, current, stars = 438, name, avatar = 'MN', avatarImage = '' }) {
    const avatarMarkup = avatarImage ? `<img src="${avatarImage}" alt="">` : `<span class="account-avatar avatar">${avatar}</span>`;
    return {
      topbar: `<header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">G</span><span>${title}</span><span class="desktop-brand">GetGo Local</span></div>${navigation(current, 'desktop-nav')}<div class="top-actions"><span class="stars">★ ${stars}</span><div class="account">${avatarMarkup}<span class="account-copy"><strong>${name}</strong><small>★ ${stars} ngôi sao</small></span><span aria-hidden="true">⌄</span></div></div></header>`,
      bottomNav: navigation(current, 'bottom-nav', true),
    };
  }

  function gardenArt(position, className = `${position}-art`) {
    return `<div class="${className}" aria-hidden="true"><picture><source media="(orientation: landscape) and (min-width: 700px)" srcset="../shared/assets/garden-${position}-landscape.png"><img src="../shared/assets/garden-${position}-portrait.png" alt=""></picture></div>`;
  }

  function bindTheme({ toggle, extraTriggers = [], onChange } = {}) {
    const queryTheme = new URLSearchParams(location.search).get('mode');
    const initialDark = queryTheme === 'dark' || (queryTheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const setTheme = dark => {
      root.dataset.theme = dark ? 'dark' : 'light';
      if (toggle) {
        toggle.setAttribute('aria-pressed', String(dark));
        toggle.setAttribute('aria-label', dark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối');
      }
      onChange?.(dark);
    };
    setTheme(initialDark);
    [toggle, ...extraTriggers].filter(Boolean).forEach(control => control.addEventListener('click', () => setTheme(root.dataset.theme !== 'dark')));
    return setTheme;
  }

  window.KidsDesign = { bindTheme, gardenArt, icon, navigationIcons, studentChrome };
})();
