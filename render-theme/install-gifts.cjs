const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'AlienStageTelegram');
const serverPath = path.join(root, 'server.js');
const indexPath = path.join(root, 'public', 'index.html');
const appJsPath = path.join(root, 'public', 'app.js');
fs.copyFileSync(path.join(__dirname, 'gifts.js'), path.join(root, 'public', 'gifts.js'));

let serverSource = fs.readFileSync(serverPath, 'utf8');
if (!serverSource.includes("const nodemailer = require('nodemailer');")) {
  serverSource = serverSource.replace("require('dotenv').config();", "require('dotenv').config();\nconst nodemailer = require('nodemailer');");
}
if (!serverSource.includes('CREATE TABLE IF NOT EXISTS gift_verifications')) {
  const schemaSql = [
    "CREATE TABLE IF NOT EXISTS gift_verifications (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,gift_id TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE IF NOT EXISTS user_gifts (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,gift_id TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE INDEX IF NOT EXISTS idx_user_gifts_recipient ON user_gifts(recipient_id,created_at)"
  ].join('; ') + ';';
  const migrations = [
    "const userGiftColumns = db.prepare('PRAGMA table_info(user_gifts)').all().map(column => column.name);",
    "const userGiftMigrations = { serial_number: 'INTEGER NOT NULL DEFAULT 1', model_name: \"TEXT NOT NULL DEFAULT ''\", backdrop_name: \"TEXT NOT NULL DEFAULT 'Классический'\", backdrop_hex: \"TEXT NOT NULL DEFAULT '#5288c1'\", symbol: \"TEXT NOT NULL DEFAULT '✦'\", rarity: \"TEXT NOT NULL DEFAULT 'Обычный'\" };",
    "for (const [column, definition] of Object.entries(userGiftMigrations)) { if (!userGiftColumns.includes(column)) db.exec('ALTER TABLE user_gifts ADD COLUMN ' + column + ' ' + definition); }",
    "const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);",
    "if (!userColumns.includes('profile_gift_id')) db.exec('ALTER TABLE users ADD COLUMN profile_gift_id TEXT');",
    "if (!userColumns.includes('profile_gift_item_id')) db.exec('ALTER TABLE users ADD COLUMN profile_gift_item_id TEXT');"
  ].join('\n');
  const injection = 'db.exec(' + JSON.stringify(schemaSql) + ');\n' + migrations + '\n';
  const appMarker = 'const app = express();';
  if (!serverSource.includes(appMarker)) throw new Error('Express app marker not found in server.js');
  serverSource = serverSource.replace(appMarker, injection + appMarker);
}
const publicUserStart = 'function publicUser(user) {';
const publicUserEnd = '\n}\nfunction auth(';
const start = serverSource.indexOf(publicUserStart);
const end = serverSource.indexOf(publicUserEnd, start);
if (start < 0 || end < 0) throw new Error('publicUser() block not found in server.js');
const publicUserFunction = [
  'function publicUser(user) {',
  '  const result = { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_path || null, created_at: user.created_at, profile_gift_id: user.profile_gift_id || null, profile_gift_item_id: user.profile_gift_item_id || null };',
  '  if (result.profile_gift_item_id) {',
  "    const selected = db.prepare('SELECT * FROM user_gifts WHERE id=? AND recipient_id=?').get(result.profile_gift_item_id, user.id);",
  '    if (selected) {',
  '      const gift = giftCatalog.find(item => item.id === selected.gift_id);',
  '      result.profile_gift = { ...selected, gift: gift ? { id: gift.id, name: gift.name, emoji: gift.emoji } : null };',
  '      result.profile_gift_emoji = gift ? gift.emoji : null;',
  '    }',
  '  }',
  '  return result;',
  '}'
].join('\n');
serverSource = serverSource.slice(0, start) + publicUserFunction + serverSource.slice(end + 2);

const searchSelect = 'SELECT id, username, display_name, avatar_path, created_at FROM users';
const searchSelectWithGift = 'SELECT id, username, display_name, avatar_path, created_at, profile_gift_id, profile_gift_item_id FROM users';
if (serverSource.includes(searchSelect)) serverSource = serverSource.replace(searchSelect, searchSelectWithGift);
if (!serverSource.includes("app.post('/api/gifts/send-code'")) {
  const routes = fs.readFileSync(path.join(__dirname, 'gift-routes.js'), 'utf8');
  const healthMarker = "app.get('/api/health',";
  if (!serverSource.includes(healthMarker)) throw new Error('Health route marker not found');
  serverSource = serverSource.replace(healthMarker, routes + '\n' + healthMarker);
}
fs.writeFileSync(serverPath, serverSource, 'utf8');

const packagePath = path.join(root, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.dependencies = packageJson.dependencies || {};
packageJson.dependencies.nodemailer = packageJson.dependencies.nodemailer || '^7.0.3';
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('/gifts.js')) {
  html = html.replace('</body>', '<script src="/gifts.js" defer></script>\n</body>');
  fs.writeFileSync(indexPath, html, 'utf8');
}
let appJs = fs.readFileSync(appJsPath, 'utf8');
if (!appJs.includes('person.profile_gift_emoji')) {
  const dollar = String.fromCharCode(36);
  const before = '<div class="person-result-name">' + dollar + '{esc(person.display_name)}</div>';
  const after = '<div class="person-result-name">' + dollar + '{esc(person.display_name)} ' + dollar + '{person.profile_gift_emoji ? \'<span class="person-featured-gift">\' + esc(person.profile_gift_emoji) + \'</span>\' : ""}</div>';
  if (appJs.includes(before)) appJs = appJs.replace(before, () => after);
  fs.writeFileSync(appJsPath, appJs, 'utf8');
}
console.log('Telegram-style collectible gifts installed.');
