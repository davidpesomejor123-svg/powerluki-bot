import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes
} from 'discord.js';

// ============================
// Configuración y Niveles
// ============================
let levels = { users: {} };
if (fs.existsSync('./levels.json')) {
  levels = JSON.parse(fs.readFileSync('./levels.json', 'utf8'));
}
function saveLevels() {
  fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
}

// Configuración de XP
const MIN_XP = 15;
const MAX_XP = 30;
const MAX_LEVEL = 999; // Límite de nivel subido a 999

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ============================
// Evento Ready
// ============================
client.once('ready', async () => {
  console.log(`✅ Power Lucky Bot activo como ${client.user.tag}`);
});

// ============================================
// SISTEMA DE NIVELES CON IMAGEN Y NIVEL 999
// ============================================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  if (!levels.users[userId]) levels.users[userId] = { xp: 0, level: 1 };

  // No subir más si ya es nivel 999
  if (levels.users[userId].level >= MAX_LEVEL) return;

  const xpGain = Math.floor(Math.random() * (MAX_XP - MIN_XP + 1)) + MIN_XP;
  levels.users[userId].xp += xpGain;

  // Fórmula de XP: Cada nivel pide más que el anterior
  const xpNeeded = levels.users[userId].level * 150;

  if (levels.users[userId].xp >= xpNeeded) {
    levels.users[userId].level++;
    levels.users[userId].xp = 0; // Reiniciar XP para el siguiente nivel

    const levelChannel = message.guild.channels.cache.find(ch => ch.name === '『🆙』niveles');
    
    if (levelChannel) {
      const levelEmbed = new EmbedBuilder()
        .setColor('#FFD700') // Color Dorado
        .setTitle('🌟 ¡NUEVO NIVEL ALCANZADO! 🌟')
        .setAuthor({ name: `Power Lucky Network`, iconURL: message.guild.iconURL() })
        .setDescription(`🎊 ¡Increíble! ${message.author} ha subido al **Nivel ${levels.users[userId].level}**! 🎊\n\nSigue así para llegar al nivel **999** y dominar el servidor.`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 512 })) // Imagen de perfil del usuario
        .setImage(message.author.displayAvatarURL({ dynamic: true, size: 1024 })) // Imagen grande del usuario
        .setFooter({ text: `Progreso de Usuario • Power Lucky Bot`, iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      levelChannel.send({ content: `🚀 ¡Felicidades ${message.author}!`, embeds: [levelEmbed] });
    }
  }
  saveLevels();
});

// ============================================
// MODERACIÓN AVANZADA (Mute, Unmute, Logs)
// ============================================
client.on('messageCreate', async message => {
  if (!message.guild || !message.member || message.author.bot) return;

  const args = message.content.trim().split(/ +/g);
  const command = args[0].toLowerCase();

  if (command === '!mute' || command === '!silenciar') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ No tienes permisos de Staff.');

    const target = message.mentions.members.first();
    const timeArg = args.find(arg => arg.match(/^\d+[smMa]$/)); 
    const reason = args.slice(1).filter(a => a !== timeArg && !a.includes(target?.id)).join(' ') || 'No especificada';

    if (!target) return message.reply('❌ Debes mencionar a un usuario.');
    if (!timeArg) return message.reply('❌ Tiempo inválido. Ejemplo: `!mute @usuario 10s`');

    const unit = timeArg.slice(-1);
    const value = parseInt(timeArg);
    let timeInMs = 0;

    switch (unit) {
      case 's': timeInMs = value * 1000; break;
      case 'm': timeInMs = value * 60 * 1000; break;
      case 'M': timeInMs = value * 30 * 24 * 60 * 60 * 1000; break;
      case 'a': timeInMs = value * 365 * 24 * 60 * 60 * 1000; break;
    }

    const expirationDate = new Date(Date.now() + timeInMs);
    const discordTimestamp = `<t:${Math.floor(expirationDate.getTime() / 1000)}:f>`;

    let muteRole = message.guild.roles.cache.find(r => r.name === 'Silenciado');
    if (!muteRole) {
      muteRole = await message.guild.roles.create({ name: 'Silenciado', color: '#515864' });
      message.guild.channels.cache.forEach(async (ch) => {
        try { await ch.permissionOverwrites.edit(muteRole, { SendMessages: false }); } catch (e) {}
      });
    }

    try {
      await target.roles.add(muteRole);

      const logMute = message.guild.channels.cache.find(ch => ch.name === '『🔇』silenciados');
      const logEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🚫 Usuario Sancionado - Power Lucky')
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: '👤 Usuario', value: `${target}`, inline: true },
          { name: '⏳ Duración', value: `\`${timeArg}\``, inline: true },
          { name: '📄 Razón', value: `\`${reason}\`` },
          { name: '⏰ Finaliza', value: discordTimestamp }
        )
        .setTimestamp();

      if (logMute) logMute.send({ embeds: [logEmbed] });
      message.reply(`✅ **${target.user.tag}** ha sido silenciado correctamente.`);

      const dmEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('⚠️ Sanción en Power Lucky Network')
        .setDescription(`Has sido sancionado. **Aprende a respetar las normas para evitar futuras sanciones.**`)
        .addFields(
          { name: '⏳ Duración', value: timeArg, inline: true },
          { name: '📄 Razón', value: reason, inline: true },
          { name: '⏰ Tu sanción termina el', value: discordTimestamp }
        )
        .setFooter({ text: 'Power Lucky Bot • Moderación Automática' });

      target.send({ embeds: [dmEmbed] }).catch(() => {});

      setTimeout(async () => {
        const member = await message.guild.members.fetch(target.id).catch(() => null);
        if (member && member.roles.cache.has(muteRole.id)) {
          await member.roles.remove(muteRole);
          const logUnmute = message.guild.channels.cache.find(ch => ch.name === '『🔉』desilenciados');
          if (logUnmute) {
            logUnmute.send(`🔊 El usuario ${target} ha sido **desilenciado** tras cumplir su tiempo de sanción.`);
          }
        }
      }, timeInMs);

    } catch (err) {
      message.reply('❌ Error de permisos.');
    }
  }
});

// Servidor Web y Login
const app = express();
app.get('/', (req, res) => res.send('Power Lucky Bot Online'));
app.listen(process.env.PORT || 10000);
client.login(process.env.TOKEN);
