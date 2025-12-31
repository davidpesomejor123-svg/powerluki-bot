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
  StringSelectMenuBuilder,
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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── CONSTANTES ───────── */
const PREFIJO = '!';
const ROLES_TICKETS = ['Owner', 'Co-Owner', 'Admin', 'Mod', 'Staff'];
const TICKET_CHANNEL_NAME = '『📖』tickets';
const AUTO_CLOSE_TIME = 3 * 24 * 60 * 60 * 1000; // 3 días
const ticketTimers = new Map();

/* ───────── BASE DE DATOS LOCAL ───────── */
const cargarDB = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
let levels = cargarDB('./levels.json', { users: {} });
let invites = cargarDB('./invites.json', {});
setInterval(() => {
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
  fs.writeFileSync('./invites.json', JSON.stringify(invites, null, 2));
}, 30000);

const guildInvites = new Map();

/* ───────── COMANDOS SLASH ───────── */
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silenciar a un usuario temporalmente')
    .addUserOption(option => option.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
    .addStringOption(option => option.setName('tiempo').setDescription('Tiempo (ej: 10m, 1h)').setRequired(true))
    .addStringOption(option => option.setName('razon').setDescription('Motivo').setRequired(true)),

  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Enviar anuncio')
    .addStringOption(option => option.setName('mensaje').setDescription('Mensaje del anuncio').setRequired(true)),

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Desplegar panel de tickets')
].map(cmd => cmd.toJSON());

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE como ${client.user.tag}`);

  // Registro de comandos
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Comandos Slash registrados');
  } catch (error) { console.error('❌ Error comandos:', error); }

  // Enviar panel automático si existe canal
  const canal = client.channels.cache.find(c => c.name === TICKET_CHANNEL_NAME);
  if (canal) {
    const mensajes = await canal.messages.fetch({ limit: 10 });
    if (!mensajes.some(m => m.author.id === client.user.id)) {
      const embed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('🎫 SISTEMA DE TICKETS | POWER LUKI')
        .setDescription('Seleccione el tipo de soporte.\n\n📌 **Normas**\n• No spam\n• Respeto al staff\n• Espere respuesta')
        .setImage('https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg');

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('menu_tickets')
          .setPlaceholder('📩 Abrir ticket')
          .addOptions([
            { label: 'Soporte General', value: 'tk_soporte', emoji: '🛠️' },
            { label: 'Soporte Tienda', value: 'tk_tienda', emoji: '🛒' },
            { label: 'Reporte de Jugador', value: 'tk_reporte', emoji: '🚫' }
          ])
      );

      await canal.send({ embeds: [embed], components: [menu] });
      console.log('✅ Panel enviado automáticamente');
    }
  }

  // Cachear invitaciones
  for (const guild of client.guilds.cache.values()) {
    try {
      const currentInvites = await guild.invites.fetch();
      guildInvites.set(guild.id, new Map(currentInvites.map(i => [i.code, i.uses])));
    } catch { console.log(`⚠️ No pude leer invitaciones: ${guild.name}`); }
  }
});

/* ───────── SISTEMA DE NIVELES ───────── */
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;

  // XP y niveles
  const id = msg.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };
  levels.users[id].xp += 15;
  const xpNecesaria = levels.users[id].level * 150;

  if (levels.users[id].xp >= xpNecesaria) {
    levels.users[id].level++;
    levels.users[id].xp = 0;
    const ch = msg.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setDescription(`🎉 **${msg.author.username}** subió al **Nivel ${levels.users[id].level}**!`)] });
  }

  // Comandos prefijo
  if (!msg.content.startsWith(PREFIJO)) return;
  const args = msg.content.slice(PREFIJO.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'ban' && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) { await user.ban(); msg.reply('✅ Baneado.'); }
  }
});

/* ───────── BIENVENIDAS ───────── */
client.on('guildMemberAdd', async member => {
  const ch = member.guild.channels.cache.find(c => c.name.includes('bienvenidos'));
  if (!ch) return;

  // Invitaciones
  const newInvites = await member.guild.invites.fetch();
  const oldInvites = guildInvites.get(member.guild.id);
  let inviter = 'Desconocido';
  let count = 0;
  if (oldInvites) {
    const invite = newInvites.find(i => i.uses > (oldInvites.get(i.code) || 0));
    if (invite) { inviter = invite.inviter?.username || 'Desconocido'; invites[invite.inviter.id] = (invites[invite.inviter.id] || 0) + 1; count = invites[invite.inviter.id]; }
  }
  guildInvites.set(member.guild.id, new Map(newInvites.map(i => [i.code, i.uses])));

  const embed = new EmbedBuilder()
    .setColor('#00E5FF')
    .setTitle('✨ ¡Bienvenido a Power Luki Network!')
    .setDescription(`👤 **${member.user.username}**\n🔗 Invitado por: **${inviter}** (${count} invs)`)
    .setImage('https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg')
    .setThumbnail(member.user.displayAvatarURL());

  ch.send({ embeds: [embed] });
});

/* ───────── SISTEMA DE TICKETS ───────── */
client.on('interactionCreate', async i => {
  // Selección de tickets
  if (i.isStringSelectMenu() && i.customId === 'menu_tickets') {
    const guild = i.guild;
    const permisos = [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ];
    ROLES_TICKETS.forEach(nombre => {
      const rol = guild.roles.cache.find(r => r.name === nombre);
      if (rol) permisos.push({ id: rol.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
    });

    const canal = await guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: permisos
    });

    let titulo = '🛠️ SOPORTE GENERAL', preguntas = '**Nick:**\n\n**Describe tu problema:**';
    if (i.values[0] === 'tk_tienda') { titulo = '🛒 SOPORTE DE TIENDA'; preguntas = '**Nick:**\n\n**ID de compra:**\n\n**Problema:**'; }
    else if (i.values[0] === 'tk_reporte') { titulo = '🚫 REPORTE DE JUGADOR'; preguntas = '**Tu nick:**\n\n**Nick reportado:**\n\n**Pruebas:**'; }

    const embed = new EmbedBuilder()
      .setColor('#2F3136')
      .setTitle(titulo)
      .setDescription(`👋 Hola ${i.user}\n\n⏳ El staff responderá pronto\n────────────────────\n${preguntas}`)
      .setImage('https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg');

    const botones = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reclamar_ticket').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('👋'),
      new ButtonBuilder().setCustomId('cerrar_ticket').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await canal.send({ content: `${i.user} | @Staff`, embeds: [embed], components: [botones] });
    const timer = setTimeout(() => canal.delete().catch(() => {}), AUTO_CLOSE_TIME);
    ticketTimers.set(canal.id, timer);

    await i.reply({ content: `✅ Ticket creado: ${canal}`, ephemeral: true });
  }

  // Botones
  if (i.isButton()) {
    const esStaff = ROLES_TICKETS.some(nombre => i.member.roles.cache.some(r => r.name === nombre));
    if (!esStaff && ['reclamar_ticket','cerrar_ticket'].includes(i.customId)) return i.reply({ content: '❌ Solo staff.', ephemeral: true });

    if (i.customId === 'reclamar_ticket') { await i.channel.setName(`✅-${i.user.username}`); await i.reply(`👋 Ticket atendido por ${i.user.username}`); }
    if (i.customId === 'cerrar_ticket') { await i.reply('🔒 Cerrando en 5s...'); setTimeout(() => i.channel.delete().catch(()=>{}), 5000); }
  }

  // Comando /panel
  if (i.isChatInputCommand() && i.commandName === 'panel') {
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🎫 POWER LUKI NETWORK | SOPORTE')
      .setDescription('Pulsa el botón para abrir ticket.')
      .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png')
      .setFooter({ text: 'Power Luki Network • Soporte' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('crear_ticket').setLabel('Abrir Ticket').setStyle(ButtonStyle.Success).setEmoji('🎫')
    );

    await i.channel.send({ embeds: [embed], components: [row] });
    return i.reply({ content: '✅ Panel enviado', ephemeral: true });
  }

  // Comando /mute
  if (i.isChatInputCommand() && i.commandName === 'mute') {
    if (!i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return i.reply({ content: '❌ No tienes permisos.', ephemeral: true });
    const target = i.options.getMember('usuario');
    const tiempo = i.options.getString('tiempo');
    const razon = i.options.getString('razon');

    let ms = parseInt(tiempo) * 60000;
    if (tiempo.includes('h')) ms = parseInt(tiempo) * 3600000;

    try { await target.timeout(ms, razon);
      const e = new EmbedBuilder().setColor('#FF0000').setTitle('🔇 Usuario Silenciado')
        .addFields({ name:'Usuario', value:`${target}`, inline:true },{ name:'Moderador', value:`${i.user}`, inline:true },{ name:'Razón', value: razon });
      i.reply({ embeds:[e] });
    } catch { i.reply({ content:'❌ Error al silenciar.', ephemeral:true }); }
  }
});

/* ───────── SERVIDOR WEB ───────── */
const app = express();
app.get('/', (req,res) => res.send('Power Luki Network ✅'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
  console.log('🌐 Servidor Web listo');
  client.login(process.env.TOKEN).catch(err => console.error('❌ Error login:', err.message));
});

