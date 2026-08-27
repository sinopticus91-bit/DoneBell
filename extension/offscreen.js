let audioContext = null;
let masterGain = null;
let currentAudio = null;
let currentPlaybackId = 0;
let currentReason = null;
let currentOwnerTabId = null;
let activeOscillators = new Set();
let finishTimer = null;
let repeatTimer = null;
let durationTimer = null;
let currentObjectUrl = null;
let currentVolume = 1;
let currentTrackName = null;
let currentTrackId = null;
let currentSoundMode = null;
let currentPaused = false;
let currentStartedAt = null;
let currentAudioScope = null;
let currentSiteId = null;
const AUDIO_DB_NAME='DoneBellAudio',AUDIO_DB_VERSION=1,AUDIO_STORE='tracks';
function openAudioDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(AUDIO_DB_NAME,AUDIO_DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(AUDIO_STORE))db.createObjectStore(AUDIO_STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not open audio database'));});}
async function audioDbGet(id){const db=await openAudioDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,'readonly'),req=tx.objectStore(AUDIO_STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('Could not load playlist track'));});}finally{db.close();}}
async function playlistTrackFromCandidates(candidates){
  const list=Array.isArray(candidates)?candidates.filter(x=>x&&typeof x.id==='string'):[];
  for(const item of list){
    const record=await audioDbGet(item.id);
    if(record?.blob instanceof Blob)return{...record,name:record.name||item.name||'playlist track'};
  }
  return null;
}


function log(message, details = null, level = 'info') {
  chrome.runtime.sendMessage({ type: 'debug-log', source: 'offscreen', level, message, details }).catch(() => {});
}

function notifyPlaybackState(playing, ownerTabId, reason) {
  chrome.runtime.sendMessage({
    type:'audio-playback-state',
    playing:Boolean(playing),
    ownerTabId:Number.isInteger(ownerTabId)?ownerTabId:null,
    reason:reason||null,
    trackName:currentTrackName,
    trackId:currentTrackId,
    soundMode:currentSoundMode,
    paused:Boolean(currentPaused),
    startedAt:currentStartedAt,
    audioScope:currentAudioScope,
    siteId:currentSiteId
  }).catch(()=>{});
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
  if (durationTimer !== null) { clearTimeout(durationTimer); durationTimer = null; }
}

function stopOscillators() {
  for (const osc of activeOscillators) {
    try { osc.stop(); } catch {}
    try { osc.disconnect(); } catch {}
  }
  activeOscillators.clear();
}

function stopCurrentPlayback(reason = 'manual-stop', shouldLog = true) {
  const hadPlayback = Boolean(currentAudio) || Boolean(currentObjectUrl) || activeOscillators.size > 0 || finishTimer !== null || repeatTimer !== null || durationTimer !== null;
  const previousReason = currentReason;
  const previousOwnerTabId = currentOwnerTabId;
  currentPlaybackId += 1;
  clearTimers();

  if (currentAudio) {
    try { currentAudio.pause(); } catch {}
    try { currentAudio.currentTime = 0; } catch {}
    try { currentAudio.removeAttribute('src'); currentAudio.load(); } catch {}
    currentAudio = null;
    if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch {} currentObjectUrl = null; }
  }
  if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch {} currentObjectUrl = null; }
  stopOscillators();
  if (hadPlayback) notifyPlaybackState(false, previousOwnerTabId, reason);
  currentReason = null;
  currentOwnerTabId = null;
  currentTrackName = null;
  currentTrackId = null;
  currentSoundMode = null;
  if('mediaSession' in navigator){try{navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';}catch{}}
  currentPaused = false;
  currentStartedAt = null;
  currentAudioScope = null;
  currentSiteId = null;
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
        if (durationTimer !== null) { clearTimeout(durationTimer); durationTimer = null; }
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
  audio.addEventListener('loadedmetadata',()=>syncMediaSessionState(true));
  audio.addEventListener('durationchange',()=>syncMediaSessionState(true));
  audio.addEventListener('timeupdate',()=>syncMediaSessionState(false));
  audio.src = dataUrl;
  audio.volume = currentVolume;
  audio.preload = 'auto';
  audio.loop = Boolean(repeat);

  audio.addEventListener('ended', () => {
    if (playbackId !== currentPlaybackId || currentAudio !== audio) return;
    const owner = currentOwnerTabId;
    const endedTrackId = currentTrackId;
    const endedTrackName = currentTrackName;
    const endedReason = currentReason;
    const endedMode = currentSoundMode;
    currentAudio = null;
    if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch {} currentObjectUrl = null; }
    if (durationTimer !== null) { clearTimeout(durationTimer); durationTimer = null; }
    currentReason = null; currentOwnerTabId = null;
    notifyPlaybackState(false, owner, 'sound-ended');
    log('Custom sound finished', { reason, trackName: endedTrackName });
    chrome.runtime.sendMessage({
      type:'audio-track-ended',
      ownerTabId:Number.isInteger(owner)?owner:null,
      trackId:endedTrackId||null,
      trackName:endedTrackName||null,
      soundMode:endedMode||null,
      reason:endedReason||reason||null
    }).catch(()=>{});
  }, { once: true });

  const fallback = (error) => {
    if (playbackId !== currentPlaybackId || currentAudio !== audio) return;
    currentAudio = null;
    if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch {} currentObjectUrl = null; }
    log('Custom sound failed; falling back to built-in bell', { error: String(error), reason }, 'error');
    startBuiltInBell(volume, reason, playbackId, repeat).catch((fallbackError) => {
      log('Built-in fallback crashed', { error: String(fallbackError), reason }, 'error');
    });
  };
  audio.addEventListener('error', () => fallback(audio.error ? `Audio error code ${audio.error.code}` : 'Audio element error'), { once: true });
  audio.play().catch(fallback);
}

function armDurationLimit(durationMs, playbackId) {
  if (!Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) return;
  durationTimer = setTimeout(() => {
    durationTimer = null;
    if (playbackId !== currentPlaybackId) return;
    stopCurrentPlayback('duration-limit', true);
  }, Math.max(250, Number(durationMs)));
}

async function startPlaylistSound(sound, volume, reason, playbackId, repeat) {
  const track = await playlistTrackFromCandidates(sound.playlistCandidates);
  if (!track?.blob) throw new Error('Playlist is empty or unavailable in audio database');
  currentObjectUrl = URL.createObjectURL(track.blob);
  currentTrackName = track.name || 'playlist track';
  currentTrackId = track.id || null;
  currentSoundMode = 'playlist';
  setMediaSessionMetadata();
  notifyPlaybackState(true,currentOwnerTabId,reason);
  log('Playlist track selected', { reason, name: currentTrackName, size: Number(track.size)||track.blob.size, playbackId });
  startCustomSound(currentObjectUrl, volume, reason, playbackId, repeat);
}

async function startSound(reason, sound = {}, ownerTabId = null) {
  stopCurrentPlayback('replaced-by-new-playback', true);
  const playbackId = currentPlaybackId;
  currentReason = reason;
  currentOwnerTabId = Number.isInteger(ownerTabId) ? ownerTabId : null;
  currentTrackName = sound.mode === 'playlist' ? (sound.name || 'Playlist') : (sound.name || 'Built-in bell');
  currentSoundMode = sound.mode || 'builtin';
  currentPaused = false;
  currentStartedAt = Date.now();
  currentAudioScope = sound.audioScope || null;
  currentSiteId = sound.siteId || null;
  notifyPlaybackState(true, currentOwnerTabId, reason);
  const volume = Number.isFinite(Number(sound.volume)) ? Math.max(0, Math.min(1, Number(sound.volume))) : 1;
  setLiveVolume(volume);
  const repeat = Boolean(sound.repeat);
  const durationMs = Number.isFinite(Number(sound.durationMs)) && Number(sound.durationMs) > 0 ? Number(sound.durationMs) : null;
  if (durationMs) armDurationLimit(durationMs, playbackId);

  if (sound.mode === 'playlist') {
    try { await startPlaylistSound(sound, volume, reason, playbackId, repeat); return; }
    catch (error) { log('Playlist playback failed; falling back to built-in bell', { error: String(error), reason }, 'error'); await startBuiltInBell(volume, reason, playbackId, repeat); return; }
  }
  if (sound.mode === 'custom' && sound.dataUrl) {
    log('Playing custom sound', { reason, name: sound.name || 'custom', volume, repeat, playbackId, durationMs });
    startCustomSound(sound.dataUrl, volume, reason, playbackId, repeat);
    return;
  }
  log('Playing built-in bell', { reason, volume, repeat, playbackId, durationMs });
  await startBuiltInBell(volume, reason, playbackId, repeat);
}


function audioState() {
  const playing = Boolean(currentAudio) || activeOscillators.size > 0 || repeatTimer !== null || finishTimer !== null || durationTimer !== null;
  const position = currentAudio && Number.isFinite(currentAudio.currentTime) ? Math.max(0,currentAudio.currentTime) : 0;
  const duration = currentAudio && Number.isFinite(currentAudio.duration) && currentAudio.duration > 0 ? currentAudio.duration : 0;
  return {playing,ownerTabId:currentOwnerTabId,reason:currentReason,trackName:currentTrackName,trackId:currentTrackId,soundMode:currentSoundMode,paused:Boolean(currentPaused),startedAt:currentStartedAt,audioScope:currentAudioScope,siteId:currentSiteId,volume:currentVolume,position,duration,seekable:Boolean(currentAudio&&duration>0)};
}

let lastMediaPositionSyncAt = 0;
function syncMediaSessionState(force=false){
  if(!('mediaSession' in navigator)) return;
  try{navigator.mediaSession.playbackState=currentAudio?(currentPaused?'paused':'playing'):'none';}catch{}
  if(!currentAudio)return;
  const now=Date.now();
  if(!force&&now-lastMediaPositionSyncAt<500)return;
  lastMediaPositionSyncAt=now;
  const duration=Number(currentAudio.duration),position=Number(currentAudio.currentTime);
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(position))return;
  try{navigator.mediaSession.setPositionState({duration,playbackRate:Number.isFinite(currentAudio.playbackRate)&&currentAudio.playbackRate>0?currentAudio.playbackRate:1,position:Math.max(0,Math.min(duration,position))});}catch{}
}
function setMediaSessionMetadata(){
  if(!('mediaSession' in navigator))return;
  try{navigator.mediaSession.metadata=currentTrackName?new MediaMetadata({title:currentTrackName,artist:'DoneBell',album:'DoneBell playlist'}):null;}catch{}
  syncMediaSessionState(true);
}
async function seekCurrentPlayback(seconds){
  if(!currentAudio)return{ok:false,unsupported:true,state:audioState()};
  const duration=Number(currentAudio.duration);
  if(!Number.isFinite(duration)||duration<=0)return{ok:false,unsupported:true,state:audioState()};
  const target=Math.max(0,Math.min(duration,Number(seconds)||0));
  try{
    currentAudio.currentTime=target;
    syncMediaSessionState(true);
    log('Audio seeked',{trackName:currentTrackName,position:target,duration});
    return{ok:true,position:target,duration,state:audioState()};
  }catch(error){return{ok:false,error:String(error),state:audioState()};}
}
function installMediaSessionHandlers(){
  if(!('mediaSession' in navigator))return;
  const set=(action,handler)=>{try{navigator.mediaSession.setActionHandler(action,handler);}catch{}};
  set('play',()=>{resumeCurrentPlayback().catch(()=>{});});
  set('pause',()=>{pauseCurrentPlayback().catch(()=>{});});
  set('nexttrack',()=>{chrome.runtime.sendMessage({type:'media-session-next'}).catch(()=>{});});
  set('previoustrack',()=>{chrome.runtime.sendMessage({type:'media-session-previous'}).catch(()=>{});});
  set('stop',()=>{chrome.runtime.sendMessage({type:'media-session-stop'}).catch(()=>{});});
  set('seekto',(d)=>{if(Number.isFinite(d?.seekTime))seekCurrentPlayback(d.seekTime).catch(()=>{});});
  set('seekforward',(d)=>{const step=Number.isFinite(d?.seekOffset)?d.seekOffset:10;seekCurrentPlayback((currentAudio?.currentTime||0)+step).catch(()=>{});});
  set('seekbackward',(d)=>{const step=Number.isFinite(d?.seekOffset)?d.seekOffset:10;seekCurrentPlayback((currentAudio?.currentTime||0)-step).catch(()=>{});});
}
installMediaSessionHandlers();

async function pauseCurrentPlayback() {
  if (!currentAudio || currentPaused) return {ok:false,unsupported:!currentAudio,paused:Boolean(currentPaused),state:audioState()};
  try { currentAudio.pause(); currentPaused=true; syncMediaSessionState(true); notifyPlaybackState(true,currentOwnerTabId,currentReason); log('Audio paused',{trackName:currentTrackName}); return {ok:true,paused:true,state:audioState()}; }
  catch(error){ return {ok:false,error:String(error),state:audioState()}; }
}
async function resumeCurrentPlayback() {
  if (!currentAudio || !currentPaused) return {ok:false,unsupported:!currentAudio,paused:Boolean(currentPaused),state:audioState()};
  try { await currentAudio.play(); currentPaused=false; syncMediaSessionState(true); notifyPlaybackState(true,currentOwnerTabId,currentReason); log('Audio resumed',{trackName:currentTrackName}); return {ok:true,paused:false,state:audioState()}; }
  catch(error){ return {ok:false,error:String(error),state:audioState()}; }
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
  if (message?.type === 'get-audio-state') { sendResponse({ok:true,state:audioState()}); return; }
  if (message?.type === 'pause-sound') { pauseCurrentPlayback().then(sendResponse); return true; }
  if (message?.type === 'resume-sound') { resumeCurrentPlayback().then(sendResponse); return true; }
  if (message?.type === 'set-volume') {
    const volume = setLiveVolume(message.volume);
    sendResponse({ ok: true, volume, playing: Boolean(currentAudio) || activeOscillators.size > 0 || repeatTimer !== null || finishTimer !== null });
    return;
  }
  if (message?.type === 'set-repeat-one') {
    const repeat = Boolean(message.repeat);
    if (currentAudio) currentAudio.loop = repeat;
    sendResponse({ ok: true, repeat, state: audioState() });
    return;
  }
  if (message?.type === 'seek-sound') {
    seekCurrentPlayback(message.position).then(sendResponse);
    return true;
  }
  if (message?.type === 'adopt-current-audio-as-player') {
    if (!currentAudio || currentSoundMode !== 'playlist' || !currentTrackId) {
      sendResponse({ ok:false, unavailable:true, state:audioState() });
      return;
    }
    currentReason = 'player-adopted-completion';
    currentOwnerTabId = null;
    currentAudioScope = 'player';
    currentSiteId = null;
    currentAudio.loop = Boolean(message.repeatOne);
    notifyPlaybackState(true, null, currentReason);
    syncMediaSessionState(true);
    log('Completion track adopted by full player', {
      trackName: currentTrackName,
      trackId: currentTrackId,
      repeatOne: Boolean(message.repeatOne)
    });
    sendResponse({ ok:true, state:audioState() });
    return;
  }
});
