/* Prism — narration. Reads cards aloud with the browser's own speech engine.
   No audio files, no network: uses the Web Speech API where available. */
(function () {
  'use strict';

  var synth = window.speechSynthesis || null;
  var speaking = false;
  var onChange = null;

  function available() { return !!(synth && typeof SpeechSynthesisUtterance === 'function'); }

  function pickVoice() {
    try {
      var vs = synth.getVoices() || [];
      var lang = (navigator.language || 'en-US');
      for (var i = 0; i < vs.length; i++) {
        if (vs[i].lang === lang && /natural|premium|enhanced/i.test(vs[i].name)) return vs[i];
      }
      for (var j = 0; j < vs.length; j++) if (vs[j].lang === lang) return vs[j];
      for (var k = 0; k < vs.length; k++) if (vs[k].lang && vs[k].lang.indexOf('en') === 0) return vs[k];
    } catch (e) { /* voice list unavailable */ }
    return null;
  }

  function stop() {
    if (!available()) return;
    try { synth.cancel(); } catch (e) { /* ignore */ }
    speaking = false;
    if (onChange) onChange(false);
  }

  /* Speak text; returns true if narration started. */
  function speak(text) {
    if (!available() || !text) return false;
    stop();
    try {
      var u = new SpeechSynthesisUtterance(String(text));
      var v = pickVoice();
      if (v) u.voice = v;
      u.rate = 1.0;
      u.pitch = 1.0;
      u.onend = function () { speaking = false; if (onChange) onChange(false); };
      u.onerror = function () { speaking = false; if (onChange) onChange(false); };
      synth.speak(u);
      speaking = true;
      if (onChange) onChange(true);
      return true;
    } catch (e) { return false; }
  }

  function toggle(text) {
    if (speaking) { stop(); return false; }
    return speak(text);
  }

  window.TTS = {
    available: available, speak: speak, stop: stop, toggle: toggle,
    get speaking() { return speaking; },
    set onChange(fn) { onChange = fn; }
  };
})();
