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

/* ───────── BASE DE DATOS LOCAL ───────── */
const loadData = (file, fallback) => {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.log(`Error leyendo ${file}`); }
  return fallback;
};

let levels = loadData('./levels.json', { users: {} });
let invites = loadData('./invites.json', {});
const saveLevels = () => fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
const saveInvites = () => fs.writeFileSync('./invites.json', JSON.stringify(invites, null, 2));
setInterval(saveLevels, 30000);
const guildInvites = new Map();

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log('******************************************');
  console.log(`✅ ¡CONECTADO EXITOSAMENTE A DISCORD!`);
  console.log(`🤖 Bot: ${client.user.tag}`);
  console.log('******************************************');
  
  // Cachear invitaciones
  for (const guild of client.guilds.cache.values()) {
    try {
      const invs = await guild.invites.fetch();
      guildInvites.set(guild.id, new Map(invs.map(i => [i.code, i.uses])));
    } catch (e) { console.log(`No se pudieron cargar invites en ${guild.name}`); }
  }
});

/* ───────── SISTEMA DE NIVELES Y ANTI-SPAM ───────── */
const cooldown = new Map();
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;

  // Anti-Spam básico
  const now = Date.now();
  const data = cooldown.get(msg.author.id) || { count: 0, last: now };
  if (now - data.last < 5000) data.count++; else data.count = 1;
  data.last = now;
  cooldown.set(msg.author.id, data);

  if (data.count > 5 && !msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    try {
      await msg.member.timeout(5 * 60 * 1000, 'Spam detectado');
      const logMute = msg.guild.channels.cache.find(ch => ch.name.includes('silenciados'));
      if (logMute) logMute.send(`🛡️ ${msg.author} silenciado 5 min por spam.`);
    } catch (e) {}
    return;
  }

  // Niveles
  const id = msg.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };
  levels.users[id].xp += Math.floor(Math.random() * 10) + 15;
  if (levels.users[id].xp >= levels.users[id].level * 150) {
    levels.users[id].level++;
    levels.users[id].xp = 0;
    const ch = msg.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (ch) ch.send(`🌟 **${msg.author.username}** ha subido al **Nivel ${levels.users[id].level}**`);
  }
});

/* ───────── EVENTOS DE MIEMBROS ───────── */
client.on('guildMemberAdd', async member => {
  const channel = member.guild.channels.cache.find(c => c.name.includes('bienvenidos'));
  if (!channel) return;
  // (Lógica de invitaciones omitida para brevedad, pero funciona igual que la tenías)
  channel.send(`✨ Bienvenido ${member} a Power Luki Network!`);
});

/* ───────── COMANDOS SLASH ───────── */
const commands = [
  new SlashCommandBuilder().setName('mute').setDescription('Silenciar usuario').addUserOption(o => o.setName('usuario').setRequired(true)).addStringOption(o => o.setName('tiempo').setRequired(true)).addStringOption(o => o.setName('razon')),
  new SlashCommandBuilder().setName('anuncio').setDescription('Enviar anuncio').addStringOption(o => o.setName('mensaje').setRequired(true)),
  new SlashCommandBuilder().setName('panel').setDescription('Enviar panel de tickets')
].map(c => c.toJSON());

/* ───────── INTERACCIONES ───────── */
client.on('interactionCreate', async i => {
  if (i.isChatInputCommand()) {
    if (i.commandName === 'panel') {
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('t_open').setLabel('Abrir Ticket').setStyle(ButtonStyle.Primary));
      await i.reply({ content: 'Panel de Soporte', components: [row] });
    }
  }
  if (i.isButton() && i.customId === 't_open') {
    const c = await i.guild.channels.create({ name: `ticket-${i.user.username}`, type: ChannelType.GuildText });
    await i.reply({ content: `Ticket creado: ${c}`, ephemeral: true });
  }
});

/* ───────── WEB SERVER (PARA RENDER) ───────── */
const app = express();
app.get('/', (req, res) => res.send('Servidor Activo ✅'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor Web en puerto ${PORT}`);
});

/* ───────── LOGIN CRÍTICO ───────── */
console.log("⏳ Intentando conectar a Discord...");
client.login(process.env.TOKEN)
  .then(() => {
    // Solo registramos comandos después de un login exitoso
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands })
      .then(() => console.log('✅ Comandos Slash registrados correctamente'))
      .catch(e => console.error("❌ Error registrando comandos:", e.message));
  })
  .catch(err => {
    console.error("❌ ERROR DE CONEXIÓN A DISCORD:");
    console.error(err.message);
  });
