// Discord Bot with Key Management, Usage Tracking, and Express Server for 24/7 uptime
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
const KEY_LENGTH = 27;
const PORT = process.env.PORT || 3000;

console.log('Starting bot...');

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

app.get('/', (req, res) => {
  res.send('Webserver OK, Discord Bot OK');
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

// Create a new client instance
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ] 
});

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
    .setDescription('Get the current global key'),
  
  new SlashCommandBuilder()
    .setName('reset-key')
    .setDescription('Reset the global key (Server Owner only)'),
    
  new SlashCommandBuilder()
    .setName('usage-stats')
    .setDescription('View command usage statistics (Server Owner only)')
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
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  
  const { commandName, user } = interaction;
  
  // Track command usage
  trackCommandUsage(user.id, user.username, commandName);
  
  if (commandName === 'get-key') {
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
