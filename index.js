// Discord Bot with Key Management, Usage Tracking, and Express Server for 24/7 uptime
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
require('dotenv').config();

// Configuration
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const KEY_FILE = path.join(__dirname, 'global-key.json');
const USAGE_FILE = path.join(__dirname, 'usage-stats.json');
const AUTO_RESPONSES_FILE = path.join(__dirname, 'auto-responses.json');
const KEY_LENGTH = 27;
const PORT = process.env.PORT || 3000;
const API_KEY = "ILikeCats"; // Our API key as requested
const MESSAGE_THRESHOLD = 10; // Number of messages required before getting key

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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ] 
});

// User verification tracking
const userVerification = new Map();
// User message counter
const userMessageCount = new Map();
// Auto responses
let autoResponses = [];

// Load auto responses
function loadAutoResponses() {
  if (!fs.existsSync(AUTO_RESPONSES_FILE)) {
    return [];
  }
  
  try {
    const data = fs.readFileSync(AUTO_RESPONSES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading auto responses:', error);
    return [];
  }
}

// Save auto responses
function saveAutoResponses(responses) {
  fs.writeFileSync(AUTO_RESPONSES_FILE, JSON.stringify(responses, null, 2));
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

// Message counter function
function incrementMessageCount(userId) {
  if (!userMessageCount.has(userId)) {
    userMessageCount.set(userId, 1);
  } else {
    userMessageCount.set(userId, userMessageCount.get(userId) + 1);
  }
  
  return userMessageCount.get(userId);
}

// Check if user has enough messages to get key
function hasEnoughMessages(userId) {
  return (userMessageCount.get(userId) || 0) >= MESSAGE_THRESHOLD;
}

// Register commands
const commands = [
  new SlashCommandBuilder()
    .setName('get-key')
    .setDescription('Get the current global key (requires 10 messages in server)'),
    
  new SlashCommandBuilder()
    .setName('verify-me')
    .setDescription('Check your verification status'),
  
  new SlashCommandBuilder()
    .setName('reset-key')
    .setDescription('Reset the global key (Server Owner only)'),
    
  new SlashCommandBuilder()
    .setName('usage-stats')
    .setDescription('View command usage statistics (Server Owner only)'),
    
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option => option.setName('user').setDescription('The user to ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the ban').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption(option => option.setName('user').setDescription('The user to kick').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the kick').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user')
    .addUserOption(option => option.setName('user').setDescription('The user to timeout').setRequired(true))
    .addIntegerOption(option => option.setName('minutes').setDescription('Timeout duration in minutes').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the timeout').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create and send an embed message')
    .addStringOption(option => option.setName('title').setDescription('Title of the embed').setRequired(true))
    .addStringOption(option => option.setName('description').setDescription('Description of the embed').setRequired(true))
    .addChannelOption(option => option.setName('channel').setDescription('Channel to send the embed to').setRequired(true))
    .addStringOption(option => option.setName('color').setDescription('Color of the embed (hex code)').setRequired(false))
    .addStringOption(option => option.setName('footer').setDescription('Footer text of the embed').setRequired(false))
    .addStringOption(option => option.setName('image').setDescription('Image URL for the embed').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
  new SlashCommandBuilder()
    .setName('setauto')
    .setDescription('Set an automatic response trigger')
    .addStringOption(option => option.setName('trigger').setDescription('The text that triggers the response').setRequired(true))
    .addStringOption(option => option.setName('response').setDescription('The response to send').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
  new SlashCommandBuilder()
    .setName('listauto')
    .setDescription('List all automatic responses')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
  new SlashCommandBuilder()
    .setName('deleteauto')
    .setDescription('Delete an automatic response')
    .addIntegerOption(option => option.setName('id').setDescription('ID of the auto-response to delete').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
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
  
  // Load auto responses
  autoResponses = loadAutoResponses();
  console.log(`Loaded ${autoResponses.length} auto-responses`);
});

// Handle messages for auto-responses and message counting
client.on('messageCreate', async message => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Increment message count for user
  incrementMessageCount(message.author.id);
  
  // Check for auto-responses
  if (autoResponses.length > 0) {
    const content = message.content.toLowerCase();
    
    for (const autoResponse of autoResponses) {
      if (content.includes(autoResponse.trigger.toLowerCase())) {
        message.channel.send(autoResponse.response);
        break; // Only send one response per message
      }
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  
  const { commandName, user } = interaction;
  
  // Track command usage
  trackCommandUsage(user.id, user.username, commandName);
  
  if (commandName === 'verify-me') {
    const messageCount = userMessageCount.get(user.id) || 0;
    const verified = hasEnoughMessages(user.id);
    
    const embed = new EmbedBuilder()
      .setTitle('Verification Status')
      .setColor(verified ? Colors.Green : Colors.Red)
      .setDescription(
        verified 
          ? '✅ You are verified! You can now use `/get-key` to get the key.'
          : `❌ Not verified yet. You need to send ${MESSAGE_THRESHOLD} messages in this server.\nCurrent progress: ${messageCount}/${MESSAGE_THRESHOLD}`
      )
      .setFooter({ text: `Requested by ${user.username}` })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } else if (commandName === 'get-key') {
    // Check if user has sent enough messages
    if (!hasEnoughMessages(user.id)) {
      await interaction.reply({
        content: `You need to send at least ${MESSAGE_THRESHOLD} messages in this server before you can get the key. Current count: ${userMessageCount.get(user.id) || 0}/${MESSAGE_THRESHOLD}`,
        ephemeral: true
      });
      return;
    }
    
    const keyData = getKey();
    
    // Calculate time remaining
    const timeRemaining = Math.max(0, keyData.expiresAt - Date.now());
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    
    const embed = new EmbedBuilder()
      .setTitle('Access Key')
      .setColor(Colors.Blue)
      .setDescription(`Your key: \`${keyData.key}\`\nExpires in: ${hoursRemaining}h ${minutesRemaining}m`)
      .setFooter({ text: 'Keep this key private!' })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
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
  } else if (commandName === 'ban') {
    // Get the target user and reason
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    
    try {
      // Try to DM the user first
      try {
        await targetUser.send(`You have been banned from ${interaction.guild.name} for: ${reason}`);
      } catch (error) {
        console.log(`Could not DM user ${targetUser.tag}`);
      }
      
      // Proceed with ban
      await interaction.guild.members.ban(targetUser, { reason });
      
      const embed = new EmbedBuilder()
        .setTitle('User Banned')
        .setColor(Colors.Red)
        .setDescription(`**User:** ${targetUser.tag}\n**Reason:** ${reason}`)
        .setFooter({ text: `Banned by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error banning user:', error);
      await interaction.reply({ 
        content: `Failed to ban user: ${error.message}`, 
        ephemeral: true 
      });
    }
  } else if (commandName === 'kick') {
    // Get the target user and reason
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    
    if (!targetMember) {
      await interaction.reply({ 
        content: 'Could not find that user in this server.', 
        ephemeral: true 
      });
      return;
    }
    
    try {
      // Try to DM the user first
      try {
        await targetUser.send(`You have been kicked from ${interaction.guild.name} for: ${reason}`);
      } catch (error) {
        console.log(`Could not DM user ${targetUser.tag}`);
      }
      
      // Proceed with kick
      await targetMember.kick(reason);
      
      const embed = new EmbedBuilder()
        .setTitle('User Kicked')
        .setColor(Colors.Orange)
        .setDescription(`**User:** ${targetUser.tag}\n**Reason:** ${reason}`)
        .setFooter({ text: `Kicked by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error kicking user:', error);
      await interaction.reply({ 
        content: `Failed to kick user: ${error.message}`, 
        ephemeral: true 
      });
    }
  } else if (commandName === 'timeout') {
    // Get the target user, duration, and reason
    const targetUser = interaction.options.getUser('user');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    
    if (!targetMember) {
      await interaction.reply({ 
        content: 'Could not find that user in this server.', 
        ephemeral: true 
      });
      return;
    }
    
    try {
      // Calculate timeout duration in milliseconds
      const duration = minutes * 60 * 1000;
      
      // Apply timeout
      await targetMember.timeout(duration, reason);
      
      const embed = new EmbedBuilder()
        .setTitle('User Timed Out')
        .setColor(Colors.Yellow)
        .setDescription(
          `**User:** ${targetUser.tag}\n**Duration:** ${minutes} minute(s)\n**Reason:** ${reason}`
        )
        .setFooter({ text: `Timed out by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    } catch (error) {
      console.error('Error timing out user:', error);
      await interaction.reply({ 
        content: `Failed to timeout user: ${error.message}`, 
        ephemeral: true 
      });
    }
  } else if (commandName === 'embed') {
    // Get all the options
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const channel = interaction.options.getChannel('channel');
    const color = interaction.options.getString('color') || '#0099ff';
    const footer = interaction.options.getString('footer');
    const imageUrl = interaction.options.getString('image');
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color);
    
    if (footer) {
      embed.setFooter({ text: footer });
    }
    
    if (imageUrl) {
      embed.setImage(imageUrl);
    }
    
    embed.setTimestamp();
    
    try {
      // Send the embed to the specified channel
      await channel.send({ embeds: [embed] });
      
      await interaction.reply({
        content: `Successfully sent embed to ${channel}!`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error sending embed:', error);
      await interaction.reply({ 
        content: `Failed to send embed: ${error.message}`, 
        ephemeral: true 
      });
    }
  } else if (commandName === 'setauto') {
    const trigger = interaction.options.getString('trigger');
    const response = interaction.options.getString('response');
    
    // Add new auto-response
    autoResponses.push({
      id: autoResponses.length + 1,
      trigger,
      response
    });
    
    // Save to file
    saveAutoResponses(autoResponses);
    
    await interaction.reply({
      content: `Auto-response added! Trigger: "${trigger}"`,
      ephemeral: true
    });
  } else if (commandName === 'listauto') {
    if (autoResponses.length === 0) {
      await interaction.reply({
        content: 'No auto-responses set up yet.',
        ephemeral: true
      });
      return;
    }
    
    // Format the list
    let responseList = '# Auto-Responses\n\n';
    
    autoResponses.forEach(ar => {
      responseList += `**ID: ${ar.id}**\n`;
      responseList += `**Trigger:** \`${ar.trigger}\`\n`;
      responseList += `**Response:** ${ar.response}\n\n`;
    });
    
    await interaction.reply({
      content: responseList,
      ephemeral: true
    });
  } else if (commandName === 'deleteauto') {
    const id = interaction.options.getInteger('id');
    
    // Find auto-response with this ID
    const index = autoResponses.findIndex(ar => ar.id === id);
    
    if (index === -1) {
      await interaction.reply({
        content: `No auto-response found with ID ${id}.`,
        ephemeral: true
      });
      return;
    }
    
    // Remove the auto-response
    const removed = autoResponses.splice(index, 1)[0];
    
    // Save to file
    saveAutoResponses(autoResponses);
    
    await interaction.reply({
      content: `Auto-response removed! Trigger was: "${removed.trigger}"`,
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
