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
  StringSelectMenuOptionBuilder
} from 'discord.js';

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

const PREFIJO = '!';

/* ───────── BASE DE DATOS LOCAL ───────── */
const cargarDB = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
let niveles = cargarDB('./levels.json', { usuarios: {} });
let invitesDB = cargarDB('./invites.json', {});
const cacheInvs = new Map();

setInterval(() => {
  fs.writeFileSync('./levels.json', JSON.stringify(niveles, null, 2));
  fs.writeFileSync('./invites.json', JSON.stringify(invitesDB, null, 2));
}, 30000);

/* ───────── EVENTOS DE INICIO ───────── */
client.once('ready', () => {
  console.log(`✅ Power Luki Network ONLINE: ${client.user.tag}`);
  client.guilds.cache.forEach(async g => {
    try { const invs = await g.invites.fetch(); cacheInvs.set(g.id, new Map(invs.map(i => [i.code, i.uses]))); } catch {}
  });
});

/* ───────── BIENVENIDA Y DESPEDIDA ───────── */
client.on('guildMemberAdd', async m => {
  const ch = m.guild.channels.cache.find(c => c.name.includes('bienvenida'));
  if (!ch) return;
  const nuevas = await m.guild.invites.fetch();
  const viejas = cacheInvs.get(m.guild.id);
  let inviter = 'Desconocido';
  if (viejas) {
    const inv = nuevas.find(i => i.uses > (viejas.get(i.code) || 0));
    if (inv) inviter = inv.inviter?.username || 'Sistema';
  }
  cacheInvs.set(m.guild.id, new Map(nuevas.map(i => [i.code, i.uses])));

  const embed = new EmbedBuilder()
    .setColor('#00E5FF')
    .setTitle('✨ ¡BIENVENIDO!')
    .setDescription(`👤 **${m.user.username}** se unió.\n🔗 Invitado por: **${inviter}**`)
    .setImage('https://i.postimg.cc/Pf0DW9hM/1766642720441.jpg')
    .setThumbnail(m.user.displayAvatarURL());
  ch.send({ embeds: [embed] });
});

client.on('guildMemberRemove', m => {
  const ch = m.guild.channels.cache.find(c => c.name.includes('despedida'));
  if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#FF4D4D').setDescription(`😔 **${m.user.username}** salió del servidor.`)] });
});

/* ───────── COMANDOS Y NIVELES ───────── */
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild) return;

  // Sistema de Niveles
  const id = msg.author.id;
  if (!niveles.usuarios[id]) niveles.usuarios[id] = { xp: 0, nivel: 1 };
  niveles.usuarios[id].xp += 15;
  if (niveles.usuarios[id].xp >= niveles.usuarios[id].nivel * 150) {
    niveles.usuarios[id].nivel++;
    niveles.usuarios[id].xp = 0;
    const ch = msg.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (ch) ch.send(`🎉 **${msg.author}** subió al **Nivel ${niveles.usuarios[id].nivel}**!`);
  }

  if (!msg.content.startsWith(PREFIJO)) return;
  const args = msg.content.slice(PREFIJO.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // COMANDO !SETUP PARA EL PANEL
  if (command === 'setup' && msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🎫 CENTRAL DE SOPORTE | POWER LUKI')
      .setDescription('Selecciona una categoría para abrir un ticket.')
      .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png');

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('menu_tickets')
        .setPlaceholder('¿En qué podemos ayudarte?')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('🛒 Tienda / Compras').setValue('tk_tienda').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('🚫 Reportar Jugador').setValue('tk_reporte').setEmoji('🚩'),
          new StringSelectMenuOptionBuilder().setLabel('⚖️ Apelaciones').setValue('tk_apelacion').setEmoji('🛡️'),
          new StringSelectMenuOptionBuilder().setLabel('❓ Dudas Generales').setValue('tk_dudas').setEmoji('💬')
        )
    );
    await msg.channel.send({ embeds: [embed], components: [menu] });
    msg.delete();
  }

  // COMANDOS DE MODERACIÓN
  if (command === 'ban' && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) { await user.ban(); msg.reply(`✅ Baneado.`); }
  }

  if (command === 'mute' && msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    const user = msg.mentions.members.first();
    const tiempo = parseInt(args[1]) * 60000;
    if (user && !isNaN(tiempo)) { await user.timeout(tiempo); msg.reply(`🔇 Silenciado.`); }
  }
});

/* ───────── LÓGICA DE TICKETS ───────── */
client.on('interactionCreate', async i => {
  if (i.isStringSelectMenu() && i.customId === 'menu_tickets') {
    const seleccion = i.values[0];
    const canal = await i.guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    let titulo = "SOPORTE";
    let preguntas = "";

    if (seleccion === 'tk_tienda') {
      titulo = "🛒 TIENDA";
      preguntas = "**• ¿Qué compraste?**\n**• ID de transacción:**\n**• ¿Qué fallo ocurrió?**";
    } else if (seleccion === 'tk_reporte') {
      titulo = "🚫 REPORTE";
      preguntas = "**• Nick del reportado:**\n**• Motivo:**\n**• Pruebas:**";
    } else if (seleccion === 'tk_apelacion') {
      titulo = "⚖️ APELACIÓN";
      preguntas = "**• ¿Por qué te banearon?**\n**• ¿Quién te baneo?**";
    } else {
      titulo = "❓ DUDAS";
      preguntas = "**• Escribe tu duda aquí:**";
    }

    const embedTicket = new EmbedBuilder()
      .setColor('#2F3136')
      .setTitle(titulo)
      .setDescription(`¡Hola ${i.user}! Rellena estos datos:\n──────────────────────────\n${preguntas}\n──────────────────────────`)
      .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png');

    const botones = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tk_cerrar').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
      new ButtonBuilder().setCustomId('tk_reclamar').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('👋')
    );

    await canal.send({ content: `${i.user} | @Staff`, embeds: [embedTicket], components: [botones] });
    i.reply({ content: `✅ Ticket creado: ${canal}`, ephemeral: true });
  }

  if (i.isButton()) {
    if (i.customId === 'tk_reclamar') {
      await i.channel.setName(`✅-${i.user.username}`);
      i.reply(`👋 Staff **${i.user.username}** al mando.`);
    }
    if (i.customId === 'tk_cerrar') {
      await i.reply('Cerrando...');
      setTimeout(() => i.channel.delete().catch(() => {}), 3000);
    }
  }
});

/* ───────── SERVIDOR WEB ───────── */
const app = express();
app.get('/', (req, res) => res.send('Power Luki Network ✅'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => client.login(process.env.TOKEN));
