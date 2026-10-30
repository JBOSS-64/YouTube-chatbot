const chat = document.getElementById('chat');
const purpleFlash = document.getElementById('purple-flash');
const socket = new WebSocket('ws://' + location.host);

socket.onmessage = (event) => {
  const { type, payload } = JSON.parse(event.data);
  console.log("CHAT MSG:", payload.username, payload.message);

  if (type === "chat") {
    const msg = document.createElement('div');
    msg.className = 'message';
    msg.textContent = `${payload.username}: ${payload.message}`;
    chat.prepend(msg);
    setTimeout(() => {
        msg.style.transition = "opacity 1s ease";
        msg.style.opacity = 0;
        setTimeout(() => msg.remove(), 1000); // remove after fade
    }, 20000);
  }

  if (type === "effect") {
    if (purpleFlash) {
      // Make sure it's visible
      purpleFlash.style.transition = 'opacity 0.5s ease';
      purpleFlash.style.opacity = '0.5';

      // Fade out after duration
      setTimeout(() => {
        purpleFlash.style.opacity = '0';
      }, payload.duration || 5000);
    }
  }

  if (type === "tts") {
    const ttsMsg = document.createElement('div');
    ttsMsg.className = 'tts-message';
    ttsMsg.textContent = payload.text;
    document.getElementById('tts').appendChild(ttsMsg);

    // Auto-remove after a few seconds
    setTimeout(() => ttsMsg.remove(), payload.duration || 5000);
  }
};
