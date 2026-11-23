(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const app = $('#app');
  const sidebar = $('.sidebar', app);
  if (!app || !sidebar || $('.telegram-rail', app)) return;

  // Move the existing navigation controls into Telegram's narrow left rail.
  const rail = document.createElement('aside');
  rail.className = 'telegram-rail';
  rail.innerHTML = '<button class="telegram-menu-button" id="telegram-menu-open" type="button" aria-label="Открыть меню">☰</button><div class="telegram-rail-divider"></div>';
  const nav = $('.main-nav', sidebar);
  if (nav) {
    nav.classList.add('telegram-rail-nav');
    rail.appendChild(nav);
  }
  const railFoot = document.createElement('div');
  railFoot.className = 'telegram-rail-foot';
  railFoot.textContent = 'AST';
  rail.appendChild(railFoot);
  app.insertBefore(rail, sidebar);
  $('.side-brand-row', sidebar)?.remove();

  // Use the real profile controls from the app inside a drawer like Telegram Desktop.
  const profile = $('#profile-open');
  const bottom = $('.sidebar-bottom', sidebar);
  const drawer = document.createElement('div');
  drawer.className = 'telegram-drawer-backdrop hidden';
  drawer.id = 'telegram-drawer-backdrop';
  drawer.innerHTML = '<aside class="telegram-drawer" aria-label="Главное меню"><div class="telegram-drawer-account"><div class="telegram-drawer-account-label">ALIENSTAGE TELEGRAM</div><div id="telegram-status">✦ Set Emoji Status</div></div><div class="telegram-drawer-items"><button type="button" id="telegram-profile-action">♙ <span>Мой профиль</span></button><button type="button" id="telegram-group-action">♧ <span>Новая группа</span></button><button type="button" id="telegram-contacts-action">♙ <span>Контакты</span></button><button type="button" id="telegram-saved-action">▣ <span>Избранное</span></button><button type="button" id="telegram-settings-action">⚙ <span>Настройки</span></button><div class="telegram-drawer-divider"></div><button type="button" id="telegram-theme-action">☾ <span>Ночная тема</span><i class="telegram-theme-switch"></i></button><button type="button" id="telegram-logout-action">↪ <span>Выйти</span></button></div></aside>';
  document.body.appendChild(drawer);
  if (profile && bottom) {
    const account = document.createElement('div');
    account.className = 'telegram-profile-slot';
    account.appendChild(profile);
    $('.profile-more', profile)?.remove();
    $('.sidebar-bottom', sidebar)?.remove();
    $('.telegram-drawer-account', drawer).appendChild(account);
  }

  const closeDrawer = () => drawer.classList.add('hidden');
  profile?.addEventListener('click', closeDrawer);
  $('#telegram-menu-open').addEventListener('click', () => drawer.classList.remove('hidden'));
  drawer.addEventListener('click', event => { if (event.target === drawer) closeDrawer(); });
  $('#telegram-profile-action').addEventListener('click', () => { closeDrawer(); $('#profile-open')?.click(); });
  $('#telegram-group-action').addEventListener('click', () => { closeDrawer(); $('#create-group-open')?.click(); });
  $('#telegram-contacts-action').addEventListener('click', () => { closeDrawer(); $('#nav-people')?.click(); });
  $('#telegram-saved-action').addEventListener('click', () => { closeDrawer(); showToast('Избранное появится в следующей версии.'); });
  $('#telegram-settings-action').addEventListener('click', () => { closeDrawer(); $('#profile-open')?.click(); });
  $('#telegram-theme-action').addEventListener('click', () => {
    const light = app.classList.toggle('telegram-light-theme');
    $('#telegram-theme-action span').textContent = light ? 'Дневная тема' : 'Ночная тема';
  });
  $('#telegram-logout-action').addEventListener('click', () => { closeDrawer(); $('#logout-btn')?.click(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });

  function showToast(message) {
    const target = $('#toast');
    if (!target) return;
    target.textContent = message;
    target.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => target.classList.remove('show'), 2400);
  }

  // Telegram-like emoji picker. Emoji are inserted into the real message composer.
  const composer = $('.composer', app);
  if (composer && !$('#telegram-emoji-button')) {
    const emojiButton = document.createElement('button');
    emojiButton.type = 'button';
    emojiButton.id = 'telegram-emoji-button';
    emojiButton.className = 'telegram-composer-emoji';
    emojiButton.title = 'Эмодзи';
    emojiButton.setAttribute('aria-label', 'Открыть эмодзи');
    emojiButton.textContent = '☺';
    composer.insertBefore(emojiButton, $('#message-input'));
    const picker = document.createElement('section');
    picker.id = 'telegram-emoji-picker';
    picker.className = 'telegram-emoji-picker hidden';
    picker.innerHTML = '<header><div class="telegram-emoji-tabs"><button type="button" class="active" data-kind="emoji">Эмодзи</button><button type="button" data-kind="stickers">Стикеры</button><button type="button" data-kind="gif">GIF</button></div><button type="button" id="telegram-emoji-close" aria-label="Закрыть">×</button></header><input id="telegram-emoji-search" type="search" placeholder="Поиск эмодзи"><div id="telegram-emoji-grid" class="telegram-emoji-grid"></div><div id="telegram-emoji-empty" class="hidden"></div>';
    document.body.appendChild(picker);
    const emoji = '😀 😃 😄 😁 😆 🥹 😂 🤣 😊 😇 🙂 🙃 😉 😍 🥰 😘 😗 😙 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🫡 😐 😶 🙄 😏 😣 😥 😮 🤐 😯 😪 😫 🥱 😴 😌 🤤 😷 🤒 🤕 ❤️ 🩷 🧡 💛 💚 🩵 💙 💜 🖤 🤍 💔 💕 💞 💗 👍 👎 👏 🙌 🫶 🤝 🙏 🔥 ✨ ⭐ 🌙 🦢 🎀 🌸 💌 💫 🫧'.split(' ');
    const grid = $('#telegram-emoji-grid');
    emoji.forEach(symbol => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = symbol;
      button.setAttribute('aria-label', symbol);
      grid.appendChild(button);
    });
    const input = $('#message-input');
    const insert = symbol => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + symbol + input.value.slice(end);
      input.setSelectionRange(start + symbol.length, start + symbol.length);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    };
    const toggle = () => {
      picker.classList.toggle('hidden');
      if (!picker.classList.contains('hidden')) $('#telegram-emoji-search').focus();
    };
    emojiButton.addEventListener('click', toggle);
    $('#telegram-emoji-close').addEventListener('click', () => picker.classList.add('hidden'));
    grid.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button) insert(button.textContent);
    });
    $('#telegram-emoji-search').addEventListener('input', event => {
      const query = event.target.value.trim();
      $$('button', grid).forEach(button => button.classList.toggle('hidden', !!query && !button.textContent.includes(query)));
    });
    $$('[data-kind]', picker).forEach(button => button.addEventListener('click', () => {
      $$('[data-kind]', picker).forEach(tab => tab.classList.toggle('active', tab === button));
      const isEmoji = button.dataset.kind === 'emoji';
      grid.classList.toggle('hidden', !isEmoji);
      $('#telegram-emoji-empty').classList.toggle('hidden', isEmoji);
      $('#telegram-emoji-empty').textContent = isEmoji ? '' : (button.dataset.kind === 'stickers' ? 'Стикеры пока не подключены.' : 'GIF пока не подключены.');
    }));
    document.addEventListener('click', event => {
      if (!picker.contains(event.target) && !emojiButton.contains(event.target)) picker.classList.add('hidden');
    });
  }
})();