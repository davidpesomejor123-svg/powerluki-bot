// index.js — Power Lucky Bot (CORREGIDO Y SIN LAG)
import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
  ActivityType,
  PermissionsBitField,
} from 'discord.js';

/* ───────── CONFIGURACIÓN ───────── */
const ALLOWED_SERVERS = ['1340442398442127480', '1458243569075884219'];

const CONFIG = {
  TOKEN: process.env.TOKEN,
  CHANNELS: {
    ANUNCIOS: '1340756895618699416',
    NUEVO: '1340757162573562007',
    BANS: '1340453829124034580',
    TEMPBAN: '1457911150854541423',
    MUTE: '1453435158563913820',
    UNMUTE: '1453521869968769106',
    UNBAN: '1457912738473967790',
    CAMBIOS: '1340757615407272068',
    XP: '1340500687670476810',
    WELCOME: '1340454070070022205',
    LEAVE: '1340475418091847791'
  },
  SERVER_IP: 'play.powerlucky.net',
};

const DB_DIR = path.resolve('./data');
if (!fsSync.existsSync(DB_DIR)) fsSync.mkdirSync(DB_DIR);
const TEMPBANS_FILE = path.join(DB_DIR, 'tempbans.json');
const XP_FILE = path.join(DB_DIR, 'xp.json');

/* ───────── PERSISTENCIA (SIN BLOQUEOS) ───────── */
let tempBans = {};
let xpData = {};
let xpNeedsSave = false;

const loadData = () => {
  try {
    if (fsSync.existsSync(TEMPBANS_FILE)) tempBans = JSON.parse(fsSync.readFileSync(TEMPBANS_FILE, 'utf8') || '{}');
    if (fsSync.existsSync(XP_FILE)) xpData = JSON.parse(fsSync.readFileSync(XP_FILE, 'utf8') || '{}');
  } catch (e) { console.error("❌ Error cargando DB:", e); }
};
loadData();

async function saveData(file, data) {
  try {
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error(`❌ Error guardando ${file}:`, e); }
}

setInterval(() => {
  if (xpNeedsSave) {
    saveData(XP_FILE, xpData);
    xpNeedsSave = false;
  }
}, 30000);

/* ───────── UTILIDADES ───────── */
function parseDuration(str) {
  if (!str) return null;
  const regex = /(\d+)\s*(d|h|m)/g;
  let match, totalMs = 0;
  while ((match = regex.exec(str.toLowerCase())) !== null) {
    const n = parseInt(match[1]);
    const unit = match[2];
    if (unit === 'd') totalMs += n * 86400000;
    else if (unit === 'h') totalMs += n * 3600000;
    else if (unit === 'm') totalMs += n * 60000;
  }
  return totalMs > 0 ? totalMs : null;
}

const formatDate = (ts) => new Date(ts).toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa' });

function fillTemplate(template, map) {
  let out = template;
  for (const k in map) out = out.replace(new RegExp(`<${k}>`, 'g'), map[k]);
  return out;
}

/* ───────── PLANTILLAS ───────── */
const TEMPLATES = {
  BAN: `╔════════════════════════════════════╗\n      🚫 USUARIO BANEADO 🚫\n╚════════════════════════════════════╝\n\n ●--👤 Usuario: <mención_usuario>\n ●--🆔 ID: <id_del_usuario>\n ●--⚖️ Razón: <razón_del_ban>\n ●--🛡️ Moderador: <moderador>\n\n _¡Las reglas se respetan!_`,
  TEMPBAN: `╔════════════════════════════════════╗\n      ⏳ ACCESO SUSPENDIDO ⏳\n╚════════════════════════════════════╝\n\n ●--👤 Usuario: <mención_usuario>\n ●--🆔 ID: <id_del_usuario>\n ●--⚖️ Razón: <razón_del_ban>\n ●--⏱️ Duración: <tiempo>\n ●--📅 Expira: <expira>\n\n _¡Cumple tu tiempo y vuelve mejor!_`,
  MUTE: `╔════════════════════════════════════╗\n      🔇 USUARIO SILENCIADO 🔇\n╚════════════════════════════════════╝\n\n ●--👤 Usuario: <mención_usuario>\n ●--⚖️ Razón: <razón_del_mute>\n ●--⏱️ Tiempo: <duración_del_mute>\n ●--🛡️ Moderador: <moderador>`,
  UNMUTE: `╔════════════════════════════════════╗\n      🔊 SILENCIO REMOVIDO 🔊\n╚════════════════════════════════════╝\n\n ●--👤 Usuario: <mención_usuario>\n ●--🛡️ Moderador: <moderador>`,
  UNBAN: `╔════════════════════════════════════╗\n      🔓 ACCESO RESTABLECIDO 🔓\n╚════════════════════════════════════╝\n\n 🔹 Usuario ➭ <mención_usuario>\n 🔹 ID      ➭ <id_del_usuario>\n 🔹 Estado  ➭ RE-ADMITIDO [✔]`,
  WELCOME: `╔════════════════════════════════════╗\n      💎 POWER LUKCY NETWORK 💎\n╚════════════════════════════════════╝\n\n 🔹 Usuario ➭ <mención_usuario>\n 🔹 Acceso  ➭ AUTORIZADO [✔]\n 🔹 Fecha   ➭ <fecha_ingreso>\n\n _🥂 ¡Bienvenido a la elite!_`,
  LEAVE: `╔════════════════════════════════════╗\n      🛫 SALIDA DE LA NETWORK 🛫\n╚════════════════════════════════════╝\n\n 🔹 Usuario ➭ <nombre_usuario>\n 🔹 Estado  ➭ DESCONECTADO [❌]`,
  LEVELUP: `╔════════════════════════════════════╗\n      🆙 LEVEL UP / NUEVO NIVEL 🆙\n╚════════════════════════════════════╝\n\n 🔹 Usuario ➭ <mención_usuario>\n 🔹 Nivel   ➭ <nivel_anterior> ➔ ⭐ <nuevo_nivel>\n 🔹 XP Total➭ <xp_total>\n\n _🔥 ¡Imparable! Sigue chateando._`
};

/* ───────── CLIENTE ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const scheduledUnbans = new Map();

async function performUnban(guildId, userId) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  await guild.bans.remove(userId, 'Tempban expirado').catch(() => null);
  const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN).catch(() => null);
  if (ch?.isTextBased()) ch.send(`🔔 Usuario <@${userId}> desbaneado automáticamente.`).catch(() => null);
}

function scheduleUnban(guildId, userId, expiresAt) {
  const key = `${guildId}|${userId}`;
  const ms = expiresAt - Date.now();
  if (ms <= 0) {
    performUnban(guildId, userId);
    delete tempBans[key];
    saveData(TEMPBANS_FILE, tempBans);
    return;
  }
  if (scheduledUnbans.has(key)) clearTimeout(scheduledUnbans.get(key));
  scheduledUnbans.set(key, setTimeout(async () => {
    await performUnban(guildId, userId);
    delete tempBans[key];
    saveData(TEMPBANS_FILE, tempBans);
    scheduledUnbans.delete(key);
  }, ms));
}

/* ───────── READY (Sincronización Corregida) ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} operativo.`);
  client.user.setActivity('Power Lucky Network', { type: ActivityType.Playing });

  const commands = [
    new SlashCommandBuilder().setName('anuncio').setDescription('Enviar anuncio oficial').addStringOption(o => o.setName('mensaje').setDescription('Contenido del mensaje').setRequired(true)),
    new SlashCommandBuilder().setName('nuevo').setDescription('Enviar novedad').addStringOption(o => o.setName('mensaje').setDescription('Contenido de la novedad').setRequired(true)),
    new SlashCommandBuilder().setName('cambios').setDescription('Publicar cambios').addStringOption(o => o.setName('mensaje').setDescription('Descripción de cambios').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Ban permanente').addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true)).addStringOption(o => o.setName('razon').setDescription('Motivo del ban')).setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
    new SlashCommandBuilder().setName('tempban').setDescription('Ban temporal').addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true)).addStringOption(o => o.setName('duracion').setDescription('Ej: 7d, 12h').setRequired(true)).addStringOption(o => o.setName('razon').setDescription('Motivo')).setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
    new SlashCommandBuilder().setName('mute').setDescription('Silenciar').addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true)).addStringOption(o => o.setName('duracion').setDescription('Ej: 1h, 30m').setRequired(true)).addStringOption(o => o.setName('razon').setDescription('Motivo')).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('unmute').setDescription('Quitar silencio').addUserOption(o => o.setName('usuario').setDescription('Usuario a liberar').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('unban').setDescription('Desbanear por ID').addStringOption(o => o.setName('userid').setDescription('ID del usuario').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  for (const gId of ALLOWED_SERVERS) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, gId), { body: commands });
    } catch (e) { console.error(`❌ Error en server ${gId}:`, e); }
  }

  for (const key in tempBans) {
    const [gId, uId] = key.split('|');
    scheduleUnban(gId, uId, tempBans[key].expiresAt);
  }
});

/* ───────── INTERACCIONES ───────── */
client.on(Events.InteractionCreate, async (int) => {
  if (!int.isChatInputCommand() || !ALLOWED_SERVERS.includes(int.guildId)) return;
  const { commandName, options } = int;
  await int.deferReply({ ephemeral: true });

  try {
    if (['anuncio', 'nuevo', 'cambios'].includes(commandName)) {
      const msg = options.getString('mensaje').replace(/\s{2,}/g, '\n');
      const cid = commandName === 'anuncio' ? CONFIG.CHANNELS.ANUNCIOS : (commandName === 'nuevo' ? CONFIG.CHANNELS.NUEVO : CONFIG.CHANNELS.CAMBIOS);
      const ch = await client.channels.fetch(cid);
      await ch.send(msg);
      return int.editReply('✅ Enviado.');
    }

    if (commandName === 'ban') {
      const target = options.getUser('usuario');
      const reason = options.getString('razon') || 'No especificada';
      await int.guild.members.ban(target.id, { reason });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.BANS);
      if (ch) ch.send(fillTemplate(TEMPLATES.BAN, { mención_usuario: `<@${target.id}>`, id_del_usuario: target.id, razón_del_ban: reason, moderador: `<@${int.user.id}>` }));
      return int.editReply('✅ Baneado.');
    }

    if (commandName === 'tempban') {
      const target = options.getUser('usuario');
      const ms = parseDuration(options.getString('duracion'));
      if (!ms) return int.editReply('❌ Tiempo inválido.');
      const expiresAt = Date.now() + ms;
      await int.guild.members.ban(target.id, { reason: options.getString('razon') });
      tempBans[`${int.guildId}|${target.id}`] = { expiresAt };
      await saveData(TEMPBANS_FILE, tempBans);
      scheduleUnban(int.guildId, target.id, expiresAt);
      const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN);
      if (ch) ch.send(fillTemplate(TEMPLATES.TEMPBAN, { mención_usuario: `<@${target.id}>`, id_del_usuario: target.id, razón_del_ban: options.getString('razon') || 'Mod', tiempo: options.getString('duracion'), expira: formatDate(expiresAt) }));
      return int.editReply('✅ Tempban listo.');
    }

    if (commandName === 'mute') {
      const target = options.getUser('usuario');
      const ms = parseDuration(options.getString('duracion'));
      const member = await int.guild.members.fetch(target.id);
      await member.timeout(ms, options.getString('razon'));
      const ch = await client.channels.fetch(CONFIG.CHANNELS.MUTE);
      if (ch) ch.send(fillTemplate(TEMPLATES.MUTE, { mención_usuario: `<@${target.id}>`, razón_del_mute: options.getString('razon') || 'Mod', duración_del_mute: options.getString('duracion'), moderador: `<@${int.user.id}>` }));
      return int.editReply('🔇 Muteado.');
    }

    if (commandName === 'unban') {
      const id = options.getString('userid');
      await int.guild.bans.remove(id);
      return int.editReply('✅ Desbaneado.');
    }
  } catch (e) {
    console.error(e);
    int.editReply('❌ Error ejecutando el comando.');
  }
});

/* ───────── MENSAJES (XP + IP RÁPIDA) ───────── */
const xpCooldowns = new Map();

client.on('messageCreate', async (msg) => {
  if (!msg.guild || msg.author.bot || !ALLOWED_SERVERS.includes(msg.guild.id)) return;
  const content = msg.content.toLowerCase();

  // Respuestas rápidas
  if (content.startsWith('.ip')) {
    return msg.reply(`╔════════════════════════════════════╗\n      🛡️  CONEXIÓN AL SERVIDOR  🛡️\n╚════════════════════════════════════╝\n\n 🌐 **IP:** play.powerlucky.net\n 📱 **Puerto:** 19132\n\n 🟢 **Estado:** EN LÍNEA`).catch(() => null);
  }

  // XP
  const xpKey = `${msg.guild.id}|${msg.author.id}`;
  if ((xpCooldowns.get(xpKey) || 0) < Date.now()) {
    xpCooldowns.set(xpKey, Date.now() + 60000);
    if (!xpData[msg.guild.id]) xpData[msg.guild.id] = {};
    if (!xpData[msg.guild.id][msg.author.id]) xpData[msg.guild.id][msg.author.id] = { xp: 0 };
    
    const user = xpData[msg.guild.id][msg.author.id];
    const oldLvl = Math.floor(user.xp / 100) + 1;
    user.xp += Math.floor(Math.random() * 10) + 5;
    xpNeedsSave = true;
    const newLvl = Math.floor(user.xp / 100) + 1;

    if (newLvl > oldLvl) {
      const ch = await client.channels.fetch(CONFIG.CHANNELS.XP).catch(() => null);
      if (ch) ch.send(fillTemplate(TEMPLATES.LEVELUP, { mención_usuario: `<@${msg.author.id}>`, nivel_anterior: oldLvl, nuevo_nivel: newLvl, xp_total: user.xp }));
    }
  }
});

/* ───────── BIENVENIDAS ───────── */
client.on('guildMemberAdd', async (m) => {
  if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
  const ch = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(() => null);
  if (ch) ch.send(fillTemplate(TEMPLATES.WELCOME, { mención_usuario: `<@${m.id}>`, fecha_ingreso: formatDate(Date.now()) }));
});

/* ───────── SERVER WEB ───────── */
const app = express();
app.get('/', (req, res) => res.send('Bot Online 🚀'));
app.listen(process.env.PORT || 10000);

client.login(CONFIG.TOKEN);
