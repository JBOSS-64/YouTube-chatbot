//setup
const { google } = require('googleapis');
const util = require('util');
const fs = require('fs');
const say = require('say');
const player = require('play-sound')();

const writeFilePromise = util.promisify(fs.writeFile); //used to write files
const readFilePromise = util.promisify(fs.readFile); //used to read files

//Chatbot variables
let config;
try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (err) {
    console.error('Failed to read or parse config.json:', err);
    console.error("Please rename your config.example.json to config.json!");
    process.exit(1);
}

let liveChatId; //ID of the channels current live chat
let nextPage; //next page token
let chatMessages = []; //list of all chat messages since the bot became active
let messageData = []; //only sender and message data from messages
let activeViewers = {}; //list of active users in the chat
let viewerData = {}; //contains the data stored in viewer-data.json for use in the code
let pointsLeaderboard = {};
let levelLeaderboard = {};
let watchtimeLeaderboard = {};
let xpPerMessage = config.xpPerMessage; //xp a user gets per message
let pointsInterval = config.pointsInterval; //how often a user recives points (in minutes)
let pointsPerMin = config.pointsPerMin; //points a user gains per minute
let activePeriod = config.activePeriod; //how long a user can go without interacting before being counted as inactive (in minutes)
let botName = config.botName; //used to exclude the bot from queueing its own messages
let isCoinflipActive = config.isCoinflipActive;
let commandPrefix = config.commandPrefix;
const sanitizeUsername = name => name.replace(/[^\w\s]/gi, '');
let minimumGamble = config.minimumGamble;
const sfx = ["ack", "amogus", "metalPipe", "rehehehe", "rizz", "stinky", "vineBoom", "windowsXpError", "yippie"];

const { broadcast } = require('./overlay/overlay.js');

//load viewer data
if (fs.existsSync('./viewer-data.json')) {
  viewerData = JSON.parse(fs.readFileSync('./viewer-data.json', 'utf8'));
}

//ChatBot class
class ChatBot {
    constructor(accessToken, refreshToken){
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.queue = [];
        this.ttsQueue = [];
        this.processingTTS = false;
    }

    //adds message to the queue for the bot to process
    queueMessage (message){
        this.queue.push(message);
    }
    queue_tts(tts){
        this.ttsQueue.push(tts);
        this.process_tts(); // start processing when something is added
    }
    //processes the queue
    processQueue(){
        while (this.queue.length > 0) {
            const message = this.queue.shift();
            const messageText = message.text;
            const messageSender = message.sender;
            const isMod = message.isMod;
            const isOwner = message.isOwner;
            //creates new viewer if its their first message
            if (!viewerData[messageSender]){
                viewerData[messageSender] = defaultViewerStats();
                console.log("New viewer created:", messageSender);
            }
            //adds user to active users and resets their time until inactive
            if (!activeViewers[messageSender]) activeViewers[messageSender] = {timeUntilInactive: activePeriod, timeUntilPoints: pointsInterval};
            else activeViewers[messageSender].timeUntilInactive = activePeriod;
            //handles commands
            if (messageText[0] === commandPrefix) {
                const parts = messageText.trim().split(" ");
                const command = parts[0].slice(1);
                const args = parts.slice(1);

                //add more commands by creating a case for the command and then programming what you want it to do
                switch (command) {
                    case "commands":
                        //Right now you will have to manually update your chat commands, I will change this later
                        youtubeService.insertMessage("The current chat commands are: !rules, !points, !level, !gamble, !coinflip, !leaderboard and !shop");
                        break;
                    case "rules":
                        youtubeService.insertMessage(config.rules);
                        break;
                    case "points":
                        const userPoints = viewerData[messageSender].points;
                        youtubeService.insertMessage(`@${messageSender} you currently have ${userPoints} points`);
                        break;
                    case "level":
                        const userLevel = viewerData[messageSender].level;
                        const userXp = viewerData[messageSender].xp;
                        youtubeService.insertMessage(`@${messageSender} you are currently level ${userLevel}, and are ${(5 * userLevel * userLevel)-userXp} xp away from leveling up`);
                        break;
                    case "specs":
                        youtubeService.insertMessage(`${config.streamerName}'s specs are: ${config.streamerPCSpecs}`)
                        break;
                    case "rtd":
                    case "gamble":
                        const value = Number(args[0]) || 0;
                        if (value > viewerData[messageSender].points) {
                            youtubeService.insertMessage(`You only have ${viewerData[messageSender].points} points, which is not enough to complete this gamble`);
                            break;
                        }
                        if (value > (minimumGamble-1)){
                            const roll = randomNumber (1 , 6);
                            if (roll == 1) {
                                viewerData[messageSender].points -= value;
                                youtubeService.insertMessage(`You rolled a ${roll} and lost your points. You now have ${viewerData[messageSender].points} points`);
                            }
                            else if (roll < 4){
                                viewerData[messageSender].points -= Math.floor(value/2);
                                youtubeService.insertMessage(`You rolled a ${roll} and got half the bet back. You now have ${viewerData[messageSender].points} points`);
                            }
                            else if (roll < 6){
                                youtubeService.insertMessage(`You rolled a ${roll} and recovered the bet. You now have ${viewerData[messageSender].points} points`);
                            }
                            else {
                                viewerData[messageSender].points += value*2;
                                youtubeService.insertMessage(`You rolled a ${roll} and won triple your bet! You now have ${viewerData[messageSender].points} points`);
                            }
                        } else youtubeService.insertMessage(`Please input a valid number or a number greater than ${minimumGamble-1}`);
                        break;
                    case "shop":
                        if (args[0] == "info"){
                        switch (args[1]) {
                            case "tts":
                                youtubeService.insertMessage("Cost: 25, Use !tts message, says your message for everyone to hear");
                                break;
                            case "randomsfx":
                                youtubeService.insertMessage("Cost 50, Use !randomsfx, plays a random sound");
                                break;
                            case "purplestream":
                                youtubeService.insertMessage("Cost 50, Use !purplestream, makes the stream purple for 15 seconds");
                            default:
                                youtubeService.insertMessage("Please put a valid shop item after !shop info");
                                break;
                            }
                        }
                        youtubeService.insertMessage("The current shop items are !tts, !playsound, and !purplestream. Use !shop info item for info about a specific item");
                        break;
                    case "tts":
                        let cost;
                        if (isOwner) cost = 0;
                        else cost = 25; // Cost in points for TTS
                        const messageText = args.join(" ");

                        if (viewerData[messageSender].points < cost) {
                            youtubeService.insertMessage(`You need ${cost} points to use TTS!`);
                            break;
                        }

                        if (!messageText || (messageText.length > 200 && !isOwner)) {
                            youtubeService.insertMessage("Please enter a shorter message (max 200 characters).");
                            break;
                        }

                        viewerData[messageSender].points -= cost;
                        saveViewerData();

                        console.log(`${messageSender} used TTS: "${messageText}"`);
                        this.queue_tts({text : messageText, sender : messageSender});
                        break;
                    case "randomsfx":
                        let sfxCost;
                        if (isOwner) sfxCost = 0;
                        else sfxCost = 50; // Cost in points for TTS
                        if (viewerData[messageSender].points < sfxCost) {
                            youtubeService.insertMessage(`You need ${sfxCost} points to play a random sfx!`);
                            break;
                        }
                        viewerData[messageSender].points -= sfxCost;
                        let soundNum = randomNumber(0, sfx.length-1);
                        console.log("Playing sound " + sfx[soundNum]);
                        playSound(sfx[soundNum]);
                        break;
                    case "purplestream":
                        let purpleCost;
                        if (isOwner) purpleCost = 0;
                        else purpleCost = 50;
                        if (viewerData[messageSender].points < purpleCost) {
                            youtubeService.insertMessage(`You need ${purpleCost} points to make the stream purple!`);
                            break;
                        }
                        viewerData[messageSender].points -= purpleCost;
                        console.log("Turning stream Purple")
                        broadcast("effect", {duration: 5000});
                        break;
                    case "cf":
                    case "flip":
                    case "coinflip":
                        if (!isCoinflipActive) break;
                        const userFlip = args[0]?.toLowerCase();
                        const flipValue = Number(args[1]) || 0;
                        if (userFlip != "heads" && userFlip != "tails") {
                            youtubeService.insertMessage("Please choose heads or tails (correct format: !coinflip heads/tails bet)");
                            break;
                        }
                        if (flipValue > viewerData[messageSender].points) {
                            youtubeService.insertMessage(`You only have ${viewerData[messageSender].points} points, which is not enough to complete this coin flip`);
                            break;
                        }
                        if (flipValue > (minimumGamble-1)){
                            const roll = randomNumber (1 , 2);
                            if (roll == 1) {
                                if (userFlip == "tails"){
                                    viewerData[messageSender].points += flipValue;
                                    youtubeService.insertMessage(`You flipped tails and doubled your bet! You now have ${viewerData[messageSender].points} points`);
                                } else {
                                    viewerData[messageSender].points -= flipValue;
                                    youtubeService.insertMessage(`You flipped tails and lost your points. You now have ${viewerData[messageSender].points} points`);
                                }
                            } else {
                                if (userFlip == "heads"){
                                    viewerData[messageSender].points += flipValue;
                                    youtubeService.insertMessage(`You flipped heads and doubled your bet! You now have ${viewerData[messageSender].points} points`);
                                } else {
                                    viewerData[messageSender].points -= flipValue;
                                    youtubeService.insertMessage(`You flipped heads and lost your points. You now have ${viewerData[messageSender].points} points`);
                                }
                            }
                        } else youtubeService.insertMessage(`Please input a valid number or a number greater than ${minimumGamble-1}`);
                        break;
                    case "leaderboard":
                        if (args[0] == "points"){
                            calculateLeaderBoardPoints();
                        } else if (args[0] == "level"){
                            calculateLeaderBoardLevel();
                        } else if (args[0] == "watchtime"){
                            calculateLeaderBoardWatchtime();
                        } else youtubeService.insertMessage("Please use !leaderboard points/level/watchtime to see their respective leaderboards");
                        break;
                    case botName:
                        youtubeService.insertMessage(`Hi @${messageSender}`);
                        break;
                    default:
                        youtubeService.insertMessage("Unknown command, use !commands for a list of valid commands");
                        break;
                }
            }
            //if the message wasn't a command then they get xp for the message
            else if (messageSender != botName) {
                addXp(messageSender, xpPerMessage);
                calculateLevel(messageSender);
            }
        }
    }
    async process_tts(){
        if (this.processingTTS || this.ttsQueue.length === 0) return;

        this.processingTTS = true;

        while (this.ttsQueue.length > 0) {
            const ttsMessage = this.ttsQueue.shift();
            await speakAndDisplay(ttsMessage.text, ttsMessage.sender); // await each message
        }

        this.processingTTS = false;
    }
}

//default points, level, xp and watchtime for new viewers
const defaultViewerStats = () => ({ points: 5, level: 1, xp: 0, watchtime: 0 });

//Functions to easily add points, xp, and watchtime to viewers
const addPoints = (username, amount) => {
    if (!viewerData[username]) {
    viewerData[username] = defaultViewerStats()
    console.log("New viewer created:", username);
    }
    viewerData[username].points += amount; // add points
    console.log(`Added ${amount} points to ${username}`);
}

const addXp = (username, amount) => {
    if (!viewerData[username]) {
    viewerData[username] = defaultViewerStats();
    console.log("New viewer created:", username);
    }
    viewerData[username].xp += amount;
    console.log(`Added ${amount} xp to ${username}`);
}

const addWatchtime = (username, amount) => {
    if (!viewerData[username]) {
    viewerData[username] = defaultViewerStats()
    console.log("New viewer created:", username);
    }
    viewerData[username].watchtime += amount;
    console.log(`Added ${amount} watchtime to ${username}`);
}

//calculates the user's level
const calculateLevel = (username) => {
    let leveledUp = false;
    const user = viewerData[username];
    while (user.xp >= (5 * user.level * user.level)) {
        user.xp -= 5 * user.level * user.level;
        user.level++;
        leveledUp = true;
    }
    if (leveledUp) youtubeService.insertMessage(`Congratulations @${username}, you leveled up to level ${user.level}`);
    leveledUp = false;
}

//calculates whether the user is counted as active
const calculateActivity = () => {
    for (const viewer in activeViewers) {
        activeViewers[viewer].timeUntilInactive -= 1;

        if (activeViewers[viewer].timeUntilInactive <= 0) {
            delete activeViewers[viewer]; // remove them
        } else addWatchtime(viewer, 1);
    }
}

//calculates wheter a user should get points based on activity
const calculatePoints = () => {
    for (const viewer in activeViewers) {
        activeViewers[viewer].timeUntilPoints -= 1;
        if (activeViewers[viewer].timeUntilPoints <= 0){
            activeViewers[viewer].timeUntilPoints = pointsInterval
            addPoints(viewer, pointsPerMin * pointsInterval);
        }
    }
}

const calculateLeaderBoardPoints = () => {
    const entries = Object.entries(viewerData);

    entries.sort((a, b) => b[1].points - a[1].points);

    const top5 = entries.slice(0, 5);

    pointsLeaderboard = top5.map((entry, index) => {
    const name = entry[0];
    const points = entry[1].points;
    return `${index + 1}. ${name} - ${points} pts`;
    });

    youtubeService.insertMessage(pointsLeaderboard.join(' | '));
}

const calculateLeaderBoardLevel = () => {
    const entries = Object.entries(viewerData);

    entries.sort((a, b) => b[1].level - a[1].level);

    const top5 = entries.slice(0, 5);

    levelLeaderboard = top5.map((entry, index) => {
    const name = entry[0];
    const level = entry[1].level;
    return `${index + 1}. ${name} - Level ${level}`;
    });

    youtubeService.insertMessage(levelLeaderboard.join(' | '));
}

const calculateLeaderBoardWatchtime = () => {
    const entries = Object.entries(viewerData);

    entries.sort((a, b) => b[1].watchtime - a[1].watchtime);

    const top5 = entries.slice(0, 5);

    watchtimeLeaderboard = top5.map((entry, index) => {
    const name = entry[0];
    const watchtime = entry[1].watchtime;
    return `${index + 1}. ${name} - ${watchtime} min`;
    });

    youtubeService.insertMessage(watchtimeLeaderboard.join(' | '));
}

//saves the viewer data
function saveViewerData() {
  fs.writeFileSync('./viewer-data.json', JSON.stringify(viewerData, null, 2));
}

//calculates viewers points and activity every minute
setInterval(()=>{
    if (!tracking) return;
    calculateActivity();
    calculatePoints();
}, 60 * 1000);

//saves the viewer data to viewer-data.json every 30s
setInterval(saveViewerData, 30 * 1000);


const randomNumber = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function speakAndDisplay(text, sender) {
    return new Promise(resolve => {
        fs.writeFileSync('./tts.txt', `${sender}: ${text}`);

        //estimate speaking time
        const words = text.trim().split(/\s+/).length;
        const rate = config.ttsRate || 1;
        const wordsPerMinute = 180 * rate; //default say.js voice is ~180 WPM
        const estimatedDurationMs = (words / wordsPerMinute) * 60000;

        say.speak(text, config.ttsVoice, rate, () => {
            setTimeout(() => {
                fs.writeFileSync('./tts.txt', '');
                resolve();
            }, estimatedDurationMs + 500);
        });
    });
}

const playSound = (sound) => {
    player.play(`./sounds/${sound}.mp3`, function(err) {
    if (err) console.error(`Could not play sound: ${err}`);
    });
}


const bot = new ChatBot();


//Server Stuff
let tracking = false;

const save = async (path, data) => {
    try {
        await writeFilePromise(path, data);
        console.log('Successfully Saved');
    } catch (err) {
        console.error('Failed to save file:', err);
    }
}

const read = async path => {
    try {
        const fileContents = await readFilePromise(path);
        return JSON.parse(fileContents);
    } catch (err) {
        console.error("Error reading file" + err.message)
        return null
    }
}

//auth setup
const youtube = google.youtube('v3');

const OAuth2 = google.auth.OAuth2

const scope = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl'
]
const youtubeService = {};
//i should probably make this more secure
const clientId = config.clientId;
const clientSecret = config.clientSecret;


//streaming channel authorizathorization
const redirectURI = "http://localhost:3000/callback";

const auth = new OAuth2(clientId, clientSecret, redirectURI);

youtubeService.getCode = response => {
    const authURL = auth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope
    });
    response.redirect(authURL);
}

youtubeService.getTokensWithCode = async code => {
    const credentials = await auth.getToken(code);
    youtubeService.authorize(credentials);
}

youtubeService.authorize = ({ tokens }) => {
    auth.setCredentials(tokens);
    console.log('Sucsessfully set credentials');
    save ('./tokens.json', JSON.stringify(tokens));
}

auth.on('tokens', (tokens) => {
    console.log('New tokens recived :)');
    save ('./tokens.json', JSON.stringify(tokens));
})

const checkTokens = async () => {
    const tokens = await read('./tokens.json');
    if (tokens) {
        console.log('Setting tokens');
        return auth.setCredentials(tokens);
    }
    console.log('No tokens found :(');
}

//bot channel auth
const botRedirectURI = "http://localhost:3000/bot-callback"
const botAuth = new OAuth2(clientId, clientSecret, botRedirectURI);

youtubeService.getBotCode = response => {
    const authURL = botAuth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope
    });
    response.redirect(authURL);
}

youtubeService.getBotTokensWithCode = async code => {
    const credentials = await botAuth.getToken(code);
    youtubeService.authorizeBot(credentials);
}

youtubeService.authorizeBot = ({ tokens }) => {
    botAuth.setCredentials(tokens);
    console.log('Sucsessfully set bot credentials');
    save ('./bot-tokens.json', JSON.stringify(tokens));
}

botAuth.on('tokens', (tokens) => {
    console.log('New bot tokens recived :)');
    save ('./bot-tokens.json', JSON.stringify(tokens));
})

const checkBotTokens = async () => {
    const tokens = await read('./bot-tokens.json');
    if (tokens) {
        console.log('Setting Bot tokens');
        return botAuth.setCredentials(tokens);
    }
    console.log('No tokens found :(');
}



//rest of setup

//finds the active chat id
youtubeService.findActiveChat = async () => {
    if (liveChatId) return;
    const response = await youtube.liveBroadcasts.list({
        auth,
        part: 'snippet',
        broadcastStatus: 'active'
    });
    const latestChat = response.data.items[0];
    if (!latestChat) {
    console.log('No active live broadcasts found.');
    return;
    }
    liveChatId = latestChat.snippet.liveChatId;
    console.log('Chat Id found', liveChatId);
}

//used to skip existing messages before the bot started
let hasStartedFetching = false;

//gets the chat messages for the bot to read
const getChatMessages = async () => {
    if (!tracking) return;

    try {
        const response = await youtube.liveChatMessages.list({
            auth,
            part: 'snippet,authorDetails',
            liveChatId,
            pageToken: nextPage
        });

        const { data } = response;
        const newMessages = data.items || [];
        chatMessages.push(...newMessages);
        nextPage = data.nextPageToken;

        if (hasStartedFetching) {
            for (const message of newMessages) {
                const text = message.snippet.textMessageDetails?.messageText || message.snippet.displayMessage;
                const sender = message.authorDetails?.displayName;
                const username = sanitizeUsername(sender);
                const isOwner = message.authorDetails.isChatOwner;
                const isMod = message.authorDetails.isChatModerator;
                if (text && sender) {
                    messageData.push({ username, text });
                    if (sender != botName) bot.queueMessage({ sender: username, text, isOwner, isMod });
                    if (config.chatOverlay && text[0] != '!' && sender != botName) broadcast("chat", { username: username, message: text });
                }
            }
            bot.processQueue();
        } else {
            console.log('Skipping initial message batch');
            hasStartedFetching = true;
        }

        let delay = data.pollingIntervalMillis;
        if (!delay || delay < 5000) delay = 10000;

        setTimeout(getChatMessages, delay);

    } catch (err) {
        console.error('Error getting chat messages:', err);
        setTimeout(getChatMessages, 10000);
    }
}


//starts tracking the chat
youtubeService.startTrackingChat = async () => {
    if (!tracking) {
        tracking = true;
        hasStartedFetching = false;
        nextPage = undefined;
        await youtubeService.findActiveChat();
        if (!liveChatId) {
            console.log("No liveChatId found. Aborting tracking.");
            tracking = false;
            return;
        }
        getChatMessages();
    }
};

//stops tracking the chat
youtubeService.stopTrackingChat = () => {
    tracking = false;
    saveViewerData();
};

//used to have the bot send a message
youtubeService.insertMessage = (messageText = "Hello World") => {
    youtube.liveChatMessages.insert({
        auth: botAuth,
        part: 'snippet',
        resource: {
            snippet: {
                liveChatId,
                type: 'textMessageEvent',
                textMessageDetails: {
                    messageText
                }
            }
        }
    })
}


checkTokens();
checkBotTokens();

//saves viewer data in case of a crash
process.on('SIGINT', () => {
    console.log('Shutting down...');
    saveViewerData();
    process.exit();
});




//leave this at bottom
module.exports = youtubeService;