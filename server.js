const express = require('express');
const path = require('path');
const youtubeService = require('./youtubeService');

const server = express();

server.get('/', (req, res) =>
    res.sendFile(path.join( __dirname, '/index.html'))
);

server.get('/auth', (req, res) => {
    youtubeService.getCode(res);
}
);

server.get('/bot-channel-auth', (req, res) => {
    youtubeService.getBotCode(res);
}
);

server.get('/callback', (req, res) => {
    const { code } = req.query;
    youtubeService.getTokensWithCode(code);
    res.redirect('/');
}
);

server.get('/bot-callback', (req, res) => {
    const { code } = req.query;
    youtubeService.getBotTokensWithCode(code);
    res.redirect('/');
}
);

server.get('/start-bot', (req, res) => {
    youtubeService.startTrackingChat();
    console.log("Bot Started");
    res.redirect('/');
}
);

server.get('/stop-bot', (req, res) => {
    youtubeService.stopTrackingChat();
    console.log("Bot Stopped");
    res.redirect('/');
}
);

server.get('/find-active-chat', (req, res) => {
    youtubeService.findActiveChat();
    res.redirect('/');
}
);

server.get('/start-tracking-chat', (req, res) => {
    youtubeService.startTrackingChat();
    res.redirect('/');
}
);

server.get('/stop-tracking-chat', (req, res) => {
    youtubeService.stopTrackingChat();
    res.redirect('/');
}
);

server.get('/insert-message', (req, res) => {
    youtubeService.insertMessage();
    res.redirect('/');
}
);

server.listen(3000, () => console.log("Server is working, log in at http://localhost:3000"));