import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes
} from 'discord.js';

// ============================
// Cargar JSON y variables
// ============================
let banConfig = JSON.parse(fs.readFileSync('./banConfig.json', 'utf8'));
let invites = JSON.parse(fs.readFileSync('./invites.json', 'utf8'));
const guildInvites = new Map();

// ============================
// Niveles
// ============================
let levels = { users: {} };
if (fs.existsSync('./levels.json')) {
  levels = JSON.parse(fs.readFileSync('./levels.json', 'utf8'));
}
function saveLevels() {
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
}
const MIN_XP = 10;
const MAX_XP = 20;

// ============================
// Client
// ============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ============================
// Evento Ready (v15 usa clientReady)
// ============================
client.once('clientReady', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    try {
      const firstInvites = await guild.invites.fetch();
      guildInvites.set(guild.id, new Map(firstInvites.map(i => [i.code, i.uses])));
    } catch (err) {
      console.warn(`No se pudieron obtener invitaciones en ${guild.name}`);
    }
  }

  // Canal de tickets
  const ticketChannel = client.channels.cache.find(
    ch => ch.name === '『📖』tickets' && ch.type === ChannelType.GuildText
  );

  if (ticketChannel) {
    const fetchedMessages = await ticketChannel.messages.fetch({ limit: 50 });
    const botMessageExists = fetchedMessages.some(msg => msg.author.id === client.user.id);

    if (!botMessageExists) {
      const embed = new EmbedBuilder()
        .setColor('#00BFFF')
        .setTitle('⚠️ Sistema de Tickets | Power Luki Studios ⚠️')
        .setDescription(`
💠 Los tickets inactivos se cerrarán pasados 3 días 💠

⚙️ **Soporte**: Ayuda general  
⚠️ **Reportes**: Bugs o problemas  
‼️ **Otros**: Dudas varias  
🛒 **Compras**: Asistencia de tienda

⬇️ Selecciona el tipo de ticket que deseas crear:
        `);

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_soporte').setLabel('Soporte').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_reportes').setLabel('Reportes').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_otros').setLabel('Otros').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_compras').setLabel('Compras').setStyle(ButtonStyle.Success)
      );

      await ticketChannel.send({ embeds: [embed], components: [buttons] });
    }
  }
});

// ============================
// Comando simple
// ============================
client.on('messageCreate', message => {
  if (message.content === '!hola') {
    message.reply('👋 ¡Hola! Soy tu bot.');
  }
});

// ============================
// Bienvenida personalizada
// ============================
client.on('guildMemberAdd', async member => {
  try {
    const channel = member.guild.channels.cache.find(
      ch => ch.name === '『👋』bienvenidos' && ch.type === ChannelType.GuildText
    );
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor('#8A2BE2')
        .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
        .setDescription(`
\`-_- - POWER LUKI NETWORK -_- \`

💎 **${member.user.username}** ha llegado a nuestra comunidad.
🎇 ¡Disfruta tu estadía!
        `)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' });

      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('Error en bienvenida:', err);
  }
});

// ============================
// Manejo de Interacciones (botones + slash juntos)
// ============================

/*
  Nota importante sobre la lógica:
   - Los botones del panel (ticket_soporte, ticket_reportes, ticket_otros, ticket_compras)
     CREAN tickets.
   - Los botones dentro de cada ticket tendrán IDs únicos basados en el ID del canal:
     -> ticket_claim_<channelId>
     -> ticket_close_<channelId>
   - De esta forma reclamar/cerrar nunca volverá a crear tickets.
*/

client.on('interactionCreate', async interaction => {

  // ======= SLASH COMMAND: /sugerir =======
  if (interaction.isChatInputCommand() && interaction.commandName === 'sugerir') {
    try {
      await interaction.deferReply({ flags: 64 });
      const suggestion = interaction.options.getString('mensaje');
      const suggestionChannel = await interaction.guild.channels.fetch('1340503280987541534');

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📢 Nueva Sugerencia')
        .setDescription(suggestion)
        .addFields(
          { name: '💡 Sugerido por', value: interaction.user.tag, inline: true },
          { name: '🕒 Fecha', value: new Date().toLocaleString(), inline: true }
        )
        .setFooter({ text: 'Power Luki Network • Sugerencias' });

      const msg = await suggestionChannel.send({ embeds: [embed] });
      await msg.react('✅');
      await msg.react('❌');

      await interaction.editReply({
        content: '✅ Tu sugerencia ha sido enviada correctamente.'
      });
    } catch (err) {
      console.error('Error en /sugerir:', err);
      if (!interaction.replied) {
        await interaction.editReply({ content: '❌ Ocurrió un error.' });
      }
    }
  }

  // ======= BOTONES =======
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;

  // -- Definimos categorías válidas del panel para crear tickets --
  const allowedPanelIds = ['ticket_soporte', 'ticket_reportes', 'ticket_otros', 'ticket_compras'];

  try {
    // 1) CREAR TICKET: solo si el customId es EXACTAMENTE una de las del panel
    if (allowedPanelIds.includes(interaction.customId)) {
      // defer rápido para evitar "Unknown interaction"
      await interaction.deferReply({ flags: 64 });

      const category = interaction.customId.replace('ticket_', '');
      const guild = interaction.guild;

      // Evitar abrir más de 1 ticket por usuario con mismo nombre
      const existing = guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username}`);
      if (existing) {
        return interaction.editReply({
          content: `⚠️ Ya tienes un ticket abierto: ${existing}.`
        });
      }

      const ticketChannel = await guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] }
        ]
      });

      const embed = new EmbedBuilder()
        .setColor('#00BFFF')
        .setTitle(`🎫 Ticket de ${category.toUpperCase()}`)
        .setDescription(`
Hola ${interaction.user}, un miembro del staff te atenderá pronto.

Usa los botones a continuación:
- 🎟️ **Reclamar**: Un staff se hace cargo.
- 🔒 **Cerrar**: Cierra el ticket.
        `)
        .setFooter({ text: 'Power Luki Network • Sistema de Tickets' });

      // IMPORTANT: usamos el ID del canal para los botones del ticket, así son únicos
      const ticketButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_claim_${ticketChannel.id}`).setLabel('🎟️ Reclamar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ticket_close_${ticketChannel.id}`).setLabel('🔒 Cerrar').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ embeds: [embed], components: [ticketButtons] });

      await interaction.editReply({
        content: `✅ Ticket creado correctamente en ${ticketChannel}.`
      });

      return; // terminado
    }

    // 2) RECLAMAR: customId = ticket_claim_<channelId>
    if (interaction.customId.startsWith('ticket_claim_')) {
      // responder rápido
      await interaction.deferReply({ flags: 64 });

      // extraer channelId
      const parts = interaction.customId.split('_');
      const channelId = parts.slice(2).join('_'); // por si acaso hay guiones en ids (no debería)

      // obtener canal objetivo (puede no estar en cache)
      const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!targetChannel) {
        return interaction.editReply({ content: '❌ Canal del ticket no encontrado o ya eliminado.' });
      }

      // permisos: solo staff
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.editReply({ content: '❌ No tienes permiso para reclamar tickets.' });
      }

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🎟️ Ticket reclamado')
        .setDescription(`Este ticket ha sido reclamado por <@${interaction.user.id}>.`);

      await targetChannel.send({ embeds: [embed] });
      await interaction.editReply({ content: '✅ Ticket reclamado correctamente.' });

      return;
    }

    // 3) CERRAR: customId = ticket_close_<channelId>
    if (interaction.customId.startsWith('ticket_close_')) {
      await interaction.deferReply({ flags: 64 });

      const parts = interaction.customId.split('_');
      const channelId = parts.slice(2).join('_');

      const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!targetChannel) {
        return interaction.editReply({ content: '❌ Canal del ticket no encontrado o ya eliminado.' });
      }

      // opcional: solo staff o el creador pueden cerrar
      const memberIsStaff = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages);
      const channelMention = `<#${channelId}>`;

      await interaction.editReply({ content: `🔒 Cerrando ${channelMention} en 5 segundos...` });

      // dar 5s para que se vea el mensaje y luego eliminar
      setTimeout(() => targetChannel.delete().catch(() => {}), 5000);

      return;
    }

    // Si llega aquí: customId no reconocido -> ignorar
  } catch (err) {
    console.error('Error manejando interacción de botón:', err);
    // si la interacción fue deferida, intentamos editar la respuesta
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ Ocurrió un error al procesar la interacción.' });
      } else {
        await interaction.reply({ content: '❌ Ocurrió un error al procesar la interacción.', flags: 64 });
      }
    } catch (e) {
      console.error('Error al notificar fallo al usuario:', e);
    }
  }
});

// ============================
// Registrar slash /sugerir
// ============================
const commands = [
  new SlashCommandBuilder()
    .setName('sugerir')
    .setDescription('Envía una sugerencia al canal de sugerencias')
    .addStringOption(option =>
      option.setName('mensaje').setDescription('Escribe tu sugerencia').setRequired(true)
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Actualizando comandos de slash...');
    await rest.put(Routes.applicationCommands('1433313752488607821'), { body: commands });
    console.log('Comandos actualizados correctamente.');
  } catch (err) {
    console.error('Error al registrar comandos:', err);
  }
})();

// ============================
// Sistema de niveles
// ============================
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const userId = message.author.id;
  if (!levels.users[userId]) levels.users[userId] = { xp: 0, level: 1 };

  const xp = Math.floor(Math.random() * (MAX_XP - MIN_XP + 1)) + MIN_XP;
  levels.users[userId].xp += xp;

  const xpToNext = levels.users[userId].level * 100;
  if (levels.users[userId].xp >= xpToNext) {
    levels.users[userId].level += 1;
    levels.users[userId].xp -= xpToNext;

    const embed = new EmbedBuilder()
      .setColor('#00FFFF')
      .setTitle(`🌟 ¡LEVEL UP! 🌟`)
      .setDescription(`🎉 <@${userId}> ha subido al **Nivel ${levels.users[userId].level}** 🎉`)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }));

    const levelChannel = message.guild.channels.cache.find(ch => ch.name === '『🆙』niveles');
    if (levelChannel) levelChannel.send({ embeds: [embed] });
  }

  saveLevels();
});

// ============================
// Sistema de baneos
// ============================
client.on('messageCreate', async message => {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;

  const args = message.content.trim().split(/ +/g);
  if (args[0] === '!ban') {
    const user = message.mentions.members.first();
    if (!user) return message.reply('❌ Menciona un usuario para banear.');
    if (!user.bannable) return message.reply('❌ No puedo banear a ese usuario.');

    const reason = args.slice(2).join(' ') || 'No especificada';
    await user.ban({ reason });
    message.reply(`✅ ${user.user.tag} fue baneado.`);
  }
});

// ============================
// Servidor web Render
// ============================
const app = express();
app.get('/', (req, res) => res.send('✅ Bot Power_luki NETWORK activo en Render'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🌐 Servidor web activo en el puerto ${PORT}`));

// ============================
// Login
// ============================
client.login(process.env.TOKEN);





