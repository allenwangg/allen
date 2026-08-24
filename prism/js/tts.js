/* Prism — narration. Reads cards aloud with the browser's own speech engine.
   No audio files, no network: uses the Web Speech API where available. */
(function () {
  'use strict';

  var synth = window.speechSynthesis || null;
  var speaking = false;
  var onChange = null;

  function available() { return !!(synth && typeof SpeechSynthesisUtterance === 'function'); }

  /* Prefer the most natural-sounding engine available. Modern browsers ship
     neural voices whose names carry these markers; fall back through
     known-good named voices, then any voice in the user's language. */
  var GOOD = /natural|neural|premium|enhanced|siri|google (uk|us)|aria|jenny|guy|libby|samantha|serena|daniel|karen/i;
  var POOR = /compact|espeak|festival|robot/i;
  var cachedVoice = null;

  function pickVoice() {
    if (cachedVoice) return cachedVoice;
    try {
      var vs = synth.getVoices() || [];
      if (!vs.length) return null;
      var lang = (navigator.language || 'en-US');
      var base = lang.split('-')[0];
      var pools = [
        function (v) { return v.lang === lang && GOOD.test(v.name) && !POOR.test(v.name); },
        function (v) { return v.lang && v.lang.indexOf(base) === 0 && GOOD.test(v.name) && !POOR.test(v.name); },
        function (v) { return v.lang === lang && !POOR.test(v.name); },
        function (v) { return v.lang && v.lang.indexOf(base) === 0 && !POOR.test(v.name); },
        function (v) { return v.lang && v.lang.indexOf('en') === 0; }
      ];
      for (var p = 0; p < pools.length; p++) {
        for (var i = 0; i < vs.length; i++) if (pools[p](vs[i])) { cachedVoice = vs[i]; return cachedVoice; }
      }
    } catch (e) { /* voice list unavailable */ }
    return null;
  }

  /* Voices often load asynchronously; refresh the cached pick when they arrive. */
  try {
    if (synth && typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', function () { cachedVoice = null; pickVoice(); });
    }
  } catch (e) { /* ignore */ }

  /* Read at a human pace: expand shorthand the engine mispronounces and give
     sentences room to breathe rather than running them together. */
  function humanise(text) {
    return String(text)
      .replace(/\bvs\.?\b/gi, 'versus')
      .replace(/\be\.g\.\s*/gi, 'for example, ')
      .replace(/\bi\.e\.\s*/gi, 'that is, ')
      .replace(/\betc\.?/gi, 'et cetera')
      .replace(/(\d),(\d{3})/g, '$1$2')
      .replace(/\s*—\s*/g, ', ')
      .replace(/([.!?])\s+/g, '$1  ')
      .replace(/:\s+/g, '.  ');
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
      var u = new SpeechSynthesisUtterance(humanise(text));
      var v = pickVoice();
      if (v) u.voice = v;
      u.rate = 0.92;    // just under default: reads like a person, not a bulletin
      u.pitch = 1.02;
      u.volume = 1;
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
