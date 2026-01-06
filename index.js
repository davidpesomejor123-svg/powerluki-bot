// powerluki-bot-completo.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Collection,
  PermissionFlagsBits
} from 'discord.js';

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── RUTAS Y PERSISTENCIA ───────── */
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const TEMPBANS_FILE = path.join(DATA_DIR, 'tempbans.json');
const SANCTIONS_FILE = path.join(DATA_DIR, 'sanctions.json');

function loadJSON(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || 'null') ?? defaultValue;
  } catch (err) {
    console.error('Error leyendo JSON', filePath, err);
    return defaultValue;
  }
}
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error escribiendo JSON', filePath, err);
  }
}

/* ───────── DATOS EN MEMORIA ───────── */
let tempBans = loadJSON(TEMPBANS_FILE, []); // { guildId, userId, unbanAt, reason, moderatorTag }
let sanctions = loadJSON(SANCTIONS_FILE, []); // { guildId, userId, action, reason, moderator, timestamp, duration? }

const invites = new Collection();
const spamMap = new Map();
const nivelesDB = new Map();

// Map para timeouts activos de auto-unban: key = `${guildId}_${userId}`
const activeUnbanTimeouts = new Map();
// Map para timers de cierre de ticket: key = channelId -> timeoutId
const ticketInactivityTimers = new Map();

/* ───────── CONFIG ───────── */
const CONFIG = {
  PREFIJO: '!',
  CANALES: {
    TICKETS: '『📖』tickets',
    NIVELOS: '『🆙』niveles',
    BIENVENIDOS: '『👋』bienvenidos',
    DESPEDIDAS: '『😔』despedidas',
    SANCIONES: '『🔇』silenciados',
    DESILENCIADOS: '『🔉』desilenciados',
    BANEOS: '『🔨』baneos',
    BANEOS_TEMP: '『⏳』baneos-temporales',
    INVITACIONES: '『🗓』invitaciones',
    DESBANEOS: '『🔓』desbaneos'
  },
  IMAGENES: {
    PANEL_TICKET: 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png',
    TICKET_INTERIOR: 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg',
    BIENVENIDA: 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png',
    NIVELES: 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png'
  }
};

/* ───────── UTILIDADES ───────── */
function parseDuration(str) {
  if (!str) return null;
  const match = /^(\d+)(d|h|m|s)$/.exec(str);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'd': return n * 24 * 60 * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'm': return n * 60 * 1000;
    case 's': return n * 1000;
    default: return null;
  }
}

function logSanction(entry) {
  sanctions.push(entry);
  saveJSON(SANCTIONS_FILE, sanctions);
}

function addTempBanRecord(record) {
  tempBans.push(record);
  saveJSON(TEMPBANS_FILE, tempBans);
}
function removeTempBanRecord(guildId, userId) {
  tempBans = tempBans.filter(b => !(b.guildId === guildId && b.userId === userId));
  saveJSON(TEMPBANS_FILE, tempBans);
}

/* ───────── SCHEDULE UNBAN (persistente) ───────── */
function scheduleUnban(guildId, userId, unbanAt, moderatorTag, reason) {
  const key = `${guildId}_${userId}`;
  const msLeft = unbanAt - Date.now();
  if (msLeft <= 0) {
    // Desban inmediato
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      guild.members.unban(userId, 'Auto-unban: tiempo cumplido').catch(() => {});
      logSanction({
        guildId,
        userId,
        action: 'AUTO_UNBAN_IMMEDIATE',
        reason: reason || 'Tiempo cumplido',
        moderator: moderatorTag || 'Sistema',
        timestamp: Date.now()
      });
    }
    removeTempBanRecord(guildId, userId);
    return;
  }

  // Limpiar si ya existe
  if (activeUnbanTimeouts.has(key)) {
    clearTimeout(activeUnbanTimeouts.get(key));
    activeUnbanTimeouts.delete(key);
  }

  const timeoutId = setTimeout(async () => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        await guild.members.unban(userId, 'Auto-unban: tiempo cumplido').catch(() => {});
        logSanction({
          guildId,
          userId,
          action: 'AUTO_UNBAN',
          reason: reason || 'Tiempo cumplido',
          moderator: moderatorTag || 'Sistema',
          timestamp: Date.now()
        });
        // Notificar en canal de desban
        const canalDesb = guild.channels.cache.find(c => c.name === CONFIG.CANALES.DESBANEOS);
        if (canalDesb) {
          const embed = new EmbedBuilder()
            .setTitle('🔓 Auto-Desbaneo')
            .setDescription(`El usuario <@${userId}> ha sido desbaneado automáticamente.`)
            .setTimestamp()
            .setColor('Green');
          canalDesb.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Error al ejecutar auto-unban', err);
    } finally {
      removeTempBanRecord(guildId, userId);
      activeUnbanTimeouts.delete(key);
    }
  }, msLeft);

  activeUnbanTimeouts.set(key, timeoutId);
}

/* ───────── ROLES PERMITIDOS PARA /sanctions ───────── */
const ALLOWED_ROLE_NAMES = ['Staff', 'Admin', 'Mod', 'Co-Owner', 'Owner', 'Helper'];
function isStaffMember(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some(r => ALLOWED_ROLE_NAMES.includes(r.name)) || member.permissions.has(PermissionFlagsBits.Administrator);
}

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);

  // Cargar invites por guild
  client.guilds.cache.forEach(async (guild) => {
    const guildInvites = await guild.invites.fetch().catch(() => new Collection());
    invites.set(guild.id, guildInvites);
  });

  // Registrar comandos por guild (ban/tempban/unban/sanctions)
  client.guilds.cache.forEach(async (guild) => {
    try {
      await guild.commands.create({
        name: 'ban',
        description: 'Banear permanentemente a un usuario',
        options: [
          { name: 'usuario', description: 'Usuario a banear', type: 6, required: true },
          { name: 'motivo', description: 'Motivo', type: 3, required: false }
        ]
      });
      await guild.commands.create({
        name: 'tempban',
        description: 'Banear temporalmente a un usuario',
        options: [
          { name: 'usuario', description: 'Usuario a banear', type: 6, required: true },
          { name: 'duracion', description: 'Duración (7d, 12h, 30m)', type: 3, required: true },
          { name: 'motivo', description: 'Motivo', type: 3, required: false }
        ]
      });
      await guild.commands.create({
        name: 'unban',
        description: 'Desbanear por ID',
        options: [
          { name: 'id', description: 'ID de usuario', type: 3, required: true },
          { name: 'motivo', description: 'Motivo', type: 3, required: false }
        ]
      });
      await guild.commands.create({
        name: 'sanctions',
        description: 'Ver historial de sanciones de un usuario (solo staff)',
        options: [
          { name: 'usuario', description: 'Usuario a consultar', type: 6, required: true }
        ]
      });
    } catch (err) {
      console.error('Error creando comandos en guild', guild.id, err);
    }
  });

  // Restaurar timers de tempBans
  for (const b of tempBans.slice()) {
    scheduleUnban(b.guildId, b.userId, b.unbanAt, b.moderatorTag, b.reason);
  }

  // Enviar panel de tickets si no existe
  const canalTickets = client.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS);
  if (canalTickets) {
    const msgs = await canalTickets.messages.fetch({ limit: 20 }).catch(() => null);
    if (!msgs || !msgs.some(m => m.author?.id === client.user.id)) {
      const embed = new EmbedBuilder()
        .setTitle('🎫 Centro de Soporte | Power Luki Network')
        .setColor('#2b2d31')
        .setDescription('Selecciona una opción para abrir un ticket y completa el formulario.')
        .setImage(CONFIG.IMAGENES.PANEL_TICKET);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_soporte').setLabel('Soporte').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
        new ButtonBuilder().setCustomId('ticket_reportes').setLabel('Reportes').setStyle(ButtonStyle.Danger).setEmoji('🚨'),
        new ButtonBuilder().setCustomId('ticket_tienda').setLabel('Tienda').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('ticket_otros').setLabel('Otros').setStyle(ButtonStyle.Secondary).setEmoji('❓')
      );

      canalTickets.send({ embeds: [embed], components: [row] }).catch(() => {});
    }
  }
});

/* ───────── EVENTOS DE INVITES (bienvenida con quien invitó) ───────── */
client.on('guildMemberAdd', async (member) => {
  const newInv = await member.guild.invites.fetch().catch(() => new Collection());
  const oldInv = invites.get(member.guild.id);
  const used = newInv.find(i => i.uses > (oldInv?.get(i.code)?.uses || 0));
  invites.set(member.guild.id, newInv);

  const canal = member.guild.channels.cache.find(c => c.name === CONFIG.CANALES.INVITACIONES);
  if (canal) {
    canal.send(`📥 **${member.user.tag}** fue invitado por **${used?.inviter?.tag || 'Desconocido'}**`).catch(() => {});
  }
});

/* ───────── DESILENCIO AUTOMÁTICO (cuando termina timeout) ───────── */
client.on('guildMemberUpdate', (oldMember, newMember) => {
  if (oldMember.communicationDisabledUntilTimestamp && !newMember.communicationDisabledUntilTimestamp) {
    const canal = newMember.guild.channels.cache.find(c => c.name === CONFIG.CANALES.DESILENCIADOS);
    if (canal) {
      canal.send(`🔊 El usuario ${newMember.user.tag} ha sido desilenciado automáticamente.`).catch(() => {});
      logSanction({
        guildId: newMember.guild.id,
        userId: newMember.id,
        action: 'DESILENCIADO',
        reason: 'Timeout expirado',
        moderator: 'Sistema',
        timestamp: Date.now()
      });
    }
  }
});

/* ───────── ESCUCHAR DESBANEOS (manuales desde UI) ───────── */
client.on('guildBanRemove', async (ban) => {
  try {
    const guild = ban.guild;
    const canalDesb = guild.channels.cache.find(c => c.name === CONFIG.CANALES.DESBANEOS);
    const user = ban.user;
    // Log en archivo
    logSanction({
      guildId: guild.id,
      userId: user.id,
      action: 'UNBAN_MANUAL',
      reason: 'Desbaneo manual (evento guildBanRemove)',
      moderator: 'Desconocido',
      timestamp: Date.now()
    });
    if (canalDesb) {
      const embed = new EmbedBuilder()
        .setTitle('🔓 Usuario Desbaneado (manual)')
        .setDescription(`${user.tag} fue desbaneado.`)
        .setTimestamp()
        .setColor('Green');
      canalDesb.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('Error en guildBanRemove', err);
  }
});

/* ───────── INTERACTION: SLASH COMMANDS & TICKETS (botones/modals) ───────── */
client.on('interactionCreate', async (interaction) => {
  // --- Slash commands handling ---
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // /ban permanent
    if (commandName === 'ban') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: '❌ No tienes permisos para banear.', ephemeral: true });
      }

      const user = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'No especificado';

      try {
        await interaction.guild.members.ban(user.id, { reason: `Baneado por ${interaction.user.tag} | ${motivo}` });

        // Log en archivo
        logSanction({
          guildId: interaction.guild.id,
          userId: user.id,
          action: 'PERM_BAN',
          reason: motivo,
          moderator: interaction.user.tag,
          timestamp: Date.now()
        });

        const canalB = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.BANEOS);
        if (canalB) {
          const embed = new EmbedBuilder()
            .setTitle('🔨 BAN PERMANENTE')
            .setColor('Red')
            .addFields(
              { name: 'Usuario', value: user.tag, inline: true },
              { name: 'Moderador', value: interaction.user.tag, inline: true },
              { name: 'Motivo', value: motivo, inline: false }
            )
            .setTimestamp();
          canalB.send({ embeds: [embed] }).catch(() => {});
        }

        return interaction.reply({ content: `✅ ${user.tag} baneado permanentemente.`, ephemeral: true });
      } catch (err) {
        console.error('Error /ban', err);
        return interaction.reply({ content: '❌ No pude banear a ese usuario.', ephemeral: true });
      }
    }

    // /tempban
    if (commandName === 'tempban') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: '❌ No tienes permisos para banear.', ephemeral: true });
      }
      const user = interaction.options.getUser('usuario');
      const durStr = interaction.options.getString('duracion');
      const motivo = interaction.options.getString('motivo') || 'No especificado';

      const ms = parseDuration(durStr);
      if (!ms) return interaction.reply({ content: '❌ Duración inválida. Usa e.g. 7d, 12h, 30m, 45s', ephemeral: true });

      try {
        await interaction.guild.members.ban(user.id, { reason: `Tempban por ${interaction.user.tag} | ${motivo}` });

        // Registrar tempban y programar desbaneo
        const unbanAt = Date.now() + ms;
        addTempBanRecord({
          guildId: interaction.guild.id,
          userId: user.id,
          unbanAt,
          reason: motivo,
          moderatorTag: interaction.user.tag,
          duration: durStr
        });
        scheduleUnban(interaction.guild.id, user.id, unbanAt, interaction.user.tag, motivo);

        logSanction({
          guildId: interaction.guild.id,
          userId: user.id,
          action: 'TEMP_BAN',
          reason: motivo,
          moderator: interaction.user.tag,
          timestamp: Date.now(),
          duration: durStr
        });

        const canalTemp = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.BANEOS_TEMP);
        if (canalTemp) {
          const embed = new EmbedBuilder()
            .setTitle('⏳ BAN TEMPORAL')
            .setColor('Orange')
            .addFields(
              { name: 'Usuario', value: user.tag, inline: true },
              { name: 'Duración', value: durStr, inline: true },
              { name: 'Moderador', value: interaction.user.tag, inline: true },
              { name: 'Motivo', value: motivo, inline: false }
            )
            .setTimestamp();
          canalTemp.send({ embeds: [embed] }).catch(() => {});
        }

        return interaction.reply({ content: `⏳ ${user.tag} baneado por ${durStr}.`, ephemeral: true });

      } catch (err) {
        console.error('Error /tempban', err);
        return interaction.reply({ content: '❌ No pude banear a ese usuario.', ephemeral: true });
      }
    }

    // /unban
    if (commandName === 'unban') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: '❌ No tienes permisos para desbanear.', ephemeral: true });
      }
      const id = interaction.options.getString('id');
      const motivo = interaction.options.getString('motivo') || 'No especificado';

      try {
        await interaction.guild.members.unban(id, motivo);

        // Log
        logSanction({
          guildId: interaction.guild.id,
          userId: id,
          action: 'UNBAN_MANUAL',
          reason: motivo,
          moderator: interaction.user.tag,
          timestamp: Date.now()
        });

        const canalDesb = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.DESBANEOS);
        if (canalDesb) {
          const embed = new EmbedBuilder()
            .setTitle('🔓 Desbaneo Manual')
            .setDescription(`El ID \`${id}\` fue desbaneado por ${interaction.user.tag}\nMotivo: ${motivo}`)
            .setTimestamp()
            .setColor('Green');
          canalDesb.send({ embeds: [embed] }).catch(() => {});
        }

        // Si existía un tempban programado, quitar registro y timeout
        removeTempBanRecord(interaction.guild.id, id);
        const key = `${interaction.guild.id}_${id}`;
        if (activeUnbanTimeouts.has(key)) {
          clearTimeout(activeUnbanTimeouts.get(key));
          activeUnbanTimeouts.delete(key);
        }

        return interaction.reply({ content: '✅ Usuario desbaneado correctamente.', ephemeral: true });
      } catch (err) {
        console.error('Error /unban', err);
        return interaction.reply({ content: '❌ No pude desbanear (ID inválida o rol superior).', ephemeral: true });
      }
    }

    // /sanctions
    if (commandName === 'sanctions') {
      // Solo staff
      if (!isStaffMember(interaction.member)) {
        return interaction.reply({ content: '❌ Solo staff puede usar este comando.', ephemeral: true });
      }

      const target = interaction.options.getUser('usuario', true);
      const userId = target.id;

      // Cargar sanciones desde archivo (ya en memoria)
      const entries = sanctions.filter(s => s.userId === userId &&
        ['PERM_BAN', 'TEMP_BAN', 'AUTO_UNBAN', 'AUTO_UNBAN_IMMEDIATE', 'UNBAN_MANUAL', 'UNBAN', 'UNBAN_AUTO', 'UNBAN_MANUAL'].includes(s.action)
      );

      if (!entries || entries.length === 0) {
        return interaction.reply({ content: `No se encontraron baneos/desbaneos para ${target.tag}.`, ephemeral: true });
      }

      // Construir embed con máximo 10 entradas (para no pasar el límite)
      const embed = new EmbedBuilder()
        .setTitle(`Sanciones de ${target.tag}`)
        .setColor('#FFCC00')
        .setFooter({ text: 'Mostrando baneos y desbaneos' });

      entries.slice(-10).reverse().forEach(e => {
        const fecha = new Date(e.timestamp).toLocaleString();
        const label = `${e.action}${e.duration ? ` (${e.duration})` : ''}`;
        embed.addFields({
          name: label,
          value: `Fecha: ${fecha}\nModerador: ${e.moderator || e.moderatorTag || 'Sistema'}\nRazón: ${e.reason || 'No especificada'}`,
        });
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } // end slash

  // --- Buttons for ticket panel ---
  if (interaction.isButton()) {
    const id = interaction.customId; // e.g. ticket_soporte, ticket_reportes...
    if (!id.startsWith('ticket_')) return;

    // Crear modal personalizado según tipo
    const tipo = id.split('_')[1]; // soporte, reportes, tienda, otros
    const modal = new ModalBuilder().setCustomId(`modal_${tipo}_${interaction.user.id}`).setTitle(`Ticket - ${tipo.toUpperCase()}`);

    // Campos personalizados por tipo
    if (tipo === 'soporte') {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('soporte_asunto').setLabel('Asunto').setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('soporte_desc').setLabel('Describe tu problema').setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
    } else if (tipo === 'reportes') {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reportes_objetivo').setLabel('Usuario objetivo (tag o ID)').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reportes_prueba').setLabel('Pruebas / enlaces / descripción').setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
    } else if (tipo === 'tienda') {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('tienda_item').setLabel('Producto / servicio').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('tienda_detalle').setLabel('Detalles / presupuesto').setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
    } else { // otros
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('otros_titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('otros_descripcion').setLabel('Descripción').setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
    }

    await interaction.showModal(modal).catch(() => {});
    return;
  }

  // --- Modal submit -> crear canal ticket ---
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId; // e.g. modal_soporte_userid
    if (!customId.startsWith('modal_')) return;

    // extraer tipo y autor
    const parts = customId.split('_');
    const tipo = parts[1]; // soporte, reportes, tienda, otros

    // construir nombre de canal
    const baseName = `ticket-${tipo}-${interaction.user.username.toLowerCase().replace(/[^a-z0-9\-]/g, '')}`.slice(0, 90);

    // roles que pueden ver tickets (buscamos por nombre)
    const roleNames = ALLOWED_ROLE_NAMES; // Staff/Admin/Mod/Co-Owner/Owner/Helper
    const roleOverwrites = roleNames.map(name => {
      const role = interaction.guild.roles.cache.find(r => r.name === name);
      return role ? { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] } : null;
    }).filter(Boolean);

    // permisos para @everyone: deny view
    const overwrites = [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...roleOverwrites
    ];

    const ticketChannel = await interaction.guild.channels.create({
      name: baseName,
      type: ChannelType.GuildText,
      permissionOverwrites: overwrites
    }).catch(err => {
      console.error('Error creando canal ticket', err);
      return null;
    });

    if (!ticketChannel) return interaction.reply({ content: '❌ No pude crear el ticket.', ephemeral: true });

    // construir mensaje inicial dependiendo del tipo, usando valores del modal
    let content = `🎫 **Ticket ${tipo.toUpperCase()} creado por** ${interaction.user.tag}\n\n`;
    if (tipo === 'soporte') {
      const asunto = interaction.fields.getTextInputValue('soporte_asunto');
      const desc = interaction.fields.getTextInputValue('soporte_desc');
      content += `**Asunto:** ${asunto}\n**Detalle:**\n${desc}`;
    } else if (tipo === 'reportes') {
      const objetivo = interaction.fields.getTextInputValue('reportes_objetivo');
      const pruebas = interaction.fields.getTextInputValue('reportes_prueba');
      content += `**Objetivo:** ${objetivo}\n**Pruebas / Descripción:**\n${pruebas}`;
    } else if (tipo === 'tienda') {
      const item = interaction.fields.getTextInputValue('tienda_item');
      const detalle = interaction.fields.getTextInputValue('tienda_detalle');
      content += `**Producto / Servicio:** ${item}\n**Detalles:**\n${detalle}`;
    } else {
      const titulo = interaction.fields.getTextInputValue('otros_titulo');
      const descripcion = interaction.fields.getTextInputValue('otros_descripcion');
      content += `**Título:** ${titulo}\n**Descripción:**\n${descripcion}`;
    }

    // Botón para cerrar (manual)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await ticketChannel.send({ content, components: [row] }).catch(() => {});
    await interaction.reply({ content: `✅ Ticket creado: ${ticketChannel}`, ephemeral: true });

    // Programar cierre automático por inactividad (3 días)
    const INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000; // 3 días
    function scheduleTicketClose(channel) {
      if (ticketInactivityTimers.has(channel.id)) {
        clearTimeout(ticketInactivityTimers.get(channel.id));
        ticketInactivityTimers.delete(channel.id);
      }
      const t = setTimeout(async () => {
        try {
          await channel.send('⚠️ Este ticket se cierra por inactividad (3 días).').catch(() => {});
          await channel.delete().catch(() => {});
        } catch (e) {
          console.error('Error cerrando ticket por inactividad', e);
        } finally {
          ticketInactivityTimers.delete(channel.id);
        }
      }, INACTIVITY_MS);
      ticketInactivityTimers.set(channel.id, t);
    }
    scheduleTicketClose(ticketChannel);
    return;
  } // end modal submit

  // --- botón cerrar ticket manual ---
  if (interaction.isButton() && interaction.customId === 'ticket_close') {
    // permiso: quien puede cerrar? quien tenga rol staff o el autor del ticket (si está en permisos)
    await interaction.reply({ content: '🔒 Cerrando ticket en 5 segundos...', ephemeral: true }).catch(() => {});
    setTimeout(() => {
      if (interaction.channel?.delete) interaction.channel.delete().catch(() => {});
    }, 5000);
    return;
  }
});

/* ───────── MANEJO DE MENSAJES (niveles, anti-spam, reiniciar timers de tickets) ───────── */
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // Reiniciar temporizador de inactividad si es un canal ticket-*
  if (message.channel && message.channel.name && message.channel.name.startsWith('ticket-')) {
    const chId = message.channel.id;
    if (ticketInactivityTimers.has(chId)) {
      clearTimeout(ticketInactivityTimers.get(chId));
      ticketInactivityTimers.delete(chId);
    }
    // reprogramar 3 días
    const INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000;
    const t = setTimeout(async () => {
      try {
        await message.channel.send('⚠️ Este ticket se cierra por inactividad (3 días).').catch(() => {});
        await message.channel.delete().catch(() => {});
      } catch (e) {
        console.error('Error cerrando ticket por inactividad (msg)', e);
      } finally {
        ticketInactivityTimers.delete(chId);
      }
    }, INACTIVITY_MS);
    ticketInactivityTimers.set(chId, t);
  }

  // ANTI-SPAM (igual que antes)
  const userId = message.author.id;
  const now = Date.now();
  const sData = spamMap.get(userId) || { count: 0, last: now };
  sData.count = now - sData.last > 7000 ? 1 : sData.count + 1;
  sData.last = now;
  spamMap.set(userId, sData);
  if (sData.count >= 5) {
    const member = message.member;
    if (member && !member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await member.timeout(10 * 60 * 1000, 'Spam automático').catch(() => {});
      const logCanal = message.guild.channels.cache.find(c => c.name === CONFIG.CANALES.SANCIONES);
      if (logCanal) logCanal.send(`🔇 **${member.user.tag}** silenciado 10 min por spam.`).catch(() => {});
      logSanction({
        guildId: message.guild.id,
        userId: member.id,
        action: 'TIMEOUT_SPAM',
        reason: 'Spam detectado por sistema',
        moderator: 'Sistema',
        timestamp: Date.now()
      });
    }
    spamMap.delete(userId);
  }

  // NIVELES (igual que antes)
  let data = nivelesDB.get(userId) || { xp: 0, nivel: 1, lastXP: 0 };
  if (Date.now() - data.lastXP > 60000) {
    const xpGanada = Math.floor(Math.random() * 15) + 10;
    data.xp += xpGanada;
    data.lastXP = Date.now();
    const proximoNivel = data.nivel * 200;
    if (data.xp >= proximoNivel) {
      data.nivel++;
      data.xp = 0;
      const canalNiveles = message.guild.channels.cache.find(c => c.name === CONFIG.CANALES.NIVELES);
      if (canalNiveles) {
        const lvEmbed = new EmbedBuilder()
          .setTitle('¡LEVEL UP!')
          .setColor('#FFD700')
          .setThumbnail(message.author.displayAvatarURL())
          .setDescription(`🎉 **${message.author.username}** ha subido al **Nivel ${data.nivel}**`)
          .setImage(CONFIG.IMAGENES.NIVELES)
          .setFooter({ text: '¡Sigue participando para subir más!' });
        canalNiveles.send({ content: `¡Felicidades ${message.author}!`, embeds: [lvEmbed] }).catch(() => {});
      }
    }
    nivelesDB.set(userId, data);
  }
});

/* ───────── SERVIDOR WEB (KEEP ALIVE) ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Luki Bot Online ✅'));
app.listen(process.env.PORT || 10000, () => client.login(process.env.TOKEN));

/* ───────── FIN DEL ARCHIVO ───────── */
