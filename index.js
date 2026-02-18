// index.js — Power Lucky Network (Full Premium Fix)
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
  Collection
} from 'discord.js';

/* ---------- CONFIG ---------- */
const SERVER_NAME = 'POWER LUCKY NETWORK';
// IDs de los servidores donde funciona el bot
const ALLOWED_SERVERS = ['1340442398442127480', '1458243569075884219'];

// 🔥 ROLES PERMITIDOS (Staff Team & Administración)
const ALLOWED_ROLES = [
  '1340887228431335457', // Owner
  '1343040895313907805', // Co-owner
  '1343060398932230246', // Manager
  '1343093044290916395', // Staff
  '1343060062851301406', // Admin
  '1473524759731114147'  // ✅ NUEVO ROL ADMINISTRACION
];

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
    LEAVE: '1340475418091847791',
    INVITES: '1341253763977056306' // ✅ NUEVO CANAL DE INVITES
  },
  SERVER_IP: 'play.powerlucky.net',
  STORE_URL: 'tienda.powerlucky.net'
};

/* ---------- EMOJIS ---------- */
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
  HARDCORE: '<:hardcore:1343056335599833139>',
  INVITE: '📩'
};

/* ---------- FILES & PERSISTENCE ---------- */
const DB_DIR = path.resolve('./data');
if (!fsSync.existsSync(DB_DIR)) fsSync.mkdirSync(DB_DIR);

const TEMPBANS_FILE = path.join(DB_DIR, 'tempbans.json');
const MUTES_FILE = path.join(DB_DIR, 'mutes.json'); // ✅ Nuevo archivo para Mutes
const XP_FILE = path.join(DB_DIR, 'xp.json');

let tempBans = {};
let activeMutes = {}; // ✅ Cache de mutes
let xpData = {};
let xpNeedsSave = false;

// Cargar datos
try { if (fsSync.existsSync(TEMPBANS_FILE)) tempBans = JSON.parse(fsSync.readFileSync(TEMPBANS_FILE, 'utf8') || '{}'); } catch (e) { console.error('Error tempbans:', e); }
try { if (fsSync.existsSync(MUTES_FILE)) activeMutes = JSON.parse(fsSync.readFileSync(MUTES_FILE, 'utf8') || '{}'); } catch (e) { console.error('Error mutes:', e); }
try { if (fsSync.existsSync(XP_FILE)) xpData = JSON.parse(fsSync.readFileSync(XP_FILE, 'utf8') || '{}'); } catch (e) { console.error('Error xp:', e); }

async function saveData(file, data) {
  try { await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error(`Error guardando ${file}:`, e); }
}

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

/* ---------- TEMPLATES ---------- */
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
  
  INVITE: `╔════════════════════════════════════╗
      📩 NUEVA INVITACIÓN 📩
╚════════════════════════════════════╝

  ${EMOJIS.INVITE} 👤 Entró: <mención_usuario>
  ${EMOJIS.SHIELD} 🤝 Invitado por: <invitador>
  🔢 Usos del link: <usos>
  🎫 Código: <codigo>

  _¡La familia crece!_
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
  🔹 Fecha    ➭ <fecha_ingreso>

  _🥂 Bienvenido a la elite. ¡Diviértete!_
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  LEAVE: `╔════════════════════════════════════╗
      🛫 SALIDA DE LA NETWORK 🛫
╚════════════════════════════════════╝

  ${EMOJIS.HARDCORE}  🔹 Usuario ➭ <nombre_usuario>
  🔹 Estado  ➭ DESCONECTADO [❌]
  🔹 Lugar    ➭ ${SERVER_NAME}

  _👋 Esperamos verte regresar pronto._
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  LEVELUP: `╔════════════════════════════════════╗
      🆙 LEVEL UP / NUEVO NIVEL 🆙
╚════════════════════════════════════╝

  ${EMOJIS.HEART}  🔹 Usuario ➭ <mención_usuario>
  🔹 Nivel    ➭ <nivel_anterior> ➔ ${EMOJIS.GOLD_EIGHT} <nuevo_nivel>
  🔹 XP Total➭ <xp_total>
  🔹 Rol      ➭ <nombre_rol_recompensa>

  _🔥 ¡Imparable! Sigue chateando._
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
};

/* ---------- CLIENT ---------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites // ✅ Necesario para sistema de invites
  ],
  partials: [Partials.Channel]
});

// Cache para Invites: Map<GuildID, Collection<InviteCode, Invite>>
const invitesCache = new Map();

/* ---------- TIMERS SCHEDULERS (BAN & MUTE) ---------- */
const scheduledTasks = new Map();

// Función: Ejecutar Unban
async function performUnban(guildId, userId) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    await guild.bans.remove(userId, 'Tempban expirado').catch(() => null);
    
    // Log
    const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN).catch(() => null);
    if (ch?.isTextBased()) {
      await ch.send({ content: `🔔 ${EMOJIS.STATUS_ON} Usuario <@${userId}> desbaneado automáticamente (tempban expirado).` }).catch(() => null);
    }
  } catch (e) { console.error('performUnban error:', e); }
}

// Función: Ejecutar Unmute
async function performUnmute(guildId, userId) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    
    // Quitar timeout si aún existe
    if (member) await member.timeout(null, 'Mute temporal expirado').catch(() => null);

    // Enviar Log de confirmación (Para que veas que sí funciona)
    const ch = await client.channels.fetch(CONFIG.CHANNELS.UNMUTE).catch(() => null);
    if (ch?.isTextBased()) {
      await ch.send({ content: fillTemplate(TEMPLATES.UNMUTE, { 'mención_usuario': `<@${userId}>`, 'moderador': 'Sistema Automático' }) }).catch(() => null);
    }
  } catch (e) { console.error('performUnmute error:', e); }
}

function scheduleTask(type, guildId, userId, expiresAt) {
  const key = `${type}|${guildId}|${userId}`;
  const ms = expiresAt - Date.now();

  if (ms <= 0) {
    if (type === 'ban') {
      performUnban(guildId, userId);
      delete tempBans[`${guildId}|${userId}`];
      saveData(TEMPBANS_FILE, tempBans);
    } else if (type === 'mute') {
      performUnmute(guildId, userId);
      delete activeMutes[`${guildId}|${userId}`];
      saveData(MUTES_FILE, activeMutes);
    }
    return;
  }

  if (scheduledTasks.has(key)) clearTimeout(scheduledTasks.get(key));

  const t = setTimeout(async () => {
    if (type === 'ban') {
      await performUnban(guildId, userId);
      delete tempBans[`${guildId}|${userId}`];
      await saveData(TEMPBANS_FILE, tempBans);
    } else if (type === 'mute') {
      await performUnmute(guildId, userId);
      delete activeMutes[`${guildId}|${userId}`];
      await saveData(MUTES_FILE, activeMutes);
    }
    scheduledTasks.delete(key);
  }, ms);

  scheduledTasks.set(key, t);
}

/* ---------- READY ---------- */
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity(`${SERVER_NAME}`, { type: ActivityType.Playing });

  // 1. Cargar Invites
  for (const guildId of ALLOWED_SERVERS) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      try {
        const currentInvites = await guild.invites.fetch();
        invitesCache.set(guild.id, new Collection(currentInvites.map((invite) => [invite.code, invite.uses])));
        console.log(`📩 Invites cacheados para: ${guild.name}`);
      } catch (err) {
        console.log(`⚠️ No se pudieron cargar invites para ${guild.name} (Faltan permisos?)`);
      }
    }
  }

  // 2. Registrar Comandos
  const commands = [
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio oficial')
      .addStringOption(o => o.setName('mensaje').setDescription('Texto del anuncio').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar novedad')
      .addStringOption(o => o.setName('mensaje').setDescription('Texto de la novedad').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

    new SlashCommandBuilder()
      .setName('cambios')
      .setDescription('Publicar cambios')
      .addStringOption(o => o.setName('mensaje').setDescription('Describe los cambios').setRequired(true))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear permanentemente')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón del ban').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

    new SlashCommandBuilder()
      .setName('tempban')
      .setDescription('Ban temporal: ej. 7d, 12h')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración: 7d 12h 30m 10s').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar (Timeout)')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración: 10m 5s').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false))
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Quitar silencio manualmente')
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

  // 3. Reprogramar Tareas (Bans y Mutes) al reiniciar
  for (const key of Object.keys(tempBans)) {
    const entry = tempBans[key];
    const [gId, uId] = key.split('|');
    if (entry && entry.expiresAt) scheduleTask('ban', gId, uId, entry.expiresAt);
  }
  for (const key of Object.keys(activeMutes)) {
    const entry = activeMutes[key];
    const [gId, uId] = key.split('|');
    if (entry && entry.expiresAt) scheduleTask('mute', gId, uId, entry.expiresAt);
  }
});

/* ---------- INVITE TRACKER LOGIC ---------- */
client.on(Events.InviteCreate, async (invite) => {
  const invites = invitesCache.get(invite.guild.id);
  if (invites) invites.set(invite.code, invite.uses);
});

client.on(Events.InviteDelete, (invite) => {
  const invites = invitesCache.get(invite.guild.id);
  if (invites) invites.delete(invite.code);
});

/* ---------- INTERACTION HANDLER ---------- */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !ALLOWED_SERVERS.includes(interaction.guildId)) return;
  
  const { commandName, options } = interaction;
  
  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  /* 🔥 VERIFICACIÓN DE ROLES 🔥 */
  const RESTRICTED_COMMANDS = [
    'anuncio', 'nuevo', 'cambios', 
    'ban', 'tempban', 'mute', 'unmute', 'unban'
  ];

  if (RESTRICTED_COMMANDS.includes(commandName)) {
    const memberRoles = interaction.member.roles.cache;
    // Verifica si tiene CUALQUIERA de los roles permitidos
    const hasPermission = memberRoles.some(role => ALLOWED_ROLES.includes(role.id));
    
    if (!hasPermission) {
      return interaction.editReply({ 
        content: `❌ **ACCESO DENEGADO**\nNo tienes el rol necesario para usar \`/${commandName}\`.\nRol Requerido: Administración o Staff.` 
      });
    }
  }

  try {
    // anuncio / nuevo / cambios
    if (['anuncio', 'nuevo', 'cambios'].includes(commandName)) {
      const raw = options.getString('mensaje', true);
      const mensaje = raw.replace(/\s{2,}/g, '\n').trim();
      const canalId = commandName === 'anuncio' ? CONFIG.CHANNELS.ANUNCIOS : (commandName === 'nuevo' ? CONFIG.CHANNELS.NUEVO : CONFIG.CHANNELS.CAMBIOS);
      const canal = await client.channels.fetch(canalId).catch(() => null);
      if (!canal || !canal.isTextBased()) return interaction.editReply('❌ Canal no encontrado.');
      await canal.send({ content: mensaje }).catch(() => null);
      return interaction.editReply('✅ Mensaje enviado.');
    }

    // ban
    if (commandName === 'ban') {
      const target = options.getUser('usuario', true);
      const reason = options.getString('razon') || 'Sin razón especificada';
      
      if (!target) return interaction.editReply('❌ Usuario inválido.');
      
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
      if (!ms) return interaction.editReply('❌ Duración inválida (ej: 7d, 12h, 30m).');
      const reason = options.getString('razon') || 'Sin razón especificada';
      const expiresAt = Date.now() + ms;

      await interaction.guild.members.ban(target.id, { reason }).catch(e => { throw e; });
      
      const key = `${interaction.guildId}|${target.id}`;
      tempBans[key] = { expiresAt, reason, moderatorId: interaction.user.id };
      await saveData(TEMPBANS_FILE, tempBans);
      scheduleTask('ban', interaction.guildId, target.id, expiresAt);

      const text = fillTemplate(TEMPLATES.TEMPBAN, { 'mención_usuario': `<@${target.id}>`, 'id_del_usuario': target.id, 'razón_del_ban': reason, 'tiempo': durStr, 'expira': formatDate(expiresAt) });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN).catch(() => null);
      if (ch?.isTextBased()) await ch.send({ content: text }).catch(() => null);
      return interaction.editReply(`✅ Tempban aplicado hasta ${formatDate(expiresAt)}.`);
    }

    // mute (FIXED)
    if (commandName === 'mute') {
      const target = options.getUser('usuario', true);
      const durStr = options.getString('duracion', true);
      const ms = parseDuration(durStr);
      
      if (!ms) return interaction.editReply('❌ Duración inválida (Usa: 5s, 10m, 1h).');
      
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.editReply('❌ El usuario no está en el servidor.');
      if (!member.moderatable) return interaction.editReply('❌ No puedo mutear a este usuario (tiene permisos superiores).');

      const reason = options.getString('razon') || `Mute por ${interaction.user.tag}`;
      const expiresAt = Date.now() + ms;

      // Aplicar Timeout en Discord
      await member.timeout(ms, reason).catch(e => { throw e; });

      // Guardar Mute en sistema (Para asegurar el unmute visual/log)
      const key = `${interaction.guildId}|${target.id}`;
      activeMutes[key] = { expiresAt, reason, moderatorId: interaction.user.id };
      await saveData(MUTES_FILE, activeMutes);
      scheduleTask('mute', interaction.guildId, target.id, expiresAt);

      const ch = await client.channels.fetch(CONFIG.CHANNELS.MUTE).catch(() => null);
      if (ch?.isTextBased()) await ch.send({ content: fillTemplate(TEMPLATES.MUTE, { 'mención_usuario': `<@${target.id}>`, 'razón_del_mute': reason, 'duración_del_mute': durStr, 'moderador': `<@${interaction.user.id}>` }) }).catch(() => null);
      
      return interaction.editReply(`🔇 <@${target.id}> silenciado por ${durStr}.`);
    }

    // unmute
    if (commandName === 'unmute') {
      const target = options.getUser('usuario', true);
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.editReply('❌ Miembro no encontrado.');
      
      await member.timeout(null, `Unmute manual por ${interaction.user.tag}`).catch(e => { throw e; });
      
      // Limpiar del sistema de persistencia
      const key = `${interaction.guildId}|${target.id}`;
      if (activeMutes[key]) {
        delete activeMutes[key];
        saveData(MUTES_FILE, activeMutes);
        if (scheduledTasks.has(`mute|${key}`)) clearTimeout(scheduledTasks.get(`mute|${key}`));
      }

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
      
      const k = `${interaction.guildId}|${id}`;
      if (tempBans[k]) { delete tempBans[k]; await saveData(TEMPBANS_FILE, tempBans); if (scheduledTasks.has(`ban|${k}`)) clearTimeout(scheduledTasks.get(`ban|${k}`)); }
      return interaction.editReply('✅ Usuario desbaneado.');
    }

    // Info Commands
    if (commandName === 'ip') return interaction.editReply(ipMessage());
    if (commandName === 'tienda') return interaction.editReply(shopMessage());

  } catch (e) {
    console.error('Error en interacción:', e);
    try { await interaction.editReply('❌ Ocurrió un error ejecutando el comando.'); } catch (_) {}
  }
});

/* ---------- MESSAGE HANDLER (IP / TIENDA / XP) ---------- */
const xpCooldowns = new Map();

function ipMessage() {
  return `╔════════════════════════════════════╗
      ${EMOJIS.SHIELD}  🛡️  CONEXIÓN AL SERVIDOR  ${EMOJIS.STATUS_ON}
╚════════════════════════════════════╝
  ${EMOJIS.JAVA} **Java:** 1.8 - 1.20.x
  ${EMOJIS.BEDROCK} **Bedrock Port:** 19132
  🌐 **IP:** ${CONFIG.SERVER_IP}
  ${EMOJIS.STATUS_ON} **Estado:** EN LÍNEA [✔]
  ${EMOJIS.STATUS_NET} **Network:** ${SERVER_NAME}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

function shopMessage() {
  return `╔════════════════════════════════════╗
       ${EMOJIS.TIENDA}  🛒  TIENDA DE LA NETWORK  ${EMOJIS.MINECOINS}
╚════════════════════════════════════╝
  ${EMOJIS.TIENDA} **Link** ➭ ${CONFIG.STORE_URL}
  ${EMOJIS.MINECOINS} **Moneda** ➭ USD / EUR / MXN
  ${EMOJIS.GOLD_EIGHT} **Rangos** ➭ VIP, MVP, ELITE
  ${EMOJIS.GOLD_LT} 💎 APOYA AL SERVIDOR ${EMOJIS.GOLD_GT}
  ${EMOJIS.STATUS_NET} **Soporte** ➭ ${SERVER_NAME}
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    if (!ALLOWED_SERVERS.includes(message.guild.id)) return;

    const content = (message.content || '').toLowerCase();

    if (/\bip\b/i.test(content)) return message.reply(ipMessage());
    if (/\btienda\b/i.test(content)) return message.reply(shopMessage());

    // XP system
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

  } catch (e) { console.error('Error en messageCreate:', e); }
});

/* ---------- WELCOME / LEAVE / INVITE TRACKER ---------- */
client.on('guildMemberAdd', async (member) => {
  try {
    if (!ALLOWED_SERVERS.includes(member.guild.id)) return;

    // 1. Mensaje de Bienvenida
    const welcomeCh = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(() => null);
    if (welcomeCh?.isTextBased()) {
        await welcomeCh.send({ content: fillTemplate(TEMPLATES.WELCOME, { 'mención_usuario': `<@${member.user.id}>`, 'fecha_ingreso': formatDate(Date.now()) }) }).catch(() => null);
    }

    // 2. Sistema de Invites
    const cachedInvites = invitesCache.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();
    
    let inviter = null;
    let usedInvite = null;

    try {
        usedInvite = newInvites.find(inv => {
            const cachedUses = cachedInvites ? cachedInvites.get(inv.code) : 0;
            return inv.uses > cachedUses;
        });
    } catch (err) {}

    // Actualizar cache
    if (newInvites) {
        invitesCache.set(member.guild.id, new Collection(newInvites.map(inv => [inv.code, inv.uses])));
    }

    // Enviar Log de Invitación
    const logCh = await client.channels.fetch(CONFIG.CHANNELS.INVITES).catch(() => null);
    if (logCh?.isTextBased()) {
        const inviterText = usedInvite ? `<@${usedInvite.inviter.id}>` : 'Desconocido/Vanity';
        const codeText = usedInvite ? usedInvite.code : '---';
        const usesText = usedInvite ? usedInvite.uses : '?';

        await logCh.send({ 
            content: fillTemplate(TEMPLATES.INVITE, {
                'mención_usuario': `<@${member.user.id}>`,
                'invitador': inviterText,
                'codigo': codeText,
                'usos': usesText
            }) 
        }).catch(() => null);
    }

  } catch (e) { console.error('Error welcome/invite:', e); }
});

client.on('guildMemberRemove', async (m) => {
  try {
    if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
    const ch = await client.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(() => null);
    if (ch?.isTextBased()) await ch.send({ content: fillTemplate(TEMPLATES.LEAVE, { 'nombre_usuario': m.user?.username || `${m.user.id}` }) }).catch(() => null);
  } catch (e) { console.error('Error leave:', e); }
});

/* ---------- WEB & LOGIN ---------- */
const app = express();
app.get('/', (_, res) => res.send(`${SERVER_NAME} Bot Online 🚀`));
app.listen(process.env.PORT || 10000);

client.login(CONFIG.TOKEN).catch(e => {
  console.error('Error login:', e);
  process.exit(1);
});
