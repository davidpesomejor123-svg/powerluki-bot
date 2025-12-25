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

  const now = Date.now();
  const userData = msgCooldown.get(userId) || { count: 0, lastMsg: now };
  if (now - userData.lastMsg < 5000) userData.count++;
  else userData.count = 1;
  userData.lastMsg = now;
  msgCooldown.set(userId, userData);

  if (userData.count > 5 && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    try {
        await message.member.timeout(300000, "Spam detectado");
        const logMute = message.guild.channels.cache.find(ch => ch.name.includes('silenciados'));
        if (logMute) logMute.send(`🛡️ ${message.author} ha sido silenciado **5 minutos** por Spam.`);
        return;
    } catch (e) { console.log("Error en auto-mute spam"); }
  }

  if (!levels.users[userId]) levels.users[userId] = { xp: 0, level: 1 };
  if (levels.users[userId].level < 999) {
    levels.users[userId].xp += Math.floor(Math.random() * 10) + 15;
    const xpNeeded = levels.users[userId].level * 150;

    if (levels.users[userId].xp >= xpNeeded) {
      levels.users[userId].level++;
      levels.users[userId].xp = 0;
      const lvCh = message.guild.channels.cache.find(c => c.name.includes('niveles'));
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

// --- COMANDO MUTE ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'mute') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
        
        const target = message.mentions.members.first();
        const timeInput = args[1];
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
            const logMute = message.guild.channels.cache.find(ch => ch.name.includes('silenciados'));
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
            target.send(`⚠️ Has sido silenciado en **Power Lucky**. Razón: ${reason}.`).catch(() => {});

            setTimeout(async () => {
                const logUnmute = message.guild.channels.cache.find(c => c.name.includes('desilenciados'));
                if (logUnmute) logUnmute.send(`🔊 El usuario **${target.user.tag}** ha sido desilenciado automáticamente.`);
            }, timeInMs);
        } catch (err) {
            message.reply("❌ No pude silenciar al usuario.");
        }
    }
});

// --- SISTEMA DE TICKETS (INTERACCIONES) ---
client.on('interactionCreate', async i => {
    if (!i.isButton()) return;

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

    if (i.customId === 'claim_tk') {
        if (!i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return i.reply({ content: '❌ Solo Staff.', ephemeral: true });
        i.reply({ content: `🎟️ Ticket reclamado por **${i.user.tag}**` });
    }

    if (i.customId === 'close_tk') {
        await i.reply('🔒 Cerrando ticket en **5 segundos**...');
        setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
});

// --- FUNCIÓN DE AUTO-ENVÍO AL INICIAR ---
client.once('ready', async () => {
    console.log('✅ Power Lucky Online');

    // Esperar 3 segundos para asegurar que los canales carguen bien
    setTimeout(async () => {
        // Busca el canal que contenga "tickets" en su nombre
        const ticketChannel = client.channels.cache.find(ch => ch.name.includes('tickets'));

        if (ticketChannel) {
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setDescription(
                    '⚙️ **Soporte:** Ayuda general o asistencia en el servidor\n' +
                    '⚠️ **Reportes:** Bugs, errores o problemas en el servidor\n' +
                    '‼️ **Otros:** Diferentes categorías\n' +
                    '🛒 **Compras:** Dudas sobre artículos o servicios\n\n' +
                    '💠 *no abrir ticket innecesariamente*\n' +
                    '💠'
                )
                .setImage('https://i.imgur.com/eBf72X4.png')
                .setFooter({ text: 'Power Lucky Support | Ticket' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_support').setLabel('Support').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_reports').setLabel('Reports').setEmoji('⚠️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_others').setLabel('Others').setEmoji('‼️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_purchase').setLabel('Purchase').setEmoji('🛒').setStyle(ButtonStyle.Success)
            );

            // Intentar enviar el mensaje
            try {
                await ticketChannel.send({ embeds: [embed], components: [row] });
                console.log(`🎫 Panel enviado a #${ticketChannel.name}`);
            } catch (error) {
                console.log(`❌ Error al enviar mensaje: Revisa si el bot tiene permisos en #${ticketChannel.name}`);
            }
        } else {
            console.log('❌ No encontré ningún canal con la palabra "tickets" en el nombre.');
        }
    }, 3000);
});

const app = express();
app.get('/', (req, res) => res.send('Bot Online'));
app.listen(10000);
client.login(process.env.TOKEN);
