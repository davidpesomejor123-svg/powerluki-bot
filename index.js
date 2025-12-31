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

/* ───────── CONFIGURACIÓN POWER LUKI ───────── */
const PREFIJO = '!';
const ROLES_TICKETS = ['Owner', 'Co-Owner', 'Admin', 'Mod', 'Staff'];
const TICKET_CHANNEL_NAME = '『📖』tickets';

// Imágenes
const PANEL_TICKET_IMAGEN = 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png';
const TICKET_INTERIOR_IMAGEN = 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg';
const BIENVENIDA_IMAGEN = 'https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg';
const ANUNCIO_FINAL_IMAGEN = 'https://i.postimg.cc/gJmfkfSq/1766642331426.jpg';

/* ───────── BASE DE DATOS ───────── */
const cargarDB = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
let invitesDB = cargarDB('./invites.json', {});
const guildInvites = new Map();

/* ───────── EVENTO READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);

  // Panel Principal (Estilo HyMagic)
  const canal = client.channels.cache.find(c => c.name === TICKET_CHANNEL_NAME);
  if (canal) {
    const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    if (msgs && !msgs.some(m => m.author.id === client.user.id)) {
      const embedPanel = new EmbedBuilder()
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
        new ButtonBuilder().setCustomId('tk_soporte').setLabel('Support').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
        new ButtonBuilder().setCustomId('tk_reportes').setLabel('Reports').setStyle(ButtonStyle.Secondary).setEmoji('⚠️')
      );
      const fila2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk_otros').setLabel('Others').setStyle(ButtonStyle.Danger).setEmoji('‼️'),
        new ButtonBuilder().setCustomId('tk_compras').setLabel('Purchase').setStyle(ButtonStyle.Success).setEmoji('🛒')
      );
      await canal.send({ embeds: [embedPanel], components: [fila1, fila2] });
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
    // 1. Mostrar Modals (Formularios)
    if (i.isButton() && i.customId.startsWith('tk_')) {
      const tipo = i.customId.split('_')[1];
      let titulo = 'Ticket de Ayuda', label = 'Describe tu problema:';

      // TEXTOS CORTOS (< 45 chars) para evitar error 1000077744.jpg
      if (tipo === 'soporte') { titulo = 'Soporte'; label = '¿Cómo te ayudamos?'; }
      if (tipo === 'reportes') { titulo = 'Reporte'; label = 'Detalla el error o bug:'; }
      if (tipo === 'otros') { titulo = 'Otros'; label = 'Escribe tu consulta:'; }
      if (tipo === 'compras') { titulo = 'Compras'; label = 'Duda sobre tu compra:'; }

      const modal = new ModalBuilder().setCustomId(`modal_${tipo}`).setTitle(titulo);
      const nickIn = new TextInputBuilder().setCustomId('n').setLabel('Tu nick').setStyle(TextInputStyle.Short).setRequired(true);
      const descIn = new TextInputBuilder().setCustomId('d').setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(nickIn), new ActionRowBuilder().addComponents(descIn));
      return await i.showModal(modal); // No usar reply antes de showModal
    }

    // 2. Crear Ticket tras Modal
    if (i.isModalSubmit()) {
      await i.deferReply({ ephemeral: true });
      const tipo = i.customId.split('_')[1];
      const nick = i.fields.getTextInputValue('n');
      const desc = i.fields.getTextInputValue('d');

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

      const embedNautic = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('SOPORTE DISCORD') // Estilo Nautic
        .setDescription(
          `¡Hola ${i.user}! Bienvenido al soporte de **Power Luki Network**\n\n` +
          `Nuestro staff le responderá en un plazo de 12 a 24 horas. **Por favor, sea paciente.**\n` +
          `──────────────────────────────\n` +
          `**Nick:** ${nick}\n` +
          `**Problema:** ${desc}\n` +
          `──────────────────────────────\n` +
          `* • ¡Gracias por confiar en nosotros! • *`
        )
        .setImage(TICKET_INTERIOR_IMAGEN);

      const btns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cerrar').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔺'),
        new ButtonBuilder().setCustomId('reclamar').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('🎫')
      );

      await canal.send({ content: `${i.user} | @Power Luki Staff`, embeds: [embedNautic], components: [btns] });
      return await i.editReply({ content: `✅ Ticket creado: ${canal}` });
    }

    // 3. Botones Reclamar/Cerrar
    if (i.isButton() && (i.customId === 'reclamar' || i.customId === 'cerrar')) {
      const esStaff = ROLES_TICKETS.some(r => i.member.roles.cache.some(role => role.name === r));
      if (!esStaff) return i.reply({ content: '❌ Solo staff.', ephemeral: true });

      if (i.customId === 'reclamar') {
        await i.channel.setName(`✅-${i.user.username}`);
        return i.reply(`👋 El Staff **${i.user.username}** te atenderá.`);
      }
      if (i.customId === 'cerrar') {
        await i.reply('🔒 Cerrando ticket en 5 segundos...');
        setTimeout(() => i.channel.delete().catch(() => {}), 5000);
      }
    }
  } catch (e) { console.error('Error:', e); }
});

/* ───────── ANUNCIOS Y BIENVENIDAS ───────── */
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIJO)) return;
  const args = msg.content.slice(PREFIJO.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  if (!['anuncio', 'nuevo'].includes(command) || !msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const canal = msg.guild.channels.cache.find(c => c.name.includes(command === 'anuncio' ? 'anuncios' : 'nuevo'));
  if (!canal) return;

  const texto = args.filter(a => !a.startsWith('http')).join(' ') || '...';
  const embed = new EmbedBuilder()
    .setColor(command === 'anuncio' ? '#FFCC00' : '#00FF00')
    .setTitle(command === 'anuncio' ? '📢 ANUNCIO OFICIAL' : '✨ NUEVA NOVEDAD')
    .setDescription(texto)
    .setImage(args.find(a => a.startsWith('http')) || ANUNCIO_FINAL_IMAGEN);

  await canal.send({ content: command === 'anuncio' ? '@everyone' : '', embeds: [embed] });
  msg.delete().catch(() => {});
});

client.on('guildMemberAdd', async m => {
  const ch = m.guild.channels.cache.find(c => c.name.includes('bienvenidos'));
  if (!ch) return;
  const embed = new EmbedBuilder().setColor('#00E5FF').setTitle('✨ BIENVENIDO').setDescription(`👤 **${m.user.username}**\n¡Disfruta tu estancia!`).setImage(BIENVENIDA_IMAGEN);
  ch.send({ embeds: [embed] });
});

/* ───────── WEB SERVER (RENDER) ───────── */
const app = express();
app.get('/', (r, s) => s.send('Power Luki ✅'));
app.listen(process.env.PORT || 10000, () => client.login(process.env.TOKEN));
