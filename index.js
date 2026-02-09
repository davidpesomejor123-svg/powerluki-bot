import 'dotenv/config';
import express from 'express';
import fs from 'fs';
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
  ChannelType
} from 'discord.js';

/* ───────── CONFIGURACIÓN ───────── */
const ALLOWED_SERVERS = [
  '1340442398442127480',
  '1458243569075884219'
];

const CONFIG = {
  TOKEN: process.env.TOKEN,
  CHANNELS: {
    ANUNCIOS: '1340756895618699416',
    NUEVO: '1340757162573562007',
    BANS: '1340453829124034580',                 // canal de baneos (logs)
    TEMPBAN: '1457911150854541423',             // canal tempban
    MUTE: '1453435158563913820',                // canal mute
    UNMUTE: '1453521869968769106',              // canal unmute
    UNBAN: '1457912738473967790',               // canal unban (nuevo)
    CAMBIOS: '1340757615407272068',             // canal /cambios (nuevo)
    XP: '1340500687670476810',                  // canal log niveles/xp
    WELCOME: '1340454070070022205',             // canal bienvenida
    LEAVE: '1340475418091847791'                // canal despedida
  },
  SERVER_IP: process.env.SERVER_IP || 'play.tuservidor.com',
  SERVER_PORT: process.env.SERVER_PORT || '19132',
  VERSIONS: process.env.VERSIONS || 'Java & Bedrock (varias versiones)'
};

// Rutas de persistencia
const DB_DIR = path.resolve('./data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);
const TEMPBANS_FILE = path.join(DB_DIR, 'tempbans.json');
const XP_FILE = path.join(DB_DIR, 'xp.json');

/* ───────── UTILIDADES ───────── */
const readJSON = (file, fallback) => {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8') || 'null') || fallback;
  } catch (e) {
    console.error(`Error leyendo ${file}:`, e);
    return fallback;
  }
};
const writeJSON = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error escribiendo ${file}:`, e);
  }
};

// parseDuration: acepta formatos "7d", "12h", "30m", "1d12h", o solo número -> días
function parseDuration(str) {
  if (!str) return null;
  str = String(str).trim().toLowerCase();
  const regex = /(\d+)\s*(d|h|m)/g;
  let match;
  let totalMs = 0;
  while ((match = regex.exec(str)) !== null) {
    const n = Number(match[1]);
    const unit = match[2];
    if (unit === 'd') totalMs += n * 24 * 60 * 60 * 1000;
    if (unit === 'h') totalMs += n * 60 * 60 * 1000;
    if (unit === 'm') totalMs += n * 60 * 1000;
  }
  // si no hay coincidencias y es numérico, lo tomamos como dias
  if (totalMs === 0 && /^\d+$/.test(str)) {
    totalMs = Number(str) * 24 * 60 * 60 * 1000;
  }
  return totalMs > 0 ? totalMs : null;
}

// formatea fecha legible para "Expira" o "Fecha ingreso"
function formatDateISO(ts) {
  const d = new Date(ts);
  return d.toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa', dateStyle: 'medium', timeStyle: 'short' });
}

// reemplazo de plantilla
function fillTemplate(template, map) {
  let out = template;
  for (const k in map) {
    out = out.replace(new RegExp(`<${k}>`, 'g'), map[k]);
  }
  return out;
}

/* ───────── TEMPLATES ───────── */
const TEMPLATES = {
  BAN: `╔════════════════════════════════════╗
      🚫 USUARIO BANEADO 🚫
╚════════════════════════════════════╝

  ●--👤 Usuario: <mención_usuario>
  ●--🆔 ID: <id_del_usuario>
  ●--⚖️ Razón: <razón_del_ban>
  ●--🛡️ Moderador: <moderador>

  _¡Las reglas se respetan!_
  ------------------------------------`,
  TEMPBAN: `╔════════════════════════════════════╗
      ⏳ ACCESO SUSPENDIDO ⏳
╚════════════════════════════════════╝

  ●--👤 Usuario: <mención_usuario>
  ●--🆔 ID: <id_del_usuario>
  ●--⚖️ Razón: <razón_del_ban>
  ●--⏱️ Duración: <tiempo_ej_7_días>
  ●--📅 Expira: <fecha_de_desban>

  _¡Cumple tu tiempo y vuelve mejor!_
  ------------------------------------`,
  MUTE: `╔════════════════════════════════════╗
      🔇 USUARIO SILENCIADO 🔇
╚════════════════════════════════════╝

  ●--👤 Usuario: <mención_usuario>
  ●--🆔 ID: <id_del_usuario>
  ●--⚖️ Razón: <razón_del_mute>
  ●--⏱️ Tiempo: <duración_del_mute>
  ●--🛡️ Moderador: <moderador>

  _¡Shhh! Medita tus palabras._
  ------------------------------------`,
  UNMUTE: `╔════════════════════════════════════╗
      🔊 SILENCIO REMOVIDO 🔊
╚════════════════════════════════════╝

  ●--👤 Usuario: <mención_usuario>
  ●--🆔 ID: <id_del_usuario>
  ●--⚖️ Razón: <razón_del_unmute>
  ●--🛡️ Moderador: <moderador>

  _¡Ya puedes hablar de nuevo!_
  ------------------------------------`,
  UNBAN: `╔════════════════════════════════════╗
      🔓 ACCESO RESTABLECIDO 🔓
╚════════════════════════════════════╝

  🔹 Usuario ➭ <mención_usuario>
  🔹 ID      ➭ <id_del_usuario>
  🔹 Estado  ➭ RE-ADMITIDO [✔]
  🔹 Soporte ➭ Power Lukcy Network

  _✨ ¡Bienvenido de vuelta! Sigue las reglas._
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  WELCOME: `╔════════════════════════════════════╗
     💎 POWER LUKCY NETWORK 💎
╚════════════════════════════════════╝

  🔹 Usuario ➭ <mención_usuario>
  🔹 Acceso  ➭ AUTORIZADO [✔]
  🔹 Rol     ➭ Nuevo Miembro
  🔹 Fecha   ➭ <fecha_ingreso>

  _🥂 Bienvenido a la elite. ¡Diviértete!_
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  LEAVE: `╔════════════════════════════════════╗
     🛫 SALIDA DE LA NETWORK 🛫
╚════════════════════════════════════╝

  🔹 Usuario ➭ <nombre_usuario>
  🔹 Estado  ➭ DESCONECTADO [❌]
  🔹 Lugar   ➭ Power Lukcy Network
  🔹 Fecha   ➭ <fecha_salida>

  _👋 Esperamos verte regresar pronto._
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  LEVELUP: `╔════════════════════════════════════╗
      🆙 LEVEL UP / NUEVO NIVEL 🆙
╚════════════════════════════════════╝

  🔹 Usuario ➭ <mención_usuario>
  🔹 Nivel   ➭ <nivel_anterior> ➔ ⭐ <nuevo_nivel>
  🔹 XP Total➭ <xp_total>
  🔹 Rol     ➭ <nombre_rol_recompensa>

  _🔥 ¡Imparable! Sigue chateando._
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
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

/* ───────── DATOS PERSISTENTES EN MEMORIA ───────── */
let tempBans = readJSON(TEMPBANS_FILE, {}); // { "<guildId>|<userId>": { expiresAt, reason, moderatorId } }
let xpData = readJSON(XP_FILE, {}); // { "<guildId>": { "<userId>": { xp, lastTime } } }

// helpers para programar desban
const scheduledUnbans = new Map(); // key -> timeout

function scheduleUnban(guildId, userId, expiresAt) {
  const key = `${guildId}|${userId}`;
  const ms = expiresAt - Date.now();
  if (ms <= 0) {
    // expirar inmediatamente
    performUnban(guildId, userId).catch(console.error);
    delete tempBans[key];
    writeJSON(TEMPBANS_FILE, tempBans);
    return;
  }
  if (scheduledUnbans.has(key)) clearTimeout(scheduledUnbans.get(key));
  const t = setTimeout(async () => {
    try {
      await performUnban(guildId, userId);
    } catch (e) {
      console.error('Error al desbanear automáticamente:', e);
    } finally {
      delete tempBans[key];
      writeJSON(TEMPBANS_FILE, tempBans);
      scheduledUnbans.delete(key);
    }
  }, ms);
  scheduledUnbans.set(key, t);
}

async function performUnban(guildId, userId) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    await guild.bans.remove(userId, 'Expiración de tempban').catch(() => null);
    // log en canal de tempban/unban (usamos CHANNELS.TEMPBAN)
    const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN).catch(() => null);
    if (ch && ch.isTextBased()) {
      await ch.send(`🔔 Usuario <@${userId}> desbaneado automáticamente (tempban expirado).`).catch(() => null);
    }
  } catch (e) {
    console.error('performUnban error:', e);
  }
}

/* ───────── READY: sincroniza comandos y reprograma tempbans ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Power Luki Network', { type: ActivityType.Playing });

  // Registrar comandos (añadimos ban/tempban/mute/unmute/cambios/unban)
  const commands = [
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio oficial')
      .addStringOption(o => o.setName('mensaje').setDescription('Usa DOBLE ESPACIO para salto de línea').setRequired(true)),

    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar novedad')
      .addStringOption(o => o.setName('mensaje').setDescription('Usa DOBLE ESPACIO para salto de línea').setRequired(true)),

    new SlashCommandBuilder()
      .setName('cambios')
      .setDescription('Publicar cambios en canal de cambios')
      .addStringOption(o => o.setName('mensaje').setDescription('Usa DOBLE ESPACIO para salto de línea').setRequired(true)),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear a un usuario permanentemente')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón del ban').setRequired(false)),

    new SlashCommandBuilder()
      .setName('tempban')
      .setDescription('Ban temporal: ejemplo 7d, 12h, 30m')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear temporalmente').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración: 7d, 12h, 30m').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar por un tiempo (timeout)')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración: 7d, 12h, 30m').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Quitar silencio a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a des-silenciar').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón del unmute').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Quitar el ban a un usuario')
      .addStringOption(o => o.setName('userid').setDescription('ID del usuario a desbanear').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);

  try {
    for (const guildId of ALLOWED_SERVERS) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
      console.log(`🚀 Comandos sincronizados en ${guildId}`);
    }
  } catch (err) {
    console.error('❌ Error registrando comandos:', err);
  }

  // Reprogramar tempbans cargadas desde archivo
  for (const key of Object.keys(tempBans)) {
    const entry = tempBans[key];
    const [guildId, userId] = key.split('|');
    if (entry && entry.expiresAt) {
      scheduleUnban(guildId, userId, entry.expiresAt);
    }
  }
});

/* ───────── INTERACCIONES ───────── */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!ALLOWED_SERVERS.includes(interaction.guildId)) return;

  const { commandName, options, member } = interaction;

  // comandos que ya tenías: anuncio / nuevo / cambios
  if (commandName === 'anuncio' || commandName === 'nuevo' || commandName === 'cambios') {
    await interaction.deferReply({ ephemeral: true });
    const raw = options.getString('mensaje', true);
    const mensaje = raw.replace(/\s{2,}/g, '\n').trim();
    const canalId = commandName === 'anuncio' ? CONFIG.CHANNELS.ANUNCIOS : (commandName === 'nuevo' ? CONFIG.CHANNELS.NUEVO : CONFIG.CHANNELS.CAMBIOS);
    const canal = await client.channels.fetch(canalId).catch(() => null);
    if (!canal) return interaction.editReply('❌ No se encontró el canal configurado.');
    const permisos = canal.permissionsFor(client.user);
    if (!permisos || !permisos.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) {
      return interaction.editReply('❌ No tengo permisos para enviar mensajes en ese canal.');
    }
    try {
      await canal.send({ content: mensaje });
      return interaction.editReply('✅ Mensaje enviado con éxito.');
    } catch (e) {
      console.error('ERROR enviar mensaje:', e);
      return interaction.editReply('❌ Error al enviar el mensaje.');
    }
  }

  // Moderación: ban
  if (commandName === 'ban') {
    await interaction.deferReply({ ephemeral: true });
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.editReply('❌ No tienes permiso para banear usuarios.');
    }
    const target = options.getUser('usuario', true);
    const reason = options.getString('razon') || 'Sin razón especificada';
    try {
      await interaction.guild.members.ban(target.id, { reason }).catch(e => { throw e; });
      // log en canal de bans
      const template = TEMPLATES.BAN;
      const text = fillTemplate(template, {
        'mención_usuario': `<@${target.id}>`,
        'id_del_usuario': target.id,
        'razón_del_ban': reason,
        'moderador': `<@${interaction.user.id}>`
      });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.BANS).catch(() => null);
      if (ch && ch.isTextBased()) await ch.send({ content: text }).catch(() => null);
      return interaction.editReply(`✅ ${target.tag} baneado correctamente.`);
    } catch (e) {
      console.error('Error ban:', e);
      return interaction.editReply('❌ Error al banear al usuario.');
    }
  }

  // tempban
  if (commandName === 'tempban') {
    await interaction.deferReply({ ephemeral: true });
    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.editReply('❌ No tienes permiso para banear usuarios.');
    }
    const target = options.getUser('usuario', true);
    const dur = options.getString('duracion', true);
    const reason = options.getString('razon') || 'Sin razón especificada';
    const ms = parseDuration(dur);
    if (!ms) return interaction.editReply('❌ Duración inválida. Usa formatos como `7d`, `12h`, `30m`.');
    try {
      await interaction.guild.members.ban(target.id, { reason }).catch(e => { throw e; });
      const expiresAt = Date.now() + ms;
      const key = `${interaction.guildId}|${target.id}`;
      tempBans[key] = { expiresAt, reason, moderatorId: interaction.user.id };
      writeJSON(TEMPBANS_FILE, tempBans);
      scheduleUnban(interaction.guildId, target.id, expiresAt);
      // log en canal tempban
      const template = TEMPLATES.TEMPBAN;
      const text = fillTemplate(template, {
        'mención_usuario': `<@${target.id}>`,
        'id_del_usuario': target.id,
        'razón_del_ban': reason,
        'tiempo_ej_7_días': dur,
        'fecha_de_desban': formatDateISO(expiresAt),
        'moderador': `<@${interaction.user.id}>`
      });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.TEMPBAN).catch(() => null);
      if (ch && ch.isTextBased()) await ch.send({ content: text }).catch(() => null);
      return interaction.editReply(`✅ ${target.tag} baneado temporalmente hasta ${formatDateISO(expiresAt)}.`);
    } catch (e) {
      console.error('Error tempban:', e);
      return interaction.editReply('❌ Error al aplicar tempban.');
    }
  }

  // mute (timeout)
  if (commandName === 'mute') {
    await interaction.deferReply({ ephemeral: true });
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.editReply('❌ No tienes permiso para silenciar usuarios.');
    }
    const targetUser = options.getUser('usuario', true);
    const dur = options.getString('duracion', true);
    const reason = options.getString('razon') || 'Sin razón especificada';
    const ms = parseDuration(dur);
    if (!ms) return interaction.editReply('❌ Duración inválida. Usa formatos como `7d`, `12h`, `30m`.');
    try {
      const guildMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!guildMember) return interaction.editReply('❌ No se encontró al miembro en el servidor.');
      await guildMember.timeout(ms, `Mute por ${interaction.user.tag}: ${reason}`).catch(e => { throw e; });
      // log en canal mute
      const template = TEMPLATES.MUTE;
      const text = fillTemplate(template, {
        'mención_usuario': `<@${targetUser.id}>`,
        'id_del_usuario': targetUser.id,
        'razón_del_mute': reason,
        'duración_del_mute': dur,
        'moderador': `<@${interaction.user.id}>`
      });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.MUTE).catch(() => null);
      if (ch && ch.isTextBased()) await ch.send({ content: text }).catch(() => null);
      return interaction.editReply(`🔇 ${targetUser.tag} silenciado por ${dur}.`);
    } catch (e) {
      console.error('Error mute:', e);
      return interaction.editReply('❌ Error al silenciar al usuario.');
    }
  }

  // unmute
  if (commandName === 'unmute') {
    await interaction.deferReply({ ephemeral: true });
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.editReply('❌ No tienes permiso para des-silenciar usuarios.');
    }
    const targetUser = options.getUser('usuario', true);
    const reason = options.getString('razon') || 'Sin razón especificada';
    try {
      const guildMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!guildMember) return interaction.editReply('❌ No se encontró al miembro en el servidor.');
      await guildMember.timeout(null, `Unmute por ${interaction.user.tag}: ${reason}`).catch(e => { throw e; });
      // log en canal unmute
      const template = TEMPLATES.UNMUTE;
      const text = fillTemplate(template, {
        'mención_usuario': `<@${targetUser.id}>`,
        'id_del_usuario': targetUser.id,
        'razón_del_unmute': reason,
        'moderador': `<@${interaction.user.id}>`
      });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.UNMUTE).catch(() => null);
      if (ch && ch.isTextBased()) await ch.send({ content: text }).catch(() => null);
      return interaction.editReply(`🔊 ${targetUser.tag} ya puede hablar nuevamente.`);
    } catch (e) {
      console.error('Error unmute:', e);
      return interaction.editReply('❌ Error al quitar el silencio.');
    }
  }

  // unban (nuevo)
  if (commandName === 'unban') {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.editReply('❌ No tienes permiso para desbanear usuarios.');
    }

    const userId = options.getString('userid', true);

    try {
      await interaction.guild.bans.remove(userId, `Unban por ${interaction.user.tag}`);

      // eliminar tempban persistente si existe
      const key = `${interaction.guildId}|${userId}`;
      if (tempBans[key]) {
        delete tempBans[key];
        writeJSON(TEMPBANS_FILE, tempBans);
        if (scheduledUnbans.has(key)) {
          clearTimeout(scheduledUnbans.get(key));
          scheduledUnbans.delete(key);
        }
      }

      const text = fillTemplate(TEMPLATES.UNBAN, {
        'mención_usuario': `<@${userId}>`,
        'id_del_usuario': userId
      });

      const ch = await client.channels.fetch(CONFIG.CHANNELS.UNBAN).catch(() => null);
      if (ch && ch.isTextBased()) {
        await ch.send({ content: text }).catch(() => null);
      }

      return interaction.editReply(`✅ Usuario <@${userId}> desbaneado correctamente.`);
    } catch (e) {
      console.error('Error unban:', e);
      return interaction.editReply('❌ No se pudo desbanear al usuario. ¿ID correcto?');
    }
  }
});

/* ───────── MENSAJES (xp, respuestas rápidas, ip/tienda) ───────── */
const xpCooldowns = new Map(); // "<guildId>|<userId>" -> timestamp

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!ALLOWED_SERVERS.includes(message.guild.id)) return;

  const content = message.content.toLowerCase();

  // RESPUESTAS rápidas que ya tenías
  if (['.ip', ':ip', '-ip', '_ip'].some(cmd => content.startsWith(cmd))) {
    const msgIP = [
      '✨ **P O W E R  L U K I  N E T W O R K** ✨',
      ' ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
      ' 🌐 **IP PRINCIPAL** .: _ `' + CONFIG.SERVER_IP + '` _',
      ' 🔌 **PUERTO BEDROCK** .: _ `' + CONFIG.SERVER_PORT + '` _',
      ' 🎮 **VERSIONES** .: _ `' + CONFIG.VERSIONS + '` _',
      ' ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
      ' > *¡Conexión compatible con Java y Bedrock!*'
    ].join('\n');
    return message.reply({ content: msgIP }).catch(() => null);
  }

  if (['.tienda', ':tienda', '-tienda', '_tienda'].some(cmd => content.startsWith(cmd))) {
    const msgTienda = [
      '🛒 **TIENDA OFICIAL | POWER LUKI**',
      ' ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
      ' 🔗 **LINK DIRECTO** .: _ https://powerluki.tebex.io _',
      ' 💎 **BENEFICIOS** .: _ RANGOS - KEYS - UNBANS _',
      ' - - - - - - - - - - - - - - - - -',
      ' 🛡️ **SOPORTE** .: _ Abre un ticket si tienes dudas _',
      ' ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
      ' *¡Tu apoyo mantiene el servidor online!* ✨'
    ].join('\n');
    return message.reply({ content: msgTienda }).catch(() => null);
  }

  // sistema simple de XP/LEVEL
  try {
    const key = `${message.guild.id}|${message.author.id}`;
    const now = Date.now();
    const cooldown = 60 * 1000; // 60s por mensaje para evitar spam xp
    const last = xpCooldowns.get(key) || 0;
    if (now - last >= cooldown) {
      xpCooldowns.set(key, now);
      // asignar xp aleatoria entre 5 y 15
      const gain = Math.floor(Math.random() * 11) + 5;
      if (!xpData[message.guild.id]) xpData[message.guild.id] = {};
      if (!xpData[message.guild.id][message.author.id]) xpData[message.guild.id][message.author.id] = { xp: 0 };
      const userRecord = xpData[message.guild.id][message.author.id];
      const oldXp = userRecord.xp || 0;
      const oldLevel = Math.floor(oldXp / 100) + 1;
      const newXp = oldXp + gain;
      userRecord.xp = newXp;
      writeJSON(XP_FILE, xpData);
      const newLevel = Math.floor(newXp / 100) + 1;
      if (newLevel > oldLevel) {
        // level up: notificar en canal XP
        const ch = await client.channels.fetch(CONFIG.CHANNELS.XP).catch(() => null);
        const text = fillTemplate(TEMPLATES.LEVELUP, {
          'mención_usuario': `<@${message.author.id}>`,
          'nivel_anterior': oldLevel,
          'nuevo_nivel': newLevel,
          'xp_total': newXp,
          'nombre_rol_recompensa': '—'
        });
        if (ch && ch.isTextBased()) await ch.send({ content: text }).catch(() => null);
      }
    }
  } catch (e) {
    console.error('XP error:', e);
  }
});

/* ───────── BIENVENIDAS / DESPEDIDAS ───────── */
client.on('guildMemberAdd', async (m) => {
  if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
  const ch = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(() => null);
  if (!ch || !ch.isTextBased()) return;
  const text = fillTemplate(TEMPLATES.WELCOME, {
    'mención_usuario': `<@${m.user.id}>`,
    'fecha_ingreso': formatDateISO(Date.now())
  });
  ch.send({ content: text }).catch(() => null);
});

client.on('guildMemberRemove', async (m) => {
  if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
  const ch = await client.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(() => null);
  if (!ch || !ch.isTextBased()) return;
  const text = fillTemplate(TEMPLATES.LEAVE, {
    'nombre_usuario': `${m.user.username}`,
    'fecha_salida': formatDateISO(Date.now())
  });
  ch.send({ content: text }).catch(() => null);
});

/* ───────── SERVER WEB ───────── */
const app = express();
app.get('/', (_, res) => res.send('🤖 Power Lucky Bot Online'));
app.listen(process.env.PORT || 10000);

/* ───────── LOGIN ───────── */
client.login(CONFIG.TOKEN);
