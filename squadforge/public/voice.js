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
  let rec = null, base = '', finalText = '', on = false;
  sel.onchange = () => { try { localStorage.setItem('sf_voice_lang', sel.value); } catch { /* ignore */ } };
  const stop = () => { if (rec) rec.stop(); };
  btn.onclick = () => {
    if (on) return stop();
    rec = new SR(); rec.lang = sel.value; rec.continuous = true; rec.interimResults = true;
    base = box.value.trim(); finalText = '';
    rec.onstart = () => { on = true; bar.classList.add('rec'); btn.querySelector('b').textContent = '■ Stop'; live.textContent = 'Listening… speak now'; };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText ? ' ' : '') + t.trim(); else interim += t;
      }
      box.value = [base, finalText, interim.trim()].filter(Boolean).join(base || finalText ? ' ' : '');
      live.textContent = interim ? '…' + interim.slice(-60) : 'Listening…';
    };
    rec.onerror = (e) => { live.textContent = e.error === 'not-allowed' ? 'Allow the microphone for this site, then try again' : e.error === 'no-speech' ? 'Didn’t hear anything — tap Speak and try again' : 'Voice error: ' + e.error; };
    rec.onend = () => {
      on = false; bar.classList.remove('rec'); btn.querySelector('b').textContent = '🎤 Speak';
      if (finalText) { live.textContent = '✓ Got it — check the text, then send'; box.value = [base, finalText].filter(Boolean).join(' '); if (onDone) onDone(finalText); }
      else if (!/Allow|Didn|error/.test(live.textContent)) live.textContent = '';
    };
    try { rec.start(); } catch (e) { live.textContent = 'Could not start the microphone'; }
  };
}
