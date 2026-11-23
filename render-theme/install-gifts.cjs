const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..','AlienStageTelegram');
const serverPath=path.join(root,'server.js'),indexPath=path.join(root,'public','index.html');
fs.copyFileSync(path.join(__dirname,'gifts.js'),path.join(root,'public','gifts.js'));
let s=fs.readFileSync(serverPath,'utf8');
if(!s.includes("const nodemailer = require('nodemailer');"))s=s.replace("require('dotenv').config();","require('dotenv').config();\nconst nodemailer = require('nodemailer');");
if(!s.includes('CREATE TABLE IF NOT EXISTS gift_verifications')){
 const schema="db.exec(\"CREATE TABLE IF NOT EXISTS gift_verifications (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,gift_id TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS user_gifts (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,gift_id TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))); CREATE INDEX IF NOT EXISTS idx_user_gifts_recipient ON user_gifts(recipient_id,created_at);\");";
 const migration="const userColumns=db.prepare('PRAGMA table_info(users)').all(); if(!userColumns.some(column=>column.name==='profile_gift_id'))db.exec('ALTER TABLE users ADD COLUMN profile_gift_id TEXT');";
 s=s.replace('const app = express();',schema+'\n'+migration+'\nconst app = express();');
}
const publicUserOld="return { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_path || null, created_at: user.created_at };";
const publicUserNew="return { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_path || null, created_at: user.created_at, profile_gift_id: user.profile_gift_id || null, profile_gift_emoji: (user.profile_gift_id && typeof giftCatalog !== 'undefined' ? giftCatalog.find(g => g.id === user.profile_gift_id)?.emoji : null) || null };";
if(s.includes(publicUserOld))s=s.replace(publicUserOld,publicUserNew);
const searchSelect='SELECT id, username, display_name, avatar_path, created_at FROM users';
const searchSelectWithGift='SELECT id, username, display_name, avatar_path, created_at, profile_gift_id FROM users';
if(s.includes(searchSelect))s=s.replace(searchSelect,searchSelectWithGift);
if(!s.includes("app.post('/api/gifts/send-code'")){
 const routes=fs.readFileSync(path.join(__dirname,'gift-routes.js'),'utf8');
 s=s.replace("app.get('/api/health',",routes+"\napp.get('/api/health',");
}
fs.writeFileSync(serverPath,s);
const pkgPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.dependencies=pkg.dependencies||{};pkg.dependencies.nodemailer='^7.0.3';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
let html=fs.readFileSync(indexPath,'utf8');
if(!html.includes('/gifts.js')){html=html.replace('</body>','<script src="/gifts.js" defer></script>\n</body>');fs.writeFileSync(indexPath,html);}
const appJsPath=path.join(root,'public','app.js');
let appJs=fs.readFileSync(appJsPath,'utf8');
if(!appJs.includes('person.profile_gift_emoji')){
 const before='<div class="person-result-name">\${esc(person.display_name)}</div>';
 const after='<div class="person-result-name">\${esc(person.display_name)} \${person.profile_gift_emoji ? \'<span class="person-featured-gift">\' + esc(person.profile_gift_emoji) + \'</span>\' : ""}</div>';
 if(appJs.includes(before))appJs=appJs.replace(before,after);
 fs.writeFileSync(appJsPath,appJs);
}
console.log('Gift feature installed.');
