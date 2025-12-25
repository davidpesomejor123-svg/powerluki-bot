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
// CONFIGURACIÓN Y BASES DE DATOS
// ============================
let levels = { users: {} };
if (fs.existsSync('./levels.json')) {
  levels = JSON.parse(fs.readFileSync('./levels.json', 'utf8'));
}
function saveLevels() {
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
}

// Mapas de control para Anti-Spam y Anti-Raideo
const msgCooldown = new Map();
const joinCooldown = [];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ============================
// EVENTO READY
// ============================
client.once('ready', async () => {
  console.log(`✅ Power Lucky Bot conectado como ${client.user.tag}`);

  // Configuración automática del canal de tickets
  const ticketChannel = client.channels.cache.find(ch => ch.name === '『📖』tickets');
  if (ticketChannel) {
    const messages = await ticketChannel.messages.fetch({ limit: 10 });
    if (!messages.some(m => m.author.id === client.user.id)) {
      const embed = new EmbedBuilder()
        .setColor('#00BFFF')
        .setTitle('⚠️ Sistema de Tickets | Power Lucky Studios ⚠️')
        .setDescription('Selecciona una categoría para recibir ayuda del Staff.')
        .setFooter({ text: 'Power Lucky Network' });

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
// ANTI-RAIDEO Y BIENVENIDA
// ============================
client.on('guildMemberAdd', async member => {
  const now = Date.now();
  joinCooldown.push(now);
  const recentJoins = joinCooldown.filter(time => now - time < 15000); // 15 segundos

  if (recentJoins.length > 10) {
    const logChannel = member.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
    if (logChannel) logChannel.send('⚠️ **ALERTA DE RAID**: Se ha detectado un ingreso masivo de usuarios.');
  }

  const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === '『👋』bienvenidos');
  if (welcomeChannel) {
    const embed = new EmbedBuilder()
      .setColor('#8A2BE2')
      .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
      .setDescription(`🎇 ¡Disfruta tu estadía en **Power Lucky Network**!`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
    welcomeChannel.send({ embeds: [embed] });
  }
});

// ============================
// ANTI-SPAM + SISTEMA DE NIVELES (999)
// ============================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const now = Date.now();

  // --- Lógica Anti-Spam ---
  const userData = msgCooldown.get(userId) || { count: 0, lastMsg: now };
  if (now - userData.lastMsg < 5000) userData.count++;
  else userData.count = 1;
  userData.lastMsg = now;
  msgCooldown.set(userId, userData);

  if (userData.count > 5 && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    const muteRole = message.guild.roles.cache.find(r => r.name === 'Silenciado');
    if (muteRole) {
      await message.member.roles.add(muteRole);
      message.delete().catch(() => {});
      
      const logMute = message.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
      const antiSpamEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🛡️ Anti-Spam Detectado')
        .setDescription(`${message.author} ha sido silenciado **5 minutos** por spam.`);
      if (logMute) logMute.send({ embeds: [antiSpamEmbed] });

      setTimeout(async () => {
        await message.member.roles.remove(muteRole).catch(() => {});
        const logUnmute = message.guild.channels.cache.find(ch => ch.name === '『🔉』desilenciados');
        if (logUnmute) logUnmute.send(`🔊 ${message.author} ha sido desilenciado tras el spam.`);
      }, 5 * 60 * 1000);
      return;
    }
  }

  // --- Sistema de Niveles ---
  if (!levels.users[userId]) levels.users[userId] = { xp: 0, level: 1 };
  if (levels.users[userId].level < 999) {
    levels.users[userId].xp += Math.floor(Math.random() * 15) + 15;
    const xpNeeded = levels.users[userId].level * 150;

    if (levels.users[userId].xp >= xpNeeded) {
      levels.users[userId].level++;
      levels.users[userId].xp = 0;
      const lvCh = message.guild.channels.cache.find(c => c.name === '『🆙』niveles');
      if (lvCh) {
        const levelEmbed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🌟 ¡LEVEL UP! 🌟')
          .setDescription(`¡${message.author} ha subido al **Nivel ${levels.users[userId].level}**!`)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setImage(message.author.displayAvatarURL({ size: 1024 }));
        lvCh.send({ embeds: [levelEmbed] });
      }
    }
    saveLevels();
  }
});

// ============================
// MODERACIÓN AVANZADA (!mute)
// ============================
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  const args = message.content.trim().split(/ +/g);
  const command = args[0].toLowerCase();

  if (command === '!mute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const target = message.mentions.members.first();
    const timeArg = args.find(arg => arg.match(/^\d+[smMa]$/));
    const reason = args.slice(1).filter(a => a !== timeArg && !a.includes(target?.id)).join(' ') || 'No especificada';

    if (!target || !timeArg) return message.reply('Usa: !mute @usuario 10s Razón');

    const unit = timeArg.slice(-1);
    const value = parseInt(timeArg);
    let ms = 0;
    if (unit === 's') ms = value * 1000;
    else if (unit === 'm') ms = value * 60000;
    else if (unit === 'M') ms = value * 2592000000;
    else if (unit === 'a') ms = value * 31536000000;

    const muteRole = message.guild.roles.cache.find(r => r.name === 'Silenciado');
    await target.roles.add(muteRole);

    const endTime = `<t:${Math.floor((Date.now() + ms) / 1000)}:f>`;
    const logMute = message.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
    
    const muteEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚫 Sanción: Power Lucky')
      .addFields(
        { name: '👤 Usuario', value: `${target}`, inline: true },
        { name: '⏳ Tiempo', value: timeArg, inline: true },
        { name: '📄 Razón', value: reason },
        { name: '⏰ Termina', value: endTime }
      );
    if (logMute) logMute.send({ embeds: [muteEmbed] });

    // Aviso al usuario por DM
    target.send(`⚠️ Has sido sancionado en **Power Lucky**. Razón: ${reason}. **Aprende a respetar las normas.**`).catch(() => {});

    setTimeout(async () => {
      await target.roles.remove(muteRole).catch(() => {});
      const logUnmute = message.guild.channels.cache.find(ch => ch.name === '『🔉』desilenciados');
      if (logUnmute) logUnmute.send(`🔊 El usuario ${target} ha sido desilenciado.`);
    }, ms);
  }
});

// ============================
// TICKETS E INTERACCIONES
// ============================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  if (interaction.customId.startsWith('ticket_')) {
    const category = interaction.customId.split('_')[1];
    if (category === 'close') return interaction.channel.delete();

    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    const embed = new EmbedBuilder().setTitle(`🎫 Ticket: ${category}`).setDescription(`Hola ${interaction.user}, el Staff te atenderá pronto.`);
    const closeBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger));
    
    await channel.send({ embeds: [embed], components: [closeBtn] });
    interaction.reply({ content: `✅ Ticket creado: ${channel}`, ephemeral: true });
  }
});

// Servidor Web y Login
const app = express();
app.get('/', (req, res) => res.send('Power Lucky Bot Online'));
app.listen(process.env.PORT || 10000);
client.login(process.env.TOKEN);
