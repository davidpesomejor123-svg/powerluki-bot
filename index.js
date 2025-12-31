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

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── PERSISTENCIA DE DATOS ───────── */
const loadJSON = (file, fallback) => {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.error(`Error cargando ${file}`); }
  return fallback;
};

let levels = loadJSON('./levels.json', { users: {} });
let invites = loadJSON('./invites.json', {});

const saveLevels = () => fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
const saveInvites = () => fs.writeFileSync('./invites.json', JSON.stringify(invites, null, 2));
setInterval(saveLevels, 30000);

const guildInvites = new Map();

/* ───────── READY & COMANDOS ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('El usuario').setRequired(true))
      .addStringOption(o => o.setName('tiempo').setDescription('Ej: 10m, 1h').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Motivo').setRequired(true)),
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio oficial')
      .addStringOption(o => o.setName('mensaje').setDescription('Mensaje').setRequired(true)),
    new SlashCommandBuilder()
      .setName('panel')
      .setDescription('Enviar el panel de tickets')
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash Commands registrados correctamente');
  } catch (e) { console.error('❌ Error registrando comandos:', e.message); }

  for (const guild of client.guilds.cache.values()) {
    try {
      const invs = await guild.invites.fetch();
      guildInvites.set(guild.id, new Map(invs.map(i => [i.code, i.uses])));
    } catch (e) { console.log(`Error leyendo invitaciones en ${guild.name}`); }
  }
});

/* ───────── NIVELES Y ANTI-SPAM ───────── */
const cooldown = new Map();
client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;

  // Anti-Spam
  const now = Date.now();
  const data = cooldown.get(msg.author.id) || { count: 0, last: now };
  if (now - data.last < 5000) data.count++; else data.count = 1;
  data.last = now;
  cooldown.set(msg.author.id, data);

  if (data.count > 5 && !msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    try {
      await msg.member.timeout(300000, 'Spam detectado');
      const log = msg.guild.channels.cache.find(ch => ch.name.includes('silenciados'));
      if (log) log.send(`🛡️ ${msg.author} silenciado 5m por spam.`);
    } catch (e) {}
    return;
  }

  // XP Niveles
  const id = msg.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };
  levels.users[id].xp += 15;
  if (levels.users[id].xp >= levels.users[id].level * 150) {
    levels.users[id].level++;
    levels.users[id].xp = 0;
    const ch = msg.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setDescription(`🌟 **${msg.author.username}** subió al **Nivel ${levels.users[id].level}**`)] });
  }
});

/* ───────── BIENVENIDA ───────── */
client.on('guildMemberAdd', async member => {
  const ch = member.guild.channels.cache.find(c => c.name.includes('bienvenidos'));
  if (!ch) return;

  const newInvs = await member.guild.invites.fetch();
  const oldInvs = guildInvites.get(member.guild.id);
  let inviter = 'Desconocido', total = 0;

  for (const inv of newInvs.values()) {
    if (inv.uses > (oldInvs?.get(inv.code) || 0)) {
      inviter = inv.inviter?.tag || 'Desconocido';
      invites[inv.inviter.id] = (invites[inv.inviter.id] || 0) + 1;
      total = invites[inv.inviter.id];
      saveInvites();
      break;
    }
  }
  guildInvites.set(member.guild.id, new Map(newInvs.map(i => [i.code, i.uses])));

  const welcomeEmbed = new EmbedBuilder()
    .setColor('#00E5FF')
    .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
    .setDescription(`💎 Ha llegado a **Power Luki Network**.\n🔗 Invitado por: **${inviter}**\n📊 Total de invitaciones: **${total}**`)
    .setImage('https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg')
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
  ch.send({ embeds: [welcomeEmbed] });
});

/* ───────── INTERACCIONES (TICKETS NAUTIC STYLE) ───────── */
client.on('interactionCreate', async i => {
  if (i.isChatInputCommand()) {
    if (i.commandName === 'panel') {
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🎫 POWER LUKI NETWORK | SOPORTE')
        .setDescription('Pulsa el botón de abajo para abrir un ticket y contactar con el staff.')
        .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png')
        .setFooter({ text: 'Sistema de Soporte de Power Luki' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk_open').setLabel('Abrir Ticket').setStyle(ButtonStyle.Success).setEmoji('🎫')
      );
      await i.channel.send({ embeds: [embed], components: [row] });
      await i.reply({ content: '✅ Panel enviado correctamente.', ephemeral: true });
    }

    if (i.commandName === 'mute') {
      if (!i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return i.reply('Sin permisos.');
      const target = i.options.getMember('usuario');
      const time = i.options.getString('tiempo');
      let ms = parseInt(time) * 60000;
      await target.timeout(ms, i.options.getString('razon'));
      i.reply(`✅ ${target} silenciado.`);
    }
  }

  if (i.isButton()) {
    if (i.customId === 'tk_open') {
      const channel = await i.guild.channels.create({
        name: `🎫-${i.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('===== ATENCIÓN AL CLIENTE =====')
        .setDescription(
          `¡Hola **${i.user.username}**! Bienvenido al soporte de **Power Luki Network**.\n\n` +
          `Nuestro staff le responderá en un plazo de 12 a 24 horas aproximadamente.\n\n` +
          `**¿Cuál es tu nick de usuario?**:\n` +
          `• Nuestro equipo te responderá pronto.\n` +
          `• Por favor, ten paciencia.\n\n` +
          `**Describe tu problema?**:\n` +
          `{TU_NICK_DE_MINECRAFT}\n\n` +
          `*¡Gracias por confiar en nosotros!*`
        )
        .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png')
        .setFooter({ text: 'Power Luki Network • Sistema de Tickets' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
        new ButtonBuilder().setCustomId('tk_claim').setLabel('Reclamar').setStyle(ButtonStyle.Success).setEmoji('✅')
      );

      await channel.send({ content: `${i.user} | @Staff`, embeds: [ticketEmbed], components: [row] });
      await i.reply({ content: `✅ Ticket creado: ${channel}`, ephemeral: true });
    }

    if (i.customId === 'tk_claim') {
      await i.channel.setName(`✅-${i.user.username}`);
      await i.reply({ content: `✅ Ticket reclamado por **${i.user.username}**` });
    }

    if (i.customId === 'tk_close') {
      await i.reply('🔒 Cerrando ticket en 5 segundos...');
      setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
  }
});

/* ───────── WEB SERVER & LOGIN ───────── */
const app = express();
app.get('/', (req, res) => res.send('Power Luki Network Bot Online ✅'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
  console.log('🌐 Servidor Web activo');
});

client.login(process.env.TOKEN).catch(e => console.error('❌ Error de Token:', e.message));
