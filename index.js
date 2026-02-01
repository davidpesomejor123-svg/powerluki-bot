// index.js  (versión revisada y lista para Render)
// Requiere: node 18+, discord.js v14, express, dotenv
import 'dotenv/config';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  ChannelType,
  SlashCommandBuilder,
  REST,
  Routes
} from 'discord.js';

/* ───────── CONFIG ───────── */
const CONFIG = {
  PREFIJO: '!',
  SERVER_IP: 'powermax.hidenmc.com',
  SERVER_PORT: '24818',
  VERSIONS: '1.13 a 1.21.11',
  CANALES: {
    TICKETS_LOG: '📖tickets',
    TICKETS_CATEGORY: 'Tickets',
    NUEVO: '🎊nuevo',
    ANUNCIOS: '📣anuncios',
    SILENCIADOS: '🔇silenciados',
    DESILENCIADOS: '🔉desilenciados',
    BANEOS: '🔨baneos',
    BIENVENIDAS: '👋bienvenidos',
    DESPEDIDAS: '😔despedidas',
    NIVELES: '🆙niveles',
    VALORACIONES: '💪valoraciones',
    STAFF_REVIEW: 'valoracion-staff'
  },
  MAIN_GUILD_ID: '1340442398442127480',
  STAFF_ROLE_ID: '1458243569075884219',
  EMOJIS: {
    TIENDA: '<:Tienda:ID>',
    IP: '<:ip:ID>',
    JAVA: '<:java:ID>',
    BEDROCK: '<:bedrock:ID>',
  }
};

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

/* ───────── MEMORIA (temporal) ───────── */
const nivelesDB = new Map();
const openTickets = new Map(); // userId -> channelId
const suggestionsDB = new Map(); // id -> { id, author, texto, messageId, channelId, status, createdAt }
let suggestionCounter = 1;

/* ───────── HELPERS ───────── */
function findChannelByName(guild, name) {
  if (!guild) return null;
  return guild.channels.cache.find(c => c.name === name);
}

async function ensureMutedRole(guild) {
  if (!guild) return null;
  let muted = guild.roles.cache.find(r => r.name === 'Muted');
  if (muted) return muted;
  muted = await guild.roles.create({ name: 'Muted', reason: 'Rol para silenciar usuarios', permissions: [] });
  guild.channels.cache.forEach(channel => {
    if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildForum) {
      channel.permissionOverwrites.edit(muted, { SendMessages: false, AddReactions: false, Speak: false }).catch(() => {});
    }
  });
  return muted;
}

function parseTimeToMs(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d+)([mhd])?$/);
  if (!m) return null;
  const amount = Number(m[1]); const unit = m[2] || 'm';
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return null;
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa' });
}

/* ───────── READY: registrar comandos y publicar panel de tickets ───────── */
client.once('ready', async () => {
  try {
    console.log(`🤖 Bot conectado como ${client.user.tag}`);

    // Registrar comandos slash (global)
    try {
      const commands = [
        new SlashCommandBuilder().setName('ticket').setDescription('Abrir un ticket privado'),
        new SlashCommandBuilder().setName('nuevo').setDescription('Enviar mensaje al canal 🎊nuevo').addStringOption(opt => opt.setName('mensaje').setDescription('Mensaje').setRequired(true)),
        new SlashCommandBuilder().setName('anuncio').setDescription('Enviar anuncio al canal 📣anuncios').addStringOption(opt => opt.setName('mensaje').setDescription('Mensaje').setRequired(true)),
        new SlashCommandBuilder().setName('mute').setDescription('Silenciar un usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)).addStringOption(o => o.setName('duracion').setDescription('Duración (10m,2h,1d)')),
        new SlashCommandBuilder().setName('unmute').setDescription('Des-silenciar').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)),
        new SlashCommandBuilder().setName('ban').setDescription('Banear un usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)).addStringOption(o => o.setName('razon').setDescription('Razón')),
        new SlashCommandBuilder().setName('temban').setDescription('Ban temporal').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)).addStringOption(o => o.setName('tiempo').setDescription('Tiempo (10m,2h)').setRequired(true)).addStringOption(o => o.setName('razon').setDescription('Razón')),
        new SlashCommandBuilder().setName('sugerencias').setDescription('Enviar sugerencia pública').addStringOption(o => o.setName('texto').setDescription('Tu sugerencia').setRequired(true)),
        new SlashCommandBuilder().setName('sugerenciaserver').setDescription('Enviar sugerencia directa al staff').addStringOption(o => o.setName('texto').setDescription('Tu sugerencia').setRequired(true)),
        new SlashCommandBuilder().setName('encuesta').setDescription('Crear encuesta (staff)').addStringOption(o => o.setName('pregunta').setDescription('Pregunta').setRequired(true))
      ].map(c => c.toJSON());

      const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log('Slash commands registrados.');
    } catch (err) {
      console.error('Error registrando comandos:', err);
    }

    // Publicar panel de tickets en canal TICKETS_LOG si no existe
    try {
      const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || client.guilds.cache.values().next().value;
      if (!guild) return;
      let panelChannel = findChannelByName(guild, CONFIG.CANALES.TICKETS_LOG);
      if (!panelChannel) {
        panelChannel = await guild.channels.create({ name: CONFIG.CANALES.TICKETS_LOG, type: ChannelType.GuildText }).catch(() => null);
      }
      if (!panelChannel) return;

      // buscar si ya existe mensaje con título "Centro de Soporte"
      const fetched = await panelChannel.messages.fetch({ limit: 50 }).catch(() => null);
      const existe = fetched && fetched.find(m => m.author?.id === client.user.id && m.embeds?.length && m.embeds[0].title?.includes('Centro de Soporte'));
      if (!existe) {
        const embed = new EmbedBuilder()
          .setTitle('🛠️ Centro de Soporte | Power Luki Network')
          .setDescription('Selecciona una opción para abrir un ticket y completa el formulario.')
          .setFooter({ text: 'Power Luki Network' });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ticket_support').setLabel('Soporte').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('open_ticket_reports').setLabel('Reportes').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('open_ticket_shop').setLabel('Tienda').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('open_ticket_other').setLabel('Otros').setStyle(ButtonStyle.Secondary)
        );
        await panelChannel.send({ embeds: [embed], components: [row] }).catch(() => { });
      }
    } catch (e) {
      console.error('Error publicando panel de tickets:', e);
    }
  } catch (e) {
    console.error('Error en ready:', e);
  }
});

/* ───────── INTERACTIONS (slashes / buttons / modals) ───────── */
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      /* /ticket */
      if (name === 'ticket') {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Usa esto en servidores.', ephemeral: true });
        if (openTickets.has(interaction.user.id)) return interaction.reply({ content: 'Ya tienes un ticket abierto.', ephemeral: true });
        const category = guild.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS_CATEGORY && c.type === ChannelType.GuildCategory);
        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${interaction.user.discriminator}`.slice(0, 90);
        const ticketChannel = await guild.channels.create({
          name: channelName, type: ChannelType.GuildText, parent: category ? category.id : undefined,
          permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        }).catch(() => null);
        if (!ticketChannel) return interaction.reply({ content: 'No se pudo crear el ticket.', ephemeral: true });
        openTickets.set(interaction.user.id, ticketChannel.id);
        const logCh = findChannelByName(guild, CONFIG.CANALES.TICKETS_LOG);
        if (logCh) logCh.send({ embeds: [new EmbedBuilder().setTitle('🎫 Nuevo Ticket').setDescription(`Usuario: ${interaction.user.tag}\nCanal: ${ticketChannel}`)] }).catch(() => { });
        await ticketChannel.send({ content: `${interaction.user} — Gracias por abrir un ticket. Un staff te atenderá.` }).catch(() => { });
        return interaction.reply({ content: `Ticket creado: ${ticketChannel}`, ephemeral: true });
      }

      /* /sugerencias => publica en valoraciones (público) */
      if (name === 'sugerencias') {
        const texto = interaction.options.getString('texto');
        const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || interaction.guild;
        if (!guild) return interaction.reply({ content: 'Servidor no encontrado.', ephemeral: true });

        let ch = findChannelByName(guild, CONFIG.CANALES.VALORACIONES);
        if (!ch) {
          ch = await guild.channels.create({
            name: CONFIG.CANALES.VALORACIONES,
            type: ChannelType.GuildText,
            permissionOverwrites: [
              { id: guild.roles.everyone, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
              { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
          }).catch(() => null);
        }
        if (!ch) return interaction.reply({ content: 'No se pudo crear/obtener canal de valoraciones.', ephemeral: true });

        const id = (suggestionCounter++).toString(36).toUpperCase();
        const embed = new EmbedBuilder().setTitle(`Sugerencia #${id}`).setDescription(texto)
          .addFields({ name: 'Autor', value: interaction.user.tag, inline: true }, { name: 'ID', value: id, inline: true })
          .setFooter({ text: `Power Lucky Network • ${formatTimestamp()}` }).setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`public_like_${id}`).setLabel('👍').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`public_dislike_${id}`).setLabel('👎').setStyle(ButtonStyle.Secondary)
        );

        const msg = await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
        suggestionsDB.set(id, { id, author: interaction.user.id, texto, messageId: msg ? msg.id : null, channelId: ch.id, status: 'pending', createdAt: Date.now() });
        return interaction.reply({ content: 'Sugerencia enviada a Valoraciones. Gracias :)', ephemeral: true });
      }

      /* /sugerenciaserver => al canal privado staff */
      if (name === 'sugerenciaserver') {
        const texto = interaction.options.getString('texto');
        const mainGuild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || interaction.guild;
        if (!mainGuild) return interaction.reply({ content: 'Servidor principal no disponible.', ephemeral: true });

        let staffCh = findChannelByName(mainGuild, CONFIG.CANALES.STAFF_REVIEW);
        if (!staffCh) {
          staffCh = await mainGuild.channels.create({
            name: CONFIG.CANALES.STAFF_REVIEW,
            type: ChannelType.GuildText,
            permissionOverwrites: [
              { id: mainGuild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
              { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }
            ]
          }).catch(() => null);
        }
        if (!staffCh) return interaction.reply({ content: 'No se pudo crear canal staff.', ephemeral: true });

        const id = (suggestionCounter++).toString(36).toUpperCase();
        const embed = new EmbedBuilder().setTitle(`Sugerencia para staff #${id}`).setDescription(texto)
          .addFields({ name: 'Autor', value: interaction.user.tag, inline: true }, { name: 'ID', value: id, inline: true })
          .setFooter({ text: `Power Lucky Network • ${formatTimestamp()}` }).setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`staff_accept_${id}`).setLabel('Aprobado').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`staff_deny_${id}`).setLabel('Desaprobado').setStyle(ButtonStyle.Danger)
        );

        const msg = await staffCh.send({ embeds: [embed], components: [row] }).catch(() => null);
        suggestionsDB.set(id, { id, author: interaction.user.id, texto, messageId: msg ? msg.id : null, channelId: staffCh.id, status: 'pending', createdAt: Date.now() });
        return interaction.reply({ content: 'Tu sugerencia fue enviada al staff para valoración.', ephemeral: true });
      }

      /* /nuevo /anuncio - envía al servidor principal */
      if (name === 'nuevo' || name === 'anuncio') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: 'Solo staff puede usar esto.', ephemeral: true });
        const contenido = interaction.options.getString('mensaje');
        const targetGuild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID);
        if (!targetGuild) return interaction.reply({ content: 'No se encontró el servidor principal.', ephemeral: true });
        const channelName = name === 'nuevo' ? CONFIG.CANALES.NUEVO : CONFIG.CANALES.ANUNCIOS;
        let ch = findChannelByName(targetGuild, channelName);
        if (!ch) ch = await targetGuild.channels.create({ name: channelName, type: ChannelType.GuildText }).catch(() => null);
        if (!ch) return interaction.reply({ content: `No se pudo encontrar/crear el canal ${channelName}.`, ephemeral: true });
        const embed = new EmbedBuilder().setTitle(name === 'nuevo' ? '🎊 Nuevo' : '📣 Anuncio').setDescription(contenido).setFooter({ text: 'Power Luki Network' }).setTimestamp();
        await ch.send({ embeds: [embed] }).catch(() => { });
        return interaction.reply({ content: 'Mensaje enviado al servidor principal.', ephemeral: true });
      }

      /* Mute / Unmute / Ban / Temban */
      if (name === 'mute') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: 'Necesitas ser staff.', ephemeral: true });
        const usuario = interaction.options.getUser('usuario');
        const duracion = interaction.options.getString('duracion');
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Comando solo en servidor.', ephemeral: true });
        const member = await guild.members.fetch(usuario.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
        const mutedRole = await ensureMutedRole(guild);
        if (!mutedRole) return interaction.reply({ content: 'No se pudo crear rol Muted.', ephemeral: true });
        await member.roles.add(mutedRole, `Mute por ${interaction.user.tag}`).catch(() => { });
        const ch = findChannelByName(guild, CONFIG.CANALES.SILENCIADOS);
        if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('🔇 Usuario silenciado').setDescription(`${usuario.tag} silenciado por ${interaction.user.tag}${duracion ? `\nDuración: ${duracion}` : ''}`).setTimestamp()] }).catch(() => { });
        interaction.reply({ content: `Usuario ${usuario.tag} silenciado.`, ephemeral: true });
        if (duracion) {
          const ms = parseTimeToMs(duracion);
          if (ms) setTimeout(async () => {
            const fetched = await guild.members.fetch(usuario.id).catch(() => null);
            if (fetched) {
              await fetched.roles.remove(mutedRole).catch(() => { });
              const ch2 = findChannelByName(guild, CONFIG.CANALES.DESILENCIADOS);
              if (ch2) ch2.send({ embeds: [new EmbedBuilder().setTitle('🔉 Usuario desilenciado').setDescription(`${usuario.tag} fue desilenciado automáticamente`).setTimestamp()] }).catch(() => { });
            }
          }, ms);
        }
        return;
      }

      if (name === 'unmute') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: 'Necesitas ser staff.', ephemeral: true });
        const usuario = interaction.options.getUser('usuario'); const guild = interaction.guild;
        const member = await guild.members.fetch(usuario.id).catch(() => null);
        const muted = guild.roles.cache.find(r => r.name === 'Muted');
        if (muted && member && member.roles.cache.has(muted.id)) {
          await member.roles.remove(muted).catch(() => { });
          const ch = findChannelByName(guild, CONFIG.CANALES.DESILENCIADOS);
          if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('🔉 Usuario desilenciado').setDescription(`${usuario.tag} fue desilenciado por ${interaction.user.tag}`).setTimestamp()] }).catch(() => { });
          return interaction.reply({ content: 'Usuario desilenciado.', ephemeral: true });
        } else return interaction.reply({ content: 'Usuario no estaba silenciado.', ephemeral: true });
      }

      if (name === 'ban' || name === 'temban') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: 'Necesitas ser staff.', ephemeral: true });
        const usuario = interaction.options.getUser('usuario'); const razon = interaction.options.getString('razon') || 'No especificada'; const guild = interaction.guild;
        await guild.bans.create(usuario.id, { reason: `${razon} - por ${interaction.user.tag}` }).catch(() => { });
        const ch = findChannelByName(guild, CONFIG.CANALES.BANEOS);
        if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('🔨 Usuario baneado').setDescription(`${usuario.tag} fue baneado por ${interaction.user.tag}\nRazón: ${razon}`).setTimestamp()] }).catch(() => { });
        interaction.reply({ content: `${usuario.tag} baneado.`, ephemeral: true });
        if (name === 'temban') {
          const tiempo = interaction.options.getString('tiempo'); const ms = parseTimeToMs(tiempo);
          if (ms) setTimeout(async () => { await guild.bans.remove(usuario.id).catch(() => { }); const ch2 = findChannelByName(guild, CONFIG.CANALES.BANEOS); if (ch2) ch2.send({ embeds: [new EmbedBuilder().setTitle('🔨 Ban levantado').setDescription(`${usuario.tag} fue desbaneado automáticamente.`).setTimestamp()] }).catch(() => { }); }, ms);
        }
        return;
      }

      /* /encuesta (staff) */
      if (name === 'encuesta') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: 'Solo staff.', ephemeral: true });
        const pregunta = interaction.options.getString('pregunta');
        const embed = new EmbedBuilder().setTitle('📊 Nueva encuesta').setDescription(pregunta).setFooter({ text: 'Power Lucky Network' }).setTimestamp();
        const reply = await interaction.reply({ embeds: [embed], fetchReply: true });
        await reply.react('👍').catch(() => { }); await reply.react('👎').catch(() => { });
        return;
      }
    } // end isChatInputCommand

    // Buttons
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Panel buttons -> abrir ticket
      if (id.startsWith('open_ticket_')) {
        const type = id.split('_')[2]; // support, reports, shop, other
        if (openTickets.has(interaction.user.id)) return interaction.reply({ content: 'Ya tienes un ticket abierto.', ephemeral: true });
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Comando en servidor solamente.', ephemeral: true });
        const category = guild.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS_CATEGORY && c.type === ChannelType.GuildCategory);
        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${type}`.slice(0, 90);
        const ticketChannel = await guild.channels.create({
          name: channelName, type: ChannelType.GuildText, parent: category ? category.id : undefined, permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        }).catch(() => null);
        if (!ticketChannel) return interaction.reply({ content: 'No se pudo crear ticket.', ephemeral: true });
        openTickets.set(interaction.user.id, ticketChannel.id);
        const logCh = findChannelByName(guild, CONFIG.CANALES.TICKETS_LOG);
        if (logCh) logCh.send({ embeds: [new EmbedBuilder().setTitle('🎫 Nuevo Ticket').setDescription(`${interaction.user.tag}\nCanal: ${ticketChannel}`)] }).catch(() => { });
        await ticketChannel.send({ content: `${interaction.user} - Describe tu problema.` }).catch(() => { });
        return interaction.reply({ content: `Ticket creado: ${ticketChannel}`, ephemeral: true });
      }

      // Votos públicos (sugerencias)
      if (id.startsWith('public_like_') || id.startsWith('public_dislike_')) {
        const parts = id.split('_'); const sId = parts[2];
        const data = suggestionsDB.get(sId);
        if (!data) return interaction.reply({ content: 'Sugerencia no encontrada.', ephemeral: true });
        const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID);
        const ch = guild?.channels.cache.get(data.channelId) || findChannelByName(guild, CONFIG.CANALES.VALORACIONES);
        if (!ch) return interaction.reply({ content: 'Canal no encontrado.', ephemeral: true });
        const msg = await ch.messages.fetch(data.messageId).catch(() => null);
        if (!msg) return interaction.reply({ content: 'Mensaje no encontrado.', ephemeral: true });
        const emoji = id.startsWith('public_like_') ? '👍' : '👎';
        await msg.react(emoji).catch(() => { });
        return interaction.reply({ content: `Voto registrado ${emoji}`, ephemeral: true });
      }

      // Staff: valoración obligatoria (desde canal staff)
      if (id.startsWith('staff_accept_') || id.startsWith('staff_deny_')) {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: 'Solo staff puede valorar.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`${id}_modal`).setTitle(id.startsWith('staff_accept_') ? 'Razón de aprobación' : 'Razón de denegación');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Razón (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false)));
        await interaction.showModal(modal);
        return;
      }

    } // end buttons

    // Modal submit (staff reason)
    if (interaction.type === InteractionType.ModalSubmit) {
      const cid = interaction.customId;
      if (cid.startsWith('staff_accept_') || cid.startsWith('staff_deny_')) {
        const parts = cid.split('_'); const action = parts[1]; const sId = parts[2];
        const reason = interaction.fields.getTextInputValue('reason') || 'No se proporcionó un motivo';
        const data = suggestionsDB.get(sId);
        if (!data) return interaction.reply({ content: 'Sugerencia no encontrada.', ephemeral: true });

        const mainGuild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID);
        if (!mainGuild) return interaction.reply({ content: 'Servidor no disponible.', ephemeral: true });
        let valorCh = findChannelByName(mainGuild, CONFIG.CANALES.VALORACIONES);
        if (!valorCh) valorCh = await mainGuild.channels.create({ name: CONFIG.CANALES.VALORACIONES, type: ChannelType.GuildText }).catch(() => null);
        if (!valorCh) return interaction.reply({ content: 'No se pudo obtener canal de valoraciones.', ephemeral: true });

        const finalEmbed = new EmbedBuilder()
          .setTitle(action === 'accept' ? `La sugerencia #${sId} fue aprobada` : `La sugerencia #${sId} fue desaprobada`)
          .addFields({ name: 'Sugerencia', value: data.texto || '—' }, { name: 'Razón', value: reason }, { name: 'Staff', value: interaction.user.tag })
          .setFooter({ text: `ID de Sugerencia: ${sId} | ${formatTimestamp()}` })
          .setTimestamp();

        await valorCh.send({ embeds: [finalEmbed] }).catch(() => null);
        data.status = action === 'accept' ? 'accepted' : 'denied';
        suggestionsDB.set(sId, data);

        // editar mensaje original en canal staff (desactivar botones)
        try {
          const staffCh = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID)?.channels.cache.get(data.channelId);
          if (staffCh) {
            const orig = await staffCh.messages.fetch(data.messageId).catch(() => null);
            if (orig) orig.edit({ components: [] }).catch(() => { });
          }
        } catch (e) { /* noop */ }

        return interaction.reply({ content: `Sugerencia ${action === 'accept' ? 'aprobada' : 'desaprobada'} y publicada en Valoraciones.`, ephemeral: true });
      }
    }
  } catch (err) {
    console.error('Error en interactionCreate:', err);
  }
});

/* ───────── MENSAJES (ip, tienda, !cerrar, niveles) ───────── */
client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    const content = message.content.toLowerCase();

    if (content === '!ip' || content === 'ip') {
      const ipEmbed = new EmbedBuilder().setTitle(`${CONFIG.EMOJIS.IP} IP DEL SERVIDOR`).setColor('#00FFFF')
        .setDescription(`━━━━━━━━━━━━━━━━━━\n\n${CONFIG.EMOJIS.JAVA} **Java:** \`${CONFIG.SERVER_IP}\`\n${CONFIG.EMOJIS.BEDROCK} **Bedrock:** \`${CONFIG.SERVER_IP}\`\n**Puerto:** \`${CONFIG.SERVER_PORT}\`\n**Versiones:** ${CONFIG.VERSIONS}\n\n━━━━━━━━━━━━━━━━━━`).setFooter({ text: 'PowerMax Network • Conéctate ya' }).setTimestamp();
      message.channel.send({ embeds: [ipEmbed] }).catch(() => { });
      return;
    }

    if (content === `${CONFIG.PREFIJO}tienda` || content.includes('donar') || content.includes('comprar') || content.includes('shop') || content.includes('store')) {
      const shopEmbed = new EmbedBuilder().setTitle(`${CONFIG.EMOJIS.TIENDA} TIENDA OFICIAL`).setColor('#FFCC00').setDescription(`━━━━━━━━━━━━━━━━━━\n\n**¡Apoya al servidor comprando rangos y mejoras!**\n\n🔗 https://tienda.powermax.com\n\n━━━━━━━━━━━━━━━━━━`).setFooter({ text: 'PowerMax Shop • Gracias por apoyar' }).setTimestamp();
      message.channel.send({ embeds: [shopEmbed] }).catch(() => { });
      return;
    }

    // cerrar ticket
    if (content.startsWith('!cerrar') || content.startsWith(`${CONFIG.PREFIJO}cerrar`)) {
      const ch = message.channel;
      const userEntry = [...openTickets.entries()].find(([uid, cid]) => cid === ch.id);
      if (!userEntry) return message.reply('Este comando solo funciona dentro de un ticket.');
      const [uid] = userEntry;
      openTickets.delete(uid);
      await ch.send('Cerrando ticket en 5 segundos...').catch(() => { });
      setTimeout(() => ch.delete('Ticket cerrado').catch(() => { }), 5000);
      return;
    }

    // niveles (XP)
    const userId = message.author.id;
    let data = nivelesDB.get(userId) || { xp: 0, nivel: 1, lastXP: 0 };
    if (Date.now() - data.lastXP > 60000) {
      data.xp += Math.floor(Math.random() * 15) + 10;
      data.lastXP = Date.now();
      const xpNecesaria = Math.min(999, data.nivel) * 250;
      if (data.xp >= xpNecesaria) {
        data.nivel++;
        data.xp = 0;
        const canalNiveles = message.guild.channels.cache.find(c => c.name === CONFIG.CANALES.NIVELES);
        if (canalNiveles) {
          const embed = new EmbedBuilder().setTitle('🌟 ¡LEVEL UP! 🌟').setDescription(`🎉 <@${message.author.id}> ha subido al Nivel ${data.nivel} 🎉`).setFooter({ text: 'Power Luki Network' }).setTimestamp();
          canalNiveles.send({ content: `🎉 <@${message.author.id}>`, embeds: [embed] }).catch(() => { });
        }
      }
      nivelesDB.set(userId, data);
    }
  } catch (err) {
    console.error('Error en messageCreate:', err);
  }
});

/* ───────── BIENVENIDAS / DESPEDIDAS ───────── */
client.on('guildMemberAdd', async member => {
  try {
    const ch = findChannelByName(member.guild, CONFIG.CANALES.BIENVENIDAS);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
      .setDescription(`-_- - POWER LUKI NETWORK -_- \n\n💎 ${member.user.tag} ha llegado a nuestra comunidad.\n🎇 ¡Disfruta tu estadía!`)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' })
      .setTimestamp();
    ch.send({ embeds: [embed] }).catch(() => { });
  } catch (e) { console.error(e); }
});

client.on('guildMemberRemove', async member => {
  try {
    const ch = findChannelByName(member.guild, CONFIG.CANALES.DESPEDIDAS);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setTitle(`😔 ¡Hasta pronto, ${member.user.username}! 😔`)
      .setDescription(`- - - • POWER LUKI NETWORK • - - -\n\n╭━━━━━━━━━━━━━━━━━━━━━━━╮\n💔 ${member.user.tag} nos deja temporalmente.\n🌟 Esperamos volver a verte pronto en Power Luki Network.\n╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n📌 Recuerda que siempre eres parte de nuestra comunidad.\n- - - • Siempre Bienvenido • - - -`)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `Power Luki Network • Nos vemos pronto • ${formatTimestamp()}` })
      .setTimestamp();
    ch.send({ embeds: [embed] }).catch(() => { });
  } catch (e) { console.error(e); }
});

/* ───────── SERVIDOR EXPRESS (salud) ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Max Bot Online ✅'));

/* ───────── ARRANQUE SEGURO (TOKEN + LOGIN + SERVER) ───────── */
process.on('unhandledRejection', (reason) => { console.error('Unhandled Rejection:', reason); });
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); });

// LOG token presence (no imprimir token).
console.log('TOKEN detectado:', !!process.env.TOKEN);

// LOGIN DEL BOT (FUERA DEL app.listen)
client.login(process.env.TOKEN)
  .then(() => console.log('🔐 Login a Discord iniciado'))
  .catch(err => console.error('❌ Error iniciando sesión en Discord:', err));

// INICIAR EL SERVIDOR WEB
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escuchando en puerto ${PORT}`);
});
