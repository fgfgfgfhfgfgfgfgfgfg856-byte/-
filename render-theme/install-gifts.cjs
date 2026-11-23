const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..','AlienStageTelegram');
const serverPath=path.join(root,'server.js'),indexPath=path.join(root,'public','index.html');
fs.copyFileSync(path.join(__dirname,'gifts.js'),path.join(root,'public','gifts.js'));
let s=fs.readFileSync(serverPath,'utf8');
if(!s.includes("const nodemailer = require('nodemailer');"))s=s.replace("require('dotenv').config();","require('dotenv').config();\nconst nodemailer = require('nodemailer');");
if(!s.includes('CREATE TABLE IF NOT EXISTS gift_verifications')){
 const schema="db.exec(\"CREATE TABLE IF NOT EXISTS gift_verifications (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,gift_id TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS user_gifts (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,gift_id TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))); CREATE INDEX IF NOT EXISTS idx_user_gifts_recipient ON user_gifts(recipient_id,created_at);\");";
 const migration="const userGiftColumns=db.prepare('PRAGMA table_info(user_gifts)').all().map(column=>column.name);
const userGiftMigrations={serial_number:'INTEGER NOT NULL DEFAULT 1',model_name:"TEXT NOT NULL DEFAULT ''",backdrop_name:"TEXT NOT NULL DEFAULT 'Классический'",backdrop_hex:"TEXT NOT NULL DEFAULT '#5288c1'",symbol:"TEXT NOT NULL DEFAULT '✦'",rarity:"TEXT NOT NULL DEFAULT 'Обычный'"};
for(const [column,definition] of Object.entries(userGiftMigrations)){if(!userGiftColumns.includes(column))db.exec('ALTER TABLE user_gifts ADD COLUMN '+column+' '+definition);}
const userColumns=db.prepare('PRAGMA table_info(users)').all().map(column=>column.name);
if(!userColumns.includes('profile_gift_id'))db.exec('ALTER TABLE users ADD COLUMN profile_gift_id TEXT');
if(!userColumns.includes('profile_gift_item_id'))db.exec('ALTER TABLE users ADD COLUMN profile_gift_item_id TEXT');
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
