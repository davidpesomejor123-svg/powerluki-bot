// index.js — Power Luki Network Bot (FIXED & READY)
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

/* ───────── CONFIGURACIÓN ───────── */
// ¡IMPORTANTE! Cambia los IDs por los de tu servidor real si son diferentes
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
  // REEMPLAZA ESTOS IDs CON LOS DE TU SERVIDOR
  MAIN_GUILD_ID: '1340442398442127480', 
  STAFF_ROLE_ID: '1458243569075884219',
  EMOJIS: {
    TIENDA: '🛒', // Si no tienes ID, usa un emoji normal temporalmente
    IP: '🌐',
    JAVA: '☕',
    BEDROCK: '🪨',
  }
};

/* ───────── CLIENTE DISCORD ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction]
});

/* ───────── MEMORIA (temporal) ───────── */
const nivelesDB = new Map();
const openTickets = new Map();
const suggestionsDB = new Map();
let suggestionCounter = 1;

/* ───────── FUNCIONES DE AYUDA ───────── */
function findChannelByName(guild, name) {
  if (!guild) return null;
  return guild.channels.cache.find(c => c.name === name);
}

async function ensureMutedRole(guild) {
  if (!guild) return null;
  let muted = guild.roles.cache.find(r => r.name === 'Muted');
  if (muted) return muted;
  muted = await guild.roles.create({ name: 'Muted', reason: 'Rol para silenciar usuarios', permissions: [] }).catch(() => null);
  if (!muted) return null;
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

/* ───────── READY: INICIO DEL BOT ───────── */
client.once('ready', async () => {
  try {
    console.log(`🤖 Bot conectado como ${client.user.tag}`);
    client.user.setActivity('Power Luki Network', { type: 4 }); // Estado personalizado

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
      console.log('✅ Slash commands registrados exitosamente.');
    } catch (err) {
      console.error('❌ Error registrando comandos:', err);
    }

    // Publicar panel de tickets
    try {
      const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || client.guilds.cache.first();
      if (!guild) {
        console.log("⚠️ No se encontró el servidor principal para el panel de tickets.");
        return;
      }

      let panelChannel = findChannelByName(guild, CONFIG.CANALES.TICKETS_LOG);
      if (!panelChannel) {
        panelChannel = await guild.channels.create({ name: CONFIG.CANALES.TICKETS_LOG, type: ChannelType.GuildText }).catch(() => null);
      }
      
      if (panelChannel) {
        const fetched = await panelChannel.messages.fetch({ limit: 50 }).catch(() => null);
        const existe = fetched && fetched.find(m => m.author?.id === client.user.id && m.embeds?.length && m.embeds[0].title?.includes('Centro de Soporte'));
        
        if (!existe) {
          const embed = new EmbedBuilder()
            .setTitle('🛠️ Centro de Soporte | Power Luki Network')
            .setDescription('Selecciona una opción abajo para abrir un ticket y ser atendido por el staff.')
            .setColor('#0099ff')
            .setFooter({ text: 'Power Luki Network Support' });
            
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_ticket_support').setLabel('Soporte').setEmoji('🔧').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('open_ticket_reports').setLabel('Reportes').setEmoji('🚨').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('open_ticket_shop').setLabel('Tienda').setEmoji('🛒').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('open_ticket_other').setLabel('Otros').setEmoji('❔').setStyle(ButtonStyle.Secondary)
          );
          await panelChannel.send({ embeds: [embed], components: [row] }).catch(() => { });
          console.log('✅ Panel de tickets publicado.');
        }
      }
    } catch (e) {
      console.error('Error publicando panel de tickets:', e);
    }
  } catch (e) {
    console.error('Error general en ready:', e);
  }
});

/* ───────── INTERACCIONES (Comandos, Botones, Modales) ───────── */
client.on('interactionCreate', async (interaction) => {
  try {
    /* CHAT COMMANDS */
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      // /ticket
      if (name === 'ticket') {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: 'Usa esto en servidores.', ephemeral: true });
        if (openTickets.has(interaction.user.id)) return interaction.reply({ content: 'Ya tienes un ticket abierto.', ephemeral: true });
        
        let category = guild.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS_CATEGORY && c.type === ChannelType.GuildCategory);
        if(!category) category = await guild.channels.create({ name: CONFIG.CANALES.TICKETS_CATEGORY, type: ChannelType.GuildCategory });

        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}`.slice(0, 90);
        
        const ticketChannel = await guild.channels.create({
          name: channelName, type: ChannelType.GuildText, parent: category ? category.id : undefined,
          permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] } // Asegúrate que este ID exista
          ]
        }).catch(() => null);
        
        if (!ticketChannel) return interaction.reply({ content: 'Error creando canal. Verifica permisos del bot.', ephemeral: true });
        openTickets.set(interaction.user.id, ticketChannel.id);
        
        const logCh = findChannelByName(guild, CONFIG.CANALES.TICKETS_LOG);
        if (logCh) logCh.send({ embeds: [new EmbedBuilder().setColor('Green').setTitle('🎫 Nuevo Ticket Manual').setDescription(`Usuario: ${interaction.user.tag}\nCanal: ${ticketChannel}`)] }).catch(() => { });
        
        await ticketChannel.send({ content: `${interaction.user} — Gracias por abrir un ticket. Un staff te atenderá.` }).catch(() => { });
        return interaction.reply({ content: `Ticket creado: ${ticketChannel}`, ephemeral: true });
      }

      // /sugerencias
      if (name === 'sugerencias') {
        const texto = interaction.options.getString('texto');
        const guild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || interaction.guild;
        if (!guild) return interaction.reply({ content: 'Servidor no encontrado.', ephemeral: true });

        let ch = findChannelByName(guild, CONFIG.CANALES.VALORACIONES);
        if (!ch) ch = await guild.channels.create({ name: CONFIG.CANALES.VALORACIONES, type: ChannelType.GuildText }).catch(() => null);
        if (!ch) return interaction.reply({ content: 'No se pudo crear/obtener canal de valoraciones.', ephemeral: true });

        const id = (suggestionCounter++).toString(36).toUpperCase();
        const embed = new EmbedBuilder().setTitle(`Sugerencia #${id}`).setDescription(texto).setColor('#FFFF00')
          .addFields({ name: 'Autor', value: interaction.user.tag, inline: true }, { name: 'ID', value: id, inline: true })
          .setFooter({ text: `Power Lucky Network • ${formatTimestamp()}` }).setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`public_like_${id}`).setLabel('👍').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`public_dislike_${id}`).setLabel('👎').setStyle(ButtonStyle.Secondary)
        );

        const msg = await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
        suggestionsDB.set(id, { id, author: interaction.user.id, texto, messageId: msg ? msg.id : null, channelId: ch.id, status: 'pending', createdAt: Date.now() });
        return interaction.reply({ content: 'Sugerencia enviada a Valoraciones.', ephemeral: true });
      }

      // /sugerenciaserver
      if (name === 'sugerenciaserver') {
        const texto = interaction.options.getString('texto');
        const mainGuild = client.guilds.cache.get(CONFIG.MAIN_GUILD_ID) || interaction.guild;
        
        let staffCh = findChannelByName(mainGuild, CONFIG.CANALES.STAFF_REVIEW);
        if (!staffCh) staffCh = await mainGuild.channels.create({ name: CONFIG.CANALES.STAFF_REVIEW, type: ChannelType.GuildText }).catch(() => null);
        if (!staffCh) return interaction.reply({ content: 'No se pudo contactar al canal staff.', ephemeral: true });

        const id = (suggestionCounter++).toString(36).toUpperCase();
        const embed = new EmbedBuilder().setTitle(`Sugerencia Staff #${id}`).setDescription(texto).setColor('Orange')
          .addFields({ name: 'Autor', value: interaction.user.tag, inline: true }, { name: 'ID', value: id, inline: true })
          .setFooter({ text: `Revisión requerida • ${formatTimestamp()}` }).setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`staff_accept_${id}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`staff_deny_${id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

        const msg = await staffCh.send({ embeds: [embed], components: [row] }).catch(() => null);
        suggestionsDB.set(id, { id, author: interaction.user.id, texto, messageId: msg ? msg.id : null, channelId: staffCh.id, status: 'pending', createdAt: Date.now() });
        return interaction.reply({ content: 'Tu sugerencia fue enviada al staff para valoración.', ephemeral: true });
      }

      // /nuevo y /anuncio
      if (name === 'nuevo' || name === 'anuncio') {
        const memberRoles = interaction.member?.roles?.cache;
        // Permitir si es admin o tiene el rol de staff
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && (!memberRoles || !memberRoles.has(CONFIG.STAFF_ROLE_ID))) {
           return interaction.reply({ content: 'Solo staff/admin puede usar esto.', ephemeral: true });
        }
        
        const contenido = interaction.options.getString('mensaje');
        const targetGuild = interaction.guild;
        const channelName = name === 'nuevo' ? CONFIG.CANALES.NUEVO : CONFIG.CANALES.ANUNCIOS;
        
        let ch = findChannelByName(targetGuild, channelName);
        if (!ch) ch = await targetGuild.channels.create({ name: channelName, type: ChannelType.GuildText }).catch(() => null);
        
        const embed = new EmbedBuilder()
            .setTitle(name === 'nuevo' ? '🎊 Nuevo' : '📣 Anuncio')
            .setDescription(contenido)
            .setColor(name === 'nuevo' ? 'Blue' : 'Red')
            .setFooter({ text: 'Power Luki Network' }).setTimestamp();
            
        await ch.send({ embeds: [embed] }).catch(() => { });
        return interaction.reply({ content: 'Mensaje enviado.', ephemeral: true });
      }

      // Moderación: mute, unmute, ban
      if (name === 'mute') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sin permisos.', ephemeral: true });
        
        const usuario = interaction.options.getUser('usuario');
        const duracion = interaction.options.getString('duracion');
        const member = await interaction.guild.members.fetch(usuario.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
        
        const mutedRole = await ensureMutedRole(interaction.guild);
        await member.roles.add(mutedRole).catch(() => {});
        
        const ch = findChannelByName(interaction.guild, CONFIG.CANALES.SILENCIADOS);
        if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('🔇 Muteado').setDescription(`${usuario.tag} silenciado por ${interaction.user.tag}`).setColor('Grey')] });
        
        interaction.reply({ content: `Silenciado ${usuario.tag}`, ephemeral: true });
        
        if (duracion) {
           const ms = parseTimeToMs(duracion);
           if (ms) setTimeout(async () => {
              if (member.roles.cache.has(mutedRole.id)) {
                  await member.roles.remove(mutedRole);
                  const ch2 = findChannelByName(interaction.guild, CONFIG.CANALES.DESILENCIADOS);
                  if (ch2) ch2.send({ content: `${usuario.tag} desilenciado automáticamente.` });
              }
           }, ms);
        }
      }

      if (name === 'unmute') {
         if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sin permisos.', ephemeral: true });
         const usuario = interaction.options.getUser('usuario');
         const member = await interaction.guild.members.fetch(usuario.id).catch(() => null);
         const muted = interaction.guild.roles.cache.find(r => r.name === 'Muted');
         if (member && muted) {
             await member.roles.remove(muted);
             return interaction.reply({ content: 'Usuario desilenciado.', ephemeral: true });
         }
         return interaction.reply({ content: 'No se pudo desilenciar.', ephemeral: true });
      }

      if (name === 'ban' || name === 'temban') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: 'Sin permisos.', ephemeral: true });
        const usuario = interaction.options.getUser('usuario');
        const razon = interaction.options.getString('razon') || 'Sin razón';
        
        await interaction.guild.bans.create(usuario.id, { reason: `${razon} - por ${interaction.user.tag}` });
        
        const ch = findChannelByName(interaction.guild, CONFIG.CANALES.BANEOS);
        if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('🔨 Baneado').setDescription(`${usuario.tag}\nRazón: ${razon}`).setColor('DarkRed')] });
        
        interaction.reply({ content: 'Usuario baneado.', ephemeral: true });
        
        if (name === 'temban') {
            const tiempo = interaction.options.getString('tiempo');
            const ms = parseTimeToMs(tiempo);
            if (ms) setTimeout(() => interaction.guild.bans.remove(usuario.id).catch(() => {}), ms);
        }
      }
      
      if (name === 'encuesta') {
         if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: 'Solo staff.', ephemeral: true });
         const pregunta = interaction.options.getString('pregunta');
         const embed = new EmbedBuilder().setTitle('📊 Encuesta').setDescription(pregunta).setColor('Gold');
         const reply = await interaction.reply({ embeds: [embed], fetchReply: true });
         await reply.react('👍');
         await reply.react('👎');
      }
    } // Fin comandos de chat

    /* BUTTONS */
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Abrir tickets desde el panel
      if (id.startsWith('open_ticket_')) {
        const type = id.split('_')[2]; 
        if (openTickets.has(interaction.user.id)) return interaction.reply({ content: 'Ya tienes un ticket abierto.', ephemeral: true });
        
        const guild = interaction.guild;
        let category = guild.channels.cache.find(c => c.name === CONFIG.CANALES.TICKETS_CATEGORY && c.type === ChannelType.GuildCategory);
        if (!category) category = await guild.channels.create({ name: CONFIG.CANALES.TICKETS_CATEGORY, type: ChannelType.GuildCategory });

        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${type}`.slice(0, 90);
        const ticketChannel = await guild.channels.create({
          name: channelName, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        }).catch(() => null);

        if (!ticketChannel) return interaction.reply({ content: 'Error creando canal.', ephemeral: true });
        openTickets.set(interaction.user.id, ticketChannel.id);
        
        const logCh = findChannelByName(guild, CONFIG.CANALES.TICKETS_LOG);
        if (logCh) logCh.send({ embeds: [new EmbedBuilder().setTitle('🎫 Nuevo Ticket Panel').setDescription(`Usuario: ${interaction.user.tag} (${type})\nCanal: ${ticketChannel}`).setColor('Blue')] }).catch(() => { });
        
        await ticketChannel.send({ content: `${interaction.user} | Staff: <@&${CONFIG.STAFF_ROLE_ID}>\nDescribe tu problema aquí.` }).catch(() => { });
        return interaction.reply({ content: `Ticket creado: ${ticketChannel}`, ephemeral: true });
      }

      // Votos sugerencias
      if (id.startsWith('public_like_') || id.startsWith('public_dislike_')) {
        const sId = id.split('_')[2];
        const data = suggestionsDB.get(sId);
        if (!data) return interaction.reply({ content: 'Sugerencia antigua o no encontrada.', ephemeral: true });
        
        // Intentar obtener el mensaje para reaccionar si no funciona el botón directo
        // (Aquí solo simulamos la respuesta ya que los botones hacen de contador visual si se implementa lógica extra, pero reaccionaremos al mensaje)
        const channel = interaction.guild.channels.cache.get(data.channelId);
        if (channel) {
            const msg = await channel.messages.fetch(data.messageId).catch(() => null);
            if (msg) {
                const emoji = id.includes('like') && !id.includes('dislike') ? '👍' : '👎';
                await msg.react(emoji).catch(() => {});
            }
        }
        return interaction.reply({ content: 'Voto registrado.', ephemeral: true });
      }

      // Staff aceptar/rechazar
      if (id.startsWith('staff_accept_') || id.startsWith('staff_deny_')) {
        const modal = new ModalBuilder().setCustomId(`${id}_modal`).setTitle(id.includes('accept') ? 'Aprobar Sugerencia' : 'Rechazar Sugerencia');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Razón').setStyle(TextInputStyle.Paragraph).setRequired(true)));
        await interaction.showModal(modal);
      }
    }

    /* MODALS */
    if (interaction.type === InteractionType.ModalSubmit) {
       const cid = interaction.customId;
       if (cid.includes('staff_accept_') || cid.includes('staff_deny_')) {
          const parts = cid.split('_'); 
          const action = parts[1]; // accept/deny
          const sId = parts[2];
          const reason = interaction.fields.getTextInputValue('reason');
          
          const data = suggestionsDB.get(sId);
          if (data) {
             const guild = interaction.guild;
             let valCh = findChannelByName(guild, CONFIG.CANALES.VALORACIONES);
             if (!valCh) valCh = await guild.channels.create({ name: CONFIG.CANALES.VALORACIONES, type: ChannelType.GuildText });
             
             const color = action === 'accept' ? 'Green' : 'Red';
             const title = action === 'accept' ? '✅ Sugerencia Aprobada' : '❌ Sugerencia Rechazada';
             
             const embed = new EmbedBuilder().setTitle(title).setColor(color)
                .addFields(
                    { name: 'Sugerencia Original', value: data.texto },
                    { name: 'Razón del Staff', value: reason },
                    { name: 'Staff', value: interaction.user.tag }
                ).setFooter({ text: `ID: ${sId}` }).setTimestamp();
                
             await valCh.send({ embeds: [embed] });
             
             // Borrar o editar mensaje del staff
             try {
                const staffCh = guild.channels.cache.get(data.channelId);
                const msg = await staffCh.messages.fetch(data.messageId);
                if (msg) msg.edit({ components: [], content: `**Procesada como: ${action}**` });
             } catch(e) {}
             
             interaction.reply({ content: 'Procesado.', ephemeral: true });
          } else {
             interaction.reply({ content: 'Error: Datos no encontrados.', ephemeral: true });
          }
       }
    }

  } catch (err) {
    console.error('Error interacción:', err);
  }
});

/* ───────── EVENTOS DE MENSAJES ───────── */
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const content = message.content.toLowerCase();

  // Comandos simples
  if (content === '!ip' || content === 'ip') {
    const ipEmbed = new EmbedBuilder().setTitle(`${CONFIG.EMOJIS.IP} IP DEL SERVIDOR`).setColor('#00FFFF')
      .setDescription(`**Java:** \`${CONFIG.SERVER_IP}\`\n**Bedrock:** \`${CONFIG.SERVER_IP}\`\n**Puerto:** \`${CONFIG.SERVER_PORT}\``)
      .setFooter({ text: 'PowerMax Network' });
    return message.channel.send({ embeds: [ipEmbed] });
  }

  if (content.includes('!tienda') || content.includes('!store')) {
    const shopEmbed = new EmbedBuilder().setTitle(`${CONFIG.EMOJIS.TIENDA} TIENDA`).setColor('#FFCC00')
      .setDescription(`Adquiere rangos aquí: https://tienda.powermax.com`);
    return message.channel.send({ embeds: [shopEmbed] });
  }

  // Cerrar ticket
  if (content.startsWith('!cerrar')) {
    const channelId = message.channel.id;
    // Buscar si este canal es un ticket
    const isTicket = [...openTickets.values()].includes(channelId);
    
    if (isTicket || message.channel.name.startsWith('ticket-')) {
       message.channel.send('🛑 Cerrando ticket en 5 segundos...');
       // Limpiar de memoria
       for (let [uid, cid] of openTickets.entries()) {
           if (cid === channelId) openTickets.delete(uid);
       }
       setTimeout(() => message.channel.delete().catch(() => {}), 5000);
    }
  }

  // Sistema de Niveles (XP)
  const userId = message.author.id;
  let data = nivelesDB.get(userId) || { xp: 0, nivel: 1, lastXP: 0 };
  
  if (Date.now() - data.lastXP > 60000) { // Cooldown de 1 min
    data.xp += Math.floor(Math.random() * 15) + 10;
    data.lastXP = Date.now();
    
    const xpNecesaria = data.nivel * 250;
    if (data.xp >= xpNecesaria) {
      data.nivel++;
      data.xp = 0;
      const ch = findChannelByName(message.guild, CONFIG.CANALES.NIVELES);
      if (ch) ch.send({ content: `🎉 ¡Felicidades <@${userId}>! Has subido al nivel **${data.nivel}**!` });
    }
    nivelesDB.set(userId, data);
  }
});

/* ───────── BIENVENIDAS / DESPEDIDAS ───────── */
client.on('guildMemberAdd', async member => {
  const ch = findChannelByName(member.guild, CONFIG.CANALES.BIENVENIDAS);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setTitle(`✨ ¡Bienvenido/a ${member.user.username}!`)
    .setDescription(`Bienvenido a **Power Luki Network**.\nEsperamos que te diviertas.`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor('Green');
  ch.send({ embeds: [embed] });
});

client.on('guildMemberRemove', async member => {
  const ch = findChannelByName(member.guild, CONFIG.CANALES.DESPEDIDAS);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setTitle(`😔 Hasta luego ${member.user.username}`)
    .setDescription(`Esperamos verte pronto de nuevo.`)
    .setColor('Red');
  ch.send({ embeds: [embed] });
});

/* ───────── SERVIDOR WEB (KEEP ALIVE) ───────── */
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ Power Luki Bot está EN LÍNEA y funcionando.');
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor Web listo en el puerto ${PORT}`);
});

/* ───────── LOGIN FINAL ───────── */
if (!process.env.TOKEN) {
  console.error('❌ ERROR CRÍTICO: No se encontró el TOKEN en las variables de entorno (.env)');
} else {
  client.login(process.env.TOKEN).catch(err => {
    console.error('❌ ERROR AL INICIAR SESIÓN: Verifica que el TOKEN sea correcto.', err);
  });
}
