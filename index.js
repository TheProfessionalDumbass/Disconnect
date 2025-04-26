const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express'); // Make sure to install: npm install express
require('dotenv').config();

// Configuration
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const KEY_FILE = path.join(__dirname, 'global-key.json');
const USAGE_FILE = path.join(__dirname, 'usage-stats.json');
const USER_MESSAGES_FILE = path.join(__dirname, 'user-messages.json');
const KEY_LENGTH = 27;
const PORT = process.env.PORT || 3000;
const API_KEY = "ILikeCats"; // Our API key as requested
const REQUIRED_MESSAGE_COUNT = 20; // Number of messages required before getting a key

console.log('Starting bot with verification checks...');

// Check if environment variables are set
if (!TOKEN) {
  console.error('ERROR: DISCORD_BOT_TOKEN environment variable is not set');
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error('ERROR: CLIENT_ID environment variable is not set');
  process.exit(1);
}

// Set up Express server for 24/7 uptime
const app = express();

// Middleware to verify API key
const verifyApiKey = (req, res, next) => {
  const providedKey = req.query.apiKey || req.headers['x-api-key'];
  
  if (!providedKey || providedKey !== API_KEY) {
    return res.status(401).send('Unauthorized: Invalid API key');
  }
  
  next();
};

// Public route - no API key needed
app.get('/', (req, res) => {
  res.send('Webserver OK, Discord Bot OK');
});

// Protected route - requires API key
app.get('/key-materon', verifyApiKey, (req, res) => {
  const keyData = getKey();
  
  // Set headers for compatibility with Roblox Luau executors
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Return just the raw key text for Luau executors
  res.send(keyData.key);
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

// Create a new client instance
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,  // Add this intent to track messages
    GatewayIntentBits.GuildMembers     // Add this intent to check user properties
  ] 
});

// Message tracking functions
function loadUserMessages() {
  if (!fs.existsSync(USER_MESSAGES_FILE)) {
    return { users: {} };
  }
  
  try {
    const data = fs.readFileSync(USER_MESSAGES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading user messages:', error);
    return { users: {} };
  }
}

function saveUserMessages(data) {
  fs.writeFileSync(USER_MESSAGES_FILE, JSON.stringify(data, null, 2));
}

function trackUserMessage(userId, username) {
  const messageData = loadUserMessages();
  
  if (!messageData.users[userId]) {
    messageData.users[userId] = {
      username: username,
      messageCount: 0,
      firstMessageAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      isVerified: false
    };
  }
  
  // Update the user data
  messageData.users[userId].messageCount++;
  messageData.users[userId].username = username; // Update username in case it changed
  messageData.users[userId].lastMessageAt = new Date().toISOString();
  
  saveUserMessages(messageData);
  return messageData.users[userId];
}

function verifyUser(userId) {
  const messageData = loadUserMessages();
  
  if (messageData.users[userId]) {
    messageData.users[userId].isVerified = true;
    saveUserMessages(messageData);
  }
}

function checkUserEligibility(userId) {
  const messageData = loadUserMessages();
  
  if (!messageData.users[userId]) {
    return {
      eligible: false,
      messageCount: 0,
      isVerified: false,
      reason: "User not found in database"
    };
  }
  
  const userData = messageData.users[userId];
  
  if (!userData.isVerified) {
    return {
      eligible: false,
      messageCount: userData.messageCount,
      isVerified: false,
      reason: "User not verified as human"
    };
  }
  
  if (userData.messageCount < REQUIRED_MESSAGE_COUNT) {
    return {
      eligible: false,
      messageCount: userData.messageCount,
      isVerified: true,
      reason: `Need ${REQUIRED_MESSAGE_COUNT - userData.messageCount} more messages`
    };
  }
  
  return {
    eligible: true,
    messageCount: userData.messageCount,
    isVerified: true,
    reason: "User meets all requirements"
  };
}

// Key management functions
function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
  let key = '';
  
  const randomBytes = crypto.randomBytes(KEY_LENGTH);
  for (let i = 0; i < KEY_LENGTH; i++) {
    const index = randomBytes[i] % chars.length;
    key += chars[index];
  }
  
  return key;
}

function saveKey(key) {
  const data = {
    key: key,
    expiresAt: Date.now() + (12 * 60 * 60 * 1000) // 12 hours from now
  };
  
  fs.writeFileSync(KEY_FILE, JSON.stringify(data, null, 2));
  return data;
}

function getKey() {
  // If file doesn't exist or is empty, generate a new key
  if (!fs.existsSync(KEY_FILE)) {
    const key = generateKey();
    return saveKey(key);
  }
  
  // Read and parse the current key data
  const fileContent = fs.readFileSync(KEY_FILE, 'utf8');
  
  if (!fileContent || fileContent.trim() === '') {
    const key = generateKey();
    return saveKey(key);
  }
  
  const data = JSON.parse(fileContent);
  
  // Check if key is expired
  if (Date.now() > data.expiresAt) {
    const key = generateKey();
    return saveKey(key);
  }
  
  return data;
}

function resetKey() {
  const key = generateKey();
  return saveKey(key);
}

// Usage tracking functions
function loadUsageStats() {
  if (!fs.existsSync(USAGE_FILE)) {
    return { users: {} };
  }
  
  try {
    const data = fs.readFileSync(USAGE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading usage stats:', error);
    return { users: {} };
  }
}

function saveUsageStats(stats) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(stats, null, 2));
}

function trackCommandUsage(userId, username, commandName) {
  const stats = loadUsageStats();
  
  if (!stats.users[userId]) {
    stats.users[userId] = {
      username: username,
      commands: {}
    };
  }
  
  // Make sure username is updated in case it changed
  stats.users[userId].username = username;
  
  if (!stats.users[userId].commands[commandName]) {
    stats.users[userId].commands[commandName] = {
      count: 0,
      lastUsed: null
    };
  }
  
  stats.users[userId].commands[commandName].count++;
  stats.users[userId].commands[commandName].lastUsed = new Date().toISOString();
  
  saveUsageStats(stats);
}

// Register commands
const commands = [
  new SlashCommandBuilder()
    .setName('get-key')
    .setDescription('Get the current global key (requires verification & 10 messages)'),
  
  new SlashCommandBuilder()
    .setName('reset-key')
    .setDescription('Reset the global key (Server Owner only)'),
    
  new SlashCommandBuilder()
    .setName('usage-stats')
    .setDescription('View command usage statistics (Server Owner only)'),
    
  new SlashCommandBuilder()
    .setName('verify-me')
    .setDescription('Verify yourself as a human user'),
    
  new SlashCommandBuilder()
    .setName('my-stats')
    .setDescription('Check your message count and verification status')
];

console.log('Registering slash commands...');
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
})();

// Event handlers
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Initialize key file if it doesn't exist
  if (!fs.existsSync(KEY_FILE)) {
    const key = generateKey();
    saveKey(key);
    console.log('Initial key generated');
  }
  
  // Initialize usage stats file if it doesn't exist
  if (!fs.existsSync(USAGE_FILE)) {
    saveUsageStats({ users: {} });
    console.log('Usage stats file initialized');
  }
  
  // Initialize user messages file if it doesn't exist
  if (!fs.existsSync(USER_MESSAGES_FILE)) {
    saveUserMessages({ users: {} });
    console.log('User messages file initialized');
  }
});

// Track normal messages from users
client.on('messageCreate', message => {
  // Ignore messages from bots (including our own)
  if (message.author.bot) return;
  
  // Track this message for the user
  const userData = trackUserMessage(message.author.id, message.author.username);
  
  // Log for debugging
  console.log(`Message from ${message.author.username} (${message.author.id}), total: ${userData.messageCount}`);
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  
  const { commandName, user } = interaction;
  
  // Track command usage
  trackCommandUsage(user.id, user.username, commandName);
  
  if (commandName === 'get-key') {
    // Check if user is eligible for a key
    const eligibility = checkUserEligibility(user.id);
    
    if (!eligibility.eligible) {
      await interaction.reply({
        content: `You're not eligible to get a key yet.\nReason: ${eligibility.reason}\nMessage count: ${eligibility.messageCount}/${REQUIRED_MESSAGE_COUNT}\nVerified: ${eligibility.isVerified ? 'Yes' : 'No'}`,
        ephemeral: true
      });
      return;
    }
    
    const keyData = getKey();
    
    // Calculate time remaining
    const timeRemaining = Math.max(0, keyData.expiresAt - Date.now());
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    
    await interaction.reply({
      content: `Current key: \`${keyData.key}\`\nExpires in: ${hoursRemaining}h ${minutesRemaining}m`,
      ephemeral: true // Only visible to the user who ran the command
    });
    
  } else if (commandName === 'reset-key') {
    // Check if user is the server owner
    const isOwner = interaction.guild.ownerId === user.id;
    
    if (!isOwner) {
      await interaction.reply({
        content: 'Only the server owner can reset the key.',
        ephemeral: true
      });
      return;
    }
    
    // Backup the old key data to a log file
    if (fs.existsSync(KEY_FILE)) {
      const oldData = JSON.parse(fs.readFileSync(KEY_FILE));
      const logFileName = `key-log-${Date.now()}.json`;
      fs.writeFileSync(path.join(__dirname, logFileName), JSON.stringify(oldData, null, 2));
    }
    
    // Generate new key
    const keyData = resetKey();
    
    await interaction.reply({
      content: `Key has been reset. New key: \`${keyData.key}\``,
      ephemeral: true
    });
  } else if (commandName === 'usage-stats') {
    // Check if user is the server owner
    const isOwner = interaction.guild.ownerId === user.id;
    
    if (!isOwner) {
      await interaction.reply({
        content: 'Only the server owner can view usage statistics.',
        ephemeral: true
      });
      return;
    }
    
    const stats = loadUsageStats();
    const users = Object.values(stats.users);
    
    if (users.length === 0) {
      await interaction.reply({
        content: 'No usage statistics available yet.',
        ephemeral: true
      });
      return;
    }
    
    // Format the stats into a code block
    let statsTable = 'USER | COMMAND | COUNT | LAST USED\n';
    statsTable += '---- | ------- | ----- | ---------\n';
    
    users.forEach(user => {
      Object.entries(user.commands).forEach(([cmd, data]) => {
        const lastUsed = new Date(data.lastUsed).toLocaleString();
        statsTable += `${user.username} | /${cmd} | ${data.count} | ${lastUsed}\n`;
      });
    });
    
    await interaction.reply({
      content: `# Command Usage Statistics\n\`\`\`\n${statsTable}\`\`\``,
      ephemeral: true
    });
  } else if (commandName === 'verify-me') {
    // Simple verification - in a real system you might use CAPTCHA or other methods
    verifyUser(user.id);
    
    await interaction.reply({
      content: `You have been verified as a human user! You still need at least ${REQUIRED_MESSAGE_COUNT} messages before you can get a key.`,
      ephemeral: true
    });
  } else if (commandName === 'my-stats') {
    const messageData = loadUserMessages();
    const userData = messageData.users[user.id] || {
      messageCount: 0,
      isVerified: false,
      firstMessageAt: 'Never',
      lastMessageAt: 'Never'
    };
    
    const eligibility = checkUserEligibility(user.id);
    const remainingMessages = userData.messageCount < REQUIRED_MESSAGE_COUNT ? 
      REQUIRED_MESSAGE_COUNT - userData.messageCount : 0;
    
    await interaction.reply({
      content: `# Your Stats
Message Count: ${userData.messageCount}/${REQUIRED_MESSAGE_COUNT}
Verified as Human: ${userData.isVerified ? '✅ Yes' : '❌ No'}
First Message: ${userData.firstMessageAt !== 'Never' ? new Date(userData.firstMessageAt).toLocaleString() : 'Never'}
Last Message: ${userData.lastMessageAt !== 'Never' ? new Date(userData.lastMessageAt).toLocaleString() : 'Never'}

Key Eligibility: ${eligibility.eligible ? '✅ Eligible' : '❌ Not Eligible'}
${!eligibility.eligible ? `Reason: ${eligibility.reason}` : ''}
${remainingMessages > 0 ? `You need ${remainingMessages} more messages before you can get a key.` : ''}
${!userData.isVerified ? 'Please use the /verify-me command to verify yourself as a human.' : ''}`,
      ephemeral: true
    });
  }
});

// Error handling
client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Login to Discord
console.log('Attempting to log in to Discord...');
client.login(TOKEN).then(() => {
  console.log('Login successful');
}).catch(error => {
  console.error('Login failed:', error);
});

console.log('Bot is now running with Express server for 24/7 uptime');
