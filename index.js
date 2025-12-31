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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

/* ───────── BASES DE DATOS LOCALES ───────── */
const loadDB = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
let levels = loadDB('./levels.json', { users: {} });
let invitesDB = loadDB('./invites.json', {});
const guildInvites = new Map();

setInterval(() => {
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
  fs.writeFileSync('./invites.json', JSON.stringify(invitesDB, null, 2));
}, 30000);

/* ───────── REGISTRO DE COMANDOS (REVISADO PARA EVITAR EL ERROR DE RENDER) ───────── */
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silenciar a un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
    .addStringOption(o => o.setName('tiempo').setDescription('Tiempo (ej: 10m, 1h)').setRequired(true))
    .addStringOption(o => o.setName('razon').setDescription('Motivo').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banear a un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
    .addStringOption(o => o.setName('razon').setDescription('Motivo').setRequired(true)),

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Enviar el panel de soporte técnico'),

  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Enviar un anuncio oficial')
    .addStringOption(o => o.setName('mensaje').setDescription('Contenido del anuncio').setRequired(true))
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Comandos Slash sincronizados');
  } catch (e) { console.error('❌ Error en Comandos:', e); }

  client.guilds.cache.forEach(async g => {
    try { const invs = await g.invites.fetch(); guildInvites.set(g.id, new Map(invs.map(i => [i.code, i.uses]))); } catch {}
  });
});

/* ───────── BIENVENIDA, DESPEDIDA Y NIVELES ───────── */
client.on('guildMemberAdd', async member => {
  const ch = member.guild.channels.cache.find(c => c.name.includes('bienvenidos'));
  if (!ch) return;
  const newInvs = await member.guild.invites.fetch();
  const oldInvs = guildInvites.get(member.guild.id);
  let inviter = 'Desconocido';
  if (oldInvs) {
    const invite = newInvs.find(i => i.uses > (oldInvs.get(i.code) || 0));
    if (invite) inviter = invite.inviter?.username || 'Desconocido';
  }
  guildInvites.set(member.guild.id, new Map(newInvs.map(i => [i.code, i.uses])));

  const embed = new EmbedBuilder()
    .setColor('#00E5FF')
    .setTitle('✨ ¡BIENVENIDO!')
    .setDescription(`👤 **${member.user.username}** se unió.\n🔗 Invitado por: **${inviter}**`)
    .setImage('https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg')
    .setThumbnail(member.user.displayAvatarURL());
  ch.send({ embeds: [embed] });
});

client.on('guildMemberRemove', member => {
  const ch = member.guild.channels.cache.find(c => c.name.includes('despedidas'));
  if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#FF4D4D').setDescription(`😔 **${member.user.username}** salió del servidor.`)] });
});

client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;
  const id = msg.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };
  levels.users[id].xp += 15;
  if (levels.users[id].xp >= levels.users[id].level * 150) {
    levels.users[id].level++;
    levels.users[id].xp = 0;
    const ch = msg.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (ch) ch.send(`🎉 **${msg.author}** subió al **Nivel ${levels.users[id].level}**!`);
  }
});

/* ───────── TICKETS (ESTILO FOTO NAUTICMC) Y MODERACIÓN ───────── */
client.on('interactionCreate', async i => {
  if (i.isChatInputCommand()) {
    if (i.commandName === 'panel') {
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🎫 POWER LUKI NETWORK | SOPORTE')
        .setDescription('Haz clic abajo para contactar con el Staff.')
        .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png');
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk_open').setLabel('Abrir Ticket').setStyle(ButtonStyle.Success).setEmoji('🎫'));
      await i.channel.send({ embeds: [embed], components: [row] });
      return i.reply({ content: 'Panel enviado', ephemeral: true });
    }

    if (i.commandName === 'mute') {
      const user = i.options.getMember('usuario');
      const time = i.options.getString('tiempo');
      let ms = parseInt(time) * 60000;
      await user.timeout(ms, i.options.getString('razon'));
      i.reply(`✅ ${user} silenciado.`);
    }

    if (i.commandName === 'ban') {
      const user = i.options.getMember('usuario');
      await user.ban({ reason: i.options.getString('razon') });
      i.reply(`✅ ${user} baneado.`);
    }
  }

  if (i.isButton()) {
    if (i.customId === 'tk_open') {
      const channel = await i.guild.channels.create({
        name: `ticket-${i.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('SOPORTE DISCORD')
        .setDescription(`¡Hola ${i.user}! Bienvenido al soporte de **Power Luki Network**\n\nNuestro staff le responderá pronto. **Sea paciente.**\n\n──────────────────────────\n**¿Cuál es tu nick?:**\n(Escríbelo abajo)\n\n**Describe tu problema:**\n(Danos detalles)\n──────────────────────────`)
        .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('tk_claim').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('👋')
      );

      await channel.send({ content: `${i.user} | @Staff`, embeds: [ticketEmbed], components: [row] });
      i.reply({ content: `✅ Ticket creado: ${channel}`, ephemeral: true });
    }
    if (i.customId === 'tk_claim') {
      await i.channel.setName(`✅-${i.user.username}`);
      i.reply(`👋 Atendido por **${i.user.username}**`);
    }
    if (i.customId === 'tk_close') {
      await i.reply('Cerrando...');
      setTimeout(() => i.channel.delete().catch(() => {}), 3000);
    }
  }
});

/* ───────── SERVIDOR WEB PARA RENDER ───────── */
const app = express();
app.get('/', (req, res) => res.send('Power Luki Online ✅'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
  console.log('🌐 Servidor Web activo en puerto 10000');
  client.login(process.env.TOKEN);
});
