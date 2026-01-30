// index.js
// Requisitos: Discord.js v14, megadb, express, axios
// Uso: copiar/pegar. Asegúrate de tener TOKEN en .env y haber instalado dependencias:
// npm i discord.js megadb express axios dotenv

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import axios from 'axios';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Collection,
  PermissionFlagsBits
} from 'discord.js';
import { crearDB } from 'megadb';

/* ───────── CONFIG ───────── */
const CONFIG = {
  PREFIJO: '!',
  MAIN_GUILD_ID: '1340442398442127480',
  SERVER_IP: 'powermax.hidenmc.com',
  SERVER_PORT: '24818',
  VERSIONS: '1.13 a 1.21.11',
  CANALES: {
    TICKETS: '『📖』tickets',
    NIVELES: '『🆙』niveles',
    BIENVENIDOS: '『👋』bienvenidos',
    DESPEDIDAS: '『😔』despedidas',
    SANCIONES: '『🔇』silenciados',
    DESILENCIADOS: '『🔉』desilenciados',
    BANEOS: '『🔨』baneos',
    BANEOS_TEMP: '『⏳』baneos-temporales',
    INVITACIONES: '『🗓』invitaciones',
    DESBANEOS: '『🔓』desbaneos',
    ANUNCIOS: '『📣』anuncios',
    NUEVO: '『🎊』nuevo'
  },
  IMAGENES: {
    PANEL_TICKET: 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png',
    TICKET_INTERIOR: 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg'
  }
};

/* ───────── PERSISTENCIA LOCAL ───────── */
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const TEMPBANS_FILE = path.join(DATA_DIR, 'tempbans.json');
const SANCTIONS_FILE = path.join(DATA_DIR, 'sanctions.json');

function loadJSON(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || 'null') ?? defaultValue;
  } catch (err) {
    console.error('Error leyendo JSON', filePath, err);
    return defaultValue;
  }
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error escribiendo JSON', filePath, err);
  }
}

let tempBans = loadJSON(TEMPBANS_FILE, []);
let sanctions = loadJSON(SANCTIONS_FILE, []);

/* ───────── DISCORD CLIENT ───────── */
/* Intents necesarios: MessageContent, GuildMessages, Guilds, etc. */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── UTILES / COLECCIONES ───────── */
const invites = new Collection();
const spamMap = new Map();
// cooldown map para XP: key = userId (puedes usar guildId:userId si quieres por servidor)
const xpCooldown = new Map();
// megadb persistente para niveles (no se pierde)
const nivelesDB = new crearDB('niveles'); // persistente en megadb
// otros mapas para manejo de tiempoouts, tickets, etc.
const activeUnbanTimeouts = new Map();
const ticketInactivityTimers = new Map();

/* ───────── UTILIDADES ───────── */
function isStaffMember(member) {
  if (!member || !member.roles) return false;
  const STAFF_ROLE_NAMES = ['Staff', 'Admin', 'Mod', 'Co-Owner', 'Owner', 'Helper'];
  return member.roles.cache.some(r => STAFF_ROLE_NAMES.includes(r.name));
}

function savePersistentFiles() {
  saveJSON(TEMPBANS_FILE, tempBans);
  saveJSON(SANCTIONS_FILE, sanctions);
}

/* ───────── KEEP-ALIVE (EXPRESS + PING) ───────── */
const app = express();
const PORT = process.env.PORT_KEEPALIVE ? Number(process.env.PORT_KEEPALIVE) : 10000;

// simple route
app.get('/', (req, res) => {
  res.send('Bot activo correctamente.'); // para comprobar desde navegador
});

app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server escuchando en puerto ${PORT}`);
});

// Ping a la URL del bot cada 5 minutos para evitar suspensión.
// Puedes definir KEEPALIVE_URL en .env si quieres que sea una URL pública (p.ej. https://<project>.onrender.com/)
const KEEPALIVE_URL = process.env.KEEPALIVE_URL || `http://localhost:${PORT}/`;

setInterval(async () => {
  try {
    await axios.get(KEEPALIVE_URL);
    console.log('🔁 Ping Keep-Alive enviado a:', KEEPALIVE_URL);
  } catch (err) {
    console.error('❌ Error en ping Keep-Alive:', err?.message ?? err);
  }
}, 5 * 60 * 1000);

/* ───────── EVENTOS BÁSICOS ───────── */
client.once('ready', async () => {
  console.log(`✅ Bot listo: ${client.user.tag}`);
  // crear DB si no existe (megadb crea automaticamente, pero podemos asegurarlo)
  try {
    if (!await nivelesDB.tiene('__init__')) {
      // solo una marca vacía, opcional
      await nivelesDB.establecer('__init__', true);
    }
  } catch (err) {
    // si megadb está en inglés (has/set/get) intentaremos en fallback
    try {
      if (!await nivelesDB.has('__init__')) {
        await nivelesDB.set('__init__', true);
      }
    } catch (e) {
      console.warn('⚠️ No se pudo inicializar nivelesDB (megadb). Asegúrate de tener megadb configurado.', e?.message ?? e);
    }
  }
});

/* ───────── MESSAGE CREATE (PRIORIDAD: !ip / !tienda) ───────── */
client.on('messageCreate', async (message) => {
  try {
    // 1) filtros básicos
    if (!message || !message.guild) return;
    if (message.author?.bot) return;

    const raw = String(message.content || '').trim();
    if (!raw) return;
    const content = raw.toLowerCase();

    // Extraer comando / palabra (aceptar "!ip", "ip", "!tienda", "tienda", y variantes)
    const firstToken = raw.split(/\s+/)[0].toLowerCase();
    const normalized = firstToken.startsWith(CONFIG.PREFIJO) ? firstToken.slice(CONFIG.PREFIJO.length) : firstToken;

    // ─────────────────────────────────────────────────────────────────
    // PRIORIDAD MÁXIMA: !ip / ip  (respuesta inmediata y return)
    // ─────────────────────────────────────────────────────────────────
    if (normalized === 'ip') {
      // Respuesta compacta y rápida
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🌐 IP DEL SERVIDOR')
            .setDescription(
              `**Java:** \`${CONFIG.SERVER_IP}\` (${CONFIG.VERSIONS})\n` +
              `**Bedrock:** \`${CONFIG.SERVER_IP}\` (Puerto: \`${CONFIG.SERVER_PORT}\`)\n\n` +
              `**Tienda:** https://tienda.powermax.com`
            )
            .setColor(0x00AE86)
            .setTimestamp()
        ]
      });
      return; // IMPORTANTE: return inmediato para evitar trabajo extra
    }

    // ─────────────────────────────────────────────────────────────────
    // PRIORIDAD MÁXIMA: !tienda / tienda  (respuesta inmediata y return)
    // ─────────────────────────────────────────────────────────────────
    if (normalized === 'tienda' || normalized === 'shop' || content.includes('https://tienda.powermax.com')) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛒 TIENDA OFICIAL')
            .setDescription('Visita la tienda oficial del servidor:\nhttps://tienda.powermax.com')
            .setURL('https://tienda.powermax.com')
            .setColor(0xFFD166)
            .setTimestamp()
        ]
      });
      return; // IMPORTANTE: salida inmediata
    }

    // Si llegamos aquí, NO era un comando ip/tienda; podemos continuar a tareas ligeras.

    // ─────────────────────────────────────────────────────────────────
    // SISTEMA DE NIVELES (persistente con megadb) - cooldown 1 minuto por usuario
    // Debe ir después de los checks de comandos prioritarios
    // ─────────────────────────────────────────────────────────────────
    const userId = message.author.id;

    // cooldown por usuario (1 minuto)
    const COOLDOWN_MS = 60 * 1000;
    const last = xpCooldown.get(userId) || 0;
    const now = Date.now();

    if (now - last < COOLDOWN_MS) {
      // Si está en cooldown, no otorgamos XP — simplemente salimos (no es necesario enviar nada)
      return;
    }
    xpCooldown.set(userId, now);

    // Obtenemos/creamos datos del usuario en megadb
    let perfil = null;
    try {
      // Intentamos usar métodos en español de megadb: tiene / obtener / establecer
      if (await nivelesDB.tiene(userId)) {
        perfil = await nivelesDB.obtener(userId);
      } else {
        perfil = { xp: 0, nivel: 1 };
        await nivelesDB.establecer(userId, perfil);
      }
    } catch (err) {
      // fallback si la API usa métodos en inglés (has/get/set)
      try {
        if (await nivelesDB.has(userId)) {
          perfil = await nivelesDB.get(userId);
        } else {
          perfil = { xp: 0, nivel: 1 };
          await nivelesDB.set(userId, perfil);
        }
      } catch (e) {
        console.error('❌ Error accediendo a megadb (niveles):', e?.message ?? e);
        // Como fallback temporal, no rompemos el bot: usamos un Map in-memory (no persistente)
        if (!global._niveles_memory) global._niveles_memory = new Map();
        if (global._niveles_memory.has(userId)) {
          perfil = global._niveles_memory.get(userId);
        } else {
          perfil = { xp: 0, nivel: 1 };
          global._niveles_memory.set(userId, perfil);
        }
      }
    }

    // Otorgar XP aleatoria
    const xpGanada = Math.floor(Math.random() * 10) + 5; // 5-14 XP por mensaje (ajustable)
    perfil.xp = (perfil.xp || 0) + xpGanada;
    const xpNecesaria = (perfil.nivel || 1) * 100;

    if (perfil.xp >= xpNecesaria) {
      perfil.nivel = (perfil.nivel || 1) + 1;
      perfil.xp = perfil.xp - xpNecesaria;

      // Enviar anuncio de subida de nivel en canal general o canal de niveles si existe
      try {
        const canalNombre = CONFIG.CANALES.NIVELES;
        const canal = message.guild.channels.cache.find(c => c.name === canalNombre && c.isTextBased());
        const destino = canal || message.channel;
        await destino.send({
          content: `🎉 **${message.author.username}** ha subido al nivel **${perfil.nivel}**!`
        });
      } catch (err) {
        // Si falla el envío, mostrar en el mismo canal
        try { await message.channel.send(`🎉 **${message.author.username}** ha subido al nivel **${perfil.nivel}**!`); } catch (e) { /* ignore */ }
      }
    }

    // Guardar en megadb (usar español o fallback inglés)
    try {
      await nivelesDB.establecer(userId, perfil);
    } catch (err) {
      try {
        await nivelesDB.set(userId, perfil);
      } catch (e) {
        // fallback in-memory
        if (!global._niveles_memory) global._niveles_memory = new Map();
        global._niveles_memory.set(userId, perfil);
      }
    }

    // FIN del flow principal del messageCreate

  } catch (error) {
    // Capturamos errores inesperados para evitar que el bot deje de procesar mensajes
    console.error('❌ Error en messageCreate:', error?.stack ?? error);
  }
});

/* ───────── MISC: HANDLES Y GUARDADO PERIÓDICO ───────── */
// Guardar archivos JSON de persistencia de vez en cuando (por si se modifican)
setInterval(() => {
  try {
    savePersistentFiles();
  } catch (err) {
    console.error('Error guardando persistencia local:', err);
  }
}, 60 * 1000); // cada minuto

// Manejo básico de errores no atrapados
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  // No cerramos automáticamente para que el hosting pueda reiniciar si es necesario.
});

/* ───────── LOGIN ───────── */
(async () => {
  try {
    const token = process.env.TOKEN;
    if (!token) {
      console.error('❌ TOKEN no encontrado en .env (process.env.TOKEN). Coloca tu token y reinicia.');
      process.exit(1);
    }
    await client.login(token);
    console.log('🔐 Intentando iniciar sesión en Discord...');
  } catch (err) {
    console.error('❌ Error al loguear el bot:', err);
    process.exit(1);
  }
})();

