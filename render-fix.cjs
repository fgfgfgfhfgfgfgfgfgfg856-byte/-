'use strict';

const fs = require('node:fs');
const path = require('node:path');

const serverPath = path.join(process.cwd(), 'AlienStageTelegram', 'server.js');
if (!fs.existsSync(serverPath)) {
  throw new Error('Не найден файл сервера: ' + serverPath + '. Проверь архив и папку проекта.');
}

let source = fs.readFileSync(serverPath, 'utf8');
const before = source;

// Resend is needed to send codes, but it must not prevent the web server from starting.
source = source.replace(/const required = \[([^\]]*)\];/s, (match, body) => {
  const names = [...body.matchAll(/['"]([^'"]+)['"]/g)]
    .map((item) => item[1])
    .filter((name) => name !== 'RESEND_API_KEY');
  return "const required = [" + names.map((name) => "'" + name + "'").join(', ') + "];";
});

// Express 5 no longer accepts app.get('*', ...). express.static already serves index.html at '/'.
source = source.replace(
  /^\s*app\.get\(\s*['"]\*['"]\s*,\s*\(_req,\s*res\)\s*=>\s*res\.sendFile\(path\.join\(__dirname,\s*['"]public['"],\s*['"]index\.html['"]\)\)\s*\);?\s*$/m,
  ''
);

// Ensure Render can verify the running service.
if (!/app\.get\(\s*['"]\/health['"]/.test(source)) {
  const jsonMiddleware = /app\.use\(express\.json\([^\n]*\)\);/;
  if (!jsonMiddleware.test(source)) {
    throw new Error('Не удалось найти место для добавления маршрута /health в server.js.');
  }
  source = source.replace(jsonMiddleware, (line) => line + "\napp.get('/health', (_req, res) => res.json({ ok: true, service: 'AlienStageTelegram' }));");
}

if (source === before) {
  console.log('Патч уже применён или код использует другой шаблон; файл не менялся.');
} else {
  fs.writeFileSync(serverPath, source, 'utf8');
  console.log('Render fix применён: Express 5 route, /health и необязательный RESEND_API_KEY при запуске.');
}
