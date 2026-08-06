// 公共模块：科普介绍卡片
// 用法：
//   const infoCard = createInfoCard(document.body, {
//     onShow: (userData, { title, body }) => onShowText(userData)
//   });
//   infoCard.show(userData); // userData = { name, type, color, info: string[] }
export function createInfoCard(container, { onShow } = {}) {
  const card = document.createElement('div');
  card.id = 'infoCard';
  card.style.cssText = `
    position: absolute; right: 20px; bottom: 20px; width: 300px;
    color: #fff; background: rgba(10,15,30,0.9); border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px; padding: 18px 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.6);
    display: none; z-index: 10; backdrop-filter: blur(6px); font-family: inherit;
  `;

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '\u00D7';
  close.style.cssText = `
    position: absolute; top: 10px; right: 12px; cursor: pointer; color: #9aa3b5;
    font-size: 18px; line-height: 1; background: none; border: none;
  `;
  close.addEventListener('mouseenter', () => (close.style.color = '#fff'));
  close.addEventListener('mouseleave', () => (close.style.color = '#9aa3b5'));

  const h3 = document.createElement('h3');
  h3.style.cssText = 'margin: 0 0 10px; font-size: 20px; display: flex; align-items: center; gap: 10px;';
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.cssText = 'width: 14px; height: 14px; border-radius: 50%; display: inline-block; flex-shrink: 0;';
  const title = document.createElement('span');
  h3.appendChild(dot);
  h3.appendChild(title);

  const body = document.createElement('div');
  body.id = 'cardBody';

  card.appendChild(close);
  card.appendChild(h3);
  card.appendChild(body);
  container.appendChild(card);

  close.addEventListener('click', () => hide());

  function show(userData) {
    if (!userData || !userData.name) return;
    dot.style.background = '#' + (userData.color || 0xffffff).toString(16).padStart(6, '0');
    title.textContent = userData.name + '（' + (userData.type || '天体') + '）';
    body.innerHTML = (userData.info || []).map((line) => '<p style="margin:6px 0;font-size:13px;line-height:1.7;color:#cfd6e6;">' + line + '</p>').join('');
    card.style.display = 'block';
    if (onShow) onShow(userData);
  }

  function hide() {
    card.style.display = 'none';
  }

  return { element: card, show, hide };
}