const GIFT_VERIFY_EMAIL=process.env.GIFT_VERIFY_EMAIL||'fgfgfgfgfgfgfgfgfgfg856@gmail.com';
const giftCatalog=[{id:'rose',name:'Роза',emoji:'🌹'},{id:'heart',name:'Сердечко',emoji:'💗'},{id:'swan',name:'Лебедь',emoji:'🦢'},{id:'star',name:'Звезда',emoji:'⭐'},{id:'crown',name:'Корона',emoji:'👑'},{id:'teddy',name:'Мишка',emoji:'🧸'},{id:'bouquet',name:'Букет',emoji:'💐'},{id:'sparkles',name:'Волшебство',emoji:'✨'}];
const giftLimiter=rateLimit({windowMs:3600000,limit:5,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Слишком много запросов. Попробуй позже.'}});
function giftMailer(){const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||465),user=process.env.SMTP_USER,pass=process.env.SMTP_PASS;if(!host||!user||!pass)return null;return nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass}});}
app.get('/api/gifts/catalog',auth,(_req,res)=>res.json({gifts:giftCatalog}));
app.get('/api/gifts/received',auth,(req,res)=>{const rows=db.prepare('SELECT g.id,g.gift_id,g.note,g.created_at,u.username,u.display_name FROM user_gifts g JOIN users u ON u.id=g.sender_id WHERE g.recipient_id=? ORDER BY g.created_at DESC LIMIT 50').all(req.user.id);res.json({gifts:rows.map(x=>({...x,gift:giftCatalog.find(g=>g.id===x.gift_id)||null}))});});
app.post('/api/gifts/send-code',auth,giftLimiter,async(req,res)=>{
 const username=String(req.body.username||'').trim().replace(/^@/,'');
 const giftId=String(req.body.gift_id||''),note=String(req.body.note||'').trim().slice(0,180),gift=giftCatalog.find(x=>x.id===giftId);
 if(!/^[a-z0-9_]{3,20}$/i.test(username))return res.status(400).json({error:'Введи ник получателя (3–20 символов).'});
 if(!gift)return res.status(400).json({error:'Выбери подарок.'});
 const recipient=db.prepare('SELECT id,username FROM users WHERE username=? COLLATE NOCASE').get(username);
 if(!recipient)return res.status(404).json({error:'Такого пользователя нет. Он должен сначала зарегистрироваться.'});
 if(recipient.id===req.user.id)return res.status(400).json({error:'Нельзя подарить подарок самому себе.'});
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
 const gift=giftCatalog.find(x=>x.id===row.gift_id),giftRowId=crypto.randomUUID();
 db.transaction(()=>{db.prepare('INSERT INTO user_gifts (id,sender_id,recipient_id,gift_id,note) VALUES (?,?,?,?,?)').run(giftRowId,row.sender_id,row.recipient_id,row.gift_id,row.note);db.prepare('DELETE FROM gift_verifications WHERE id=?').run(id);})();
 io.to('user:'+row.recipient_id).emit('gift:received',{id:giftRowId,gift_id:row.gift_id});
 res.status(201).json({ok:true,gift});
});
