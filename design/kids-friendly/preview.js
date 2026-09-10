const designs = [
  {
    id: 'student-profile',
    title: { en: 'Student profile', vi: 'Hồ sơ học sinh' },
    files: {
      portrait: { light: 'student-profile/htmls/portrait-light.html', dark: 'student-profile/htmls/portrait-dark.html' },
      landscape: { light: 'student-profile/htmls/landscape-light.html', dark: 'student-profile/htmls/landscape-dark.html' },
    },
  },
];

const translations = {
  en: { gallery: 'Design gallery', pages: 'Pages', preview: 'Preview', orientation: 'Orientation', portrait: 'Portrait', landscape: 'Landscape', theme: 'Theme', light: 'Light', dark: 'Dark', language: 'Language' },
  vi: { gallery: 'Thư viện thiết kế', pages: 'Trang', preview: 'Xem trước', orientation: 'Hướng màn hình', portrait: 'Dọc', landscape: 'Ngang', theme: 'Giao diện', light: 'Sáng', dark: 'Tối', language: 'Ngôn ngữ' },
};

const state = {
  designId: designs[0].id,
  orientation: 'portrait',
  theme: 'light',
  language: navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en',
};

const pageList = document.querySelector('#page-list');
const title = document.querySelector('#selected-page-title');
const frame = document.querySelector('#design-frame');
const shell = document.querySelector('#device-shell');
const scaler = document.querySelector('#device-scaler');
const stage = document.querySelector('#preview-stage');
const addressBar = document.querySelector('#address-bar');
const languageSelect = document.querySelector('#language-select');

function selectedDesign() {
  return designs.find(design => design.id === state.designId) ?? designs[0];
}

function renderPageList() {
  pageList.replaceChildren(...designs.map(design => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `page-button${design.id === state.designId ? ' is-active' : ''}`;
    button.textContent = design.title[state.language];
    button.setAttribute('aria-current', design.id === state.designId ? 'page' : 'false');
    button.addEventListener('click', () => {
      state.designId = design.id;
      render();
    });
    return button;
  }));
}

function updatePressedState(selector, value, attribute) {
  document.querySelectorAll(selector).forEach(button => {
    const active = button.dataset[attribute] === value;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderTranslations() {
  document.documentElement.lang = state.language;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = translations[state.language][element.dataset.i18n];
  });
  languageSelect.value = state.language;
}

function render() {
  const design = selectedDesign();
  renderTranslations();
  renderPageList();
  title.textContent = design.title[state.language];
  frame.title = `${design.title[state.language]} — ${translations[state.language][state.orientation]}, ${translations[state.language][state.theme]}`;
  frame.src = design.files[state.orientation][state.theme];
  shell.classList.toggle('portrait', state.orientation === 'portrait');
  shell.classList.toggle('landscape', state.orientation === 'landscape');
  addressBar.textContent = `${design.id} / ${state.orientation} / ${state.theme}`;
  updatePressedState('[data-orientation]', state.orientation, 'orientation');
  updatePressedState('[data-theme]', state.theme, 'theme');
  requestAnimationFrame(fitDevice);
}

function fitDevice() {
  const availableWidth = Math.max(1, stage.clientWidth - 76);
  const availableHeight = Math.max(1, stage.clientHeight - 76);
  const scale = Math.min(1, availableWidth / shell.offsetWidth, availableHeight / shell.offsetHeight);
  shell.style.setProperty('--device-scale', String(scale));
  scaler.style.width = `${Math.round(shell.offsetWidth * scale)}px`;
  scaler.style.height = `${Math.round(shell.offsetHeight * scale)}px`;
}

document.querySelectorAll('[data-orientation]').forEach(button => {
  button.addEventListener('click', () => {
    state.orientation = button.dataset.orientation;
    render();
  });
});

document.querySelectorAll('[data-theme]').forEach(button => {
  button.addEventListener('click', () => {
    state.theme = button.dataset.theme;
    render();
  });
});

languageSelect.addEventListener('change', () => {
  state.language = languageSelect.value;
  render();
});

new ResizeObserver(fitDevice).observe(stage);
window.addEventListener('resize', fitDevice);
render();
