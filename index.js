import 'dotenv/config';
import fs from 'fs';
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
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';

/* ───────── CLIENTE DISCORD ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── BASE DE DATOS LOCAL ───────── */
// Carga segura para evitar errores si los archivos no existen
const loadJSON = (path, defaultData) => {
  try {
    return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : defaultData;
  } catch (error) {
    return defaultData;
  }
};

let levels = loadJSON('./levels.json', { users: {} });
let invites = loadJSON('./invites.json', {});

// Guardado automático cada 30 segundos
setInterval(() => {
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
  fs.writeFileSync('./invites.json', JSON.stringify(invites, null, 2));
}, 30000);

const guildInvites = new Map();

/* ───────── DEFINICIÓN DE COMANDOS (CORREGIDA) ───────── */
// Aquí estaba el error. Ahora todas las opciones tienen descripción obligatoria.
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silenciar a un usuario temporalmente')
    .addUserOption(option => 
      option.setName('usuario')
        .setDescription('El usuario que quieres silenciar')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('tiempo')
        .setDescription('Duración del silencio (ej: 10m, 1h)')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('razon')
        .setDescription('Motivo de la sanción')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Enviar un anuncio oficial con embed')
    .addStringOption(option => 
      option.setName('mensaje')
        .setDescription('El contenido del anuncio')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Desplegar el panel de tickets de soporte')
].map(command => command.toJSON());

/* ───────── EVENTO: READY (INICIO) ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE como ${client.user.tag}`);

  // Registro de comandos en la API de Discord
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Comandos Slash registrados correctamente');
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
  }

  // Cachear invitaciones para el sistema de bienvenida
  for (const guild of client.guilds.cache.values()) {
    try {
      const currentInvites = await guild.invites.fetch();
      guildInvites.set(guild.id, new Map(currentInvites.map(i => [i.code, i.uses])));
    } catch (e) {
      console.log(`⚠️ No pude leer invitaciones de: ${guild.name}`);
    }
  }
});

/* ───────── SISTEMA DE TICKETS (DISEÑO EXACTO) ───────── */
client.on('interactionCreate', async interaction => {
  // 1. COMANDO /PANEL
  if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
    const panelEmbed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🎫 POWER LUKI NETWORK | SOPORTE')
      .setDescription('Pulsa el botón de abajo para abrir un ticket y contactar con el Staff.')
      .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png') // Tu imagen
      .setFooter({ text: 'Power Luki Network • Soporte' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('crear_ticket')
        .setLabel('Abrir Ticket')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎫')
    );

    await interaction.channel.send({ embeds: [panelEmbed], components: [row] });
    return interaction.reply({ content: '✅ Panel enviado.', ephemeral: true });
  }

  // 2. BOTONES DEL TICKET
  if (interaction.isButton()) {
    // A) CREAR EL TICKET
    if (interaction.customId === 'crear_ticket') {
      // Verificar si ya tiene ticket
      const existingChannel = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username.toLowerCase()}`);
      if (existingChannel) {
        return interaction.reply({ content: `❌ Ya tienes un ticket abierto: ${existingChannel}`, ephemeral: true });
      }

      // Crear canal privado
      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          // Aquí puedes agregar el rol de STAFF si tienes su ID:
          // { id: 'TU_ID_DE_ROL_AQUI', allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });

      // EMBED INTERNO (Copiado de tu imagen)
      const ticketEmbed = new EmbedBuilder()
        .setColor('#2F3136') // Color oscuro de Discord
        .setTitle('SOPORTE DISCORD')
        .setDescription(
          `¡Hola ${interaction.user}! Bienvenido al soporte de **Power Luki Network**\n\n` +
          `Nuestro staff le responderá en un plazo de 12 a 24 horas aproximadamente. **Por favor, sea paciente.**\n` +
          `──────────────────────────\n` +
          `**¿Cuál es tu nick de usuario?:**\n` +
          `*(Escribe tu nombre de usuario aquí)*\n\n` +
          `**Describe tu problema:**\n` +
          `*(Explica detalladamente tu situación)*\n` +
          `──────────────────────────\n` +
          `* ¡Gracias por confiar en nosotros! *`
        )
        .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png')
        .setFooter({ text: 'Power Luki Network • Tickets' });

      // BOTONES INTERNOS (Rojo y Azul/Morado como en la foto)
      const ticketRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('cerrar_ticket')
          .setLabel('Cerrar Ticket')
          .setStyle(ButtonStyle.Danger) // Rojo
          .setEmoji('🔺'), // Triángulo alerta
        new ButtonBuilder()
          .setCustomId('reclamar_ticket')
          .setLabel('Reclamar')
          .setStyle(ButtonStyle.Primary) // Azul Blurple
          .setEmoji('🏷️') // Etiqueta
      );

      await channel.send({ content: `${interaction.user} | @here`, embeds: [ticketEmbed], components: [ticketRow] });
      return interaction.reply({ content: `✅ Ticket creado en ${channel}`, ephemeral: true });
    }

    // B) CERRAR TICKET
    if (interaction.customId === 'cerrar_ticket') {
      await interaction.reply('🔒 El ticket se cerrará en 5 segundos...');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    // C) RECLAMAR TICKET
    if (interaction.customId === 'reclamar_ticket') {
      await interaction.channel.setName(`✅-${interaction.user.username}`);
      await interaction.reply(`👋 Ticket atendido por **${interaction.user.username}**`);
    }
  }

  // 3. COMANDO MUTE
  if (interaction.isChatInputCommand() && interaction.commandName === 'mute') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({ content: '❌ No tienes permisos.', ephemeral: true });
    }
    
    const target = interaction.options.getMember('usuario');
    const tiempo = interaction.options.getString('tiempo');
    const razon = interaction.options.getString('razon');

    // Conversión simple de tiempo
    let ms = parseInt(tiempo) * 60000; // Por defecto minutos
    if (tiempo.includes('h')) ms = parseInt(tiempo) * 3600000;
    
    try {
      await target.timeout(ms, razon);
      const muteEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🔇 Usuario Silenciado')
        .addFields(
          { name: 'Usuario', value: `${target}`, inline: true },
          { name: 'Moderador', value: `${interaction.user}`, inline: true },
          { name: 'Razón', value: razon }
        );
      interaction.reply({ embeds: [muteEmbed] });
    } catch (err) {
      interaction.reply({ content: '❌ Error al silenciar (revisa roles).', ephemeral: true });
    }
  }
});

/* ───────── SISTEMA DE NIVELES Y BIENVENIDA ───────── */
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  // Sumar XP
  const id = message.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };
  
  levels.users[id].xp += 15;
  const xpNecesaria = levels.users[id].level * 150;

  if (levels.users[id].xp >= xpNecesaria) {
    levels.users[id].level++;
    levels.users[id].xp = 0;
    
    const channel = message.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (channel) {
      channel.send({ 
        embeds: [new EmbedBuilder()
          .setColor('#FFD700')
          .setDescription(`🎉 **${message.author.username}** ha subido al **Nivel ${levels.users[id].level}**!`)] 
      });
    }
  }
});

client.on('guildMemberAdd', async member => {
  const channel = member.guild.channels.cache.find(c => c.name.includes('bienvenidos'));
  if (!channel) return;

  // Lógica de invitaciones
  const newInvites = await member.guild.invites.fetch();
  const oldInvites = guildInvites.get(member.guild.id);
  let inviter = 'Desconocido';
  let count = 0;

  if (oldInvites) {
    const invite = newInvites.find(i => i.uses > (oldInvites.get(i.code) || 0));
    if (invite) {
      inviter = invite.inviter?.username || 'Desconocido';
      invites[invite.inviter.id] = (invites[invite.inviter.id] || 0) + 1;
      count = invites[invite.inviter.id];
    }
  }
  guildInvites.set(member.guild.id, new Map(newInvites.map(i => [i.code, i.uses])));

  const welcomeEmbed = new EmbedBuilder()
    .setColor('#00E5FF')
    .setTitle(`✨ ¡Bienvenido a Power Luki Network!`)
    .setDescription(`👤 **${member.user.username}**\n🔗 Invitado por: **${inviter}** (${count} invs)`)
    .setImage('https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg')
    .setThumbnail(member.user.displayAvatarURL());
    
  channel.send({ embeds: [welcomeEmbed] });
});

/* ───────── SERVIDOR WEB (IMPORTANTE PARA RENDER) ───────── */
const app = express();
app.get('/', (req, res) => res.send('Bot Activo 24/7 ✅'));

// IMPORTANTE: Primero levantamos el servidor, luego el bot
app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
  console.log('🌐 Servidor Web Listo');
  
  // Login final
  client.login(process.env.TOKEN).catch(err => {
    console.error('❌ Error al iniciar sesión en Discord:', err.message);
  });
});
