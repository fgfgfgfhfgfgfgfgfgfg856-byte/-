const GIFT_VERIFY_EMAIL=process.env.GIFT_VERIFY_EMAIL||'fgfgfgfhfgfgfgfgfgfg856@gmail.com';
const giftCatalog=[
 {id:'rose',name:'Роза',emoji:'🌹',models:['Алый бутон','Золотая роза','Лунный цветок','Кристальная роза']},
 {id:'heart',name:'Сердечко',emoji:'💗',models:['Первое чувство','Неоновое сердце','Сердце галактики','Розовый кристалл']},
 {id:'swan',name:'Лебедь',emoji:'🦢',models:['Белый лебедь','Лебедь из жемчуга','Лунный лебедь','Звёздное перо']},
 {id:'star',name:'Звезда',emoji:'⭐',models:['Падающая звезда','Золотая звезда','Космическая звезда','Полярный свет']},
 {id:'crown',name:'Корона',emoji:'👑',models:['Королевский сапфир','Золотая корона','Ледяной трон','Корона созвездий']},
 {id:'teddy',name:'Мишка',emoji:'🧸',models:['Плюшевый мишка','Медовый мишка','Мишка-соня','Мишка галактика']},
 {id:'bouquet',name:'Букет',emoji:'💐',models:['Весенний букет','Сад мечты','Букет фей','Цветы полуночи']},
 {id:'sparkles',name:'Волшебство',emoji:'✨',models:['Звёздная пыль','Лунная магия','Космический свет','Золотое сияние']}
];
const giftBackdrops=[
 {name:'Розовый шёлк',hex:'#d783ac'},{name:'Лавандовый туман',hex:'#937cce'},
 {name:'Ледяной голубой',hex:'#65a9d1'},{name:'Изумрудный',hex:'#469b88'},
 {name:'Золотой',hex:'#b78a43'},{name:'Полночь',hex:'#344a76'},
 {name:'Персиковый',hex:'#d58d70'},{name:'Северное сияние',hex:'#426c83'}
];
const giftSymbols=['✦','❀','♡','☾','✧','♛','✺','❄'];
const giftRarities=[
 {name:'Обычный',chance:70,percent:'70%'},{name:'Редкий',chance:22,percent:'22%'},
 {name:'Эпический',chance:7,percent:'7%'},{name:'Легендарный',chance:1,percent:'1%'}
];
const giftLimiter=rateLimit({windowMs:3600000,limit:5,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Слишком много запросов. Попробуй позже.'}});
function chooseGiftItem(items){return items[crypto.randomInt(0,items.length)];}
function chooseGiftRarity(){const roll=crypto.randomInt(0,100);let edge=0;for(const rarity of giftRarities){edge+=rarity.chance;if(roll<edge)return rarity;}return giftRarities[0];}
function giftMailer(){const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||465),user=process.env.SMTP_USER,pass=process.env.SMTP_PASS;if(!host||!user||!pass)return null;return nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass}});}
function publicGift(row){return {...row,gift:giftCatalog.find(g=>g.id===row.gift_id)||null};}
app.get('/api/gifts/catalog',auth,(_req,res)=>res.json({gifts:giftCatalog}));
app.get('/api/gifts/received',auth,(req,res)=>{
 const rows=db.prepare('SELECT g.*,u.username AS sender_username,u.display_name AS sender_display_name FROM user_gifts g JOIN users u ON u.id=g.sender_id WHERE g.recipient_id=? ORDER BY g.created_at DESC LIMIT 100').all(req.user.id);
 res.json({gifts:rows.map(publicGift)});
});
app.patch('/api/me/profile-gift',auth,(req,res)=>{
 const itemId=req.body.gift_item_id===null||req.body.gift_item_id===''?null:String(req.body.gift_item_id);
 if(itemId&&!db.prepare('SELECT 1 FROM user_gifts WHERE id=? AND recipient_id=?').get(itemId,req.user.id))return res.status(403).json({error:'Можно поставить только подарок, который ты действительно получил.'});
 db.prepare('UPDATE users SET profile_gift_item_id=? WHERE id=?').run(itemId,req.user.id);
 res.json({ok:true,profile_gift_item_id:itemId});
});
app.get('/api/users/:id/profile',auth,(req,res)=>{
 const user=db.prepare('SELECT * FROM users WHERE id=?').get(String(req.params.id));
 if(!user)return res.status(404).json({error:'Пользователь не найден.'});
 const gifts=db.prepare('SELECT g.*,u.username AS sender_username,u.display_name AS sender_display_name FROM user_gifts g JOIN users u ON u.id=g.sender_id WHERE g.recipient_id=? ORDER BY g.created_at DESC LIMIT 100').all(user.id).map(publicGift);
 const featured=gifts.find(g=>g.id===user.profile_gift_item_id)||null;
 res.json({user:publicUser(user),gifts,featured_gift:featured});
});
app.post('/api/gifts/send-code',auth,giftLimiter,async(req,res)=>{
 const username=String(req.body.username||'').trim().replace(/^@/,'');
 const giftId=String(req.body.gift_id||''),note=String(req.body.note||'').trim().slice(0,180),gift=giftCatalog.find(x=>x.id===giftId);
 if(!/^[a-z0-9_]{3,20}$/i.test(username))return res.status(400).json({error:'Введи ник получателя (3–20 символов).'});
 if(!gift)return res.status(400).json({error:'Выбери подарок.'});
 const recipient=db.prepare('SELECT id,username FROM users WHERE username=? COLLATE NOCASE').get(username);
 if(!recipient)return res.status(404).json({error:'Такого пользователя нет. Он должен сначала зарегистрироваться.'});
 const mailer=giftMailer();if(!mailer)return res.status(503).json({error:'Почта ещё не подключена. Владелец сайта должен добавить SMTP_HOST, SMTP_PORT, SMTP_USER и SMTP_PASS в Render.'});
 const code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),id=crypto.randomUUID(),hash=crypto.createHash('sha256').update(id+':'+code).digest('hex');
 db.prepare('DELETE FROM gift_verifications WHERE expires_at<? OR sender_id=?').run(Date.now(),req.user.id);
 db.prepare('INSERT INTO gift_verifications (id,sender_id,recipient_id,gift_id,note,code_hash,expires_at) VALUES (?,?,?,?,?,?,?)').run(id,req.user.id,recipient.id,giftId,note,hash,Date.now()+600000);
 try{await mailer.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:GIFT_VERIFY_EMAIL,subject:'Код подтверждения подарка — AlienStageTelegram',text:'Код: '+code+'\nПодарок: '+gift.emoji+' '+gift.name+'\nПолучатель: @'+recipient.username+'\nКод действует 10 минут. Если вы не запрашивали его, проигнорируйте письмо.'});}
 catch(e){db.prepare('DELETE FROM gift_verifications WHERE id=?').run(id);console.error('Gift email failed:',e.message);return res.status(502).json({error:'Не удалось отправить письмо. Проверь SMTP-настройки в Render.'});}
 res.json({ok:true,request_id:id,email:GIFT_VERIFY_EMAIL,expires_in:600});
});
app.post('/api/gifts/confirm',auth,giftLimiter,(req,res)=>{
 const id=String(req.body.request_id||''),code=String(req.body.code||'').trim();
 if(!/^\d{6}$/.test(code))return res.status(400).json({error:'Введи шестизначный код из письма.'});
 const row=db.prepare('SELECT * FROM gift_verifications WHERE id=? AND sender_id=?').get(id,req.user.id);
 if(!row||row.expires_at<Date.now()){if(row)db.prepare('DELETE FROM gift_verifications WHERE id=?').run(id);return res.status(410).json({error:'Код истёк. Запроси новый.'});}
 if(row.attempts>=5){db.prepare('DELETE FROM gift_verifications WHERE id=?').run(id);return res.status(429).json({error:'Слишком много неверных попыток. Запроси новый код.'});}
 const a=Buffer.from(crypto.createHash('sha256').update(id+':'+code).digest('hex'),'hex'),b=Buffer.from(row.code_hash,'hex');
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b)){db.prepare('UPDATE gift_verifications SET attempts=attempts+1 WHERE id=?').run(id);return res.status(400).json({error:'Неверный код. Проверь письмо.'});}
 const gift=giftCatalog.find(x=>x.id===row.gift_id),model=chooseGiftItem(gift.models),backdrop=chooseGiftItem(giftBackdrops),symbol=chooseGiftItem(giftSymbols),rarity=chooseGiftRarity(),giftRowId=crypto.randomUUID();
 const serial=db.prepare('SELECT COALESCE(MAX(serial_number),0)+1 AS next FROM user_gifts WHERE gift_id=?').get(row.gift_id).next;
 db.transaction(()=>{
  db.prepare('INSERT INTO user_gifts (id,sender_id,recipient_id,gift_id,note,serial_number,model_name,backdrop_name,backdrop_hex,symbol,rarity) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
   .run(giftRowId,row.sender_id,row.recipient_id,row.gift_id,row.note,serial,model,backdrop.name,backdrop.hex,symbol,rarity.name);
  db.prepare('DELETE FROM gift_verifications WHERE id=?').run(id);
 })();
 const collectible={id:giftRowId,gift_id:row.gift_id,serial_number:serial,model_name:model,backdrop_name:backdrop.name,backdrop_hex:backdrop.hex,symbol,rarity:rarity.name};
 io.to('user:'+row.recipient_id).emit('gift:received',collectible);
 res.status(201).json({ok:true,gift,collectible});
});
