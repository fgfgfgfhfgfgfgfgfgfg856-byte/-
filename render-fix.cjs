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
