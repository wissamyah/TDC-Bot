require('dotenv').config();
const { Client, GatewayIntentBits, Collection, PermissionsBitField } = require('discord.js');
const cron = require('node-cron');
const storage = require('./utils/storage');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
let reminders = [];
let config = {};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    config = await storage.readJSON('config.json') || { prefix: '!', reminderCheckInterval: 30000 };
    const reminderData = await storage.readJSON('reminders.json') || { reminders: [] };
    reminders = reminderData.reminders;
    
    startReminderCheck();
    await setupDailyEvents();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'reminder') {
        await handleReminder(message, args);
    } else if (command === 'wipe') {
        await handleWipe(message, args);
    }
});

async function handleReminder(message, args) {
    const channelMatch = args[0]?.match(/<#(\d+)>/);
    if (!channelMatch) {
        return message.reply('Please specify a channel! Usage: `!reminder #channel "title" 2h30m`');
    }

    const channelId = channelMatch[1];
    const channel = message.guild.channels.cache.get(channelId);
    
    if (!channel) {
        return message.reply('Channel not found!');
    }

    const titleMatch = message.content.match(/"([^"]+)"/);
    if (!titleMatch) {
        return message.reply('Please provide a title in quotes! Usage: `!reminder #channel "title" 2h30m`');
    }
    
    const title = titleMatch[1];
    const timeString = args[args.length - 1];
    const milliseconds = parseTime(timeString);
    
    if (!milliseconds) {
        return message.reply('Invalid time format! Use formats like: 2h, 30m, 2h30m, 45s');
    }

    const reminder = {
        id: Date.now().toString(),
        channelId,
        title,
        createdBy: message.author.id,
        createdAt: Date.now(),
        triggerAt: Date.now() + milliseconds,
        guildId: message.guild.id
    };

    reminders.push(reminder);
    await storage.writeJSON('reminders.json', { reminders });

    const timeFormatted = formatTime(milliseconds);
    message.reply(`✅ Reminder set! "${title}" will be sent to <#${channelId}> in ${timeFormatted}`);
}

async function handleWipe(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply('You need Manage Messages permission to use this command!');
    }

    const amount = parseInt(args[0]) || 100;
    
    if (amount < 1 || amount > 100) {
        return message.reply('Please provide a number between 1 and 100!');
    }

    try {
        const deleted = await message.channel.bulkDelete(amount + 1, true);
        const reply = await message.channel.send(`🗑️ Deleted ${deleted.size - 1} messages!`);
        setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (error) {
        console.error('Error deleting messages:', error);
        message.reply('There was an error deleting messages. Messages older than 14 days cannot be bulk deleted.');
    }
}

function parseTime(timeString) {
    const regex = /(\d+)([hms])/g;
    let totalMs = 0;
    let match;

    while ((match = regex.exec(timeString)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];
        
        switch(unit) {
            case 'h': totalMs += value * 60 * 60 * 1000; break;
            case 'm': totalMs += value * 60 * 1000; break;
            case 's': totalMs += value * 1000; break;
        }
    }
    
    return totalMs || null;
}

function formatTime(milliseconds) {
    const hours = Math.floor(milliseconds / (60 * 60 * 1000));
    const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((milliseconds % (60 * 1000)) / 1000);
    
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    
    return parts.join(' ') || '0s';
}

function startReminderCheck() {
    setInterval(async () => {
        const now = Date.now();
        const triggered = [];
        
        reminders = reminders.filter(reminder => {
            if (reminder.triggerAt <= now) {
                triggered.push(reminder);
                return false;
            }
            return true;
        });
        
        for (const reminder of triggered) {
            try {
                const guild = client.guilds.cache.get(reminder.guildId);
                if (!guild) continue;
                
                const channel = guild.channels.cache.get(reminder.channelId);
                if (!channel) continue;
                
                await channel.send(`⏰ **Reminder:** ${reminder.title}\n*Set by <@${reminder.createdBy}>*`);
            } catch (error) {
                console.error('Error sending reminder:', error);
            }
        }
        
        if (triggered.length > 0) {
            await storage.writeJSON('reminders.json', { reminders });
        }
    }, config.reminderCheckInterval || 30000);
}

async function setupDailyEvents() {
    const eventsData = await storage.readJSON('events.json');
    if (!eventsData || !eventsData.dailyEvents) return;
    
    for (const event of eventsData.dailyEvents) {
        if (!event.enabled || !event.channel) continue;
        
        const [hour, minute] = event.time.split(':');
        const cronExpression = `${minute} ${hour} * * *`;
        
        cron.schedule(cronExpression, async () => {
            try {
                const channel = client.channels.cache.get(event.channel);
                if (channel) {
                    await channel.send(`📅 **Daily Reminder:** ${event.message}`);
                }
            } catch (error) {
                console.error('Error sending daily event:', error);
            }
        });
        
        console.log(`Scheduled daily event "${event.name}" at ${event.time}`);
    }
}

client.login(process.env.DISCORD_TOKEN);