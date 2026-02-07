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

/* ───────── CONFIGURACIÓN ───────── */
const ALLOWED_SERVERS = [
  '1340442398442127480', 
  '1458243569075884219'
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
};

/* ───────── CLIENTE ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

/* ───────── SERVER WEB ───────── */
const app = express();
app.get('/', (_, res) => res.send('🤖 Power Lucky Bot: Online ✅'));
app.listen(process.env.PORT || 10000);

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
  return new Date(dateOrMs).toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa' });
}

async function safeEditReply(interaction, data = {}) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(data);
    } else {
      return await interaction.reply(data);
    }
  } catch (e) { console.error('Error interaction:', e.message); }
}

/* ───────── EMBEDS ───────── */
function makeModEmbed({ title, userTag, moderatorTag, reason, duration, endsAt }) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(duration ? 'Orange' : (title.includes('Des') ? 'Green' : 'Red'))
    .addFields(
      { name: '👤 Usuario', value: userTag ?? '—', inline: true },
      { name: '🛡️ Moderador', value: moderatorTag ?? '—', inline: true },
      { name: '📄 Razón', value: reason ?? 'No especificada', inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Seguridad Power Lucky' });
  if (duration) embed.addFields({ name: '⏳ Tiempo', value: duration, inline: true });
  if (endsAt) embed.addFields({ name: '⏰ Termina', value: formatDateTime(endsAt) });
  return embed;
}

function makeWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
    .setDescription(`-_- - POWER LUKI NETWORK -_- \n\n💎 **${member.user.username}** ha llegado.\n🎇 ¡Disfruta tu estadía!`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor('Aqua').setTimestamp();
}

function makeLeaveEmbed(member) {
  return new EmbedBuilder()
    .setTitle(`😔 ¡Hasta pronto! 😔`)
    .setDescription(`💔 **${member.user.username}** nos ha dejado.\n🌟 ¡Esperamos tu regreso!`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor('DarkBlue').setTimestamp();
}

/* ───────── COMANDOS ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot activo: ${client.user.tag}`);
  client.user.setActivity('Power Luki Network', { type: ActivityType.Playing });

  const commands = [
    new SlashCommandBuilder().setName('anuncio').setDescription('Enviar anuncio oficial').addStringOption(o => o.setName('mensaje').setDescription('Contenido').setRequired(true)),
    new SlashCommandBuilder().setName('nuevo').setDescription('Enviar novedad').addStringOption(o => o.setName('mensaje').setDescription('Contenido').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Banear').addUserOption(o => o.setName('usuario').setDescription('Objetivo').setRequired(true)).addStringOption(o => o.setName('razon').setDescription('Motivo')),
    new SlashCommandBuilder().setName('temban').setDescription('Ban temporal').addUserOption(o => o.setName('usuario').setDescription('Objetivo').setRequired(true)).addStringOption(o => o.setName('tiempo').setDescription('Tiempo').setRequired(true)).addStringOption(o => o.setName('razon').setDescription('Motivo')),
    new SlashCommandBuilder().setName('unban').setDescription('Desbanear').addStringOption(o => o.setName('userid').setDescription('ID').setRequired(true)).addStringOption(o => o.setName('razon').setDescription('Motivo')),
    new SlashCommandBuilder().setName('mute').setDescription('Silenciar').addUserOption(o => o.setName('usuario').setDescription('Objetivo').setRequired(true)).addStringOption(o => o.setName('duracion').setDescription('Tiempo')).addStringOption(o => o.setName('razon').setDescription('Motivo')),
    new SlashCommandBuilder().setName('unmute').setDescription('Quitar silencio').addUserOption(o => o.setName('usuario').setDescription('Objetivo').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('🚀 Comandos sincronizados.');
  } catch (err) { console.error(err); }
});

/* ───────── INTERACCIONES ───────── */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!ALLOWED_SERVERS.includes(interaction.guildId)) return;

  const { commandName, options, guild, user } = interaction;

  if (commandName === 'anuncio' || commandName === 'nuevo') {
    // FIX: Captura con fallback para evitar el "null"
    const msgInput = options.getString('mensaje') ?? '';
    
    await interaction.deferReply({ flags: 64 });

    if (!msgInput || msgInput.trim().length === 0) {
      return safeEditReply(interaction, { content: '❌ El mensaje no puede estar vacío.' });
    }

    const chId = commandName === 'anuncio' ? CONFIG.CHANNELS.ANUNCIOS : CONFIG.CHANNELS.NUEVO;
    const ch = await client.channels.fetch(chId).catch(() => null);
    
    if (ch) {
      await ch.send({ content: `@everyone\n\`\`\`text\n${msgInput}\n\`\`\`` });
      return safeEditReply(interaction, { content: '✅ Enviado correctamente.' });
    } else {
      return safeEditReply(interaction, { content: '❌ No encontré el canal.' });
    }
  }

  // Otros comandos de moderación
  if (commandName === 'ban') {
    const target = options.getUser('usuario');
    const reason = options.getString('razon') || 'No especificada';
    await guild.members.ban(target.id, { reason }).catch(() => null);
    const log = await client.channels.fetch(CONFIG.CHANNELS.BANS).catch(() => null);
    if (log) log.send({ embeds: [makeModEmbed({ title: '🚫 Baneado', userTag: target.tag, moderatorTag: user.tag, reason })] });
    return interaction.reply({ content: `🔨 **${target.tag}** baneado.`, flags: 64 });
  }

  if (commandName === 'mute') {
    const target = options.getUser('usuario');
    const member = await guild.members.fetch(target.id).catch(() => null);
    let role = guild.roles.cache.find(r => r.name === 'Muted');
    if (!role) role = await guild.roles.create({ name: 'Muted' });
    if (member) await member.roles.add(role);
    return interaction.reply({ content: `🔇 **${target.tag}** silenciado.`, flags: 64 });
  }

  if (commandName === 'unmute') {
    const target = options.getUser('usuario');
    const member = await guild.members.fetch(target.id).catch(() => null);
    const role = guild.roles.cache.find(r => r.name === 'Muted');
    if (member && role) await member.roles.remove(role);
    return interaction.reply({ content: `🔊 **${target.tag}** desilenciado.`, flags: 64 });
  }
});

/* ───────── IP / TIENDA (TEXTO) ───────── */
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot || !ALLOWED_SERVERS.includes(message.guild.id)) return;
  const content = message.content.toLowerCase().trim();

  if (content === 'ip' || content === '!ip') {
    const ipMsg = `. _ . ▬▬▬▬▬▬ [ CONEXIÓN ] ▬▬▬▬▬▬ . _ .\n;\n;   IP DEL SERVIDOR :\n;   >> ${CONFIG.SERVER_IP} <<\n;\n; ................................... ;\n;   ESTADO: ONLINE  ;  VER: 1.21.x\n. _ . ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ . _ .`;
    return message.channel.send({ content: `\`\`\`text\n${ipMsg}\n\`\`\`` });
  }

  if (content === 'tienda' || content === '!tienda') {
    const shopMsg = `╔═════════════════════════════════════╗\n    - _ .  TIENDA OFICIAL  . _ -\n╚═════════════════════════════════════╝\n ;  APOYA AL SERVIDOR EN:\n ;  --------------------------------- ;\n ;  .. https://tienda.tuservidor.com\n ;  --------------------------------- ;\n ;  _ Rangos, Llaves y Beneficios _\n.......................................`;
    return message.channel.send({ content: `\`\`\`text\n${shopMsg}\n\`\`\`` });
  }
});

/* ───────── BIENVENIDAS ───────── */
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
