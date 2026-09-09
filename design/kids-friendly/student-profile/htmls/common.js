const root = document.documentElement;
const fixedTheme = root.dataset.theme;

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark" aria-hidden="true">G</span><span>Hồ sơ</span></div>
    <nav class="desktop-nav" aria-label="Điều hướng học sinh">
      <a href="#learning">Học tập</a><a href="#activities">Hoạt động</a><a href="#ranking">Bảng xếp hạng</a><a href="#profile" aria-current="page">Hồ sơ</a>
    </nav>
    <div class="top-actions"><span class="stars" aria-label="0 ngôi sao">★ 0</span><button class="theme-toggle" type="button" aria-pressed="false" aria-label="Chuyển sang chế độ tối">◐</button></div>
  </header>
  <section class="hero" aria-labelledby="student-name">
    <div class="avatar"><img src="../assets/student-charly-avatar.png" alt="Ảnh đại diện của Mai Thanh Ngọc"></div>
    <div class="identity"><h1 id="student-name">Mai Thanh Ngọc (Charly)</h1><p>Lớp 3 · Nữ</p></div>
    <button class="edit-profile" type="button"><span aria-hidden="true">✎</span> Chỉnh sửa hồ sơ</button>
  </section>
  <div class="settings-grid">
    <section aria-labelledby="profile-settings"><h2 class="section-title" id="profile-settings">Hồ sơ</h2><div class="settings-card">
      <button class="setting-row" type="button"><span class="row-icon" aria-hidden="true">✎</span><span class="row-copy"><strong>Chỉnh sửa hồ sơ</strong><small>Cập nhật thông tin học sinh</small></span><span></span><span class="chevron" aria-hidden="true">›</span></button>
      <button class="setting-row" type="button"><span class="row-icon" aria-hidden="true">⚿</span><span class="row-copy"><strong>Đặt Mã PIN</strong><small>Bảo mật tài khoản của bạn</small></span><span class="row-value pill">Bật</span><span class="chevron" aria-hidden="true">›</span></button>
    </div></section>
    <section aria-labelledby="appearance-settings"><h2 class="section-title" id="appearance-settings">Giao diện</h2><div class="settings-card">
      <button class="setting-row" type="button"><span class="row-icon" aria-hidden="true">◎</span><span class="row-copy"><strong>Ngôn ngữ</strong><small>Chọn ngôn ngữ ưa thích của bạn</small></span><span class="row-value">Tiếng Việt</span><span class="chevron" aria-hidden="true">›</span></button>
      <button class="setting-row" type="button"><span class="row-icon" aria-hidden="true">◉</span><span class="row-copy"><strong>Màu chủ đạo</strong><small>Lựa chọn màu chủ đạo cho ứng dụng</small></span><span class="row-value">Xanh lục <i class="swatch" aria-hidden="true"></i></span><span class="chevron" aria-hidden="true">›</span></button>
      <button class="setting-row js-theme-row" type="button"><span class="row-icon" aria-hidden="true">◐</span><span class="row-copy"><strong>Chế độ Tối / Sáng</strong><small>Chuyển đổi giữa chế độ tối và sáng</small></span><span class="row-value js-theme-value">Sáng</span><span class="chevron" aria-hidden="true">›</span></button>
    </div></section>
  </div>
  <nav class="bottom-nav" aria-label="Điều hướng học sinh">
    <a href="#learning"><span aria-hidden="true">▤</span>Học tập</a><a href="#activities"><span aria-hidden="true">⌁</span>Hoạt động</a><a href="#ranking"><span aria-hidden="true">♜</span>Bảng xếp hạng</a><a href="#profile" aria-current="page"><span aria-hidden="true">♙</span>Hồ sơ</a>
  </nav>`;

const themeToggle = document.querySelector('.theme-toggle');
const themeRow = document.querySelector('.js-theme-row');
const themeValue = document.querySelector('.js-theme-value');
const setTheme = dark => {
  root.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', dark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối');
  themeValue.textContent = dark ? 'Tối' : 'Sáng';
};

if (root.dataset.mode === 'responsive') {
  setTheme(matchMedia('(prefers-color-scheme: dark)').matches);
  themeToggle.addEventListener('click', () => setTheme(root.dataset.theme !== 'dark'));
  themeRow.addEventListener('click', () => setTheme(root.dataset.theme !== 'dark'));
} else {
  setTheme(fixedTheme === 'dark');
  themeToggle.disabled = true;
  themeRow.disabled = true;
}
