import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Collection,
  PermissionFlagsBits
} from 'discord.js';

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── CONFIG ───────── */
const CONFIG = {
  PREFIJO: '!',
  MAIN_GUILD_ID: '1340442398442127480',
  SERVER_IP: 'powermax.hidenmc.com',
  SERVER_PORT: '24818',
  VERSIONS: '1.13 a 1.21.11',
  CANALES: {
    TICKETS: '『📖』tickets',
    NIVELES: '『🆙』niveles',
    BIENVENIDOS: '『👋』bienvenidos',
    DESPEDIDAS: '『😔』despedidas',
    SANCIONES: '『🔇』silenciados',
    DESILENCIADOS: '『🔉』desilenciados',
    BANEOS: '『🔨』baneos',
    BANEOS_TEMP: '『⏳』baneos-temporales',
    INVITACIONES: '『🗓』invitaciones',
    DESBANEOS: '『🔓』desbaneos',
    ANUNCIOS: '『📣』anuncios',
    NUEVO: '『🎊』nuevo'
  },
  IMAGENES: {
    PANEL_TICKET: 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png',
    TICKET_INTERIOR: 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg'
  }
};

/* ───────── PERSISTENCIA ───────── */
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const TEMPBANS_FILE = path.join(DATA_DIR, 'tempbans.json');
const SANCTIONS_FILE = path.join(DATA_DIR, 'sanctions.json');

function loadJSON(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || 'null') ?? defaultValue;
  } catch (err) {
    console.error('Error leyendo JSON', filePath, err);
    return defaultValue;
  }
}
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error escribiendo JSON', filePath, err);
  }
}

let tempBans = loadJSON(TEMPBANS_FILE, []);
let sanctions = loadJSON(SANCTIONS_FILE, []);

const invites = new Collection();
const spamMap = new Map();
const nivelesDB = new Map();
const activeUnbanTimeouts = new Map();
const ticketInactivityTimers = new Map();

/* ───────── UTILIDADES ───────── */
function isStaffMember(member) {
  if (!member || !member.roles) return false;
  const STAFF_ROLE_NAMES = ['Staff', 'Admin', 'Mod', 'Co-Owner', 'Owner', 'Helper'];
  return member.roles.cache.some(r => STAFF_ROLE_NAMES.includes(r.name)) || member.permissions.has(PermissionFlagsBits.Administrator);
}

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Max Network ONLINE: ${client.user.tag}`);

  client.guilds.cache.forEach(async (guild) => {
    try {
      const commands = [
        {
          name: 'anuncio',
          description: 'Enviar anuncio al canal de anuncios (Staff)',
          options: [
            { name: 'texto', description: 'Contenido del anuncio', type: 3, required: true },
            { name: 'image1', description: 'Imagen (opcional)', type: 11, required: false }
          ]
        },
        {
          name: 'nuevo',
          description: 'Publicar novedad (Staff)',
          options: [
            { name: 'texto', description: 'Contenido', type: 3, required: true },
            { name: 'image1', description: 'Imagen (opcional)', type: 11, required: false }
          ]
        }
      ];
      await guild.commands.set(commands);
    } catch (err) {
      console.error('Error creando comandos', err);
    }
  });
});

/* ───────── INTERACTIONS ───────── */
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'anuncio' || commandName === 'nuevo') {
      if (!isStaffMember(interaction.member)) return interaction.reply({ content: '❌ No tienes permisos.', ephemeral: true });

      const mainGuild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID);
      if (!mainGuild) return interaction.reply({ content: '❌ Error: No se detecta el servidor principal.', ephemeral: true });

      const canalNombre = commandName === 'anuncio' ? CONFIG.CANALES.ANUNCIOS : CONFIG.CANALES.NUEVO;
      const canal = mainGuild.channels.cache.find(c => c.name === canalNombre);

      if (!canal) return interaction.reply({ content: `❌ No encontré el canal ${canalNombre}`, ephemeral: true });

      const texto = interaction.options.getString('texto', true);
      const att1 = interaction.options.getAttachment('image1');

      const embed = new EmbedBuilder()
        .setTitle(commandName === 'anuncio' ? '『📣』ANUNCIO OFICIAL' : '『🎊』NUEVA NOVEDAD')
        .setDescription(`\n---\n${texto}\n---\n`)
        .setColor(commandName === 'anuncio' ? '#0099ff' : '#00ffaa')
        .setFooter({ text: `Publicado por ${interaction.user.username} | PowerMax` })
        .setTimestamp();

      const files = att1 ? [{ attachment: att1.url, name: att1.name }] : [];

      await canal.send({ content: '||@everyone||', embeds: [embed], files });
      return interaction.reply({ content: '✅ Publicado con éxito.', ephemeral: true });
    }
  }

  // Lógica de tickets simplificada (Mantenida de tu config original pero funcional)
  if (interaction.isButton() && interaction.customId === 'ticket_close') {
      await interaction.reply({ content: '🔒 Cerrando en 5 segundos...', ephemeral: true });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
});

/* ───────── MENSAJES: IP, TIENDA Y NIVELES ───────── */
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const msg = message.content.toLowerCase();

  // --- RESPUESTA AUTOMÁTICA IP ---
  if (msg === 'ip' || msg.includes('como entro') || msg === '.ip') {
    const ipEmbed = new EmbedBuilder()
      .setTitle('『🌐』INFORMACIÓN DE CONEXIÓN')
      .setColor('#5865F2')
      .setDescription(
        `¡Hola **${message.author.username}**! Aquí tienes los datos para unirte:\n\n` +
        `> **--- JAVA EDITION ---**\n` +
        `> :ip: **IP:** \`${CONFIG.SERVER_IP}\` \n` +
        `> **Versiones:** \`${CONFIG.VERSIONS}\` \n\n` +
        `> **--- BEDROCK EDITION ---**\n` +
        `> :bedrock: **IP:** \`${CONFIG.SERVER_IP}\` \n` +
        `> **Puerto:** \`${CONFIG.SERVER_PORT}\` \n\n` +
        `___`
      )
      .setFooter({ text: 'PowerMax Network - ¡Te esperamos!' })
      .setTimestamp();

    return message.reply({ embeds: [ipEmbed] });
  }

  // --- RESPUESTA AUTOMÁTICA TIENDA ---
  if (msg.includes('tienda') || msg.includes('donar') || msg === '.tienda') {
    const shopEmbed = new EmbedBuilder()
      .setTitle('『🛒』TIENDA OFICIAL')
      .setColor('#F1C40F')
      .setDescription(
        `Apoya al servidor adquiriendo rangos y beneficios únicos:\n\n` +
        `**--- ENLACE ---**\n` +
        `🔗 [tienda.powermax.com](https://google.com)\n\n` +
        `> _¡Tu compra nos ayuda a seguir mejorando!_`
      );
    return message.reply({ embeds: [shopEmbed] });
  }

  // --- SISTEMA DE NIVELES MEJORADO ---
  const userId = message.author.id;
  let data = nivelesDB.get(userId) || { xp: 0, nivel: 1, lastXP: 0 };

  if (Date.now() - data.lastXP > 60000) {
    data.xp += Math.floor(Math.random() * 15) + 10;
    data.lastXP = Date.now();
    
    const xpNecesaria = data.nivel * 250; 

    if (data.xp >= xpNecesaria) {
      data.nivel++;
      data.xp = 0;
      
      const canalNiveles = message.guild.channels.cache.find(c => c.name === CONFIG.CANALES.NIVELES);
      if (canalNiveles) {
        const lvEmbed = new EmbedBuilder()
          .setTitle('『🆙』¡NUEVO NIVEL ALCANZADO!')
          .setColor('#FFD700')
          .setThumbnail(message.author.displayAvatarURL())
          .setDescription(
            `\n---\n` +
            `🎉 ¡Felicidades **${message.author.username}**!\n` +
            `Has subido al **Nivel ${data.nivel}**\n` +
            `---\n` +
            `> Sigue chateando para desbloquear más recompensas.`
          )
          .setFooter({ text: 'PowerMax Leveling System' });
          
        canalNiveles.send({ content: `¡Oye ${message.author}!`, embeds: [lvEmbed] }).catch(() => {});
      }
    }
    nivelesDB.set(userId, data);
  }
});

/* ───────── SERVIDOR WEB ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Max Bot Online ✅'));
app.listen(process.env.PORT || 10000, () => client.login(process.env.TOKEN));
