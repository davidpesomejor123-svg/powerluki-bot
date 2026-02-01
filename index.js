// bot-completo.js
// Requiere: node 18+, discord.js v14, express, dotenv
// npm i discord.js express dotenv

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
  // Nombres de canales (asegúrate que existen o el bot los creará donde pueda)
  CANALES: {
    TICKETS_LOG: '📖tickets',
    TICKETS_CATEGORY: 'Tickets', // categoría donde crear channels privados (si existe)
    NUEVO: '🎊nuevo',
    ANUNCIOS: '📣anuncios',
    SILENCIADOS: '🔇silenciados',
    DESILENCIADOS: '🔉desilenciados',
    BANEOS: '🔨baneos',
    BIENVENIDAS: '👋bienvenidos',
    DESPEDIDAS: '😔despedidas',
    NIVELES: '🆙niveles',
    ENCUESTA: 'encuesta', // canal para sugerencias/encuestas
  },
  // IDs: ajusta según tus valores
  MAIN_GUILD_ID: '1340442398442127480', // servidor donde ocurrirá todo
  STAFF_ROLE_ID: '1458243569075884219', // el "grupo de administracion" (role id)
  // Emojis/IDs personalizados (reemplaza "ID" por los tuyos)
  EMOJIS: {
    TIENDA: '<:Tienda:ID>',
    IP: '<:ip:ID>',
    JAVA: '<:java:ID>',
    BEDROCK: '<:bedrock:ID>',
    STORE_LINK: 'https://tienda.powermax.com',
  }
};

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

/* ───────── BASES EN MEMORIA ───────── */
// Para demo: Map para niveles, tickets y sugerencias. Para producción usa DB.
const nivelesDB = new Map(); // userId -> { xp, nivel, lastXP }
const openTickets = new Map(); // userId -> channelId
const suggestionsDB = new Map(); // suggestionId -> data
let suggestionCounter = 1;

/* ───────── HELPERS ───────── */
function findChannelByName(guild, name) {
  return guild.channels.cache.find(c => c.name === name);
}

async function ensureMutedRole(guild) {
  let muted = guild.roles.cache.find(r => r.name === 'Muted');
  if (muted) return muted;
  // Create role
  muted = await guild.roles.create({
    name: 'Muted',
    reason: 'Rol para silenciar usuarios',
    permissions: []
  });

  // Apply permissions to all text channels to deny SendMessages
  guild.channels.cache.forEach(channel => {
    if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildForum) {
      channel.permissionOverwrites.edit(muted, {
        SendMessages: false,
        AddReactions: false,
        Speak: false
      }).catch(() => {});
    }
  });

  return muted;
}

function parseTimeToMs(timeStr) {
  // admite formato simple: 10m, 2h, 3d, o sólo minutos si es número
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d+)([mhd])?$/);
  if (!m) return null;
  const amount = Number(m[1]);
  const unit = m[2] || 'm';
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return null;
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleString('es-ES', { timeZone: 'America/Tegucigalpa' });
}

/* ───────── READY: registrar comandos slashes básicos ───────── */
client.once('ready', async () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);

  // Registrar comandos globales (rápido y sencillo)
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Abrir un ticket privado'),
      new SlashCommandBuilder()
        .setName('nuevo')
        .setDescription('Enviar mensaje nuevo al canal 🎊nuevo')
        .addStringOption(opt => opt.setName('mensaje').setDescription('Mensaje').setRequired(true)),
      new SlashCommandBuilder()
        .setName('anuncio')
        .setDescription('Enviar anuncio al canal 📣anuncios')
        .addStringOption(opt => opt.setName('mensaje').setDescription('Mensaje').setRequired(true)),
      new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Silenciar un usuario')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
        .addStringOption(o => o.setName('duracion').setDescription('Duración (ej: 10m, 2h, 1d)')),
      new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Des-silenciar un usuario')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario a des-silenciar').setRequired(true)),
      new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Banear un usuario')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
        .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),
      new SlashCommandBuilder()
        .setName('temban')
        .setDescription('Ban temporal (ej: 10m, 2h)')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario a tempbanear').setRequired(true))
        .addStringOption(o => o.setName('tiempo').setDescription('Tiempo (10m, 2h)').setRequired(true))
        .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),
      new SlashCommandBuilder()
        .setName('sugerencias')
        .setDescription('Crear una sugerencia/encuesta')
        .addStringOption(o => o.setName('texto').setDescription('Tu sugerencia').setRequired(true)),
      new SlashCommandBuilder()
        .setName('encuesta')
        .setDescription('Crear encuesta (staff)')
        .addStringOption(o => o.setName('pregunta').setDescription('Pregunta').setRequired(true)),
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands registrados.');
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }
});

/* ───────── EVENT: INTERACTION (slash, buttons, modals) ───────── */
client.on('interactionCreate', async (interaction) => {
  try {
    // Slash commands:
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;
      // helper: check staff role
      const memberIsStaff = interaction.member?.roles?.cache?.has(CONFIG.STAFF_ROLE_ID);

      if (commandName === 'ticket') {
        // Ticket: crea canal privado para el user
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Esto solo se usa en servidores.', ephemeral: true });

        if (openTickets.has(interaction.user.id)) {
          return interaction.reply({ content: 'Ya tienes un ticket abierto. Revisa tus canales privados.', ephemeral: true });
        }

        const category = guild.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS_CATEGORY && c.type === ChannelType.GuildCategory);
        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${interaction.user.discriminator}`;
        const ticketChannel = await guild.channels.create({
          name: channelName.slice(0, 90),
          type: ChannelType.GuildText,
          parent: category ? category.id : undefined,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ReadMessageHistory]
            },
            {
              id: CONFIG.STAFF_ROLE_ID,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages]
            }
          ]
        });

        openTickets.set(interaction.user.id, ticketChannel.id);

        // Notificar en canal de log
        const logCh = interaction.guild.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS_LOG);
        if (logCh) {
          const embed = new EmbedBuilder()
            .setTitle('🎫 Nuevo Ticket')
            .setDescription(`Usuario: ${interaction.user.tag}\nCanal: ${ticketChannel}`)
            .setTimestamp();
          logCh.send({ embeds: [embed] }).catch(() => {});
        }

        await ticketChannel.send({
          content: `${interaction.user} — Gracias por abrir un ticket. Un miembro del staff te atenderá pronto.`,
          embeds: [
            new EmbedBuilder().setDescription('Describe tu problema aquí. Usa `!cerrar` para cerrar el ticket cuando se resuelva.')
          ]
        });

        return interaction.reply({ content: `Ticket creado: ${ticketChannel}`, ephemeral: true });
      }

      // /nuevo -> enviar mensaje al canal NUEVO del servidor principal
      if (commandName === 'nuevo' || commandName === 'anuncio') {
        if (!interaction.member) return interaction.reply({ content: 'No se pudo verificar permisos.', ephemeral: true });
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) && interaction.guildId !== CONFIG.MAIN_GUILD_ID) {
          return interaction.reply({ content: 'Sólo el grupo de administración puede usar este comando desde otro grupo.', ephemeral: true });
        }

        const contenido = interaction.options.getString('mensaje');
        const targetGuild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID);
        if (!targetGuild) return interaction.reply({ content: 'No se encontró el servidor principal.', ephemeral: true });

        const channelName = commandName === 'nuevo' ? CONFIG.CANALES.NUEVO : CONFIG.CANALES.ANUNCIOS;
        let ch = findChannelByName(targetGuild, channelName);
        if (!ch) {
          // intenta crear canal en el server principal
          ch = await targetGuild.channels.create({ name: channelName, type: ChannelType.GuildText }).catch(() => null);
        }
        if (!ch) return interaction.reply({ content: `No se pudo encontrar ni crear el canal ${channelName}.`, ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle(commandName === 'nuevo' ? '🎊 Nuevo' : '📣 Anuncio')
          .setDescription(contenido)
          .setFooter({ text: 'Power Luki Network' })
          .setTimestamp();

        await ch.send({ embeds: [embed] });
        return interaction.reply({ content: 'Mensaje enviado al servidor principal.', ephemeral: true });
      }

      if (commandName === 'mute') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
          return interaction.reply({ content: 'Necesitas ser staff para usar esto.', ephemeral: true });
        }
        const usuario = interaction.options.getUser('usuario');
        const duracion = interaction.options.getString('duracion');
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Comando solo en servidor.', ephemeral: true });

        const member = await guild.members.fetch(usuario.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'No encontré al usuario.', ephemeral: true });

        const mutedRole = await ensureMutedRole(guild);
        await member.roles.add(mutedRole, `Mute por comando de ${interaction.user.tag}`).catch(err => console.error(err));

        // mensaje en canal silenciados
        const ch = findChannelByName(guild, CONFIG.CANALES.SILENCIADOS);
        const embed = new EmbedBuilder()
          .setTitle('🔇 Usuario silenciado')
          .setDescription(`${usuario.tag} ha sido silenciado por ${interaction.user.tag}` + (duracion ? `\nDuración: ${duracion}` : ''))
          .setTimestamp();
        if (ch) ch.send({ embeds: [embed] }).catch(() => {});

        interaction.reply({ content: `Usuario ${usuario.tag} silenciado.`, ephemeral: true });

        // si tiene duración, desmute después
        if (duracion) {
          const ms = parseTimeToMs(duracion);
          if (ms) {
            setTimeout(async () => {
              try {
                const fetched = await guild.members.fetch(usuario.id).catch(() => null);
                if (fetched && fetched.roles.cache.has(mutedRole.id)) {
                  await fetched.roles.remove(mutedRole, 'Mute expirado').catch(() => {});
                  const ch2 = findChannelByName(guild, CONFIG.CANALES.DESILENCIADOS);
                  const embed2 = new EmbedBuilder()
                    .setTitle('🔉 Usuario desilenciado')
                    .setDescription(`${usuario.tag} fue desilenciado automáticamente tras expirar el mute.`)
                    .setTimestamp();
                  if (ch2) ch2.send({ embeds: [embed2] }).catch(() => {});
                }
              } catch (e) { console.error('Error en timeout mute:', e); }
            }, ms);
          }
        }
        return;
      }

      if (commandName === 'unmute') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
          return interaction.reply({ content: 'Necesitas ser staff para usar esto.', ephemeral: true });
        }
        const usuario = interaction.options.getUser('usuario');
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Comando solo en servidor.', ephemeral: true });

        const member = await guild.members.fetch(usuario.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'No encontré al usuario.', ephemeral: true });

        const muted = guild.roles.cache.find(r => r.name === 'Muted');
        if (muted && member.roles.cache.has(muted.id)) {
          await member.roles.remove(muted, `Unmute por ${interaction.user.tag}`).catch(() => {});
          const ch = findChannelByName(guild, CONFIG.CANALES.DESILENCIADOS);
          if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('🔉 Usuario desilenciado').setDescription(`${usuario.tag} fue desilenciado por ${interaction.user.tag}`).setTimestamp()] });
          return interaction.reply({ content: 'Usuario desilenciado.', ephemeral: true });
        } else {
          return interaction.reply({ content: 'El usuario no está silenciado.', ephemeral: true });
        }
      }

      if (commandName === 'ban' || commandName === 'temban') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
          return interaction.reply({ content: 'Necesitas ser staff para usar esto.', ephemeral: true });
        }
        const usuario = interaction.options.getUser('usuario');
        const razon = interaction.options.getString('razon') || 'No especificada';
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Comando solo en servidor.', ephemeral: true });
        const member = await guild.members.fetch(usuario.id).catch(() => null);

        if (!member && interaction.commandName === 'ban') {
          // intentar ban por id
        }

        // ban
        await guild.bans.create(usuario.id, { reason: `${razon} - por ${interaction.user.tag}` }).catch(err => {
          console.error(err);
        });

        const ch = findChannelByName(guild, CONFIG.CANALES.BANEOS);
        const embed = new EmbedBuilder()
          .setTitle('🔨 Usuario baneado')
          .setDescription(`${usuario.tag} fue baneado por ${interaction.user.tag}\nRazón: ${razon}`)
          .setTimestamp();
        if (ch) ch.send({ embeds: [embed] }).catch(() => {});

        interaction.reply({ content: `${usuario.tag} ha sido baneado.`, ephemeral: true });

        // si es temban: programar un unban
        if (commandName === 'temban') {
          const tiempo = interaction.options.getString('tiempo');
          const ms = parseTimeToMs(tiempo);
          if (ms) {
            setTimeout(async () => {
              try {
                await guild.bans.remove(usuario.id).catch(() => {});
                const ch2 = findChannelByName(guild, CONFIG.CANALES.BANEOS);
                if (ch2) ch2.send({ embeds: [new EmbedBuilder().setTitle('🔨 Ban levantado').setDescription(`${usuario.tag} fue desbaneado automáticamente.`).setTimestamp()] });
              } catch (e) { console.error('Error al levantar temban:', e); }
            }, ms);
          }
        }
        return;
      }

      if (commandName === 'sugerencias') {
        const texto = interaction.options.getString('texto');
        const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || interaction.guild;
        if (!guild) return interaction.reply({ content: 'No se encontró el servidor para publicar la sugerencia.', ephemeral: true });

        let ch = findChannelByName(guild, CONFIG.CANALES.ENCUESTA);
        if (!ch) {
          ch = await guild.channels.create({ name: CONFIG.CANALES.ENCUESTA, type: ChannelType.GuildText, permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]}).catch(() => null);
        }
        if (!ch) return interaction.reply({ content: 'No se pudo crear/obtener el canal de encuestas.', ephemeral: true });

        const id = (suggestionCounter++).toString(36).toUpperCase();
        const embed = new EmbedBuilder()
          .setTitle(`Sugerencia #${id}`)
          .setDescription(texto)
          .addFields(
            { name: 'Autor', value: interaction.user.tag, inline: true },
            { name: 'ID de Sugerencia', value: id, inline: true },
          )
          .setFooter({ text: `Power Lucky Network • ${formatTimestamp()}` })
          .setTimestamp();

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder().setCustomId(`sug_accept_${id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`sug_deny_${id}`).setLabel('Denegar').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`sug_like_${id}`).setLabel('👍').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`sug_dislike_${id}`).setLabel('👎').setStyle(ButtonStyle.Secondary)
          );

        const msg = await ch.send({ embeds: [embed], components: [row] });
        suggestionsDB.set(id, { id, author: interaction.user.id, texto, messageId: msg.id, channelId: ch.id, status: 'pending', createdAt: Date.now() });

        return interaction.reply({ content: 'Sugerencia enviada, gracias :)', ephemeral: true });
      }

      if (commandName === 'encuesta') {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: 'Solo staff puede crear encuestas.', ephemeral: true });
        const pregunta = interaction.options.getString('pregunta');
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Comando en servidor solamente.', ephemeral: true });

        // crea una encuesta simple con reacciones en el canal actual visible sólo a staff
        const embed = new EmbedBuilder().setTitle('📊 Nueva encuesta').setDescription(pregunta).setFooter({ text: 'Power Lucky Network' }).setTimestamp();
        const message = await interaction.reply({ embeds: [embed], fetchReply: true });
        // agrega reacciones (el usuario puede reaccionar)
        await message.react('👍').catch(() => {});
        await message.react('👎').catch(() => {});
        return;
      }
    }

    // Buttons & Modals
    if (interaction.isButton()) {
      const id = interaction.customId;
      // sugerencia accept/deny handlers
      if (id.startsWith('sug_accept_') || id.startsWith('sug_deny_')) {
        if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
          return interaction.reply({ content: 'Solo staff puede aceptar/denegar sugerencias.', ephemeral: true });
        }
        const sugId = id.split('_')[2];
        // abrir modal para pedir razón
        const modal = new ModalBuilder()
          .setCustomId(`${id}_modal`)
          .setTitle(id.startsWith('sug_accept_') ? 'Razón de aceptación' : 'Razón de denegación');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('Razón (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      // like/dislike
      if (id.startsWith('sug_like_') || id.startsWith('sug_dislike_')) {
        const sugId = id.split('_')[2];
        const data = suggestionsDB.get(sugId);
        if (!data) return interaction.reply({ content: 'Sugerencia no encontrada.', ephemeral: true });
        // simplemente reaccionamos con emoji en el mensaje original
        const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID);
        if (!guild) return interaction.reply({ content: 'Servidor no disponible.', ephemeral: true });
        const ch = guild.channels.cache.get(data.channelId) || findChannelByName(guild, CONFIG.CANALES.ENCUESTA);
        if (!ch) return interaction.reply({ content: 'Canal no encontrado.', ephemeral: true });

        const msg = await ch.messages.fetch(data.messageId).catch(() => null);
        if (!msg) return interaction.reply({ content: 'Mensaje original no encontrado.', ephemeral: true });
        const emoji = id.startsWith('sug_like_') ? '👍' : '👎';
        await msg.react(emoji).catch(() => {});
        return interaction.reply({ content: `Voto registrado ${emoji}`, ephemeral: true });
      }

      // Ticket panel buttons (opcional: soporte, reportes, tienda, otros)
      if (id === 'open_ticket') {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Solo en servidor.', ephemeral: true });
        if (openTickets.has(interaction.user.id)) return interaction.reply({ content: 'Ya tienes un ticket abierto.', ephemeral: true });

        const category = guild.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS_CATEGORY && c.type === ChannelType.GuildCategory);
        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${interaction.user.discriminator}`;
        const ticketChannel = await guild.channels.create({
          name: channelName.slice(0, 90),
          type: ChannelType.GuildText,
          parent: category ? category.id : undefined,
          permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          ]
        });
        openTickets.set(interaction.user.id, ticketChannel.id);

        const logCh = findChannelByName(guild, CONFIG.CANALES.TICKETS_LOG);
        if (logCh) logCh.send({ embeds: [new EmbedBuilder().setTitle('🎫 Nuevo Ticket').setDescription(`${interaction.user.tag} - ${ticketChannel}`)] }).catch(() => {});
        await ticketChannel.send({ content: `${interaction.user} tu ticket ha sido abierto.` });
        return interaction.reply({ content: `Ticket creado: ${ticketChannel}`, ephemeral: true });
      }

      return;
    }

    // Modal submit (accept/deny reason)
    if (interaction.type === InteractionType.ModalSubmit) {
      const customId = interaction.customId;
      if (customId.startsWith('sug_accept_') || customId.startsWith('sug_deny_')) {
        // modal custom id like sug_accept_<id>_modal
        const parts = customId.split('_');
        const action = parts[1]; // accept or deny
        const id = parts[2];
        const reason = interaction.fields.getTextInputValue('reason') || 'No se proporcionó un motivo';

        const data = suggestionsDB.get(id);
        if (!data) return interaction.reply({ content: 'Sugerencia no encontrada.', ephemeral: true });

        const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID);
        if (!guild) return interaction.reply({ content: 'Servidor no disponible.', ephemeral: true });
        const ch = guild.channels.cache.get(data.channelId) || findChannelByName(guild, CONFIG.CANALES.ENCUESTA);
        if (!ch) return interaction.reply({ content: 'Canal no encontrado.', ephemeral: true });

        const finalEmbed = new EmbedBuilder()
          .setTitle(action === 'accept' ? `La sugerencia de ${interaction.user.username} fue aceptada` : `Denied ${interaction.user.username}'s Suggestion`)
          .addFields(
            { name: 'Sugerencia', value: data.texto || '—' },
            { name: 'Razón', value: reason }
          )
          .setFooter({ text: `ID de Sugerencia: ${id} | ${formatTimestamp()}` })
          .setTimestamp();

        await ch.send({ embeds: [finalEmbed] });
        data.status = action === 'accept' ? 'accepted' : 'denied';
        suggestionsDB.set(id, data);
        // editar el mensaje original para desactivar botones:
        const orig = await ch.messages.fetch(data.messageId).catch(() => null);
        if (orig) {
          orig.edit({ components: [] }).catch(() => {});
        }

        return interaction.reply({ content: `Sugerencia ${action === 'accept' ? 'aceptada' : 'denegada'}.`, ephemeral: true });
      }
    }
  } catch (err) {
    console.error('Error en interactionCreate:', err);
  }
});

/* ───────── MESSAGE CREATE: comandos tradicionales + sistema de niveles ───────── */
client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const content = message.content.toLowerCase();

    /* !ip, ip */
    if (content === '!ip' || content === 'ip') {
      const ipEmbed = new EmbedBuilder()
        .setTitle(`${CONFIG.EMOJIS.IP} IP DEL SERVIDOR`)
        .setColor('#00FFFF')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `${CONFIG.EMOJIS.JAVA} **Java:** \`${CONFIG.SERVER_IP}\`\n` +
          `${CONFIG.EMOJIS.BEDROCK} **Bedrock:** \`${CONFIG.SERVER_IP}\`\n` +
          `**Puerto:** \`${CONFIG.SERVER_PORT}\`\n` +
          `**Versiones:** ${CONFIG.VERSIONS}\n\n` +
          `━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: 'PowerMax Network • Conéctate ya' })
        .setTimestamp();
      message.channel.send({ embeds: [ipEmbed] }).catch(() => {});
      return;
    }

    /* tienda (alias) */
    if (content === `${CONFIG.PREFIJO}tienda` || content.includes('donar') || content.includes('comprar') || content.includes('shop') || content.includes('store')) {
      const shopEmbed = new EmbedBuilder()
        .setTitle(`${CONFIG.EMOJIS.TIENDA} TIENDA OFICIAL`)
        .setColor('#FFCC00')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `**¡Apoya al servidor comprando rangos y mejoras!**\n\n` +
          `${CONFIG.EMOJIS.STORE_LINK}\n\n` +
          `━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: 'PowerMax Shop • Gracias por apoyar' })
        .setTimestamp();

      message.channel.send({ embeds: [shopEmbed] }).catch(() => {});
      return;
    }

    /* CERRAR TICKET (comando simple) */
    if (content.startsWith('!cerrar') || content.startsWith(`${CONFIG.PREFIJO}cerrar`)) {
      // si el canal es un ticket que creamos
      const ch = message.channel;
      // buscar si es un channel registrado en openTickets
      const userIdEntry = [...openTickets.entries()].find(([uid, cid]) => cid === ch.id);
      if (!userIdEntry) {
        return message.reply('Este comando solo funciona dentro de un ticket.');
      }
      const [uid] = userIdEntry;
      openTickets.delete(uid);
      await ch.send('Cerrando ticket en 5 segundos...').catch(() => {});
      setTimeout(() => {
        ch.delete('Ticket cerrado').catch(() => {});
      }, 5000);
      return;
    }

    /* SISTEMA DE NIVELES: XP por mensaje (limitado) */
    const userId = message.author.id;
    let data = nivelesDB.get(userId) || { xp: 0, nivel: 1, lastXP: 0 };
    if (Date.now() - data.lastXP > 60000) {
      data.xp += Math.floor(Math.random() * 15) + 10;
      data.lastXP = Date.now();
      const xpNecesaria = Math.min(999, data.nivel) * 250; // hasta 999
      if (data.xp >= xpNecesaria) {
        data.nivel++;
        data.xp = 0;
        // enviar nivel en canal NIVELES
        const canalNiveles = message.guild.channels.cache.find(c => c.name === CONFIG.CANALES.NIVELES);
        if (canalNiveles) {
          const roleStaff = message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) ? '『👨‍🎓』STAFF' : message.author.username;
          const embed = new EmbedBuilder()
            .setTitle('🌟 ¡LEVEL UP! 🌟')
            .setDescription(`🎉 <@${message.author.id}> ha subido al Nivel ${data.nivel} 🎉`)
            .setFooter({ text: 'Power Luki Network' })
            .setTimestamp();
          canalNiveles.send({ content: `🎉 <@${message.author.id}>`, embeds: [embed] }).catch(() => {});
        }
      }
      nivelesDB.set(userId, data);
    }
  } catch (err) {
    console.error('Error en messageCreate:', err);
  }
});

/* ───────── WELCOME & GOODBYE ───────── */
client.on('guildMemberAdd', async (member) => {
  try {
    const guild = member.guild;
    const ch = findChannelByName(guild, CONFIG.CANALES.BIENVENIDAS);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
      .setDescription(`-_- - POWER LUKI NETWORK -_- \n\n💎 ${member.user.tag} ha llegado a nuestra comunidad.\n🎇 ¡Disfruta tu estadía!`)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' })
      .setTimestamp();
    ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) { console.error(e); }
});

client.on('guildMemberRemove', async (member) => {
  try {
    const guild = member.guild;
    const ch = findChannelByName(guild, CONFIG.CANALES.DESPEDIDAS);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setTitle(`😔 ¡Hasta pronto, ${member.user.username}! 😔`)
      .setDescription(`- - - • POWER LUKI NETWORK • - - -\n\n╭━━━━━━━━━━━━━━━━━━━━━━━╮\n💔 ${member.user.tag} nos deja temporalmente.\n🌟 Esperamos volver a verte pronto en Power Luki Network.\n╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n📌 Recuerda que siempre eres parte de nuestra comunidad.\n- - - • Siempre Bienvenido • - - -`)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `Power Luki Network • Nos vemos pronto • ${formatTimestamp()}` })
      .setTimestamp();
    ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) { console.error(e); }
});

/* ───────── SERVIDOR WEB ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Max Bot Online ✅'));

/* ───────── INICIAR BOT ───────── */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escuchando en puerto ${PORT}`);
  client.login(process.env.TOKEN)
    .catch(err => console.error('Error iniciando sesión en Discord:', err));
});
