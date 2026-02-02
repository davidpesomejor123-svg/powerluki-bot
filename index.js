// index.js — Power Luki Network Bot COMPLETO (sin tickets ni XP)
import 'dotenv/config';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  ChannelType,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';

/* ───────── CONFIGURACIÓN ───────── */
const CONFIG = {
  PREFIJO: '!',
  SERVER_IP: 'powermax.hidenmc.com',
  SERVER_PORT: '24818',
  MAIN_GUILD_ID: process.env.GUILD_ID,
  STAFF_ROLE_ID: '1458243569075884219',
  CANALES: {
    ANUNCIOS: '📣anuncios',
    SILENCIADOS: '🔇silenciados',
    DESILENCIADOS: '🔉desilenciados',
    BANEOS: '🔨baneos',
    BIENVENIDAS: '👋bienvenidos',
    DESPEDIDAS: '😔despedidas'
  },
  EMOJIS: { TIENDA: '🛒', IP: '🌐' },
  RAID_PROTECT: { WINDOW_MS: 30_000, JOIN_LIMIT: 5 }
};

/* ───────── EXPRESS SERVER ───────── */
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (_, res) => res.send(`🤖 Bot Power Luki: ${client?.ws?.status === 0 ? 'ONLINE' : 'CONECTANDO...'}`));
app.listen(PORT, () => console.log(`🌐 Web server escuchando en ${PORT}`));

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

/* ───────── ANTI-RAID SIMPLE ───────── */
const recentJoins = [];
function registerJoinAndCheck() {
  const now = Date.now();
  recentJoins.push(now);
  while (recentJoins.length && now - recentJoins[0] > CONFIG.RAID_PROTECT.WINDOW_MS) recentJoins.shift();
  return recentJoins.length >= CONFIG.RAID_PROTECT.JOIN_LIMIT;
}

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Power Luki Network', { type: 4 });

  /* ─── Slash commands ─── */
  const commands = [
    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar un usuario')
      .addUserOption(o => o.setName('usuario').setRequired(true))
      .addStringOption(o => o.setName('duracion')),
    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Des-silenciar un usuario')
      .addUserOption(o => o.setName('usuario').setRequired(true)),
    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear usuario')
      .addUserOption(o => o.setName('usuario').setRequired(true))
      .addStringOption(o => o.setName('razon')),
    new SlashCommandBuilder()
      .setName('temban')
      .setDescription('Ban temporal')
      .addUserOption(o => o.setName('usuario').setRequired(true))
      .addStringOption(o => o.setName('tiempo').setRequired(true))
      .addStringOption(o => o.setName('razon')),
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Advertir a un usuario')
      .addUserOption(o => o.setName('usuario').setRequired(true))
      .addStringOption(o => o.setName('razon').setRequired(true)),
    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar mensaje al canal NUEVO')
      .addStringOption(o => o.setName('mensaje').setRequired(true)),
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio al canal ANUNCIOS')
      .addStringOption(o => o.setName('mensaje').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands }).catch(console.error);
  console.log('✅ Slash commands registrados.');
});

/* ───────── UTILIDADES ───────── */
function findChannelByName(guild, name) { return guild?.channels.cache.find(c => c.name === name); }
function parseTimeToMs(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d+)([mhd])?$/); if (!m) return null;
  const amount = Number(m[1]); const unit = m[2] || 'm';
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return null;
}

/* ───────── INTERACTIONS ───────── */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const guild = interaction.guild;
  const member = interaction.member;

  try {
    if (commandName === 'mute') {
      const target = interaction.options.getUser('usuario');
      const duration = interaction.options.getString('duracion');
      const mutedRole = guild.roles.cache.find(r => r.name === 'Muted') || await guild.roles.create({ name: 'Muted', permissions: [] });
      const gMember = await guild.members.fetch(target.id);
      await gMember.roles.add(mutedRole);
      await interaction.reply({ content: `🔇 ${target.tag} ha sido silenciado${duration ? ` por ${duration}` : ''}.` });
    }

    if (commandName === 'unmute') {
      const target = interaction.options.getUser('usuario');
      const mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
      if (!mutedRole) return interaction.reply({ content: 'No hay rol Muted creado.' });
      const gMember = await guild.members.fetch(target.id);
      await gMember.roles.remove(mutedRole);
      await interaction.reply({ content: `🔊 ${target.tag} ha sido des-silenciado.` });
    }

    if (commandName === 'ban') {
      const target = interaction.options.getUser('usuario');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const gMember = await guild.members.fetch(target.id);
      await gMember.ban({ reason });
      await interaction.reply({ content: `🔨 ${target.tag} ha sido baneado.\nRazón: ${reason}` });
    }

    if (commandName === 'temban') {
      const target = interaction.options.getUser('usuario');
      const timeStr = interaction.options.getString('tiempo');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const gMember = await guild.members.fetch(target.id);
      await gMember.ban({ reason });
      await interaction.reply({ content: `⏱️ ${target.tag} baneado temporalmente por ${timeStr}.\nRazón: ${reason}` });
      const ms = parseTimeToMs(timeStr);
      if (ms) setTimeout(async () => { try { await guild.members.unban(target.id); } catch {} }, ms);
    }

    if (commandName === 'warn') {
      const target = interaction.options.getUser('usuario');
      const reason = interaction.options.getString('razon');
      await interaction.reply({ content: `⚠️ ${target.tag} ha sido advertido.\nRazón: ${reason}` });
    }

    if (commandName === 'anuncio') {
      const msg = interaction.options.getString('mensaje');
      const ch = findChannelByName(guild, CONFIG.CANALES.ANUNCIOS);
      if (!ch) return interaction.reply({ content: 'Canal de anuncios no encontrado.' });
      const embed = new EmbedBuilder().setTitle('📣 Anuncio').setDescription(msg).setColor('Yellow');
      await ch.send({ embeds: [embed] });
      await interaction.reply({ content: 'Anuncio enviado ✅', ephemeral: true });
    }

    if (commandName === 'nuevo') {
      const msg = interaction.options.getString('mensaje');
      const ch = findChannelByName(guild, CONFIG.CANALES.BIENVENIDAS);
      if (!ch) return interaction.reply({ content: 'Canal NUEVO no encontrado.' });
      await ch.send({ content: msg });
      await interaction.reply({ content: 'Mensaje enviado ✅', ephemeral: true });
    }
  } catch (e) { console.error(e); interaction.reply({ content: '❌ Error ejecutando comando', ephemeral: true }); }
});

/* ───────── MENSAJES AUTOMÁTICOS ───────── */
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const content = message.content.toLowerCase();

  // IP
  if (content === '!ip' || content === 'ip') {
    const ipEmbed = new EmbedBuilder()
      .setTitle(`${CONFIG.EMOJIS.IP} IP DEL SERVIDOR`)
      .setColor('#00FFFF')
      .setDescription(`**Java:** \`${CONFIG.SERVER_IP}\`\n**Bedrock:** \`${CONFIG.SERVER_IP}\`\n**Puerto:** \`${CONFIG.SERVER_PORT}\``);
    return message.channel.send({ embeds: [ipEmbed] }).catch(() => {});
  }

  // Tienda
  if (content.includes('!tienda') || content.includes('tienda')) {
    const shopEmbed = new EmbedBuilder()
      .setTitle(`${CONFIG.EMOJIS.TIENDA} TIENDA`)
      .setColor('#FFCC00')
      .setDescription(`Adquiere rangos aquí: https://tienda.powermax.com`);
    return message.channel.send({ embeds: [shopEmbed] }).catch(() => {});
  }
});

/* ───────── BIENVENIDAS Y DESPEDIDAS ───────── */
client.on('guildMemberAdd', async (member) => {
  if (registerJoinAndCheck()) {
    const logCh = findChannelByName(member.guild, CONFIG.CANALES.BANEOS);
    if (logCh) logCh.send({ content: `⚠️ Posible raid detectado: ${member.user.tag}` }).catch(() => {});
  }
  const ch = findChannelByName(member.guild, CONFIG.CANALES.BIENVENIDAS);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setTitle(`✨ ¡Bienvenido/a ${member.user.username}!`)
    .setDescription(`Bienvenido a **Power Luki Network**.`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor('Green');
  ch.send({ embeds: [embed] }).catch(() => {});
});

client.on('guildMemberRemove', async (member) => {
  const ch = findChannelByName(member.guild, CONFIG.CANALES.DESPEDIDAS);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setTitle(`😔 Hasta luego ${member.user.username}`)
    .setDescription(`Esperamos verte pronto de nuevo.`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor('Red');
  ch.send({ embeds: [embed] }).catch(() => {});
});

/* ───────── LOGIN ───────── */
client.login(process.env.TOKEN).then(() => console.log('✅ Token detectado y bot logueado')).catch(console.error);
