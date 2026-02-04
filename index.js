// index.js — Power Luki Network Bot COMPLETO (final)
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
const CONFIG = {
  TOKEN: process.env.TOKEN,
  MAIN_GUILD_ID: '1458243569075884219', // Servidor principal
  COMMAND_GUILD_ID: '1340442398442127480', // Servidor donde se ejecuta el comando (opcional)
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

/* ───────── EXPRESS (status) ───────── */
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
async function safeEditReply(interaction, data) {
  try { return await interaction.editReply(data); }
  catch (e) {
    try { return await interaction.followUp({ ...data, flags: 64 }); }
    catch (e2) { console.error('No se pudo responder a la interacción:', e2); }
  }
}

/* ───────── EMBED BUILDERS (logs / welcome / leave) ───────── */
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

/* ───────── READY + REGISTER SLASH COMMANDS ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
  try { await client.user.setActivity('Power Luki Network', { type: ActivityType.Playing }); } catch (e) { console.warn(e); }

  const commands = [
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio al canal ANUNCIOS')
      .addStringOption(o => o.setName('mensaje').setDescription('Contenido del anuncio').setRequired(true)),

    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar mensaje al canal NUEVO')
      .addStringOption(o => o.setName('mensaje').setDescription('Contenido del mensaje').setRequired(true)),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón del baneo').setRequired(false)),

    new SlashCommandBuilder()
      .setName('temban')
      .setDescription('Ban temporal (ej: 10s, 5m, 1h, 1d)')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear temporalmente').setRequired(true))
      .addStringOption(o => o.setName('tiempo').setDescription('Tiempo (ej: 10s, 5m, 1h)').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón del baneo').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Desbanear usuario (por ID o mencion)')
      .addStringOption(o => o.setName('userid').setDescription('ID del usuario a desbanear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar usuario (ej: 10s, 5m, 1h)')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración (ej: 10s, 5m, 1h)').setRequired(false))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Quitar silenciado a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a desilenciar').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  try {
    // Registramos globalmente. Cambia a applicationGuildCommands si quieres solo en COMMAND_GUILD_ID.
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registrados.');
  } catch (err) {
    console.error('❌ Error registrando slash commands:', err);
  }
});

/* ───────── INTERACTION HANDLER ───────── */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Defer to avoid Unknown interaction on slow ops
  try { await interaction.deferReply({ flags: 64 }); } catch (e) {}

  const cmd = interaction.commandName;

  try {
    // ---------- ANUNCIO ----------
    if (cmd === 'anuncio') {
      const msg = interaction.options.getString('mensaje');
      const ch = await client.channels.fetch(CONFIG.CHANNELS.ANUNCIOS).catch(() => null);
      if (!ch) return safeEditReply(interaction, { content: 'Canal de anuncios no encontrado.', flags: 64 });

      await ch.send({
        content: '@everyone',
        embeds: [ new EmbedBuilder().setTitle('📣 Anuncio').setDescription(msg).setColor('Yellow').setTimestamp() ]
      }).catch(() => {});

      return safeEditReply(interaction, { content: 'Anuncio enviado ✅', flags: 64 });
    }

    // ---------- NUEVO ----------
    if (cmd === 'nuevo') {
      const msg = interaction.options.getString('mensaje');
      const ch = await client.channels.fetch(CONFIG.CHANNELS.NUEVO).catch(() => null);
      if (!ch) return safeEditReply(interaction, { content: 'Canal NUEVO no encontrado.', flags: 64 });

      await ch.send({
        content: '@everyone',
        embeds: [ new EmbedBuilder().setTitle('🆕 Nuevo').setDescription(msg).setColor('Blue').setTimestamp() ]
      }).catch(() => {});

      return safeEditReply(interaction, { content: 'Mensaje NUEVO enviado ✅', flags: 64 });
    }

    // ---------- BAN ----------
    if (cmd === 'ban') {
      const target = interaction.options.getUser('usuario');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const guild = interaction.guild;
      try { if (guild) await guild.members.ban(target.id, { reason }); } catch {}
      const embed = makeModEmbed({ title: '🚫 Sanción Aplicada: Power Lucky', userTag: `${target.tag} (<@${target.id}>)`, moderatorTag: interaction.user.tag, reason });
      const ch = await client.channels.fetch(CONFIG.CHANNELS.BANS).catch(()=>null);
      if (ch) await ch.send({ embeds: [embed] }).catch(()=>{});
      return safeEditReply(interaction, { content: `🔨 ${target.tag} ha sido baneado.`, flags: 64 });
    }

    // ---------- TEMPBAN ----------
    if (cmd === 'temban') {
      const target = interaction.options.getUser('usuario');
      const timeStr = interaction.options.getString('tiempo');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const guild = interaction.guild;
      const ms = parseTimeToMs(timeStr);
      if (!ms) return safeEditReply(interaction, { content: 'Formato de tiempo inválido. Usa ejemplos: 10s, 5m, 1h, 1d', flags: 64 });

      try { if (guild) await guild.members.ban(target.id, { reason }); } catch {}
      const embed = makeModEmbed({ title: '⏱️ Ban Temporal', userTag: `${target.tag} (<@${target.id}>)`, moderatorTag: interaction.user.tag, reason, duration: timeStr, endsAt: Date.now() + ms });
      const chTemp = await client.channels.fetch(CONFIG.CHANNELS.TEMPBANS).catch(()=>null);
      if (chTemp) await chTemp.send({ embeds: [embed] }).catch(()=>{});

      // schedule unban
      setTimeout(async () => {
        try {
          const mainGuild = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID).catch(()=>null);
          if (mainGuild) await mainGuild.members.unban(target.id).catch(()=>{});
          const chUn = await client.channels.fetch(CONFIG.CHANNELS.UNBANS).catch(()=>null);
          if (chUn) {
            const embedUn = makeModEmbed({ title: '🔓 Desbaneado (fin de tempban)', userTag: `${target.tag} (<@${target.id}>)`, moderatorTag: 'Sistema (temban)', reason: `Fin de tempban (${timeStr})` });
            await chUn.send({ embeds: [embedUn] }).catch(()=>{});
          }
        } catch (e) { console.error('Error en unban programado:', e); }
      }, ms);

      return safeEditReply(interaction, { content: `⏱️ ${target.tag} baneado temporalmente por ${timeStr}.`, flags: 64 });
    }

    // ---------- UNBAN ----------
    if (cmd === 'unban') {
      const userId = interaction.options.getString('userid');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const mainGuild = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID).catch(()=>null);
      try {
        if (mainGuild) await mainGuild.members.unban(userId, reason).catch(e => { throw e; });
      } catch (e) {
        return safeEditReply(interaction, { content: `❌ No se pudo desbanear al usuario ${userId}.`, flags: 64 });
      }
      const chUn = await client.channels.fetch(CONFIG.CHANNELS.UNBANS).catch(()=>null);
      if (chUn) {
        const embedUn = makeModEmbed({ title: '🔓 Desbaneado', userTag: `${userId}`, moderatorTag: interaction.user.tag, reason });
        await chUn.send({ embeds: [embedUn] }).catch(()=>{});
      }
      return safeEditReply(interaction, { content: `🔓 Usuario ${userId} desbaneado.` , flags: 64});
    }

    // ---------- MUTE ----------
    if (cmd === 'mute') {
      const target = interaction.options.getUser('usuario');
      const dur = interaction.options.getString('duracion');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const guild = interaction.guild;
      if (!guild) return safeEditReply(interaction, { content: 'Este comando debe ejecutarse en un servidor.', flags: 64 });

      // ensure Muted role
      let mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
      try { if (!mutedRole) mutedRole = await guild.roles.create({ name: 'Muted', permissions: [] }); } catch (e) { console.error('No se pudo crear rol Muted:', e); }

      try { const member = await guild.members.fetch(target.id).catch(()=>null); if (member) await member.roles.add(mutedRole).catch(()=>{}); } catch (e) {}

      const embedMute = makeModEmbed({ title: '🔇 Usuario Silenciado', userTag: `${target.tag} (<@${target.id}>)`, moderatorTag: interaction.user.tag, reason, duration: dur });
      const chMute = await client.channels.fetch(CONFIG.CHANNELS.MUTES).catch(()=>null);
      if (chMute) await chMute.send({ embeds: [embedMute] }).catch(()=>{});

      if (dur) {
        const ms = parseTimeToMs(dur);
        if (!ms) return safeEditReply(interaction, { content: 'Formato de tiempo inválido. Usa ejemplos: 10s, 5m, 1h, 1d', flags: 64 });
        setTimeout(async () => {
          try {
            const guild2 = guild;
            const member2 = await guild2.members.fetch(target.id).catch(()=>null);
            if (member2 && mutedRole) await member2.roles.remove(mutedRole).catch(()=>{});
            const chEnd = await client.channels.fetch(CONFIG.CHANNELS.MUTE_END).catch(()=>null);
            if (chEnd) {
              const embedEnd = makeModEmbed({ title: '🔊 Usuario Desilenciado (fin de tiempo)', userTag: `${target.tag} (<@${target.id}>)`, moderatorTag: 'Sistema (fin de tiempo)', reason: `Fin de mute (${dur})` });
              await chEnd.send({ embeds: [embedEnd] }).catch(()=>{});
            }
          } catch (e) { console.error('Error al quitar mute programado:', e); }
        }, ms);
      }

      return safeEditReply(interaction, { content: `${target.tag} ha sido silenciado.`, flags: 64 });
    }

    // ---------- UNMUTE ----------
    if (cmd === 'unmute') {
      const target = interaction.options.getUser('usuario');
      const guild = interaction.guild;
      if (!guild) return safeEditReply(interaction, { content: 'Este comando debe ejecutarse en un servidor.', flags: 64 });
      const mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
      try {
        const member = await guild.members.fetch(target.id).catch(()=>null);
        if (member && mutedRole) await member.roles.remove(mutedRole).catch(()=>{});
      } catch (e) {}
      const chEnd2 = await client.channels.fetch(CONFIG.CHANNELS.MUTE_END).catch(()=>null);
      if (chEnd2) {
        const embed = makeModEmbed({ title: '🔊 Usuario Desilenciado', userTag: `${target.tag} (<@${target.id}>)`, moderatorTag: interaction.user.tag, reason: 'Desilenciado manual' });
        await chEnd2.send({ embeds: [embed] }).catch(()=>{});
      }
      return safeEditReply(interaction, { content: `${target.tag} ha sido desilenciado.`, flags: 64 });
    }

  } catch (e) {
    console.error('Error en interaction handler:', e);
    try { await safeEditReply(interaction, { content: '❌ Error ejecutando comando', flags: 64 }); } catch {}
  }
});

/* ───────── MENSAJES AUTOMÁTICOS (IP / TIENDA) ───────── */
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
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
    return message.channel.send({ content: `\`\`\`\n${ipMsg}\n\`\`\`` }).catch(()=>{});
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
    return message.channel.send({ content: `\`\`\`\n${shopMsg}\n\`\`\`` }).catch(()=>{});
  }
});

/* ───────── BIENVENIDAS Y DESPEDIDAS ───────── */
client.on('guildMemberAdd', async (member) => {
  const ch = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(()=>null);
  if (!ch) return;
  await ch.send({ embeds: [ makeWelcomeEmbed(member) ] }).catch(()=>{});
});

client.on('guildMemberRemove', async (member) => {
  const ch = await client.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(()=>null);
  if (!ch) return;
  await ch.send({ embeds: [ makeLeaveEmbed(member) ] }).catch(()=>{});
});

/* ───────── LOGIN ───────── */
if (!CONFIG.TOKEN) {
  console.error('❌ TOKEN no definido');
  process.exit(1);
}
client.login(CONFIG.TOKEN)
  .then(()=>console.log('✅ Bot logueado'))
  .catch((e)=>{ console.error('Error al loguear el bot:', e); process.exit(1); });

/* ───────── GLOBAL ERROR HANDLERS ───────── */
process.on('unhandledRejection', (r,p) => console.error('UnhandledRejection', r, p));
process.on('uncaughtException', err => console.error('UncaughtException', err));
