const root = document.documentElement;
const page = document.querySelector('#app');
const fixedTheme = root.dataset.theme;
const icon = paths => `<svg aria-hidden="true" viewBox="0 0 24 24">${paths}</svg>`;
const questions = [
  { prompt: 'Số nào lớn hơn 48 nhưng nhỏ hơn 52?', answers: ['47','49','52','54'], selected: 1 },
  { prompt: 'Một hộp có 6 hàng bút, mỗi hàng 4 chiếc. Có tất cả bao nhiêu chiếc bút?', answers: ['10','20','24','28'] },
  { prompt: 'Chọn phép tính có kết quả bằng 36.', answers: ['6 × 6','40 − 3','7 × 5','30 + 5'], selected: 0 },
  { prompt: 'Điền số tiếp theo: 12, 18, 24, 30, …', answers: ['32','34','36','38'] },
  { prompt: 'Hình vuông có bao nhiêu cạnh bằng nhau?', answers: ['2 cạnh','3 cạnh','4 cạnh','5 cạnh'] },
];
const questionCard = (question,index) => `
  <article class="question-card" data-question="${index}">
    <header class="question-head"><strong>Câu hỏi ${index+1}</strong><small>1 điểm</small></header>
    <div class="question-body">
      <p class="prompt">${question.prompt}</p>
      <div class="answers">${question.answers.map((answer,answerIndex) => `<button class="answer${question.selected===answerIndex?' is-selected':''}" type="button"><span class="answer-letter">${String.fromCharCode(65+answerIndex)}</span><span>${answer}</span></button>`).join('')}</div>
    </div>
  </article>`;
const navigator = className => `<div class="${className}">${questions.map((_,index) => `<button class="question-nav${index<2?' is-answered':''}" type="button" data-nav="${index}">${index+1}</button>`).join('')}</div>`;

page.dataset.examMode = 'all';
page.innerHTML = `
  <header class="topbar"><div class="brand"><span class="brand-mark">G</span><span>Đề thi</span></div><div class="top-actions"><span class="timer">◷ 18:42</span><button class="exit" type="button" aria-label="Thoát đề thi">${icon('<path d="m15 18 6-6-6-6M21 12H9M9 4H4v16h5"/>')}</button></div></header>
  <div class="header-art" aria-hidden="true"><picture><source media="(orientation:landscape) and (min-width:700px)" srcset="../../shared/assets/garden-header-landscape.png"><img src="../../shared/assets/garden-header-portrait.png" alt=""></picture></div>
  <div class="content">
    <section class="exam-heading"><span class="heading-icon">${icon('<path d="M6 3h9l3 3v15H6zM9 11h6M9 15h6M9 7h3"/>')}</span><span class="heading-copy"><h1>Toán vui mỗi ngày</h1><p>Lớp 3 · 5 câu hỏi · 20 phút</p></span><div class="mode-switch" aria-label="Kiểu hiển thị câu hỏi"><button class="mode-button" type="button" data-mode="all" aria-label="Hiển thị tất cả câu hỏi" aria-pressed="true">Tất cả</button><button class="mode-button" type="button" data-mode="single" aria-label="Hiển thị từng câu một" aria-pressed="false">Từng câu</button></div></section>
    <div class="exam-layout">
      <section class="questions" aria-label="Câu hỏi">${questions.map(questionCard).join('')}<button class="single-next js-next" type="button">Câu tiếp theo →</button></section>
      <aside class="exam-sidebar"><div class="progress-panel"><span class="progress-line"><span>Tiến độ</span><strong>2 / 5 đã trả lời</strong></span><div class="progress-bar"><span></span></div></div><div class="navigator-panel"><span class="panel-label">Câu hỏi</span>${navigator('navigator')}</div><button class="submit" type="button">Nộp bài</button><img class="exam-accent" src="../assets/exam-adventure-accent.png" alt=""></aside>
    </div>
  </div>
  <div class="footer-art" aria-hidden="true"><picture><source media="(orientation:landscape) and (min-width:700px)" srcset="../../shared/assets/garden-footer-landscape.png"><img src="../../shared/assets/garden-footer-portrait.png" alt=""></picture></div>
  <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Chuyển sang chế độ tối">◐</button>
  <section class="mobile-exam-panel" aria-label="Điều hướng đề thi"><div class="mobile-summary"><span>Tiến độ</span><strong>2 / 5 đã trả lời</strong></div>${navigator('mobile-navigator')}<div class="mobile-actions"><button class="submit" type="button">Nộp bài</button></div></section>`;

let currentIndex = 0;
const modeButtons = [...document.querySelectorAll('.mode-button')];
const cards = [...document.querySelectorAll('.question-card')];
const navButtons = [...document.querySelectorAll('.question-nav')];
const updateView = () => {
  const single = page.dataset.examMode === 'single';
  cards.forEach((card,index) => { card.hidden = single && index !== currentIndex; });
  navButtons.forEach(button => button.classList.toggle('is-current', Number(button.dataset.nav) === currentIndex));
  document.querySelectorAll('.js-next').forEach(button => { button.disabled = currentIndex === questions.length-1; });
};
const setMode = mode => {
  page.dataset.examMode = mode;
  modeButtons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  updateView();
};
modeButtons.forEach(button => button.addEventListener('click',() => setMode(button.dataset.mode)));
navButtons.forEach(button => button.addEventListener('click',() => { currentIndex=Number(button.dataset.nav); if(page.dataset.examMode==='single') updateView(); else cards[currentIndex].scrollIntoView({behavior:'smooth',block:'start'}); }));
document.querySelectorAll('.js-next').forEach(button => button.addEventListener('click',() => { currentIndex=Math.min(questions.length-1,currentIndex+1); updateView(); }));
document.querySelectorAll('.answer').forEach(button => button.addEventListener('click',() => button.closest('.answers').querySelectorAll('.answer').forEach(item => item.classList.toggle('is-selected',item===button))));
const themeToggle=document.querySelector('.theme-toggle');
const setTheme=dark=>{root.dataset.theme=dark?'dark':'light';themeToggle.setAttribute('aria-pressed',String(dark));themeToggle.setAttribute('aria-label',dark?'Chuyển sang chế độ sáng':'Chuyển sang chế độ tối');};
if(root.dataset.mode==='responsive'){setTheme(matchMedia('(prefers-color-scheme:dark)').matches);themeToggle.addEventListener('click',()=>setTheme(root.dataset.theme!=='dark'));}else{setTheme(fixedTheme==='dark');themeToggle.disabled=true;}
updateView();
