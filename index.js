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
  MAIN_GUILD_ID: '1340442398442127480',
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

let tempBans = loadJSON(TEMPBANS_FILE, []);
let sanctions = loadJSON(SANCTIONS_FILE, []);

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
      logSanction({ guildId, userId, action: 'AUTO_UNBAN_IMMEDIATE', reason: reason || 'Tiempo cumplido', moderator: moderatorTag || 'Sistema', timestamp: Date.now() });
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
        logSanction({ guildId, userId, action: 'AUTO_UNBAN', reason: reason || 'Tiempo cumplido', moderator: moderatorTag || 'Sistema', timestamp: Date.now() });
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

  // Registrar comandos por guild (igual que antes)
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

/* ───────── EVENTOS (igual que antes) ───────── */
// ... (mantenido) - no changes needed for these event handlers in canvas

/* ───────── INTERACTIONS: SLASH COMMANDS, BUTTONS, MODALS ───────── */
client.on('interactionCreate', async (interaction) => {
  try {
    // --- Slash commands ---
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // ===== /ANUNCIO =====
      if (commandName === 'anuncio') {
        if (!isStaffMember(interaction.member)) {
          return interaction.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
        }

        const mainGuild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID);
        if (!mainGuild) {
          return interaction.reply({ content: '❌ No puedo acceder al servidor principal.', ephemeral: true });
        }

        const canal = mainGuild.channels.cache.find(c => c.name === CONFIG.CANALES.ANUNCIOS);
        if (!canal) {
          return interaction.reply({ content: '❌ No se encontró el canal de anuncios en el servidor principal.', ephemeral: true });
        }

        const texto = interaction.options.getString('texto', true);
        const att1 = interaction.options.getAttachment('image1');
        const att2 = interaction.options.getAttachment('image2');
        const att3 = interaction.options.getAttachment('image3');

        const embed = new EmbedBuilder()
          .setTitle('📣 Anuncio Oficial')
          .setDescription(texto)
          .setColor('#0099ff')
          .setFooter({ text: `Enviado por ${interaction.user.tag}` })
          .setTimestamp();

        const files = [];
        if (att1) files.push({ attachment: att1.url, name: att1.name || 'image1' });
        if (att2) files.push({ attachment: att2.url, name: att2.name || 'image2' });
        if (att3) files.push({ attachment: att3.url, name: att3.name || 'image3' });

        try {
          await canal.send({ content: '||@everyone||', embeds: [embed], files });
          return interaction.reply({ content: '✅ Anuncio enviado al servidor principal.', ephemeral: true });
        } catch (err) {
          console.error('Error enviando anuncio', err);
          return interaction.reply({ content: '❌ Error al enviar anuncio. Revisa permisos y tamaño de archivo.', ephemeral: true });
        }
      }

      // ===== /NUEVO =====
      if (commandName === 'nuevo') {
        if (!isStaffMember(interaction.member)) {
          return interaction.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
        }

        const mainGuild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID);
        if (!mainGuild) {
          return interaction.reply({ content: '❌ No puedo acceder al servidor principal.', ephemeral: true });
        }

        const canal = mainGuild.channels.cache.find(c => c.name === CONFIG.CANALES.NUEVO);
        if (!canal) {
          return interaction.reply({ content: '❌ No se encontró el canal de nuevo en el servidor principal.', ephemeral: true });
        }

        const texto = interaction.options.getString('texto', true);
        const att1 = interaction.options.getAttachment('image1');
        const att2 = interaction.options.getAttachment('image2');
        const att3 = interaction.options.getAttachment('image3');

        const embed = new EmbedBuilder()
          .setTitle('🎊 Nuevo')
          .setDescription(texto)
          .setColor('#00cc66')
          .setFooter({ text: `Publicado por ${interaction.user.tag}` })
          .setTimestamp();

        const files = [];
        if (att1) files.push({ attachment: att1.url, name: att1.name || 'image1' });
        if (att2) files.push({ attachment: att2.url, name: att2.name || 'image2' });
        if (att3) files.push({ attachment: att3.url, name: att3.name || 'image3' });
        // imagen obligatoria al final
        files.push({ attachment: 'https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg', name: 'nuevo_end.jpg' });

        try {
          await canal.send({ content: '||@everyone||', embeds: [embed], files });
          return interaction.reply({ content: '✅ Nuevo enviado al servidor principal.', ephemeral: true });
        } catch (err) {
          console.error('Error enviando nuevo', err);
          return interaction.reply({ content: '❌ Error al enviar nuevo. Revisa permisos y tamaño de archivo.', ephemeral: true });
        }
      }

      return;
    }

    // --- Buttons for ticket panel and ticket close / claim ---
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Cerrar ticket (botón dentro del canal de ticket)
      if (id === 'ticket_close') {
        // Responder rápido para evitar "Interacción fallida"
        await interaction.reply({ content: '🔒 Cerrando ticket en 5 segundos...', ephemeral: true }).catch(() => {});
        setTimeout(() => {
          if (interaction.channel?.delete) interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // Reclamar ticket (solo staff)
      if (id === 'ticket_claim') {
        // Solo tickets dentro de un canal ticket-*
        if (!interaction.channel || !interaction.channel.name?.startsWith('ticket-')) {
          return interaction.reply({ content: '❌ Esto solo se puede usar dentro de un canal de ticket.', ephemeral: true });
        }
        if (!isStaffMember(interaction.member)) {
          return interaction.reply({ content: '❌ Solo el staff puede reclamar tickets.', ephemeral: true });
        }

        // Encontrar el mensaje original del ticket (con los botones)
        const msgs = await interaction.channel.messages.fetch({ limit: 50 }).catch(() => new Collection());
        const panelMsg = msgs.find(m => m.author?.id === client.user.id && m.components?.length && m.components[0].components.some(c => c.customId === 'ticket_claim'));
        try {
          // Editar componentes para deshabilitar botón de reclamar y mostrar quien reclamó
          if (panelMsg) {
            const updatedRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('ticket_claim').setLabel(`Reclamado por ${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setEmoji('🧑‍⚖️').setDisabled(true),
              new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );
            await panelMsg.edit({ components: [updatedRow] }).catch(() => {});
          }

          // Notificar en el canal quién reclamó
          const claimEmbed = new EmbedBuilder()
            .setTitle('🟢 Ticket reclamado')
            .setDescription(`Este ticket ha sido reclamado por ${interaction.user}.`)
            .setColor('#2ecc71')
            .setTimestamp();
          await interaction.channel.send({ embeds: [claimEmbed] }).catch(() => {});

          await interaction.reply({ content: `✅ Has reclamado el ticket.`, ephemeral: true });
        } catch (err) {
          console.error('Error reclamando ticket', err);
          if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Error al reclamar el ticket.', ephemeral: true }).catch(() => {});
        }
        return;
      }

      // Botones del panel que abren modales: ticket_soporte, ticket_reportes, ticket_tienda, ticket_otros
      if (id.startsWith('ticket_')) {
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

        // Mostrar modal y asegurarnos de responder si falla para evitar "Interacción fallida"
        try {
          await interaction.showModal(modal);
        } catch (err) {
          console.error('Error mostrando modal', err);
          // Si showModal falla, responde para no generar interacción fallida
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocurrió un error al abrir el formulario. Intenta de nuevo.', ephemeral: true }).catch(() => {});
          }
        }

        return;
      }

      // Si es otro botón que no manejamos, responder de forma segura
      await interaction.reply({ content: '❌ Botón no reconocido.', ephemeral: true }).catch(() => {});
      return;
    }

    // --- Modal submit -> crear canal ticket ---
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;
      if (!customId.startsWith('modal_')) return;
      const parts = customId.split('_');
      const tipo = parts[1];

      // Crear nombre seguro para canal
      const safeUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9\-]/g, '').slice(0, 40) || 'usuario';
      const baseName = `ticket-${tipo}-${safeUsername}`.slice(0, 90);

      // role overwrites for staff
      const roleOverwrites = STAFF_ROLE_NAMES.map(name => {
        const role = interaction.guild.roles.cache.find(r => r.name === name);
        if (!role) return null;
        return { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] };
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

      // Preparar contenido del embed en función del tipo
      let tituloCampo = '';
      let valorCampo = '';
      if (tipo === 'soporte') {
        const asunto = interaction.fields.getTextInputValue('soporte_asunto');
        const desc = interaction.fields.getTextInputValue('soporte_desc');
        tituloCampo = asunto;
        valorCampo = desc;
      } else if (tipo === 'reportes') {
        const objetivo = interaction.fields.getTextInputValue('reportes_objetivo');
        const pruebas = interaction.fields.getTextInputValue('reportes_prueba');
        tituloCampo = objetivo;
        valorCampo = pruebas;
      } else if (tipo === 'tienda') {
        const item = interaction.fields.getTextInputValue('tienda_item');
        const detalle = interaction.fields.getTextInputValue('tienda_detalle');
        tituloCampo = item;
        valorCampo = detalle;
      } else {
        const titulo = interaction.fields.getTextInputValue('otros_titulo');
        const descripcion = interaction.fields.getTextInputValue('otros_descripcion');
        tituloCampo = titulo;
        valorCampo = descripcion;
      }

      // Roles de staff reales para mencionar en el canal (si existen)
      const staffRoleObjects = STAFF_ROLE_NAMES.map(n => interaction.guild.roles.cache.find(r => r.name === n)).filter(Boolean);
      const staffMentions = staffRoleObjects.length ? staffRoleObjects.map(r => `<@&${r.id}>`).join(' ') : 'No se encontró rol de staff';

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 Ticket • ${tipo.toUpperCase()}`)
        .setColor('#2b2d31')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: '👤 Creador', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
          { name: '📂 Tipo', value: tipo, inline: true },
          { name: '📌 Estado', value: 'Abierto', inline: true },
          { name: tituloCampo ? `📝 ${tituloCampo}` : 'Descripción', value: valorCampo || 'Sin descripción', inline: false },
          { name: '👥 Staff', value: staffMentions, inline: false }
        )
        .setImage(CONFIG.IMAGENES.TICKET_INTERIOR)
        .setFooter({ text: `Ticket creado • Power Luki Network` })
        .setTimestamp();

      // Botones: Reclamar + Cerrar
      const ticketControls = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('🧑‍⚖️'),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
      );

      // Mensaje inicial: mencionar staff para avisar
      const pingContent = staffRoleObjects.length ? staffRoleObjects.map(r => `<@&${r.id}>`).join(' ') : '';

      await ticketChannel.setTopic(`Ticket ${tipo} • creado por ${interaction.user.tag}`).catch(() => {});
      await ticketChannel.send({ content: pingContent || undefined, embeds: [ticketEmbed], components: [ticketControls] }).catch(() => {});

      // Responder al submit indicando el canal (usa mención válida)
      await interaction.reply({ content: `✅ Ticket creado: <#${ticketChannel.id}>`, ephemeral: true }).catch(() => {});

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

  } catch (err) {
    console.error('Error en interactionCreate:', err);
    // Si existe interacción pendiente, responder de forma segura
    try { if (interaction && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Ocurrió un error interno.', ephemeral: true }); } catch(e){}
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

  // ANTI-SPAM (igual que antes)
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

  // NIVELES (sin imágenes) - igual que antes
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
