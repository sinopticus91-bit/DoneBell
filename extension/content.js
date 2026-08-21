(() => {
  if (window.__DONEBELL_V040_LOADED__) return;
  window.__DONEBELL_V040_LOADED__ = true;

  const I18N = globalThis.DoneBellI18n;
  const SITE_API = globalThis.DoneBellSites;
  let uiLanguage = I18N.resolveLanguage('auto', navigator.language);
  let uiAppearance = { fontFamily: 'system', fontSize: 14 };
  const UI_FONT_STACKS = {system:'system-ui,-apple-system,"Segoe UI Variable","Segoe UI",sans-serif',segoeVariable:'"Segoe UI Variable","Segoe UI",system-ui,sans-serif',segoe:'"Segoe UI",system-ui,sans-serif',calibri:'Calibri,"Segoe UI",Arial,sans-serif',candara:'Candara,Calibri,"Segoe UI",sans-serif',corbel:'Corbel,Calibri,"Segoe UI",sans-serif',verdana:'Verdana,Geneva,sans-serif',tahoma:'Tahoma,Geneva,sans-serif',arial:'Arial,Helvetica,sans-serif',trebuchet:'"Trebuchet MS",Arial,sans-serif',centuryGothic:'"Century Gothic",Arial,sans-serif',franklin:'"Franklin Gothic Medium","Arial Narrow",Arial,sans-serif',lucida:'"Lucida Sans Unicode","Lucida Grande",sans-serif',georgia:'Georgia,"Times New Roman",serif',noto:'"Noto Sans","Segoe UI",Arial,sans-serif',yuGothic:'"Yu Gothic UI","Yu Gothic","Meiryo UI",sans-serif',meiryo:'"Meiryo UI",Meiryo,"Yu Gothic UI",sans-serif',yahei:'"Microsoft YaHei UI","Microsoft YaHei","Segoe UI",sans-serif',jhenghei:'"Microsoft JhengHei UI","Microsoft JhengHei","Segoe UI",sans-serif',malgun:'"Malgun Gothic","Segoe UI",sans-serif',nirmala:'"Nirmala UI","Segoe UI",sans-serif',cascadia:'"Cascadia Code","Cascadia Mono",Consolas,monospace',consolas:'Consolas,"Cascadia Mono",monospace',courier:'"Courier New",monospace'};
  function normalizeUiAppearance(v){const a=v&&typeof v==='object'?v:{};return{fontFamily:UI_FONT_STACKS[a.fontFamily]?a.fontFamily:'system',fontSize:Math.max(12,Math.min(19,Number(a.fontSize)||14))};}
  function uiFontStack(){return UI_FONT_STACKS[uiAppearance.fontFamily]||UI_FONT_STACKS.system;}
  const t = (key, vars) => I18N.t(uiLanguage, key, vars);
  const FINISH_STABLE_MS = 1400;
  const ELEMENT_STABLE_MS = 900;

  const DEEPSEEK_STOP_SELECTORS = [
    'button[class*="stop" i]',
    '[role="button"][class*="stop" i]',
    'div[class*="stop" i]',
    '[data-testid*="stop" i]',
    '[data-test-id*="stop" i]',
    '[data-test*="stop" i]'
  ];

  const STOP_SELECTORS = [
    'button[data-testid="stop-button"]',
    'button[data-testid*="stop" i]',
    'button[data-test*="stop" i]',
    'button[data-cy*="stop" i]',
    'button[aria-label*="stop" i]',
    'button[title*="stop" i]',
    '[role="button"][aria-label*="stop" i]',
    'button[aria-label*="cancel generation" i]',
    'button[aria-label*="cancel response" i]',
    'button[aria-label*="останов" i]',
    'button[title*="останов" i]',
    'button[class*="stop" i]',
    '[role="button"][class*="stop" i]'
  ];

  const STOP_TEXT_RE = /(?:\bstop\b|stop\s+(?:generat|respond|stream)|cancel\s+(?:generat|response)|interrupt(?:\s+response)?|terminate(?:\s+response)?|останов|прерват|зупин|перерват|detener|parar\s+(?:generaci[oó]n|respuesta)|cancelar\s+(?:generaci[oó]n|respuesta)|stoppen|antwort\s+stoppen|generierung\s+stoppen|arr[êe]ter|stopper|parar|interromper|interrompi|ferma|interrompi|annulla|zatrzymaj|przerwij|anuluj|durdur|iptal|hentikan|batalkan|dừng|hủy|إيقاف|توقف|إلغاء|रोक|बंद|停止|生成を停止|중지)/i;

  const state = {
    watching: false,
    mode: null,
    site: null,
    lastStopPresent: false,
    sawGeneration: false,
    pendingFinishTimer: null,
    evaluateTimer: null,
    rule: null,
    rulePendingTimer: null,
    titleFlashTimer: null,
    titleFlashUntil: 0,
    baseTitle: document.title,
    donePanelHost: null,
    watchHudHost: null,
    soundPlaying: false,
    completionSettings: null,
    completionActive: false,
    picker: null,
    lastLocation: location.href,
    deepseekSnapshotSignature: null,
    deepseekIdleFingerprint: null,
    autoStarted: false
  };

  function log(message, details = null, level = 'info') {
    chrome.runtime.sendMessage({
      type: 'debug-log', source: 'content', level, message, details
    }).catch(() => {});
  }

  function siteIdentity() {
    const known = SITE_API?.siteForUrl?.(location.href);
    if (known) return SITE_API.publicSite(known);
    const host = location.hostname.toLowerCase();
    return { id: host || 'web', name: host || 'Web page', knownAi: false, detector: 'generic', status: 'generic' };
  }

  state.site = siteIdentity();

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function labelOf(el) {
    return [
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('title'),
      el.getAttribute?.('data-testid'),
      el.getAttribute?.('data-test'),
      el.getAttribute?.('data-cy'),
      el.textContent
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function composerInput() {
    const candidates = [...document.querySelectorAll('textarea,[contenteditable="true"][role="textbox"],[contenteditable="true"]')]
      .filter(isVisible)
      .filter((el) => !el.closest?.('#__donebell_done_panel__,#__donebell_watch_hud__,#__donebell_picker_banner__'));
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return (br.bottom - ar.bottom) || (br.right - ar.right);
    });
    return candidates[0];
  }

  function composerRoot() {
    const input = composerInput();
    if (!input) return null;
    let best = input.parentElement || input;
    let node = input.parentElement;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      const controls = node.querySelectorAll?.('button,[role="button"],div[class*="stop" i]') || [];
      if (controls.length && rect.height > 24 && rect.height < Math.min(420, innerHeight * 0.55)) best = node;
    }
    return best;
  }

  function controlSummary(el) {
    if (!(el instanceof Element)) return null;
    const svg = el.querySelector?.('svg');
    const svgBits = svg ? [...svg.querySelectorAll('path,rect,polygon,circle')].slice(0, 4).map((n) => ({
      tag: n.tagName.toLowerCase(), d: (n.getAttribute('d') || '').slice(0, 180),
      x: n.getAttribute('x'), y: n.getAttribute('y'), width: n.getAttribute('width'), height: n.getAttribute('height')
    })) : [];
    return {
      tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), aria: el.getAttribute('aria-label'), title: el.getAttribute('title'),
      testid: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-test'),
      class: String(el.getAttribute('class') || '').slice(0, 240), text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80), svg: svgBits
    };
  }

  function deepseekControlSnapshot() {
    if (state.site?.id !== 'deepseek') return null;
    const root = composerRoot() || document.body;
    const candidates = [...root.querySelectorAll('button,[role="button"],div[class*="stop" i]')]
      .filter(isVisible).slice(-16).map(controlSummary).filter(Boolean);
    const input = composerInput();
    return {
      input: input ? { tag: input.tagName.toLowerCase(), role: input.getAttribute('role'), placeholder: input.getAttribute('placeholder'), class: String(input.getAttribute('class') || '').slice(0, 180) } : null,
      controls: candidates
    };
  }

  function maybeLogDeepseekSnapshot(reason) {
    if (state.site?.id !== 'deepseek') return;
    const snapshot = deepseekControlSnapshot();
    if (!snapshot) return;
    let signature = '';
    try { signature = JSON.stringify(snapshot); } catch {}
    if (signature && signature === state.deepseekSnapshotSignature) return;
    state.deepseekSnapshotSignature = signature;
    log('DeepSeek control snapshot', { reason, snapshot });
  }

  function deepseekPrimaryAction() {
    if (state.site?.id !== 'deepseek') return null;
    const root = composerRoot() || document.body;
    const candidates = [...root.querySelectorAll('[role="button"].ds-button--primary,[role="button"][class*="ds-button--primary"]')]
      .filter(isVisible);
    if (!candidates.length) return null;
    const input = composerInput();
    if (!input) return candidates[candidates.length - 1];
    const ir = input.getBoundingClientRect();
    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      const ad = Math.abs(ar.bottom - ir.bottom) + Math.abs(ar.right - ir.right);
      const bd = Math.abs(br.bottom - ir.bottom) + Math.abs(br.right - ir.right);
      return ad - bd;
    });
    return candidates[0];
  }

  function deepseekActionFingerprint(el) {
    if (!(el instanceof Element)) return '';
    const bits = [...el.querySelectorAll('svg path,svg rect,svg polygon,svg circle')].slice(0, 4).map((n) => {
      const tag = n.tagName.toLowerCase();
      if (tag === 'path') return `p:${(n.getAttribute('d') || '').slice(0, 70)}`;
      return `${tag}:${n.getAttribute('x')||''},${n.getAttribute('y')||''},${n.getAttribute('width')||''},${n.getAttribute('height')||''}`;
    });
    return bits.join('|');
  }

  function deepseekActionIsBusy(el) {
    if (!(el instanceof Element)) return false;
    const nodes = [...el.querySelectorAll('svg path,svg rect')];
    const paths = nodes.filter((n) => n.tagName.toLowerCase() === 'path').map((n) => n.getAttribute('d') || '');
    // Actual DeepSeek web UI observed Aug 2026: square Stop icon.
    if (paths.some((d) => /^M2(?:\.0+)? 4\.88/i.test(d) || /^M2 4\.88C2/i.test(d))) return true;
    // Processing spinner shown briefly before the square Stop icon.
    if (nodes.some((n) => n.tagName.toLowerCase() === 'rect' && n.getAttribute('width') === '36' && n.getAttribute('height') === '36')) return true;
    if (paths.some((d) => /^M34,18(?:\s|$)/i.test(d))) return true;
    const fp = deepseekActionFingerprint(el);
    if (state.deepseekIdleFingerprint && fp && fp !== state.deepseekIdleFingerprint) {
      // DeepSeek swaps the SVG inside the same primary action control while generating.
      return true;
    }
    return false;
  }

  function findDeepseekStopControl() {
    if (state.site?.id !== 'deepseek') return null;
    const root = composerRoot() || document.body;
    const primaryAction = deepseekPrimaryAction();
    if (primaryAction && deepseekActionIsBusy(primaryAction)) return primaryAction;
    for (const selector of DEEPSEEK_STOP_SELECTORS) {
      try {
        for (const node of root.querySelectorAll(selector)) {
          if (!isVisible(node)) continue;
          const classText = String(node.getAttribute?.('class') || '');
          const label = `${labelOf(node)} ${classText}`;
          if (STOP_TEXT_RE.test(label) || /stop/i.test(classText)) {
            return node.closest?.('button,[role="button"]') || node;
          }
        }
      } catch {}
    }
    // DeepSeek sometimes renders the square stop control as a plain div without button semantics.
    for (const node of root.querySelectorAll('button,[role="button"],div')) {
      if (!isVisible(node)) continue;
      const label = labelOf(node);
      if (label && label.length < 160 && STOP_TEXT_RE.test(label)) return node.closest?.('button,[role="button"]') || node;
    }
    return null;
  }

  function findStopControl() {
    const deepseek = findDeepseekStopControl();
    if (deepseek) return deepseek;
    for (const selector of STOP_SELECTORS) {
      try {
        for (const el of document.querySelectorAll(selector)) {
          if (isVisible(el)) return el;
        }
      } catch {}
    }

    const roots = [
      document.querySelector('form'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.body
    ].filter(Boolean);

    const visited = new Set();
    for (const root of roots) {
      const candidates = root.querySelectorAll('button,[role="button"]');
      for (const el of candidates) {
        if (visited.has(el)) continue;
        visited.add(el);
        if (!isVisible(el)) continue;
        const label = labelOf(el);
        if (label && STOP_TEXT_RE.test(label)) return el;
      }
      if (visited.size > 1200) break;
    }
    return null;
  }

  function sendStatus(status) {
    chrome.runtime.sendMessage({
      type: 'watch-status',
      state: status,
      mode: state.mode,
      site: state.site,
      rule: state.rule ? publicRule(state.rule) : null,
      autoStarted: state.autoStarted
    }).catch(() => {});
  }

  function registerWatch() {
    chrome.runtime.sendMessage({
      type: 'register-watch',
      mode: state.mode,
      site: state.site,
      url: location.href,
      rule: state.rule ? publicRule(state.rule) : null,
      autoStarted: state.autoStarted
    }).catch(() => {});
  }

  function unregisterWatch() {
    chrome.runtime.sendMessage({ type: 'unregister-watch' }).catch(() => {});
  }

  function publicRule(rule) {
    if (!rule) return null;
    return {
      condition: rule.condition,
      selector: rule.selector,
      description: rule.description,
      initialText: rule.initialText,
      initialDisabled: rule.initialDisabled,
      initialVisible: rule.initialVisible
    };
  }

  function stopTitleFlash(restore = true) {
    if (state.titleFlashTimer) {
      clearInterval(state.titleFlashTimer);
      state.titleFlashTimer = null;
    }
    if (restore && state.baseTitle) document.title = state.baseTitle;
  }

  function startTitleFlash() {
    const previousBase = state.baseTitle || document.title;
    stopTitleFlash(false);
    state.baseTitle = document.title.startsWith('🔔 ') ? previousBase : (document.title || state.site.name);
    state.titleFlashUntil = Date.now() + 10 * 60 * 1000;
    const prefix = t('doneTitlePrefix');
    let on = false;
    const tick = () => {
      if (Date.now() > state.titleFlashUntil) {
        stopTitleFlash(true);
        return;
      }
      on = !on;
      document.title = on ? `${prefix}${state.baseTitle}` : state.baseTitle;
    };
    tick();
    state.titleFlashTimer = setInterval(tick, 700);
  }

  function acknowledgeDoneSignal() {
    state.completionActive = false;
    stopTitleFlash(true);
    hideDonePanel();
    state.soundPlaying = false;
    if (state.watching && state.mode === 'ai') sendStatus('armed');
    else sendStatus('off');
    chrome.runtime.sendMessage({ type: 'completion-acknowledged' }).catch(() => {});
    log('Done signal explicitly acknowledged by user');
  }

  function hideDonePanel() {
    if (state.donePanelHost) {
      try { state.donePanelHost.remove(); } catch {}
      state.donePanelHost = null;
    }
    // Defensive cleanup: keep the completion surface a true singleton even if
    // an older injected instance ever left a stale host behind.
    try { document.querySelectorAll('#__donebell_done_panel__').forEach((node) => node.remove()); } catch {}
  }

  function updateDonePanelContent() {
    const host = state.donePanelHost;
    if (!host || !host.isConnected || !host.shadowRoot) return false;
    const info = host.shadowRoot.querySelector('.info-main');
    const site = host.shadowRoot.querySelector('.site');
    if (info) info.textContent = `${t('donePanel')}${state.soundPlaying ? ` · ${t('soundPlaying')}` : ''}`;
    if (site) site.textContent = state.site?.name || '';
    return true;
  }

  function renderDonePanel() {
    const settings = state.completionSettings || {};
    if (!settings.inPagePanel) {
      hideDonePanel();
      return;
    }

    // Do not rebuild the surface for audio-state updates. Rebuilding could let
    // Chromium paint the old and new panels in adjacent frames during an
    // immediate auto-focus. Update the existing singleton in place instead.
    if (updateDonePanelContent()) return;

    // Remove only stale hosts that are not owned by this live state instance.
    try { document.querySelectorAll('#__donebell_done_panel__').forEach((node) => node.remove()); } catch {}

    const host = document.createElement('div');
    host.id = '__donebell_done_panel__';
    Object.assign(host.style, {
      position: 'fixed', top: '72px', right: '18px', zIndex: '2147483647', pointerEvents: 'auto'
    });

    const shadow = host.attachShadow({ mode: 'open' });
    const buttonText = `✓ ${t('dismiss')}`;
    shadow.innerHTML = `
      <style>
        :host{all:initial}.panel{appearance:none;display:block;max-width:min(470px,calc(100vw - 36px));min-width:300px;min-height:86px;box-sizing:border-box;padding:12px 15px 13px;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:rgba(20,20,23,.97);color:#fff;box-shadow:0 12px 36px rgba(0,0,0,.38);font-family:${uiFontStack()};text-align:left;cursor:pointer;backdrop-filter:blur(12px);transition:transform .12s ease,background .12s ease,border-color .12s ease,box-shadow .12s ease}
        .meta{display:flex;align-items:flex-start;gap:9px;min-width:0}.icon{font-size:${Math.max(16,uiAppearance.fontSize+2)}px;line-height:1.15;flex:none;margin-top:1px}.meta-text{min-width:0;flex:1}.info{display:block;font:500 ${Math.max(10,uiAppearance.fontSize-2)}px/1.3 ${uiFontStack()};opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.site{opacity:.58;margin-top:2px}.close{display:block;margin-top:10px;padding-top:7px;border-top:1px solid rgba(255,255,255,.09);font:750 ${Math.max(16,uiAppearance.fontSize+3)}px/1.15 ${uiFontStack()};letter-spacing:.01em;text-align:center;color:#fff}
        .panel:hover{background:rgba(31,31,36,.98);border-color:rgba(255,255,255,.3);box-shadow:0 14px 40px rgba(0,0,0,.43);transform:translateY(-1px)}.panel:active{transform:translateY(0) scale(.992)}.panel:focus-visible{outline:2px solid rgba(138,185,255,.95);outline-offset:2px}.panel:disabled{opacity:.65;cursor:default;transform:none}
        @media(max-width:540px){.panel{min-width:260px;min-height:80px;padding:11px 13px 12px}.site{display:none}.close{margin-top:9px;padding-top:6px}}
      </style>
      <button class="panel" type="button" aria-label="${escapeHtml(buttonText)}">
        <span class="meta"><span class="icon" aria-hidden="true">🔔</span><span class="meta-text"><span class="info info-main">${escapeHtml(t('donePanel'))}${state.soundPlaying ? ` · ${escapeHtml(t('soundPlaying'))}` : ''}</span><span class="info site">${escapeHtml(state.site?.name || '')}</span></span></span>
        <span class="close">${escapeHtml(buttonText)}</span>
      </button>`;

    const button = shadow.querySelector('button.panel');
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        if (state.soundPlaying) {
          await chrome.runtime.sendMessage({ type: 'stop-sound', reason: 'in-page-close-button', acknowledgeCompletion: true });
        }
        acknowledgeDoneSignal();
      } catch (error) {
        button.disabled = false;
        log('Done panel action failed', { error: String(error) }, 'error');
      }
    });

    (document.body || document.documentElement).appendChild(host);
    state.donePanelHost = host;
  }

  function hideWatchHud() {
    if (state.watchHudHost) {
      try { state.watchHudHost.remove(); } catch {}
      state.watchHudHost = null;
    }
  }

  function conditionLabel(condition) {
    const map = {
      disappear: 'conditionDisappear', hidden: 'conditionHidden', textChange: 'conditionTextChange',
      enabled: 'conditionEnabled', disabled: 'conditionDisabled'
    };
    return t(map[condition] || 'conditionDisappear');
  }

  function showWatchHud() {
    hideWatchHud();
    if (!state.watching || state.mode !== 'element' || !state.rule) return;
    const host = document.createElement('div');
    host.id = '__donebell_watch_hud__';
    Object.assign(host.style, {
      position: 'fixed', bottom: '18px', right: '18px', zIndex: '2147483646', pointerEvents: 'auto'
    });
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>:host{all:initial}.p{display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:12px;background:rgba(20,20,23,.9);color:white;box-shadow:0 8px 24px rgba(0,0,0,.26);font:500 ${Math.max(10,uiAppearance.fontSize-2)}px/1.2 ${uiFontStack()};max-width:360px}.d{opacity:.75;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button{border:0;border-radius:8px;padding:6px 8px;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;font:600 ${Math.max(10,uiAppearance.fontSize-2)}px ${uiFontStack()}}button:hover{background:rgba(255,255,255,.22)}</style>
      <div class="p"><span>🔔 ${escapeHtml(t('watching'))}: ${escapeHtml(conditionLabel(state.rule.condition))}</span><span class="d">${escapeHtml(state.rule.description)}</span><button>${escapeHtml(t('cancelWatch'))}</button></div>`;
    shadow.querySelector('button').addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation(); disableWatch('hud-cancel');
    });
    (document.body || document.documentElement).appendChild(host);
    state.watchHudHost = host;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function reportComplete(trigger = {}) {
    const wasVisible = document.visibilityState === 'visible' && document.hasFocus();
    log('Reporting task complete', { wasVisible, mode: state.mode, site: state.site, trigger });
    chrome.runtime.sendMessage({
      type: 'task-complete',
      wasVisible,
      mode: state.mode,
      site: state.site,
      title: document.title,
      url: location.href,
      trigger
    }).catch((error) => log('Could not report task complete', { error: String(error) }, 'error'));
  }

  function confirmAiFinished() {
    clearTimeout(state.pendingFinishTimer);
    state.pendingFinishTimer = setTimeout(() => {
      if (!state.watching || state.mode !== 'ai') return;
      const stopPresent = Boolean(findStopControl());
      log('AI finish confirmation', { stopPresent, sawGeneration: state.sawGeneration });
      if (!stopPresent && state.sawGeneration) {
        state.sawGeneration = false;
        state.lastStopPresent = false;
        sendStatus('done');
        reportComplete({ kind: 'ai-stop-disappeared' });
      }
    }, FINISH_STABLE_MS);
  }

  function evaluateAi() {
    if (state.site?.id === 'deepseek') maybeLogDeepseekSnapshot('mutation');
    const stopPresent = Boolean(findStopControl());
    if (stopPresent) {
      clearTimeout(state.pendingFinishTimer);
      state.pendingFinishTimer = null;
      if (!state.lastStopPresent) {
        state.sawGeneration = true;
        log('AI busy/Stop control detected', { site: state.site.name });
        sendStatus('generating');
      }
      state.lastStopPresent = true;
      return;
    }
    if (state.lastStopPresent && state.sawGeneration) {
      log('AI busy/Stop control disappeared — waiting for stable finish');
      confirmAiFinished();
    }
    state.lastStopPresent = false;
  }

  function normalizeText(el) {
    return (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  function isDisabled(el) {
    if (!el) return true;
    return Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true' || el.matches?.(':disabled');
  }

  function resolveRuleElement(rule) {
    if (!rule?.selector) return null;
    try { return document.querySelector(rule.selector); } catch { return null; }
  }

  function ruleSatisfied(rule) {
    const el = resolveRuleElement(rule);
    switch (rule.condition) {
      case 'disappear':
        return !el;
      case 'hidden': {
        if (el && isVisible(el)) { rule.seenVisible = true; return false; }
        return Boolean(rule.seenVisible);
      }
      case 'textChange':
        return Boolean(el) && normalizeText(el) !== rule.initialText;
      case 'enabled': {
        if (el && isDisabled(el)) { rule.seenDisabled = true; return false; }
        return Boolean(el) && Boolean(rule.seenDisabled) && !isDisabled(el);
      }
      case 'disabled': {
        if (el && !isDisabled(el)) { rule.seenEnabled = true; return false; }
        return Boolean(el) && Boolean(rule.seenEnabled) && isDisabled(el);
      }
      default:
        return false;
    }
  }

  function evaluateElementRule() {
    if (!state.rule) return;
    if (!ruleSatisfied(state.rule)) {
      if (state.rulePendingTimer) {
        clearTimeout(state.rulePendingTimer);
        state.rulePendingTimer = null;
      }
      return;
    }
    if (state.rulePendingTimer) return;
    state.rulePendingTimer = setTimeout(() => {
      state.rulePendingTimer = null;
      if (!state.watching || state.mode !== 'element' || !state.rule) return;
      if (!ruleSatisfied(state.rule)) return;
      const completedRule = publicRule(state.rule);
      log('Manual element rule satisfied', completedRule);
      state.watching = false;
      hideWatchHud();
      unregisterWatch();
      sendStatus('done');
      reportComplete({ kind: 'element-rule', rule: completedRule });
    }, ELEMENT_STABLE_MS);
  }

  function evaluate() {
    state.evaluateTimer = null;
    if (!state.watching) return;
    if (state.mode === 'ai') evaluateAi();
    else if (state.mode === 'element') evaluateElementRule();
  }

  function scheduleEvaluate() {
    if (state.evaluateTimer) return;
    state.evaluateTimer = setTimeout(evaluate, 70);
  }

  function clearTimers() {
    clearTimeout(state.pendingFinishTimer); state.pendingFinishTimer = null;
    clearTimeout(state.rulePendingTimer); state.rulePendingTimer = null;
  }

  function enableAiWatch(autoStarted = false) {
    clearTimers();
    state.watching = true;
    state.mode = 'ai';
    state.autoStarted = Boolean(autoStarted);
    state.rule = null;
    hideWatchHud();
    let stopPresent = Boolean(findStopControl());
    if (state.site?.id === 'deepseek' && !stopPresent) {
      const action = deepseekPrimaryAction();
      const fp = deepseekActionFingerprint(action);
      if (fp) state.deepseekIdleFingerprint = fp;
      stopPresent = Boolean(findStopControl());
    }
    state.lastStopPresent = stopPresent;
    state.sawGeneration = stopPresent;
    registerWatch();
    sendStatus(stopPresent ? 'generating' : 'armed');
    log('AI watcher enabled', { site: state.site, stopPresent, url: location.href });
    if (state.site?.id === 'deepseek') maybeLogDeepseekSnapshot('watch-enabled');
    scheduleEvaluate();
  }

  function disableWatch(reason = 'manual') {
    clearTimers();
    state.watching = false;
    state.mode = null;
    state.rule = null;
    state.lastStopPresent = false;
    state.sawGeneration = false;
    state.deepseekSnapshotSignature = null;
    state.deepseekIdleFingerprint = null;
    state.autoStarted = false;
    hideWatchHud();
    unregisterWatch();
    sendStatus('off');
    log('Watcher disabled', { reason, url: location.href });
  }

  function stableId(id) {
    if (!id || id.length > 80 || id.startsWith('__donebell')) return false;
    const digits = (id.match(/\d/g) || []).length;
    return digits <= Math.max(3, Math.floor(id.length * 0.35));
  }

  function cssAttrEscape(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
  }

  function uniqueSelector(selector, target) {
    try {
      const nodes = document.querySelectorAll(selector);
      return nodes.length === 1 && nodes[0] === target;
    } catch { return false; }
  }

  function selectorFor(el) {
    if (!(el instanceof Element)) throw new Error('Invalid selected element');
    const tag = el.tagName.toLowerCase();
    if (stableId(el.id)) {
      const sel = `#${CSS.escape(el.id)}`;
      if (uniqueSelector(sel, el)) return sel;
    }

    const attrs = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'aria-label', 'name', 'title'];
    for (const attr of attrs) {
      const value = el.getAttribute(attr);
      if (!value || value.length > 160) continue;
      const sel = `${tag}[${attr}="${cssAttrEscape(value)}"]`;
      if (uniqueSelector(sel, el)) return sel;
    }

    const classes = [...el.classList].filter((c) => c && c.length < 48 && !/^(__donebell|css-|sc-)/i.test(c)).slice(0, 3);
    if (classes.length) {
      const sel = `${tag}.${classes.map((c) => CSS.escape(c)).join('.')}`;
      if (uniqueSelector(sel, el)) return sel;
    }

    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && depth < 6; depth += 1, node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      if (stableId(node.id)) {
        part = `#${CSS.escape(node.id)}`;
        parts.unshift(part);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((x) => x.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const candidate = parts.join(' > ');
      if (uniqueSelector(candidate, el)) return candidate;
    }
    return parts.join(' > ');
  }

  function descriptionFor(el) {
    const label = labelOf(el);
    const text = normalizeText(el);
    const useful = label || text || `<${el.tagName.toLowerCase()}>`;
    return useful.slice(0, 100);
  }

  function removePicker() {
    const p = state.picker;
    if (!p) return;
    document.removeEventListener('mousemove', p.move, true);
    document.removeEventListener('click', p.click, true);
    document.removeEventListener('keydown', p.keydown, true);
    try { p.overlay.remove(); } catch {}
    try { p.banner.remove(); } catch {}
    state.picker = null;
  }

  function startElementPicker(condition) {
    removePicker();
    const overlay = document.createElement('div');
    overlay.id = '__donebell_picker_overlay__';
    Object.assign(overlay.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '2147483646', border: '2px solid #f59e0b',
      borderRadius: '5px', background: 'rgba(245,158,11,.10)', boxSizing: 'border-box', display: 'none'
    });
    const banner = document.createElement('div');
    banner.id = '__donebell_picker_banner__';
    banner.textContent = `🔔 ${t('pickerChoose')} · ${t('pickerEscape')}`;
    Object.assign(banner.style, {
      position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483647',
      padding: '10px 14px', borderRadius: '12px', background: 'rgba(20,20,23,.96)', color: '#fff',
      boxShadow: '0 10px 30px rgba(0,0,0,.3)', font: `600 ${uiAppearance.fontSize}px ${uiFontStack()}`,
      pointerEvents: 'none', maxWidth: 'calc(100vw - 28px)', textAlign: 'center'
    });
    (document.body || document.documentElement).append(overlay, banner);

    let current = null;
    const move = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || target === overlay || target === banner || target.closest?.('#__donebell_picker_banner__')) return;
      current = target;
      const r = target.getBoundingClientRect();
      Object.assign(overlay.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const click = (event) => {
      if (!current) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const target = current;
      try {
        const selector = selectorFor(target);
        if (!selector) throw new Error('Could not build selector');
        const rule = {
          condition,
          selector,
          description: descriptionFor(target),
          initialText: normalizeText(target),
          initialDisabled: isDisabled(target),
          initialVisible: isVisible(target),
          seenDisabled: isDisabled(target),
          seenEnabled: !isDisabled(target),
          seenVisible: isVisible(target)
        };
        removePicker();
        clearTimers();
        state.watching = true;
        state.mode = 'element';
        state.rule = rule;
        state.lastStopPresent = false;
        state.sawGeneration = false;
        registerWatch();
        sendStatus('armed');
        showWatchHud();
        log('Manual element watcher armed', publicRule(rule));
        scheduleEvaluate();
      } catch (error) {
        log('Element picker failed', { error: String(error) }, 'error');
        removePicker();
      }
    };
    const keydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); removePicker();
        log('Element picker cancelled');
      }
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', keydown, true);
    state.picker = { overlay, banner, move, click, keydown };
    log('Element picker started', { condition });
  }

  chrome.storage.local.get(['uiLanguage','appearanceSettings']).then(({ uiLanguage: setting, appearanceSettings }) => {
    uiLanguage = I18N.resolveLanguage(setting || 'auto', navigator.language);
    uiAppearance = normalizeUiAppearance(appearanceSettings);
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    let rerender = false;
    if (changes.uiLanguage) { uiLanguage = I18N.resolveLanguage(changes.uiLanguage.newValue || 'auto', navigator.language); rerender = true; }
    if (changes.appearanceSettings) { uiAppearance = normalizeUiAppearance(changes.appearanceSettings.newValue); rerender = true; }
    if (rerender && state.donePanelHost) renderDonePanel();
    if (rerender && state.watchHudHost) showWatchHud();
  });

  const observer = new MutationObserver(scheduleEvaluate);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['aria-label', 'title', 'data-testid', 'data-test', 'data-cy', 'disabled', 'aria-disabled', 'aria-busy', 'hidden', 'class', 'style']
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'ping-donebell') {
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version }); return;
    }
    if (message?.type === 'get-watch-status') {
      sendResponse({
        ok: true, watching: state.watching, mode: state.mode, site: state.site,
        stopPresent: Boolean(findStopControl()), sawGeneration: state.sawGeneration,
        rule: state.rule ? publicRule(state.rule) : null, soundPlaying: state.soundPlaying, completionActive: state.completionActive,
        visibility: document.visibilityState, focused: document.hasFocus(), url: location.href, autoStarted: state.autoStarted
      });
      return;
    }
    if (message?.type === 'set-ai-watch') {
      if (message.enabled) enableAiWatch(false); else disableWatch('popup');
      sendResponse({ ok: true, watching: state.watching, mode: state.mode }); return;
    }
    if (message?.type === 'disable-watch') {
      disableWatch(message.reason || 'popup'); sendResponse({ ok: true }); return;
    }
    if (message?.type === 'start-element-picker') {
      startElementPicker(message.condition || 'disappear'); sendResponse({ ok: true }); return;
    }
    if (message?.type === 'show-completion-ui') {
      state.completionSettings = message.settings || {};
      // Defense in depth: if the page is already visibly focused and the user
      // chose stop-on-focus, a stale/racing completion message must not paint a
      // panel that immediately needs acknowledgement.
      if (state.completionSettings.stopOnTabFocus && document.visibilityState === 'visible' && document.hasFocus() && !(message.autoFocusedByDoneBell && !state.completionSettings.stopOnAutoFocus)) {
        state.completionActive = false;
        state.soundPlaying = false;
        stopTitleFlash(true);
        hideDonePanel();
        if (state.watching && state.mode === 'ai') sendStatus('armed'); else sendStatus('off');
        chrome.runtime.sendMessage({ type: 'completion-acknowledged' }).catch(() => {});
        log('Completion UI suppressed because finished tab is already active');
        sendResponse({ ok: true, suppressed: true }); return;
      }
      state.completionActive = true;
      state.soundPlaying = Boolean(message.soundPlaying);
      if (state.completionSettings.flashTitle) startTitleFlash();
      if (state.completionSettings.inPagePanel) renderDonePanel();
      sendResponse({ ok: true }); return;
    }
    if (message?.type === 'restore-watch') {
      if (state.watching) { sendResponse({ ok: true, alreadyWatching: true }); return; }
      const info = message.info || {};
      if (info.mode === 'ai') {
        enableAiWatch(Boolean(info.autoStarted));
        log('AI watcher restored after same-origin reload/navigation', { url: location.href, site: state.site });
        sendResponse({ ok: true, restored: true }); return;
      }
      if (info.mode === 'element' && info.rule?.selector) {
        const el = resolveRuleElement(info.rule);
        state.rule = { ...info.rule, seenVisible: Boolean(el && isVisible(el)), seenDisabled: Boolean(el && isDisabled(el)), seenEnabled: Boolean(el && !isDisabled(el)) };
        state.watching = true; state.mode = 'element'; registerWatch(); sendStatus('armed'); showWatchHud(); scheduleEvaluate();
        log('Element watcher restored after same-origin reload/navigation', publicRule(state.rule));
        sendResponse({ ok: true, restored: true }); return;
      }
      sendResponse({ ok: false, error: 'No restorable watch state' }); return;
    }
    if (message?.type === 'auto-watch-arm') {
      if (!state.watching && state.site?.knownAi && (!message.siteId || message.siteId === state.site.id)) {
        enableAiWatch(true); log('AI watcher auto-armed', { site: state.site, url: location.href });
      }
      sendResponse({ ok: true, watching: state.watching, autoStarted: state.autoStarted }); return;
    }
    if (message?.type === 'disable-auto-watch') {
      if (state.watching && state.mode === 'ai' && state.autoStarted && (!message.siteId || message.siteId === state.site.id)) disableWatch('auto-watch-disabled');
      sendResponse({ ok: true, watching: state.watching, autoStarted: state.autoStarted }); return;
    }
    if (message?.type === 'sound-playback-state') {
      state.soundPlaying = Boolean(message.playing);
      if (!updateDonePanelContent() && state.completionSettings?.inPagePanel && state.completionActive) renderDonePanel();
      sendResponse({ ok: true }); return;
    }
    if (message?.type === 'dismiss-completion') {
      acknowledgeDoneSignal(); sendResponse({ ok: true });
    }
  });

  setInterval(() => {
    if (location.href !== state.lastLocation) {
      const previous = state.lastLocation;
      state.lastLocation = location.href;
      state.site = siteIdentity();
      log('SPA location changed', { previous, current: state.lastLocation, watchPreserved: state.watching });
      if (state.watching && state.mode === 'ai' && state.site?.id === 'deepseek' && !state.sawGeneration) {
        const fp = deepseekActionFingerprint(deepseekPrimaryAction());
        if (fp) state.deepseekIdleFingerprint = fp;
      }
    }
    if (state.watching) scheduleEvaluate();
  }, 1000);

  async function maybeAutoArmOnLoad() {
    if (!state.site?.knownAi || !SITE_API) return;
    try {
      const data = await chrome.storage.local.get('siteSettings');
      const cfg = SITE_API.normalizeSiteSettings(data.siteSettings?.[state.site.id]);
      if (cfg.autoWatch && !state.watching) { enableAiWatch(true); log('AI watcher auto-armed on page load', { site: state.site, url: location.href }); }
    } catch (error) { log('Could not evaluate auto-watch on page load', { error: String(error), site: state.site }, 'error'); }
  }
  setTimeout(() => { maybeAutoArmOnLoad().catch(() => {}); }, 150);
  log('DoneBell content script ready', { site: state.site, url: location.href, version: chrome.runtime.getManifest().version });
})();
