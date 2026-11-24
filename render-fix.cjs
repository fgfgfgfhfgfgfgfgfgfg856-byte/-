'use strict';
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(process.cwd(), 'AlienStageTelegram');
const serverPath = path.join(dir, 'server.js');
const htmlPath = path.join(dir, 'public', 'index.html');
if (!fs.existsSync(serverPath) || !fs.existsSync(htmlPath)) throw new Error('Не найдены server.js или public/index.html.');
let server = fs.readFileSync(serverPath, 'utf8');
let html = fs.readFileSync(htmlPath, 'utf8');

server = server.replace(
  "const required = ['DATABASE_URL', 'JWT_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM'];",
  "const required = ['DATABASE_URL', 'JWT_SECRET'];"
);
if (!server.includes('ADD COLUMN IF NOT EXISTS password_hash')) {
  server = server.replace(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;\n    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;'
  );
}
if (!server.includes('function hashPassword(password)')) {
  const helpers = [
    'function hashPassword(password) {',
    "  const salt = crypto.randomBytes(16).toString('hex');",
    "  const hash = crypto.scryptSync(password, salt, 64).toString('hex');",
    "  return 'scrypt$' + salt + '$' + hash;",
    '}',
    'function verifyPassword(password, stored) {',
    "  if (typeof stored !== 'string') return false;",
    "  const [scheme, salt, hash] = stored.split('$');",
    "  if (scheme !== 'scrypt' || !salt || !hash) return false;",
    "  const actual = crypto.scryptSync(password, salt, 64);",
    "  const expected = Buffer.from(hash, 'hex');",
    '  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);',
    '}'
  ].join('\n');
  const anchor = "function validUsername(value) {\n  return /^[a-z0-9_]{3,20}$/.test(value);\n}";
  if (!server.includes(anchor)) throw new Error('Не найден валидатор никнейма.');
  server = server.replace(anchor, () => anchor + '\n' + helpers);
}
server = server.replace(/function hasUnlimitedTokens\(user\) \{[\s\S]*?\n\}/, 'function hasUnlimitedTokens(_user) { return false; }');

if (!server.includes("app.post('/api/auth/register'")) {
  const anchor = "app.get('/health', (_req, res) => res.json({ ok: true, service: 'AlienStageTelegram' }));";
  const routes = [
    '',
    "app.post('/api/auth/register', authLimiter, async (req, res, next) => {",
    '  try {',
    '    const username = cleanUsername(req.body.username);',
    "    const displayName = String(req.body.displayName || '').trim().slice(0, 40);",
    "    const password = String(req.body.password || '');",
    "    if (!validUsername(username)) return res.status(400).json({ error: 'Ник: 3–20 символов, только a–z, цифры и _.' });",
    "    if (!displayName) return res.status(400).json({ error: 'Напиши имя профиля.' });",
    "    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Пароль должен содержать от 8 до 128 символов.' });",
    '    const user = { id: crypto.randomUUID(), username, displayName };',
    '    try {',
    "      await pool.query('INSERT INTO users (id, phone_hash, username, display_name, email, email_verified, password_hash, token_balance) VALUES ($1, NULL, $2, $3, NULL, FALSE, $4, $5)', [user.id, username, displayName, hashPassword(password), Math.max(0, Number(process.env.STARTER_TOKENS || 100))]);",
    '    } catch (error) {',
    "      if (error.code === '23505') return res.status(409).json({ error: 'Этот ник уже занят. Придумай другой.' });",
    '      throw error;',
    '    }',
    '    setSession(res, user);',
    '    res.status(201).json({ ok: true, user: { id: user.id, username, displayName } });',
    '  } catch (error) { next(error); }',
    '});',
    '',
    "app.post('/api/auth/login', authLimiter, async (req, res, next) => {",
    '  try {',
    '    const username = cleanUsername(req.body.username);',
    "    const password = String(req.body.password || '');",
    "    if (!validUsername(username) || !password) return res.status(400).json({ error: 'Введи ник и пароль.' });",
    "    const result = await pool.query('SELECT id, username, display_name, password_hash FROM users WHERE username = $1', [username]);",
    "    if (!result.rowCount) return res.status(401).json({ error: 'Неправильный ник или пароль.' });",
    "    if (!result.rows[0].password_hash) return res.status(409).json({ error: 'Этот аккаунт создан в старой версии. Для нового входа создай новый ник и пароль.' });",
    "    if (!verifyPassword(password, result.rows[0].password_hash)) return res.status(401).json({ error: 'Неправильный ник или пароль.' });",
    '    const user = result.rows[0];',
    '    setSession(res, user);',
    '    res.json({ ok: true, user: { id: user.id, username: user.username, displayName: user.display_name } });',
    '  } catch (error) { next(error); }',
    '});'
  ].join('\n');
  if (!server.includes(anchor)) throw new Error('Не найден маршрут /health.');
  server = server.replace(anchor, () => anchor + routes);
}

server = server.replace(
  /    const account = await client\.query\('SELECT email, email_verified, token_balance FROM users WHERE id = \$1 FOR UPDATE', \[req\.user\.id\]\);\n    if \(!account\.rowCount \|\| !account\.rows\[0\]\.email_verified \|\| !account\.rows\[0\]\.email\) \{[\s\S]*?\n    \}\n    const unlimited = hasUnlimitedTokens\(account\.rows\[0\]\);/,
  "    const account = await client.query('SELECT token_balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);\n    if (!account.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Аккаунт не найден.' }); }\n    const unlimited = false;"
);
server = server.split(/\r?\n/).filter((line) => !line.trim().startsWith("app.get('*',")).join('\n');
if (!server.includes("app.get('/health'")) {
  server = server.replace("app.use(express.json({ limit: '1mb' }));", "app.use(express.json({ limit: '1mb' }));\napp.get('/health', (_req, res) => res.json({ ok: true, service: 'AlienStageTelegram' }));");
}

const formStart = html.indexOf('      <form id="auth-form"');
const formEnd = html.indexOf('      </form>', formStart);
if (formStart < 0 || formEnd < 0) throw new Error('Не найдена форма авторизации.');
const form = [
  '      <form id="auth-form" autocomplete="on">',
  '        <div class="form-field" id="auth-name-field">',
  '          <label for="auth-name">Как тебя называть</label>',
  '          <input id="auth-name" name="display_name" maxlength="40" placeholder="Твоё имя" autocomplete="nickname">',
  '        </div>',
  '        <div class="form-field">',
  '          <label for="auth-username">Никнейм</label>',
  '          <div class="input-prefix"><span>@</span><input id="auth-username" name="username" minlength="3" maxlength="20" required placeholder="your_nickname" autocomplete="username"></div>',
  '          <small>3–20 символов: a–z, цифры и _</small>',
  '        </div>',
  '        <div class="form-field">',
  '          <label for="auth-password">Пароль</label>',
  '          <input id="auth-password" name="password" type="password" minlength="8" maxlength="128" required placeholder="Не менее 8 символов" autocomplete="current-password">',
  '        </div>',
  '        <p id="auth-error" class="form-error" role="alert"></p>',
  '        <button id="auth-submit" class="btn btn-primary auth-submit" type="submit">Войти <span>↗</span></button>',
  '      </form>'
].join('\n');
html = html.slice(0, formStart) + form + html.slice(formEnd + '      </form>'.length);
html = html.replace('#auth-code,#email-gate-code{letter-spacing:5px;font-weight:800;text-align:center;font-size:18px}', '');
html = html.replace(/@media\(max-width:560px\)\{#email-gate-modal \.modal-card\{[^}]*\}\}/, '');
html = html.replace(/<p class="auth-privacy">[\s\S]*?<\/p>/, '<p class="auth-privacy">Почта и номер телефона не нужны. Создай аккаунт сразу по нику и паролю. Сохрани пароль: восстановление через почту не используется.</p>');
const gateStart = html.indexOf('  <div id="email-gate-modal"');
if (gateStart >= 0) {
  const toastStart = html.indexOf('  <div id="toast"', gateStart);
  if (toastStart < 0) throw new Error('Не найден конец окна подтверждения почты.');
  html = html.slice(0, gateStart) + html.slice(toastStart);
}

html = html.replace("  let authStep = 'email';\n  let enrollmentToken = null;", "  let authMode = 'login';");
html = html.replace(
  /  const setAuthStep = \(step\) => \{[\s\S]*?\n  \};\n  const refreshMe = async \(\) =>/,
  [
    '  const setAuthMode = (mode) => {',
    "    authMode = mode === 'register' ? 'register' : 'login';",
    "    $('#login-tab').classList.toggle('active', authMode === 'login');",
    "    $('#register-tab').classList.toggle('active', authMode === 'register');",
    "    $('#auth-name-field').classList.toggle('hidden', authMode !== 'register');",
    "    $('#auth-password').autocomplete = authMode === 'register' ? 'new-password' : 'current-password';",
    "    $('#auth-submit').innerHTML = authMode === 'register' ? 'Создать аккаунт <span>↗</span>' : 'Войти <span>↗</span>';",
    "    $('#auth-error').textContent = '';",
    '  };',
    '  const refreshMe = async () =>'
  ].join('\n')
);
html = html.replace(
  "      if (!currentUser?.emailVerified) { action.textContent = 'Подтвердить почту'; action.dataset.giftAction = 'verify-email'; }\n      else { action.textContent = 'Купить подарок'; action.dataset.giftAction = 'buy'; action.dataset.giftId = gift.id; }",
  "      action.textContent = 'Купить подарок'; action.dataset.giftAction = 'buy'; action.dataset.giftId = gift.id;"
);
const giftStatusStart = html.indexOf('    if (!currentUser.emailVerified) {');
if (giftStatusStart >= 0) {
  const renderProfileMarker = html.indexOf('\n    renderProfile();', giftStatusStart);
  if (renderProfileMarker < 0) throw new Error('Не найден конец блока статуса подарков.');
  const statusCode = "    const balance = String(Number(currentUser.tokenBalance || 0)) + ' токенов';\n    status.textContent = 'Аккаунт готов. Баланс: ' + balance + '.';";
  html = html.slice(0, giftStatusStart) + statusCode + html.slice(renderProfileMarker);
}
html = html.replace(
  'Подарки хранятся на сервере. Для покупки нужна подтверждённая почта и токены; бесконечные токены доступны только специальному подтверждённому аккаунту.',
  'Подарки хранятся на сервере. Для покупки нужны токены.'
);

const emailGateFunction = html.indexOf('  const openEmailGate = () => {');
if (emailGateFunction >= 0) {
  const authFormHandler = html.indexOf("  $('#auth-form').addEventListener('submit'", emailGateFunction);
  if (authFormHandler < 0) throw new Error('Не найден обработчик формы после старой email-функции.');
  html = html.slice(0, emailGateFunction) + html.slice(authFormHandler);
}
const authStart = html.indexOf("  $('#auth-form').addEventListener('submit'");
const giftTabMarker = "  $$('[data-gift-tab]').forEach";
const giftTabStart = html.indexOf(giftTabMarker, authStart);
if (authStart < 0 || giftTabStart < 0) throw new Error('Не найдены обработчики входа.');
const handlers = [
  "  $('#auth-form').addEventListener('submit', async (event) => {",
  '    event.preventDefault();',
  "    const submit = $('#auth-submit'); submit.disabled = true;",
  "    $('#auth-error').textContent = '';",
  '    try {',
  "      const username = $('#auth-username').value.trim();",
  "      const password = $('#auth-password').value;",
  "      if (authMode === 'register') {",
  "        const displayName = $('#auth-name').value.trim();",
  "        await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, displayName, password }) });",
  "        await enterApp(); toast('Аккаунт создан! Добро пожаловать ✨');",
  '      } else {',
  "        await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });",
  "        await enterApp(); toast('Ты вошёл в свой аккаунт!');",
  '      }',
  "    } catch (error) { $('#auth-error').textContent = error.message; }",
  '    finally { submit.disabled = false; }',
  '  });',
  "  $('#login-tab').addEventListener('click', () => setAuthMode('login'));",
  "  $('#register-tab').addEventListener('click', () => setAuthMode('register'));"
].join('\n');
html = html.slice(0, authStart) + handlers + '\n' + html.slice(giftTabStart);
html = html.replace(
  "currentUser = null; $('#app-menu-backdrop').classList.add('hidden'); showAuth(); setAuthStep('email'); toast('Ты вышел из аккаунта.');",
  "currentUser = null; $('#app-menu-backdrop').classList.add('hidden'); showAuth(); setAuthMode('login'); toast('Ты вышел из аккаунта.');"
);
html = html.replace(
  "if (button.dataset.giftAction === 'verify-email') return openEmailGate();\n    if (button.dataset.giftAction !== 'buy') return;",
  "if (button.dataset.giftAction !== 'buy') return;"
);
html = html.replace(
  "} catch (error) { if (error.requiresEmail) openEmailGate(); else toast(error.message); }",
  "} catch (error) { toast(error.message); }"
);
html = html.replace(
  "  (async () => {\n    try { await enterApp(); }",
  "  setAuthMode('login');\n  (async () => {\n    try { await enterApp(); }"
);

if (server.includes("app.get('*'")) throw new Error('Express 5 wildcard route не был удалён.');
if (!server.includes("app.post('/api/auth/register'")) throw new Error('Не добавлен маршрут регистрации.');
if (!server.includes("app.post('/api/auth/login'")) throw new Error('Не добавлен маршрут входа.');
if (!server.includes("const required = ['DATABASE_URL', 'JWT_SECRET'];")) throw new Error('Сервер всё ещё требует переменные почты.');
if (html.includes('id="auth-email"') || html.includes('id="email-gate-modal"') || html.includes("/api/auth/request-code")) throw new Error('В интерфейсе осталась регистрация по почте.');

fs.writeFileSync(serverPath, server, 'utf8');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('OK: регистрация без email, вход по нику и паролю, подарки без email, Express 5 и /health исправлены.');


// --- Instant account: auto-create on first visit, then ask only for a nickname. ---
let instantServer = fs.readFileSync(serverPath, 'utf8');
let instantHtml = fs.readFileSync(htmlPath, 'utf8');

if (!instantServer.includes('ADD COLUMN IF NOT EXISTS needs_username_change')) {
  instantServer = instantServer.replace(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;\n    ALTER TABLE users ADD COLUMN IF NOT EXISTS needs_username_change BOOLEAN NOT NULL DEFAULT FALSE;'
  );
}
if (!instantServer.includes('needs_username_change FROM users WHERE id = $1')) {
  instantServer = instantServer.replace(
    /SELECT id, phone_hash, username, display_name, email, email_verified, token_balance, featured_gift_uid, avatar_data, created_at(?:, last_seen_at)? FROM users WHERE id = \$1/,
    (match) => match.replace(' FROM users', ', needs_username_change FROM users')
  );
}
if (!instantServer.includes("app.post('/api/auth/guest'")) {
  const health = "app.get('/health', (_req, res) => res.json({ ok: true, service: 'AlienStageTelegram' }));";
  if (!instantServer.includes(health)) throw new Error('Instant account: /health route was not found.');
  const guest = [
    '',
    "app.post('/api/auth/guest', authLimiter, async (_req, res, next) => {",
    '  try {',
    "    let username = '';",
    '    for (let i = 0; i < 5; i += 1) {',
    "      username = 'guest_' + crypto.randomBytes(5).toString('hex');",
    "      const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);",
    "      if (!exists.rowCount) break;",
    "      username = '';",
    '    }',
    "    if (!username) throw new Error('Не удалось создать временный ник. Попробуй ещё раз.');",
    '    const id = crypto.randomUUID();',
    "    const displayName = 'Новый пользователь';",
    "    await pool.query('INSERT INTO users (id, phone_hash, username, display_name, email, email_verified, password_hash, needs_username_change, token_balance) VALUES ($1, NULL, $2, $3, NULL, FALSE, NULL, TRUE, $4)', [id, username, displayName, Math.max(0, Number(process.env.STARTER_TOKENS || 100))]);",
    '    setSession(res, { id, username, displayName });',
    '    res.status(201).json({ ok: true, needsUsernameChange: true });',
    '  } catch (error) { next(error); }',
    '});'
  ].join('\n');
  instantServer = instantServer.replace(health, health + '\n' + guest);
}
if (!instantServer.includes('needsUsernameChange: req.user.needs_username_change')) {
  instantServer = instantServer.replace(
    'displayName: req.user.display_name, email:',
    'displayName: req.user.display_name, needsUsernameChange: req.user.needs_username_change, email:'
  );
}
if (!instantServer.includes("app.patch('/api/me/username'")) {
  const anchor = "app.patch('/api/me', requireAuth, async (req, res, next) => {";
  if (!instantServer.includes(anchor)) throw new Error('Instant account: PATCH /api/me route was not found.');
  const renameRoute = [
    "app.patch('/api/me/username', requireAuth, async (req, res, next) => {",
    '  try {',
    '    const username = cleanUsername(req.body.username);',
    "    if (!validUsername(username)) return res.status(400).json({ error: 'Ник должен быть 3–20 символов: латинские буквы, цифры и _.' });",
    '    try {',
    "      await pool.query('UPDATE users SET username = $1, display_name = $1, needs_username_change = FALSE WHERE id = $2', [username, req.user.id]);",
    '    } catch (error) {',
    "      if (error.code === '23505') return res.status(409).json({ error: 'Этот ник уже занят. Попробуй другой.' });",
    '      throw error;',
    '    }',
    '    res.json({ ok: true, username, displayName: username });',
    '  } catch (error) { next(error); }',
    '});',
    ''
  ].join('\n');
  instantServer = instantServer.replace(anchor, renameRoute + anchor);
}

// Replace the login/register screen with an automatic account setup message.
const authStart = instantHtml.indexOf('  <div id="auth-screen" class="auth-screen">');
const appStart = instantHtml.indexOf('\n\n  <div id="app"', authStart);
if (authStart < 0 || appStart < 0) throw new Error('Instant account: auth screen markup not found.');
const authScreen = [
  '  <div id="auth-screen" class="auth-screen">',
  '    <div class="auth-orbit orbit-one"></div><div class="auth-orbit orbit-two"></div>',
  '    <section class="auth-card">',
  '      <div class="brand-mark brand-large"><span>✦</span></div>',
  '      <div class="brand-name">ALIEN<span>STAGE</span>TELEGRAM</div>',
  '      <p class="auth-subtitle">Твоя связь с другой орбитой</p>',
  '      <p style="text-align:center;color:var(--muted);font-size:13px;line-height:1.7">Создаём твой аккаунт…<br><strong style="color:var(--pink)">Останется только выбрать никнейм ✨</strong></p>',
  '      <p id="auth-error" class="form-error" role="alert" style="text-align:center;margin-top:14px"></p>',
  '    </section>',
  '    <div class="auth-footer">ALIENSTAGE TELEGRAM <span>•</span> SPACE FOR YOUR WORDS</div>',
  '  </div>'
].join('\n');
instantHtml = instantHtml.slice(0, authStart) + authScreen + instantHtml.slice(appStart);

// Insert the only required first-run form: choose a nickname.
if (!instantHtml.includes('id="nickname-setup-modal"')) {
  const giftModal = '  <div id="gift-modal" class="modal-backdrop hidden"';
  if (!instantHtml.includes(giftModal)) throw new Error('Instant account: gift modal anchor was not found.');
  const modal = [
    '  <div id="nickname-setup-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="nickname-setup-title">',
    '    <section class="modal-card" style="width:min(420px,100%)">',
    '      <div class="brand-mark" style="margin-bottom:14px"><span>✦</span></div>',
    '      <span class="eyebrow">ТВОЯ НОВАЯ ОРБИТА</span>',
    '      <h2 id="nickname-setup-title">Аккаунт уже создан! 💗</h2>',
    '      <p style="color:var(--muted);font-size:12px;line-height:1.6;margin:-5px 0 18px">Придумай никнейм, по которому друзья смогут найти тебя. Почта, телефон и пароль не нужны.</p>',
    '      <form id="nickname-setup-form">',
    '        <div class="form-field">',
    '          <label for="nickname-setup-input">Твой никнейм</label>',
    '          <div class="input-prefix"><span>@</span><input id="nickname-setup-input" minlength="3" maxlength="20" required placeholder="your_nickname" autocomplete="off" autocapitalize="none" spellcheck="false"></div>',
    '          <small>3–20 символов: латинские буквы, цифры и _</small>',
    '        </div>',
    '        <p id="nickname-setup-error" class="form-error" role="alert"></p>',
    '        <button id="nickname-setup-submit" class="btn btn-primary auth-submit" type="submit">Сохранить никнейм <span>↗</span></button>',
    '      </form>',
    '      <p style="color:var(--soft);font-size:10px;line-height:1.5;margin:14px 0 0">Аккаунт привязан к этому браузеру. Не очищай данные сайта и не используй режим инкогнито, иначе доступ можно потерять.</p>',
    '    </section>',
    '  </div>',
    ''
  ].join('\n');
  instantHtml = instantHtml.replace(giftModal, modal + giftModal);
}
if (!instantHtml.includes('#nickname-setup-modal .modal-card')) {
  instantHtml = instantHtml.replace(
    '</style>',
    '#nickname-setup-modal .modal-card{border-color:#8d6db0;box-shadow:0 25px 90px #07040dcc,0 0 45px #c37bd52a}\n#nickname-setup-modal .brand-mark{background:linear-gradient(145deg,#ef85c7,#9478ff 62%,#6bd8e3);color:#171222}\n#nickname-setup-input{text-transform:none}\n</style>'
  );
}
if (!instantHtml.includes("$('#nickname-setup-modal').addEventListener('click'")) {
  const showAuth = "  const showAuth = () => { $('#auth-screen').classList.remove('hidden'); $('#app').classList.add('hidden'); };";
  instantHtml = instantHtml.replace(
    showAuth,
    "$('#nickname-setup-modal').addEventListener('click', (event) => { if (event.target === event.currentTarget) { event.preventDefault(); event.stopImmediatePropagation(); } });\n" + showAuth
  );
}
if (!instantHtml.includes('const openNicknameSetup = () =>')) {
  const refresh = '  const refreshMe = async () => {';
  const helper = [
    '  const openNicknameSetup = () => {',
    '    if (!currentUser?.needsUsernameChange) return;',
    "    $('#nickname-setup-input').value = '';",
    "    $('#nickname-setup-error').textContent = '';",
    "    $('#nickname-setup-modal').classList.remove('hidden');",
    "    window.setTimeout(() => $('#nickname-setup-input').focus(), 80);",
    '  };',
    ''
  ].join('\n');
  instantHtml = instantHtml.replace(refresh, helper + refresh);
}

// Remove old password form handlers and login/register controls.
const oldAuthHandler = instantHtml.indexOf("  $('#auth-form').addEventListener('submit'");
if (oldAuthHandler >= 0) {
  const giftTabs = instantHtml.indexOf("  $$('[data-gift-tab]').forEach", oldAuthHandler);
  if (giftTabs < 0) throw new Error('Instant account: could not locate the end of the old auth handler.');
  instantHtml = instantHtml.slice(0, oldAuthHandler) + instantHtml.slice(giftTabs);
}
instantHtml = instantHtml.replace("  let authMode = 'login';\n", '');
instantHtml = instantHtml.replace(/  const setAuthMode = \(mode\) => \{[\s\S]*?\n  \};\n/, '');
instantHtml = instantHtml.replace(/^\s*\$\('#(?:login|register)-tab'\)\.addEventListener\([^\n]*\);\s*$/gm, '');

// The nickname form saves the chosen public username and finishes onboarding.
if (!instantHtml.includes("$('#nickname-setup-form').addEventListener('submit'")) {
  const giftTabs = "  $$('[data-gift-tab]').forEach((button) => button.addEventListener('click', () => setGiftTab(button.dataset.giftTab)));";
  const handler = [
    "  $('#nickname-setup-form').addEventListener('submit', async (event) => {",
    '    event.preventDefault();',
    "    const button = $('#nickname-setup-submit');",
    "    const username = $('#nickname-setup-input').value.trim();",
    "    $('#nickname-setup-error').textContent = '';",
    '    button.disabled = true;',
    '    try {',
    "      await api('/api/me/username', { method: 'PATCH', body: JSON.stringify({ username }) });",
    '      await refreshMe();',
    "      $('#nickname-setup-modal').classList.add('hidden');",
    "      toast('Твой никнейм сохранён! Добро пожаловать 🪐');",
    '    } catch (error) {',
    "      $('#nickname-setup-error').textContent = error.message;",
    "      $('#nickname-setup-input').focus();",
    '    } finally { button.disabled = false; }',
    '  });',
    ''
  ].join('\n');
  instantHtml = instantHtml.replace(giftTabs, handler + giftTabs);
}

// Do not clear the only session cookie for a passwordless guest account.
instantHtml = instantHtml.replace(/  async function logout\(\) \{[\s\S]*?\n  \}/, [
  '  async function logout() {',
  "    toast('Аккаунт привязан к этому браузеру. Выход отключён, чтобы не потерять доступ.');",
  "    $('#app-menu-backdrop').classList.add('hidden');",
  '  }'
].join('\n'));
instantHtml = instantHtml.replace('↪ <span>Выйти</span>', '↪ <span>Информация об аккаунте</span>');
instantHtml = instantHtml.replace('id="logout-btn">Выйти</button>', 'id="logout-btn">Аккаунт привязан к браузеру</button>');

// Reuse the existing session, or create a guest automatically if this browser has none.
instantHtml = instantHtml.replace(/^\s*setAuthMode\('login'\);\s*$/gm, '');
const bootStart = instantHtml.lastIndexOf('  (async () => {');
const wrapperEnd = instantHtml.lastIndexOf('\n})();');
if (bootStart < 0 || wrapperEnd < bootStart) throw new Error('Instant account: initial app boot block was not found.');
const guestBoot = [
  '  (async () => {',
  '    try {',
  '      try { await enterApp(); }',
  '      catch (error) {',
  '        if (error.status !== 401) throw error;',
  "        await api('/api/auth/guest', { method: 'POST', body: '{}' });",
  '        await enterApp();',
  '      }',
  '      openNicknameSetup();',
  '    } catch (error) {',
  '      showAuth();',
  "      $('#auth-error').textContent = 'Не удалось создать аккаунт: ' + error.message;",
  '    }',
  '  })();'
].join('\n');
instantHtml = instantHtml.slice(0, bootStart) + guestBoot + instantHtml.slice(wrapperEnd);

const checks = {
  guestRoute: instantServer.includes("app.post('/api/auth/guest'"),
  renameRoute: instantServer.includes("app.patch('/api/me/username'"),
  schema: instantServer.includes('ADD COLUMN IF NOT EXISTS needs_username_change'),
  meFlag: instantServer.includes('needsUsernameChange: req.user.needs_username_change'),
  guestBoot: instantHtml.includes("api('/api/auth/guest'"),
  nicknameModal: instantHtml.includes('id="nickname-setup-modal"'),
  nicknameHandler: instantHtml.includes("$('#nickname-setup-form').addEventListener('submit'"),
  noPasswordForm: !instantHtml.includes('id="auth-password"') && !instantHtml.includes('id="auth-form"'),
  noEmailForm: !instantHtml.includes('id="auth-email"') && !instantHtml.includes('id="email-gate-modal"')
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error('Instant account checks failed: ' + failed.join(', '));

fs.writeFileSync(serverPath, instantServer, 'utf8');
fs.writeFileSync(htmlPath, instantHtml, 'utf8');
console.log('OK: аккаунт создаётся автоматически; пользователь выбирает только никнейм.');
