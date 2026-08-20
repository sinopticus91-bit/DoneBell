(() => {
  const SITE_CATALOG = [
    { id:'chatgpt', name:'ChatGPT', status:'builtin', detector:'built-in', hosts:['chatgpt.com','chat.openai.com'], patterns:['https://chatgpt.com/*','https://chat.openai.com/*'] },
    { id:'claude', name:'Claude', status:'builtin', detector:'built-in', hosts:['claude.ai'], patterns:['https://claude.ai/*'] },
    { id:'gemini', name:'Gemini', status:'builtin', detector:'built-in', hosts:['gemini.google.com'], patterns:['https://gemini.google.com/*'] },
    { id:'deepseek', name:'DeepSeek', status:'dedicated', detector:'dedicated', hosts:['chat.deepseek.com'], patterns:['https://chat.deepseek.com/*'] },
    { id:'grok', name:'Grok', status:'generic', detector:'generic', hosts:['grok.com','www.grok.com'], patterns:['https://grok.com/*','https://www.grok.com/*'] },
    { id:'perplexity', name:'Perplexity', status:'generic', detector:'generic', hosts:['perplexity.ai','www.perplexity.ai'], patterns:['https://perplexity.ai/*','https://www.perplexity.ai/*'] },
    { id:'copilot', name:'Microsoft Copilot', status:'generic', detector:'generic', hosts:['copilot.microsoft.com'], patterns:['https://copilot.microsoft.com/*'] },
    { id:'poe', name:'Poe', status:'generic', detector:'generic', hosts:['poe.com','www.poe.com'], patterns:['https://poe.com/*','https://www.poe.com/*'] },
    { id:'mistral', name:'Le Chat', status:'generic', detector:'generic', hosts:['chat.mistral.ai'], patterns:['https://chat.mistral.ai/*'] },
    { id:'you', name:'You.com', status:'generic', detector:'generic', hosts:['you.com','www.you.com'], patterns:['https://you.com/*','https://www.you.com/*'] }
  ];
  const ALERT_FIELDS=['soundEnabled','soundVolume','repeatSound','focusTab','stopOnTabFocus','showNotification','flashTitle','inPagePanel'];
  const PROFILES={
    quiet:{soundEnabled:false,repeatSound:false,focusTab:false,stopOnTabFocus:false,showNotification:true,flashTitle:true,inPagePanel:false},
    normal:{soundEnabled:true,repeatSound:false,focusTab:false,stopOnTabFocus:false,showNotification:true,flashTitle:true,inPagePanel:true},
    urgent:{soundEnabled:true,repeatSound:true,focusTab:true,stopOnTabFocus:false,showNotification:true,flashTitle:true,inPagePanel:true}
  };
  const normalizeHost=(h)=>String(h||'').toLowerCase().replace(/^www\./,'');
  function siteForHost(host){const raw=String(host||'').toLowerCase(),norm=normalizeHost(raw);for(const s of SITE_CATALOG){if(s.hosts.some(h=>raw===String(h).toLowerCase()||norm===normalizeHost(h)))return s;}return null;}
  function siteForUrl(url){try{return siteForHost(new URL(url).hostname);}catch{return null;}}
  function publicSite(site){return site?{id:site.id,name:site.name,knownAi:true,detector:site.detector,status:site.status}:null;}
  const defaultSiteSettings=()=>({autoWatch:false,inheritGlobal:true,profile:'normal',custom:{}});
  function normalizeSiteSettings(v){const b=defaultSiteSettings();if(!v||typeof v!=='object')return b;return{autoWatch:Boolean(v.autoWatch),inheritGlobal:v.inheritGlobal!==false,profile:['quiet','normal','urgent','custom'].includes(v.profile)?v.profile:'normal',custom:v.custom&&typeof v.custom==='object'?{...v.custom}:{}};}
  function applyProfile(base,id){return PROFILES[id]?{...base,...PROFILES[id]}:{...base};}
  function effectiveSettings(globalSettings,siteSettings){const base={...globalSettings},s=normalizeSiteSettings(siteSettings);if(s.inheritGlobal)return base;if(s.profile==='custom'){const c={};for(const k of ALERT_FIELDS)if(Object.prototype.hasOwnProperty.call(s.custom,k))c[k]=s.custom[k];return{...base,...c};}return applyProfile(base,s.profile);}
  globalThis.DoneBellSites={SITE_CATALOG,ALERT_FIELDS,PROFILES,siteForHost,siteForUrl,publicSite,defaultSiteSettings,normalizeSiteSettings,applyProfile,effectiveSettings};
})();
