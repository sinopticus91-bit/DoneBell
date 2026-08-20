let audioContext = null;
let masterGain = null;
let currentAudio = null;
let currentPlaybackId = 0;
let currentReason = null;
let currentOwnerTabId = null;
let activeOscillators = new Set();
let finishTimer = null;
let repeatTimer = null;
let currentVolume = 1;

function log(message, details = null, level = 'info') {
  chrome.runtime.sendMessage({ type: 'debug-log', source: 'offscreen', level, message, details }).catch(() => {});
}

function notifyPlaybackState(playing, ownerTabId, reason) {
  if (!Number.isInteger(ownerTabId)) return;
  chrome.runtime.sendMessage({
    type: 'audio-playback-state', playing: Boolean(playing), ownerTabId, reason: reason || null
  }).catch(() => {});
}

function getAudioContext() {
  if (!audioContext) audioContext = new AudioContext();
  if (!masterGain) {
    masterGain = audioContext.createGain();
    masterGain.gain.value = currentVolume;
    masterGain.connect(audioContext.destination);
  }
  return audioContext;
}

function setLiveVolume(value) {
  currentVolume = Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : currentVolume;
  if (currentAudio) currentAudio.volume = currentVolume;
  if (audioContext && masterGain) {
    try { masterGain.gain.setValueAtTime(currentVolume, audioContext.currentTime); } catch { masterGain.gain.value = currentVolume; }
  }
  return currentVolume;
}

function clearTimers() {
  if (finishTimer !== null) { clearTimeout(finishTimer); finishTimer = null; }
  if (repeatTimer !== null) { clearTimeout(repeatTimer); repeatTimer = null; }
}

function stopOscillators() {
  for (const osc of activeOscillators) {
    try { osc.stop(); } catch {}
    try { osc.disconnect(); } catch {}
  }
  activeOscillators.clear();
}

function stopCurrentPlayback(reason = 'manual-stop', shouldLog = true) {
  const hadPlayback = Boolean(currentAudio) || activeOscillators.size > 0 || finishTimer !== null || repeatTimer !== null;
  const previousReason = currentReason;
  const previousOwnerTabId = currentOwnerTabId;
  currentPlaybackId += 1;
  clearTimers();

  if (currentAudio) {
    try { currentAudio.pause(); } catch {}
    try { currentAudio.currentTime = 0; } catch {}
    try { currentAudio.removeAttribute('src'); currentAudio.load(); } catch {}
    currentAudio = null;
  }
  stopOscillators();
  currentReason = null;
  currentOwnerTabId = null;
  if (hadPlayback) notifyPlaybackState(false, previousOwnerTabId, reason);
  if (hadPlayback && shouldLog) log('Sound stopped', { reason, previousReason });
  return hadPlayback;
}

function ring(ctx, when, frequency, duration, volume, playbackId) {
  if (playbackId !== currentPlaybackId) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, when);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.985, when + duration);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain); gain.connect(masterGain || ctx.destination);
  activeOscillators.add(osc);
  osc.addEventListener('ended', () => {
    activeOscillators.delete(osc);
    try { osc.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  }, { once: true });
  osc.start(when); osc.stop(when + duration + 0.02);
}

async function playBuiltInPattern(volume, playbackId) {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  if (playbackId !== currentPlaybackId) return;
  const start = ctx.currentTime + 0.04;
  const notes = [784, 1046.5, 1318.5];
  setLiveVolume(volume);
  for (let round = 0; round < 2; round += 1) {
    const base = start + round * 0.72;
    notes.forEach((frequency, index) => {
      ring(ctx, base + index * 0.14, frequency, 0.32, 0.24, playbackId);
      ring(ctx, base + index * 0.14, frequency * 2, 0.18, 0.055, playbackId);
    });
  }
}

async function startBuiltInBell(volume, reason, playbackId, repeat) {
  const cycle = async () => {
    if (playbackId !== currentPlaybackId) return;
    await playBuiltInPattern(currentVolume, playbackId);
    if (playbackId !== currentPlaybackId) return;
    if (repeat) {
      repeatTimer = setTimeout(() => {
        repeatTimer = null;
        cycle().catch((error) => log('Repeated built-in bell failed', { error: String(error) }, 'error'));
      }, 3200);
    } else {
      finishTimer = setTimeout(() => {
        if (playbackId !== currentPlaybackId) return;
        finishTimer = null;
        const owner = currentOwnerTabId;
        currentReason = null; currentOwnerTabId = null;
        notifyPlaybackState(false, owner, 'sound-ended');
        log('Built-in bell finished', { reason });
      }, 1800);
    }
  };
  await cycle();
}

function startCustomSound(dataUrl, volume, reason, playbackId, repeat) {
  if (!dataUrl || typeof dataUrl !== 'string') throw new Error('Custom sound data is missing');
  const audio = new Audio();
  currentAudio = audio;
  audio.src = dataUrl;
  audio.volume = currentVolume;
  audio.preload = 'auto';
  audio.loop = Boolean(repeat);

  audio.addEventListener('ended', () => {
    if (playbackId !== currentPlaybackId || currentAudio !== audio) return;
    currentAudio = null;
    const owner = currentOwnerTabId;
    currentReason = null; currentOwnerTabId = null;
    notifyPlaybackState(false, owner, 'sound-ended');
    log('Custom sound finished', { reason });
  }, { once: true });

  const fallback = (error) => {
    if (playbackId !== currentPlaybackId || currentAudio !== audio) return;
    currentAudio = null;
    log('Custom sound failed; falling back to built-in bell', { error: String(error), reason }, 'error');
    startBuiltInBell(volume, reason, playbackId, repeat).catch((fallbackError) => {
      log('Built-in fallback crashed', { error: String(fallbackError), reason }, 'error');
    });
  };
  audio.addEventListener('error', () => fallback(audio.error ? `Audio error code ${audio.error.code}` : 'Audio element error'), { once: true });
  audio.play().catch(fallback);
}

async function startSound(reason, sound = {}, ownerTabId = null) {
  stopCurrentPlayback('replaced-by-new-playback', true);
  const playbackId = currentPlaybackId;
  currentReason = reason;
  currentOwnerTabId = Number.isInteger(ownerTabId) ? ownerTabId : null;
  notifyPlaybackState(true, currentOwnerTabId, reason);
  const volume = Number.isFinite(Number(sound.volume)) ? Math.max(0, Math.min(1, Number(sound.volume))) : 1;
  setLiveVolume(volume);
  const repeat = Boolean(sound.repeat);

  if (sound.mode === 'custom' && sound.dataUrl) {
    log('Playing custom sound', { reason, name: sound.name || 'custom', volume, repeat, playbackId });
    startCustomSound(sound.dataUrl, volume, reason, playbackId, repeat);
    return;
  }
  log('Playing built-in bell', { reason, volume, repeat, playbackId });
  await startBuiltInBell(volume, reason, playbackId, repeat);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;
  if (message?.type === 'play-sound') {
    startSound(message.reason || 'unknown', message.sound || {}, message.ownerTabId ?? null)
      .then(() => sendResponse({ ok: true, started: true }))
      .catch((error) => { log('Audio playback crashed', { error: String(error) }, 'error'); sendResponse({ ok: false, error: String(error) }); });
    return true;
  }
  if (message?.type === 'stop-sound') {
    const stopped = stopCurrentPlayback(message.reason || 'manual-stop', true);
    sendResponse({ ok: true, stopped });
    return;
  }
  if (message?.type === 'set-volume') {
    const volume = setLiveVolume(message.volume);
    sendResponse({ ok: true, volume, playing: Boolean(currentAudio) || activeOscillators.size > 0 || repeatTimer !== null || finishTimer !== null });
  }
});
