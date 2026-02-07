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
  ActivityType,
  PermissionsBitField
} from 'discord.js';

/* ───────── CONFIGURACIÓN ───────── */
const ALLOWED_SERVERS = [
  '1340442398442127480',
  '1458243569075884219'
];

const CONFIG = {
  TOKEN: process.env.TOKEN,
  CHANNELS: {
    ANUNCIOS: '1340756895618699416',
    NUEVO: '1340757162573562007',
    BANS: '1340453829124034580',
    WELCOME: '1340454070070022205',
    LEAVE: '1340475418091847791'
  },
  SERVER_IP: 'play.tuservidor.com'
};

/* ───────── CLIENTE ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

/* ───────── SERVER WEB ───────── */
const app = express();
app.get('/', (_, res) => res.send('🤖 Power Lucky Bot Online'));
app.listen(process.env.PORT || 10000);

/* ───────── READY / COMANDOS ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Power Luki Network', { type: ActivityType.Playing });

  const commands = [
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio oficial')
      .addStringOption(o =>
        o.setName('mensaje')
         .setDescription('Mensaje del anuncio')
         .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar novedad')
      .addStringOption(o =>
        o.setName('mensaje')
         .setDescription('Mensaje de la novedad')
         .setRequired(true)
      )
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);

  try {
    for (const guildId of ALLOWED_SERVERS) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
      console.log(`🚀 Comandos sincronizados en ${guildId}`);
    }
  } catch (err) {
    console.error('❌ Error registrando comandos:', err);
  }
});

/* ───────── INTERACCIONES ───────── */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!ALLOWED_SERVERS.includes(interaction.guildId)) return;

  const { commandName, options } = interaction;

  if (commandName === 'anuncio' || commandName === 'nuevo') {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📢 Comando recibido: /${commandName}`);
    console.log('📦 Opciones crudas:', interaction.options.data);

    const mensaje = options.getString('mensaje');

    console.log('📝 Mensaje recibido:', mensaje);

    await interaction.deferReply({ ephemeral: true });

    /* VALIDACIÓN */
    if (!mensaje || mensaje.trim().length === 0) {
      console.log('❌ BLOQUEADO: mensaje vacío');
      return interaction.editReply('❌ El mensaje no puede estar vacío.');
    }

    const canalId =
      commandName === 'anuncio'
        ? CONFIG.CHANNELS.ANUNCIOS
        : CONFIG.CHANNELS.NUEVO;

    const canal = await client.channels.fetch(canalId).catch(e => {
      console.error('❌ Canal no encontrado:', e.message);
      return null;
    });

    if (!canal) {
      console.log('❌ BLOQUEADO: canal inválido');
      return interaction.editReply('❌ No se encontró el canal configurado.');
    }

    /* PERMISOS */
    const permisos = canal.permissionsFor(client.user);
    if (
      !permisos ||
      !permisos.has([
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ViewChannel
      ])
    ) {
      console.log('❌ BLOQUEADO: permisos insuficientes');
      return interaction.editReply('❌ No tengo permisos para enviar mensajes en ese canal.');
    }

    /* ENVÍO */
    try {
      await canal.send({
        content: `@everyone\n\`\`\`text\n${mensaje}\n\`\`\``
      });

      console.log('✅ Anuncio enviado correctamente');
      return interaction.editReply('✅ Anuncio enviado con éxito.');
    } catch (e) {
      console.error('❌ ERROR AL ENVIAR:', e);
      return interaction.editReply('❌ Error interno al enviar el anuncio.');
    }
  }
});

/* ───────── MENSAJES TEXTO ───────── */
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!ALLOWED_SERVERS.includes(message.guild.id)) return;

  const c = message.content.toLowerCase();

  if (c === 'ip' || c === '!ip') {
    return message.channel.send(
      `\`\`\`text\nIP DEL SERVIDOR:\n${CONFIG.SERVER_IP}\n\`\`\``
    );
  }

  if (c === 'tienda' || c === '!tienda') {
    return message.channel.send(
      `\`\`\`text\nTIENDA OFICIAL:\nhttps://tienda.tuservidor.com\n\`\`\``
    );
  }
});

/* ───────── BIENVENIDAS ───────── */
client.on('guildMemberAdd', async (m) => {
  if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
  const ch = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(() => null);
  if (ch) ch.send(`✨ Bienvenido **${m.user.username}**`);
});

client.on('guildMemberRemove', async (m) => {
  if (!ALLOWED_SERVERS.includes(m.guild.id)) return;
  const ch = await client.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(() => null);
  if (ch) ch.send(`😔 **${m.user.username}** salió del servidor`);
});

/* ───────── LOGIN ───────── */
client.login(CONFIG.TOKEN);
