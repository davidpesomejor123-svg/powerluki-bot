import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import {
  Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, 
  ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, REST, Routes, SlashCommandBuilder
} from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── CONFIGURACIÓN Y URLS ───────── */
const PREFIJO = '!';
const ROLES_TICKETS = ['Owner', 'Co-Owner', 'Admin', 'Mod', 'Staff'];
const TICKET_CHANNEL_NAME = '『📖』tickets';

const PANEL_TICKET_IMAGEN = 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png';
const TICKET_INTERIOR_IMAGEN = 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg';
const BIENVENIDA_IMAGEN = 'https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg';
const NUEVO_FINAL_IMAGEN = 'https://i.postimg.cc/fLshS3LC/1766642720441.jpg';
const ANUNCIO_FINAL_IMAGEN = 'https://i.postimg.cc/gJmfkfSq/1766642331426.jpg';

/* ───────── BASE DE DATOS ───────── */
const cargarDB = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
let levels = cargarDB('./levels.json', { users: {} });
let invitesDB = cargarDB('./invites.json', {});
const guildInvites = new Map();

setInterval(() => {
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
  fs.writeFileSync('./invites.json', JSON.stringify(invitesDB, null, 2));
}, 30000);

/* ───────── EVENTO READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);

  // Panel Principal Estilo HyMagic
  const canal = client.channels.cache.find(c => c.name === TICKET_CHANNEL_NAME);
  if (canal) {
    const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    if (msgs && !msgs.some(m => m.author.id === client.user.id)) {
      const embedPowerLuki = new EmbedBuilder()
        .setColor('#0099ff')
        .setDescription(
          `⚙️ **Soporte:** Ayuda general o asistencia\n` +
          `⚠️ **Reportes:** Bugs, errores o problemas\n` +
          `‼️ **Otros:** Diferentes categorías\n` +
          `🛒 **Compras:** Dudas sobre artículos\n\n` +
          `💠 *No abras ticket innecesariamente*`
        )
        .setImage(PANEL_TICKET_IMAGEN)
        .setFooter({ text: 'Power Luki Support | Ticket', iconURL: client.user.displayAvatarURL() });

      const fila1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('crear_ticket_soporte').setLabel('Support').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
        new ButtonBuilder().setCustomId('crear_ticket_reportes').setLabel('Reports').setStyle(ButtonStyle.Secondary).setEmoji('⚠️')
      );

      const fila2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('crear_ticket_otros').setLabel('Others').setStyle(ButtonStyle.Danger).setEmoji('‼️'),
        new ButtonBuilder().setCustomId('crear_ticket_compras').setLabel('Purchase').setStyle(ButtonStyle.Success).setEmoji('🛒')
      );

      await canal.send({ embeds: [embedPowerLuki], components: [fila1, fila2] });
    }
  }

  client.guilds.cache.forEach(async g => {
    const invs = await g.invites.fetch().catch(() => null);
    if (invs) guildInvites.set(g.id, new Map(invs.map(i => [i.code, i.uses])));
  });
});

/* ───────── INTERACCIONES ───────── */
client.on('interactionCreate', async i => {
  try {
    if (i.isButton() && i.customId.startsWith('crear_ticket_')) {
      const tipo = i.customId.split('_')[2];
      let titulo = '', labelPregunta = '';

      switch(tipo) {
        case 'soporte': titulo = 'Soporte General'; labelPregunta = '¿En qué podemos ayudarte?'; break;
        case 'reportes': titulo = 'Reporte de Fallos'; labelPregunta = 'Detalla el error o bug:'; break;
        case 'otros': titulo = 'Otras Consultas'; labelPregunta = 'Motivo del ticket:'; break;
        case 'compras': titulo = 'Asistencia Compras'; labelPregunta = 'Duda sobre tu compra:'; break;
      }

      const modal = new ModalBuilder().setCustomId(`modal_tk_${tipo}`).setTitle(titulo);
      const nickInput = new TextInputBuilder().setCustomId('nick').setLabel('Tu nick en el juego').setStyle(TextInputStyle.Short).setRequired(true);
      const descInput = new TextInputBuilder().setCustomId('desc').setLabel(labelPregunta).setStyle(TextInputStyle.Paragraph).setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(nickInput), new ActionRowBuilder().addComponents(descInput));
      return await i.showModal(modal); // Solución error 40060
    }

    if (i.type === InteractionType.ModalSubmit && i.customId.startsWith('modal_tk_')) {
      const tipo = i.customId.split('_')[2];
      const nick = i.fields.getTextInputValue('nick');
      const desc = i.fields.getTextInputValue('desc');

      await i.deferReply({ ephemeral: true });

      const canal = await i.guild.channels.create({
        name: `ticket-${i.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          ...ROLES_TICKETS.map(r => {
            const role = i.guild.roles.cache.find(role => role.name === r);
            return role ? { id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] } : null;
          }).filter(Boolean)
        ]
      });

      const embed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('SOPORTE DISCORD') // Estilo Nautic
        .setDescription(
          `¡Hola ${i.user}! Bienvenido al soporte de **Power Luki Network**\n\n` +
          `Nuestro staff le responderá en un plazo de 12 a 24 horas aproximadamente. **Por favor, sea paciente.**\n` +
          `──────────────────────────────\n` +
          `**Nick:** ${nick}\n` +
          `**Problema:** ${desc}\n` +
          `──────────────────────────────\n` +
          `* • ¡Gracias por confiar en nosotros! • *`
        )
        .setImage(TICKET_INTERIOR_IMAGEN);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cerrar').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔺'),
        new ButtonBuilder().setCustomId('reclamar').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('🎫')
      );

      await canal.send({ content: `${i.user} | @Power Luki Staff`, embeds: [embed], components: [row] });
      return await i.editReply({ content: `✅ Ticket creado: ${canal}` });
    }

    if (i.isButton() && ['reclamar', 'cerrar'].includes(i.customId)) {
      const esStaff = ROLES_TICKETS.some(r => i.member.roles.cache.some(role => role.name === r));
      if (!esStaff) return i.reply({ content: '❌ Solo el Staff puede usar esto.', ephemeral: true });

      if (i.customId === 'reclamar') {
        await i.channel.setName(`✅-${i.user.username}`);
        return i.reply(`👋 El Staff **${i.user.username}** se ha hecho cargo del ticket.`);
      }

      if (i.customId === 'cerrar') {
        await i.reply('🔒 Cerrando ticket en 5 segundos...');
        setTimeout(() => i.channel.delete().catch(() => {}), 5000);
      }
    }
  } catch (error) {
    console.error('Error en interacción:', error);
  }
});

/* ───────── COMANDOS Y BIENVENIDAS ───────── */
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIJO)) return;
  const args = msg.content.slice(PREFIJO.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  if (!['anuncio', 'nuevo'].includes(command)) return;
  if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const isAnuncio = command === 'anuncio';
  const canal = msg.guild.channels.cache.find(c => c.name === (isAnuncio ? '『📣』anuncios' : '『🎊』nuevo'));
  if (!canal) return;

  const imgFinal = isAnuncio ? ANUNCIO_FINAL_IMAGEN : NUEVO_FINAL_IMAGEN;
  const texto = args.filter(a => !a.startsWith('http')).join(' ') || '...';
  const imgs = args.filter(a => a.startsWith('http'));

  const embed = new EmbedBuilder()
    .setColor(isAnuncio ? '#FFCC00' : '#00FF00')
    .setTitle(isAnuncio ? '📢 ANUNCIO OFICIAL' : '✨ NUEVA NOVEDAD')
    .setDescription(texto)
    .setImage(imgs[0] || imgFinal);

  await canal.send({ content: isAnuncio ? '@everyone' : '', embeds: [embed] });
  if (imgs.length === 0 || imgs[0] !== imgFinal) {
    await canal.send({ embeds: [new EmbedBuilder().setImage(imgFinal).setColor(embed.data.color)] });
  }
  msg.delete().catch(() => {});
});

client.on('guildMemberAdd', async m => {
  const ch = m.guild.channels.cache.find(c => c.name.includes('bienvenidos'));
  if (!ch) return;
  const invs = await m.guild.invites.fetch().catch(() => null);
  const old = guildInvites.get(m.guild.id);
  let inviter = 'Desconocido', count = 0;
  if (invs && old) {
    const invite = invs.find(i => i.uses > (old.get(i.code) || 0));
    if (invite) { 
      inviter = invite.inviter.username; 
      invitesDB[invite.inviter.id] = (invitesDB[invite.inviter.id] || 0) + 1; 
      count = invitesDB[invite.inviter.id]; 
    }
    guildInvites.set(m.guild.id, new Map(invs.map(i => [i.code, i.uses])));
  }
  const embed = new EmbedBuilder().setColor('#00E5FF').setTitle('✨ BIENVENIDO').setDescription(`👤 **${m.user.username}**\n🔗 Invitado por: **${inviter}** (${count} invs)`).setImage(BIENVENIDA_IMAGEN);
  ch.send({ embeds: [embed] });
});

/* ───────── WEB SERVER ───────── */
const app = express();
app.get('/', (r, s) => s.send('Power Luki ✅'));
app.listen(process.env.PORT || 10000, () => client.login(process.env.TOKEN));
