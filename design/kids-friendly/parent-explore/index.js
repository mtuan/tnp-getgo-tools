const svg = paths => `<svg aria-hidden="true" viewBox="0 0 24 24">${paths}</svg>`;

const navigation = [
  ['students', 'Học sinh', '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0m1-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5"/>'],
  ['collection', 'Bộ sưu tập', '<path d="M4 4v16m5-16 2 16m5-16 4 16"/>'],
  ['explore', 'Khám phá', '<circle cx="12" cy="12" r="8"/><path d="m14.5 9.5-2 5-5 2 2-5 5-2Z"/>'],
  ['profile', 'Hồ sơ', '<circle cx="12" cy="8" r="4"/><path d="M5 22a7 7 0 0 1 14 0"/>'],
];

const navigationLinks = (className, includeIcons = false) => `
  <nav class="${className}" aria-label="Điều hướng phụ huynh">
    ${navigation.map(([id, label, path]) => `<a href="#${id}"${id === 'explore' ? ' aria-current="page"' : ''}>${includeIcons ? svg(path) : ''}<span>${label}</span></a>`).join('')}
  </nav>`;

const monogram = (letters, start, end) => `
  <span class="monogram" style="--mark-a:${start};--mark-b:${end}" aria-hidden="true">
    ${letters.split('').slice(0, 4).map(letter => `<span>${letter}</span>`).join('')}
  </span>`;

const topics = [
  { letters: 'HELIX', title: 'Helix Maths · Lớp 3', meta: 'GetGo Learning · Toán · Lớp 3', rating: '☆ ☆ ☆ ☆ ☆ (0)', description: 'Explore official-style practice materials, structured quiz collections, and progress-focused learning activities.', colors: ['#7437ee', '#9d51ee'], added: true },
  { letters: 'IKMC', title: 'IKMC - Vòng chính - Benjamin', meta: 'GetGo Learning · Toán · Lớp 5, Lớp 6', rating: '★ ★ ★ ★ ★ (1)', description: 'Kỳ thi Toán Quốc tế Kangaroo', colors: ['#f29a0c', '#ffc237'], added: true },
  { letters: 'IKMC', title: 'IKMC - Vòng chính - Ecolier', meta: 'GetGo Learning · Toán · Lớp 3, Lớp 4', rating: '☆ ☆ ☆ ☆ ☆ (0)', description: 'Kỳ thi Toán Quốc tế Kangaroo', colors: ['#f29a0c', '#ffc237'], added: true },
  { letters: 'IKMC', title: 'IKMC - Vòng chính - Pre-Ecolier', meta: 'GetGo Learning · Toán · Lớp 1, Lớp 2', rating: '☆ ☆ ☆ ☆ ☆ (0)', description: 'Kỳ thi Toán Quốc tế Kangaroo', colors: ['#f29a0c', '#ffc237'], added: false },
];

const topicCard = topic => `
  <article class="topic-card">
    ${monogram(topic.letters, ...topic.colors)}
    <div class="topic-copy">
      <h2>${topic.title}</h2>
      <p class="meta">${topic.meta}</p>
      <p class="rating">${topic.rating}</p>
    </div>
    <p class="description">${topic.description}</p>
    <a class="topic-link" href="#topic" aria-label="Mở ${topic.title}"></a>
    <button class="state" type="button" aria-label="${topic.added ? `Xóa ${topic.title} khỏi bộ sưu tập` : `Thêm ${topic.title} vào bộ sưu tập`}">
      <span class="state-mark" aria-hidden="true">${topic.added ? '✓' : '+'}</span>
    </button>
  </article>`;

const compass = svg('<circle cx="12" cy="12" r="8"/><path d="m14.5 9.5-2 5-5 2 2-5 5-2Z"/>');

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark" aria-hidden="true">G</span><span class="mobile-title">Khám phá</span><span class="desktop-name">GetGo Local</span></div>
    ${navigationLinks('desktop-nav')}
    <div class="account"><span class="avatar">M</span><strong>Mai Anh Tuan</strong><span class="chevron" aria-hidden="true">⌄</span></div>
  </header>
  ${KidsDesign.gardenArt('header')}
  <div class="content kids-page-content">
    <section class="intro" aria-labelledby="page-title">
      <span class="intro-icon">${compass}</span>
      <div><h1 id="page-title">Khám phá chủ đề</h1><p>Khám phá toàn bộ kho GetGo và thêm chủ đề vào bộ sưu tập gia đình.</p></div>
    </section>
    <section class="filters" aria-label="Bộ lọc chủ đề">
      <div class="filter"><span>Học sinh</span><button type="button">Bộ lọc tùy chỉnh</button></div>
      <div class="filter"><span>Lớp</span><button type="button">Tất cả lớp</button></div>
      <div class="filter"><span>Môn học</span><button type="button">Tất cả môn học</button></div>
      <label class="filter"><span>Tìm kiếm</span><input type="search" placeholder="Tìm kiếm chủ đề"></label>
    </section>
    <article class="featured">
      ${monogram('HELIX', '#6f38ed', '#a757f1')}
      <div class="topic-copy"><h2>Helix Maths · Lớp 3</h2><p class="meta">GetGo Learning · Toán · Lớp 3</p><p class="rating">☆ ☆ ☆ ☆ ☆ (0)　♙ 0 Người dùng</p></div>
      <p class="description">Explore official-style practice materials, structured quiz collections, and progress-focused learning activities.</p>
      <span class="state"><span class="state-mark">✓</span><span>Trong bộ sưu tập</span></span>
    </article>
    <div class="pager" aria-label="Trang 1 trên 2"><span></span><span></span></div>
    <section class="topics" aria-label="Danh sách chủ đề">${topics.map(topicCard).join('')}</section>
  </div>
  ${KidsDesign.gardenArt('footer')}
  <img class="guide" src="assets/explore-guide.png" alt="" aria-hidden="true">
  <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Chuyển sang chế độ tối">◐</button>
  ${navigationLinks('bottom-nav', true)}`;

KidsDesign.bindTheme({ toggle: document.querySelector('.theme-toggle') });
