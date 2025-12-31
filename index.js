import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import {
  Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, 
  ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, REST, Routes
} from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* --- CONFIGURACIÓN --- */
const PREFIJO = '!';
const ROLES_STAFF = ['Owner', 'Admin', 'Mod', 'Staff'];
const CANAL_TICKETS = '『📖』tickets';

const IMG_PANEL = 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png';
const IMG_TICKET = 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg';

/* --- BOT PREPARADO --- */
client.once('ready', async () => {
  console.log(`✅ Bot conectado como: ${client.user.tag}`);
  
  const canal = client.channels.cache.find(c => c.name === CANAL_TICKETS);
  if (canal) {
    const msgs = await canal.messages.fetch({ limit: 5 }).catch(() => null);
    if (msgs && !msgs.some(m => m.author.id === client.user.id)) {
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('SOPORTE POWER LUKI')
        .setDescription('Selecciona una categoría para abrir un ticket.\n\n⚙️ Soporte | ⚠️ Reportes\n‼️ Otros | 🛒 Compras')
        .setImage(IMG_PANEL);

      const fila1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_soporte').setLabel('Soporte').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
        new ButtonBuilder().setCustomId('btn_reportes').setLabel('Reportes').setStyle(ButtonStyle.Secondary).setEmoji('⚠️')
      );
      const fila2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_otros').setLabel('Otros').setStyle(ButtonStyle.Danger).setEmoji('‼️'),
        new ButtonBuilder().setCustomId('btn_compras').setLabel('Compras').setStyle(ButtonStyle.Success).setEmoji('🛒')
      );
      await canal.send({ embeds: [embed], components: [fila1, fila2] });
    }
  }
});

/* --- GESTIÓN DE INTERACCIONES --- */
client.on('interactionCreate', async i => {
  try {
    // 1. ABRIR EL FORMULARIO (MODAL)
    if (i.isButton() && i.customId.startsWith('btn_')) {
      const tipo = i.customId.split('_')[1];
      
      // TEXTOS MUY CORTOS PARA EVITAR ERROR DE 45 CARACTERES
      const modal = new ModalBuilder().setCustomId(`md_${tipo}`).setTitle('Crear Ticket');
      
      const inputNick = new TextInputBuilder()
        .setCustomId('nick').setLabel('Tu Nick en el juego').setStyle(TextInputStyle.Short).setRequired(true);
      
      const inputDesc = new TextInputBuilder()
        .setCustomId('desc').setLabel('Describe tu problema brevemente').setStyle(TextInputStyle.Paragraph).setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputNick),
        new ActionRowBuilder().addComponents(inputDesc)
      );

      return await i.showModal(modal); // RESPUESTA ÚNICA
    }

    // 2. PROCESAR EL FORMULARIO ENVIADO
    if (i.type === InteractionType.ModalSubmit) {
      // Diferimos la respuesta para evitar timeout en Render
      await i.deferReply({ ephemeral: true });

      const nick = i.fields.getTextInputValue('nick');
      const desc = i.fields.getTextInputValue('desc');
      const tipo = i.customId.split('_')[1];

      const canal = await i.guild.channels.create({
        name: `ticket-${i.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          ...ROLES_STAFF.map(r => {
            const role = i.guild.roles.cache.find(role => role.name === r);
            return role ? { id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] } : null;
          }).filter(Boolean)
        ]
      });

      const embedNautic = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('SOPORTE DISCORD')
        .setDescription(`¡Hola ${i.user}!\n\n**Nick:** ${nick}\n**Problema:** ${desc}\n\nEspere a que un Staff le atienda.`)
        .setImage(IMG_TICKET);

      const btns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cerrar_tk').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('reclamar_tk').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('🎫')
      );

      await canal.send({ content: `${i.user} | @Staff`, embeds: [embedNautic], components: [btns] });
      return await i.editReply({ content: `✅ Ticket creado: ${canal}` });
    }

    // 3. BOTONES DE CONTROL (CERRAR/RECLAMAR)
    if (i.isButton() && (i.customId === 'cerrar_tk' || i.customId === 'reclamar_tk')) {
      const esStaff = ROLES_STAFF.some(r => i.member.roles.cache.some(role => role.name === r));
      if (!esStaff) return i.reply({ content: '❌ Solo Staff.', ephemeral: true });

      if (i.customId === 'reclamar_tk') {
        await i.channel.setName(`✅-${i.user.username}`);
        return i.reply(`👋 El Staff **${i.user.username}** te ayudará.`);
      }
      if (i.customId === 'cerrar_tk') {
        await i.reply('🔒 Cerrando en 5 segundos...');
        setTimeout(() => i.channel.delete().catch(() => {}), 5000);
      }
    }

  } catch (err) {
    console.error("Error en interacción:", err);
  }
});

/* --- WEB SERVER --- */
const app = express();
app.get('/', (req, res) => res.send('Bot Online ✅'));
app.listen(process.env.PORT || 10000, () => client.login(process.env.TOKEN));
