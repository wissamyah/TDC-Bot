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
    
    // Set bot activity and rotate it to show the bot is active
    const activities = [
        { name: 'Dark War Survival', type: 0 }, // Playing
        { name: `${reminders.length} active reminders`, type: 3 }, // Watching
        { name: 'TDC Alliance', type: 0 }, // Playing
        { name: '!reminder for help', type: 2 } // Listening
    ];
    
    let activityIndex = 0;
    setInterval(() => {
        const activity = activities[activityIndex];
        client.user.setActivity(activity.name, { type: activity.type });
        activityIndex = (activityIndex + 1) % activities.length;
    }, 5 * 60 * 1000); // Change activity every 5 minutes
    
    // Set initial activity
    client.user.setActivity(activities[0].name, { type: activities[0].type });
    
    startReminderCheck();
    await setupDailyEvents();
});

// Welcome new members
client.on('guildMemberAdd', async (member) => {
    try {
        const welcomeChannel = member.guild.channels.cache.get('1437915150027063416');
        if (welcomeChannel) {
            await welcomeChannel.send({
                embeds: [{
                    title: 'Welcome to TDC Alliance!',
                    description: `Hey ${member}, welcome to the TDC Alliance! We're glad to have you here.`,
                    color: 0x00FF00,
                    thumbnail: {
                        url: member.user.displayAvatarURL({ dynamic: true })
                    },
                    fields: [
                        {
                            name: 'Getting Started',
                            value: 'Feel free to introduce yourself and explore our channels!',
                            inline: false
                        }
                    ],
                    footer: {
                        text: `Member #${member.guild.memberCount}`
                    },
                    timestamp: new Date().toISOString()
                }]
            });
        }
    } catch (error) {
        console.error('Error sending welcome message:', error);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'reminder') {
        await handleReminder(message, args);
    } else if (command === 'reminder-list') {
        await handleReminderList(message);
    } else if (command === 'reminder-delete') {
        await handleReminderDelete(message, args);
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

    // Support all types of quotes from different keyboards
    const quotePatterns = [
        /"([^"]+)"/,           // Straight double quotes
        /"([^"]+)"/,           // Curly left/right double quotes
        /'([^']+)'/,           // Straight single quotes
        /'([^']+)'/,           // Curly left/right single quotes
        /«([^»]+)»/,           // Angle quotes
        /‹([^›]+)›/,           // Single angle quotes
        /„([^"]+)"/,           // German quotes
        /‚([^']+)'/,           // German single quotes
        /「([^」]+)」/,         // Japanese quotes
        /『([^』]+)』/,         // Japanese double quotes
        /《([^》]+)》/,         // Chinese quotes
        /"([^"]+)"/            // Alternative curly quotes
    ];
    
    let titleMatch = null;
    for (const pattern of quotePatterns) {
        titleMatch = message.content.match(pattern);
        if (titleMatch) break;
    }
    
    if (!titleMatch) {
        return message.reply('Please provide a title in quotes! Usage: `!reminder #channel "title" 2h30m`\n(Accepts any type of quotes: " " \' \' « » etc.)');
    }
    
    const title = titleMatch[1];
    const timeString = args[args.length - 1];
    const milliseconds = parseTime(timeString);
    
    if (!milliseconds) {
        return message.reply('Invalid time format! Use formats like: 2h, 30m, 2h30m, 45s');
    }

    const reminder = {
        id: generateShortId(),
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
    const triggerDate = new Date(reminder.triggerAt);
    const dateString = triggerDate.toLocaleString('en-US', { 
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });
    message.reply(`✅ Reminder set! (ID: ${reminder.id})\n"${title}" will be sent to <#${channelId}> in ${timeFormatted}\n📅 Trigger time: ${dateString}`);
}

async function handleWipe(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply('You need Manage Messages permission to use this command!');
    }

    let amount = parseInt(args[0]) || 100;
    
    if (amount < 1) {
        return message.reply('Please provide a number greater than 0!');
    }

    try {
        let totalDeleted = 0;
        amount = Math.min(amount, 1000);
        
        while (amount > 0) {
            const toDelete = Math.min(amount, 100);
            const messages = await message.channel.messages.fetch({ limit: toDelete });
            
            if (messages.size === 0) break;
            
            const deletable = messages.filter(msg => {
                const age = Date.now() - msg.createdTimestamp;
                return age < 14 * 24 * 60 * 60 * 1000;
            });
            
            const old = messages.filter(msg => {
                const age = Date.now() - msg.createdTimestamp;
                return age >= 14 * 24 * 60 * 60 * 1000;
            });
            
            if (deletable.size > 0) {
                if (deletable.size === 1) {
                    await deletable.first().delete();
                    totalDeleted += 1;
                } else {
                    const deleted = await message.channel.bulkDelete(deletable, true);
                    totalDeleted += deleted.size;
                }
            }
            
            for (const [, msg] of old) {
                try {
                    await msg.delete();
                    totalDeleted++;
                } catch (err) {
                    console.error('Could not delete old message:', err);
                }
            }
            
            amount -= messages.size;
            
            if (messages.size < toDelete) break;
        }
        
        const reply = await message.channel.send(`🗑️ Deleted ${totalDeleted} messages!`);
        setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (error) {
        console.error('Error deleting messages:', error);
        message.reply('There was an error deleting messages.');
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

function generateShortId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

async function handleReminderList(message) {
    const guildReminders = reminders.filter(r => r.guildId === message.guild.id);
    
    if (guildReminders.length === 0) {
        return message.reply('No active reminders in this server.');
    }
    
    let response = '📋 **Active Reminders:**\n\n';
    
    for (const reminder of guildReminders) {
        const channel = message.guild.channels.cache.get(reminder.channelId);
        const timeLeft = reminder.triggerAt - Date.now();
        const triggerDate = new Date(reminder.triggerAt).toLocaleString('en-US', {
            timeZone: 'UTC',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        response += `**ID:** ${reminder.id}\n`;
        response += `**Title:** "${reminder.title}"\n`;
        response += `**Channel:** ${channel ? `<#${reminder.channelId}>` : 'Unknown'}\n`;
        response += `**Set by:** <@${reminder.createdBy}>\n`;
        response += `**Triggers at:** ${triggerDate} UTC\n`;
        response += `**Time left:** ${formatTime(Math.max(0, timeLeft))}\n\n`;
    }
    
    const chunks = response.match(/[\s\S]{1,1900}/g) || [];
    for (const chunk of chunks) {
        await message.reply(chunk);
    }
}

async function handleReminderDelete(message, args) {
    if (!args[0]) {
        return message.reply('Please provide a reminder ID! Usage: `!reminder-delete ID`');
    }
    
    const id = args[0].toUpperCase();
    const reminderIndex = reminders.findIndex(r => r.id === id && r.guildId === message.guild.id);
    
    if (reminderIndex === -1) {
        return message.reply(`No reminder found with ID: ${id}`);
    }
    
    const reminder = reminders[reminderIndex];
    
    if (reminder.createdBy !== message.author.id && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply('You can only delete your own reminders (or need Manage Messages permission).');
    }
    
    reminders.splice(reminderIndex, 1);
    await storage.writeJSON('reminders.json', { reminders });
    
    message.reply(`✅ Deleted reminder "${reminder.title}" (ID: ${id})`);
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
                const guild = await client.guilds.fetch(reminder.guildId).catch(() => null);
                if (!guild) {
                    console.error(`Failed to fetch guild ${reminder.guildId} for reminder ${reminder.id}`);
                    continue;
                }

                const channel = await guild.channels.fetch(reminder.channelId).catch(() => null);
                if (!channel) {
                    console.error(`Failed to fetch channel ${reminder.channelId} for reminder ${reminder.id}`);
                    continue;
                }

                await channel.send(`⏰ **Reminder:** ${reminder.title}\n*Set by <@${reminder.createdBy}>*`);
                console.log(`Reminder ${reminder.id} triggered successfully`);
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
        }, {
            timezone: event.timezone || 'UTC'
        });
        
        console.log(`Scheduled daily event "${event.name}" at ${event.time} ${event.timezone || 'UTC'}`);
    }
    
    // Add the specific daily reminder for channel 1384261707681103995 at 2:30 AM UTC+1
    cron.schedule('30 1 * * *', async () => {
        try {
            const channel = client.channels.cache.get('1437916211932299325');
            if (channel) {
                await channel.send({
                    content: '@everyone',
                    embeds: [{
                        title: '🏟️ ARENA TIME!',
                        description: 'Don\'t forget to complete your Dark War arena battles today! 🗡️',
                        color: 0xFF4500,
                        fields: [
                            {
                                name: 'Daily Arena Reminder',
                                value: 'Complete your arena battles to maximize your rewards and climb the rankings!',
                                inline: false
                            }
                        ]
                    }]
                });
            }
        } catch (error) {
            console.error('Error sending daily arena reminder:', error);
        }
    }, {
        timezone: 'UTC'
    });
    
    console.log('Scheduled daily arena reminder at 2:30 AM UTC+1 (1:30 AM UTC)');
    
    // Add daily mental health check-in for channel 1385659874909753344 at 3:00 AM UTC+1
    cron.schedule('0 2 * * *', async () => {
        try {
            const channel = client.channels.cache.get('1385659874909753344');
            if (channel) {
                const message = await channel.send({
                    embeds: [{
                        title: '🌟 Daily Mental Health Check-In',
                        description: 'How are you feeling today? React to let us know!',
                        color: 0x7289DA,
                        fields: [
                            {
                                name: 'Emotional States',
                                value: '🩷 - Everything is fine\n🧡 - Feeling a bit "meh" today\n💙 - Feeling bad/sad\n💜 - Feeling worried/anxious\n❤️ - Feeling angry/stressed\n💚 - Feeling happy',
                                inline: false
                            },
                            {
                                name: 'Want to talk?',
                                value: '✅ - I want to talk about it\n❌ - I don\'t want to talk about it',
                                inline: false
                            }
                        ],
                        footer: {
                            text: 'Remember: It\'s okay not to be okay. Your TDC family is here for you! 💪'
                        }
                    }]
                });
                
                // Add reactions for easy interaction
                const reactions = ['🩷', '🧡', '💙', '💜', '❤️', '💚', '✅', '❌'];
                for (const reaction of reactions) {
                    await message.react(reaction);
                }
            }
        } catch (error) {
            console.error('Error sending daily mental health check-in:', error);
        }
    }, {
        timezone: 'UTC'
    });
    
    console.log('Scheduled daily mental health check-in at 3:00 AM UTC+1 (2:00 AM UTC)');
}

client.login(process.env.DISCORD_TOKEN);

const express = require('express');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('TDC Bot is running!');
});

app.get('/ping', (req, res) => {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    res.json({
        status: 'alive',
        uptime: `${hours}h ${minutes}m`,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
    
    // Self-ping mechanism to prevent Render from sleeping
    if (process.env.RENDER_EXTERNAL_URL) {
        const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes
        
        setInterval(() => {
            const url = `${process.env.RENDER_EXTERNAL_URL}/ping`;
            https.get(url, (res) => {
                console.log(`Self-ping successful: ${res.statusCode}`);
            }).on('error', (err) => {
                console.error('Self-ping failed:', err.message);
            });
        }, PING_INTERVAL);
        
        console.log('Self-ping mechanism activated to prevent sleep');
    }
});