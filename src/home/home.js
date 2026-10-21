(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cards = [...document.querySelectorAll('.topic-card')];
  const topics = new Map(cards.map(card => [card.dataset.topic, card]));
  const filters = [...document.querySelectorAll('[data-filter]')];
  const categoryNames = { all: '全部主题', space: '宇宙星球', life: '生命奥秘', nature: '自然万象', culture: '人文足迹', data: '数据发现' };
  const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase('zh-CN').trim();
  const searchable = new Map(cards.map(card => [card, normalize(card.textContent + ' ' + card.dataset.keywords)]));
  let currentFilter = 'all';
  let visibleCards = cards;
  let surpriseId = null;

  function applyFilters() {
    const query = normalize($('topicSearch').value);
    const terms = query.split(/\s+/).filter(Boolean);
    visibleCards = cards.filter(card => {
      const visible = (currentFilter === 'all' || card.dataset.category === currentFilter) && terms.every(term => searchable.get(card).includes(term));
      card.hidden = !visible;
      return visible;
    });
    filters.forEach(button => {
      const active = button.dataset.filter === currentFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('clearSearch').hidden = !query;
    $('topicGrid').classList.toggle('is-filtered', currentFilter !== 'all' || Boolean(query));
    $('emptyState').hidden = visibleCards.length > 0;
    $('resultCount').textContent = currentFilter === 'all' && !query
      ? '7 个世界，等你发现'
      : visibleCards.length + ' 个主题' + (currentFilter === 'all' ? ' · 搜索结果' : ' · ' + categoryNames[currentFilter]);
  }

  filters.forEach(button => button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    applyFilters();
  }));
  $('topicSearch').addEventListener('input', applyFilters);
  $('searchForm').addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
  $('clearSearch').addEventListener('click', () => {
    $('topicSearch').value = '';
    applyFilters();
    $('topicSearch').focus();
  });
  $('resetFilters').addEventListener('click', () => {
    currentFilter = 'all';
    $('topicSearch').value = '';
    applyFilters();
    filters[0].focus();
  });
  $('exploreTools').hidden = false;

  // Reuse the real card content so recommendations never drift from the gallery.
  function chooseTopic() {
    let pool = visibleCards.length ? visibleCards : cards;
    if (pool.length > 1) pool = pool.filter(card => card.dataset.topic !== surpriseId);
    const card = pool[Math.floor(Math.random() * pool.length)];
    surpriseId = card.dataset.topic;
    $('surpriseTitle').textContent = card.querySelector('h3').textContent;
    $('surpriseQuestion').textContent = card.querySelector('.topic-description').textContent;
    $('surpriseImage').src = card.querySelector('img').getAttribute('src');
    $('surpriseImage').alt = card.querySelector('img').alt;
    $('surpriseLink').href = card.getAttribute('href');
    $('surpriseLink').dataset.topicLink = surpriseId;
  }
  $('surpriseBtn').addEventListener('click', () => {
    chooseTopic();
    if (typeof $('surpriseDialog').showModal === 'function') $('surpriseDialog').showModal();
    else { rememberTopic(surpriseId); window.location.assign($('surpriseLink').href); }
  });
  $('reshuffleBtn').addEventListener('click', chooseTopic);
  $('closeSurprise').addEventListener('click', () => $('surpriseDialog').close());
  $('surpriseLink').addEventListener('click', () => { if ($('surpriseDialog').open) $('surpriseDialog').close(); });
  $('surpriseDialog').addEventListener('click', event => {
    const rect = $('surpriseDialog').getBoundingClientRect();
    if (event.target === $('surpriseDialog') && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) $('surpriseDialog').close();
  });
  $('surpriseBtn').hidden = false;

  // Only a known topic ID is stored. This is a visit shortcut, not learning progress.
  const recentKey = 'scivis.home.recent.v1';
  function renderRecent() {
    try {
      const id = localStorage.getItem(recentKey);
      const card = topics.get(id);
      $('recentVisit').hidden = !card;
      if (card) {
        $('recentLink').textContent = card.querySelector('h3').textContent + ' · 再看看 →';
        $('recentLink').href = card.getAttribute('href');
        $('recentLink').dataset.topicLink = id;
      }
    } catch { $('recentVisit').hidden = true; }
  }
  function rememberTopic(id) {
    if (!topics.has(id)) return;
    try { localStorage.setItem(recentKey, id); } catch { /* Exploration works without storage. */ }
  }
  function onTopicClick(event) {
    const link = event.target.closest('a[data-topic], a[data-topic-link]');
    if (link) rememberTopic(link.dataset.topic || link.dataset.topicLink);
  }
  document.addEventListener('click', onTopicClick);
  document.addEventListener('auxclick', event => { if (event.button === 1) onTopicClick(event); });
  $('clearRecent').addEventListener('click', () => {
    try { localStorage.removeItem(recentKey); } catch { /* Storage can be disabled. */ }
    $('recentVisit').hidden = true;
  });
  window.addEventListener('pageshow', renderRecent);
  renderRecent();
  document.querySelector('a[href="#companion"]').addEventListener('click', () => { $('companionDetails').open = true; });

  // Quiet background: at most 15 fps, capped device-pixel ratio, no work in hidden tabs.
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionKey = 'scivis.home.motion.v1';
  let userPaused = false;
  try { userPaused = localStorage.getItem(motionKey) === 'off'; } catch { /* System preference remains available. */ }
  let paused = userPaused || reduceMotion.matches;
  const canvas = $('stars');
  const context = canvas.getContext('2d');
  let width = 0, height = 0, stars = [], animationFrame = 0, lastPaint = 0;
  let seed = 20261021;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  function paint(time = 0) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#b3cfc3';
    for (const star of stars) {
      context.globalAlpha = .16 + .34 * (.5 + .5 * Math.sin(time * .0003 * star.speed + star.phase));
      context.beginPath();
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }
  function animate(time) {
    if (paused || document.hidden) { animationFrame = 0; return; }
    if (time - lastPaint > 66) { paint(time); lastPaint = time; }
    animationFrame = requestAnimationFrame(animate);
  }
  function syncAnimation() {
    paused = userPaused || reduceMotion.matches;
    document.documentElement.classList.toggle('motion-paused', paused);
    $('motionBtn').setAttribute('aria-pressed', String(paused));
    $('motionBtn').setAttribute('aria-label', paused ? '开启动态效果' : '暂停动态效果');
    $('motionBtn').querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
    $('motionBtn').disabled = reduceMotion.matches;
    $('motionBtn').title = reduceMotion.matches ? '已按系统设置减少动态效果' : paused ? '动态效果已暂停' : '暂停背景与地球动态效果';
    if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
    if (!paused && !document.hidden && context) animationFrame = requestAnimationFrame(animate);
    else paint();
  }
  function resizeStars() {
    if (!context) return;
    width = innerWidth;
    height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    seed = 20261021;
    stars = Array.from({ length: width > 800 ? 88 : 45 }, () => ({ x: random() * width, y: random() * height, radius: .35 + random() * .6, phase: random() * Math.PI * 2, speed: .4 + random() * .8 }));
    paint();
  }
  $('motionBtn').addEventListener('click', () => {
    userPaused = !userPaused;
    try { localStorage.setItem(motionKey, userPaused ? 'off' : 'on'); } catch { /* The current choice still applies. */ }
    syncAnimation();
  });
  document.addEventListener('visibilitychange', syncAnimation);
  reduceMotion.addEventListener('change', syncAnimation);
  window.addEventListener('resize', resizeStars, { passive: true });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(animationFrame); animationFrame = 0; });
  window.addEventListener('pageshow', syncAnimation);
  resizeStars();
  syncAnimation();
  applyFilters();
})();
