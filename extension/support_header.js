(()=>{
const SHORT_SUPPORT={en:'♥ Support',ru:'♥ Поддержать',es:'♥ Apoyar',de:'♥ Unterstützen',fr:'♥ Soutenir',pt_BR:'♥ Apoiar',zh_CN:'♥ 支持',zh_TW:'♥ 支持',ja:'♥ 支援',ko:'♥ 후원',ar:'♥ دعم',hi:'♥ समर्थन',id:'♥ Dukung',tr:'♥ Destekle',it:'♥ Supporta',pl:'♥ Wesprzyj',uk:'♥ Підтримати',vi:'♥ Hỗ trợ'};
function refreshSupportHeader(){
  const top=document.querySelector('.top'),support=document.getElementById('supportDoneBell'),ver=top?.querySelector('.ver');
  if(!top||!support)return;
  let style=document.getElementById('donebell-support-header-style');
  if(!style){
    style=document.createElement('style');
    style.id='donebell-support-header-style';
    style.textContent='.top{display:grid!important;grid-template-columns:auto 1fr auto;align-items:center;gap:8px}.top #supportDoneBell{justify-self:center;min-height:0;max-width:112px;padding:4px 9px;border-radius:999px;font-size:calc(var(--base-size)*.74);font-weight:525;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:color-mix(in srgb,var(--blue) 18%,var(--control));border-color:color-mix(in srgb,var(--blue) 58%,var(--line));color:color-mix(in srgb,var(--blue) 84%,var(--text));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--blue) 10%,transparent);opacity:.94}.top #supportDoneBell:hover{opacity:1;background:color-mix(in srgb,var(--blue) 27%,var(--control));border-color:color-mix(in srgb,var(--blue) 76%,var(--line))}';
    document.head.appendChild(style);
  }
  if(ver&&support.parentElement!==top)top.insertBefore(support,ver);
  document.querySelector('.support-row:empty')?.remove();
  const current=typeof lang==='string'?lang:'en';
  support.textContent=SHORT_SUPPORT[current]||SHORT_SUPPORT.en;
  if(typeof tr==='function'){
    support.title=tr('supportDoneBell');
    support.setAttribute('aria-label',tr('supportDoneBell'));
  }
  if(ver)ver.textContent=`v${chrome.runtime.getManifest().version} Public Beta`;
}
const originalLocalize=typeof localizeStatic==='function'?localizeStatic:null;
if(originalLocalize)localizeStatic=function(){originalLocalize();refreshSupportHeader();};
refreshSupportHeader();
globalThis.DoneBellRefreshSupportHeader=refreshSupportHeader;
})();
