# TDC Discord Bot

A Discord bot for the TDC Alliance with reminder and channel management features.

## Features

- **Manual Reminders**: Set reminders with `!reminder #channel "title" 2h30m`
- **Wipe Command**: Clear channel messages with `!wipe [number]`
- **Daily Automated Events**: Configure recurring daily reminders
- **Persistent Storage**: All data stored in JSON files

## Setup

1. **Discord Developer Portal**:
   - Create application at https://discord.com/developers/applications
   - Get bot token from Bot section
   - Enable MESSAGE CONTENT INTENT in Bot settings

2. **Local Setup**:
   ```bash
   npm install
   ```

3. **Configure .env**:
   - Add your bot token to `.env` file

4. **Invite Bot**:
   - Use OAuth2 URL Generator with bot scope
   - Required permissions: Send Messages, Manage Messages, Read Message History

## Commands

- `!reminder #channel "title" 2h30m` - Set a reminder
- `!wipe [number]` - Delete messages (requires Manage Messages permission)

## Deployment on Render

1. Push to GitHub
2. Create new Web Service on Render
3. Connect GitHub repository
4. Add environment variable: `DISCORD_TOKEN`
5. Deploy

## Configuration Files

- `data/config.json` - Bot settings
- `data/reminders.json` - Active reminders
- `data/events.json` - Daily scheduled events