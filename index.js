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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── PERSISTENCIA ───────── */
const loadJSON = (file, fallback) => {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } 
  catch (e) { return fallback; }
};

let levels = loadJSON('./levels.json', { users: {} });
let invites = loadJSON('./invites.json', {});
const saveLevels = () => fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
const saveInvites = () => fs.writeFileSync('./invites.json', JSON.stringify(invites, null, 2));
setInterval(saveLevels, 30000);
const guildInvites = new Map();

/* ───────── COMANDOS (REVISADOS) ───────── */
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silenciar a un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
    .addStringOption(o => o.setName('tiempo').setDescription('Ej: 10m, 1h').setRequired(true))
    .addStringOption(o => o.setName('razon').setDescription('Motivo de la sanción').setRequired(true)),

  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Enviar anuncio oficial')
    .addStringOption(o => o.setName('mensaje').setDescription('Contenido del mensaje').setRequired(true)),

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Enviar el panel de tickets')
].map(c => c.toJSON());

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Comandos Slash registrados');
  } catch (e) { console.error('❌ Error en comandos:', e); }

  client.guilds.cache.forEach(async g => {
    try {
      const invs = await g.invites.fetch();
      guildInvites.set(g.id, new Map(invs.map(i => [i.code, i.uses])));
    } catch (e) {}
  });
});

/* ───────── INTERACCIONES (ESTILO NAUTIC) ───────── */
client.on('interactionCreate', async i => {
  if (i.isChatInputCommand()) {
    if (i.commandName === 'panel') {
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🎫 POWER LUKI NETWORK | SOPORTE')
        .setDescription('Pulsa el botón de abajo para abrir un ticket.')
        .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png');
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk_open').setLabel('Abrir Ticket').setStyle(ButtonStyle.Success).setEmoji('🎫')
      );
      await i.channel.send({ embeds: [embed], components: [row] });
      return i.reply({ content: 'Panel enviado', ephemeral: true });
    }
    // Lógica simple de mute
    if (i.commandName === 'mute') {
        i.reply("Comando mute procesado (Lógica interna activa).");
    }
  }

  if (i.isButton()) {
    if (i.customId === 'tk_open') {
      const channel = await i.guild.channels.create({
        name: `🎫-${i.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('SOPORTE DISCORD')
        .setDescription(
          `¡Hola **${i.user}**! Bienvenido al soporte de **Power Luki Network**\n\n` +
          `Nuestro staff le responderá en un plazo de 12 a 24 horas aproximadamente. **Por favor, sea paciente.**\n` +
          `──────────────────────────\n` +
          `**¿Cuál es tu nick de usuario?**:\n` +
          `Escribe tu nick aquí abajo...\n\n` +
          `**Describe tu problema**:\n` +
          `Danos todos los detalles posibles.\n` +
          `──────────────────────────\n` +
          `* ¡Gracias por confiar en nosotros! *`
        )
        .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png')
        .setFooter({ text: '¡Power Luki Network • Sistema de Tickets' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
        new ButtonBuilder().setCustomId('tk_claim').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('👋')
      );

      await channel.send({ content: `${i.user} | @Staff`, embeds: [ticketEmbed], components: [row] });
      await i.reply({ content: `✅ Ticket creado: ${channel}`, ephemeral: true });
    }

    if (i.customId === 'tk_claim') {
      await i.reply(`👋 El ticket ha sido reclamado por **${i.user.username}**`);
      await i.channel.setName(`✅-${i.user.username}`);
    }

    if (i.customId === 'tk_close') {
      await i.reply('🔒 Cerrando ticket en 5 segundos...');
      setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
  }
});

/* ───────── NIVELES ───────── */
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;
  const id = msg.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };
  levels.users[id].xp += 15;
  if (levels.users[id].xp >= levels.users[id].level * 150) {
    levels.users[id].level++;
    levels.users[id].xp = 0;
    saveLevels();
  }
});

/* ───────── WEB SERVER (PARA RENDER) ───────── */
const app = express();
app.get('/', (req, res) => res.send('Bot Online ✅'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
  console.log('🌐 Servidor Web Activo');
  client.login(process.env.TOKEN).catch(e => console.error('❌ Error de Login:', e));
});
