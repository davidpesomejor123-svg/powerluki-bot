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

/* ───────── CONFIGURACIÓN DE SEGURIDAD ───────── */
const ALLOWED_SERVERS = [
  '1340442398442127480', // Servidor Principal
  '1458243569075884219'  // Segundo Servidor Autorizado
];

const CONFIG = {
  TOKEN: process.env.TOKEN,
  MAIN_GUILD_ID: '1458243569075884219',
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
  SERVER_IP: 'play.tuservidor.com',
  SERVER_PORT: '24818'
};

/* ───────── CLIENTE ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

/* ───────── SERVER WEB (UPTIME) ───────── */
const app = express();
app.get('/', (_, res) => res.send(`🤖 Bot Power Luki: ONLINE ✅`));
app.listen(process.env.PORT || 10000);

/* ───────── FUNCIONES AUXILIARES ───────── */
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
  return new Date(dateOrMs).toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa' });
}

async function safeEditReply(interaction, data = {}) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(data);
    } else {
      return await interaction.reply(data);
    }
  } catch (e) { console.error('⚠️ Error al responder:', e.message); }
}

/* ───────── CONSTRUCTORES DE EMBEDS ───────── */
function makeModEmbed({ title, userTag, moderatorTag, reason, duration, endsAt }) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(duration ? 'Orange' : (title.toLowerCase().includes('des') ? 'Green' : 'Red'))
    .addFields(
      { name: '👤 Usuario', value: userTag ?? '—', inline: true },
      { name: '🛡️ Moderador', value: moderatorTag ?? '—', inline: true },
      { name: '📄 Razón', value: reason ?? 'No especificada', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Sistema de Seguridad Power Lucky' });

  if (duration) embed.addFields({ name: '⏳ Duración', value: duration, inline: true });
  if (endsAt) embed.addFields({ name: '⏰ Termina el', value: formatDateTime(endsAt), inline: false });
  return embed;
}

function makeWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
    .setDescription(`-_- - POWER LUKI NETWORK -_- \n\n💎 **${member.user.username}** ha llegado.\n🎇 ¡Disfruta tu estadía!`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor('Aqua')
    .setTimestamp();
}

function makeLeaveEmbed(member) {
  return new EmbedBuilder()
    .setTitle(`😔 ¡Hasta pronto, ${member.user.username}! 😔`)
    .setDescription(`💔 **${member.user.username}** nos deja temporalmente.\n🌟 Esperamos volver a verte pronto.`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor('DarkBlue')
    .setTimestamp();
}

/* ───────── REGISTRO DE COMANDOS (CORREGIDO) ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Power Luki Network', { type: ActivityType.Playing });

  const commands = [
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio oficial')
      .addStringOption(o => o.setName('mensaje').setDescription('Escribe el contenido del anuncio').setRequired(true)),
    
    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar mensaje al canal de novedades')
      .addStringOption(o => o.setName('mensaje').setDescription('Escribe la novedad').setRequired(true)),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear a un usuario permanentemente')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Motivo del baneo').setRequired(false)),

    new SlashCommandBuilder()
      .setName('temban')
      .setDescription('Banear a un usuario temporalmente')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('tiempo').setDescription('Tiempo (ej: 1h, 1d)').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Motivo').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Desbanear a un usuario por su ID')
      .addStringOption(o => o.setName('userid').setDescription('ID del usuario').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Motivo del desbaneo').setRequired(false)),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Tiempo del silencio').setRequired(false))
      .addStringOption(o => o.setName('razon').setDescription('Motivo').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Quitar el silencio a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a desilenciar').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Comandos registrados correctamente.');
  } catch (err) { console.error('❌ Error registrando comandos:', err); }
});

/* ───────── MANEJADOR DE INTERACCIONES ───────── */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!ALLOWED_SERVERS.includes(interaction.guildId)) {
    return interaction.reply({ content: '⛔ Este bot es privado de Power Luki Network.', ephemeral: true });
  }

  const { commandName, options, guild, user } = interaction;
  const msgInput = options.getString('mensaje');

  await interaction.deferReply({ flags: 64 }).catch(() => {});

  try {
    if (commandName === 'anuncio' || commandName === 'nuevo') {
      if (!msgInput || msgInput.trim().length === 0) {
        return safeEditReply(interaction, { content: '❌ Error: El mensaje llegó vacío.' });
      }
      const channelId = commandName === 'anuncio' ? CONFIG.CHANNELS.ANUNCIOS : CONFIG.CHANNELS.NUEVO;
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch) return safeEditReply(interaction, { content: '❌ Canal no encontrado.' });

      await ch.send({ content: `@everyone\n\`\`\`text\n${msgInput}\n\`\`\`` });
      return safeEditReply(interaction, { content: '✅ Enviado correctamente.' });
    }

    if (commandName === 'ban') {
      const target = options.getUser('usuario');
      const reason = options.getString('razon') || 'No especificada';
      await guild.members.ban(target.id, { reason }).catch(() => null);
      const log = await client.channels.fetch(CONFIG.CHANNELS.BANS).catch(() => null);
      if (log) log.send({ embeds: [makeModEmbed({ title: '🚫 Sanción Aplicada', userTag: target.tag, moderatorTag: user.tag, reason })] });
      return safeEditReply(interaction, { content: `🔨 **${target.tag}** baneado.` });
    }

    if (commandName === 'temban') {
      const target = options.getUser('usuario');
      const timeStr = options.getString('tiempo');
      const reason = options.getString('razon') || 'No especificada';
      const ms = parseTimeToMs(timeStr);
      if (!ms) return safeEditReply(interaction, { content: '❌ Tiempo inválido.' });

      await guild.members.ban(target.id, { reason }).catch(() => null);
      const log = await client.channels.fetch(CONFIG.CHANNELS.TEMPBANS).catch(() => null);
      if (log) log.send({ embeds: [makeModEmbed({ title: '⏱️ Ban Temporal', userTag: target.tag, moderatorTag: user.tag, reason, duration: timeStr, endsAt: Date.now() + ms })] });

      setTimeout(() => { guild.members.unban(target.id).catch(() => null); }, ms);
      return safeEditReply(interaction, { content: `⏱️ **${target.tag}** baneado por ${timeStr}.` });
    }

    if (commandName === 'unban') {
      const userId = options.getString('userid');
      await guild.members.unban(userId).catch(() => null);
      return safeEditReply(interaction, { content: `🔓 Usuario ID **${userId}** desbaneado.` });
    }

    if (commandName === 'mute') {
      const target = options.getUser('usuario');
      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) return safeEditReply(interaction, { content: '❌ No está en el servidor.' });
      let role = guild.roles.cache.find(r => r.name === 'Muted');
      if (!role) role = await guild.roles.create({ name: 'Muted' });
      await member.roles.add(role);
      return safeEditReply(interaction, { content: `🔇 **${target.tag}** silenciado.` });
    }

    if (commandName === 'unmute') {
      const target = options.getUser('usuario');
      const member = await guild.members.fetch(target.id).catch(() => null);
      const role = guild.roles.cache.find(r => r.name === 'Muted');
      if (member && role) await member.roles.remove(role);
      return safeEditReply(interaction, { content: `🔊 **${target.tag}** desilenciado.` });
    }

  } catch (e) {
    console.error(e);
    return safeEditReply(interaction, { content: '❌ Error interno.' });
  }
});

/* ───────── EVENTOS ADICIONALES ───────── */
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot || !ALLOWED_SERVERS.includes(message.guild.id)) return;
  if (message.content.toLowerCase() === '!ip') {
    message.channel.send(`\`\`\`text\n🌐 IP: ${CONFIG.SERVER_IP}\n\`\`\``);
  }
});

client.on('guildMemberAdd', async (m) => {
  if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
  const ch = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(() => null);
  if (ch) ch.send({ embeds: [makeWelcomeEmbed(m)] });
});

client.on('guildMemberRemove', async (m) => {
  if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
  const ch = await client.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(() => null);
  if (ch) ch.send({ embeds: [makeLeaveEmbed(m)] });
});

client.login(CONFIG.TOKEN);
