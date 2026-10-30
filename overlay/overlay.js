const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');
let config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const app = express();
const port = 3001;

// Serve static overlay files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));
const server = app.listen(port, () => {
  console.log(`Overlay running at http://localhost:${port}`);
});

// WebSocket server for overlay
const wss = new WebSocket.Server({ server });

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

module.exports = { broadcast };
