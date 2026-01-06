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
  Collection
} from 'discord.js';

/* ───────── CONFIGURACIÓN INICIAL ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

// Bases de datos temporales
const nivelesDB = new Map();
const invites = new Collection();
const spamMap = new Map();

// Rutas de datos
const DATA_DIR = path.join(process.cwd(), 'data');
const TEMPBANS_FILE = path.join(DATA_DIR, 'tempbans.json');
const SANCTIONS_FILE = path.join(DATA_DIR, 'sanctions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Permite persistir y recuperar JSON simple
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

/* ───────── Persistencia y tablas en memoria ───────── */
// tempBans: array de { guildId, userId, unbanAt (ms), reason, moderatorTag, timeoutId? }
let tempBans = loadJSON(TEMPBANS_FILE, []);
// sanctions: array de eventos { guildId, userId, action, reason, moderator, timestamp }
let sanctions = loadJSON(SANCTIONS_FILE, []);

// Mapa en memoria para timeouts activos: key = `${guildId}_${userId}` -> timeoutId
const activeUnbanTimeouts = new Map();

/* ───────── UTILIDADES ───────── */
function parseDuration(durationStr) {
  // acepta formatos como "7d", "12h", "30m", "45s"
  if (!durationStr) return null;
  const match = /^(\d+)(d|h|m|s)$/.exec(durationStr);
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

function scheduleUnban(guildId, userId, unbanAt, moderatorTag, reason) {
  const key = `${guildId}_${userId}`;
  const msLeft = unbanAt - Date.now();
  if (msLeft <= 0) {
    // Si ya venció, intenta desbanear inmediatamente
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      guild.members.unban(userId, 'Auto-unban: tiempo cumplido').catch(() => {});
      // Log de desbaneo
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

  // Programa timeout
  const timeoutId = setTimeout(async () => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        await guild.members.unban(userId, 'Auto-unban: tiempo cumplido');
        // Log de desbaneo
        logSanction({
          guildId,
          userId,
          action: 'AUTO_UNBAN',
          reason: reason || 'Tiempo cumplido',
          moderator: moderatorTag || 'Sistema',
          timestamp: Date.now()
        });
        // Notificar canal de baneos si existe
        const canalBaneos = guild.channels.cache.find(c => c.name === CONFIG.CANALES.BANEOS);
        if (canalBaneos) {
          const embed = new EmbedBuilder()
            .setTitle('🔓 Auto-Unban')
            .setColor('#00ff00')
            .setDescription(`El usuario <@${userId}> ha sido desbaneado automáticamente.`)
            .setTimestamp();
          canalBaneos.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Error al auto-unban', err);
    } finally {
      removeTempBanRecord(guildId, userId);
      activeUnbanTimeouts.delete(key);
    }
  }, msLeft);

  activeUnbanTimeouts.set(key, timeoutId);
}

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
    BANEOS: '『🔨』baneos'
  },
  IMAGENES: {
    PANEL_TICKET: 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png',
    TICKET_INTERIOR: 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg',
    BIENVENIDA: 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png',
    NIVELES: 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png'
  }
};

/* ───────── EVENTO READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);

  // Cargar invitaciones existentes
  client.guilds.cache.forEach(async (guild) => {
    const guildInvites = await guild.invites.fetch().catch(() => new Collection());
    invites.set(guild.id, guildInvites);
  });

  // Setup Canal de Tickets (Solo envía el panel si no existe)
  const canal = client.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS);
  if (canal) {
    const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    if (!msgs || !msgs.some(m => m.author.id === client.user.id)) {
      const embed = new EmbedBuilder()
        .setTitle('🎫 Centro de Soporte | Power Luki Network')
        .setColor('#2b2d31')
        .setDescription(
          `**Bienvenido al sistema de asistencia.**\n\n` +
          `Si necesitas ayuda, reportar a un usuario o realizar una compra, presiona el botón de abajo.\n\n` +
          `💠 *Por favor, sé paciente tras abrir un ticket.*`
        )
        .setImage(CONFIG.IMAGENES.PANEL_TICKET)
        .setFooter({ text: 'Power Luki Network • Seguridad y Confianza' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('abrir_ticket_principal').setLabel('Abrir Ticket').setStyle(ButtonStyle.Primary).setEmoji('📩')
      );
      await canal.send({ embeds: [embed], components: [row] });
    }
  }

  // Registrar slash commands básicos por guild (ban)
  client.guilds.cache.forEach(async (guild) => {
    try {
      await guild.commands.create({
        name: 'ban',
        description: 'Banear a un usuario (con opción de tiempo)',
        options: [
          {
            name: 'usuario',
            description: 'Usuario a banear',
            type: 6, // USER
            required: true
          },
          {
            name: 'duracion',
            description: 'Duración (ej: 7d, 12h, 30m). Si no se pone, es permanente.',
            type: 3, // STRING
            required: false
          },
          {
            name: 'razon',
            description: 'Razón del baneo',
            type: 3, // STRING
            required: false
          }
        ]
      });
    } catch (err) {
      console.error('No se pudo crear command en guild', guild.id, err);
    }
  });

  // Al arrancar, restaurar timers de tempBans
  for (const b of tempBans.slice()) {
    scheduleUnban(b.guildId, b.userId, b.unbanAt, b.moderatorTag, b.reason);
  }
});

/* ───────── DESILENCIO AUTOMÁTICO ───────── */
client.on('guildMemberUpdate', (oldMember, newMember) => {
  if (oldMember.communicationDisabledUntilTimestamp && !newMember.communicationDisabledUntilTimestamp) {
    const canal = newMember.guild.channels.cache.find(c => c.name === CONFIG.CANALES.DESILENCIADOS);
    if (canal) {
      canal.send(`🔊 El usuario ${newMember.user} ha sido **desilenciado automáticamente**.`);
      // Log en historial
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

/* ───────── MANEJO DE INTERACCIONES (TICKETS + SLASH BAN) ───────── */
client.on('interactionCreate', async (interaction) => {
  // Botón para abrir modal
  if (interaction.isButton() && interaction.customId === 'abrir_ticket_principal') {
    const modal = new ModalBuilder()
      .setCustomId('modal_ticket_soporte')
      .setTitle('Detalles del Ticket');

    const input = new TextInputBuilder()
      .setCustomId('razon')
      .setLabel('¿Cuál es el motivo de tu ticket?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Escribe aquí tu duda o problema...')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // Submit del Modal
  if (interaction.isModalSubmit() && interaction.customId === 'modal_ticket_soporte') {
    const motivo = interaction.fields.getTextInputValue('razon');

    const canalTicket = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ],
    });

    const ticketEmbed = new EmbedBuilder()
      .setTitle('🎫 Ticket de Soporte')
      .setColor('#5865F2')
      .setImage(CONFIG.IMAGENES.TICKET_INTERIOR)
      .addFields(
        { name: '👤 Usuario', value: `${interaction.user}`, inline: true },
        { name: '📝 Motivo', value: motivo }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cerrar_ticket').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await canalTicket.send({ content: `@here | Soporte Requerido`, embeds: [ticketEmbed], components: [row] });
    await interaction.reply({ content: `✅ Ticket creado correctamente: ${canalTicket}`, ephemeral: true });
  }

  // Botón para cerrar
  if (interaction.isButton() && interaction.customId === 'cerrar_ticket') {
    await interaction.reply('🔒 El ticket se cerrará en 5 segundos...');
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }

  // Slash /ban
  if (interaction.isChatInputCommand() && interaction.commandName === 'ban') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: '❌ No tienes permisos para banear.', ephemeral: true });
    }

    const user = interaction.options.getUser('usuario', true);
    const durStr = interaction.options.getString('duracion') || null;
    const razon = interaction.options.getString('razon') || 'No especificada';

    const memberId = user.id;
    try {
      // Realizar ban
      await interaction.guild.members.ban(memberId, { reason: `Baneado por ${interaction.user.tag} | ${razon}` });

      // Log embed
      const canalBaneos = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.BANEOS);
      if (canalBaneos) {
        const banEmbed = new EmbedBuilder()
          .setTitle('🔨 Nuevo Usuario Baneado')
          .setColor('#ff0000')
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '👤 Usuario:', value: `${user.tag}`, inline: true },
            { name: '🆔 ID:', value: `${user.id}`, inline: true },
            { name: '👮 Por:', value: `${interaction.user.tag}`, inline: true },
            { name: '📄 Razón:', value: `\`\`\`${razon}\`\`\`` }
          )
          .setTimestamp();

        canalBaneos.send({ embeds: [banEmbed] });
      }

      // Si hay duración, programar desbaneo
      if (durStr) {
        const parsed = parseDuration(durStr);
        if (!parsed) {
          return interaction.reply({ content: '❌ Duración inválida. Usa formatos como `7d`, `12h`, `30m`.', ephemeral: true });
        }
        const unbanAt = Date.now() + parsed;
        addTempBanRecord({
          guildId: interaction.guild.id,
          userId: memberId,
          unbanAt,
          reason: razon,
          moderatorTag: interaction.user.tag
        });
        scheduleUnban(interaction.guild.id, memberId, unbanAt, interaction.user.tag, razon);
        logSanction({
          guildId: interaction.guild.id,
          userId: memberId,
          action: 'TEMP_BAN',
          reason: razon,
          moderator: interaction.user.tag,
          timestamp: Date.now(),
          duration: durStr
        });
        return interaction.reply({ content: `✅ ${user.tag} baneado por ${durStr}.`, ephemeral: true });
      } else {
        // Permanente (o hasta que un moderator lo desbanee manualmente)
        logSanction({
          guildId: interaction.guild.id,
          userId: memberId,
          action: 'PERM_BAN',
          reason: razon,
          moderator: interaction.user.tag,
          timestamp: Date.now()
        });
        return interaction.reply({ content: `✅ ${user.tag} baneado permanentemente.`, ephemeral: true });
      }

    } catch (err) {
      console.error('Error ban slash', err);
      return interaction.reply({ content: '❌ No pude banear a ese usuario (rol superior o error).', ephemeral: true });
    }
  }
});

/* ───────── MANEJO DE MENSAJES (COMANDOS + NIVELES + ANTISPAM) ───────── */
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  /* ─── COMANDO BAN (prefijo) ─── */
  if (message.content.startsWith(CONFIG.PREFIJO)) {
    const args = message.content.slice(CONFIG.PREFIJO.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'ban') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return message.reply('❌ No tienes permisos para banear usuarios.');
      }

      const usuario = message.mentions.members.first();
      const tiempo = args[1]; // si la sintaxis es: !ban @user 7d razon...
      const razon = args.slice(2).join(' ') || 'No especificada';

      if (!usuario) {
        return message.reply('⚠️ Uso correcto: `!ban @usuario <tiempo> <razón>`');
      }

      try {
        await usuario.ban({
          reason: `Baneado por ${message.author.tag} | ${razon}`
        });

        const canalBaneos = message.guild.channels.cache.find(c => c.name === CONFIG.CANALES.BANEOS);
        if (canalBaneos) {
          const embed = new EmbedBuilder()
            .setTitle('🔨 Usuario Baneado')
            .setColor('#ff0000')
            .setThumbnail(usuario.user.displayAvatarURL())
            .addFields(
              { name: '👤 Usuario', value: usuario.user.tag, inline: true },
              { name: '🆔 ID', value: usuario.id, inline: true },
              { name: '👮 Moderador', value: message.author.tag, inline: true },
              { name: '📄 Razón', value: `\`\`\`${razon}\`\`\`` }
            )
            .setTimestamp();

          canalBaneos.send({ embeds: [embed] });
        }

        // Si hay tiempo, programar auto-unban
        if (tiempo) {
          const parsed = parseDuration(tiempo);
          if (!parsed) {
            return message.reply('❌ Duración inválida. Usa `7d`, `12h`, `30m`.');
          }
          const unbanAt = Date.now() + parsed;
          addTempBanRecord({
            guildId: message.guild.id,
            userId: usuario.id,
            unbanAt,
            reason: razon,
            moderatorTag: message.author.tag
          });
          scheduleUnban(message.guild.id, usuario.id, unbanAt, message.author.tag, razon);
          logSanction({
            guildId: message.guild.id,
            userId: usuario.id,
            action: 'TEMP_BAN',
            reason: razon,
            moderator: message.author.tag,
            timestamp: Date.now(),
            duration: tiempo
          });
          return message.reply(`✅ **${usuario.user.tag}** fue baneado por ${tiempo}.`);
        } else {
          logSanction({
            guildId: message.guild.id,
            userId: usuario.id,
            action: 'PERM_BAN',
            reason: razon,
            moderator: message.author.tag,
            timestamp: Date.now()
          });
          return message.reply(`✅ **${usuario.user.tag}** ha sido baneado correctamente.`);
        }

      } catch (error) {
        console.error(error);
        message.reply('❌ No pude banear a este usuario (puede que tenga un rol superior al mío).');
      }
    }
  }

  /* ───────── NIVELES ───────── */
  const userId = message.author.id;
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

  /* ───────── ANTI SPAM ───────── */
  const now = Date.now();
  const sData = spamMap.get(userId) || { count: 0, last: now };
  sData.count = now - sData.last > 7000 ? 1 : sData.count + 1;
  sData.last = now;
  spamMap.set(userId, sData);

  if (sData.count >= 5) {
    const member = message.member;
    if (member && !member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await member.timeout(600000, 'Spam automático detectado');
      const logCanal = message.guild.channels.cache.find(c => c.name === CONFIG.CANALES.SANCIONES);
      if (logCanal) logCanal.send(`🔇 **${member.user.tag}** ha sido silenciado 10 min por spam.`).catch(() => {});
      // Guardar en historial
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
});

/* ───────── BIENVENIDAS CON INVITES ───────── */
client.on('guildMemberAdd', async (member) => {
  const newInvites = await member.guild.invites.fetch().catch(() => new Collection());
  const oldInvites = invites.get(member.guild.id);
  const invite = newInvites.find(i => i.uses > (oldInvites?.get(i.code)?.uses || 0));

  invites.set(member.guild.id, newInvites);

  const canal = member.guild.channels.cache.find(c => c.name === CONFIG.CANALES.BIENVENIDOS);
  if (!canal) return;

  const bEmbed = new EmbedBuilder()
    .setTitle('✨ ¡Un nuevo miembro ha llegado! ✨')
    .setColor('#00ffff')
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(
      `¡Bienvenido **${member.user.username}** a Power Luki Network!\n\n` +
      `👤 **Invitado por:** ${invite ? `**${invite.inviter.tag}**` : 'Desconocido'}\n` +
      `🔢 **Miembro nro:** #${member.guild.memberCount}`
    )
    .setImage(CONFIG.IMAGENES.BIENVENIDA)
    .setFooter({ text: 'Disfruta tu estadía en la comunidad' });

  canal.send({ embeds: [bEmbed] }).catch(() => {});
});

/* ───────── DESPEDIDAS ───────── */
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

/* ───────── SERVIDOR WEB (KEEP ALIVE) ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Luki Bot Online ✅'));
app.listen(process.env.PORT || 10000, () => client.login(process.env.TOKEN));
