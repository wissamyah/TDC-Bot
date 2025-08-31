# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TDC-Bot is a Discord bot for the TDC Alliance server that provides reminder functionality, channel management, and automated daily events. The bot is designed to run on Render's free tier with anti-sleep mechanisms.

## Development Commands

```bash
# Start the bot
npm start

# Development mode (same as start)
npm dev

# Install dependencies
npm install
```

## Core Architecture

### Main Components

- **index.js**: Main bot file containing Discord.js client setup, command handlers, and Express health server
- **utils/storage.js**: JSON file-based storage system for persistent data
- **data/**: JSON configuration and data files
  - `config.json`: Bot configuration (prefix, intervals, etc.)
  - `reminders.json`: Active reminder storage
  - `events.json`: Daily scheduled events configuration

### Bot Features

1. **Manual Reminders**: Users can set timed reminders with `!reminder #channel "title" 2h30m`
2. **Message Management**: `!wipe [number]` command for bulk message deletion
3. **Daily Events**: Cron-scheduled recurring reminders configured in events.json
4. **Health Monitoring**: Express server with `/ping` endpoint for Render deployment

### Key Functions

- **parseTime()**: Converts time strings (2h30m) to milliseconds
- **handleReminder()**: Processes reminder creation with multi-quote support
- **startReminderCheck()**: Interval-based reminder triggering system
- **setupDailyEvents()**: Configures cron jobs from events.json

### Storage System

The bot uses a simple JSON file storage system via `utils/storage.js`:
- All data persists in the `data/` directory
- Storage class handles file creation, reading, and atomic writes
- No database required - suitable for single-instance deployment

### Discord Permissions Required

- Send Messages
- Manage Messages (for wipe command)
- Read Message History

### Environment Variables

- `DISCORD_TOKEN`: Bot token from Discord Developer Portal
- `PORT`: Server port (defaults to 3000)
- `RENDER_EXTERNAL_URL`: Used for anti-sleep self-ping mechanism

### Deployment Considerations

- Designed for Render free tier with self-ping mechanism to prevent sleeping
- Health check endpoint at `/` and `/ping`
- All times stored in UTC, with timezone handling in cron schedules
- Activity rotation every 5 minutes to show bot is active

### Command Processing

Commands use a simple prefix-based system (`!` by default). The bot supports:
- Multiple quote types for international keyboards
- Permission checking for administrative commands
- Guild-scoped reminder management
- Short ID generation for reminder tracking