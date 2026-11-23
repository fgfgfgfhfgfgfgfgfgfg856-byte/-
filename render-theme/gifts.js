(() => {
'use strict';
const $=s=>document.querySelector(s);
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const giftEmoji={rose:'🌹',heart:'💗',swan:'🦢',star:'⭐',crown:'👑',teddy:'🧸',bouquet:'💐',sparkles:'✨'};
const giftNames={rose:'Роза',heart:'Сердечко',swan:'Лебедь',star:'Звезда',crown:'Корона',teddy:'Мишка',bouquet:'Букет',sparkles:'Волшебство'};
const style=document.createElement('style');
style.textContent=[
'.ast-gift-menu-button{height:48px;width:100%;border:0;background:transparent;color:#c7d2dc;text-align:left;padding:0 22px;display:flex;align-items:center;gap:19px;font-size:19px;cursor:pointer}',
'.ast-gift-menu-button span{font-size:13px}.ast-gift-menu-button:hover{background:#223443;color:#fff}',
'#ast-own-gifts{margin:16px 0 4px;padding:13px;border:1px solid #344554;border-radius:11px;background:#1c2a37}',
'#ast-own-gifts h3{margin:0 0 8px;font-size:13px;color:#edf3f7}#ast-own-gifts p{margin:0 0 9px;color:#9eafbd;font-size:11px;line-height:1.45}',
'.ast-gift-list,.ast-public-gift-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}',
'.ast-gift-card-option{min-width:0;padding:8px 3px;border:1px solid #3b4c5a;border-radius:9px;background:#202e3b;color:#edf3f8;text-align:center;cursor:pointer}',
'.ast-gift-card-option b{display:block;font-size:23px;margin-bottom:4px}.ast-gift-card-option small{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.ast-gift-card-option[aria-pressed=true]{border-color:#69a9df;background:#294765;box-shadow:0 0 0 1px #69a9df}',
'.ast-gift-feature-actions{display:flex;gap:8px;margin-top:10px}.ast-gift-feature-actions button{border:1px solid #425362;border-radius:8px;padding:8px 10px;background:#263746;color:#e6eff6;font-size:11px;cursor:pointer}.ast-gift-feature-actions button.primary{background:#5288c1;border-color:#5288c1;color:#fff}',
'#ast-public-profile{position:fixed;inset:0;z-index:70;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px}#ast-public-profile[hidden]{display:none}',
'.ast-public-profile-card{box-sizing:border-box;width:min(480px,100%);max-height:90vh;overflow:auto;background:#17212b;border:1px solid #344656;border-radius:17px;padding:21px;color:#edf3f8;box-shadow:0 20px 70px #0009}',
'.ast-public-profile-head{display:flex;align-items:center;gap:13px;margin:6px 0 16px}.ast-public-avatar{width:62px;height:62px;flex:0 0 62px;border-radius:50%;display:grid;place-items:center;background:#2b5278;font-size:24px;overflow:hidden}.ast-public-avatar img{width:100%;height:100%;object-fit:cover}',
'.ast-public-profile-name{font-size:19px;font-weight:700;display:flex;align-items:center;gap:7px;flex-wrap:wrap}.ast-public-profile-user{margin-top:4px;font-size:12px;color:#9eafbd}',
'.ast-public-profile-close{float:right;border:0;background:transparent;color:#a9b8c4;font-size:25px;cursor:pointer}.ast-public-profile-card h3{font-size:13px;margin:17px 0 9px}',
'.ast-public-gift{padding:10px 4px;text-align:center;background:#202e3b;border:1px solid #344554;border-radius:10px}.ast-public-gift b{display:block;font-size:24px}.ast-public-gift small{display:block;margin-top:5px;color:#c8d5df;font-size:10px}.ast-public-gift em{display:block;color:#8eabc1;font-size:10px;font-style:normal;margin-top:3px}',
'.ast-profile-open{border:1px solid #4c7394;background:#203d55;color:#dceeff;border-radius:8px;padding:7px 9px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap}.ast-person-actions{display:flex;gap:5px;align-items:center}.person-featured-gift{font-size:15px;vertical-align:middle}',
'.ast-gift-status{font-size:11px;color:#9eb6c9;min-height:17px;margin-top:8px}@media(max-width:500px){.ast-public-profile-card{padding:16px}}'
].join('\n');
document.head.appendChild(style);
const publicOverlay=document.createElement('div');publicOverlay.id='ast-public-profile';publicOverlay.hidden=true;
publicOverlay.innerHTML='<section class="ast-public-profile-card" role="dialog" aria-modal="true"><button type="button" class="ast-public-profile-close" aria-label="Закрыть">×</button><div class="ast-public-profile-head"><div class="ast-public-avatar" id="ast-public-avatar">✦</div><div><div class="ast-public-profile-name" id="ast-public-name"></div><div class="ast-public-profile-user" id="ast-public-username"></div></div></div><h3>🎁 Подарки пользователя</h3><div class="ast-public-gift-grid" id="ast-public-gifts"></div><div class="ast-gift-status" id="ast-public-status"></div></section>';
document.body.appendChild(publicOverlay);
const ownBox=document.createElement('section');ownBox.id='ast-own-gifts';
ownBox.innerHTML='<h3>🎁 Мои подарки</h3><p>Выбери один из полученных подарков — он будет показываться рядом с твоим ником. Другие смогут открыть профиль и увидеть всю коллекцию.</p><div class="ast-gift-list" id="ast-own-gift-grid"></div><div class="ast-gift-feature-actions"><button type="button" class="primary" id="ast-set-featured-gift" disabled>Поставить рядом с ником</button><button type="button" id="ast-clear-featured-gift">Убрать значок</button></div><div class="ast-gift-status" id="ast-own-gift-status"></div>';
const profileModal=$('#profile-modal');
if(profileModal){const actions=$('.modal-actions',profileModal);if(actions)actions.before(ownBox);else $('.modal-card',profileModal)?.appendChild(ownBox);}
const giftButton=document.createElement('button');giftButton.type='button';giftButton.id='ast-gifts-menu';giftButton.className='ast-gift-menu-button';giftButton.innerHTML='🎁 <span>Мои подарки</span>';
const menuItems=$('.telegram-drawer-items');
if(menuItems&&!$('#ast-gifts-menu')){const profileAction=$('#telegram-profile-action');if(profileAction)profileAction.after(giftButton);else menuItems.appendChild(giftButton);}
giftButton.addEventListener('click',openOwnGifts);
let ownedGifts=[],selectedGift=null;
async function api(url,options={}){const response=await fetch(url,{credentials:'same-origin',...options,headers:{...(options.headers||{}),...(options.body&&!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Не удалось выполнить запрос.');return data;}
async function openOwnGifts(){
 $('#app-menu-backdrop')?.classList.add('hidden');$('#telegram-drawer-backdrop')?.classList.add('hidden');
 if(profileModal)profileModal.classList.remove('hidden');
 $('#ast-own-gift-status').textContent='Загружаю коллекцию...';
 try{const data=await api('/api/gifts/received');ownedGifts=data.gifts||[];selectedGift=(await api('/api/me')).user.profile_gift_id||null;renderOwnGifts();$('#ast-own-gift-status').textContent=ownedGifts.length?'':'Пока подарков нет. Тебе могут подарить их другие пользователи.';}
 catch(error){$('#ast-own-gift-status').textContent=error.message;}
}
function renderOwnGifts(){
 const counts=new Map();ownedGifts.forEach(item=>counts.set(item.gift_id,(counts.get(item.gift_id)||0)+1));
 const grid=$('#ast-own-gift-grid');if(!grid)return;
 if(!counts.size){grid.innerHTML='<div style="grid-column:1/-1;color:#9eafbd;font-size:11px">Коллекция пока пустая.</div>';$('#ast-set-featured-gift').disabled=true;return;}
 grid.innerHTML=[...counts].map(([id,count])=>'<button type="button" class="ast-gift-card-option" data-gift-id="'+id+'" aria-pressed="'+(selectedGift===id)+'"><b>'+(giftEmoji[id]||'🎁')+'</b><small>'+(giftNames[id]||id)+' × '+count+'</small></button>').join('');
 $('#ast-set-featured-gift').disabled=!selectedGift;
}
$('#ast-own-gift-grid')?.addEventListener('click',event=>{const button=event.target.closest('[data-gift-id]');if(!button)return;selectedGift=button.dataset.giftId;renderOwnGifts();});
$('#ast-set-featured-gift')?.addEventListener('click',async()=>{if(!selectedGift)return;try{await api('/api/me/profile-gift',{method:'PATCH',body:JSON.stringify({gift_id:selectedGift})});$('#ast-own-gift-status').textContent='Готово! Значок появится рядом с твоим ником. 💗';updateOwnBadges();}catch(error){$('#ast-own-gift-status').textContent=error.message;}});
$('#ast-clear-featured-gift')?.addEventListener('click',async()=>{try{await api('/api/me/profile-gift',{method:'PATCH',body:JSON.stringify({gift_id:null})});selectedGift=null;renderOwnGifts();$('#ast-own-gift-status').textContent='Значок убран.';updateOwnBadges();}catch(error){$('#ast-own-gift-status').textContent=error.message;}});
async function openPublicProfile(userId){
 publicOverlay.hidden=false;$('#ast-public-status').textContent='Загружаю профиль...';$('#ast-public-gifts').innerHTML='';
 try{const data=await api('/api/users/'+encodeURIComponent(userId)+'/profile'),user=data.user||{};
 $('#ast-public-avatar').innerHTML=user.avatar_url?'<img src="'+escapeHtml(user.avatar_url)+'" alt="">':escapeHtml((user.display_name||'?').trim().slice(0,1).toUpperCase());
 $('#ast-public-name').textContent=user.display_name||'Пользователь';if(data.featured_gift)$('#ast-public-name').append(' '+data.featured_gift.emoji);
 $('#ast-public-username').textContent='@'+user.username;
 const gifts=data.gifts||[];$('#ast-public-gifts').innerHTML=gifts.length?gifts.map(item=>'<div class="ast-public-gift"><b>'+(item.gift?.emoji||'🎁')+'</b><small>'+escapeHtml(item.gift?.name||'Подарок')+'</small><em>× '+item.count+'</em></div>').join(''):'<div style="grid-column:1/-1;color:#9eafbd;font-size:12px">У пользователя пока нет подарков.</div>';
 $('#ast-public-status').textContent='';
 }catch(error){$('#ast-public-status').textContent=error.message;}
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
publicOverlay.addEventListener('click',event=>{if(event.target===publicOverlay||event.target.closest('.ast-public-profile-close'))publicOverlay.hidden=true;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')publicOverlay.hidden=true;});
const peopleList=$('#conversation-list');
function addProfileButtons(){if(!peopleList||peopleList.dataset.view!=='people')return;peopleList.querySelectorAll('.person-result').forEach(row=>{const messageButton=$('[data-message-user]',row);if(!messageButton||$('.ast-profile-open',row))return;const actions=document.createElement('div');actions.className='ast-person-actions';messageButton.parentNode.insertBefore(actions,messageButton);actions.appendChild(messageButton);const button=document.createElement('button');button.type='button';button.className='ast-profile-open';button.textContent='Профиль';button.dataset.astProfile=messageButton.dataset.messageUser;actions.appendChild(button);});}
peopleList?.addEventListener('click',event=>{const button=event.target.closest('[data-ast-profile]');if(button){event.preventDefault();openPublicProfile(button.dataset.astProfile);}});
if(peopleList&&typeof MutationObserver!=='undefined')new MutationObserver(addProfileButtons).observe(peopleList,{childList:true,subtree:true});
addProfileButtons();
function updateOwnBadges(){api('/api/me').then(data=>{const user=data.user||{},name=$('#my-display-name'),drawerName=$('#drawer-name');if(name)name.textContent=user.display_name+(user.profile_gift_emoji?' '+user.profile_gift_emoji:'');if(drawerName)drawerName.textContent=user.display_name+(user.profile_gift_emoji?' '+user.profile_gift_emoji:'');}).catch(()=>{});}
updateOwnBadges();
if(typeof MutationObserver!=='undefined'){const profileName=$('#my-display-name');if(profileName)new MutationObserver(updateOwnBadges).observe(profileName,{childList:true,characterData:true,subtree:true});}
})();