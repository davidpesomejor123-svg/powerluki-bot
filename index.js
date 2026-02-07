import 'dotenv/config';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
  ActivityType
} from 'discord.js';

/* ───────── CONFIG ───────── */
// IDs de los servidores donde el bot TIENE PERMISO de funcionar
const ALLOWED_SERVERS = [
  '1340442398442127480', // Servidor Principal (indicado por ti)
  '1458243569075884219'  // El otro servidor autorizado
];

const CONFIG = {
  TOKEN: process.env.TOKEN,
  MAIN_GUILD_ID: '1458243569075884219',
  COMMAND_GUILD_ID: '1340442398442127480',
  CHANNELS: {
    ANUNCIOS: '1340756895618699416',
    NUEVO: '1340757162573562007',
    BANS: '1340453829124034580',
    UNBANS: '1457912738473967790',
    TEMPBANS: '1457911150854541423',
    MUTES: '1453435158563913820',
    MUTE_END: '1453521869968769106',
    WELCOME: '1340454070070022205',
    LEAVE: '1340475418091847791'
  },
  EMOJIS: { TIENDA: '🛒', IP: '🌐' },
  SERVER_IP: 'play.tuservidor.com',
  SERVER_PORT: '24818'
};

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

/* ───────── EXPRESS ───────── */
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (_, res) => res.send(`🤖 Bot Power Luki: ${client?.ws?.status === 0 ? 'ONLINE ✅' : 'CONECTANDO...'}`));
app.listen(PORT, () => console.log(`🌐 Web server escuchando en ${PORT}`));

/* ───────── HELPERS ───────── */
function parseTimeToMs(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d+)([smhd])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return null;
}

function formatDateTime(dateOrMs) {
  const d = typeof dateOrMs === 'number' ? new Date(dateOrMs) : new Date(dateOrMs);
  return d.toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa' });
}

// FUNCIÓN CORREGIDA PARA EVITAR WARNINGS Y ERRORES DE INTERACCIÓN
async function safeEditReply(interaction, data = {}) {
  try {
    const { ephemeral, flags, ...cleanData } = data;
    const replyOptions = { ...cleanData };
    if (ephemeral) replyOptions.flags = 64;

    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(replyOptions).catch((err) => {
        if (!/already been acknowledged/i.test(err?.message || '')) {
          console.error('⚠️ Error al editar reply:', err);
        }
      });
    } else {
      return await interaction.reply(replyOptions).catch((err) => {
        if (!/already been acknowledged/i.test(err?.message || '')) {
          console.error('⚠️ Error al reply:', err);
        }
      });
    }
  } catch (e) {
    console.error('⚠️ Error al responder interacción:', e);
  }
}

/* ───────── EMBED BUILDERS ───────── */
function makeModEmbed({ title, userTag, moderatorTag, reason, duration, endsAt }) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(duration ? 'Orange' : (title.toLowerCase().includes('des') || title.toLowerCase().includes('desil') ? 'Green' : 'Red'))
    .addFields(
      { name: '👤 Usuario', value: userTag ?? '—', inline: true },
      { name: '🛡️ Moderador', value: moderatorTag ?? '—', inline: true },
      { name: '📄 Razón', value: reason ?? 'No especificada', inline: false }
    )
    .setTimestamp();

  if (duration) embed.addFields({ name: '⏳ Duración', value: duration, inline: true });
  if (endsAt) {
    embed.addFields({ name: '⏰ Termina el', value: formatDateTime(endsAt), inline: false });
    embed.setFooter({ text: `Sistema de Seguridad Power Lucky • ${formatDateTime(endsAt)}` });
  } else {
    embed.setFooter({ text: `Sistema de Seguridad Power Lucky • ${formatDateTime(new Date())}` });
  }
  return embed;
}

function makeWelcomeEmbed(member) {
  const title = `✨ ¡Bienvenido, ${member.user.username}! ✨`;
  const desc = `-_- - POWER LUKI NETWORK -_- \n\n💎 ${member.user.username} ha llegado a nuestra comunidad.\n🎇 ¡Disfruta tu estadía!`;
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' })
    .setColor('Aqua')
    .setTimestamp();
}

function makeLeaveEmbed(member) {
  const title = `😔 ¡Hasta pronto, ${member.user.username}! 😔`;
  const desc = `- - - • POWER LUKI NETWORK • - - -\n\n╭━━━━━━━━━━━━━━━━━━━━━━━╮\n💔 ${member.user.username} nos deja temporalmente.\n🌟 Esperamos volver a verte pronto en Power Luki Network.\n╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n📌 Recuerda que siempre eres parte de nuestra comunidad.\n- - - • Siempre Bienvenido • - - -`;
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: `Power Luki Network • Nos vemos pronto • ${formatDateTime(new Date())}` })
    .setColor('DarkBlue')
    .setTimestamp();
}

/* ───────── READY + SLASH COMMANDS ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
  try { await client.user.setActivity('Power Luki Network', { type: ActivityType.Playing }); } catch (e) { console.warn(e); }

  const commands = [
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio (Texto Plano)')
      .addStringOption(o => o.setName('mensaje').setDescription('Pega tu diseño aquí').setRequired(true)),

    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar mensaje NUEVO (Texto Plano)')
      .addStringOption(o => o.setName('mensaje').setDescription('Pega tu diseño aquí').setRequired(true)),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón del baneo').setRequired(false)),

    new SlashCommandBuilder()
      .setName('temban')
      .setDescription('Ban temporal')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('tiempo').setDescription('Tiempo (10s, 5m, 1h)').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Desbanear usuario')
      .addStringOption(o => o.setName('userid').setDescription('ID del usuario').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración').setRequired(false))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Quitar silenciado')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  try {
    // Registramos comandos globalmente para que aparezcan rápido, pero los filtraremos al ejecutarlos
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registrados.');
  } catch (err) {
    console.error('❌ Error registrando commands:', err);
  }
});

/* ───────── INTERACTION HANDLER ───────── */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand?.()) return;

  // 🔒 SEGURIDAD: VERIFICACIÓN DE SERVIDOR 🔒
  // Si el comando no viene de los servidores permitidos, no hacemos nada o enviamos error.
  if (!interaction.guildId || !ALLOWED_SERVERS.includes(interaction.guildId)) {
    return interaction.reply({ 
      content: '⛔ **Acceso Denegado:** Este bot es privado y solo funciona en los servidores oficiales de Power Luki.', 
      ephemeral: true 
    }).catch(() => {});
  }

  const cmd = interaction.commandName;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 }).catch((e) => {
        console.log(`Nota: Defer falló para ${cmd}, continuando...`);
      });
    }
  } catch (e) {
    console.log(`Nota: Error intentando defer para ${cmd}:`, e?.message || e);
  }

  try {
    // ---------- ANUNCIO ----------
    if (cmd === 'anuncio') {
      const msg = interaction.options.getString('mensaje') ?? '';

      if (!msg || msg.length === 0) return safeEditReply(interaction, { content: '❌ Error: El mensaje llegó vacío.' });

      const ch = await client.channels.fetch(CONFIG.CHANNELS.ANUNCIOS).catch(() => null);
      if (!ch) return safeEditReply(interaction, { content: '❌ No encuentro el canal de anuncios.' });

      if (msg.length > 1900) {
        return safeEditReply(interaction, { content: '⚠️ Mensaje muy largo (máx 1900 caracteres).' });
      }

      await ch.send({ content: `@everyone\n\`\`\`text\n${msg}\n\`\`\`` }).catch(() => {});
      return safeEditReply(interaction, { content: '✅ Anuncio enviado.' });
    }

    // ---------- NUEVO ----------
    if (cmd === 'nuevo') {
      const msg = interaction.options.getString('mensaje') ?? '';

      if (!msg || msg.length === 0) return safeEditReply(interaction, { content: '❌ Error: El mensaje llegó vacío.' });

      const ch = await client.channels.fetch(CONFIG.CHANNELS.NUEVO).catch(() => null);
      if (!ch) return safeEditReply(interaction, { content: '❌ No encuentro el canal NUEVO.' });

      if (msg.length > 1900) {
        return safeEditReply(interaction, { content: '⚠️ Mensaje muy largo.' });
      }

      await ch.send({ content: `@everyone\n\`\`\`text\n${msg}\n\`\`\`` }).catch(() => {});
      return safeEditReply(interaction, { content: '✅ Mensaje NUEVO enviado.' });
    }

    // ---------- BAN ----------
    if (cmd === 'ban') {
      const target = interaction.options.getUser('usuario');
      if (!target) return safeEditReply(interaction, { content: '❌ Usuario no encontrado.' });
      const reason = interaction.options.getString('razon') || 'No especificada';
      const guild = interaction.guild;

      try {
        if (guild) await guild.members.ban(target.id, { reason });
      }
      catch (e) {
        return safeEditReply(interaction, { content: '❌ No pude banear (Faltan permisos o error).' });
      }

      const embed = makeModEmbed({ title: '🚫 Sanción Aplicada', userTag: `${target.tag} (<@${target.id}>)`, moderatorTag: interaction.user.tag, reason });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.BANS).catch(() => null);
      if (ch) await ch.send({ embeds: [embed] }).catch(() => {});

      return safeEditReply(interaction, { content: `🔨 **${target.tag}** baneado.` });
    }

    // ---------- TEMPBAN ----------
    if (cmd === 'temban') {
      const target = interaction.options.getUser('usuario');
      if (!target) return safeEditReply(interaction, { content: '❌ Usuario no encontrado.' });
      const timeStr = interaction.options.getString('tiempo');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const guild = interaction.guild;
      const ms = parseTimeToMs(timeStr);

      if (!ms) return safeEditReply(interaction, { content: '❌ Tiempo inválido. Ej: 10s, 5m, 1h' });

      try { if (guild) await guild.members.ban(target.id, { reason }); }
      catch (e) { return safeEditReply(interaction, { content: '❌ No pude banear (Faltan permisos o error).' }); }

      const embed = makeModEmbed({ title: '⏱️ Ban Temporal', userTag: `${target.tag} (<@${target.id}>)`, moderatorTag: interaction.user.tag, reason, duration: timeStr, endsAt: Date.now() + ms });
      const chTemp = await client.channels.fetch(CONFIG.CHANNELS.TEMPBANS).catch(() => null);
      if (chTemp) await chTemp.send({ embeds: [embed] }).catch(() => {});

      setTimeout(async () => {
        try {
          const mainGuild = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID).catch(() => null);
          if (mainGuild) await mainGuild.members.unban(target.id).catch(() => {});
          const chUn = await client.channels.fetch(CONFIG.CHANNELS.UNBANS).catch(() => null);
          if (chUn) {
            const embedUn = makeModEmbed({ title: '🔓 Fin de Tempban', userTag: `${target.tag}`, moderatorTag: 'Sistema', reason: `Expiró: ${timeStr}` });
            await chUn.send({ embeds: [embedUn] }).catch(() => {});
          }
        } catch (e) { console.error('Error en unban auto:', e); }
      }, ms);

      return safeEditReply(interaction, { content: `⏱️ **${target.tag}** baneado x ${timeStr}.` });
    }

    // ---------- UNBAN ----------
    if (cmd === 'unban') {
      const userId = interaction.options.getString('userid');
      if (!userId) return safeEditReply(interaction, { content: '❌ ID inválida.' });
      const reason = interaction.options.getString('razon') || 'No especificada';
      const mainGuild = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID).catch(() => null);

      try { if (mainGuild) await mainGuild.members.unban(userId, reason); }
      catch (e) { return safeEditReply(interaction, { content: `❌ No pude desbanear a ${userId}.` }); }

      const chUn = await client.channels.fetch(CONFIG.CHANNELS.UNBANS).catch(() => null);
      if (chUn) {
        const embedUn = makeModEmbed({ title: '🔓 Desbaneado', userTag: `${userId}`, moderatorTag: interaction.user.tag, reason });
        await chUn.send({ embeds: [embedUn] }).catch(() => {});
      }
      return safeEditReply(interaction, { content: `🔓 Usuario ${userId} desbaneado.` });
    }

    // ---------- MUTE ----------
    if (cmd === 'mute') {
      const target = interaction.options.getUser('usuario');
      if (!target) return safeEditReply(interaction, { content: '❌ Usuario no encontrado.' });
      const dur = interaction.options.getString('duracion');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const guild = interaction.guild;
      if (!guild) return safeEditReply(interaction, { content: 'Solo en servidores.' });

      let mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
      try { if (!mutedRole) mutedRole = await guild.roles.create({ name: 'Muted', permissions: [] }); } catch (e) { console.warn('No se pudo crear rol Muted:', e?.message || e); }

      try {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (member && mutedRole) await member.roles.add(mutedRole).catch(() => {});
        else return safeEditReply(interaction, { content: '❌ Usuario no está en el server.' });
      } catch (e) { return safeEditReply(interaction, { content: '❌ No puedo dar rol Muted.' }); }

      const embedMute = makeModEmbed({ title: '🔇 Silenciado', userTag: `${target.tag} (<@${target.id}>)`, moderatorTag: interaction.user.tag, reason, duration: dur });
      const chMute = await client.channels.fetch(CONFIG.CHANNELS.MUTES).catch(() => null);
      if (chMute) await chMute.send({ embeds: [embedMute] }).catch(() => {});

      if (dur) {
        const ms = parseTimeToMs(dur);
        if (ms) {
          setTimeout(async () => {
            try {
              const m = await guild.members.fetch(target.id).catch(() => null);
              if (m && mutedRole) await m.roles.remove(mutedRole).catch(() => {});
              const chEnd = await client.channels.fetch(CONFIG.CHANNELS.MUTE_END).catch(() => null);
              if (chEnd) await chEnd.send({ embeds: [makeModEmbed({ title: '🔊 Fin Mute', userTag: target.tag, moderatorTag: 'Sistema', reason: 'Tiempo' })] }).catch(() => {});
            } catch (e) { console.error('Error quitando mute automatico:', e); }
          }, ms);
        }
      }
      return safeEditReply(interaction, { content: `🔇 **${target.tag}** silenciado.` });
    }

    // ---------- UNMUTE ----------
    if (cmd === 'unmute') {
      const target = interaction.options.getUser('usuario');
      if (!target) return safeEditReply(interaction, { content: '❌ Usuario no encontrado.' });
      const guild = interaction.guild;
      if (!guild) return safeEditReply(interaction, { content: 'Solo en servidores.' });

      const mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
      try {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (member && mutedRole) await member.roles.remove(mutedRole).catch(() => {});
      } catch (e) { return safeEditReply(interaction, { content: '❌ Error quitando rol.' }); }

      const chEnd = await client.channels.fetch(CONFIG.CHANNELS.MUTE_END).catch(() => null);
      if (chEnd) await chEnd.send({ embeds: [makeModEmbed({ title: '🔊 Desilenciado', userTag: target.tag, moderatorTag: interaction.user.tag, reason: 'Manual' })] }).catch(() => {});

      return safeEditReply(interaction, { content: `🔊 **${target.tag}** desilenciado.` });
    }

  } catch (e) {
    console.error('Error FATAL ejecutando comando:', e);
    await safeEditReply(interaction, { content: '❌ Error crítico en el bot.' });
  }
});

/* ───────── MENSAJES AUTO ───────── */
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  
  // 🔒 SEGURIDAD: Solo responder si es un servidor autorizado
  if (!ALLOWED_SERVERS.includes(message.guild.id)) return;

  const content = message.content.toLowerCase();

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
    return message.channel.send({ content: `\`\`\`text\n${ipMsg}\n\`\`\`` }).catch(() => {});
  }

  if (content.includes('!tienda') || content.includes('tienda')) {
    const shopMsg = `
╔═════════════════════════════════════╗
   - _ .  TIENDA OFICIAL  . _ -
╚═════════════════════════════════════╝
 ;  APOYA AL SERVIDOR EN:             ;
 ;  --------------------------------- ;
 ;  .. https://tienda.tuservidor.com  ;
 ;  --------------------------------- ;
 ;  _ Rangos, Llaves y Beneficios _   ;
.......................................
`;
    return message.channel.send({ content: `\`\`\`text\n${shopMsg}\n\`\`\`` }).catch(() => {});
  }
});

/* ───────── BIENVENIDAS ───────── */
client.on('guildMemberAdd', async (member) => {
  // 🔒 SEGURIDAD: Solo si es servidor autorizado
  if (!ALLOWED_SERVERS.includes(member.guild.id)) return;

  const ch = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(() => null);
  if (ch) await ch.send({ embeds: [makeWelcomeEmbed(member)] }).catch(() => {});
});

client.on('guildMemberRemove', async (member) => {
  // 🔒 SEGURIDAD: Solo si es servidor autorizado
  if (!ALLOWED_SERVERS.includes(member.guild.id)) return;

  const ch = await client.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(() => null);
  if (ch) await ch.send({ embeds: [makeLeaveEmbed(member)] }).catch(() => {});
});

/* ───────── LOGIN ───────── */
if (!CONFIG.TOKEN) {
  console.error('❌ TOKEN no definido en .env');
  process.exit(1);
}
client.login(CONFIG.TOKEN)
  .then(() => console.log('✅ Bot Listo'))
  .catch((e) => { console.error('Error login:', e); process.exit(1); });

/* ───────── ERROR HANDLERS ───────── */
process.on('unhandledRejection', (r) => console.error('Rejection:', r));
process.on('uncaughtException', (e) => console.error('Exception:', e));
