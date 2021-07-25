const ethers = require('ethers'); //Library to interact with Ethereum blockchain
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();
const Discord = require('discord.js');

const provider = new ethers.providers.WebSocketProvider(process.env.WS_URL);
const abi = loadObjectsFromJsonFile("./abi/ERC20Abi.json");
const SUBS_FILE_PATH = './data/subscriptions.json';

//Discord bot
const client = new Discord.Client();
client.login(process.env.BOT_TOKEN);

function loadObjectsFromJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath));
    } catch (err) {
        console.log(err)
    }
}

function writeObjectsToJsonFile(filePath, objects) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(objects));
    } catch (err) {
        console.log(err)
    }
}

function formatAmount(amount) {
    //Divide by 10**18, round to 4 decimals and add commas (10000 -> 10,000)
    let amnt = ethers.utils.formatUnits(amount, 18);
    return parseFloat(amnt).toFixed(4).toString().replace(/\B(?=(?=\d*\.)(\d{3})+(?!\d))/g, ',');
}

function listenToTokenTransfer(tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, abi, provider);

    tokenContract.once("Transfer", (address, account, amount) => {
        console.log(`[${getCurrentDateTime()}] ${address} -> ${account} (${formatAmount(amount)})`);

        postOnDiscordChannel(tokenAddress); 
        
        deleteSubscription(tokenAddress);
    });
}

function postOnDiscordChannel(tokenAddress) {
    const categoryChannel = client.channels.cache.find(ch =>  ch.type === 'category' && ch.name.toLowerCase() == '🟣polygon 🟣');
    if (!categoryChannel) {
        console.log("CategoryChannel not found!");
        return;
    }

    const channel = categoryChannel.children.find(ch => ch.name == '🔥new-tokens');
    if (!channel) {
        console.log("Channel not found!"); 
        return;
    }

    const users = getTokenSubscribers(tokenAddress);
    getTokenSymbol(tokenAddress).then((symbol) => {
        const message = `${users.map(u => `<@${u}>`).join(' ')} Liquidity has been added for **${symbol}** (${tokenAddress})`;

        channel.send(message);
    });
}

function getCurrentDateTime() {
    let date_ob = new Date();

    let day = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let hours = ("0" + date_ob.getHours()).slice(-2);
    let minutes = ("0" + date_ob.getMinutes()).slice(-2);
    let seconds = ("0" + date_ob.getSeconds()).slice(-2);

    return day + "/" + month + "/" + year + " " + hours + ":" + minutes + ":" + seconds;
}

function startBot() {
    // If the bot restarts, subscribe to existing tokens in subscriptions.json
    const subscriptions = loadObjectsFromJsonFile(SUBS_FILE_PATH);
    for (subscription of subscriptions) {
        listenToTokenTransfer(subscription.token_address);
    }

    // Handle discord messages
    client.on('message', (message) => {
        if (message.author.bot) return;
        
        // Only handle if command is: "!liq <tokenAddress>"
        if (message.content.length === 47 && message.content.startsWith('!liq ')) { //TODO: use regex
            console.log(`[${message.author.tag}]: ${message.content}`);
            const userId = message.author.id;
            const tokenAddress = message.content.substring(5, 47);
            
            // Check if user is already subscribed to this token
            if (userAlreadySubscribedToToken(tokenAddress, userId)) {
                message.reply(`Already on it boss! :wink:`);
                return;
            }
            
            getTokenSymbol(tokenAddress).then((symbol) => {
                if (tokenAlreadyExists(tokenAddress)) {
                    //Add user to subscribers
                    addUserToSubscribers(tokenAddress, userId);
                } else {
                    // Start listening for token transfer
                    listenToTokenTransfer(tokenAddress);
    
                    // Add new entry to subscriptions with the user's id
                    addNewSubscription(tokenAddress, userId);
                }
    
                message.reply(`I'll let you know when liquidity is added for **${symbol}** (${tokenAddress})`);
            }).catch(_ => {
                message.reply(`That's probably not a token address, where did you get that from? :kek:`);
                console.log(`Error while trying to fetch token symbol for ${tokenAddress}. The address might be wrong.`);
            });
        }

        //TODO: allow a user to unsubscribe
    });
}

function userAlreadySubscribedToToken(tokenAddress, userId) {
    const subscriptions = loadObjectsFromJsonFile(SUBS_FILE_PATH);
    for (sub of subscriptions) {
        if (sub.token_address === tokenAddress) {
            for (user of sub.users) {
                if (user === userId) {
                    return true;
                }
            }
        }
    }
    return false;
}

function tokenAlreadyExists(tokenAddress) {
    const subscriptions = loadObjectsFromJsonFile(SUBS_FILE_PATH);
    for (sub of subscriptions) {
        if (sub.token_address === tokenAddress) {
            return true;
        }
    }
    return false;
}

function addNewSubscription(tokenAddress, userId) {
    const subscriptions = loadObjectsFromJsonFile(SUBS_FILE_PATH);
    subscriptions.push({token_address: tokenAddress, users: [userId]});
    
    writeObjectsToJsonFile(SUBS_FILE_PATH, subscriptions);
}

function addUserToSubscribers(tokenAddress, userId) {
    const subscriptions = loadObjectsFromJsonFile(SUBS_FILE_PATH);
    for (sub of subscriptions) {
        if (sub.token_address === tokenAddress) {
            sub.users.push(userId);
            writeObjectsToJsonFile(SUBS_FILE_PATH, subscriptions);
            return;
        }
    }
}

function getTokenSubscribers(tokenAddress) {
    const subscriptions = loadObjectsFromJsonFile(SUBS_FILE_PATH);
    for (sub of subscriptions) {
        if (sub.token_address === tokenAddress) {
            return sub.users;
        }
    }
}

function deleteSubscription(tokenAddress) {
    const subscriptions = loadObjectsFromJsonFile(SUBS_FILE_PATH);
    for (i=0; i<subscriptions.length; i++) {
        if (subscriptions[i].token_address === tokenAddress) {
            subscriptions.splice(i, 1);

            writeObjectsToJsonFile(SUBS_FILE_PATH, subscriptions);
            return;
        }
    }
}

function getTokenSymbol(tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, abi, provider);

    return tokenContract.symbol();
}

startBot();

