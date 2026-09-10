const root = document.documentElement;
const fixedTheme = root.dataset.theme;
document.querySelector('#app').innerHTML = `
  <div class="brand-corner" aria-label="GetGo"><img src="../assets/getgo-icon-blue.png" alt=""><span>GetGo</span></div>
  <button class="theme-toggle" type="button" aria-label="Chuyển sang chế độ tối" aria-pressed="false">◐</button>
  <div class="auth-stage">
    <section class="auth-card" aria-labelledby="login-title">
      <header class="brand-lockup"><div class="brand-main"><img src="../assets/getgo-icon-blue.png" alt=""><strong>GetGo</strong></div><p class="tagline" id="login-title">Đăng nhập vào tài khoản của bạn</p></header>
      <div class="separator" role="separator">Đăng nhập bằng</div>
      <div class="actions" aria-label="Đăng nhập bằng mạng xã hội">
        <button class="login-button google" type="button"><span class="provider-mark" aria-hidden="true">G</span><span>Đăng nhập bằng Google</span></button>
        <button class="login-button facebook" type="button"><span class="provider-mark" aria-hidden="true">f</span><span>Đăng nhập bằng Facebook</span></button>
        <button class="login-button apple" type="button"><span class="provider-mark" aria-hidden="true">●</span><span>Đăng nhập bằng Apple ID</span></button>
      </div>
      <div class="separator" role="separator">hoặc</div>
      <div class="email-actions">
        <button class="login-button email-login" type="button">Đăng nhập bằng email</button>
        <button class="login-button email-register" type="button">Tạo tài khoản bằng email</button>
      </div>
      <p class="legal">Khi tạo tài khoản, bạn đồng ý với <a href="#terms">Điều Khoản Dịch Vụ</a> và <a href="#privacy">Chính Sách Quyền Riêng Tư</a> của chúng tôi.</p>
    </section>
  </div>`;
const toggle = document.querySelector('.theme-toggle');
function setTheme(dark) {
  root.dataset.theme = dark ? 'dark' : 'light';
  toggle.setAttribute('aria-pressed', String(dark));
  toggle.setAttribute('aria-label', dark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối');
}
if (root.dataset.mode === 'responsive') {
  setTheme(matchMedia('(prefers-color-scheme: dark)').matches);
  toggle.addEventListener('click', () => setTheme(root.dataset.theme !== 'dark'));
} else {
  setTheme(fixedTheme === 'dark');
  toggle.disabled = true;
}
