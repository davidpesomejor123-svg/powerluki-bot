import 'dotenv/config';
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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

/* ───────── CLIENTE ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── CONFIGURACIÓN ───────── */
const PREFIJO = '!';

const ROLES_TICKETS = ['Owner', 'Co-Owner', 'Admin', 'Manager', 'Mod', 'Staff'];
const ROLES_ANUNCIOS = ['Owner', 'Co-Owner', 'Admin', 'Manager'];

const TICKET_CHANNEL_NAME = '『📖』tickets';
const CANAL_SILENCIADOS = '『🔇』silenciados';
const CANAL_DESILENCIADOS = '『🔉』desilenciados';
const CANAL_BIENVENIDOS = '『👋』bienvenidos';
const CANAL_DESPEDIDAS = '『😔』despedidas';

const PANEL_TICKET_IMAGEN = 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png';
const TICKET_INTERIOR_IMAGEN = 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg';
const BIENVENIDA_IMAGEN = 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png';
const DESPEDIDA_IMAGEN = 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png';

/* ───────── TICKETS AUTOCIERRE ───────── */
const AUTO_CLOSE_TIME = 3 * 24 * 60 * 60 * 1000;
const ticketActivity = new Map();

/* ───────── ANTI SPAM ───────── */
const SPAM_LIMIT = 5;
const SPAM_TIME = 7000;
const TIMEOUT_MIN = 10;
const spamMap = new Map();

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);

  const canal = client.channels.cache.find(c => c.name === TICKET_CHANNEL_NAME);
  if (!canal) return;

  const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
  if (msgs && msgs.some(m => m.author.id === client.user.id)) return;

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setDescription(
      `⚙️ **Soporte:** Ayuda general\n` +
      `⚠️ **Reportes:** Bugs o errores\n` +
      `‼️ **Otros:** Consultas varias\n` +
      `🛒 **Compras:** Tienda y servicios\n\n` +
      `💠 *No abras tickets innecesarios*`
    )
    .setImage(PANEL_TICKET_IMAGEN);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crear_ticket_soporte').setLabel('Soporte').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('crear_ticket_reportes').setLabel('Reportes').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crear_ticket_otros').setLabel('Otros').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('crear_ticket_compras').setLabel('Compras').setStyle(ButtonStyle.Success)
  );

  await canal.send({ embeds: [embed], components: [row1, row2] });
});

/* ───────── BIENVENIDAS ───────── */
client.on('guildMemberAdd', member => {
  const canal = member.guild.channels.cache.find(c => c.name === CANAL_BIENVENIDOS);
  if (!canal) return;

  const embed = new EmbedBuilder()
    .setColor('#00ffff')
    .setDescription(
      `✨ ¡Bienvenido, **${member.user.username}**.! ✨\n` +
      `-_- - **POWER LUKI NETWORK** -_- \n\n` +
      `💎 **${member.user.username}** ha llegado a nuestra comunidad.\n` +
      `🎇 ¡Disfruta tu estadía!`
    )
    .setImage(BIENVENIDA_IMAGEN)
    .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' });

  canal.send({ embeds: [embed] });
});

/* ───────── DESPEDIDAS ───────── */
client.on('guildMemberRemove', member => {
  const canal = member.guild.channels.cache.find(c => c.name === CANAL_DESPEDIDAS);
  if (!canal) return;

  const ahora = new Date();
  const embed = new EmbedBuilder()
    .setColor('#ff5555')
    .setDescription(
      `😔 ¡Hasta pronto, **${member.user.username}**! 😔\n` +
      `- - - • **POWER LUKI NETWORK** • - - -\n\n` +
      `╭━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
      `💔 **${member.user.username}** nos deja temporalmente.\n` +
      `🌟 Esperamos volver a verte pronto en Power Luki Network.\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
      `📌 Recuerda que siempre eres parte de nuestra comunidad.\n` +
      `- - - • *Siempre Bienvenido* • - - -`
    )
    .setImage(DESPEDIDA_IMAGEN)
    .setFooter({
      text: `Power Luki Network • Nos vemos pronto • ${ahora.toLocaleString()}`
    });

  canal.send({ embeds: [embed] });
});

/* ───────── ANTI SPAM + SILENCIO ───────── */
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;

  /* Anti-spam */
  const now = Date.now();
  const data = spamMap.get(msg.author.id) || { count: 0, last: now };
  data.count = now - data.last > SPAM_TIME ? 1 : data.count + 1;
  data.last = now;
  spamMap.set(msg.author.id, data);

  if (data.count >= SPAM_LIMIT) {
    const member = await msg.guild.members.fetch(msg.author.id);
    if (!member.communicationDisabledUntilTimestamp) {
      const dur = TIMEOUT_MIN * 60 * 1000;
      const inicio = new Date();
      const fin = new Date(inicio.getTime() + dur);

      await member.timeout(dur, 'Spam automático');

      const canal = msg.guild.channels.cache.find(c => c.name === CANAL_SILENCIADOS);
      if (canal) {
        canal.send(
          `🔇 **Usuario:** ${member}\n` +
          `👮 **Silenciado por:** BOT\n` +
          `📄 **Motivo:** Spam\n` +
          `⏱️ **Duración:** ${TIMEOUT_MIN} minutos\n` +
          `🕒 **Inicio:** ${inicio.toLocaleTimeString()}\n` +
          `🕓 **Fin:** ${fin.toLocaleTimeString()}`
        );
      }
    }
    spamMap.delete(msg.author.id);
  }
});

/* ───────── DESILENCIADO ───────── */
client.on('guildMemberUpdate', (oldM, newM) => {
  if (oldM.communicationDisabledUntilTimestamp && !newM.communicationDisabledUntilTimestamp) {
    const canal = newM.guild.channels.cache.find(c => c.name === CANAL_DESILENCIADOS);
    if (canal) canal.send(`🔊 El usuario ${newM.user} ha sido desilenciado.`);
  }
});

/* ───────── WEB SERVER ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Luki Bot Online ✅'));
app.listen(process.env.PORT || 10000, () => client.login(process.env.TOKEN));
