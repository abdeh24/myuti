# Myuti

WhatsApp bot open source project built with Node.js using WhiskeySockets/Baileys library.

## Features

### Tools

- Image/Video/Gif to Sticker
- Roblox Avatar Downloader
- Video/Audio Downloader

### Games

- Afk, that one guy who never join in conversation
- Roll token, gamble away your precious token
- TikTakTo, XOXOXOXOXOXOXOXOXO

## Prerequisites

You need these installed on your system:
- Node.js
- FFmpeg

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/abdeh24/myuti.git
   cd myuti
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file:
   ```env
   PHONE_NUMBER=6200000000000
   OWNER_PHONE_NUMBER=6200000000000
   RBX_KEY=your_api_key_here
   ```

   **Optional:** To use Roblox features, create an API key at https://create.roblox.com/dashboard/credentials with `thumbnails:read` access permissions enabled.

4. Start the bot:
   ```bash
   npm start
   ```

   > **Note:** After starting the bot, you will be prompted to enter the pairing code from your WhatsApp account.

## Tech Stack

- Node.js
- WhiskeySockets/Baileys

## License

This project is licensed under the ISC License.

## Contributing

Contributions are welcome! Feel free to fork the repository and submit pull requests.
