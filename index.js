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
// Manejo de Interacciones
// ============================
client.on('interactionCreate', async interaction => {
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
    }
  }

  if (!interaction.isButton()) return;
  const allowedPanelIds = ['ticket_soporte', 'ticket_reportes', 'ticket_otros', 'ticket_compras'];

  try {
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
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
        ]
      });

      const embed = new EmbedBuilder()
        .setColor('#00BFFF')
        .setTitle(`🎫 Ticket de ${category.toUpperCase()}`)
        .setDescription(`Hola ${interaction.user}, un miembro del staff te atenderá pronto.`);

      const ticketButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_claim_${ticketChannel.id}`).setLabel('🎟️ Reclamar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ticket_close_${ticketChannel.id}`).setLabel('🔒 Cerrar').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ embeds: [embed], components: [ticketButtons] });
      await interaction.editReply({ content: `✅ Ticket creado: ${ticketChannel}.` });
    }

    if (interaction.customId.startsWith('ticket_close_')) {
      await interaction.deferReply({ ephemeral: true });
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
    const levelChannel = message.guild.channels.cache.find(ch => ch.name === '『🆙』niveles');
    if (levelChannel) levelChannel.send(`🌟 ¡**${message.author.username}** ha subido al nivel **${levels.users[userId].level}**!`);
  }
  saveLevels();
});

// ============================================
// MODERACIÓN AVANZADA: Mute con Embeds Pro
// ============================================
client.on('messageCreate', async message => {
  if (!message.guild || !message.member || message.author.bot) return;

  const args = message.content.trim().split(/ +/g);
  const command = args[0].toLowerCase();

  if (command === '!mute' || command === '!silenciar') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ Sin permisos.');

    const target = message.mentions.members.first();
    const timeArg = args.find(arg => arg.match(/^\d+[smMa]$/)); 
    const reason = args.slice(2).filter(a => a !== timeArg && !a.includes('<@')).join(' ') || 'No especificada';

    if (!target) return message.reply('❌ Menciona a un usuario.');
    if (!timeArg) return message.reply('❌ Tiempo inválido. Ejemplo: `!mute @usuario 10s`');

    const unit = timeArg.slice(-1);
    const value = parseInt(timeArg);
    let timeInMs = 0;

    switch (unit) {
      case 's': timeInMs = value * 1000; break;
      case 'm': timeInMs = value * 60 * 1000; break;
      case 'M': timeInMs = value * 30 * 24 * 60 * 60 * 1000; break;
      case 'a': timeInMs = value * 365 * 24 * 60 * 60 * 1000; break;
    }

    const endTime = new Date(Date.now() + timeInMs);
    let muteRole = message.guild.roles.cache.find(r => r.name === 'Silenciado');
    
    if (!muteRole) {
      try {
        muteRole = await message.guild.roles.create({ name: 'Silenciado', color: '#515864' });
        message.guild.channels.cache.forEach(async (ch) => {
          try { await ch.permissionOverwrites.edit(muteRole, { SendMessages: false }); } catch (e) {}
        });
      } catch (e) { console.error(e); }
    }

    try {
      await target.roles.add(muteRole);

      // --- EMBED PARA EL CANAL DE LOGS ---
      const logMute = message.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
      const logEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🚫 Sanción Aplicada: Power Lucky')
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: '👤 Usuario Sancionado', value: `${target} (${target.user.tag})`, inline: false },
          { name: '⏳ Duración', value: `\`${timeArg}\``, inline: true },
          { name: '🛡️ Moderador', value: `${message.author.tag}`, inline: true },
          { name: '📄 Razón', value: `\`${reason}\``, inline: false },
          { name: '⏰ Termina el', value: `<t:${Math.floor(endTime.getTime() / 1000)}:f>`, inline: false }
        )
        .setFooter({ text: 'Sistema de Seguridad Power Lucky' })
        .setTimestamp();

      if (logMute) logMute.send({ embeds: [logEmbed] });
      message.reply(`✅ ${target} ha sido sancionado correctamente por **${timeArg}**.`);

      // --- EMBED PARA EL USUARIO (MD/DM) ---
      const dmEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('⚠️ Has sido sancionado en Power Lucky Network')
        .setDescription(`Has recibido un silencio temporal por parte de nuestro sistema de moderación.\n\n**Aprende a respetar las normas para evitar sanciones permanentes.**`)
        .addFields(
          { name: '⏳ Tiempo', value: timeArg, inline: true },
          { name: '📄 Razón', value: reason, inline: true },
          { name: '📅 Finaliza', value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>` }
        )
        .setFooter({ text: 'Power Lucky • Normas de convivencia' });

      target.send({ embeds: [dmEmbed] }).catch(() => console.log("El usuario tiene los DM cerrados."));

      // --- TEMPORIZADOR DE UNMUTE ---
      setTimeout(async () => {
        const member = await message.guild.members.fetch(target.id).catch(() => null);
        if (member && member.roles.cache.has(muteRole.id)) {
          await member.roles.remove(muteRole);
          const logUnmute = message.guild.channels.cache.find(ch => ch.name === '『🔉』desilenciados');
          if (logUnmute) {
            logUnmute.send(`🔊 El usuario ${target} ha cumplido su sanción de **${timeArg}** y ha sido desilenciado.`);
          }
        }
      }, timeInMs);

    } catch (err) { 
        console.error(err);
        message.reply('❌ No pude silenciar al usuario. Asegúrate de que mi rol esté por encima del suyo.'); 
    }
  }

  if (command === '!unmute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.members.first();
    const muteRole = message.guild.roles.cache.find(r => r.name === 'Silenciado');
    if (target && muteRole) {
      await target.roles.remove(muteRole);
      message.reply(`✅ Silencio retirado a **${target.user.tag}**.`);
      const logUnmute = message.guild.channels.cache.find(ch => ch.name === '『🔉』desilenciados');
      if (logUnmute) logUnmute.send(`🔊 **${target.user.tag}** fue desilenciado manualmente por un moderador.`);
    }
  }
});

// ============================
// Registro de Comandos Slash
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

const app = express();
app.get('/', (req, res) => res.send('✅ Bot Power_luki activo'));
app.listen(process.env.PORT || 10000);
client.login(process.env.TOKEN);
