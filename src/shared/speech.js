// 公共模块：中文语音播报（基于 Web Speech API）
// 用法：const voice = createVoice(buttonEl); voice.speak(text); voice.toggle();
export function createVoice(buttonEl) {
  const synth = window.speechSynthesis;
  let enabled = true;
  let zhVoice = null;

  function pickVoice() {
    const voices = synth.getVoices();
    zhVoice = voices.find((v) => /zh/i.test(v.lang)) || null;
  }
  pickVoice();
  synth.addEventListener('voiceschanged', pickVoice);

  function speak(text) {
    if (!enabled || !synth || !text) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.95;
    utter.pitch = 1.05;
    if (zhVoice) utter.voice = zhVoice;
    synth.speak(utter);
  }

  function toggle() {
    enabled = !enabled;
    if (buttonEl) buttonEl.classList.toggle('off', !enabled);
    if (!enabled) synth.cancel();
    return enabled;
  }

  function stop() {
    synth.cancel();
  }

  if (buttonEl) {
    buttonEl.addEventListener('click', toggle);
  }

  return { speak, toggle, stop, isEnabled: () => enabled };
}