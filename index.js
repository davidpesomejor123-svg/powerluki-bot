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

  // Anti-Spam (Mute automático 5m)
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

  // Niveles hasta 999
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

// --- COMANDOS DE ANUNCIOS CON SPOILER ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    if (message.content.startsWith('!anuncio')) {
        const texto = message.content.slice('!anuncio'.length).trim();
        if (!texto) return message.reply("Escribe el mensaje.");
        const canal = message.guild.channels.cache.find(ch => ch.name.includes('anuncios'));
        const embed = new EmbedBuilder().setColor('#0099FF').setTitle('📢 ANUNCIO OFICIAL').setDescription(texto).setImage('https://i.postimg.cc/hGM42zmj/1766642331426.jpg').setFooter({ text: 'Power Lucky Network' }).setTimestamp();
        if (canal) {
            await canal.send({ content: '|| @everyone ||', embeds: [embed] });
            message.reply("✅ Enviado.");
        }
    }

    if (message.content.startsWith('!nuevo')) {
        const texto = message.content.slice('!nuevo'.length).trim();
        if (!texto) return message.reply("Escribe la novedad.");
        const canal = message.guild.channels.cache.find(ch => ch.name.includes('nuevo'));
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🎊 ¡LO NUEVO!').setDescription(texto).setImage('https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg').setFooter({ text: 'Power Lucky Updates' }).setTimestamp();
        if (canal) {
            await canal.send({ content: '|| @everyone ||', embeds: [embed] });
            message.reply("✅ Enviado.");
        }
    }
});

// --- SISTEMA DE TICKETS (Interacciones) ---
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
        const embed = new EmbedBuilder().setColor('#00BFFF').setTitle(`🎫 Ticket: ${cat.toUpperCase()}`).setDescription(`Hola ${i.user}, el Staff te atenderá.`);
        await ch.send({ embeds: [embed], components: [row] });
        i.reply({ content: `✅ Ticket abierto: ${ch}`, ephemeral: true });
    }
    if (i.customId === 'claim_tk') {
        if (!i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return i.reply({ content: '❌ Solo Staff.', ephemeral: true });
        i.reply({ content: `🎟️ Reclamado por **${i.user.tag}**` });
    }
    if (i.customId === 'close_tk') {
        await i.reply('🔒 Cerrando en 5s...');
        setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
});

// --- READY: EVITAR DUPLICADO DE TICKETS ---
client.once('ready', async () => {
    console.log('✅ Power Lucky Online');
    
    const ticketChannel = client.channels.cache.find(ch => ch.name.includes('tickets'));
    if (ticketChannel) {
        // Buscamos si ya hay un mensaje del bot en el canal de tickets
        const messages = await ticketChannel.messages.fetch({ limit: 50 });
        const botPanel = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);

        if (!botPanel) {
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setDescription('⚙️ **Soporte:** Ayuda general\n⚠️ **Reportes:** Bugs\n‼️ **Otros:** Categorías\n🛒 **Compras:** Dudas')
                .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png')
                .setFooter({ text: 'Power Lucky Support' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_support').setLabel('Soporte').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_reports').setLabel('Reportes').setEmoji('⚠️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_others').setLabel('Otros').setEmoji('‼️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_purchase').setLabel('Compras').setEmoji('🛒').setStyle(ButtonStyle.Success)
            );

            await ticketChannel.send({ embeds: [embed], components: [row] });
            console.log("🎫 Nuevo panel de tickets enviado.");
        } else {
            console.log("🎫 El panel de tickets ya existe. No se envió duplicado.");
        }
    }
});

const app = express();
app.get('/', (req, res) => res.send('Bot Online'));
app.listen(10000);
client.login(process.env.TOKEN);
