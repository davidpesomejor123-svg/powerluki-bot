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

/* ───────── CLIENT ───────── */
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

/* ───────── DB NIVELES ───────── */
const cargarDB = (f, d) => {
  try {
    return fs.existsSync(f)
      ? JSON.parse(fs.readFileSync(f, 'utf8'))
      : d;
  } catch {
    return d;
  }
};

let niveles = cargarDB('./levels.json', { usuarios: {} });

setInterval(() => {
  fs.writeFileSync('./levels.json', JSON.stringify(niveles, null, 2));
}, 30000);

/* ───────── READY ───────── */
client.once('ready', () => {
  console.log('//////////////////////////////////////////');
  console.log(`✅ BOT CONECTADO: ${client.user.tag}`);
  console.log('🤖 Power Luki Network listo.');
  console.log('//////////////////////////////////////////');
});

/* ───────── TICKETS ───────── */
client.on('interactionCreate', async i => {
  try {
    if (i.isStringSelectMenu() && i.customId === 'menu_tickets') {
      await i.deferReply({ ephemeral: true });

      const seleccion = i.values[0];

      const canal = await i.guild.channels.create({
        name: `ticket-${i.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      let config = {
        titulo: 'SOPORTE',
        preguntas: '**• Describe tu duda:**'
      };

      if (seleccion === 'tk_tienda') {
        config = {
          titulo: '🛒 SOPORTE DE TIENDA',
          preguntas: '**• ¿Qué compraste?**\n**• ID de transacción:**\n**• ¿Qué falló?**'
        };
      } else if (seleccion === 'tk_reporte') {
        config = {
          titulo: '🚫 REPORTE DE USUARIO',
          preguntas: '**• Usuario:**\n**• Regla rota:**\n**• Pruebas:**'
        };
      }

      const embed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle(config.titulo)
        .setDescription(`¡Hola ${i.user}!\n\n${config.preguntas}`)
        .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png');

      const botones = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('tk_cerrar')
          .setLabel('Cerrar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('tk_reclamar')
          .setLabel('Reclamar')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('👋')
      );

      await canal.send({ embeds: [embed], components: [botones] });
      await i.editReply(`✅ Ticket creado: ${canal}`);
    }

    if (i.isButton()) {
      if (i.customId === 'tk_reclamar') {
        await i.channel.setName(`✅-${i.user.username}`);
        await i.reply(`👋 **${i.user.username}** tomó el ticket.`);
      }

      if (i.customId === 'tk_cerrar') {
        await i.reply('🔒 Cerrando ticket...');
        setTimeout(() => i.channel.delete().catch(() => {}), 3000);
      }
    }
  } catch (err) {
    console.error('❌ ERROR INTERACTION:', err);
  }
});

/* ───────── MENSAJES + NIVELES ───────── */
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild) return;

  const id = msg.author.id;
  if (!niveles.usuarios[id]) niveles.usuarios[id] = { xp: 0, nivel: 1 };

  niveles.usuarios[id].xp += 15;
  if (niveles.usuarios[id].xp >= niveles.usuarios[id].nivel * 150) {
    niveles.usuarios[id].nivel++;
    niveles.usuarios[id].xp = 0;
    const ch = msg.guild.channels.cache.find(c => c.name.includes('niveles'));
    if (ch) ch.send(`🎉 ${msg.author} subió a **Nivel ${niveles.usuarios[id].nivel}**`);
  }

  if (!msg.content.startsWith(PREFIJO)) return;

  const args = msg.content.slice(PREFIJO.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (
    command === 'setup' &&
    msg.member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🎫 CENTRAL DE SOPORTE')
      .setDescription('Selecciona una categoría')
      .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png');

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('menu_tickets')
        .setPlaceholder('¿En qué podemos ayudarte?')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('🛒 Tienda')
            .setValue('tk_tienda'),
          new StringSelectMenuOptionBuilder()
            .setLabel('🚫 Reportes')
            .setValue('tk_reporte'),
          new StringSelectMenuOptionBuilder()
            .setLabel('❓ Dudas')
            .setValue('tk_dudas')
        )
    );

    await msg.channel.send({ embeds: [embed], components: [menu] });
    msg.delete();
  }
});

/* ───────── WEB SERVER ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Luki bot ONLINE ✅'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web activo en puerto ${PORT}`);
});

/* ───────── LOGIN ───────── */
console.log('TOKEN CARGADO:', process.env.TOKEN ? 'SI ✅' : 'NO ❌');

client.login(process.env.TOKEN)
  .then(() => console.log('🔑 Login enviado a Discord'))
  .catch(err => console.error('❌ ERROR LOGIN:', err));
