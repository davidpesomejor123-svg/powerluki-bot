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

// --- BASE DE DATOS DE NIVELES ---
let levels = { users: {} };
if (fs.existsSync('./levels.json')) {
  levels = JSON.parse(fs.readFileSync('./levels.json', 'utf8'));
}
const saveLevels = () => fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));

const msgCooldown = new Map();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- SISTEMA DE NIVELES Y ANTI-SPAM ---
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const userId = message.author.id;

  // Lógica Anti-Spam (Mute automático 5m)
  const now = Date.now();
  const userData = msgCooldown.get(userId) || { count: 0, lastMsg: now };
  if (now - userData.lastMsg < 5000) userData.count++;
  else userData.count = 1;
  userData.lastMsg = now;
  msgCooldown.set(userId, userData);

  if (userData.count > 5 && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    try {
        await message.member.timeout(300000, "Spam detectado");
        const logMute = message.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
        if (logMute) logMute.send(`🛡️ ${message.author} ha sido silenciado **5 minutos** por Spam.`);
        return;
    } catch (e) { console.log("Error en auto-mute spam"); }
  }

  // Lógica de Niveles hasta 999
  if (!levels.users[userId]) levels.users[userId] = { xp: 0, level: 1 };
  if (levels.users[userId].level < 999) {
    levels.users[userId].xp += Math.floor(Math.random() * 10) + 15;
    const xpNeeded = levels.users[userId].level * 150;

    if (levels.users[userId].xp >= xpNeeded) {
      levels.users[userId].level++;
      levels.users[userId].xp = 0;
      const lvCh = message.guild.channels.cache.find(c => c.name === '『🆙』niveles');
      if (lvCh) {
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🌟 ¡NUEVO NIVEL ALCANZADO! 🌟')
          .setDescription(`¡Felicidades ${message.author}! Ahora eres **Nivel ${levels.users[userId].level}**`)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setImage(message.author.displayAvatarURL({ size: 1024 }));
        lvCh.send({ embeds: [embed] });
      }
    }
    saveLevels();
  }
});

// --- COMANDO MUTE (TU LÓGICA INTEGRADA) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'mute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
        
        const target = message.mentions.members.first();
        const timeInput = args[1]; // Agarrando tu lógica de args[1]
        const reason = args.slice(2).join(' ') || 'No especificada';

        if (!target || !timeInput) return message.reply("Usa: !mute @usuario <tiempo> [razón]");

        let timeInMs;
        const unit = timeInput.slice(-1);
        const value = parseInt(timeInput);

        switch (unit) {
            case 's': timeInMs = value * 1000; break;
            case 'm': timeInMs = value * 60 * 1000; break;
            case 'M': timeInMs = value * 30 * 24 * 60 * 60 * 1000; break;
            case 'a': timeInMs = value * 365 * 24 * 60 * 60 * 1000; break;
            default: return message.reply("❌ Formato inválido. Usa s, m, M o a (Ej: 10m).");
        }

        try {
            await target.timeout(timeInMs, reason);
            
            const logMute = message.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
            const muteEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚫 Usuario Silenciado')
                .addFields(
                    { name: '👤 Usuario', value: `${target}`, inline: true },
                    { name: '⏳ Tiempo', value: timeInput, inline: true },
                    { name: '📄 Razón', value: reason }
                )
                .setTimestamp();

            if (logMute) logMute.send({ embeds: [muteEmbed] });
            message.reply(`✅ **${target.user.tag}** silenciado por ${timeInput}.`);

            // Notificación al usuario
            target.send(`⚠️ Has sido silenciado en **Power Lucky**. Razón: ${reason}. **Aprende a respetar las normas.**`).catch(() => {});

            // Log de desilencio automático
            setTimeout(async () => {
                const logUnmute = message.guild.channels.cache.find(c => c.name === '『🔉』desilenciados');
                if (logUnmute) logUnmute.send(`🔊 El usuario **${target.user.tag}** ha sido desilenciado automáticamente.`);
            }, timeInMs);

        } catch (err) {
            message.reply("❌ No pude silenciar al usuario. Revisa mis permisos.");
        }
    }
});

// --- SISTEMA DE TICKETS CORREGIDO ---
client.on('interactionCreate', async i => {
    if (!i.isButton()) return;

    // Crear Ticket
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
            new ButtonBuilder().setCustomId('claim_tk').setLabel('🎟️ Reclamar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('close_tk').setLabel('🔒 Cerrar').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setColor('#00BFFF')
            .setTitle(`🎫 Ticket de ${cat.toUpperCase()}`)
            .setDescription(`Hola ${i.user}, el Staff te atenderá pronto.`);

        await ch.send({ embeds: [embed], components: [row] });
        i.reply({ content: `✅ Ticket abierto en ${ch}`, ephemeral: true });
    }

    // Reclamar Ticket
    if (i.customId === 'claim_tk') {
        if (!i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return i.reply({ content: '❌ Solo Staff.', ephemeral: true });
        i.reply({ content: `🎟️ Ticket reclamado por **${i.user.tag}**` });
    }

    // Cerrar con 5 segundos de espera
    if (i.customId === 'close_tk') {
        await i.reply('🔒 Cerrando ticket en **5 segundos**...');
        setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
});

client.once('ready', () => console.log('✅ Power Lucky Online con Mute y Tickets corregidos'));
const app = express();
app.get('/', (req, res) => res.send('Bot Online'));
app.listen(10000);
client.login(process.env.TOKEN);
