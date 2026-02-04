// index.js — Power Luki Network Bot COMPLETO
import 'dotenv/config';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
  ActivityType,
  PermissionsBitField
} from 'discord.js';

/* ───────── CONFIG ───────── */
const CONFIG = {
  TOKEN: process.env.TOKEN,
  MAIN_GUILD_ID: '1458243569075884219', // Servidor principal
  COMMAND_GUILD_ID: '1340442398442127480', // Servidor donde se ejecuta el comando
  CHANNELS: {
    ANUNCIOS: '1340756895618699416',
    NUEVO: '1340757162573562007',
    BANS: '1340453829124034580',
    UNBANS: '1457912738473967790',
    TEMPBANS: '1457911150854541423',
    MUTES: '1453435158563913820',
    MUTE_END: '1453521869968769106',
    WELCOME: '1340454070070022205',
    LEAVE: '1340475418091847791'
  },
  EMOJIS: { TIENDA: '🛒', IP: '🌐' },
  SERVER_IP: 'powermax.hidenmc.com',
  SERVER_PORT: '24818'
};

/* ───────── EXPRESS ───────── */
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (_, res) => res.send(`🤖 Bot Power Luki: ${client?.ws?.status === 0 ? 'ONLINE ✅' : 'CONECTANDO...'}`));
app.listen(PORT, () => console.log(`🌐 Web server escuchando en ${PORT}`));

/* ───────── CLIENT ───────── */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

/* ───────── READY ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
  try { await client.user.setActivity('Power Luki Network', { type: ActivityType.Playing }); } catch (e) { console.warn(e); }

  // Slash commands
  const commands = [
    new SlashCommandBuilder()
      .setName('anuncio')
      .setDescription('Enviar anuncio al canal ANUNCIOS')
      .addStringOption(o => o.setName('mensaje').setDescription('Contenido del anuncio').setRequired(true)),

    new SlashCommandBuilder()
      .setName('nuevo')
      .setDescription('Enviar mensaje al canal NUEVO')
      .addStringOption(o => o.setName('mensaje').setDescription('Contenido del mensaje').setRequired(true)),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Banear usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón del baneo').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Desbanear usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a desbanear').setRequired(true)),

    new SlashCommandBuilder()
      .setName('temban')
      .setDescription('Ban temporal')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear temporalmente').setRequired(true))
      .addStringOption(o => o.setName('tiempo').setDescription('Tiempo (ej: 10s, 5m, 1h)').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón del baneo').setRequired(false)),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Silenciar usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a silenciar').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Duración (ej: 10s, 5m, 1h)').setRequired(false))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false)),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Desilenciar usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a desilenciar').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registrados.');
  } catch (err) { console.error(err); }
});

/* ───────── FUNCIONES DE BAN Y MUTE ───────── */
async function sendModLog(user, moderator, reason, duration, type) {
  let chId, title, color;
  switch(type) {
    case 'ban': chId = CONFIG.CHANNELS.BANS; title = '🚫 Sanción Aplicada'; color='Red'; break;
    case 'unban': chId = CONFIG.CHANNELS.UNBANS; title = '✅ Usuario Desbaneado'; color='Green'; break;
    case 'tempban': chId = CONFIG.CHANNELS.TEMPBANS; title = '⏱️ Ban Temporal'; color='Orange'; break;
    case 'mute': chId = CONFIG.CHANNELS.MUTES; title = '🔇 Usuario Silenciado'; color='Red'; break;
    case 'unmute': chId = CONFIG.CHANNELS.MUTE_END; title = '🔊 Usuario Desilenciado'; color='Green'; break;
  }

  const ch = await client.channels.fetch(chId).catch(()=>null);
  if(!ch) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`👤 Usuario: ${user.tag}\n🛡️ Moderador: ${moderator.tag}\n📄 Razón: ${reason}${duration ? `\n⏳ Duración: ${duration}` : ''}`)
    .setColor(color)
    .setTimestamp();
  ch.send({ embeds: [embed] }).catch(()=>{});
}

function parseTimeToMs(timeStr){
  const m = timeStr.match(/^(\d+)([smhd])$/);
  if(!m) return null;
  const n = Number(m[1]);
  switch(m[2]){
    case 's': return n*1000;
    case 'm': return n*60*1000;
    case 'h': return n*60*60*1000;
    case 'd': return n*24*60*60*1000;
  }
  return null;
}

/* ───────── INTERACTIONS ───────── */
client.on('interactionCreate', async (interaction) => {
  if(!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    // /anuncio
    if(commandName==='anuncio'){
      const msg = interaction.options.getString('mensaje');
      const ch = await client.channels.fetch(CONFIG.CHANNELS.ANUNCIOS).catch(()=>null);
      if(!ch) return interaction.reply({ content:'Canal de anuncios no encontrado', flags:64 });
      const embed = new EmbedBuilder().setTitle('📣 Anuncio').setDescription(msg).setColor('Yellow');
      await ch.send({ embeds:[embed] });
      return interaction.reply({ content:'Anuncio enviado ✅', flags:64 });
    }

    // /nuevo
    if(commandName==='nuevo'){
      const msg = interaction.options.getString('mensaje');
      const ch = await client.channels.fetch(CONFIG.CHANNELS.NUEVO).catch(()=>null);
      if(!ch) return interaction.reply({ content:'Canal NUEVO no encontrado', flags:64 });
      await ch.send({ content: msg });
      return interaction.reply({ content:'Mensaje NUEVO enviado ✅', flags:64 });
    }

    // /ban
    if(commandName==='ban'){
      const target = interaction.options.getUser('usuario');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const member = await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(member) await member.ban({ reason }).catch(()=>{});
      await sendModLog(target, interaction.user, reason, null, 'ban');
      return interaction.reply({ content:`${target.tag} ha sido baneado ✅`, flags:64 });
    }

    // /unban
    if(commandName==='unban'){
      const target = interaction.options.getUser('usuario');
      const guild = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID);
      await guild.members.unban(target.id).catch(()=>{});
      await sendModLog(target, interaction.user, 'Desbaneado', null, 'unban');
      return interaction.reply({ content:`${target.tag} ha sido desbaneado ✅`, flags:64 });
    }

    // /temban
    if(commandName==='temban'){
      const target = interaction.options.getUser('usuario');
      const timeStr = interaction.options.getString('tiempo');
      const reason = interaction.options.getString('razon') || 'No especificada';
      const member = await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(member) await member.ban({ reason }).catch(()=>{});
      await sendModLog(target, interaction.user, reason, timeStr, 'tempban');
      const ms = parseTimeToMs(timeStr);
      if(ms) setTimeout(async ()=>{
        try{
          const guild = await client.guilds.fetch(CONFIG.MAIN_GUILD_ID);
          await guild.members.unban(target.id).catch(()=>{});
        }catch{}
      }, ms);
      return interaction.reply({ content:`${target.tag} baneado temporalmente ✅`, flags:64 });
    }

    // /mute
    if(commandName==='mute'){
      const target = interaction.options.getUser('usuario');
      const duration = interaction.options.getString('duracion');
      const reason = interaction.options.getString('razon') || 'No especificada';
      let mutedRole = interaction.guild.roles.cache.find(r=>r.name==='Muted');
      if(!mutedRole) mutedRole = await interaction.guild.roles.create({ name:'Muted', permissions:[] });
      const member = await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(member) await member.roles.add(mutedRole).catch(()=>{});
      await sendModLog(target, interaction.user, reason, duration, 'mute');
      if(duration){
        const ms = parseTimeToMs(duration);
        if(ms) setTimeout(async ()=>{
          if(member) await member.roles.remove(mutedRole).catch(()=>{});
          await sendModLog(target, interaction.user, 'Tiempo finalizado', null, 'unmute');
        }, ms);
      }
      return interaction.reply({ content:`${target.tag} ha sido silenciado ✅`, flags:64 });
    }

    // /unmute
    if(commandName==='unmute'){
      const target = interaction.options.getUser('usuario');
      let mutedRole = interaction.guild.roles.cache.find(r=>r.name==='Muted');
      const member = await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(member && mutedRole) await member.roles.remove(mutedRole).catch(()=>{});
      await sendModLog(target, interaction.user, 'Desilenciado', null, 'unmute');
      return interaction.reply({ content:`${target.tag} ha sido desilenciado ✅`, flags:64 });
    }

  }catch(e){console.error(e); try{await interaction.reply({ content:'❌ Error ejecutando comando', flags:64 });}catch{}}
});

/* ───────── BIENVENIDAS Y DESPEDIDAS ───────── */
client.on('guildMemberAdd', async (member)=>{
  const ch = await client.channels.fetch(CONFIG.CHANNELS.WELCOME).catch(()=>null);
  if(!ch) return;
  const embed = new EmbedBuilder()
    .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
    .setDescription(`-_- - POWER LUKI NETWORK -_-\n\n💎 ${member.user.username} ha llegado a nuestra comunidad.\n🎇 ¡Disfruta tu estadía!`)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' })
    .setColor('Green');
  ch.send({ embeds:[embed] }).catch(()=>{});
});

client.on('guildMemberRemove', async (member)=>{
  const ch = await client.channels.fetch(CONFIG.CHANNELS.LEAVE).catch(()=>null);
  if(!ch) return;
  const embed = new EmbedBuilder()
    .setTitle(`😔 ¡Hasta pronto, ${member.user.username}! 😔`)
    .setDescription(`- - - • POWER LUKI NETWORK • - - -\n\n╭━━━━━━━━━━━━━━━━━━━━━━━╮\n💔 ${member.user.username} nos deja temporalmente.\n🌟 Esperamos volver a verte pronto en Power Luki Network.\n╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n📌 Recuerda que siempre eres parte de nuestra comunidad.\n- - - • Siempre Bienvenido • - - -`)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: 'Power Luki Network • Nos vemos pronto' })
    .setColor('Red');
  ch.send({ embeds:[embed] }).catch(()=>{});
});

/* ───────── LOGIN ───────── */
if(!CONFIG.TOKEN){ console.error('❌ TOKEN no definido'); process.exit(1); }
client.login(CONFIG.TOKEN).then(()=>console.log('✅ Bot logueado')).catch(console.error);
