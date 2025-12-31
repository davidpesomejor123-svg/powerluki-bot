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
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── CONSTANTES ───────── */
const PREFIJO = '!';
const ROLES_TICKETS = ['Owner', 'Co-Owner', 'Admin', 'Mod', 'Staff'];
const TICKET_CHANNEL_NAME = '『📖』tickets';
const AUTO_CLOSE_TIME = 3 * 24 * 60 * 60 * 1000; 
const ticketTimers = new Map();
const guildInvites = new Map();

/* ───────── BASE DE DATOS LOCAL ───────── */
const cargarDB = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
let levels = cargarDB('./levels.json', { users: {} });
let invitesDB = cargarDB('./invites.json', {});

const guardarDB = () => {
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
  fs.writeFileSync('./invites.json', JSON.stringify(invitesDB, null, 2));
};
setInterval(guardarDB, 30000);

/* ───────── COMANDOS SLASH ───────── */
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silenciar a un usuario temporalmente')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
    .addStringOption(opt => opt.setName('tiempo').setDescription('Tiempo (ej: 10m, 1h)').setRequired(true))
    .addStringOption(opt => opt.setName('razon').setDescription('Motivo').setRequired(true)),
  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Enviar anuncio')
    .addStringOption(opt => opt.setName('mensaje').setDescription('Mensaje del anuncio').setRequired(true)),
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Desplegar panel de tickets')
].map(cmd => cmd.toJSON());

/* ───────── READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE como ${client.user.tag}`);

  // Registro de comandos Slash
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Comandos Slash registrados correctamente');
  } catch (error) { console.error('❌ Error registro comandos:', error); }

  // Panel automático
  const canal = client.channels.cache.find(c => c.name === TICKET_CHANNEL_NAME);
  if (canal) {
    const mensajes = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    if (mensajes && !mensajes.some(m => m.author.id === client.user.id)) {
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
      await canal.send({ embeds: [embed], components: [menu] }).catch(() => {});
    }
  }

  // Cachear invitaciones
  client.guilds.cache.forEach(async guild => {
    const firstInvites = await guild.invites.fetch().catch(() => null);
    if (firstInvites) guildInvites.set(guild.id, new Map(firstInvites.map(i => [i.code, i.uses])));
  });
});

/* ───────── SISTEMA DE NIVELES ───────── */
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;

  const id = msg.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };
  levels.users[id].xp += 15;
  
  if (levels.users[id].xp >= levels.users[id].level * 150) {
    levels.users[id].level++;
    levels.users[id].xp = 0;
    const ch = msg.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setDescription(`🎉 **${msg.author.username}** subió al **Nivel ${levels.users[id].level}**!`)] });
  }

  if (!msg.content.startsWith(PREFIJO)) return;
  const args = msg.content.slice(PREFIJO.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'ban' && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) { await user.ban().catch(() => {}); msg.reply('✅ Baneado.'); }
  }
});

/* ───────── BIENVENIDAS ───────── */
client.on('guildMemberAdd', async member => {
  const ch = member.guild.channels.cache.find(c => c.name.includes('bienvenidos'));
  if (!ch) return;

  const newInvites = await member.guild.invites.fetch().catch(() => null);
  const oldInvites = guildInvites.get(member.guild.id);
  let inviter = 'Desconocido', count = 0;

  if (newInvites && oldInvites) {
    const invite = newInvites.find(i => i.uses > (oldInvites.get(i.code) || 0));
    if (invite && invite.inviter) {
      inviter = invite.inviter.username;
      invitesDB[invite.inviter.id] = (invitesDB[invite.inviter.id] || 0) + 1;
      count = invitesDB[invite.inviter.id];
    }
    guildInvites.set(member.guild.id, new Map(newInvites.map(i => [i.code, i.uses])));
  }

  const embed = new EmbedBuilder()
    .setColor('#00E5FF')
    .setTitle('✨ ¡Bienvenido a Power Luki Network!')
    .setDescription(`👤 **${member.user.username}**\n🔗 Invitado por: **${inviter}** (${count} invs)`)
    .setImage('https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg')
    .setThumbnail(member.user.displayAvatarURL());

  ch.send({ embeds: [embed] }).catch(() => {});
});

/* ───────── SISTEMA DE TICKETS ───────── */
client.on('interactionCreate', async i => {
  if (i.isStringSelectMenu() && i.customId === 'menu_tickets') {
    const permisos = [
      { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ];
    ROLES_TICKETS.forEach(n => {
      const r = i.guild.roles.cache.find(role => role.name === n);
      if (r) permisos.push({ id: r.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
    });

    const canal = await i.guild.channels.create({
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
      .setDescription(`👋 Hola ${i.user}\n⏳ El staff responderá pronto\n────────────────────\n${preguntas}`)
      .setImage('https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg');

    const botones = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reclamar_ticket').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('👋'),
      new ButtonBuilder().setCustomId('cerrar_ticket').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await canal.send({ content: `${i.user} | @Staff`, embeds: [embed], components: [botones] });
    await i.reply({ content: `✅ Ticket creado: ${canal}`, ephemeral: true });
  }

  if (i.isButton()) {
    const esStaff = ROLES_TICKETS.some(n => i.member.roles.cache.some(r => r.name === n));
    if (i.customId === 'reclamar_ticket') {
      if (!esStaff) return i.reply({ content: '❌ Solo staff.', ephemeral: true });
      await i.channel.setName(`✅-${i.user.username}`).catch(() => {});
      await i.reply(`👋 Ticket atendido por ${i.user.username}`);
    }
    if (i.customId === 'cerrar_ticket') {
      if (!esStaff) return i.reply({ content: '❌ Solo staff.', ephemeral: true });
      await i.reply('🔒 Cerrando en 5s...');
      setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
  }

  // Comandos Slash
  if (i.isChatInputCommand()) {
    if (i.commandName === 'panel') {
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🎫 POWER LUKI NETWORK | SOPORTE')
        .setDescription('Usa el menú para abrir un ticket.')
        .setImage('https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg');

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('menu_tickets')
          .setPlaceholder('📩 Seleccionar categoría')
          .addOptions([
            { label: 'Soporte General', value: 'tk_soporte', emoji: '🛠️' },
            { label: 'Soporte Tienda', value: 'tk_tienda', emoji: '🛒' },
            { label: 'Reporte de Jugador', value: 'tk_reporte', emoji: '🚫' }
          ])
      );
      await i.channel.send({ embeds: [embed], components: [menu] });
      await i.reply({ content: '✅ Panel enviado', ephemeral: true });
    }

    if (i.commandName === 'mute') {
      if (!i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return i.reply({ content: '❌ No tienes permisos.', ephemeral: true });
      const target = i.options.getMember('usuario');
      const tiempo = i.options.getString('tiempo');
      const razon = i.options.getString('razon');
      let ms = parseInt(tiempo) * 60000;
      if (tiempo.includes('h')) ms = parseInt(tiempo) * 3600000;

      await target.timeout(ms, razon).then(() => {
        i.reply({ embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('🔇 Usuario Silenciado').addFields({ name: 'Usuario', value: `${target}`, inline: true }, { name: 'Razón', value: razon })] });
      }).catch(() => i.reply({ content: '❌ Error al silenciar.', ephemeral: true }));
    }
    
    if (i.commandName === 'anuncio') {
      if (!i.member.permissions.has(PermissionsBitField.Flags.Administrator)) return i.reply({ content: '❌ Solo admins.', ephemeral: true });
      const msgAnuncio = i.options.getString('mensaje');
      const embed = new EmbedBuilder().setColor('#FFCC00').setTitle('📢 ANUNCIO').setDescription(msgAnuncio).setFooter({ text: 'Power Luki Network' });
      await i.channel.send({ embeds: [embed] });
      await i.reply({ content: '✅ Anuncio enviado', ephemeral: true });
    }
  }
});

/* ───────── SERVIDOR WEB ───────── */
const app = express();
app.get('/', (req, res) => res.send('Power Luki Network ✅'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
  console.log('🌐 Servidor Web activo');
  client.login(process.env.TOKEN).catch(err => console.error('❌ Error login:', err));
});
