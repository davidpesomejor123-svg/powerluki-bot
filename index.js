import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import {
  Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  REST, Routes, SlashCommandBuilder
} from 'discord.js';

/* ───────── CLIENTE ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── CONFIGURACIÓN ───────── */
const PREFIJO = '!';
const ROLES_TICKETS = ['Owner', 'Co-Owner', 'Admin', 'Mod', 'Staff'];
const TICKET_CHANNEL_NAME = '『📖』tickets';

const PANEL_TICKET_IMAGEN = 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png';
const TICKET_INTERIOR_IMAGEN = 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg';
const BIENVENIDA_IMAGEN = 'https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg';
const NUEVO_FINAL_IMAGEN = 'https://i.postimg.cc/fLshS3LC/1766642720441.jpg';
const ANUNCIO_FINAL_IMAGEN = 'https://i.postimg.cc/gJmfkfSq/1766642331426.jpg';

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);

  const canal = client.channels.cache.find(c => c.name === TICKET_CHANNEL_NAME);
  if (canal) {
    const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    if (!msgs || msgs.some(m => m.author.id === client.user.id)) return;

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setDescription(
        `⚙️ **Soporte:** Ayuda general\n` +
        `⚠️ **Reportes:** Bugs o errores\n` +
        `‼️ **Otros:** Consultas varias\n` +
        `🛒 **Compras:** Tienda y servicios\n\n` +
        `💠 *No abras tickets innecesarios*`
      )
      .setImage(PANEL_TICKET_IMAGEN)
      .setFooter({ text: 'Power Luki Support', iconURL: client.user.displayAvatarURL() });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('crear_ticket_soporte').setLabel('Soporte').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
      new ButtonBuilder().setCustomId('crear_ticket_reportes').setLabel('Reportes').setStyle(ButtonStyle.Secondary).setEmoji('⚠️')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('crear_ticket_otros').setLabel('Otros').setStyle(ButtonStyle.Danger).setEmoji('‼️'),
      new ButtonBuilder().setCustomId('crear_ticket_compras').setLabel('Compras').setStyle(ButtonStyle.Success).setEmoji('🛒')
    );

    await canal.send({ embeds: [embed], components: [row1, row2] });
  }
});

/* ───────── INTERACCIONES ───────── */
client.on('interactionCreate', async i => {
  try {

    /* ── BOTONES DE CREAR TICKET ── */
    if (i.isButton() && i.customId.startsWith('crear_ticket_')) {
      const tipo = i.customId.split('_')[2];

      const titulos = {
        soporte: 'Soporte General',
        reportes: 'Reporte de Errores',
        otros: 'Otras Consultas',
        compras: 'Asistencia de Compras'
      };

      const labels = {
        soporte: 'Describe tu problema:',
        reportes: 'Describe el bug o error:',
        otros: 'Motivo del ticket:',
        compras: 'Duda sobre la compra:'
      };

      const modal = new ModalBuilder()
        .setCustomId(`modal_ticket_${tipo}`)
        .setTitle(titulos[tipo]);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('nick')
            .setLabel('Tu nick en el juego')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('desc')
            .setLabel(labels[tipo])
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

      return i.showModal(modal);
    }

    /* ── ENVÍO DEL MODAL (ARREGLADO) ── */
    if (i.isModalSubmit() && i.customId.startsWith('modal_ticket_')) {
      await i.deferReply({ ephemeral: true });

      const tipo = i.customId.split('_')[2];
      const nick = i.fields.getTextInputValue('nick');
      const desc = i.fields.getTextInputValue('desc');

      const canal = await i.guild.channels.create({
        name: `ticket-${i.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          ...ROLES_TICKETS.map(r => {
            const role = i.guild.roles.cache.find(ro => ro.name === r);
            return role
              ? { id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
              : null;
          }).filter(Boolean)
        ]
      });

      const embed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle(`🎫 Ticket | ${tipo.toUpperCase()}`)
        .setDescription(
          `👤 **Usuario:** ${i.user}\n` +
          `🎮 **Nick:** ${nick}\n` +
          `📝 **Detalle:** ${desc}\n\n` +
          `⏳ Un staff te atenderá pronto.`
        )
        .setImage(TICKET_INTERIOR_IMAGEN);

      const botones = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('reclamar_tk').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
        new ButtonBuilder().setCustomId('cerrar_tk').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setEmoji('🔒')
      );

      await canal.send({ content: `${i.user}`, embeds: [embed], components: [botones] });
      return i.editReply({ content: `✅ Ticket creado correctamente: ${canal}` });
    }

    /* ── BOTONES STAFF ── */
    if (i.isButton() && ['reclamar_tk', 'cerrar_tk'].includes(i.customId)) {
      const esStaff = ROLES_TICKETS.some(r => i.member.roles.cache.some(role => role.name === r));
      if (!esStaff) return i.reply({ content: '❌ Solo staff.', ephemeral: true });

      if (i.customId === 'reclamar_tk') {
        await i.channel.setName(`✅-${i.user.username}`);
        return i.reply(`👋 Ticket reclamado por **${i.user.username}**`);
      }

      if (i.customId === 'cerrar_tk') {
        await i.reply('🔒 Cerrando ticket...');
        setTimeout(() => i.channel.delete().catch(() => {}), 4000);
      }
    }

  } catch (e) {
    console.error('Error en interacción:', e);
  }
});

/* ───────── WEB SERVER ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Luki Bot Online ✅'));
app.listen(process.env.PORT || 10000, () => client.login(process.env.TOKEN));
