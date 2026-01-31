// index.js
// Discord.js v14
// npm i discord.js express dotenv

import 'dotenv/config';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder
} from 'discord.js';

/* ───────── CONFIG ───────── */
const CONFIG = {
  PREFIJO: '!',
  SERVER_IP: 'powermax.hidenmc.com',
  SERVER_PORT: '24818',
  VERSIONS: '1.13 a 1.21.11',
  CANALES: {
    NIVELES: '『🆙』niveles'
  }
};

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

/* ───────── SISTEMA DE NIVELES (EL TUYO) ───────── */
const nivelesDB = new Map();

/* ───────── READY ───────── */
client.once('ready', () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
});

/* ───────── MESSAGE CREATE ───────── */
client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const content = message.content.toLowerCase();

    /* ───── IP ───── */
    if (
      content === '!ip' ||
      content === 'ip'
    ) {
      const ipEmbed = new EmbedBuilder()
        .setTitle('<:ip:ID> IP DEL SERVIDOR')
        .setColor('#00FFFF')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `<:java:ID> **Java:** \`${CONFIG.SERVER_IP}\`\n` +
          `<:bedrock:ID> **Bedrock:** \`${CONFIG.SERVER_IP}\`\n` +
          `<:minecraft_gold_cash:ID> **Puerto:** \`${CONFIG.SERVER_PORT}\`\n` +
          `<:minecraft_gold_one:ID> **Versiones:** ${CONFIG.VERSIONS}\n\n` +
          `<:TwoToneShield_IDS:ID> Servidor seguro y estable\n\n` +
          `━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: 'PowerMax Network • Conéctate ya <:MinecraftHeart:ID>' })
        .setTimestamp();

      message.channel.send({ embeds: [ipEmbed] }).catch(() => {});
      return;
    }

    /* ───── TIENDA ───── */
    if (
      content === `${CONFIG.PREFIJO}tienda` ||
      content === '.tienda' ||
      content.includes('donar') ||
      content.includes('comprar') ||
      content.includes('shop') ||
      content.includes('store')
    ) {
      const shopEmbed = new EmbedBuilder()
        .setTitle('<:Tienda:ID> TIENDA OFICIAL')
        .setColor('#FFCC00')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `<:Minecoins:ID> **¡Apoya al servidor comprando rangos y mejoras!**\n\n` +
          `<:emoji_49:ID> Compra segura y verificada\n` +
          `<:minecraft_gold_cash:ID> Pagos rápidos\n\n` +
          `🔗 **https://tienda.powermax.com**\n\n` +
          `━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: 'PowerMax Shop • Gracias por apoyar <:fatchicken:ID>' })
        .setTimestamp();

      message.channel.send({ embeds: [shopEmbed] }).catch(() => {});
      return;
    }

    /* ───── SISTEMA DE NIVELES ───── */
    const userId = message.author.id;
    let data = nivelesDB.get(userId) || { xp: 0, nivel: 1, lastXP: 0 };

    if (Date.now() - data.lastXP > 60000) {
      data.xp += Math.floor(Math.random() * 15) + 10;
      data.lastXP = Date.now();

      const xpNecesaria = data.nivel * 250;

      if (data.xp >= xpNecesaria) {
        data.nivel++;
        data.xp = 0;

        const canalNiveles = message.guild.channels.cache.find(
          c => c.name === CONFIG.CANALES.NIVELES
        );

        if (canalNiveles) {
          const lvEmbed = new EmbedBuilder()
            .setTitle('<:minecraft_gold_one:ID> ¡NUEVO NIVEL!')
            .setColor('#FFD700')
            .setThumbnail(message.author.displayAvatarURL())
            .setDescription(
              `<:gigachad:ID> **${message.author.username}** ha subido al **Nivel ${data.nivel}**\n\n` +
              `<:MinecraftHeart:ID> Sigue participando para ganar más recompensas`
            )
            .setFooter({ text: 'PowerMax Leveling System' });

          canalNiveles.send({
            content: `<:sigma:ID> ¡Felicidades ${message.author}!`,
            embeds: [lvEmbed]
          }).catch(() => {});
        }
      }

      nivelesDB.set(userId, data);
    }

  } catch (err) {
    console.error('Error en messageCreate:', err);
  }
});

/* ───────── SERVIDOR WEB ───────── */
const app = express();
app.get('/', (_, res) => res.send('Power Max Bot Online ✅'));

/* ───────── INICIAR ───────── */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escuchando en puerto ${PORT}`);
  client.login(process.env.TOKEN)
    .catch(err => console.error('Error iniciando sesión en Discord:', err));
});
