// index.js — Power Lucky Network (con emojis personalizados integrados)
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

/* ---------- CONFIG ---------- */
const SERVER_NAME = 'POWER LUCKY NETWORK';
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
  STORE_URL: 'tienda.powerlucky.net'
};

/* ---------- EMOJIS (del listado que enviaste) ---------- */
const EMOJIS = {
  JAVA: '<:java:1433671645339455628>',
  BEDROCK: '<:bedrock:1433671700536365139>',
  SHIELD: '<:TwoToneShield_IDS:1343068309918187592>',
  STATUS_ON: '<:emoji_49:1433671234725478450>',
  STATUS_NET: '<:emoji_46:1450950369290092626>',
  TIENDA: '<:Tienda:1462705356428939410>',
  MINECOINS: '<:Minecoins:1343058654114349087>',
  GOLD_EIGHT: '<:minecraft_gold_eight:1343066113596199016>',
  GOLD_LT: '<:minecraft_gold_less_than:1343058687748473044>',
  GOLD_GT: '<:minecraft_gold_greater_than:1343058673412345947>',
  EMOJI_50: '<:emoji_50:1433671336311521331>',
  MANTE: '<:mante:1343068275998986240>',
  HEART: '<:MinecraftHeart:1343065608497135698>',
  HARDCORE: '<:hardcore:1343056335599833139>'
};

/* ---------- FILES & PERSISTENCE ---------- */
const DB_DIR = path.resolve('./data');
if (!fsSync.existsSync(DB_DIR)) fsSync.mkdirSync(DB_DIR);
const TEMPBANS_FILE = path.join(DB_DIR, 'tempbans.json');
const XP_FILE = path.join(DB_DIR, 'xp.json');

let tempBans = {};
let xpData = {};
let xpNeedsSave = false;

try {
  if (fsSync.existsSync(TEMPBANS_FILE)) tempBans = JSON.parse(fsSync.readFileSync(TEMPBANS_FILE, 'utf8') || '{}');
} catch (e) { console.error('Error leyendo tempbans:', e); }
try {
  if (fsSync.existsSync(XP_FILE)) xpData = JSON.parse(fsSync.readFileSync(XP_FILE, 'utf8') || '{}');
} catch (e) { console.error('Error leyendo xp:', e); }

async function saveData(file, data) {
  try { await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error(`Error guardando ${file}:`, e); }
}

// save XP periodically if needed
setInterval(() => {
  if (xpNeedsSave) {
    saveData(XP_FILE, xpData);
    xpNeedsSave = false;
  }
}, 30_000);

/* ---------- UTIL ---------- */
function parseDuration(str) {
  if (!str) return null;
  const regex = /(\d+)\s*(d|h|m|s)/g;
  let match;
  let total = 0;
  while ((match = regex.exec(String(str).toLowerCase())) !== null) {
    const n = Number(match[1]);
    const unit = match[2];
    if (unit === 'd') total += n * 24 * 60 * 60 * 1000;
    if (unit === 'h') total += n * 60 * 60 * 1000;
    if (unit === 'm') total += n * 60 * 1000;
    if (unit === 's') total += n * 1000;
  }
  return total > 0 ? total : null;
}
function formatDate(ts) {
  return new Date(ts).toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa' });
}
function fillTemplate(template, map) {
  let out = template;
  for (const k in map) out = out.replace(new RegExp(`<${k}>`, 'g'), map[k]);
  return out;
}

/* ---------- TEMPLATES (usando emojis) ---------- */
const TEMPLATES = {
  BAN: `╔════════════════════════════════════╗
      🚫 USUARIO BANEADO 🚫
╚════════════════════════════════════╝

  ${EMOJIS.SHIELD}  ●--👤 Usuario: <mención_usuario>
  ●--🆔 ID: <id_del_usuario>
  ●--⚖️ Razón: <razón_del_ban>
  ●--🛡️ Moderador: <moderador>

  _¡Las reglas se respetan!_
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  TEMPBAN: `╔════════════════════════════════════╗
      ⏳ ACCESO SUSPENDIDO ⏳
╚════════════════════════════════════╝

  ${EMOJIS.SHIELD}  ●--👤 Usuario: <mención_usuario>
  ●--🆔 ID: <id_del_usuario>
  ●--⚖️ Razón: <razón_del_ban>
  ●--⏱️ Duración: <tiempo>
  ●--📅 Expira: <expira>

  _¡Cumple tu tiempo y vuelve mejor!_
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  MUTE: `╔════════════════════════════════════╗
      🔇 USUARIO SILENCIADO 🔇
╚════════════════════════════════════╝

  ${EMOJIS.EMOJI_50}  ●--👤 Usuario: <mención_usuario>
  ●--⚖️ Razón: <razón_del_mute>
  ●--⏱️ Tiempo: <duración_del_mute>
  ●--🛡️ Moderador: <moderador>

  _¡Shhh! Medita tus palabras._
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  UNMUTE: `╔════════════════════════════════════╗
      🔊 SILENCIO REMOVIDO 🔊
╚════════════════════════════════════╝

  ${EMOJIS.HEART}  ●--👤 Usuario: <mención_usuario>
  ●--🛡️ Moderador: <moderador>

  _¡Ya puedes hablar de nuevo!_
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  UNBAN: `╔════════════════════════════════════╗
      🔓 ACCESO RESTABLECIDO 🔓
╚════════════════════════════════════╝

  ${EMOJIS.GOLD_EIGHT}  🔹 Usuario ➭ <mención_usuario>
  🔹 ID      ➭ <id_del_usuario>
  🔹 Estado  ➭ RE-ADMITIDO [✔]
  🔹 Soporte ➭ ${SERVER_NAME}

  _✨ ¡Bienvenido de vuelta! Sigue las reglas._
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  WELCOME: `╔════════════════════════════════════╗
     💎 ${SERVER_NAME} 💎
╚════════════════════════════════════╝

  ${EMOJIS.MANTE}  🔹 Usuario ➭ <mención_usuario>
  🔹 Acceso  ➭ AUTORIZADO [✔]
  🔹 Fecha   ➭ <fecha_ingreso>

  _🥂 Bienvenido a la elite. ¡Diviértete!_
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  LEAVE: `╔════════════════════════════════════╗
     🛫 SALIDA DE LA NETWORK 🛫
╚════════════════════════════════════╝

  ${EMOJIS.HARDCORE}  🔹 Usuario ➭ <nombre_usuario>
  🔹 Estado  ➭ DESCONECTADO [❌]
  🔹 Lugar   ➭ ${SERVER_NAME}

  _👋 Esperamos verte regresar pronto._
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  LEVELUP: `╔════════════════════════════════════╗
      🆙 LEVEL UP / NUEVO NIVEL 🆙
╚════════════════════════════════════╝

  ${EMOJIS.HEART}  🔹 Usuario ➭ <mención_usuario>
  🔹 Nivel   ➭ <nivel_anterior> ➔ ${EMOJIS.GOLD_EIGHT} <nuevo_nivel>
  🔹 XP Total➭ <xp_total>
  🔹 Rol     ➭ <nombre_rol_recompensa>

  _🔥 ¡Imparable! Sigue chateando._
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
};

/* ---------- CLIENT ---------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

/* ---------- TEMPBAN SCHEDULER ---------- */
const scheduledUnbans = new Map();

async function performUnban(guildId, userId) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    await guild.bans.remove(userId, 'Tempban expirado').catch(() => null);
    const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN).catch(() => null);
    if (ch?.isTextBased()) {
      await ch.send({ content: `🔔 ${EMOJIS.STATUS_ON} Usuario <@${userId}> desbaneado automáticamente (tempban expirado).` }).catch(() => null);
    }
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
    await saveData(TEMPBANS_FILE, tempBans);
    scheduledUnbans.delete(key);
  }, ms);
  scheduledUnbans.set(key, t);
}

/* ---------- READY: register commands & re-schedule tempbans ---------- */
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity(`${SERVER_NAME}`, { type: ActivityType.Playing });

  const commands = [
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio oficial')
      .addStringOption(o => o.setName('mensaje').setDescription('Texto del anuncio (usa doble espacio para salto)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar novedad')
      .addStringOption(o => o.setName('mensaje').setDescription('Texto de la novedad (usa doble espacio para salto)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('cambios')
      .setDescription('Publicar cambios en canal de cambios')
      .addStringOption(o => o.setName('mensaje').setDescription('Describe los cambios').setRequired(true)),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear permanentemente a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón del ban').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

    new SlashCommandBuilder()
      .setName('tempban')
      .setDescription('Ban temporal: ej. 7d, 12h')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear temporalmente').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración: 7d 12h 30m 10s').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar (timeout)')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración: 10m 1h 30s').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Quitar silencio')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a des-silenciar').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Quitar el ban por ID')
      .addStringOption(o => o.setName('userid').setDescription('ID del usuario a desbanear').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

    new SlashCommandBuilder()
      .setName('ip')
      .setDescription('Mostrar IP del servidor'),

    new SlashCommandBuilder()
      .setName('tienda')
      .setDescription('Mostrar tienda del servidor'),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  try {
    for (const guildId of ALLOWED_SERVERS) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
      console.log(`Comandos registrados en ${guildId}`);
    }
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }

  // reprogramar tempbans desde archivo
  for (const key of Object.keys(tempBans)) {
    const entry = tempBans[key];
    const [gId, uId] = key.split('|');
    if (entry && entry.expiresAt) scheduleUnban(gId, uId, entry.expiresAt);
  }
});

/* ---------- INTERACTION HANDLER ---------- */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !ALLOWED_SERVERS.includes(interaction.guildId)) return;
  const { commandName, options } = interaction;
  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  try {
    // anuncio / nuevo / cambios
    if (['anuncio', 'nuevo', 'cambios'].includes(commandName)) {
      const raw = options.getString('mensaje', true);
      const mensaje = raw.replace(/\s{2,}/g, '\n').trim();
      const canalId = commandName === 'anuncio' ? CONFIG.CHANNELS.ANUNCIOS : (commandName === 'nuevo' ? CONFIG.CHANNELS.NUEVO : CONFIG.CHANNELS.CAMBIOS);
      const canal = await client.channels.fetch(canalId).catch(() => null);
      if (!canal || !canal.isTextBased()) return interaction.editReply('❌ Canal no encontrado o no es de texto.');
      await canal.send({ content: mensaje }).catch(() => null);
      return interaction.editReply('✅ Mensaje enviado.');
    }

    // ban
    if (commandName === 'ban') {
      const target = options.getUser('usuario', true);
      const reason = options.getString('razon') || 'Sin razón especificada';
      await interaction.guild.members.ban(target.id, { reason }).catch(e => { throw e; });
      const text = fillTemplate(TEMPLATES.BAN, { 'mención_usuario': `<@${target.id}>`, 'id_del_usuario': target.id, 'razón_del_ban': reason, 'moderador': `<@${interaction.user.id}>` });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.BANS).catch(() => null);
      if (ch?.isTextBased()) await ch.send({ content: text }).catch(() => null);
      return interaction.editReply(`✅ ${target.tag} baneado.`);
    }

    // tempban
    if (commandName === 'tempban') {
      const target = options.getUser('usuario', true);
      const durStr = options.getString('duracion', true);
      const ms = parseDuration(durStr);
      if (!ms) return interaction.editReply('❌ Duración inválida (ej: 7d 12h 30m 10s).');
      const reason = options.getString('razon') || 'Sin razón especificada';
      const expiresAt = Date.now() + ms;
      await interaction.guild.members.ban(target.id, { reason }).catch(e => { throw e; });
      const key = `${interaction.guildId}|${target.id}`;
      tempBans[key] = { expiresAt, reason, moderatorId: interaction.user.id };
      await saveData(TEMPBANS_FILE, tempBans);
      scheduleUnban(interaction.guildId, target.id, expiresAt);
      const text = fillTemplate(TEMPLATES.TEMPBAN, { 'mención_usuario': `<@${target.id}>`, 'id_del_usuario': target.id, 'razón_del_ban': reason, 'tiempo': durStr, 'expira': formatDate(expiresAt) });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN).catch(() => null);
      if (ch?.isTextBased()) await ch.send({ content: text }).catch(() => null);
      return interaction.editReply(`✅ Tempban aplicado hasta ${formatDate(expiresAt)}.`);
    }

    // mute
    if (commandName === 'mute') {
      const target = options.getUser('usuario', true);
      const durStr = options.getString('duracion', true);
      const ms = parseDuration(durStr);
      if (!ms) return interaction.editReply('❌ Duración inválida.');
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.editReply('❌ Miembro no encontrado.');
      await member.timeout(ms, options.getString('razon') || `Mute por ${interaction.user.tag}`).catch(e => { throw e; });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.MUTE).catch(() => null);
      if (ch?.isTextBased()) await ch.send({ content: fillTemplate(TEMPLATES.MUTE, { 'mención_usuario': `<@${target.id}>`, 'razón_del_mute': options.getString('razon') || 'Moderación', 'duración_del_mute': durStr, 'moderador': `<@${interaction.user.id}>` }) }).catch(() => null);
      return interaction.editReply(`🔇 <@${target.id}> silenciado por ${durStr}.`);
    }

    // unmute
    if (commandName === 'unmute') {
      const target = options.getUser('usuario', true);
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.editReply('❌ Miembro no encontrado.');
      await member.timeout(null, `Unmute por ${interaction.user.tag}`).catch(e => { throw e; });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.UNMUTE).catch(() => null);
      if (ch?.isTextBased()) await ch.send({ content: fillTemplate(TEMPLATES.UNMUTE, { 'mención_usuario': `<@${target.id}>`, 'moderador': `<@${interaction.user.id}>` }) }).catch(() => null);
      return interaction.editReply(`🔊 <@${target.id}> desmuteado.`);
    }

    // unban
    if (commandName === 'unban') {
      const id = options.getString('userid', true);
      await interaction.guild.bans.remove(id).catch(e => { throw e; });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.UNBAN).catch(() => null);
      if (ch?.isTextBased()) await ch.send({ content: fillTemplate(TEMPLATES.UNBAN, { 'mención_usuario': `<@${id}>`, 'id_del_usuario': id }) }).catch(() => null);
      // limpiar tempbans si existiera
      const k = `${interaction.guildId}|${id}`;
      if (tempBans[k]) { delete tempBans[k]; await saveData(TEMPBANS_FILE, tempBans); if (scheduledUnbans.has(k)) { clearTimeout(scheduledUnbans.get(k)); scheduledUnbans.delete(k); } }
      return interaction.editReply('✅ Usuario desbaneado.');
    }

    // ip
    if (commandName === 'ip') {
      return interaction.editReply(`╔════════════════════════════════════╗
      ${EMOJIS.SHIELD}  🛡️  CONEXIÓN AL SERVIDOR  ${EMOJIS.STATUS_ON}
╚════════════════════════════════════╝

  ${EMOJIS.JAVA} **Java:** 1.8 - 1.20.x
  ${EMOJIS.BEDROCK} **Bedrock Port:** 19132
  🌐 **IP:** ${CONFIG.SERVER_IP}

  ${EMOJIS.STATUS_ON} **Estado:** EN LÍNEA [✔]
  ${EMOJIS.STATUS_NET} **Network:** ${SERVER_NAME}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    // tienda
    if (commandName === 'tienda') {
      return interaction.editReply(`╔════════════════════════════════════╗
       ${EMOJIS.TIENDA}  🛒  TIENDA DE LA NETWORK  ${EMOJIS.MINECOINS}
╚════════════════════════════════════╝

  ${EMOJIS.TIENDA} **Link** ➭ ${CONFIG.STORE_URL}
  ${EMOJIS.MINECOINS} **Moneda** ➭ USD / EUR / MXN
  ${EMOJIS.GOLD_EIGHT} **Rangos** ➭ VIP, MVP, ELITE

  ${EMOJIS.GOLD_LT} 💎 APOYA AL SERVIDOR ${EMOJIS.GOLD_GT}

  ${EMOJIS.STATUS_NET} **Soporte** ➭ ${SERVER_NAME}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

  } catch (e) {
    console.error('Error en interacción:', e);
    try { await interaction.editReply('❌ Ocurrió un error ejecutando el comando.'); } catch (_) {}
  }
});

/* ---------- MESSAGE HANDLER (IP / TIENDA / XP) ---------- */
const xpCooldowns = new Map();

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    if (!ALLOWED_SERVERS.includes(message.guild.id)) return;

    const content = (message.content || '').toLowerCase();

    // Respuestas instantáneas (palabra completa)
    const containsIp = /\bip\b/i.test(content);
    const containsTienda = /\btienda\b/i.test(content);

    if (containsIp) {
      return message.reply(`╔════════════════════════════════════╗
      ${EMOJIS.SHIELD}  🛡️  CONEXIÓN AL SERVIDOR  ${EMOJIS.STATUS_ON}
╚════════════════════════════════════╝

  ${EMOJIS.JAVA} **Java:** 1.8 - 1.20.x
  ${EMOJIS.BEDROCK} **Bedrock Port:** 19132
  🌐 **IP:** ${CONFIG.SERVER_IP}

  ${EMOJIS.STATUS_ON} **Estado:** EN LÍNEA [✔]
  ${EMOJIS.STATUS_NET} **Network:** ${SERVER_NAME}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    if (containsTienda) {
      return message.reply(`╔════════════════════════════════════╗
       ${EMOJIS.TIENDA}  🛒  TIENDA DE LA NETWORK  ${EMOJIS.MINECOINS}
╚════════════════════════════════════╝

  ${EMOJIS.TIENDA} **Link** ➭ ${CONFIG.STORE_URL}
  ${EMOJIS.MINECOINS} **Moneda** ➭ USD / EUR / MXN
  ${EMOJIS.GOLD_EIGHT} **Rangos** ➭ VIP, MVP, ELITE

  ${EMOJIS.GOLD_LT} 💎 APOYA AL SERVIDOR ${EMOJIS.GOLD_GT}

  ${EMOJIS.STATUS_NET} **Soporte** ➭ ${SERVER_NAME}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    // XP system (después)
    const xpKey = `${message.guild.id}|${message.author.id}`;
    const now = Date.now();
    if ((xpCooldowns.get(xpKey) || 0) < now) {
      xpCooldowns.set(xpKey, now + 60_000);
      if (!xpData[message.guild.id]) xpData[message.guild.id] = {};
      if (!xpData[message.guild.id][message.author.id]) xpData[message.guild.id][message.author.id] = { xp: 0 };
      const user = xpData[message.guild.id][message.author.id];
      const oldLevel = Math.floor(user.xp / 100) + 1;
      user.xp += Math.floor(Math.random() * 11) + 5;
      xpNeedsSave = true;
      const newLevel = Math.floor(user.xp / 100) + 1;
      if (newLevel > oldLevel) {
        const ch = await client.channels.fetch(CONFIG.CHANNELS.XP).catch(() => null);
        if (ch?.isTextBased()) await ch.send({ content: fillTemplate(TEMPLATES.LEVELUP, { 'mención_usuario': `<@${message.author.id}>`, 'nivel_anterior': oldLevel, 'nuevo_nivel': newLevel, 'xp_total': user.xp, 'nombre_rol_recompensa': '—' }) }).catch(() => null);
      }
    }

  } catch (e) {
    console.error('Error en messageCreate:', e);
  }
});

/* ---------- WELCOME / LEAVE ---------- */
client.on('guildMemberAdd', async (m) => {
  try {
    if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
    const ch = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(() => null);
    if (ch?.isTextBased()) await ch.send({ content: fillTemplate(TEMPLATES.WELCOME, { 'mención_usuario': `<@${m.user.id}>`, 'fecha_ingreso': formatDate(Date.now()) }) }).catch(() => null);
  } catch (e) {
    console.error('Error welcome:', e);
  }
});

client.on('guildMemberRemove', async (m) => {
  try {
    if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
    const ch = await client.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(() => null);
    if (ch?.isTextBased()) await ch.send({ content: fillTemplate(TEMPLATES.LEAVE, { 'nombre_usuario': m.user?.username || `${m.user.id}` }) }).catch(() => null);
  } catch (e) {
    console.error('Error leave:', e);
  }
});

/* ---------- WEB & LOGIN ---------- */
const app = express();
app.get('/', (_, res) => res.send(`${SERVER_NAME} Bot Online 🚀`));
app.listen(process.env.PORT || 10000);

client.login(CONFIG.TOKEN).catch(e => {
  console.error('Error login:', e);
  process.exit(1);
});
