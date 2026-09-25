/* Prism — sound effects. Tiny WebAudio synth, no assets. Honors settings.sound. */
(function () {
  'use strict';

  var ctx = null;

  function ac() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }

  function enabled() {
    try { return window.Store && Store.state.settings.sound !== false; } catch (e) { return false; }
  }

  /* one enveloped oscillator note; t offset (s), f frequency, d duration, g peak gain */
  function note(c, f, t, d, type, g) {
    var o = c.createOscillator(), v = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = f;
    var t0 = c.currentTime + t;
    v.gain.setValueAtTime(0.0001, t0);
    v.gain.exponentialRampToValueAtTime(g || 0.08, t0 + 0.012);
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(v); v.connect(c.destination);
    o.start(t0); o.stop(t0 + d + 0.02);
  }

  function play(fn) {
    if (!enabled()) return;
    var c = ac();
    if (c) { try { fn(c); } catch (e) { /* audio unavailable */ } }
  }

  window.SFX = {
    correct: function () { play(function (c) { note(c, 587.3, 0, 0.12); note(c, 880, 0.09, 0.18, 'sine', 0.07); }); },
    wrong: function () { play(function (c) { note(c, 220, 0, 0.16, 'triangle', 0.06); note(c, 174.6, 0.1, 0.22, 'triangle', 0.05); }); },
    flip: function () { play(function (c) { note(c, 660, 0, 0.07, 'sine', 0.045); }); },
    grade: function () { play(function (c) { note(c, 520, 0, 0.06, 'sine', 0.04); }); },
    complete: function () {
      play(function (c) {
        note(c, 523.25, 0, 0.16, 'sine', 0.07);
        note(c, 659.25, 0.11, 0.16, 'sine', 0.07);
        note(c, 784, 0.22, 0.2, 'sine', 0.07);
        note(c, 1046.5, 0.33, 0.34, 'sine', 0.06);
      });
    },
    badge: function () { play(function (c) { note(c, 784, 0, 0.1, 'sine', 0.06); note(c, 1174.7, 0.09, 0.22, 'sine', 0.05); }); }
  };
})();
