/* 🎤 Voice to text for messages: speak on your phone, the words land in the box, you check and send.
   Uses the browser's own speech recognition (Chrome / Android, Safari / iPhone). Nothing extra to set up. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function voiceLang() { try { return localStorage.getItem('sf_voice_lang') || 'en-IN'; } catch { return 'en-IN'; } }

// box: the textarea · onDone(text): called after you stop talking (e.g. to improve with AI)
function voiceBar(id) {
  if (!SR) return `<div class="voice-bar off" id="${id}"><span class="muted">🎤 Voice typing isn’t supported in this browser — tap the mic on your phone keyboard instead.</span></div>`;
  const lang = voiceLang();
  return `<div class="voice-bar" id="${id}">
    <button type="button" class="mic" data-mic aria-label="Speak your message"><span class="mic-dot"></span><b>🎤 Speak</b></button>
    <select data-lang aria-label="Language you speak"><option value="en-IN" ${lang === 'en-IN' ? 'selected' : ''}>English / Hinglish</option><option value="hi-IN" ${lang === 'hi-IN' ? 'selected' : ''}>हिन्दी</option></select>
    <span class="voice-live muted" data-live></span>
  </div>`;
}
function wireVoice(id, box, onDone) {
  const bar = document.getElementById(id); if (!bar || !SR) return;
  const btn = bar.querySelector('[data-mic]'), live = bar.querySelector('[data-live]'), sel = bar.querySelector('[data-lang]');
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  let rec = null, base = '', said = '', wanted = false, gotAny = false;
  sel.onchange = () => { try { localStorage.setItem('sf_voice_lang', sel.value); } catch { /* ignore */ } };
  // a big live panel, so you see every word as you speak
  let panel = bar.querySelector('.voice-panel');
  if (!panel) { panel = document.createElement('div'); panel.className = 'voice-panel hidden'; panel.innerHTML = '<div class="vp-dot"></div><div class="vp-text" data-vp>Listening… start speaking</div>'; bar.appendChild(panel); }
  const vp = panel.querySelector('[data-vp]');
  const show = (txt) => { const t = [base, txt].filter(Boolean).join(' '); box.value = t; vp.textContent = txt || 'Listening… start speaking'; };
  const setUi = (on) => { bar.classList.toggle('rec', on); panel.classList.toggle('hidden', !on); btn.querySelector('b').textContent = on ? '■ Stop' : '🎤 Speak'; };
  const ERR = {
    'not-allowed': 'Microphone blocked — allow the mic for this site (lock icon in the address bar), then tap Speak again.',
    'service-not-allowed': 'This browser does not allow voice typing here — open the app in Chrome or Safari.',
    'audio-capture': 'No microphone found.',
    network: 'The voice service is not reachable in this browser (Brave and in-app browsers block it) — open in Chrome or Safari, or use the keyboard mic.',
    'no-speech': 'Didn’t hear anything — speak a little louder or closer.',
    'language-not-supported': 'This language is not supported here — switch to English / Hinglish.',
  };
  function start() {
    rec = new SR(); rec.lang = sel.value; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.continuous = !mobile; // phones behave better with short sessions that we restart
    const before = said;
    rec.onresult = (e) => {
      gotAny = true;
      // rebuild from all results each time: works the same on Chrome desktop, Android and Safari
      let fin = '', interim = '';
      for (let i = 0; i < e.results.length; i++) { const t = e.results[i][0].transcript.trim(); if (!t) continue; if (e.results[i].isFinal) fin += (fin ? ' ' : '') + t; else interim += (interim ? ' ' : '') + t; }
      said = [before, fin].filter(Boolean).join(' ');
      show([said, interim].filter(Boolean).join(' '));
    };
    rec.onerror = (e) => { if (e.error === 'no-speech' && wanted) return; if (e.error === 'aborted') return; wanted = false; live.textContent = ERR[e.error] || 'Voice error: ' + e.error; };
    rec.onend = () => {
      if (wanted) { try { start(); return; } catch { /* fall through */ } } // Chrome stops after a pause: keep listening until Stop
      setUi(false); box.value = [base, said].filter(Boolean).join(' ');
      if (said) { live.textContent = '✓ Got it — check the text, then send'; if (onDone) onDone(said); }
      else if (!live.textContent || live.textContent.startsWith('Listening')) live.textContent = gotAny ? '' : 'Didn’t catch anything — tap Speak and try again.';
    };
    try { rec.start(); } catch (err) { wanted = false; setUi(false); live.textContent = 'Could not start the microphone'; }
  }
  btn.onclick = () => {
    if (wanted) { wanted = false; try { rec && rec.stop(); } catch { /* ignore */ } return; }
    base = box.value.trim(); said = ''; gotAny = false; wanted = true;
    live.textContent = 'Listening… tap Stop when you are done';
    setUi(true); show('');
    start();
  };
}
