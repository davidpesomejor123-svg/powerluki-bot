import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import {
  Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, 
  ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, REST, Routes, SlashCommandBuilder
} from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

/* ───────── CONFIGURACIÓN Y URLs ───────── */
const PREFIJO = '!';
const ROLES_TICKETS = ['Owner', 'Co-Owner', 'Admin', 'Mod', 'Staff'];
const TICKET_CHANNEL_NAME = '『📖』tickets';

const PANEL_TICKET_IMAGEN = 'https://i.postimg.cc/cJMbjFxK/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png';
const TICKET_INTERIOR_IMAGEN = 'https://i.postimg.cc/9fS9YhTq/Screenshot-20251230-162814-Whats-App.jpg';
const BIENVENIDA_IMAGEN = 'https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg';
const NUEVO_FINAL_IMAGEN = 'https://i.postimg.cc/fLshS3LC/1766642720441.jpg';
const ANUNCIO_FINAL_IMAGEN = 'https://i.postimg.cc/gJmfkfSq/1766642331426.jpg';

/* ───────── BASE DE DATOS ───────── */
const cargarDB = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
let levels = cargarDB('./levels.json', { users: {} });
let invitesDB = cargarDB('./invites.json', {});
const guildInvites = new Map();

setInterval(() => {
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
  fs.writeFileSync('./invites.json', JSON.stringify(invitesDB, null, 2));
}, 30000);

/* ───────── COMANDOS SLASH ───────── */
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silenciar a un usuario')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
    .addStringOption(opt => opt.setName('tiempo').setDescription('Ej: 10m, 1h').setRequired(true))
    .addStringOption(opt => opt.setName('razon').setDescription('Motivo').setRequired(true)),
].map(cmd => cmd.toJSON());

/* ───────── EVENTO READY ───────── */
client.once('ready', async () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (e) { console.error(e); }

  // Panel Automático
  const canal = client.channels.cache.find(c => c.name === TICKET_CHANNEL_NAME);
  if (canal) {
    const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    if (msgs && !msgs.some(m => m.author.id === client.user.id)) {
      const embed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('🎫 SISTEMA DE TICKETS')
        .setDescription('Haz clic en un botón para abrir un ticket.')
        .setImage(PANEL_TICKET_IMAGEN);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_tk_general').setLabel('Soporte').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
        new ButtonBuilder().setCustomId('btn_tk_tienda').setLabel('Tienda').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('btn_tk_reporte').setLabel('Reporte').setStyle(ButtonStyle.Danger).setEmoji('🚫')
      );
      canal.send({ embeds: [embed], components: [row] });
    }
  }

  client.guilds.cache.forEach(async g => {
    const invs = await g.invites.fetch().catch(() => null);
    if (invs) guildInvites.set(g.id, new Map(invs.map(i => [i.code, i.uses])));
  });
});

/* ───────── INTERACCIONES (MODALS Y BOTONES) ───────── */
client.on('interactionCreate', async i => {
  // 1. Mostrar Modal al presionar botón
  if (i.isButton() && i.customId.startsWith('btn_tk_')) {
    const tipo = i.customId.split('_')[2];
    const modal = new ModalBuilder().setCustomId(`modal_tk_${tipo}`).setTitle('DATOS DEL TICKET');
    
    const nickInput = new TextInputBuilder().setCustomId('nick').setLabel('Tu Nick en el juego').setStyle(TextInputStyle.Short).setRequired(true);
    const descInput = new TextInputBuilder().setCustomId('desc').setLabel('Cuéntanos tu problema').setStyle(TextInputStyle.Paragraph).setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(nickInput), new ActionRowBuilder().addComponents(descInput));
    return await i.showModal(modal);
  }

  // 2. Procesar el Modal enviado
  if (i.type === InteractionType.ModalSubmit) {
    const tipo = i.customId.split('_')[2];
    const nick = i.fields.getTextInputValue('nick');
    const desc = i.fields.getTextInputValue('desc');

    const canal = await i.guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    const embed = new EmbedBuilder()
      .setColor('#2F3136')
      .setTitle(`SOPORTE | ${tipo.toUpperCase()}`)
      .setDescription(`👋 Hola **${i.user.username}**! El staff responderá pronto\n────────────────────\n**Nick:** ${nick}\n**Problema:** ${desc}\n────────────────────`)
      .setImage(TICKET_INTERIOR_IMAGEN);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reclamar').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('👋'),
      new ButtonBuilder().setCustomId('cerrar').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await canal.send({ content: `${i.user} | @Power Luki Staff`, embeds: [embed], components: [row] });
    return i.reply({ content: `✅ Ticket creado: ${canal}`, ephemeral: true });
  }

  // 3. Reclamar / Cerrar
  if (i.isButton()) {
    const esStaff = ROLES_TICKETS.some(r => i.member.roles.cache.some(role => role.name === r));
    if (i.customId === 'reclamar') {
      if (!esStaff) return i.reply({ content: '❌ Solo staff.', ephemeral: true });
      await i.channel.setName(`✅-${i.user.username}`);
      i.reply(`👋 Atendido por **${i.user.username}**`);
    }
    if (i.customId === 'cerrar') {
      if (!esStaff) return i.reply({ content: '❌ Solo staff.', ephemeral: true });
      await i.reply('🔒 Cerrando...');
      setTimeout(() => i.channel.delete().catch(() => {}), 4000);
    }
  }
});

/* ───────── MENSAJES (!ANUNCIO, !NUEVO, NIVELES) ───────── */
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild) return;

  // Sistema Nivel
  const id = msg.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };
  levels.users[id].xp += 15;
  if (levels.users[id].xp >= levels.users[id].level * 150) {
    levels.users[id].level++; levels.users[id].xp = 0;
    const ch = msg.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (ch) ch.send(`🎉 **${msg.author.username}** alcanzó el Nivel **${levels.users[id].level}**`);
  }

  if (!msg.content.startsWith(PREFIJO)) return;
  const args = msg.content.slice(PREFIJO.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (['anuncio', 'nuevo'].includes(command)) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const isAnuncio = command === 'anuncio';
    const canal = msg.guild.channels.cache.find(c => c.name === (isAnuncio ? '『📣』anuncios' : '『🎊』nuevo'));
    const imgFinal = isAnuncio ? ANUNCIO_FINAL_IMAGEN : NUEVO_FINAL_IMAGEN;

    const texto = args.filter(a => !a.startsWith('http')).join(' ');
    const imgs = args.filter(a => a.startsWith('http'));

    const embed = new EmbedBuilder()
      .setColor(isAnuncio ? '#FFCC00' : '#00FF00')
      .setTitle(isAnuncio ? '📢 ANUNCIO OFICIAL' : '✨ NUEVA NOVEDAD')
      .setDescription(texto || '...')
      .setImage(imgs[0] || imgFinal);

    await canal.send({ content: isAnuncio ? '@everyone' : '', embeds: [embed] });
    
    // Mandar el resto de imágenes y la final
    for (let j = 1; j < imgs.length; j++) await canal.send({ embeds: [new EmbedBuilder().setImage(imgs[j]).setColor(embed.data.color)] });
    if (imgs.length > 0) await canal.send({ embeds: [new EmbedBuilder().setImage(imgFinal).setColor(embed.data.color)] });

    msg.delete().catch(() => {});
  }
});

/* ───────── BIENVENIDAS ───────── */
client.on('guildMemberAdd', async m => {
  const ch = m.guild.channels.cache.find(c => c.name.includes('bienvenidos'));
  if (!ch) return;
  const invs = await m.guild.invites.fetch().catch(() => null);
  const old = guildInvites.get(m.guild.id);
  let inviter = 'Desconocido', count = 0;
  if (invs && old) {
    const invite = invs.find(i => i.uses > (old.get(i.code) || 0));
    if (invite) { inviter = invite.inviter.username; invitesDB[invite.inviter.id] = (invitesDB[invite.inviter.id] || 0) + 1; count = invitesDB[invite.inviter.id]; }
    guildInvites.set(m.guild.id, new Map(invs.map(i => [i.code, i.uses])));
  }
  const embed = new EmbedBuilder().setColor('#00E5FF').setTitle('✨ BIENVENIDO').setDescription(`👤 **${m.user.username}**\n🔗 Invitado por: **${inviter}** (${count} invs)`).setImage(BIENVENIDA_IMAGEN);
  ch.send({ embeds: [embed] });
});

const app = express();
app.get('/', (r, s) => s.send('Power Luki ✅'));
app.listen(process.env.PORT || 10000, () => client.login(process.env.TOKEN));
