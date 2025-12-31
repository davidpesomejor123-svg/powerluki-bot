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

// --- BASE DE DATOS ---
const cargarDB = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
let niveles = cargarDB('./levels.json', { usuarios: {} });

setInterval(() => {
  fs.writeFileSync('./levels.json', JSON.stringify(niveles, null, 2));
}, 30000);

// --- EVENTO READY (CONSOLA) ---
client.once('ready', () => {
  console.log('//////////////////////////////////////////');
  console.log(`✅ BOT CONECTADO: ${client.user.tag}`);
  console.log('🤖 Power Luki Network está listo.');
  console.log('//////////////////////////////////////////');
});

// --- SISTEMA DE TICKETS AUTOMÁTICO ---
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

    let config = {
      titulo: "SOPORTE",
      preguntas: "**• Describe tu duda:**"
    };

    if (seleccion === 'tk_tienda') {
      config = {
        titulo: "🛒 SOPORTE DE TIENDA",
        preguntas: "**• ¿Qué compraste?**\n**• ¿ID de transacción?**\n**• ¿Qué fallo ocurrió exactamente?**"
      };
    } else if (seleccion === 'tk_reporte') {
      config = {
        titulo: "🚫 REPORTE DE USUARIO",
        preguntas: "**• Nick del usuario:**\n**• ¿Qué regla rompió?**\n**• Pruebas (Foto/Link):**"
      };
    }

    const embed = new EmbedBuilder()
      .setColor('#2F3136')
      .setTitle(config.titulo)
      .setDescription(`¡Hola ${i.user}! Bienvenido al soporte.\n\n${config.preguntas}\n\n──────────────────────────`)
      .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png');

    const botones = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tk_cerrar').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
      new ButtonBuilder().setCustomId('tk_reclamar').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('👋')
    );

    await canal.send({ content: `${i.user} | @Staff`, embeds: [embed], components: [botones] });
    await i.reply({ content: `✅ Ticket creado: ${canal}`, ephemeral: true });
  }

  // BOTONES INTERNOS
  if (i.isButton()) {
    if (i.customId === 'tk_reclamar') {
      await i.channel.setName(`✅-${i.user.username}`);
      i.reply(`👋 El staff **${i.user.username}** ha tomado el ticket.`);
    }
    if (i.customId === 'tk_cerrar') {
      await i.reply('Cerrando...');
      setTimeout(() => i.channel.delete().catch(() => {}), 3000);
    }
  }
});

// --- COMANDOS Y NIVELES ---
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild) return;

  // Niveles
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

  // !setup - CREA EL PANEL PERMANENTE
  if (command === 'setup' && msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🎫 CENTRAL DE SOPORTE')
      .setDescription('Selecciona una categoría para recibir ayuda.')
      .setImage('https://i.postimg.cc/k5vR9HPj/Gemini-Generated-Image-eg3cc2eg3cc2eg3c.png');

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('menu_tickets')
        .setPlaceholder('¿En qué podemos ayudarte?')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('🛒 Tienda').setValue('tk_tienda').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('🚫 Reportes').setValue('tk_reporte').setEmoji('🚩'),
          new StringSelectMenuOptionBuilder().setLabel('❓ Dudas').setValue('tk_dudas').setEmoji('💬')
        )
    );
    await msg.channel.send({ embeds: [embed], components: [menu] });
    msg.delete();
  }

  // MODERACIÓN
  if (command === 'ban' && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) { await user.ban(); msg.reply('✅ Usuario baneado.'); }
  }
});

// --- SERVIDOR WEB Y LOGIN ---
const app = express();
app.get('/', (req, res) => res.send('Power Luki bot is LIVE ✅'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor Web en puerto ${PORT}`);
  // LOGIN DENTRO DEL SERVER WEB PARA ASEGURAR CONEXIÓN
  client.login(process.env.TOKEN).catch(err => {
    console.error('❌ ERROR DE LOGIN:', err.message);
  });
});
