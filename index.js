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
  PermissionsBitField
} from 'discord.js';

// --- BASES DE DATOS ---
let levels = { users: {} };
if (fs.existsSync('./levels.json')) levels = JSON.parse(fs.readFileSync('./levels.json', 'utf8'));
const saveLevels = () => fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));

const msgCooldown = new Map();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- TICKETS, ANTI-SPAM Y NIVELES ---
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const userId = message.author.id;

  // Anti-Spam (Mute 5m si envía > 5 msgs en 5s)
  const now = Date.now();
  const userData = msgCooldown.get(userId) || { count: 0, lastMsg: now };
  if (now - userData.lastMsg < 5000) userData.count++;
  else userData.count = 1;
  userData.lastMsg = now;
  msgCooldown.set(userId, userData);

  if (userData.count > 5 && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    const muteRole = message.guild.roles.cache.find(r => r.name === 'Silenciado');
    if (muteRole) {
      await message.member.roles.add(muteRole);
      const logMute = message.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
      if (logMute) logMute.send(`🛡️ ${message.author} silenciado 5m por **Spam**.`);
      setTimeout(() => message.member.roles.remove(muteRole).catch(() => {}), 300000);
    }
    return;
  }

  // Niveles (Hasta 999)
  if (!levels.users[userId]) levels.users[userId] = { xp: 0, level: 1 };
  if (levels.users[userId].level < 999) {
    levels.users[userId].xp += Math.floor(Math.random() * 10) + 15;
    if (levels.users[userId].xp >= (levels.users[userId].level * 150)) {
      levels.users[userId].level++;
      levels.users[userId].xp = 0;
      const lvCh = message.guild.channels.cache.find(c => c.name === '『🆙』niveles');
      if (lvCh) {
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🌟 ¡NUEVO NIVEL! 🌟')
          .setDescription(`¡Felicidades ${message.author}! Has subido al **Nivel ${levels.users[userId].level}**`)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setImage(message.author.displayAvatarURL({ size: 1024 }));
        lvCh.send({ embeds: [embed] });
      }
    }
    saveLevels();
  }

  // COMANDO MUTE MEJORADO
  if (message.content.startsWith('!mute')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const args = message.content.split(' ');
    const target = message.mentions.members.first();
    const timeStr = args[2]; 
    const reason = args.slice(3).join(' ') || 'No respetó las normas';

    if (!target || !timeStr) return message.reply('❌ Usa: `!mute @usuario 10s Razón`');

    const value = parseInt(timeStr);
    const unit = timeStr.slice(-1);
    let ms = 0;
    if (unit === 's') ms = value * 1000;
    else if (unit === 'm') ms = value * 60000;
    else if (unit === 'M') ms = value * 2592000000;
    
    const muteRole = message.guild.roles.cache.find(r => r.name === 'Silenciado');
    await target.roles.add(muteRole);

    const logMute = message.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚫 Usuario Sancionado')
      .addFields(
        { name: '👤 Usuario', value: `${target}`, inline: true },
        { name: '⏳ Duración', value: timeStr, inline: true },
        { name: '📄 Razón', value: reason }
      );
    
    logMute?.send({ embeds: [embed] });
    target.send(`⚠️ Sancionado en Power Lucky por: ${reason}. **Aprende a respetar las normas.**`).catch(() => {});

    setTimeout(async () => {
      await target.roles.remove(muteRole).catch(() => {});
      const logUnmute = message.guild.channels.cache.find(ch => ch.name === '『🔉』desilenciados');
      logUnmute?.send(`🔊 ${target} ha sido desilenciado.`);
    }, ms);
  }
});

// --- INTERACCIONES DE TICKETS ---
client.on('interactionCreate', async i => {
  if (!i.isButton()) return;

  // CREAR TICKET
  if (i.customId.startsWith('ticket_')) {
    const cat = i.customId.split('_')[1];
    const ch = await i.guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('claim_tk').setLabel('Reclamar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('close_tk').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger)
    );

    await ch.send({ 
      content: `📦 **Ticket de ${cat.toUpperCase()}**\nHola ${i.user}, el Staff te atenderá pronto.`,
      components: [row] 
    });
    i.reply({ content: `✅ Canal creado: ${ch}`, ephemeral: true });
  }

  // RECLAMAR
  if (i.customId === 'claim_tk') {
    if (!i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return i.reply({ content: 'Solo Staff', ephemeral: true });
    i.reply({ content: `🎟️ Ticket reclamado por ${i.user}` });
  }

  // CERRAR CON 5 SEGUNDOS
  if (i.customId === 'close_tk') {
    await i.reply('🔒 Cerrando en **5 segundos**...');
    setTimeout(() => i.channel.delete().catch(() => {}), 5000);
  }
});

client.once('ready', () => console.log('Power Lucky Online'));
const app = express();
app.get('/', (r, s) => s.send('OK'));
app.listen(10000);
client.login(process.env.TOKEN);
