// index.js — Power Lucky Bot (corregido por completo)
import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises'; // async
import fsSync from 'fs'; // sync for startup checks
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

/* ───────── PERSISTENCIA OPTIMIZADA ───────── */
let tempBans = {};
let xpData = {};
let xpNeedsSave = false;

// Carga inicial síncrona (solo una vez al encender)
const loadData = () => {
  try {
    if (fsSync.existsSync(TEMPBANS_FILE)) tempBans = JSON.parse(fsSync.readFileSync(TEMPBANS_FILE, 'utf8') || '{}');
    if (fsSync.existsSync(XP_FILE)) xpData = JSON.parse(fsSync.readFileSync(XP_FILE, 'utf8') || '{}');
  } catch (e) { console.error("Error cargando DB:", e); }
};
loadData();

// Guardado asíncrono para evitar LAG
async function saveData(file, data) {
  try {
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error(`Error guardando ${file}:`, e); }
}

// Auto-guardado de XP cada 30 segundos si hay cambios
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
  BAN: `╔════════════════════════════════════╗
      🚫 USUARIO BANEADO 🚫
╚════════════════════════════════════╝

  ●--👤 Usuario: <mención_usuario>
  ●--🆔 ID: <id_del_usuario>
  ●--⚖️ Razón: <razón_del_ban>
  ●--🛡️ Moderador: <moderador>

  _¡Las reglas se respetan!_`,
  TEMPBAN: `╔════════════════════════════════════╗
      ⏳ ACCESO SUSPENDIDO ⏳
╚════════════════════════════════════╝

  ●--👤 Usuario: <mención_usuario>
  ●--🆔 ID: <id_del_usuario>
  ●--⚖️ Razón: <razón_del_ban>
  ●--⏱️ Duración: <tiempo>
  ●--📅 Expira: <expira>

  _¡Cumple tu tiempo y vuelve mejor!_`,
  MUTE: `╔════════════════════════════════════╗
      🔇 USUARIO SILENCIADO 🔇
╚════════════════════════════════════╝

  ●--👤 Usuario: <mención_usuario>
  ●--⚖️ Razón: <razón_del_mute>
  ●--⏱️ Tiempo: <duración_del_mute>
  ●--🛡️ Moderador: <moderador>`,
  UNMUTE: `╔════════════════════════════════════╗
      🔊 SILENCIO REMOVIDO 🔊
╚════════════════════════════════════╝

  ●--👤 Usuario: <mención_usuario>
  ●--🛡️ Moderador: <moderador>`,
  UNBAN: `╔════════════════════════════════════╗
      🔓 ACCESO RESTABLECIDO 🔓
╚════════════════════════════════════╝

  🔹 Usuario ➭ <mención_usuario>
  🔹 ID      ➭ <id_del_usuario>
  🔹 Estado  ➭ RE-ADMITIDO [✔]`,
  WELCOME: `╔════════════════════════════════════╗
      💎 POWER LUKCY NETWORK 💎
╚════════════════════════════════════╝

  🔹 Usuario ➭ <mención_usuario>
  🔹 Acceso  ➭ AUTORIZADO [✔]
  🔹 Fecha   ➭ <fecha_ingreso>

  _🥂 ¡Bienvenido a la elite!_`,
  LEAVE: `╔════════════════════════════════════╗
      🛫 SALIDA DE LA NETWORK 🛫
╚════════════════════════════════════╝

  🔹 Usuario ➭ <nombre_usuario>
  🔹 Estado  ➭ DESCONECTADO [❌]`,
  LEVELUP: `╔════════════════════════════════════╗
      🆙 LEVEL UP / NUEVO NIVEL 🆙
╚════════════════════════════════════╝

  🔹 Usuario ➭ <mención_usuario>
  🔹 Nivel   ➭ <nivel_anterior> ➔ ⭐ <nuevo_nivel>
  🔹 XP Total➭ <xp_total>

  _🔥 ¡Imparable! Sigue chateando._`
};

/* ───────── CLIENTE ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

/* ───────── TEMPBAN SCHEDULER ───────── */
const scheduledUnbans = new Map();

async function performUnban(guildId, userId) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    await guild.bans.remove(userId, 'Tempban expirado').catch(() => null);
    const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN).catch(() => null);
    if (ch?.isTextBased()) ch.send(`🔔 Usuario <@${userId}> desbaneado (Tiempo cumplido).`).catch(() => null);
  } catch (e) {
    console.error('performUnban error:', e);
  }
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
  const t = setTimeout(async () => {
    await performUnban(guildId, userId);
    delete tempBans[key];
    saveData(TEMPBANS_FILE, tempBans);
    scheduledUnbans.delete(key);
  }, ms);
  scheduledUnbans.set(key, t);
}

/* ───────── READY: registrar comandos y reprogramar tempbans ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} listo.`);
  client.user.setActivity('Power Lucky Network', { type: ActivityType.Playing });

  const commands = [
    new SlashCommandBuilder().setName('anuncio').setDescription('Enviar anuncio').addStringOption(o => o.setName('mensaje').setRequired(true)),
    new SlashCommandBuilder().setName('nuevo').setDescription('Enviar novedad').addStringOption(o => o.setName('mensaje').setRequired(true)),
    new SlashCommandBuilder().setName('cambios').setDescription('Enviar cambios').addStringOption(o => o.setName('mensaje').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Banear permanentemente').addUserOption(o => o.setName('usuario').setRequired(true)).addStringOption(o => o.setName('razon')).setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
    new SlashCommandBuilder().setName('tempban').setDescription('Ban temporal').addUserOption(o => o.setName('usuario').setRequired(true)).addStringOption(o => o.setName('duracion').setRequired(true)).addStringOption(o => o.setName('razon')).setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
    new SlashCommandBuilder().setName('mute').setDescription('Silenciar').addUserOption(o => o.setName('usuario').setRequired(true)).addStringOption(o => o.setName('duracion').setRequired(true)).addStringOption(o => o.setName('razon')).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('unmute').setDescription('Quitar silencio').addUserOption(o => o.setName('usuario').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder().setName('unban').setDescription('Desbanear ID').addStringOption(o => o.setName('userid').setRequired(true)).setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  for (const gId of ALLOWED_SERVERS) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, gId), { body: commands });
    } catch (e) {
      console.error('Error registrando comandos en', gId, e);
    }
  }

  // Reprogramar tempbans cargadas desde archivo
  for (const key in tempBans) {
    const [gId, uId] = key.split('|');
    if (tempBans[key] && tempBans[key].expiresAt) {
      scheduleUnban(gId, uId, tempBans[key].expiresAt);
    }
  }
});

/* ───────── INTERACCIONES (slash commands) ───────── */
client.on(Events.InteractionCreate, async (int) => {
  if (!int.isChatInputCommand() || !ALLOWED_SERVERS.includes(int.guildId)) return;

  const { commandName, options } = int;
  await int.deferReply({ ephemeral: true });

  try {
    // anuncios / nuevo / cambios
    if (['anuncio', 'nuevo', 'cambios'].includes(commandName)) {
      const msg = options.getString('mensaje').replace(/\s{2,}/g, '\n').trim();
      const cid = commandName === 'anuncio' ? CONFIG.CHANNELS.ANUNCIOS : (commandName === 'nuevo' ? CONFIG.CHANNELS.NUEVO : CONFIG.CHANNELS.CAMBIOS);
      const ch = await client.channels.fetch(cid).catch(() => null);
      if (!ch) return int.editReply('❌ Canal no encontrado.');
      await ch.send({ content: msg });
      return int.editReply('✅ Enviado.');
    }

    // ban
    if (commandName === 'ban') {
      const target = options.getUser('usuario');
      const reason = options.getString('razon') || 'No especificada';
      await int.guild.members.ban(target.id, { reason }).catch(e => { throw e; });
      const text = fillTemplate(TEMPLATES.BAN, { 'mención_usuario': `<@${target.id}>`, 'id_del_usuario': target.id, 'razón_del_ban': reason, 'moderador': `<@${int.user.id}>` });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.BANS).catch(() => null);
      if (ch?.isTextBased()) ch.send({ content: text }).catch(() => null);
      return int.editReply(`✅ ${target.tag} baneado.`);
    }

    // tempban
    if (commandName === 'tempban') {
      const target = options.getUser('usuario');
      const durStr = options.getString('duracion');
      const ms = parseDuration(durStr);
      if (!ms) return int.editReply('❌ Formato de tiempo inválido (ej: 7d 12h).');

      const reason = options.getString('razon') || 'No especificada';
      const expiresAt = Date.now() + ms;

      await int.guild.members.ban(target.id, { reason }).catch(e => { throw e; });
      tempBans[`${int.guildId}|${target.id}`] = { expiresAt, reason, moderatorId: int.user.id };
      await saveData(TEMPBANS_FILE, tempBans);
      scheduleUnban(int.guildId, target.id, expiresAt);

      const text = fillTemplate(TEMPLATES.TEMPBAN, { 'mención_usuario': `<@${target.id}>`, 'id_del_usuario': target.id, 'razón_del_ban': reason, 'tiempo': durStr, 'expira': formatDate(expiresAt) });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN).catch(() => null);
      if (ch?.isTextBased()) ch.send({ content: text }).catch(() => null);
      return int.editReply(`✅ Tempban aplicado hasta ${formatDate(expiresAt)}.`);
    }

    // mute
    if (commandName === 'mute') {
      const target = options.getUser('usuario');
      const ms = parseDuration(options.getString('duracion'));
      if (!ms) return int.editReply('❌ Tiempo inválido.');
      const member = await int.guild.members.fetch(target.id).catch(() => null);
      if (!member) return int.editReply('❌ Usuario no encontrado en el servidor.');
      await member.timeout(ms, options.getString('razon') || `Mute por ${int.user.tag}`).catch(e => { throw e; });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.MUTE).catch(() => null);
      if (ch?.isTextBased()) ch.send({ content: fillTemplate(TEMPLATES.MUTE, { 'mención_usuario': `<@${target.id}>`, 'razón_del_mute': options.getString('razon') || 'Moderación', 'duración_del_mute': options.getString('duracion'), 'moderador': `<@${int.user.id}>` }) }).catch(() => null);
      return int.editReply('🔇 Silenciado.');
    }

    // unmute (ahora sí implementado)
    if (commandName === 'unmute') {
      const target = options.getUser('usuario');
      const member = await int.guild.members.fetch(target.id).catch(() => null);
      if (!member) return int.editReply('❌ Usuario no encontrado en el servidor.');
      await member.timeout(null, `Unmute por ${int.user.tag}`).catch(e => { throw e; });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.UNMUTE).catch(() => null);
      if (ch?.isTextBased()) ch.send({ content: fillTemplate(TEMPLATES.UNMUTE, { 'mención_usuario': `<@${target.id}>`, 'moderador': `<@${int.user.id}>` }) }).catch(() => null);
      return int.editReply('🔊 Silencio removido.');
    }

    // unban
    if (commandName === 'unban') {
      const id = options.getString('userid');
      await int.guild.bans.remove(id).catch(e => { throw e; });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.UNBAN).catch(() => null);
      if (ch?.isTextBased()) ch.send({ content: fillTemplate(TEMPLATES.UNBAN, { 'mención_usuario': `<@${id}>`, 'id_del_usuario': id }) }).catch(() => null);
      // clean tempbans if exists
      const key = `${int.guildId}|${id}`;
      if (tempBans[key]) { delete tempBans[key]; await saveData(TEMPBANS_FILE, tempBans); if (scheduledUnbans.has(key)) { clearTimeout(scheduledUnbans.get(key)); scheduledUnbans.delete(key); } }
      return int.editReply('✅ Desbaneado.');
    }

  } catch (e) {
    console.error('Error en comando:', e);
    try { await int.editReply('❌ Ocurrió un error ejecutando el comando.'); } catch (__) {}
  }
});

/* ───────── XP Y MENSAJES ───────── */
const xpCooldowns = new Map();

client.on('messageCreate', async (msg) => {
  try {
    if (!msg.guild || msg.author.bot || !ALLOWED_SERVERS.includes(msg.guild.id)) return;

    const content = (msg.content || '').toLowerCase().trim();

    // ---- RESPUESTA RÁPIDA IP/TIENDA (prioridad máxima, responde al instante)
    // detecta palabras completas "ip" o "tienda" en el mensaje (no requiere prefijo)
    const containsIp = /\bip\b/i.test(content) || ['.ip', ':ip', '-ip', '_ip', '!ip'].some(p => content.startsWith(p));
    const containsTienda = /\btienda\b/i.test(content) || ['.tienda', ':tienda', '-tienda', '_tienda', '!tienda'].some(p => content.startsWith(p));

    if (containsIp) {
      // Respuesta rápida y ligera (usa emojis Unicode para garantizar visibilidad)
      return msg.reply(`╔════════════════════════════════════╗
      🛡️  CONEXIÓN AL SERVIDOR  🛡️
╚════════════════════════════════════╝

  🌐 **Dirección IP** ➭ ${CONFIG.SERVER_IP}
  ☕ **Versión Java** ➭ 1.8 - 1.20.x
  📱 **Bedrock Port** ➭ 19132

  🟢 **Estado** ➭ EN LÍNEA [✔]
  🌍 **Network** ➭ Power Lukcy

  _✨ ¡Te esperamos dentro del juego!_
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    if (containsTienda) {
      return msg.reply(`╔════════════════════════════════════╗
       🛒  TIENDA DE LA NETWORK  🛒
╚════════════════════════════════════╝

  🛍️ **Link** ➭ tienda.powerlucky.net
  💳 **Moneda** ➭ USD / EUR / MXN
  💎 **Rangos** ➭ VIP, MVP, ELITE

  ✨ **Apoya al servidor y obtén beneficios**

  🛡️ **Soporte** ➭ Power Lukcy Network

  _🥂 ¡Obtén beneficios y ayuda a mejorar!_
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    // ---- SISTEMA DE XP (después de la respuesta rápida)
    const xpKey = `${msg.guild.id}|${msg.author.id}`;
    const now = Date.now();
    if ((xpCooldowns.get(xpKey) || 0) < now) {
      xpCooldowns.set(xpKey, now + 60000); // cooldown 60s
      if (!xpData[msg.guild.id]) xpData[msg.guild.id] = {};
      if (!xpData[msg.guild.id][msg.author.id]) xpData[msg.guild.id][msg.author.id] = { xp: 0 };
      const user = xpData[msg.guild.id][msg.author.id];
      const oldLvl = Math.floor(user.xp / 100) + 1;
      user.xp += Math.floor(Math.random() * 11) + 5;
      xpNeedsSave = true;
      const newLvl = Math.floor(user.xp / 100) + 1;
      if (newLvl > oldLvl) {
        const ch = await client.channels.fetch(CONFIG.CHANNELS.XP).catch(() => null);
        if (ch?.isTextBased()) ch.send({ content: fillTemplate(TEMPLATES.LEVELUP, { 'mención_usuario': `<@${msg.author.id}>`, 'nivel_anterior': oldLvl, 'nuevo_nivel': newLvl, 'xp_total': user.xp }) }).catch(() => null);
      }
    }
  } catch (e) {
    console.error('Error en messageCreate:', e);
  }
});

/* ───────── BIENVENIDAS / DESPEDIDAS ───────── */
client.on('guildMemberAdd', async (m) => {
  try {
    if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
    const ch = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(() => null);
    if (ch?.isTextBased()) ch.send({ content: fillTemplate(TEMPLATES.WELCOME, { 'mención_usuario': `<@${m.id}>`, 'fecha_ingreso': formatDate(Date.now()) }) }).catch(() => null);
  } catch (e) {
    console.error('Error welcome:', e);
  }
});

client.on('guildMemberRemove', async (m) => {
  try {
    if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
    const ch = await client.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(() => null);
    if (ch?.isTextBased()) ch.send({ content: fillTemplate(TEMPLATES.LEAVE, { 'nombre_usuario': m.user?.username || m.user, }) }).catch(() => null);
  } catch (e) {
    console.error('Error leave:', e);
  }
});

/* ───────── SERVIDOR WEB ───────── */
const app = express();
app.get('/', (req, res) => res.send('Bot Activo 🚀'));
app.listen(process.env.PORT || 10000);

/* ───────── LOGIN ───────── */
client.login(CONFIG.TOKEN).catch(e => {
  console.error('Error login:', e);
  process.exit(1);
});
