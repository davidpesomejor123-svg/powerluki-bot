// index.js — Power Luki Network Bot (Moderación, Anuncios, IP/Tienda, Bienvenidas)
// Requiere NODE 18+ y discord.js v14+
// Variables: TOKEN en env

import 'dotenv/config';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  ActivityType,
  PermissionsBitField,
} from 'discord.js';

/* ───────── CONFIG ───────── */
const CONFIG = {
  TOKEN: process.env.TOKEN,
  PORT: process.env.PORT || 10000,

  // Servidores y canales (IDs proporcionados)
  MAIN_GUILD_ID: '1458243569075884219', // servidor principal donde se envían los anuncios/nuevo y logs
  COMMAND_GUILD_ID: '1340442398442127480', // servidor donde se ejecutan los comandos (si aplica)

  CHANNELS: {
    BANS: '1340453829124034580',           // baneos permanentes
    UNBANS: '1457912738473967790',        // desbaneos
    TEMPBANS: '1457911150854541423',      // baneos temporales
    MUTES: '1453435158563913820',         // cuando se aplica mute (silenciados)
    MUTE_END: '1453521869968769106',      // cuando termina el tiempo del mute / desilenciado
    WELCOME: '1340454070070022205',       // bienvenidas
    LEAVE: '1340475418091847791',         // despedidas
  },

  EMOJIS: { TIENDA: '🛒', IP: '🌐' },

  SERVER_IP: 'play.tuservidor.com',
  SERVER_PORT: '24818',
};

/* ───────── EXPRESS ───────── */
const app = express();
app.get('/', (_, res) =>
  res.send(`🤖 Bot Power Luki: ${client?.ws?.status === 0 ? 'ONLINE ✅' : 'OFFLINE ⏳'}`)
);
app.listen(CONFIG.PORT, () =>
  console.log(`🌐 Web server activo en puerto ${CONFIG.PORT}`)
);

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

/* ───────── HELPERS ───────── */
function parseTimeToMs(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d+)([smhd])?$/i);
  if (!m) return null;
  const amount = Number(m[1]);
  const unit = (m[2] || 'm').toLowerCase();
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return null;
}

function formatDateTime(msOrDate) {
  const d = typeof msOrDate === 'number' ? new Date(msOrDate) : new Date(msOrDate);
  return d.toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa' });
}

async function safeEditReply(interaction, data) {
  try { return await interaction.editReply(data); }
  catch (e) {
    try { return await interaction.reply({ ...data, flags: 64 }); }
    catch (e2) { console.error('No se pudo responder a la interacción:', e2); }
  }
}

function makeBanEmbed({ username, moderator, durationStr, reason, endsAt }) {
  const embed = new EmbedBuilder()
    .setTitle('🚫 Sanción Aplicada: Power Lucky')
    .setColor('DarkRed')
    .addFields(
      { name: '👤 Usuario Sancionado', value: username, inline: true },
      { name: '🛡️ Moderador', value: moderator || '—', inline: true },
      { name: '⏳ Duración', value: durationStr || 'Permanente', inline: true },
      { name: '📄 Razón', value: reason || 'No especificada', inline: false },
    )
    .setTimestamp();

  if (endsAt) {
    embed.addFields({ name: '⏰ Termina el', value: formatDateTime(endsAt) });
    embed.setFooter({ text: `Sistema de Seguridad Power Lucky • ${formatDateTime(endsAt)}` });
  } else {
    embed.setFooter({ text: `Sistema de Seguridad Power Lucky • ${formatDateTime(new Date())}` });
  }
  return embed;
}

function makeUnbanEmbed({ username, moderator, reason }) {
  return new EmbedBuilder()
    .setTitle('🔓 Desbaneado: Power Lucky')
    .setColor('Green')
    .addFields(
      { name: '👤 Usuario', value: username },
      { name: '🛡️ Moderador', value: moderator || '—' },
      { name: '📄 Razón', value: reason || 'No especificada' }
    )
    .setTimestamp()
    .setFooter({ text: `Sistema de Seguridad Power Lucky • ${formatDateTime(new Date())}` });
}

function makeMuteEmbed({ username, moderator, durationStr, reason, endsAt }) {
  const embed = new EmbedBuilder()
    .setTitle('🔇 Usuario Silenciado')
    .setColor('Orange')
    .addFields(
      { name: '👤 Usuario', value: username, inline: true },
      { name: '🛡️ Moderador', value: moderator || '—', inline: true },
      { name: '⏳ Duración', value: durationStr || 'Indefinida', inline: true },
      { name: '📄 Razón', value: reason || 'No especificada' }
    )
    .setTimestamp();

  if (endsAt) {
    embed.addFields({ name: '⏰ Termina el', value: formatDateTime(endsAt) });
    embed.setFooter({ text: `Sistema de Seguridad Power Lucky • ${formatDateTime(endsAt)}` });
  } else {
    embed.setFooter({ text: `Sistema de Seguridad Power Lucky • ${formatDateTime(new Date())}` });
  }
  return embed;
}

function makeUnmuteEmbed({ username, moderator }) {
  return new EmbedBuilder()
    .setTitle('✅ Usuario Desilenciado')
    .setColor('Green')
    .addFields(
      { name: '👤 Usuario', value: username },
      { name: '🛡️ Moderador', value: moderator || '—' }
    )
    .setTimestamp()
    .setFooter({ text: `Sistema de Seguridad Power Lucky • ${formatDateTime(new Date())}` });
}

/* ───────── READY & REGISTER SLASHES ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
  try { await client.user.setActivity('Power Luki Network', { type: ActivityType.Playing }); } catch (e) { console.warn('No se pudo establecer la actividad', e); }

  const commands = [
    // Moderación
    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),
    new SlashCommandBuilder()
      .setName('temban')
      .setDescription('Ban temporal (ej: 1d, 2h, 30m)')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('tiempo').setDescription('Tiempo (ej: 1d, 3h)').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),
    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Desbanear usuario')
      .addStringOption(o => o.setName('userid').setDescription('ID del usuario a desbanear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),
    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar usuario (crea rol Muted si no existe)')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración (ej: 10m, 1h)').setRequired(false))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),
    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Quitar silenciado a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a desilenciar').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Advertir a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a advertir').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(true)),

    // Utilidades / anuncios
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio al canal ANUNCIOS del servidor principal')
      .addStringOption(o => o.setName('mensaje').setDescription('Contenido del anuncio').setRequired(true)),
    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar mensaje al canal NUEVO del servidor principal')
      .addStringOption(o => o.setName('mensaje').setDescription('Contenido del mensaje').setRequired(true)),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  try {
    // registramos globalmente (puede tardar en propagarse). Si prefieres registrar por guild usa Routes.applicationGuildCommands(client.user.id, CONFIG.COMMAND_GUILD_ID)
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registrados.');
  } catch (err) {
    console.error('❌ Error registrando slash commands:', err);
  }
});

/* ───────── INTERACTION HANDLER ───────── */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Defer early to avoid Unknown interaction in slow operations
  try { await interaction.deferReply({ ephemeral: true }); } catch (e) {}

  const cmd = interaction.commandName;
  const guildMain = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID).catch(() => null);

  try {
    // ---------- BAN ----------
    if (cmd === 'ban') {
      const target = interaction.options.getUser('usuario');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const g = interaction.guild;
      const mod = interaction.user.tag;

      // ban member if in this guild
      try {
        if (g) await g.members.ban(target.id, { reason });
      } catch (e) { /* ignore if not member */ }

      // send log to BANS channel in main guild
      const ch = guildMain ? await guildMain.channels.fetch(CONFIG.CHANNELS.BANS).catch(() => null) : null;
      if (ch) {
        const embed = makeBanEmbed({ username: `${target.tag} (<@${target.id}>)`, moderator: mod, durationStr: 'Permanente', reason });
        await ch.send({ embeds: [embed] }).catch(() => {});
      }

      await safeEditReply(interaction, { content: `🔨 ${target.tag} baneado.` });
      return;
    }

    // ---------- TEMPBAN ----------
    if (cmd === 'temban') {
      const target = interaction.options.getUser('usuario');
      const timeStr = interaction.options.getString('tiempo');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const g = interaction.guild;
      const mod = interaction.user.tag;
      const ms = parseTimeToMs(timeStr);
      if (!ms) return safeEditReply(interaction, { content: 'Formato de tiempo inválido. Usa ejemplos como: 10m, 2h, 1d' });

      try { if (g) await g.members.ban(target.id, { reason }); } catch (e) {}
      const endsAt = Date.now() + ms;

      // send to TEMPBANS channel
      const chTemp = guildMain ? await guildMain.channels.fetch(CONFIG.CHANNELS.TEMPBANS).catch(() => null) : null;
      if (chTemp) {
        const embed = makeBanEmbed({ username: `${target.tag} (<@${target.id}>)`, moderator: mod, durationStr: timeStr, reason, endsAt });
        await chTemp.send({ embeds: [embed] }).catch(() => {});
      }

      // schedule unban
      setTimeout(async () => {
        try {
          const mainGuildObj = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID).catch(() => null);
          if (mainGuildObj) await mainGuildObj.members.unban(target.id).catch(() => {});
          // log unban in UNBANS channel
          const chUn = mainGuildObj ? await mainGuildObj.channels.fetch(CONFIG.CHANNELS.UNBANS).catch(() => null) : null;
          if (chUn) {
            const embedUn = makeUnbanEmbed({ username: `${target.tag} (<@${target.id}>)`, moderator: 'Sistema (temporal)', reason: `Fin de tempban (${timeStr})` });
            await chUn.send({ embeds: [embedUn] }).catch(() => {});
          }
        } catch (e) { console.error('Error al desbanear programado:', e); }
      }, ms);

      await safeEditReply(interaction, { content: `⏱️ ${target.tag} baneado temporalmente por ${timeStr}.` });
      return;
    }

    // ---------- UNBAN ----------
    if (cmd === 'unban') {
      const userId = interaction.options.getString('userid');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const mainGuildObj = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID).catch(() => null);
      try {
        if (mainGuildObj) await mainGuildObj.members.unban(userId, reason).catch((e) => { throw e; });
      } catch (e) {
        return safeEditReply(interaction, { content: `❌ No se pudo desbanear al usuario ${userId}. Error: ${e.message}` });
      }

      // log to UNBANS channel
      const chUn = mainGuildObj ? await mainGuildObj.channels.fetch(CONFIG.CHANNELS.UNBANS).catch(() => null) : null;
      if (chUn) {
        const embedUn = makeUnbanEmbed({ username: `${userId}`, moderator: interaction.user.tag, reason });
        await chUn.send({ embeds: [embedUn] }).catch(() => {});
      }

      await safeEditReply(interaction, { content: `🔓 Usuario ${userId} desbaneado.` });
      return;
    }

    // ---------- MUTE ----------
    if (cmd === 'mute') {
      const target = interaction.options.getUser('usuario');
      const durationStr = interaction.options.getString('duracion');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const guild = interaction.guild;
      const mod = interaction.user.tag;

      if (!guild) return safeEditReply(interaction, { content: 'Este comando debe ejecutarse en un servidor.' });

      // ensure Muted role exists
      let mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
      try {
        if (!mutedRole) {
          mutedRole = await guild.roles.create({ name: 'Muted', permissions: [] });
          // Optionally set channel overrides here if needed
        }
      } catch (e) { console.error('No se pudo crear rol Muted:', e); }

      // add role
      try {
        const gMember = await guild.members.fetch(target.id);
        await gMember.roles.add(mutedRole);
      } catch (e) {
        // ignore if not member
      }

      // log to MUTES channel
      const chMute = guildMain ? await guildMain.channels.fetch(CONFIG.CHANNELS.MUTES).catch(() => null) : null;
      let endsAt = null;
      if (durationStr) {
        const ms = parseTimeToMs(durationStr);
        if (!ms) return safeEditReply(interaction, { content: 'Formato de tiempo inválido. Usa ejemplos: 10m, 1h, 1d' });
        endsAt = Date.now() + ms;

        // schedule unmute
        setTimeout(async () => {
          try {
            const mainGuildObj = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID).catch(() => null);
            const guildObj = guild; // original guild
            // remove role in original guild if member present
            try {
              const gMem = await guildObj.members.fetch(target.id).catch(() => null);
              if (gMem) {
                const mutedR = guildObj.roles.cache.find(r => r.name === 'Muted');
                if (mutedR) await gMem.roles.remove(mutedR).catch(() => {});
              }
            } catch (_) {}
            // send message to MUTE_END channel
            const chEnd = mainGuildObj ? await mainGuildObj.channels.fetch(CONFIG.CHANNELS.MUTE_END).catch(() => null) : null;
            if (chEnd) {
              const embedEnd = makeUnmuteEmbed({ username: `${target.tag} (<@${target.id}>)`, moderator: 'Sistema (fin de tiempo)' });
              await chEnd.send({ embeds: [embedEnd] }).catch(() => {});
            }
          } catch (e) { console.error('Error al quitar mute programado:', e); }
        }, ms);
      }

      if (chMute) {
        const embed = makeMuteEmbed({ username: `${target.tag} (<@${target.id}>)`, moderator: mod, durationStr: durationStr || 'Indefinida', reason, endsAt });
        await chMute.send({ embeds: [embed] }).catch(() => {});
      }

      await safeEditReply(interaction, { content: `🔇 ${target.tag} ha sido silenciado${durationStr ? ` por ${durationStr}` : ''}.` });
      return;
    }

    // ---------- UNMUTE ----------
    if (cmd === 'unmute') {
      const target = interaction.options.getUser('usuario');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const guild = interaction.guild;
      if (!guild) return safeEditReply(interaction, { content: 'Este comando debe ejecutarse en un servidor.' });
      try {
        const gMember = await guild.members.fetch(target.id);
        const mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
        if (mutedRole) await gMember.roles.remove(mutedRole).catch(() => {});
      } catch (e) { /* ignore */ }

      // log to MUTE_END channel
      const chEnd = guildMain ? await guildMain.channels.fetch(CONFIG.CHANNELS.MUTE_END).catch(() => null) : null;
      if (chEnd) {
        const embed = makeUnmuteEmbed({ username: `${target.tag} (<@${target.id}>)`, moderator: interaction.user.tag });
        await chEnd.send({ embeds: [embed] }).catch(() => {});
      }

      await safeEditReply(interaction, { content: `✅ ${target.tag} ha sido desilenciado.` });
      return;
    }

    // ---------- WARN ----------
    if (cmd === 'warn') {
      const target = interaction.options.getUser('usuario');
      const reason = interaction.options.getString('razon');
      await safeEditReply(interaction, { content: `⚠️ ${target.tag} ha sido advertido.\nRazón: ${reason}` });
      return;
    }

    // ---------- ANUNCIO (envía al MAIN_GUILD ANUNCIOS) ----------
    if (cmd === 'anuncio') {
      const msg = interaction.options.getString('mensaje');
      const ch = guildMain ? await guildMain.channels.fetch(CONFIG.CHANNELS.BANS).catch(() => null) : null; // <-- careful: use ANUNCIOS channel if you have it; here user used BANS earlier, adjust if necessary
      // Actually user previously gave 'CHANNELS.ANUNCIOS' in earlier steps; if missing, replace with the proper ID:
      const anuncioCh = guildMain ? await guildMain.channels.fetch(CONFIG.CHANNELS.ANUNCIOS ?? CONFIG.CHANNELS.BANS).catch(() => null) : null;
      if (!anuncioCh) return safeEditReply(interaction, { content: 'Canal de anuncios no encontrado en el servidor principal.' });
      const embed = new EmbedBuilder().setTitle('📣 Anuncio').setDescription(msg).setColor('Yellow');
      await anuncioCh.send({ embeds: [embed] }).catch(() => {});
      await safeEditReply(interaction, { content: 'Anuncio enviado al servidor principal ✅' });
      return;
    }

    // ---------- NUEVO (envía al canal NUEVO del servidor principal) ----------
    if (cmd === 'nuevo') {
      const msg = interaction.options.getString('mensaje');
      const nuevoCh = guildMain ? await guildMain.channels.fetch(CONFIG.CHANNELS.NUEVO).catch(() => null) : null;
      if (!nuevoCh) return safeEditReply(interaction, { content: 'Canal NUEVO no encontrado en el servidor principal.' });
      await nuevoCh.send({ content: msg }).catch(() => {});
      await safeEditReply(interaction, { content: 'Mensaje NUEVO enviado al servidor principal ✅' });
      return;
    }

  } catch (e) {
    console.error('Error en interaction handler:', e);
    try { await safeEditReply(interaction, { content: '❌ Error ejecutando comando' }); } catch (_) {}
  }
});

/* ───────── MENSAJES AUTOMÁTICOS (IP / TIENDA) ───────── */
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const content = message.content.toLowerCase();

  // IP
  if (content === '!ip' || content === 'ip') {
    const ipMsg = `
. _ . ▬▬▬▬▬▬ [ CONEXIÓN ] ▬▬▬▬▬▬ . _ .
;                                     ;
;   IP DEL SERVIDOR :                 ;
;   >> ${CONFIG.SERVER_IP} <<         ;
;                                     ;
; ................................... ;
;   ESTADO: ONLINE  ;  VER: 1.21.x    ;
. _ . ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ . _ .
    `;
    return message.channel.send({ content: ipMsg }).catch(() => {});
  }

  // Tienda
  if (content.includes('!tienda') || content.includes('tienda')) {
    const shopMsg = `
╔═════════════════════════════════════╗
   - _ .  TIENDA OFICIAL  . _ -
╚═════════════════════════════════════╝
 ;  APOYA AL SERVIDOR EN:             ;
 ;  --------------------------------- ;
 ;  .. https://${CONFIG.SERVER_IP === 'play.tuservidor.com' ? 'tienda.tuservidor.com' : 'tienda.tuservidor.com'}  ;
 ;  --------------------------------- ;
 ;  _ Rangos, Llaves y Beneficios _   ;
.......................................
    `;
    return message.channel.send({ content: shopMsg }).catch(() => {});
  }
});

/* ───────── BIENVENIDAS / DESPEDIDAS ───────── */
client.on('guildMemberAdd', async (member) => {
  try {
    const ch = await member.guild.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(() => null);
    if (!ch) return;
    // Title / Description like you asked
    const title = `✨ ¡Bienvenido, ${member.user.username}.! ✨`;
    const desc = `-_- - POWER LUKI NETWORK -_- \n\n💎 ${member.user.username} ha llegado a nuestra comunidad.\n🎇 ¡Disfruta tu estadía!`;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .setThumbnail(member.user.displayAvatarURL())
      .setColor('Aqua')
      .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' })
      .setTimestamp();
    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) { console.error('Error en guildMemberAdd:', e); }
});

client.on('guildMemberRemove', async (member) => {
  try {
    const ch = await member.guild.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(() => null);
    if (!ch) return;
    const title = `😔 ¡Hasta pronto, ${member.user.username}! 😔`;
    const desc = `- - - • POWER LUKI NETWORK • - - -\n\n╭━━━━━━━━━━━━━━━━━━━━━━━╮\n💔 ${member.user.username} nos deja temporalmente.\n🌟 Esperamos volver a verte pronto en Power Luki Network.\n╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n📌 Recuerda que siempre eres parte de nuestra comunidad.\n- - - • Siempre Bienvenido • - - -`;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .setThumbnail(member.user.displayAvatarURL())
      .setColor('DarkBlue')
      .setFooter({ text: `Power Luki Network • Nos vemos pronto • ${formatDateTime(new Date())}` })
      .setTimestamp();
    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) { console.error('Error en guildMemberRemove:', e); }
});

/* ───────── LOGIN ───────── */
if (!CONFIG.TOKEN) {
  console.error('❌ TOKEN no definido');
  process.exit(1);
}

client.login(CONFIG.TOKEN)
  .then(() => console.log('✅ Bot logueado'))
  .catch((e) => { console.error('Error al loguear el bot:', e); process.exit(1); });

/* ───────── GLOBAL ERROR HANDLERS ───────── */
process.on('unhandledRejection', (r, p) => console.error('UnhandledRejection', r, p));
process.on('uncaughtException', (err) => console.error('UncaughtException', err));
