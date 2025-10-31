require('dotenv').config();
// index.js
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionsBitField 
// index.js
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionsBitField 
} = require('discord.js');
const fs = require('fs');
const banConfig = require('./banConfig.json');
let invites = require('./invites.json'); // Archivo de invites
const guildInvites = new Map();

// Inicialización del cliente
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --------------------------------------
// Bot listo
// --------------------------------------
client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);

    // Inicializar cache de invites para cada servidor
    client.guilds.cache.forEach(async guild => {
        const firstInvites = await guild.invites.fetch();
        guildInvites.set(guild.id, new Map(firstInvites.map(i => [i.code, i.uses])));
    });

    // Mensaje de tickets
    const ticketChannel = client.channels.cache.find(ch => ch.name === '『📖』tickets' && ch.type === 0);
    if (ticketChannel) {
        const embed = new EmbedBuilder()
            .setColor('#00BFFF')
            .setTitle('⚠️ Sistema de Tickets | Power Luki Studios ⚠️')
            .setDescription(`
💠 Tickets inactivos serán cerrados pasados los 3 días 💠

⚙️ **Soporte**: Ayuda general o asistencia en el servidor  
⚠️ **Reportes**: Bugs, errores o problemas en el servidor  
‼️ **Otros**: Diferentes categorías  
🛒 **Compras**: Dudas sobre artículos o servicios

💠 No abrir ticket innecesariamente 💠

⬇️ Selecciona el tipo de ticket que deseas crear:
            `);

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('ticket_soporte').setLabel('Soporte').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_reportes').setLabel('Reportes').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('ticket_otros').setLabel('Otros').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_compras').setLabel('Compras').setStyle(ButtonStyle.Success)
            );

        ticketChannel.send({ embeds: [embed], components: [buttons] });
    }
});

// --------------------------------------
// Comando de prueba
// --------------------------------------
client.on('messageCreate', message => {
    if (message.content === '!hola') {
        message.reply('👋 ¡Hola! Soy tu bot.');
    }
});

// --------------------------------------
// Bienvenida personalizada
// --------------------------------------
client.on('guildMemberAdd', async member => {
    // Canal de bienvenida
    const channel = member.guild.channels.cache.find(ch => ch.name === '『👋』bienvenidos' && ch.type === 0);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor('#8A2BE2')
            .setTitle(`✨ ¡Bienvenido, ${member.user.username}! ✨`)
            .setDescription(`
\`- - - • POWER LUKI NETWORK • - - -\`

╭━━━━━━━━━━━━━━━━━━━━━━━╮
💎 **${member.user.username}** ha llegado al epicentro de nuestra comunidad.
🎇 Aquí cada rincón tiene sorpresas y cada chat guarda secretos.
🌟 Explora, comparte y deja tu huella en Power Luki Network.
╰━━━━━━━━━━━━━━━━━━━━━━━╯

📌 **Guía rápida para comenzar:**
➤ 📝 _#normas・Lo esencial para todos_
➤ 💬 _#general・Conversa y comparte_
➤ 📢 _#anuncios・Todo lo importante_

🚀 ¡Cada nuevo miembro hace crecer nuestra energía! Tú eres parte del cambio y la vibra de Power Luki.
\`- - - • Único y Exclusivo • - - -\`
            `)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'Power Luki Network • Donde cada miembro brilla' });

        channel.send({ embeds: [embed] });
    }

    // Invite tracker
    const newInvites = await member.guild.invites.fetch();
    const oldInvites = guildInvites.get(member.guild.id);
    const usedInvite = newInvites.find(inv => oldInvites.get(inv.code) < inv.uses);

    guildInvites.set(member.guild.id, new Map(newInvites.map(i => [i.code, i.uses])));

    let inviterTag = 'Desconocido';
    if (usedInvite && usedInvite.inviter) {
        inviterTag = usedInvite.inviter.tag;
        if (!invites[inviterTag]) invites[inviterTag] = 0;
        invites[inviterTag]++;
        fs.writeFileSync('./invites.json', JSON.stringify(invites, null, 2));
    }

    const inviteChannel = member.guild.channels.cache.find(ch => ch.name === '『🗓』invitaciones' && ch.type === 0);
    if (inviteChannel) {
        const embedInv = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🎉 Nuevo Invitado')
            .setDescription(`
👤 **Invitado:** ${member.user.tag}  
🧑‍💼 **Invitador:** ${inviterTag}  
⭐ **Total Invitaciones:** ${invites[inviterTag] || 0}
            `)
            .setFooter({ text: 'Power Luki Network • Registro de Invitaciones' })
            .setTimestamp();
        inviteChannel.send({ embeds: [embedInv] });
    }
});

// --------------------------------------
// Despedida personalizada
// --------------------------------------
client.on('guildMemberRemove', member => {
    const channel = member.guild.channels.cache.find(ch => ch.name === '『😔』despedidas' && ch.type === 0);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle(`😔 ¡Hasta pronto, ${member.user.username}! 😔`)
        .setDescription(`
\`- - - • POWER LUKI NETWORK • - - -\`

╭━━━━━━━━━━━━━━━━━━━━━━━╮
💔 **${member.user.username}** nos deja temporalmente.
🌟 Esperamos volver a verte pronto en Power Luki Network.
╰━━━━━━━━━━━━━━━━━━━━━━━╯

📌 Recuerda que siempre eres parte de nuestra comunidad.
\`- - - • Siempre Bienvenido • - - -\`
        `)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Power Luki Network • Nos vemos pronto' })
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

// --------------------------------------
// Tickets con botones
// --------------------------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const category = interaction.customId.replace('ticket_', '');
    const guild = interaction.guild;

    const ticketChannel = await guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ],
    });

    await ticketChannel.send(`🎫 Hola ${interaction.user}, has creado un ticket de **${category.toUpperCase()}**. El staff te atenderá pronto.`);
    await interaction.reply({ content: `✅ Se ha creado tu ticket en ${ticketChannel}`, ephemeral: true });
});

// --------------------------------------
// Sistema de Sugerencias
// --------------------------------------
const { SlashCommandBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('sugerir')
        .setDescription('Enviar una sugerencia al canal de sugerencias')
        .addStringOption(option =>
            option.setName('mensaje')
                .setDescription('Escribe tu sugerencia')
                .setRequired(true)
        )
].map(command => command.toJSON());

// Registrar comando (global, disponible en todo el servidor)
const rest = new REST({ version: '10' }).setToken('');
(async () => {
    try {
        console.log('Actualizando comandos de slash...');
        await rest.put(
            Routes.applicationCommands('1433313752488607821'), // ID de tu bot
            { body: commands }
        );
        console.log('Comandos de slash actualizados.');
    } catch (error) {
        console.error(error);
    }
})();

// Manejo de la interacción
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sugerir') {
        const suggestion = interaction.options.getString('mensaje');

        // Canal específico de sugerencias
        const suggestionChannel = interaction.guild.channels.cache.find(
            ch => ch.name === '『📃』sugerencias' && ch.type === 0
        );
        if (!suggestionChannel) {
            return interaction.reply({ content: '❌ No se encontró el canal de sugerencias.', ephemeral: true });
        }

        // Crear embed
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('📢 Nueva Sugerencia')
            .setDescription(suggestion)
            .addFields(
                { name: '💡 Sugerido por', value: interaction.user.tag, inline: true },
                { name: '🕒 Fecha', value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: 'Power Luki Network • Sugerencias' });

        // Enviar al canal de sugerencias
        const msg = await suggestionChannel.send({ embeds: [embed] });

        // Reacciones de votación
        await msg.react('✅');
        await msg.react('❌');

        // Confirmación al usuario
        await interaction.reply({ content: '✅ Tu sugerencia ha sido enviada al canal de sugerencias.', ephemeral: true });
    }
});

// --------------------------------------
// Sistema de baneos avanzado
// --------------------------------------
client.on('messageCreate', async message => {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;

    const args = message.content.trim().split(/ +/g);

    // BANEAR
    if (args[0] === '!ban') {
        const user = message.mentions.members.first();
        if (!user) return message.reply('❌ Debes mencionar a un usuario para banear.');
        if (!user.bannable) return message.reply('❌ No puedo banear a este usuario.');

        const reason = args.slice(2).join(' ') || 'No especificada';
        const date = new Date();

        try {
            await user.ban({ reason });
            message.reply(`✅ ${user.user.tag} ha sido baneado.`);

            const logEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔨 Usuario Baneado')
                .addFields(
                    { name: '👤 Usuario', value: `${user.user.tag} (${user.id})`, inline: false },
                    { name: '👮 Baneado por', value: `${message.author.tag}`, inline: false },
                    { name: '📄 Razón', value: `${reason}`, inline: false },
                    { name: '⏰ Fecha y hora', value: `${date.toLocaleString()}`, inline: false }
                )
                .setFooter({ text: 'Power Luki Network • Registro de baneos' })
                .setTimestamp();

            const logChannel = message.guild.channels.cache.find(ch => ch.name === '『🔨』baneos' && ch.type === 0);
            if (logChannel) logChannel.send({ embeds: [logEmbed] });

            // Guardar en JSON
            banConfig.bannedUsers.push({
                id: user.id,
                tag: user.user.tag,
                bannedBy: message.author.tag,
                reason: reason,
                date: date.toISOString()
            });
            fs.writeFileSync('./banConfig.json', JSON.stringify(banConfig, null, 2));
        } catch (err) {
            console.error(err);
            message.reply('❌ Ocurrió un error al intentar banear al usuario.');
        }
    }

    // DESBANEAR
    if (args[0] === '!unban') {
        const userId = args[1];
        if (!userId) return message.reply('❌ Debes poner la ID del usuario a desbanear.');

        try {
            await message.guild.members.unban(userId);
            message.reply(`✅ Usuario con ID ${userId} ha sido desbaneado.`);

            banConfig.bannedUsers = banConfig.bannedUsers.filter(b => b.id !== userId);
            fs.writeFileSync('./banConfig.json', JSON.stringify(banConfig, null, 2));
        } catch (err) {
            console.error(err);
            message.reply('❌ No se pudo desbanear al usuario.');
        }
    }
});

// --------------------------------------
// Login del bot
// --------------------------------------

client.login(process.env.TOKEN);
