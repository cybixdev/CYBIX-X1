// CYBIX V1 WhatsApp Bot - All logic in one file, modular style
require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore, fetchLatestBaileysVersion, DisconnectReason, jidNormalizedUser } = require('@whiskeysockets/baileys');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Config/Env ---
const OWNER_ID = process.env.OWNER_ID || '';
const BOT_NAME = process.env.BOT_NAME || 'CYBIX V1';
const DEFAULT_PREFIX = process.env.PREFIX || '.,/';
const PREFIXES = new Set(DEFAULT_PREFIX.split(','));
const BANNER_URL = process.env.BANNER || 'https://files.catbox.moe/7dozqn.jpg';
const SESSION_ID = process.env.SESSION_ID;
const PORT = process.env.PORT || 3000;
const VERSION = '1.0.0';

// --- Persistence (in-memory + file fallback) ---
let settings = {
  prefix: Array.from(PREFIXES)[0],
  botName: BOT_NAME,
  banner: BANNER_URL
};
const SETTINGS_FILE = './cybix-settings.json';
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE)) };
    settings.prefix = settings.prefix || Array.from(PREFIXES)[0];
  }
} catch (e) {}
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// --- Store for sessions/users (in-memory) ---
const users = new Set();
const logs = [];
let startTime = Date.now();

// --- Banner Menu ---
const menuText = () => `╭━───〔 ${settings.botName} 〕───━━╮
✦ prefix : ${settings.prefix}
✦ owner : wa.me/${OWNER_ID}
✦ user : {user}
✦ user id : {user_id}
✦ users : {users}
✦ speed : {speed} ms
✦ status : Online
✦ plugins : 15
✦ version : ${VERSION}
✦ time now : {time}
✦ date now : {date}
✦ memory : {memory} MB
╰───────────────────╯
╭━━【 AI MENU 】━━
• chatgpt
• openai
• blackbox
• gemini
• deepseek
• text2img
╰━━━━━━━━━━━━━━━
╭━━【 DL MENU 】━━
• apk
• spotify
• gitclone
• mediafire
• play
• gdrive
╰━━━━━━━━━━━━━━━
╭━━【 OTHER MENU 】━━
• repo
• ping
• runtime
╰━━━━━━━━━━━━━━━
╭━━【 ADULT MENU 】━━
• xvideosearch
• xnxxsearch
• dl-xnxx
• dl-xvideo
╰━━━━━━━━━━━━━━━
╭━━【 DEV MENU 】━━
• stats
• listusers
• logs
• setbanner
• setprefix
• setbotname
╰━━━━━━━━━━━━━━━

POWERED BY CYBIX DEVS`;

// --- Helper: send banner + caption ---
async function sendBanner(sock, jid, caption, userJid) {
  const user = userJid ? userJid.split('@')[0] : '';
  const text = caption
    .replace('{user}', user)
    .replace('{user_id}', userJid || '')
    .replace('{users}', users.size)
    .replace('{speed}', Date.now() - startTime)
    .replace('{time}', new Date().toLocaleTimeString('en-US', { hour12: false }))
    .replace('{date}', new Date().toLocaleDateString('en-GB'))
    .replace('{memory}', (process.memoryUsage().rss / 1024 / 1024).toFixed(2));
  await sock.sendMessage(jid, {
    image: { url: settings.banner },
    caption: text
  });
}

// --- Baileys Auth State (SESSION_ID from .env, no QR in deployment) ---
async function getAuthState() {
  const SESSION_FILE = './cybix-session.json';
  if (SESSION_ID) {
    try {
      // Support: SESSION_ID as JSON or base64 JSON
      let json;
      try { json = JSON.parse(SESSION_ID); }
      catch {
        json = JSON.parse(Buffer.from(SESSION_ID, 'base64').toString('utf-8'));
      }
      fs.writeFileSync(SESSION_FILE, JSON.stringify(json));
      return useMultiFileAuthState(path.resolve(SESSION_FILE));
    } catch (e) {
      console.error('Invalid SESSION_ID. QR login required.');
    }
  }
  return useMultiFileAuthState('./cybix-session');
}

// --- Command Plugins ---
const Plugins = {
  menu: {
    help: 'Show menu',
    run: async (msg, sock) => {
      await sendBanner(sock, msg.from, menuText(), msg.sender);
    }
  },
  start: {
    help: 'Show menu',
    run: async (msg, sock) => {
      await sendBanner(sock, msg.from, menuText(), msg.sender);
    }
  },
  ping: {
    help: 'Bot speed test',
    run: async (msg, sock) => {
      await sendBanner(sock, msg.from, `Pong! Speed: ${Date.now() - msg.timestamp} ms`, msg.sender);
    }
  },
  runtime: {
    help: 'Show bot uptime',
    run: async (msg, sock) => {
      const ms = Date.now() - startTime;
      const h = Math.floor(ms / 3600000), m = Math.floor(ms/60000)%60, s = Math.floor(ms/1000)%60;
      await sendBanner(sock, msg.from, `Uptime: ${h}h ${m}m ${s}s`, msg.sender);
    }
  },
  repo: {
    help: 'Show repository link',
    run: async (msg, sock) => {
      await sendBanner(sock, msg.from, `Repo: https://github.com/your-username/cybix-whatsapp-bot`, msg.sender);
    }
  },
  // --- AI Commands ---
  chatgpt: {
    help: 'ChatGPT AI',
    run: async (msg, sock, args) => {
      const q = args.join(' ');
      if (!q) return sendBanner(sock, msg.from, 'Usage: chatgpt <your question>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/ai/gpt?apikey=prince&q=${encodeURIComponent(q)}`);
        await sendBanner(sock, msg.from, data.result || 'No response', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'AI API Error', msg.sender);
      }
    }
  },
  openai: {
    help: 'OpenAI',
    run: async (msg, sock, args) => {
      const q = args.join(' ');
      if (!q) return sendBanner(sock, msg.from, 'Usage: openai <your question>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/ai/openai?apikey=prince&q=${encodeURIComponent(q)}`);
        await sendBanner(sock, msg.from, data.result || 'No response', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'AI API Error', msg.sender);
      }
    }
  },
  blackbox: {
    help: 'Blackbox AI',
    run: async (msg, sock, args) => {
      const q = args.join(' ');
      if (!q) return sendBanner(sock, msg.from, 'Usage: blackbox <your question>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/ai/blackbox?apikey=prince&q=${encodeURIComponent(q)}`);
        await sendBanner(sock, msg.from, data.result || 'No response', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'AI API Error', msg.sender);
      }
    }
  },
  gemini: {
    help: 'Gemini AI',
    run: async (msg, sock, args) => {
      const q = args.join(' ');
      if (!q) return sendBanner(sock, msg.from, 'Usage: gemini <your question>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/ai/geminiaipro?apikey=prince&q=${encodeURIComponent(q)}`);
        await sendBanner(sock, msg.from, data.result || 'No response', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'AI API Error', msg.sender);
      }
    }
  },
  deepseek: {
    help: 'Deepseek AI',
    run: async (msg, sock, args) => {
      const q = args.join(' ');
      if (!q) return sendBanner(sock, msg.from, 'Usage: deepseek <your question>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/ai/deepseek-v3?apikey=prince&q=${encodeURIComponent(q)}`);
        await sendBanner(sock, msg.from, data.result || 'No response', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'AI API Error', msg.sender);
      }
    }
  },
  text2img: {
    help: 'Text to Image',
    run: async (msg, sock, args) => {
      const prompt = args.join(' ');
      if (!prompt) return sendBanner(sock, msg.from, 'Usage: text2img <prompt>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/ai/text2img?apikey=prince&prompt=${encodeURIComponent(prompt)}`);
        await sock.sendMessage(msg.from, {
          image: { url: data.url || settings.banner },
          caption: data.result || 'No result'
        });
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  // --- Downloaders ---
  apk: {
    help: 'APK Downloader',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: apk <app name>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/download/apk?apikey=prince&q=${encodeURIComponent(args.join(' '))}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  spotify: {
    help: 'Spotify Downloader',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: spotify <url>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/download/spotify?apikey=prince&q=${encodeURIComponent(args[0])}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  gitclone: {
    help: 'Git Clone',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: gitclone <repo url>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/download/gitclone?apikey=prince&q=${encodeURIComponent(args[0])}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  mediafire: {
    help: 'Mediafire Downloader',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: mediafire <url>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/download/mediafire?apikey=prince&q=${encodeURIComponent(args[0])}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  play: {
    help: 'Play Downloader',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: play <song name>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/download/play?apikey=prince&q=${encodeURIComponent(args.join(' '))}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  gdrive: {
    help: 'Google Drive Downloader',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: gdrive <url>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/download/gdrive?apikey=prince&q=${encodeURIComponent(args[0])}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  // --- Adult (all princetechn API) ---
  xvideosearch: {
    help: 'Xvideos Search',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: xvideosearch <query>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/adult/xvideos-search?apikey=prince&q=${encodeURIComponent(args.join(' '))}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  xnxxsearch: {
    help: 'XNXX Search',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: xnxxsearch <query>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/adult/xnxx-search?apikey=prince&q=${encodeURIComponent(args.join(' '))}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  'dl-xnxx': {
    help: 'XNXX Downloader',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: dl-xnxx <url>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/adult/xnxx-download?apikey=prince&q=${encodeURIComponent(args[0])}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  'dl-xvideo': {
    help: 'Xvideos Downloader',
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: dl-xvideo <url>', msg.sender);
      try {
        const { data } = await axios.get(`https://api.princetechn.com/api/adult/xvideos-download?apikey=prince&q=${encodeURIComponent(args[0])}`);
        await sendBanner(sock, msg.from, data.result || 'No result', msg.sender);
      } catch (e) {
        await sendBanner(sock, msg.from, 'API Error', msg.sender);
      }
    }
  },
  // --- Owner/Dev only ---
  stats: {
    help: 'Show bot stats',
    owner: true,
    run: async (msg, sock) => {
      await sendBanner(sock, msg.from, `Users: ${users.size}\nUptime: ${(Date.now()-startTime)/1000}s\nRAM: ${(process.memoryUsage().rss/1024/1024).toFixed(2)}MB`, msg.sender);
    }
  },
  listusers: {
    help: 'List all known users',
    owner: true,
    run: async (msg, sock) => {
      await sendBanner(sock, msg.from, 'Users:\n' + Array.from(users).join('\n'), msg.sender);
    }
  },
  logs: {
    help: 'Show latest logs',
    owner: true,
    run: async (msg, sock) => {
      await sendBanner(sock, msg.from, 'Logs:\n' + logs.slice(-10).join('\n'), msg.sender);
    }
  },
  setprefix: {
    help: 'Set command prefix',
    owner: true,
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: setprefix <prefix>', msg.sender);
      settings.prefix = args[0];
      saveSettings();
      await sendBanner(sock, msg.from, `Prefix set to: ${settings.prefix}`, msg.sender);
    }
  },
  setbanner: {
    help: 'Set banner image',
    owner: true,
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: setbanner <url>', msg.sender);
      settings.banner = args[0];
      saveSettings();
      await sendBanner(sock, msg.from, `Banner updated.`, msg.sender);
    }
  },
  setbotname: {
    help: 'Set bot name',
    owner: true,
    run: async (msg, sock, args) => {
      if (!args[0]) return sendBanner(sock, msg.from, 'Usage: setbotname <name>', msg.sender);
      settings.botName = args.join(' ');
      saveSettings();
      await sendBanner(sock, msg.from, `Bot name set to: ${settings.botName}`, msg.sender);
    }
  }
};

// --- Command Parsing ---
function parseCommand(body, isOwner) {
  let prefix = settings.prefix || '.';
  if (!body.startsWith(prefix)) return { cmd: null };
  const [cmd, ...args] = body.slice(prefix.length).trim().split(/\s+/);
  if (!Plugins[cmd]) return { cmd: null };
  if (Plugins[cmd].owner && !isOwner) return { cmd: null, ownerOnly: true };
  return { cmd, args };
}

// --- WhatsApp Main ---
async function startBot() {
  const { state, saveCreds } = await getAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const store = makeInMemoryStore({});
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: !SESSION_ID,
    version,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    getMessage: async key => null
  });

  store.bind(sock.ev);

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
      startBot();
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages?.[0];
      if (!msg?.message || msg.key.fromMe) return;
      const from = msg.key.remoteJid;
      const sender = msg.key.participant || msg.key.fromMe ? sock.user.id : msg.key.remoteJid;
      let body = '';
      if (msg.message.conversation) body = msg.message.conversation;
      else if (msg.message.extendedTextMessage) body = msg.message.extendedTextMessage.text;
      else if (msg.message.imageMessage && msg.message.imageMessage.caption) body = msg.message.imageMessage.caption;
      if (!body) return;

      users.add(sender);
      logs.push(`[${new Date().toISOString()}] ${sender}: ${body}`);
      if (logs.length > 100) logs.shift();

      const isOwner = sender.replace(/\D/g, '') === OWNER_ID.replace(/\D/g, '');
      const { cmd, args, ownerOnly } = parseCommand(body, isOwner);

      if (!cmd) {
        if (ownerOnly) await sendBanner(sock, from, `Owner-only command.`, sender);
        return;
      }

      const plugin = Plugins[cmd];
      await plugin.run({ from, sender, body, args, timestamp: msg.messageTimestamp * 1000 }, sock, args);
    } catch (e) {
      // Always reply with banner + error
      try { await sendBanner(sock, m.messages[0].key.remoteJid, 'Error: ' + (e?.message || e)); } catch {}
    }
  });

  // Health check for Render
  express().get('/', (req, res) => res.send('CYBIX BOT OK')).listen(PORT, () => {
    console.log(`CYBIX BOT running on port ${PORT}`);
  });

  // Keep-alive (for Termux/Heroku)
  setInterval(() => {}, 60 * 1000);
}

startBot();