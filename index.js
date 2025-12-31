import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

/* ───────── LEVELS ───────── */
let levels = { users: {} };
if (fs.existsSync('./levels.json')) {
  levels = JSON.parse(fs.readFileSync('./levels.json', 'utf8'));
}
const saveLevels = () => fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
setInterval(saveLevels, 30000);

/* ───────── INVITES ───────── */
let invites = {};
if (fs.existsSync('./invites.json')) {
  invites = JSON.parse(fs.readFileSync('./invites.json', 'utf8'));
}
const saveInvites = () => fs.writeFileSync('./invites.json', JSON.stringify(invites, null, 2));
const guildInvites = new Map();

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log('✅ Power Luki Network Bot ONLINE');
  for (const guild of client.guilds.cache.values()) {
    const invs = await guild.invites.fetch();
    guildInvites.set(guild.id, new Map(invs.map(i => [i.code, i.uses])));
  }
});

/* ───────── ANTI-SPAM + LEVELS ───────── */
const cooldown = new Map();
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (msg.member?.communicationDisabledUntilTimestamp) return;

  const now = Date.now();
  const data = cooldown.get(msg.author.id) || { count: 0, last: now };
  if (now - data.last < 5000) data.count++;
  else data.count = 1;
  data.last = now;
  cooldown.set(msg.author.id, data);

  if (data.count > 5 && !msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    await msg.member.timeout(5 * 60 * 1000, 'Spam detectado');
    const logMute = msg.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
    if (logMute) logMute.send(`🛡️ ${msg.author} silenciado **5 minutos** por spam.`);
    return;
  }

  // Sistema de niveles
  const id = msg.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };
  const user = levels.users[id];
  user.xp += Math.floor(Math.random() * 10) + 15;
  const need = user.level * 150;
  if (user.xp >= need) {
    user.level++;
    user.xp -= need;
    const ch = msg.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (ch) {
      ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🌟 NUEVO NIVEL')
            .setDescription(`${msg.author} alcanzó **Nivel ${user.level}**`)
            .setThumbnail(msg.author.displayAvatarURL({ dynamic: true }))
        ]
      });
    }
  }
});

/* ───────── BIENVENIDA + INVITES ───────── */
client.on('guildMemberAdd', async member => {
  const channel = member.guild.channels.cache.find(c => c.name === '『👋』bienvenidos');
  if (!channel) return;

  const newInvites = await member.guild.invites.fetch();
  const oldInvites = guildInvites.get(member.guild.id);

  let inviterTag = 'Desconocido';
  let totalInv = 0;
  for (const inv of newInvites.values()) {
    const prev = oldInvites?.get(inv.code) || 0;
    if (inv.uses > prev) {
      inviterTag = inv.inviter?.tag || 'Desconocido';
      invites[inv.inviter.id] = (invites[inv.inviter.id] || 0) + 1;
      totalInv = invites[inv.inviter.id];
      break;
    }
  }

  guildInvites.set(member.guild.id, new Map(newInvites.map(i => [i.code, i.uses])));
  saveInvites();

  const embed = new EmbedBuilder()
    .setColor('#00E5FF')
    .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
    .setDescription(
      `-_- - **POWER LUKI NETWORK** -_- \n\n` +
      `💎 ${member} ha llegado a nuestra comunidad.\n` +
      `🎇 ¡Disfruta tu estadía!\n\n` +
      `🔗 Invitado por: **${inviterTag}**\n` +
      `📊 Invitaciones totales: **${totalInv}**`
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setImage('https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg')
    .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' })
    .setTimestamp();

  channel.send({ embeds: [embed] });
});

/* ───────── DESPEDIDA ───────── */
client.on('guildMemberRemove', member => {
  const channel = member.guild.channels.cache.find(c => c.name === '『😔』despedidas');
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor('#FF4D4D')
    .setTitle(`😔 ¡Hasta pronto, ${member.user.username}! 😔`)
    .setDescription(
      `- - - • **POWER LUKI NETWORK** • - - -\n\n` +
      `💔 El usuario nos deja temporalmente.\n` +
      `🌟 Esperamos volver a verte pronto en Power Luki Network.\n\n` +
      `📌 Recuerda que siempre eres parte de nuestra comunidad.\n` +
      `- - - • Siempre Bienvenido • - - -`
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: 'Power Luki Network • Nos vemos pronto' })
    .setTimestamp();

  channel.send({ embeds: [embed] });
});

/* ───────── SILENCIADOS / DESILENCIADOS ───────── */
client.on('guildMemberUpdate', (oldM, newM) => {
  const wasMuted = oldM.communicationDisabledUntilTimestamp;
  const isMuted = newM.communicationDisabledUntilTimestamp;

  if (!wasMuted && isMuted) {
    const ch = newM.guild.channels.cache.find(c => c.name === '『🔇』silenciados');
    if (!ch) return;
    ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('🔇 Usuario Silenciado')
          .setDescription(`👤 Usuario: ${newM}\n⏳ Hasta: <t:${Math.floor(isMuted / 1000)}:F>`)
          .setThumbnail(newM.user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: 'Power Luki Network Moderación' })
          .setTimestamp()
      ]
    });
  }

  if (wasMuted && !isMuted) {
    const ch = newM.guild.channels.cache.find(c => c.name === '『🔉』desilenciados');
    if (!ch) return;
    ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#00FF7F')
          .setTitle('🔉 Usuario Desilenciado')
          .setDescription(`👤 Usuario: ${newM}`)
          .setThumbnail(newM.user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: 'Power Luki Network Moderación' })
          .setTimestamp()
      ]
    });
  }
});

/* ───────── SLASH COMMANDS ───────── */
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silenciar usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o => o.setName('tiempo').setDescription('Ej: 5m / 10s').setRequired(true))
    .addStringOption(o => o.setName('razon').setDescription('Razón')),

  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Enviar anuncio oficial')
    .addStringOption(o => o.setName('mensaje').setDescription('Mensaje').setRequired(true)),

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Enviar panel de tickets')
].map(c => c.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Comandos slash cargados');
  } catch (err) {
    console.error(err);
  }
})();

/* ───────── INTERACTIONS (SLASH + TICKETS) ───────── */
client.on('interactionCreate', async i => {
  // Aquí va todo tu código de mute, anuncio, panel y tickets
  // (igual que ya lo tenías, revisado)
});

/* ───────── WEB SERVER ───────── */
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (_, res) => res.send('Power Luki Network Bot Online ✅'));

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Servidor web activo en puerto ${PORT}`));

/* ───────── LOGIN ───────── */
client.login(process.env.TOKEN)
  .then(() => console.log('✅ Bot conectado a Discord'))
  .catch(err => console.error('❌ Error al conectar el bot:', err));


