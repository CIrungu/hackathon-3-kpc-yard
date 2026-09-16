const VOICE_KEY = "kpc_voice_enabled";

export function isVoiceEnabled() {
  return localStorage.getItem(VOICE_KEY) !== "off";
}

export function setVoiceEnabled(on) {
  localStorage.setItem(VOICE_KEY, on ? "on" : "off");
}

/**
 * Web Speech API text-to-speech voice guidance. Respects the demo mute toggle
 * and gracefully no-ops where speech synthesis is unavailable.
 */
export function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !isVoiceEnabled() || !text) return false;
    synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1;
    const voices = synth.getVoices();
    const preferred =
      voices.find((v) => /en-(GB|KE|ZA|US)/i.test(v.lang)) ?? voices.find((v) => v.default) ?? voices[0];
    if (preferred) utterance.voice = preferred;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    // Siren tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc1.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.25);

    // Siren tone 2
    setTimeout(() => {
      try {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
        osc2.frequency.exponentialRampToValueAtTime(523.25, ctx.currentTime + 0.25);
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.25);
      } catch { /* noop */ }
    }, 200);
  } catch {
    /* AudioContext fallback noop */
  }
}

export function speakAlert(text) {
  playAlertChime();
  setTimeout(() => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !isVoiceEnabled() || !text) return;
      synth.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.1; // Slightly higher pitch for alert urgency
      const voices = synth.getVoices();
      const preferred =
        voices.find((v) => /en-(GB|KE|ZA|US)/i.test(v.lang)) ?? voices.find((v) => v.default) ?? voices[0];
      if (preferred) utterance.voice = preferred;
      synth.speak(utterance);
    } catch { /* noop */ }
  }, 400);
}

export function speakStop() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
}