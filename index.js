// powerluki-bot-final.js
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

/* ───────── CONFIG ───────── */
const CONFIG = {
  PREFIJO: '!',
  CANALES: {
    TICKETS: '『📖』tickets',
    NIVELES: '『🆙』niveles',
    BIENVENIDOS: '『👋』bienvenidos',
    DESPEDIDAS: '『😔』despedidas',
    SANCIONES: '『🔇』silenciados',
    DESILENCIADOS: '『🔉』desilenciados',
    BANEOS: '『🔨』baneos',
    BANEOS_TEMP: '『⏳』baneos-temporales',
    INVITACIONES: '『🗓』invitaciones',
    DESBANEOS: '『🔓』desbaneos',
    ANUNCIOS: '『📣』anuncios',
    NUEVO: '『🎊』nuevo'
  },
  IMAGENES: {
    PANEL_TICKET: 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png',
    TICKET_INTERIOR: 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg'
    // BIENVENIDA and NIVELES removed as requested
  }
};

/* ───────── PERSISTENCIA ───────── */
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

let tempBans = loadJSON(TEMPBANS_FILE, []); // { guildId, userId, unbanAt, reason, moderatorTag, duration }
let sanctions = loadJSON(SANCTIONS_FILE, []); // { guildId, userId, action, reason, moderator, timestamp, duration? }

const invites = new Collection();
const spamMap = new Map();
const nivelesDB = new Map();
const activeUnbanTimeouts = new Map();
const ticketInactivityTimers = new Map();

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

/* ───────── ROLES STAFF ───────── */
const STAFF_ROLE_NAMES = ['Staff', 'Admin', 'Mod', 'Co-Owner', 'Owner', 'Helper'];
function isStaffMember(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some(r => STAFF_ROLE_NAMES.includes(r.name)) || member.permissions.has(PermissionFlagsBits.Administrator);
}

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);

  // Cargar invites por guild
  client.guilds.cache.forEach(async (guild) => {
    const guildInvites = await guild.invites.fetch().catch(() => new Collection());
    invites.set(guild.id, guildInvites);
  });

  // Registrar comandos por guild
  client.guilds.cache.forEach(async (guild) => {
    try {
      const commands = [
        {
          name: 'ban',
          description: 'Banear permanentemente a un usuario',
          options: [
            { name: 'usuario', description: 'Usuario a banear', type: 6, required: true },
            { name: 'motivo', description: 'Motivo', type: 3, required: false }
          ]
        },
        {
          name: 'tempban',
          description: 'Banear temporalmente a un usuario',
          options: [
            { name: 'usuario', description: 'Usuario a banear', type: 6, required: true },
            { name: 'duracion', description: 'Duración (7d, 12h, 30m)', type: 3, required: true },
            { name: 'motivo', description: 'Motivo', type: 3, required: false }
          ]
        },
        {
          name: 'unban',
          description: 'Desbanear por ID',
          options: [
            { name: 'id', description: 'ID de usuario', type: 3, required: true },
            { name: 'motivo', description: 'Motivo', type: 3, required: false }
          ]
        },
        {
          name: 'sanctions',
          description: 'Ver historial de sanciones de un usuario (solo staff)',
          options: [
            { name: 'usuario', description: 'Usuario a consultar', type: 6, required: true }
          ]
        },
        // New commands: anuncio, nuevo
        {
          name: 'anuncio',
          description: 'Enviar anuncio al canal de anuncios (Staff)',
          options: [
            { name: 'texto', description: 'Contenido del anuncio', type: 3, required: true },
            { name: 'image1', description: 'Imagen (opcional)', type: 11, required: false },
            { name: 'image2', description: 'Imagen 2 (opcional)', type: 11, required: false },
            { name: 'image3', description: 'Imagen 3 (opcional)', type: 11, required: false }
          ]
        },
        {
          name: 'nuevo',
          description: 'Publicar nuevo al canal nuevo (Staff)',
          options: [
            { name: 'texto', description: 'Contenido del nuevo', type: 3, required: true },
            { name: 'image1', description: 'Imagen (opcional)', type: 11, required: false },
            { name: 'image2', description: 'Imagen 2 (opcional)', type: 11, required: false },
            { name: 'image3', description: 'Imagen 3 (opcional)', type: 11, required: false }
          ]
        }
      ];

      // register commands (set replaces guild commands; ensure not wiping others if you have)
      await guild.commands.set(commands);
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

/* ───────── EVENTOS: INVITES, WELCOME, DESPEDIDAS, DESILENCIO, BAN REMOVES ───────── */
client.on('guildMemberAdd', async (member) => {
  const newInv = await member.guild.invites.fetch().catch(() => new Collection());
  const oldInv = invites.get(member.guild.id);
  const used = newInv.find(i => i.uses > (oldInv?.get(i.code)?.uses || 0));
  invites.set(member.guild.id, newInv);

  const canal = member.guild.channels.cache.find(c => c.name === CONFIG.CANALES.INVITACIONES);
  if (canal) {
    canal.send(`📥 **${member.user.tag}** fue invitado por **${used?.inviter?.tag || 'Desconocido'}**`).catch(() => {});
  }

  const canalBien = member.guild.channels.cache.find(c => c.name === CONFIG.CANALES.BIENVENIDOS);
  if (canalBien) {
    const embed = new EmbedBuilder()
      .setTitle('👋 Bienvenido')
      .setDescription(`Bienvenido **${member.user.username}** al servidor`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setColor('Green');
    canalBien.send({ embeds: [embed] }).catch(() => {});
  }
});

client.on('guildMemberRemove', (member) => {
  const canal = member.guild.channels.cache.find(c => c.name === CONFIG.CANALES.DESPEDIDAS);
  if (!canal) return;
  const dEmbed = new EmbedBuilder()
    .setTitle('😔 Adiós...')
    .setColor('#ff4b4b')
    .setDescription(`**${member.user.username}** ha abandonado el servidor.\n¡Esperamos verte pronto de vuelta!`)
    .setFooter({ text: 'Power Luki Network' });
  canal.send({ embeds: [dEmbed] }).catch(() => {});
});

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

client.on('guildBanRemove', async (ban) => {
  try {
    const guild = ban.guild;
    const canalDesb = guild.channels.cache.find(c => c.name === CONFIG.CANALES.DESBANEOS);
    const user = ban.user;
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

/* ───────── INTERACTIONS: SLASH COMMANDS, BUTTONS, MODALS ───────── */
client.on('interactionCreate', async (interaction) => {
  // --- Slash commands ---
  if (interaction.isChatInputCommand()) {
    const name = interaction.commandName;

    // /ban
    if (name === 'ban') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: '❌ No tienes permisos para banear.', ephemeral: true });
      }
      const user = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'No especificado';
      try {
        await interaction.guild.members.ban(user.id, { reason: `Baneado por ${interaction.user.tag} | ${motivo}` });
        logSanction({ guildId: interaction.guild.id, userId: user.id, action: 'PERM_BAN', reason: motivo, moderator: interaction.user.tag, timestamp: Date.now() });
        const canalB = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.BANEOS);
        if (canalB) {
          const embed = new EmbedBuilder().setTitle('🔨 BAN PERMANENTE').setColor('Red')
            .addFields({ name: 'Usuario', value: user.tag, inline: true }, { name: 'Moderador', value: interaction.user.tag, inline: true }, { name: 'Motivo', value: motivo, inline: false }).setTimestamp();
          canalB.send({ embeds: [embed] }).catch(() => {});
        }
        return interaction.reply({ content: `✅ ${user.tag} baneado permanentemente.`, ephemeral: true });
      } catch (err) {
        console.error('Error /ban', err);
        return interaction.reply({ content: '❌ No pude banear a ese usuario.', ephemeral: true });
      }
    }

    // /tempban
    if (name === 'tempban') {
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
        const unbanAt = Date.now() + ms;
        addTempBanRecord({ guildId: interaction.guild.id, userId: user.id, unbanAt, reason: motivo, moderatorTag: interaction.user.tag, duration: durStr });
        scheduleUnban(interaction.guild.id, user.id, unbanAt, interaction.user.tag, motivo);
        logSanction({ guildId: interaction.guild.id, userId: user.id, action: 'TEMP_BAN', reason: motivo, moderator: interaction.user.tag, timestamp: Date.now(), duration: durStr });
        const canalTemp = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.BANEOS_TEMP);
        if (canalTemp) {
          const embed = new EmbedBuilder().setTitle('⏳ BAN TEMPORAL').setColor('Orange')
            .addFields({ name: 'Usuario', value: user.tag, inline: true }, { name: 'Duración', value: durStr, inline: true }, { name: 'Moderador', value: interaction.user.tag, inline: true }, { name: 'Motivo', value: motivo, inline: false }).setTimestamp();
          canalTemp.send({ embeds: [embed] }).catch(() => {});
        }
        return interaction.reply({ content: `⏳ ${user.tag} baneado por ${durStr}.`, ephemeral: true });
      } catch (err) {
        console.error('Error /tempban', err);
        return interaction.reply({ content: '❌ No pude banear a ese usuario.', ephemeral: true });
      }
    }

    // /unban
    if (name === 'unban') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: '❌ No tienes permisos para desbanear.', ephemeral: true });
      }
      const id = interaction.options.getString('id');
      const motivo = interaction.options.getString('motivo') || 'No especificado';
      try {
        await interaction.guild.members.unban(id, motivo);
        logSanction({ guildId: interaction.guild.id, userId: id, action: 'UNBAN_MANUAL', reason: motivo, moderator: interaction.user.tag, timestamp: Date.now() });
        const canalDesb = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.DESBANEOS);
        if (canalDesb) {
          const embed = new EmbedBuilder().setTitle('🔓 Desbaneo Manual').setDescription(`El ID \`${id}\` fue desbaneado por ${interaction.user.tag}\nMotivo: ${motivo}`).setTimestamp().setColor('Green');
          canalDesb.send({ embeds: [embed] }).catch(() => {});
        }
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
    if (name === 'sanctions') {
      if (!isStaffMember(interaction.member)) return interaction.reply({ content: '❌ Solo staff puede usar este comando.', ephemeral: true });
      const target = interaction.options.getUser('usuario', true);
      const userId = target.id;
      const entries = sanctions.filter(s => s.userId === userId && ['PERM_BAN', 'TEMP_BAN', 'AUTO_UNBAN', 'AUTO_UNBAN_IMMEDIATE', 'UNBAN_MANUAL', 'UNBAN'].includes(s.action));
      if (!entries || entries.length === 0) return interaction.reply({ content: `No se encontraron baneos/desbaneos para ${target.tag}.`, ephemeral: true });
      const embed = new EmbedBuilder().setTitle(`Sanciones de ${target.tag}`).setColor('#FFCC00').setFooter({ text: 'Mostrando baneos y desbaneos' });
      entries.slice(-10).reverse().forEach(e => {
        const fecha = new Date(e.timestamp).toLocaleString();
        const label = `${e.action}${e.duration ? ` (${e.duration})` : ''}`;
        embed.addFields({ name: label, value: `Fecha: ${fecha}\nModerador: ${e.moderator || e.moderatorTag || 'Sistema'}\nRazón: ${e.reason || 'No especificada'}` });
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /anuncio
    if (name === 'anuncio') {
      if (!isStaffMember(interaction.member)) return interaction.reply({ content: '❌ Solo staff puede usar este comando.', ephemeral: true });
      const texto = interaction.options.getString('texto', true);
      const att1 = interaction.options.getAttachment('image1');
      const att2 = interaction.options.getAttachment('image2');
      const att3 = interaction.options.getAttachment('image3');

      const canal = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.ANUNCIOS);
      if (!canal) return interaction.reply({ content: `❌ Canal ${CONFIG.CANALES.ANUNCIOS} no encontrado.`, ephemeral: true });

      // Build embed
      const embed = new EmbedBuilder()
        .setTitle('📣 Anuncio')
        .setDescription(texto)
        .setFooter({ text: `Anunciado por ${interaction.user.tag}` })
        .setTimestamp()
        .setColor('#0099ff');

      // Attachments array
      const files = [];
      if (att1) files.push({ attachment: att1.url, name: att1.name || 'image1' });
      if (att2) files.push({ attachment: att2.url, name: att2.name || 'image2' });
      if (att3) files.push({ attachment: att3.url, name: att3.name || 'image3' });

      // Send: content with spoiler mention, embed, files (files show after embed)
      await canal.send({ content: '||@everyone||', embeds: [embed], files }).catch(err => console.error('Error enviando anuncio', err));
      return interaction.reply({ content: '✅ Anuncio enviado.', ephemeral: true });
    }

    // /nuevo
    if (name === 'nuevo') {
      if (!isStaffMember(interaction.member)) return interaction.reply({ content: '❌ Solo staff puede usar este comando.', ephemeral: true });
      const texto = interaction.options.getString('texto', true);
      const att1 = interaction.options.getAttachment('image1');
      const att2 = interaction.options.getAttachment('image2');
      const att3 = interaction.options.getAttachment('image3');

      const canal = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.NUEVO);
      if (!canal) return interaction.reply({ content: `❌ Canal ${CONFIG.CANALES.NUEVO} no encontrado.`, ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('🎊 Nuevo')
        .setDescription(texto)
        .setFooter({ text: `Publicado por ${interaction.user.tag}` })
        .setTimestamp()
        .setColor('#00cc66');

      const files = [];
      if (att1) files.push({ attachment: att1.url, name: att1.name || 'image1' });
      if (att2) files.push({ attachment: att2.url, name: att2.name || 'image2' });
      if (att3) files.push({ attachment: att3.url, name: att3.name || 'image3' });

      // Add required fixed image at the end
      files.push({ attachment: 'https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg', name: 'nuevo_end.jpg' });

      await canal.send({ content: '||@everyone||', embeds: [embed], files }).catch(err => console.error('Error enviando nuevo', err));
      return interaction.reply({ content: '✅ Nuevo publicado.', ephemeral: true });
    }
  } // end slash command handling

  // --- Buttons for ticket panel ---
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (!id.startsWith('ticket_')) {
      // ticket_close also handled below
    } else {
      const tipo = id.split('_')[1];
      const modal = new ModalBuilder().setCustomId(`modal_${tipo}_${interaction.user.id}`).setTitle(`Ticket - ${tipo.toUpperCase()}`);

      if (tipo === 'soporte') {
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('soporte_asunto').setLabel('Asunto').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('soporte_desc').setLabel('Describe tu problema').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
      } else if (tipo === 'reportes') {
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reportes_objetivo').setLabel('Usuario objetivo (tag o ID)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reportes_prueba').setLabel('Pruebas / enlaces / descripción').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
      } else if (tipo === 'tienda') {
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tienda_item').setLabel('Producto / servicio').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tienda_detalle').setLabel('Detalles / presupuesto').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
      } else {
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('otros_titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('otros_descripcion').setLabel('Descripción').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
      }

      await interaction.showModal(modal).catch(() => {});
      return;
    }
  }

  // --- Modal submit -> crear canal ticket ---
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    if (!customId.startsWith('modal_')) return;
    const parts = customId.split('_');
    const tipo = parts[1];
    const baseName = `ticket-${tipo}-${interaction.user.username.toLowerCase().replace(/[^a-z0-9\-]/g, '')}`.slice(0, 90);

    // role overwrites for staff
    const roleOverwrites = STAFF_ROLE_NAMES.map(name => {
      const role = interaction.guild.roles.cache.find(r => r.name === name);
      return role ? { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] } : null;
    }).filter(Boolean);

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

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'));

    await ticketChannel.send({ content, components: [row] }).catch(() => {});
    await interaction.reply({ content: `✅ Ticket creado: ${ticketChannel}`, ephemeral: true });

    // Programar auto-cierre por inactividad (3 días)
    const INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000;
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
  }

  // botón cerrar ticket manual
  if (interaction.isButton() && interaction.customId === 'ticket_close') {
    await interaction.reply({ content: '🔒 Cerrando ticket en 5 segundos...', ephemeral: true }).catch(() => {});
    setTimeout(() => {
      if (interaction.channel?.delete) interaction.channel.delete().catch(() => {});
    }, 5000);
    return;
  }
});

/* ───────── MENSAJES: anti-spam, niveles, reiniciar timers de tickets ───────── */
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

  // ANTI-SPAM
  const userId = message.author.id;
  const now = Date.now();
  const sData = spamMap.get(userId) || { count: 0, last: now };
  sData.count = now - sData.last > 7000 ? 1 : sData.count + 1;
  sData.last = now;
  spamMap.set(userId, sData);
  if (sData.count >= 5) {
    const member = message.member;
    if (member && !member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await member.timeout(10 * 60 * 1000, 'Spam automático').catch(() => {});
      const logCanal = message.guild.channels.cache.find(c => c.name === CONFIG.CANALES.SANCIONES);
      if (logCanal) logCanal.send(`🔇 **${member.user.tag}** silenciado 10 min por spam.`).catch(() => {});
      logSanction({ guildId: message.guild.id, userId: member.id, action: 'TIMEOUT_SPAM', reason: 'Spam detectado por sistema', moderator: 'Sistema', timestamp: Date.now() });
    }
    spamMap.delete(userId);
  }

  // NIVELES (sin imágenes)
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
          .setTitle('🆙 Nivel Subido')
          .setColor('#FFD700')
          .setThumbnail(message.author.displayAvatarURL())
          .setDescription(`🎉 **${message.author.username}** ha subido al **Nivel ${data.nivel}**`)
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
