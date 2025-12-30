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
  partials: [Partials.Channel]
});

/* ───────── LEVELS ───────── */
let levels = { users: {} };
if (fs.existsSync('./levels.json')) {
  levels = JSON.parse(fs.readFileSync('./levels.json', 'utf8'));
}
const saveLevels = () =>
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
setInterval(saveLevels, 30000);

/* ───────── ANTI SPAM + XP ───────── */
const cooldown = new Map();

client.on('messageCreate', async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (msg.member.communicationDisabledUntilTimestamp) return;

  const now = Date.now();
  const data = cooldown.get(msg.author.id) || { count: 0, last: now };

  if (now - data.last < 5000) data.count++;
  else data.count = 1;

  data.last = now;
  cooldown.set(msg.author.id, data);

  if (
    data.count > 5 &&
    !msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
  ) {
    await msg.member.timeout(5 * 60 * 1000, 'Spam detectado');
    return;
  }

  const id = msg.author.id;
  if (!levels.users[id]) levels.users[id] = { xp: 0, level: 1 };

  const user = levels.users[id];
  user.xp += Math.floor(Math.random() * 10) + 15;

  const need = user.level * 150;
  if (user.xp >= need) {
    user.level++;
    user.xp -= need;

    const ch = msg.guild.channels.cache.find(c =>
      c.name.includes('niveles')
    );
    if (ch) {
      ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🌟 NUEVO NIVEL')
            .setDescription(
              `${msg.author} alcanzó **Nivel ${user.level}**`
            )
            .setThumbnail(msg.author.displayAvatarURL())
        ]
      });
    }
  }
});

/* ───────── SLASH COMMANDS ───────── */
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silenciar usuario')
    .addUserOption(o =>
      o.setName('usuario').setDescription('Usuario').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('tiempo').setDescription('Ej: 5m / 10s').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('razon').setDescription('Razón')
    ),

  new SlashCommandBuilder()
    .setName('anuncio')
    .setDescription('Enviar anuncio oficial')
    .addStringOption(o =>
      o.setName('mensaje').setDescription('Mensaje').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Enviar panel de tickets')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
await rest.put(
  Routes.applicationGuildCommands(
    process.env.CLIENT_ID,
    process.env.GUILD_ID
  ),
  { body: commands }
);

/* ───────── INTERACTIONS ───────── */
client.on('interactionCreate', async i => {
  /* ─── SLASH ─── */
  if (i.isChatInputCommand()) {
    if (i.commandName === 'mute') {
      if (
        !i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
      )
        return i.reply({ content: '❌ Sin permiso', ephemeral: true });

      const user = i.options.getMember('usuario');
      const t = i.options.getString('tiempo');
      const r = i.options.getString('razon') || 'No especificada';

      const n = parseInt(t);
      const u = t.slice(-1);
      const ms = u === 'm' ? n * 60000 : u === 's' ? n * 1000 : null;
      if (!ms) return i.reply('Formato inválido');

      await user.timeout(ms, r);
      i.reply(`✅ ${user} silenciado (${t})`);
    }

    if (i.commandName === 'anuncio') {
      if (
        !i.member.permissions.has(PermissionsBitField.Flags.Administrator)
      )
        return i.reply({ content: '❌ Sin permiso', ephemeral: true });

      const ch = i.guild.channels.cache.find(c =>
        c.name.includes('anuncios')
      );
      if (!ch) return i.reply('No existe canal anuncios');

      await ch.send({
        content: '@everyone',
        embeds: [
          new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📢 ANUNCIO OFICIAL')
            .setDescription(i.options.getString('mensaje'))
            .setFooter({ text: 'Power Luki Network Bot' })
            .setTimestamp()
        ]
      });

      i.reply({ content: '✅ Anuncio enviado', ephemeral: true });
    }

    if (i.commandName === 'panel') {
      i.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🎫 POWER LUKI NETWORK | SOPORTE')
            .setDescription(
              'Sistema oficial de tickets de **Power Luki Network**.\n\n' +
              'Pulsa el botón para abrir un ticket.\n\n' +
              '⏳ El Staff te atenderá lo antes posible.'
            )
            .setFooter({ text: 'Power Luki Network Bot' })
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ticket_open')
              .setLabel('Abrir Ticket')
              .setStyle(ButtonStyle.Success)
              .setEmoji('🎫')
          )
        ]
      });
      i.reply({ content: 'Panel enviado', ephemeral: true });
    }
  }

  /* ─── TICKETS ─── */
  if (i.isButton() && i.customId === 'ticket_open') {
    if (
      i.guild.channels.cache.some(c => c.name === `🎫-${i.user.id}`)
    ) {
      return i.reply({
        content: '❌ Ya tienes un ticket abierto',
        ephemeral: true
      });
    }

    const ch = await i.guild.channels.create({
      name: `🎫-${i.user.id}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
          id: i.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        }
      ]
    });

    await ch.send({
      content: `${i.user}`,
      embeds: [
        new EmbedBuilder()
          .setColor('#3498DB')
          .setTitle('🎫 TICKET | POWER LUKI NETWORK')
          .setDescription(
            '📝 **Indica la siguiente información:**\n\n' +
              '• Usuario / Nick\n' +
              '• Motivo del ticket\n' +
              '• Detalles adicionales\n\n' +
              '⏳ El Staff responderá pronto.'
          )
          .setFooter({ text: 'Power Luki Network Bot' })
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('claim')
            .setLabel('Reclamar')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('close')
            .setLabel('Cerrar')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

    i.reply({ content: `Ticket creado: ${ch}`, ephemeral: true });
  }

  if (i.isButton() && i.customId === 'claim') {
    if (
      !i.member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    )
      return i.reply({ content: '❌ Solo Staff', ephemeral: true });

    await i.channel.setName(`🎫-claim-${i.user.username}`);
    i.reply(`👋 Ticket reclamado por **${i.user.username}**`);
  }

  if (i.isButton() && i.customId === 'close') {
    if (
      !i.member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    )
      return i.reply({ content: '❌ Solo Staff', ephemeral: true });

    await i.reply('🔒 Cerrando ticket...');
    setTimeout(() => i.channel.delete(), 5000);
  }
});

/* ───────── READY ───────── */
client.once('ready', () => {
  console.log(`✅ Power Luki Network Bot online`);
});

/* ───────── WEB ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Luki Network Bot Online'));
app.listen(process.env.PORT || 10000);

/* ───────── LOGIN ───────── */
client.login(process.env.TOKEN);
