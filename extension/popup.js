(()=>{
const scripts=[
  'i18n_bootstrap.js',
  'i18n_data/en.js','i18n_data/ru.js','i18n_data/es.js','i18n_data/de.js','i18n_data/fr.js','i18n_data/pt_BR.js',
  'i18n_data/zh_CN.js','i18n_data/zh_TW.js','i18n_data/ja.js','i18n_data/ko.js','i18n_data/ar.js','i18n_data/hi.js',
  'i18n_data/id.js','i18n_data/tr.js','i18n_data/it.js','i18n_data/pl.js','i18n_data/uk.js','i18n_data/vi.js',
  'i18n.js','i18n_patch_v056.js','popup_1.js','popup_2.js','popup_3.js'
];
function loadNext(index=0){
  if(index>=scripts.length)return;
  const s=document.createElement('script');
  s.src=chrome.runtime.getURL(scripts[index]);
  s.onload=()=>{s.remove();loadNext(index+1);};
  s.onerror=()=>{console.error('[DoneBell] Failed to load',scripts[index]);s.remove();};
  document.documentElement.appendChild(s);
}
loadNext();
})();
