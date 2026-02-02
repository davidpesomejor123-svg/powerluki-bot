// index.js — Power Luki Network Bot (ULTRA COMPLETO — READY AL PRINCIPIO)
// Requisitos: node 18+, discord.js v14, express, dotenv
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
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

/* ───────── CONFIGURACIÓN ───────── */
const CONFIG = {
  PREFIJO: '!', // no usado para abrir/cerrar tickets
  SERVER_IP: 'powermax.hidenmc.com',
  SERVER_PORT: '24818',
  VERSIONS: '1.13 a 1.21.11',
  MAIN_GUILD_ID: '1340442398442127480',
  STAFF_ROLE_ID: '1458243569075884219',
  CANALES: {
    TICKETS_LOG: '📖tickets',
    TICKETS_CATEGORY: 'Tickets',
    PANEL_TICKETS: '🎫-panel',
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
  EMOJIS: { TIENDA: '🛒', IP: '🌐' },
  DATA_DIR: path.join(process.cwd(), 'data'),
  XP: {
    COOLDOWN_MS: 60 * 1000,
    MIN_XP: 10,
    MAX_XP: 24,
    BASE_XP_REQ: 250,
    LEVEL_ROLES: { 5: 'Nivel 5', 10: 'Nivel 10', 20: 'Nivel 20' }
  },
  RAID_PROTECT: { WINDOW_MS: 30_000, JOIN_LIMIT: 5 }
};

/* ───────── PERSISTENCIA ───────── */
if (!fs.existsSync(CONFIG.DATA_DIR)) fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });

const FILES = {
  TICKETS: path.join(CONFIG.DATA_DIR, 'tickets.json'),
  SUGGESTIONS: path.join(CONFIG.DATA_DIR, 'suggestions.json'),
  LEVELS: path.join(CONFIG.DATA_DIR, 'levels.json'),
  WARNS: path.join(CONFIG.DATA_DIR, 'warns.json'),
  META: path.join(CONFIG.DATA_DIR, 'meta.json')
};

function safeReadJSON(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('Error leyendo JSON', filePath, e);
    return fallback;
  }
}

function safeWriteJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error escribiendo JSON', filePath, e);
  }
}

let persisted = {
  tickets: safeReadJSON(FILES.TICKETS, {}),
  suggestions: safeReadJSON(FILES.SUGGESTIONS, {}),
  levels: safeReadJSON(FILES.LEVELS, {}),
  warns: safeReadJSON(FILES.WARNS, {}),
  meta: safeReadJSON(FILES.META, {})
};

const openTickets = new Map(Object.entries(persisted.tickets));
const suggestionsDB = new Map(Object.entries(persisted.suggestions));
const nivelesDB = new Map(Object.entries(persisted.levels));
const warnsDB = new Map(Object.entries(persisted.warns));
let suggestionCounter = persisted.meta.suggestionCounter || 1;

function persistAll() {
  persisted.tickets = Object.fromEntries(openTickets);
  persisted.suggestions = Object.fromEntries(suggestionsDB);
  persisted.levels = Object.fromEntries(nivelesDB);
  persisted.warns = Object.fromEntries(warnsDB);
  persisted.meta = { suggestionCounter };
  safeWriteJSON(FILES.TICKETS, persisted.tickets);
  safeWriteJSON(FILES.SUGGESTIONS, persisted.suggestions);
  safeWriteJSON(FILES.LEVELS, persisted.levels);
  safeWriteJSON(FILES.WARNS, persisted.warns);
  safeWriteJSON(FILES.META, persisted.meta);
}

function generateSuggestionId() {
  const id = (suggestionCounter++).toString(36).toUpperCase();
  persistAll();
  return id;
}

/* ───────── UTILIDADES ───────── */
function findChannelByName(guild, name) {
  if (!guild) return null;
  return guild.channels.cache.find(c => c.name === name);
}
function formatTimestamp(date = new Date()) {
  return date.toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa' });
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
async function ensureMutedRole(guild) {
  if (!guild) return null;
  let muted = guild.roles.cache.find(r => r.name === 'Muted');
  if (muted) return muted;
  try {
    muted = await guild.roles.create({ name: 'Muted', reason: 'Rol para silenciar usuarios', permissions: [] });
    for (const channel of guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildForum) {
        channel.permissionOverwrites.edit(muted, { SendMessages: false, AddReactions: false, Speak: false }).catch(() => {});
      }
    }
    return muted;
  } catch (e) {
    return null;
  }
}

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

/* ───────── ANTI-RAID SIMPLE ───────── */
const recentJoins = [];
function registerJoinAndCheck() {
  const now = Date.now();
  recentJoins.push(now);
  while (recentJoins.length && now - recentJoins[0] > CONFIG.RAID_PROTECT.WINDOW_MS) recentJoins.shift();
  return recentJoins.length >= CONFIG.RAID_PROTECT.JOIN_LIMIT;
}

/* ───────── READY (INICIO) — colocado al principio como pediste ───────── */
client.once('ready', async () => {
  try {
    console.log(`🤖 Bot conectado como ${client.user.tag}`);
    client.user.setActivity('Power Luki Network', { type: 4 });

    // Registrar comandos slash
    const commands = [
      new SlashCommandBuilder().setName('mute').setDescription('Silenciar un usuario').addUserOption(o => o.setName('usuario').setRequired(true)).addStringOption(o => o.setName('duracion')),
      new SlashCommandBuilder().setName('unmute').setDescription('Des-silenciar').addUserOption(o => o.setName('usuario').setRequired(true)),
      new SlashCommandBuilder().setName('ban').setDescription('Banear usuario').addUserOption(o => o.setName('usuario').setRequired(true)).addStringOption(o => o.setName('razon').setDescription('Razón')),
      new SlashCommandBuilder().setName('temban').setDescription('Ban temporal').addUserOption(o => o.setName('usuario').setRequired(true)).addStringOption(o => o.setName('tiempo').setRequired(true)).addStringOption(o => o.setName('razon')),
      new SlashCommandBuilder().setName('warn').setDescription('Advertir a un usuario').addUserOption(o => o.setName('usuario').setRequired(true)).addStringOption(o => o.setName('razon').setRequired(true)),
      new SlashCommandBuilder().setName('status').setDescription('Estado del servidor'),
      new SlashCommandBuilder().setName('ticket-panel').setDescription('Publicar/actualizar panel de tickets (staff)'),
      new SlashCommandBuilder().setName('sugerencias').setDescription('Enviar sugerencia pública').addStringOption(o => o.setName('texto').setRequired(true)),
      new SlashCommandBuilder().setName('sugerenciaserver').setDescription('Enviar sugerencia directa al staff').addStringOption(o => o.setName('texto').setRequired(true)),
      new SlashCommandBuilder().setName('nuevo').setDescription('Enviar mensaje al canal NUEVO').addStringOption(o => o.setName('mensaje').setRequired(true)),
      new SlashCommandBuilder().setName('anuncio').setDescription('Enviar anuncio al canal ANUNCIOS').addStringOption(o => o.setName('mensaje').setRequired(true))
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands }).catch(e => console.error('Error registrando comandos', e));
    console.log('✅ Slash commands registrados.');

    // Publicar panel de tickets (si no existe)
    try {
      const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || client.guilds.cache.first();
      if (!guild) {
        console.warn('⚠️ No se encontró guild principal para publicar panel de tickets.');
      } else {
        let panelCh = findChannelByName(guild, CONFIG.CANALES.PANEL_TICKETS);
        if (!panelCh) {
          panelCh = await guild.channels.create({ name: CONFIG.CANALES.PANEL_TICKETS, type: ChannelType.GuildText }).catch(() => null);
        }
        if (panelCh) {
          const fetched = await panelCh.messages.fetch({ limit: 50 }).catch(() => null);
          const existe = fetched && fetched.find(m => m.author?.id === client.user.id && m.embeds?.[0]?.title?.includes('Centro de Soporte'));
          if (!existe) {
            const embed = new EmbedBuilder()
              .setTitle('🛠️ Centro de Soporte | Power Luki Network')
              .setDescription('Pulsa un botón para abrir un ticket. Todo se gestiona mediante botones. No uses comandos de texto para abrir/cerrar.')
              .setColor('#0099ff')
              .setFooter({ text: 'Power Luki Network Support' });

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('open_ticket_support').setLabel('Soporte').setEmoji('🔧').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('open_ticket_reports').setLabel('Reportes').setEmoji('🚨').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('open_ticket_shop').setLabel('Tienda').setEmoji('🛒').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('open_ticket_other').setLabel('Otros').setEmoji('❔').setStyle(ButtonStyle.Secondary)
            );

            await panelCh.send({ embeds: [embed], components: [row] }).catch(() => {});
            console.log('✅ Panel de tickets publicado.');
          }
        }
      }
    } catch (e) {
      console.error('Error publicando panel', e);
    }

    // Guardado periódico — solo iniciar después de ready
    setInterval(() => {
      try { persistAll(); } catch (e) { console.error('Error guardando persistencia periódica', e); }
    }, 30_000);

    console.log('✅ Inicio completado. Bot listo.');
  } catch (e) {
    console.error('Error en ready:', e);
  }
});

/* ───────── INTERACTIONS (comandos, botones, modales) ───────── */
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      if (name === 'status') {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle(`${CONFIG.EMOJIS.IP} Estado de Power Luki Network`)
            .setColor('Blue')
            .addFields(
              { name: 'IP Java/Bedrock', value: `\`${CONFIG.SERVER_IP}\`` },
              { name: 'Puerto Bedrock', value: `\`${CONFIG.SERVER_PORT}\`` },
              { name: 'Versiones', value: CONFIG.VERSIONS }
            )],
          ephemeral: true
        });
      }

      if (name === 'ticket-panel') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID))
          return interaction.reply({ content: 'Solo staff/admin.', ephemeral: true });

        let panelCh = findChannelByName(interaction.guild, CONFIG.CANALES.PANEL_TICKETS);
        if (!panelCh) panelCh = await interaction.guild.channels.create({ name: CONFIG.CANALES.PANEL_TICKETS, type: ChannelType.GuildText }).catch(() => null);
        if (!panelCh) return interaction.reply({ content: 'No se pudo crear el canal del panel.', ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle('🛠️ Centro de Soporte | Power Luki Network')
          .setDescription('Pulsa un botón para abrir un ticket. Todo se gestiona mediante botones.')
          .setColor('#0099ff');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ticket_support').setLabel('Soporte').setEmoji('🔧').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('open_ticket_reports').setLabel('Reportes').setEmoji('🚨').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('open_ticket_shop').setLabel('Tienda').setEmoji('🛒').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('open_ticket_other').setLabel('Otros').setEmoji('❔').setStyle(ButtonStyle.Secondary)
        );
        await panelCh.send({ embeds: [embed], components: [row] }).catch(() => {});
        return interaction.reply({ content: 'Panel publicado/actualizado.', ephemeral: true });
      }

      // sugerencias publicas y staff, nuevo, anuncio, moderación...
      if (name === 'sugerencias') {
        const texto = interaction.options.getString('texto');
        const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || interaction.guild;
        let ch = findChannelByName(guild, CONFIG.CANALES.VALORACIONES);
        if (!ch) ch = await guild.channels.create({ name: CONFIG.CANALES.VALORACIONES, type: ChannelType.GuildText }).catch(() => null);
        if (!ch) return interaction.reply({ content: 'No se pudo obtener canal de valoraciones.', ephemeral: true });

        const id = generateSuggestionId();
        const embed = new EmbedBuilder().setTitle(`Sugerencia #${id}`).setDescription(texto).setColor('#FFD166')
          .addFields({ name: 'Autor', value: interaction.user.tag, inline: true })
          .setFooter({ text: `ID: ${id} • ${formatTimestamp()}` }).setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`public_like_${id}`).setLabel('👍').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`public_dislike_${id}`).setLabel('👎').setStyle(ButtonStyle.Secondary)
        );

        const msg = await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
        suggestionsDB.set(id, { id, author: interaction.user.id, texto, messageId: msg ? msg.id : null, channelId: ch.id, status: 'pending', createdAt: Date.now() });
        persistAll();
        return interaction.reply({ content: `Sugerencia enviada con ID #${id}`, ephemeral: true });
      }

      if (name === 'sugerenciaserver') {
        const texto = interaction.options.getString('texto');
        const mainGuild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || interaction.guild;
        let staffCh = findChannelByName(mainGuild, CONFIG.CANALES.STAFF_REVIEW);
        if (!staffCh) staffCh = await mainGuild.channels.create({ name: CONFIG.CANALES.STAFF_REVIEW, type: ChannelType.GuildText }).catch(() => null);
        if (!staffCh) return interaction.reply({ content: 'No se pudo crear canal staff.', ephemeral: true });

        const id = generateSuggestionId();
        const embed = new EmbedBuilder().setTitle(`Sugerencia Staff #${id}`).setDescription(texto).setColor('Orange')
          .addFields({ name: 'Autor', value: interaction.user.tag, inline: true })
          .setFooter({ text: `Revisión requerida • ${formatTimestamp()}` }).setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`staff_accept_${id}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`staff_deny_${id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

        const msg = await staffCh.send({ embeds: [embed], components: [row] }).catch(() => null);
        suggestionsDB.set(id, { id, author: interaction.user.id, texto, messageId: msg ? msg.id : null, channelId: staffCh.id, status: 'pending', createdAt: Date.now() });
        persistAll();
        return interaction.reply({ content: `Sugerencia enviada al staff con ID #${id}`, ephemeral: true });
      }

      if (name === 'nuevo' || name === 'anuncio') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID))
          return interaction.reply({ content: 'Solo staff/admin.', ephemeral: true });

        const mensaje = interaction.options.getString('mensaje');
        const channelName = name === 'nuevo' ? CONFIG.CANALES.NUEVO : CONFIG.CANALES.ANUNCIOS;
        let ch = findChannelByName(interaction.guild, channelName);
        if (!ch) ch = await interaction.guild.channels.create({ name: channelName, type: ChannelType.GuildText }).catch(() => null);
        if (!ch) return interaction.reply({ content: 'No se pudo crear canal.', ephemeral: true });

        const embed = new EmbedBuilder().setTitle(name === 'nuevo' ? '🎊 Nuevo' : '📣 Anuncio').setDescription(mensaje).setColor(name === 'nuevo' ? 'Blue' : 'Red').setTimestamp();
        await ch.send({ embeds: [embed] }).catch(() => {});
        return interaction.reply({ content: 'Mensaje enviado.', ephemeral: true });
      }

      // Moderación: mute/unmute/ban/temban/warn
      if (name === 'mute') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sin permisos.', ephemeral: true });
        const user = interaction.options.getUser('usuario');
        const duracion = interaction.options.getString('duracion');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });

        const mutedRole = await ensureMutedRole(interaction.guild);
        if (!mutedRole) return interaction.reply({ content: 'No se pudo crear rol Muted.', ephemeral: true });

        await member.roles.add(mutedRole).catch(() => {});
        const ch = findChannelByName(interaction.guild, CONFIG.CANALES.SILENCIADOS);
        if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('🔇 Muteado').setDescription(`${user.tag} silenciado por ${interaction.user.tag}`).setColor('Grey')] });

        interaction.reply({ content: `Silenciado ${user.tag}`, ephemeral: true });

        if (duracion) {
          const ms = parseTimeToMs(duracion);
          if (ms) setTimeout(async () => {
            const m = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (m && m.roles.cache.has(mutedRole.id)) {
              await m.roles.remove(mutedRole).catch(() => {});
              const ch2 = findChannelByName(interaction.guild, CONFIG.CANALES.DESILENCIADOS);
              if (ch2) ch2.send({ content: `${user.tag} desilenciado automáticamente.` });
            }
          }, ms);
        }
        return;
      }

      if (name === 'unmute') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sin permisos.', ephemeral: true });
        const user = interaction.options.getUser('usuario');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const muted = interaction.guild.roles.cache.find(r => r.name === 'Muted');
        if (member && muted) {
          await member.roles.remove(muted).catch(() => {});
          return interaction.reply({ content: 'Usuario desilenciado.', ephemeral: true });
        }
        return interaction.reply({ content: 'No se pudo desilenciar.', ephemeral: true });
      }

      if (name === 'ban' || name === 'temban') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: 'Sin permisos.', ephemeral: true });
        const user = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('razon') || 'Sin razón';
        await interaction.guild.bans.create(user.id, { reason: `${reason} - por ${interaction.user.tag}` }).catch(() => {});
        const ch = findChannelByName(interaction.guild, CONFIG.CANALES.BANEOS);
        if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('🔨 Baneado').setDescription(`${user.tag}\nRazón: ${reason}`).setColor('DarkRed')] });
        interaction.reply({ content: 'Usuario baneado.', ephemeral: true });

        if (name === 'temban') {
          const tiempo = interaction.options.getString('tiempo');
          const ms = parseTimeToMs(tiempo);
          if (ms) setTimeout(() => interaction.guild.bans.remove(user.id).catch(() => {}), ms);
        }
        return;
      }

      if (name === 'warn') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers) && !interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: 'Sin permisos.', ephemeral: true });
        const user = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('razon');
        const arr = warnsDB.get(user.id) || [];
        arr.push({ reason, by: interaction.user.id, at: Date.now() });
        warnsDB.set(user.id, arr);
        persistAll();
        interaction.reply({ content: `Advertencia enviada a ${user.tag}`, ephemeral: true });
        const ch = findChannelByName(interaction.guild, CONFIG.CANALES.BANEOS);
        if (ch) ch.send({ content: `⚠️ ${user.tag} ha sido advertido. Razón: ${reason}` });
        return;
      }
    } // fin chat commands

    // ---------- BUTTONS ----------
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id.startsWith('open_ticket_')) {
        if (openTickets.has(interaction.user.id)) return interaction.reply({ content: 'Ya tienes un ticket abierto.', ephemeral: true });
        const type = id.split('_')[2] || 'general';
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Usa el botón en el servidor.', ephemeral: true });

        let category = guild.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS_CATEGORY && c.type === ChannelType.GuildCategory);
        if (!category) category = await guild.channels.create({ name: CONFIG.CANALES.TICKETS_CATEGORY, type: ChannelType.GuildCategory }).catch(() => null);

        const niceName = `${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
        const channelName = `ticket-${niceName}-${type}`;

        const ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category ? category.id : undefined,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        }).catch(() => null);

        if (!ticketChannel) return interaction.reply({ content: 'No pude crear el ticket. Revisa permisos.', ephemeral: true });
        openTickets.set(interaction.user.id, ticketChannel.id);
        persistAll();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcripción').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `${interaction.user} — Gracias por abrir un ticket. Un miembro del staff te atenderá.`, components: [row] }).catch(() => {});
        const logCh = findChannelByName(guild, CONFIG.CANALES.TICKETS_LOG);
        if (logCh) logCh.send({ embeds: [new EmbedBuilder().setTitle('🎫 Nuevo Ticket').setDescription(`Usuario: ${interaction.user.tag}\nCanal: ${ticketChannel}\nTipo: ${type}`).setColor('Blue')] }).catch(() => {});
        return interaction.reply({ content: `Ticket creado: ${ticketChannel}`, ephemeral: true });
      }

      if (id === 'ticket_claim') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
          return interaction.reply({ content: 'Solo staff puede claimear tickets.', ephemeral: true });
        await interaction.reply({ content: `${interaction.user.tag} ha reclamado este ticket.`, ephemeral: false });
        interaction.message.channel.send({ content: `🔒 Ticket reclamado por ${interaction.user}` }).catch(() => {});
        return;
      }

      if (id === 'ticket_transcript') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
          return interaction.reply({ content: 'Solo staff puede generar transcripciones.', ephemeral: true });

        await interaction.reply({ content: 'Generando transcripción...', ephemeral: true });
        const msgs = await interaction.channel.messages.fetch({ limit: 200 }).catch(() => null);
        const arr = msgs ? Array.from(msgs.values()).reverse() : [];
        const text = arr.map(m => `[${formatTimestamp(m.createdAt)}] ${m.author.tag}: ${m.content || ''}`).join('\n');
        const buffer = Buffer.from(text || 'Sin mensajes');
        const logCh = findChannelByName(interaction.guild, CONFIG.CANALES.TICKETS_LOG);
        if (logCh) {
          await logCh.send({ content: `📑 Transcripción de ${interaction.channel}`, files: [{ attachment: buffer, name: `transcript-${interaction.channel.name}.txt` }] }).catch(() => {});
        }
        return interaction.followUp({ content: 'Transcripción enviada al canal de logs.', ephemeral: true });
      }

      if (id === 'ticket_close') {
        const channel = interaction.channel;
        const ownerEntry = Array.from(openTickets.entries()).find(([uid, cid]) => cid === channel.id);
        const ownerId = ownerEntry ? ownerEntry[0] : null;
        if (!(interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || interaction.user.id === ownerId || interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)))
          return interaction.reply({ content: 'Solo staff o autor puede cerrar este ticket.', ephemeral: true });

        await interaction.reply({ content: 'Cerrando ticket en 5s...', ephemeral: true });
        const msgs = await channel.messages.fetch({ limit: 200 }).catch(() => null);
        const arr = msgs ? Array.from(msgs.values()).reverse() : [];
        const text = arr.map(m => `[${formatTimestamp(m.createdAt)}] ${m.author.tag}: ${m.content || ''}`).join('\n');
        const buffer = Buffer.from(text || 'Sin mensajes');
        const logCh = findChannelByName(interaction.guild, CONFIG.CANALES.TICKETS_LOG);
        if (logCh) {
          await logCh.send({ content: `📑 Ticket cerrado: ${channel.name}`, files: [{ attachment: buffer, name: `transcript-${channel.name}.txt` }] }).catch(() => {});
        }
        for (const [uid, cid] of openTickets.entries()) { if (cid === channel.id) openTickets.delete(uid); }
        persistAll();
        setTimeout(() => channel.delete().catch(() => {}), 5000);
        return;
      }

      if (id.startsWith('public_like_') || id.startsWith('public_dislike_')) {
        const sId = id.split('_')[2];
        const data = suggestionsDB.get(sId);
        if (!data) return interaction.reply({ content: 'Sugerencia no encontrada.', ephemeral: true });
        try {
          const ch = interaction.guild.channels.cache.get(data.channelId) || findChannelByName(interaction.guild, CONFIG.CANALES.VALORACIONES);
          if (ch) {
            const msg = await ch.messages.fetch(data.messageId).catch(() => null);
            if (msg) {
              const emoji = id.includes('like') ? '👍' : '👎';
              await msg.react(emoji).catch(() => {});
            }
          }
        } catch (e) {}
        return interaction.reply({ content: 'Voto registrado (reacción añadida).', ephemeral: true });
      }

      if (id.startsWith('staff_accept_') || id.startsWith('staff_deny_')) {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
          return interaction.reply({ content: 'Solo staff puede usar esto.', ephemeral: true });

        const action = id.split('_')[1];
        const sId = id.split('_')[2];
        const modal = new ModalBuilder().setCustomId(`staff_modal_${action}_${sId}`).setTitle(action === 'accept' ? 'Aprobar sugerencia' : 'Rechazar sugerencia');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Razón/Comentario').setStyle(TextInputStyle.Paragraph).setRequired(true)));
        return interaction.showModal(modal);
      }
    } // fin buttons

    // ---------- MODALS ----------
    if (interaction.type === InteractionType.ModalSubmit) {
      const cid = interaction.customId;
      if (cid.startsWith('staff_modal_')) {
        const parts = cid.split('_'); // staff_modal_action_id
        const action = parts[2];
        const sId = parts[3];
        const reason = interaction.fields.getTextInputValue('reason');
        const data = suggestionsDB.get(sId);
        if (!data) return interaction.reply({ content: 'Dato no encontrado.', ephemeral: true });

        let valCh = findChannelByName(interaction.guild, CONFIG.CANALES.VALORACIONES);
        if (!valCh) valCh = await interaction.guild.channels.create({ name: CONFIG.CANALES.VALORACIONES, type: ChannelType.GuildText }).catch(() => null);

        const color = action === 'accept' ? 'Green' : 'Red';
        const title = action === 'accept' ? '✅ Sugerencia Aprobada' : '❌ Sugerencia Rechazada';
        const embed = new EmbedBuilder().setTitle(title).setColor(color)
          .addFields({ name: 'Sugerencia', value: data.texto }, { name: 'Razón del Staff', value: reason }, { name: 'Staff', value: interaction.user.tag })
          .setFooter({ text: `ID: ${sId}` }).setTimestamp();

        if (valCh) await valCh.send({ embeds: [embed] }).catch(() => {});
        try {
          const staffCh = interaction.guild.channels.cache.get(data.channelId);
          const msg = await staffCh.messages.fetch(data.messageId).catch(() => null);
          if (msg) msg.edit({ components: [], content: `**Procesada como: ${action}**` }).catch(() => {});
        } catch (e) {}
        data.status = action === 'accept' ? 'accepted' : 'denied';
        data.processedBy = interaction.user.id;
        data.processedAt = Date.now();
        persistAll();
        return interaction.reply({ content: 'Sugerencia procesada.', ephemeral: true });
      }
    }

  } catch (e) {
    console.error('Error en interactionCreate:', e);
  }
});

/* ───────── MESSAGE EVENTS (anti-invite, ip, tienda, xp) ───────── */
client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    const content = message.content.toLowerCase();

    if (content.includes('discord.gg/') && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await message.delete().catch(() => {});
      return message.channel.send({ content: `🚫 ${message.author}, los enlaces de Discord están prohibidos.` }).catch(() => {});
    }

    if ((content.includes('@here') || content.includes('@everyone')) && !message.member.permissions.has(PermissionsBitField.Flags.MentionEveryone)) {
      await message.delete().catch(() => {});
      return message.channel.send({ content: `🚫 ${message.author}, no puedes usar @here/@everyone.` }).catch(() => {});
    }

    if (content === '!ip' || content === 'ip') {
      const ipEmbed = new EmbedBuilder().setTitle(`${CONFIG.EMOJIS.IP} IP DEL SERVIDOR`).setColor('#00FFFF')
        .setDescription(`**Java:** \`${CONFIG.SERVER_IP}\`\n**Bedrock:** \`${CONFIG.SERVER_IP}\`\n**Puerto:** \`${CONFIG.SERVER_PORT}\``)
        .setFooter({ text: 'PowerMax Network' });
      return message.channel.send({ embeds: [ipEmbed] }).catch(() => {});
    }

    if (content.includes('!tienda') || content.includes('!store') || content.includes('tienda')) {
      const shopEmbed = new EmbedBuilder().setTitle(`${CONFIG.EMOJIS.TIENDA} TIENDA`).setColor('#FFCC00')
        .setDescription(`Adquiere rangos aquí: https://tienda.powermax.com`);
      return message.channel.send({ embeds: [shopEmbed] }).catch(() => {});
    }

    // XP
    const userId = message.author.id;
    const now = Date.now();
    const udata = nivelesDB.get(userId) || { xp: 0, nivel: 1, lastXP: 0 };
    if (now - (udata.lastXP || 0) >= CONFIG.XP.COOLDOWN_MS) {
      const gained = Math.floor(Math.random() * (CONFIG.XP.MAX_XP - CONFIG.XP.MIN_XP + 1)) + CONFIG.XP.MIN_XP;
      udata.xp = (udata.xp || 0) + gained;
      udata.lastXP = now;
      const xpNecesaria = (udata.nivel || 1) * CONFIG.XP.BASE_XP_REQ;
      if (udata.xp >= xpNecesaria) {
        udata.nivel = (udata.nivel || 1) + 1;
        udata.xp = 0;
        const lvlCh = findChannelByName(message.guild, CONFIG.CANALES.NIVELES);
        if (lvlCh) lvlCh.send({ content: `🎉 ¡Felicidades <@${userId}>! Has subido al nivel **${udata.nivel}**!` }).catch(() => {});
        const roleName = CONFIG.XP.LEVEL_ROLES[udata.nivel];
        if (roleName) {
          const role = message.guild.roles.cache.find(r => r.name === roleName || r.id === roleName);
          if (role) {
            const member = await message.guild.members.fetch(userId).catch(() => null);
            if (member && !member.roles.cache.has(role.id)) member.roles.add(role).catch(() => {});
          }
        }
      }
      nivelesDB.set(userId, udata);
      persistAll();
    }

  } catch (e) {
    console.error('Error en messageCreate:', e);
  }
});

/* ───────── GUILD MEMBER EVENTS (bienvenidas / anti-raid) ───────── */
client.on('guildMemberAdd', async (member) => {
  try {
    const raid = registerJoinAndCheck();
    if (raid) {
      const logCh = findChannelByName(member.guild, CONFIG.CANALES.TICKETS_LOG);
      if (logCh) logCh.send({ content: `⚠️ Posible raid detectado: múltiples joins recientes. Último: ${member.user.tag}` }).catch(() => {});
    }

    const ch = findChannelByName(member.guild, CONFIG.CANALES.BIENVENIDAS);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setTitle(`✨ ¡Bienvenido/a ${member.user.username}!`)
      .setDescription(`Bienvenido a **Power Luki Network**.`)
      .setThumbnail(member.user.displayAvatarURL())
      .setColor('Green');
    ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    console.error('Error en guildMemberAdd:', e);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    const ch = findChannelByName(member.guild, CONFIG.CANALES.DESPEDIDAS);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setTitle(`😔 Hasta luego ${member.user.username}`)
      .setDescription(`Esperamos verte pronto de nuevo.`)
      .setColor('Red');
    ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    console.error('Error en guildMemberRemove:', e);
  }
});

/* ───────── EXPRESS KEEP-ALIVE ───────── */
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('✅ Power Luki Bot activo'));
app.listen(PORT, () => console.log(`🌐 Web server escuchando en ${PORT}`));

/* ----------------- LOGIN DEFINITIVO CON AUTO-REINTENTO ----------------- */
const token = process.env.TOKEN;

async function iniciarBot() {
    if (!token) {
        return console.error('❌ ERROR: No hay TOKEN en las variables de entorno.');
    }

    try {
        console.log(`📡 Intentando conectar (Longitud: ${token.length})...`);
        await client.login(token);
        console.log('✅ ¡Bot en línea y conectado a Discord!');
    } catch (error) {
        console.error('⚠️ Error al conectar, reintentando en 10 segundos...', error.message);
        setTimeout(iniciarBot, 10000); // Reintenta cada 10 segundos si falla
    }
}

// Escuchar si la sesión se invalida o se desconecta
client.on('shardDisconnect', () => {
    console.log('🔌 El bot se desconectó. Intentando reconectar...');
    iniciarBot();
});

// Arrancar
iniciarBot();
