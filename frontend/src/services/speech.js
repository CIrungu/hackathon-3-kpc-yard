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

export function speakStop() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
}