const { icon } = KidsDesign;
const icons = {
  topic: icon('<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5Zm16 0A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z"/>'),
  switch: icon('<path d="m16 3 4 4-4 4M20 7H4m4 14-4-4 4-4M4 17h16"/>'),
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  letters: icon('<path d="M5 19 10 5l5 14M7 14h6M17 8h3m-1.5-1.5V10"/>'),
  animals: icon('<path d="M8 12c-2-3-5-2-5 1 0 2 2 3 4 2m9-3c2-3 5-2 5 1 0 2-2 3-4 2"/><path d="M7 14c0-4 2-7 5-7s5 3 5 7c0 4-2 6-5 6s-5-2-5-6Z"/><circle cx="10" cy="13" r=".5"/><circle cx="14" cy="13" r=".5"/>'),
  numbers: icon('<path d="M5 7c0-2 1-3 3-3s3 1 3 3c0 4-6 4-6 9h6M15 5h4l-3 5c2 0 4 1 4 3.5S18 17 16 17c-1 0-2-.3-3-1"/>'),
  science: icon('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"/>'),
  book: icon('<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5Zm16 0A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z"/>'),
  activity: icon('<path d="M3 12h4l2-7 5 14 2-7h5"/>'),
  trophy: icon('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Zm4 8v5m-4 3h8M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4"/>'),
  user: icon('<circle cx="12" cy="8" r="4"/><path d="M5 22a7 7 0 0 1 14 0"/>'),
};

const quizzes = [
  { title: 'Khám phá chữ cái', icon: icons.letters, state: 'new', status: 'Mới', next: 'Bắt đầu bài học đầu tiên' },
  { title: 'Thế giới động vật', icon: icons.animals, state: 'building', status: 'Đang học', last: 'Hôm qua', completedExams: 2, score: 68, next: 'Làm thêm 1 bài thi để xác nhận kết quả' },
  { title: 'Số học 1–100', icon: icons.numbers, state: 'complete', status: 'Hoàn thành', last: '2 ngày trước', completedExams: 5, score: 86, next: 'Xem kết quả hoặc tiếp tục luyện tập' },
  { title: 'Nhà khoa học nhí', icon: icons.science, state: 'practice', status: 'Luyện thêm', last: '1 tuần trước', completedExams: 4, score: 62, next: 'Luyện tập thêm rồi làm lại bài thi' },
];
const chrome = KidsDesign.studentChrome({ title: 'Học tập', current: 'learning', name: 'Minh Anh', avatar: 'MA' });

const quizCard = quiz => `
  <button class="quiz-card" type="button" data-state="${quiz.state}" aria-label="Mở ${quiz.title}">
    <span class="quiz-icon">${quiz.icon}</span>
    <span class="quiz-main">
      <span class="quiz-title-line"><strong class="quiz-title">${quiz.title}</strong>${quiz.score != null ? `<strong class="score">${quiz.score}%</strong>` : ''}</span>
      <span class="quiz-meta"><span class="status">${quiz.status}</span>${quiz.last ? `<span class="last-seen">${icons.clock}${quiz.last}</span>` : ''}</span>
    </span>
    ${quiz.score != null ? `<span class="progress-summary"><span>Tiến độ:</span> đã hoàn thành <strong>${quiz.completedExams} bài thi</strong>, điểm trung bình <strong>${quiz.score}%</strong></span>` : ''}
    <span class="next-step"><span class="next-label">Tiếp theo:</span><strong>${quiz.next}</strong></span>
  </button>`;

document.querySelector('#app').innerHTML = `
  ${chrome.topbar}
  ${KidsDesign.gardenArt('header')}
  <div class="content kids-page-content">
    <section class="topic-header" aria-labelledby="topic-title">
      <span class="topic-icon">${icons.topic}</span><span class="topic-copy"><h1 id="topic-title">Hành trình kiến thức</h1><p>GetGo · Lớp 3 · 4 bài học</p></span>
      <button class="switch-topic" type="button" aria-label="Đổi chủ đề">${icons.switch}</button>
    </section>
    <section aria-labelledby="quiz-heading">
      <div class="section-heading"><h2 id="quiz-heading">Bài học của em</h2><img class="learning-accent" src="assets/learning-trail-accent.png" alt=""></div>
      <div class="quiz-list">${quizzes.map(quizCard).join('')}</div>
    </section>
  </div>
  ${KidsDesign.gardenArt('footer')}
  <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Chuyển sang chế độ tối">◐</button>
  ${chrome.bottomNav}`;

KidsDesign.bindTheme({ toggle: document.querySelector('.theme-toggle') });
