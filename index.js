// index.js — Power Luki Network Bot CORREGIDO Y AJUSTADO (SLASH /anuncio y /nuevo a canales fijos)
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
  ActivityType
} from 'discord.js';

/* ───────── CONFIGURACIÓN ───────── */
const CONFIG = {
  PREFIJO: '!',
  SERVER_IP: 'powermax.hidenmc.com',
  SERVER_PORT: '24818',
  MAIN_GUILD_ID: '1458243569075884219', // Servidor principal donde se enviarán los comandos
  COMMAND_GUILD_ID: '1340442398442127480', // Servidor donde se ejecuta el comando
  CHANNELS: {
    ANUNCIOS: '1340756895618699416', // ID canal anuncios
    NUEVO: '1340757162573562007' // ID canal nuevo
  },
  EMOJIS: { TIENDA: '🛒', IP: '🌐' }
};

/* ───────── EXPRESS SERVER ───────── */
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (_, res) => res.send(`🤖 Bot Power Luki: ${client?.ws?.status === 0 ? 'ONLINE' : 'CONECTANDO...'}`));
app.listen(PORT, () => console.log(`🌐 Web server escuchando en ${PORT} — PID ${process.pid}`));

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

/* ───────── READY ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Bot conectado como ${client.user.tag} (PID ${process.pid})`);
  try { await client.user.setActivity('Power Luki Network', { type: ActivityType.Playing }); } catch (e) { console.warn('No se pudo establecer la actividad:', e); }

  /* ─── Slash commands ─── */
  const commands = [
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio al canal ANUNCIOS')
      .addStringOption(o => o.setName('mensaje').setDescription('Contenido del anuncio').setRequired(true)),

    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar mensaje al canal NUEVO')
      .addStringOption(o => o.setName('mensaje').setDescription('Contenido del mensaje a enviar').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registrados.');
  } catch (err) {
    console.error('❌ Error registrando slash commands:', err);
  }
});

/* ───────── INTERACTIONS ───────── */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  try {
    if (commandName === 'anuncio') {
      const msg = interaction.options.getString('mensaje');
      const guild = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID);
      const ch = await guild.channels.fetch(CONFIG.CHANNELS.ANUNCIOS);
      if (!ch) return interaction.reply({ content: 'Canal de anuncios no encontrado.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('📣 Anuncio').setDescription(msg).setColor('Yellow');
      await ch.send({ embeds: [embed] });
      await interaction.reply({ content: 'Anuncio enviado al servidor principal ✅', ephemeral: true });
    }

    if (commandName === 'nuevo') {
      const msg = interaction.options.getString('mensaje');
      const guild = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID);
      const ch = await guild.channels.fetch(CONFIG.CHANNELS.NUEVO);
      if (!ch) return interaction.reply({ content: 'Canal NUEVO no encontrado.', ephemeral: true });
      await ch.send({ content: msg });
      await interaction.reply({ content: 'Mensaje NUEVO enviado al servidor principal ✅', ephemeral: true });
    }
  } catch (e) {
    console.error('Error en command handler:', e);
    try { await interaction.reply({ content: '❌ Error ejecutando comando', ephemeral: true }); } catch {};
  }
});

/* ───────── LOGIN ───────── */
client.login(process.env.TOKEN)
  .then(() => console.log('✅ Token detectado y bot logueado'))
  .catch((err) => { console.error('❌ Error al loguear el bot:', err); process.exit(1); });
