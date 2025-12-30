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

// --- COMANDO MUTE MANUAL ---
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
            default: return message.reply("❌ Formato inválido (s, m, M, a).");
        }

        try {
            await target.timeout(timeInMs, reason);
            const logMute = message.guild.channels.cache.find(ch => ch.name.includes('silenciados'));
            if (logMute) {
                const muteEmbed = new EmbedBuilder().setColor('#FF0000').setTitle('🚫 Mute').addFields(
                    { name: '👤 Usuario', value: `${target}`, inline: true },
                    { name: '⏳ Tiempo', value: timeInput, inline: true }
                );
                logMute.send({ embeds: [muteEmbed] });
            }
            message.reply(`✅ **${target.user.tag}** silenciado.`);
        } catch (err) { message.reply("❌ Error al silenciar."); }
    }
});

// --- COMANDOS DE ANUNCIOS ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const rolesStaff = ["Staff", "Admin", "Co-Owner", "Manager", "Mod"];
    const tienePermiso = message.member.roles.cache.some(r => rolesStaff.includes(r.name)) || message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (command === 'anuncio' || command === 'nuevo') {
        if (!tienePermiso) return message.reply("❌ No tienes permiso (Staff/Admin) para usar esto.");

        const texto = args.join(" ");
        if (!texto) return message.reply("Escribe el mensaje del anuncio.");

        const archivosAdjuntos = message.attachments.map(a => a.url);
        
        let nombreCanal = command === 'anuncio' ? 'anuncios' : 'nuevo';
        let color = command === 'anuncio' ? '#0099FF' : '#FFD700';
        let titulo = command === 'anuncio' ? '📢 ANUNCIO OFICIAL' : '🎊 ¡LO NUEVO!';
        let imagenUrl = command === 'anuncio' ? 'https://i.postimg.cc/hGM42zmj/1766642331426.jpg' : 'https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg';
        let footer = command === 'anuncio' ? 'Power Lucky Network' : 'Power Lucky Updates';

        const canal = message.guild.channels.cache.find(ch => ch.name.includes(nombreCanal));
        if (!canal) return message.reply(`No encontré el canal de ${nombreCanal}.`);

        try {
            if (archivosAdjuntos.length > 0) {
                await canal.send({ content: `**Fotos adjuntas de ${message.author.username}:**`, files: archivosAdjuntos });
            }

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(titulo)
                .setDescription(texto)
                .setImage(imagenUrl)
                .setFooter({ text: footer })
                .setTimestamp();

            await canal.send({ content: '|| @everyone ||', embeds: [embed] });
            message.reply("✅ Anuncio enviado correctamente.");
            message.delete().catch(() => {});
        } catch (e) {
            console.error(e);
            message.reply("Hubo un error al enviar el anuncio.");
        }
    }
});

// --- SISTEMA DE TICKETS (ESTILO NAUTICMC Y PERMISOS STAFF) ---
client.on('interactionCreate', async i => {
    if (!i.isButton()) return;

    if (i.customId.startsWith('ticket_')) {
        const rolesStaffNames = ["Staff", "Manager", "Mod", "Admin", "Co-Owner"];
        const staffRoles = i.guild.roles.cache.filter(role => rolesStaffNames.includes(role.name));

        const overwrites = [
            { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] }
        ];

        staffRoles.forEach(role => {
            overwrites.push({
                id: role.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels]
            });
        });

        const ch = await i.guild.channels.create({
            name: `🎫-${i.user.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: overwrites
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_tk').setLabel('Cerrar Ticket').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('claim_tk').setLabel('Reclamar').setEmoji('🏷️').setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('SOPORTE DISCORD')
            .setDescription(
                `¡Hola <@${i.user.id}>! Bienvenido al soporte de **Power Luki**\n\n` +
                `Nuestro staff le responderá en un plazo de 12 a 24 horas aproximadamente. **Por favor, sea paciente.**\n` +
                `──────────────────────────────────\n` +
                `**¿Cuál es tu nick de usuario?:**\n` +
                `*(Escribe tu nombre aquí)*\n\n` +
                `**Describe tu problema:**\n` +
                `*(Explica detalladamente tu consulta)*\n` +
                `──────────────────────────────────\n` +
                `• ¡Gracias por confiar en nosotros! •`
            )
            .setImage('https://i.postimg.cc/kM8FLgdV/Whats-App-Image-2025-12-30-at-4-31-26-PM.jpg');

        await ch.send({ content: `<@${i.user.id}> | @here`, embeds: [embed], components: [row] });
        i.reply({ content: `✅ Ticket abierto en ${ch}`, ephemeral: true });
    }

    if (i.customId === 'claim_tk') {
        const rolesStaff = ["Staff", "Admin", "Co-Owner", "Manager", "Mod"];
        if (!i.member.roles.cache.some(r => rolesStaff.includes(r.name))) {
            return i.reply({ content: '❌ Solo el Staff puede reclamar este ticket.', ephemeral: true });
        }
        i.reply({ content: `👋 El Staff **${i.user.username}** ha tomado tu caso y te ayudará en breve.` });
    }

    if (i.customId === 'close_tk') {
        await i.reply('🔒 El ticket se cerrará en 5 segundos...');
        setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
});

// --- READY ---
client.once('ready', async () => {
    console.log('✅ Power Lucky Online');
    
    const ticketChannel = client.channels.cache.find(ch => ch.name.includes('tickets'));
    if (ticketChannel) {
        const messages = await ticketChannel.messages.fetch({ limit: 50 }).catch(() => null);
        const botPanel = messages?.find(m => m.author.id === client.user.id && m.embeds.length > 0);

        if (!botPanel) {
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🎫 PANEL DE SOPORTE')
                .setDescription('Selecciona una categoría para abrir un ticket de atención.\n\n⚙️ **Soporte:** Ayuda general\n⚠️ **Reportes:** Jugadores o Bugs\n‼️ **Otros:** Dudas varias\n🛒 **Compras:** Problemas con la tienda')
                .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png')
                .setFooter({ text: 'Power Lucky Network | Sistema de Soporte' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_support').setLabel('Soporte').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_reports').setLabel('Reportes').setEmoji('⚠️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_others').setLabel('Otros').setEmoji('‼️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_purchase').setLabel('Compras').setEmoji('🛒').setStyle(ButtonStyle.Success)
            );

            await ticketChannel.send({ embeds: [embed], components: [row] });
            console.log("🎫 Nuevo panel de tickets enviado.");
        }
    }
});

// --- SERVIDOR WEB (FIX PARA RENDER Y UPTIME) ---
const app = express();
app.get('/', (req, res) => res.send('Power Lucky Bot Online ✅'));

const port = process.env.PORT || 10000;
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Monitoreo web activo en el puerto ${port}`);
});

// LOGIN FINAL
client.login(process.env.TOKEN).catch(err => console.error("Error Login:", err));
