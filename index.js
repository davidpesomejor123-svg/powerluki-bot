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
// Evento Ready
// ============================
client.once('ready', async () => {
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
// Manejo de Interacciones (Tickets + Slash)
// ============================
client.on('interactionCreate', async interaction => {

  // SLASH COMMAND: /sugerir
  if (interaction.isChatInputCommand() && interaction.commandName === 'sugerir') {
    try {
      await interaction.deferReply({ ephemeral: true });
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

      await interaction.editReply({ content: '✅ Tu sugerencia ha sido enviada correctamente.' });
    } catch (err) {
      console.error('Error en /sugerir:', err);
      if (!interaction.replied) await interaction.editReply({ content: '❌ Ocurrió un error.' });
    }
  }

  if (!interaction.isButton()) return;
  if (!interaction.guild) return;

  const allowedPanelIds = ['ticket_soporte', 'ticket_reportes', 'ticket_otros', 'ticket_compras'];

  try {
    // 1) CREAR TICKET
    if (allowedPanelIds.includes(interaction.customId)) {
      await interaction.deferReply({ ephemeral: true });
      const category = interaction.customId.replace('ticket_', '');
      const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username}`);
      
      if (existing) return interaction.editReply({ content: `⚠️ Ya tienes un ticket abierto: ${existing}.` });

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] }
        ]
      });

      const embed = new EmbedBuilder()
        .setColor('#00BFFF')
        .setTitle(`🎫 Ticket de ${category.toUpperCase()}`)
        .setDescription(`Hola ${interaction.user}, un miembro del staff te atenderá pronto.\n\nUsa los botones a continuación:\n- 🎟️ **Reclamar**: Un staff se hace cargo.\n- 🔒 **Cerrar**: Cierra el ticket.`)
        .setFooter({ text: 'Power Luki Network • Sistema de Tickets' });

      const ticketButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_claim_${ticketChannel.id}`).setLabel('🎟️ Reclamar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ticket_close_${ticketChannel.id}`).setLabel('🔒 Cerrar').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ embeds: [embed], components: [ticketButtons] });
      await interaction.editReply({ content: `✅ Ticket creado en ${ticketChannel}.` });
      return;
    }

    // 2) RECLAMAR
    if (interaction.customId.startsWith('ticket_claim_')) {
      await interaction.deferReply({ ephemeral: true });
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.editReply({ content: '❌ No tienes permiso.' });
      
      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🎟️ Ticket reclamado')
        .setDescription(`Este ticket ha sido reclamado por <@${interaction.user.id}>.`);

      await interaction.channel.send({ embeds: [embed] });
      await interaction.editReply({ content: '✅ Reclamado.' });
    }

    // 3) CERRAR
    if (interaction.customId.startsWith('ticket_close_')) {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ content: `🔒 Cerrando ticket en 5 segundos...` });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  } catch (err) { console.error(err); }
});

// ============================
// Sistema de Niveles
// ============================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

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

// ============================================
// MODERACIÓN: Ban, Silenciar y Unmute
// ============================================
client.on('messageCreate', async message => {
  if (!message.guild || !message.member || message.author.bot) return;

  const args = message.content.trim().split(/ +/g);
  const command = args[0].toLowerCase();

  // !BAN
  if (command === '!ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
    const user = message.mentions.members.first();
    if (!user) return message.reply('❌ Menciona un usuario.');
    if (!user.bannable) return message.reply('❌ No puedo banearlo.');
    const reason = args.slice(2).join(' ') || 'No especificada';
    await user.ban({ reason });
    message.reply(`✅ ${user.user.tag} baneado.`);
  }

  // !MUTE / !SILENCIAR
  if (command === '!mute' || command === '!silenciar') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ Sin permisos.');

    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Menciona a alguien.');
    const reason = args.slice(2).join(' ') || 'No especificada';

    let muteRole = message.guild.roles.cache.find(r => r.name === 'Silenciado');
    if (!muteRole) {
      muteRole = await message.guild.roles.create({
        name: 'Silenciado', color: '#515864', permissions: []
      });
      message.guild.channels.cache.forEach(async (channel) => {
        try {
          await channel.permissionOverwrites.edit(muteRole, { SendMessages: false, Speak: false, AddReactions: false });
        } catch (e) {}
      });
    }

    try {
      await target.roles.add(muteRole);
      message.reply(`✅ **${target.user.tag}** silenciado.`);

      const logChannel = message.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('🔇 Usuario Silenciado')
          .addFields(
            { name: '👤 Usuario', value: target.user.tag, inline: true },
            { name: '🛡️ Moderador', value: message.author.tag, inline: true },
            { name: '📄 Motivo', value: reason }
          )
          .setTimestamp();
        logChannel.send({ embeds: [embed] });
      }
    } catch (err) { message.reply('❌ Error al silenciar.'); }
  }

  // !UNMUTE (Para quitar el silencio)
  if (command === '!unmute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.members.first();
    const muteRole = message.guild.roles.cache.find(r => r.name === 'Silenciado');
    if (target && muteRole) {
      await target.roles.remove(muteRole);
      message.reply(`✅ Silencio retirado a **${target.user.tag}**.`);
    }
  }
});

// ============================
// Slash Command Registration
// ============================
const commands = [
  new SlashCommandBuilder()
    .setName('sugerir')
    .setDescription('Envía una sugerencia')
    .addStringOption(opt => opt.setName('mensaje').setDescription('Tu sugerencia').setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands('1433313752488607821'), { body: commands });
    console.log('✅ Comandos Slash registrados.');
  } catch (err) { console.error(err); }
})();

// ============================
// Web Server & Login
// ============================
const app = express();
app.get('/', (req, res) => res.send('✅ Bot Power_luki activo'));
app.listen(process.env.PORT || 10000);
client.login(process.env.TOKEN);






