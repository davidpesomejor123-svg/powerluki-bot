// index.js
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
// Cargar JSON y variables
// ============================
let banConfig = JSON.parse(fs.readFileSync('./banConfig.json', 'utf8'));
let invites = JSON.parse(fs.readFileSync('./invites.json', 'utf8'));
const guildInvites = new Map();

// ============================
// Niveles
// ============================
let levels = { users: {} };
if (fs.existsSync('./levels.json')) {
    levels = JSON.parse(fs.readFileSync('./levels.json', 'utf8'));
}
function saveLevels() {
    fs.writeFileSync('./levels.json', JSON.stringify(levels, null, 2));
}
const MIN_XP = 10;
const MAX_XP = 20;

// ============================
// Client
// ============================
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
    console.log(`✅ Bot conectado como ${client.user.tag}`);

    for (const guild of client.guilds.cache.values()) {
        try {
            const firstInvites = await guild.invites.fetch();
            guildInvites.set(guild.id, new Map(firstInvites.map(i => [i.code, i.uses])));
        } catch (err) {
            console.warn(`No se pudieron obtener invitaciones en ${guild.name}`);
        }
    }

    // Verificar canal de tickets
    const ticketChannel = client.channels.cache.find(
        ch => ch.name === '『📖』tickets' && ch.type === ChannelType.GuildText
    );

    if (ticketChannel) {
        const fetchedMessages = await ticketChannel.messages.fetch({ limit: 50 });
        const botMessageExists = fetchedMessages.some(msg => msg.author.id === client.user.id);

        if (!botMessageExists) {
            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle('⚠️ Sistema de Tickets | Power Luki Studios ⚠️')
                .setDescription(`
💠 Tickets inactivos serán cerrados pasados los 3 días 💠

⚙️ **Soporte**: Ayuda general o asistencia en el servidor  
⚠️ **Reportes**: Bugs, errores o problemas en el servidor  
‼️ **Otros**: Diferentes categorías  
🛒 **Compras**: Dudas sobre artículos o servicios

⬇️ Selecciona el tipo de ticket que deseas crear:
                `);

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_soporte').setLabel('Soporte').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_reportes').setLabel('Reportes').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('ticket_otros').setLabel('Otros').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_compras').setLabel('Compras').setStyle(ButtonStyle.Success)
            );

            ticketChannel.send({ embeds: [embed], components: [buttons] });
        }
    }
});

// ============================
// Comando simple
// ============================
client.on('messageCreate', message => {
    if (message.content === '!hola') {
        message.reply('👋 ¡Hola! Soy tu bot.');
    }
});

// ============================
// Bienvenida personalizada
// ============================
client.on('guildMemberAdd', async member => {
    try {
        const channel = member.guild.channels.cache.find(
            ch => ch.name === '『👋』bienvenidos' && ch.type === ChannelType.GuildText
        );
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor('#8A2BE2')
                .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
                .setDescription(`
\`-_- - POWER LUKI NETWORK -_- \`

💎 **${member.user.username}** ha llegado al epicentro de nuestra comunidad.
🎇 Aquí cada rincón tiene sorpresas.
🌟 ¡Disfruta tu estadía!
                `)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' });

            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error('Error en bienvenida:', err);
    }
});

// ============================
// Tickets con botones
// ============================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.guild) return;

    try {
        const category = interaction.customId.replace('ticket_', '');
        const guild = interaction.guild;

        const ticketChannel = await guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        await ticketChannel.send(
            `🎫 Hola ${interaction.user}, has creado un ticket de **${category.toUpperCase()}**. El staff te atenderá pronto.`
        );

        await interaction.reply({
            content: `✅ Se ha creado tu ticket en ${ticketChannel}`,
            ephemeral: true
        });
    } catch (err) {
        console.error('Error al crear ticket:', err);
        await interaction.reply({
            content: '❌ Ocurrió un error al crear el ticket.',
            ephemeral: true
        });
    }
});

// ============================
// Slash command: /sugerir
// ============================
const commands = [
    new SlashCommandBuilder()
        .setName('sugerir')
        .setDescription('Envía una sugerencia al canal de sugerencias')
        .addStringOption(option =>
            option.setName('mensaje').setDescription('Escribe tu sugerencia').setRequired(true)
        )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Actualizando comandos de slash...');
        await rest.put(Routes.applicationCommands('1433313752488607821'), { body: commands }); // Cambia a tu ID de aplicación
        console.log('Comandos actualizados correctamente.');
    } catch (err) {
        console.error('Error al registrar comandos:', err);
    }
})();

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'sugerir') return;

    if (!interaction.guild) {
        return interaction.reply({
            content: '❌ Este comando solo puede usarse en un servidor.',
            flags: 64
        });
    }

    try {
        await interaction.deferReply({ flags: 64 });
        const suggestion = interaction.options.getString('mensaje');
        const suggestionChannel = await interaction.guild.channels.fetch('1340503280987541534');

        if (!suggestionChannel || suggestionChannel.type !== ChannelType.GuildText) {
            return interaction.editReply({
                content: '❌ Canal de sugerencias inválido o no accesible.'
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('📢 Nueva Sugerencia')
            .setDescription(suggestion)
            .addFields(
                { name: '💡 Sugerido por', value: interaction.user.tag, inline: true },
                { name: '🕒 Fecha', value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: 'Power Luki Network • Sugerencias' });

        const msg = await suggestionChannel.send({ embeds: [embed] });
        await msg.react('✅');
        await msg.react('❌');

        await interaction.editReply({
            content: '✅ Tu sugerencia ha sido enviada correctamente.'
        });
    } catch (err) {
        console.error('Error en /sugerir:', err);
        if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ Ocurrió un error al enviar la sugerencia.'
            });
        } else {
            await interaction.reply({
                content: '❌ Error inesperado al procesar la sugerencia.',
                flags: 64
            });
        }
    }
});

// ============================
// Comando !boost
// ============================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.content.toLowerCase() !== '!boost') return;

    const boostChannel = message.guild.channels.cache.find(
        ch => ch.name === '『💎』boots' && ch.type === ChannelType.GuildText
    );

    if (!boostChannel) return message.reply('❌ No se encontró el canal 『💎』boots.');

    const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setTitle('🚀 -_ ¡NUEVO BOOST! -_ 🚀')
        .setDescription(`
✨ -_ ¡Gracias por tu apoyo, ${message.author.username}! -_ ✨
━━━━━━━━━━━━━━━━━━━━━━
💖 -_ Usuario: ${message.author.tag} -_
🎁 -_ Beneficio: ¡El servidor se hace más fuerte gracias a ti! -_
━━━━━━━━━━━━━━━━━━━━━━
        `)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setImage('https://media.giphy.com/media/l0MYC0LajbaPoEADu/giphy.gif')
        .setFooter({ text: 'Power Luki Network -_ • ¡Cada boost cuenta! -_' })
        .setTimestamp();

    await boostChannel.send({ embeds: [embed] });
});

// ============================
// ///// EVENTO: _-_ SISTEMA DE NIVELES _-_ /////
// ============================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const userId = message.author.id;
    if (!levels.users[userId]) levels.users[userId] = { xp: 0, level: 1 };

    const xp = Math.floor(Math.random() * (MAX_XP - MIN_XP + 1)) + MIN_XP;
    levels.users[userId].xp += xp;

    const xpToNext = levels.users[userId].level * 100;

    if (levels.users[userId].xp >= xpToNext) {
        levels.users[userId].level += 1;
        levels.users[userId].xp -= xpToNext;

        const levelUpEmbed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setTitle(`🌟 ¡LEVEL UP! 🌟`)
            .setDescription(`
╭━━━━━✨━━━━━╮
💠 ¡Felicidades <@${userId}>!
💎 Has subido al **Nivel ${levels.users[userId].level}**
╰━━━━━✨━━━━━╯
            `)
            .addFields(
                { name: '💥 Experiencia total', value: `${levels.users[userId].xp} XP`, inline: true },
                { name: '🏆 Próximo nivel', value: `${xpToNext} XP necesarios`, inline: true }
            )
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'Power Luki Network • Sistema de Niveles' })
            .setTimestamp();

        const levelChannel = message.guild.channels.cache.find(ch => ch.name === '『🆙』niveles');
        if (levelChannel) levelChannel.send({ embeds: [levelUpEmbed] });
    }

    saveLevels();
});

// ============================
// Sistema de baneos
// ============================
client.on('messageCreate', async message => {
    if (!message.guild || !message.member) return;
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;

    const args = message.content.trim().split(/ +/g);
    if (args[0] === '!ban') {
        const user = message.mentions.members.first();
        if (!user) return message.reply('❌ Menciona un usuario para banear.');
        if (!user.bannable) return message.reply('❌ No puedo banear a ese usuario.');

        const reason = args.slice(2).join(' ') || 'No especificada';
        try {
            await user.ban({ reason });
            message.reply(`✅ ${user.user.tag} fue baneado.`);

            const logChannel = message.guild.channels.cache.find(
                ch => ch.name === '『🔨』baneos' && ch.type === ChannelType.GuildText
            );
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🔨 Usuario Baneado')
                    .addFields(
                        { name: 'Usuario', value: user.user.tag },
                        { name: 'Por', value: message.author.tag },
                        { name: 'Razón', value: reason }
                    );
                logChannel.send({ embeds: [embed] });
            }
        } catch (err) {
            console.error(err);
            message.reply('❌ Error al intentar banear al usuario.');
        }
    }
});

// ============================
// Servidor web para Render
// ============================
const app = express();
app.get('/', (req, res) => res.send('✅ Bot Power_luki NETWORK activo en Render'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🌐 Servidor web activo en el puerto ${PORT}`));

// ============================
// Login del bot
// ============================
client.login(process.env.TOKEN);

