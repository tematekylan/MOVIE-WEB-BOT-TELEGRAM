require('dotenv').config();

const { Telegraf } = require('telegraf'); // Bibliothèque pour créer et gérer le bot Telegram
const admin = require('firebase-admin'); // SDK Firebase pour accéder à Firestore et autres services Firebase
const express = require('express'); // Framework web pour créer le serveur HTTP et le dashboard

const botToken = process.env.BOT_TOKEN;
const ownerChatId = process.env.OWNER_CHAT_ID;

// Charger les credentials Firebase depuis les variables d'environnement
const serviceAccount = {
  "type": "service_account",
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : null,
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40moviebot-4fee5.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

let postsCollection = null;

try {
  if (serviceAccount.project_id !== 'YOUR_PROJECT_ID') {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();
    postsCollection = db.collection('channel_posts');
    console.log('Firebase Admin initialisé avec les credentials intégrés.');
  } else {
    console.warn('Remplacez les placeholders dans serviceAccount par vos vraies credentials Firebase.');
    console.warn('Les publications ne seront pas enregistrées dans Firestore tant que Firebase Admin n’est pas initialisé.');
  }
} catch (error) {
  console.error('Erreur lors de l\'initialisation de Firebase :', error.message);
  console.warn('Vérifiez vos credentials Firebase. Le bot fonctionnera sans base de données.');
}

const bot = new Telegraf(botToken);
let registeredOwnerChatId = null;

function getNotificationChatId() {
  return ownerChatId || registeredOwnerChatId;
}

function buildApprovalKeyboard(postId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approuvé', callback_data: `approve:${postId}` },
          { text: '❌ Rejeté', callback_data: `disapprove:${postId}` },
          { text: '⏳ En attente', callback_data: `pending:${postId}` },
        ],
      ],
    },
  };
}

function extractText(post) {
  return post.caption || post.text || '';
}

function parseTitleFromText(text) {
  if (!text) return null;
  const firstLine = text.split('\n')[0].trim();
  return firstLine || null;
}

bot.start((ctx) => {
  if (!ownerChatId && !registeredOwnerChatId) {
    registeredOwnerChatId = ctx.chat.id;
    return ctx.reply('Bienvenue sur MovieBot ! Ce chat est désormais enregistré pour recevoir les demandes de validation de canal.');
  }
  return ctx.reply('Bienvenue sur MovieBot ! Je suis prêt à gérer la validation des publications.');
});

bot.help((ctx) => ctx.reply('Ajoute ce bot comme administrateur de ton canal Telegram. Les publications seront enregistrées dans Firestore. Utilise /start dans ce chat pour recevoir les demandes de validation si OWNER_CHAT_ID n’est pas défini.'));

bot.on('channel_post', async (ctx) => {
  const post = ctx.channelPost;
  const notificationChatId = getNotificationChatId();
  const text = extractText(post) || 'Aucun texte disponible.';
  const title = parseTitleFromText(text) || `Publication du canal ${ctx.chat?.title || ctx.chat?.username || 'inconnu'}`;

  if (!postsCollection) {
    console.error('Firestore non initialisé : impossible d’enregistrer la publication du canal.');
    return;
  }

  try {
    // Utiliser une transaction pour incrémenter le compteur de manière atomique par canal
    const counterRef = admin.firestore().collection('counters').doc('posts_' + ctx.chat.id);
    const nextNumber = await admin.firestore().runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      const current = counterDoc.exists ? counterDoc.data().current || 0 : 0;
      const newNumber = current + 1;
      transaction.set(counterRef, { current: newNumber });
      console.log(`Numéro généré pour le canal ${ctx.chat.id} : ${newNumber}`);
      return newNumber;
    });

    const docRef = await postsCollection.add({
      channelId: ctx.chat.id,
      channelTitle: ctx.chat.title || ctx.chat.username || '',
      title,
      text,
      source: 'https://api.telegram.org/bot' + botToken + '/getUpdates', // API Telegram
      approved: false,
      rejected: false,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      number: nextNumber,
      sequence: nextNumber,
    });

    if (!notificationChatId) {
      console.warn('Aucune destination de notification définie pour la validation. Utilise /start ou OWNER_CHAT_ID.');
      return;
    }

    await bot.telegram.sendMessage(
      notificationChatId,
      `Nouvelle publication en attente de validation :\n\n${title}`,
      buildApprovalKeyboard(docRef.id)
    );
  } catch (error) {
    console.error('Erreur lors de la réception de la publication du canal :', error.message);
  }
});

bot.on('message', async (ctx) => {
  return ctx.reply('Bonjour ! Je gère uniquement la validation des publications existantes. Je ne transfère plus les publications de canal ici.');
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery?.data || '';
  const [action, postId] = data.split(':');
  if (!postId) {
    return ctx.answerCbQuery('Action invalide.', { show_alert: true });
  }

  const updates = {};
  let responseText = '';
  if (action === 'approve') {
    updates.approved = true;
    updates.rejected = false;
    updates.status = 'approved';
    updates.decisionAt = admin.firestore.FieldValue.serverTimestamp();
    responseText = 'Publication approuvée.';
  } else if (action === 'disapprove') {
    updates.approved = false;
    updates.rejected = true;
    updates.status = 'rejected';
    updates.decisionAt = admin.firestore.FieldValue.serverTimestamp();
    responseText = 'Publication rejetée.';
  } else if (action === 'pending') {
    updates.approved = false;
    updates.rejected = false;
    updates.status = 'pending';
    updates.decisionAt = admin.firestore.FieldValue.serverTimestamp();
    responseText = 'Publication marquée en attente.';
  } else {
    return ctx.answerCbQuery('Action non reconnue.', { show_alert: true });
  }

  if (!postsCollection) {
    console.error('Firestore non initialisé : impossible de mettre à jour la publication.');
    return ctx.answerCbQuery('Impossible de mettre à jour le statut : Firestore non disponible.', { show_alert: true });
  }

  try {
    const doc = await postsCollection.doc(postId).get();
    const postData = doc.data();
    const number = postData ? postData.number : 'inconnu';
    await ctx.answerCbQuery(responseText);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.editMessageText(`${responseText} (numéro ${number})`, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Erreur lors de la récupération du numéro :', error.message);
    await ctx.answerCbQuery(responseText);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.editMessageText(`${responseText} (id ${postId})`, { parse_mode: 'HTML' });
  }
});

const app = express();
const port = process.env.PORT || 3001;

app.get('/dashboard', (req, res) => {
  res.send('<h1>Dashboard du Bot</h1><p>Le bot est en cours d\'exécution.</p>');
});

app.get('/file/:filename', (req, res) => {
  const filePath = path.join(__dirname, req.params.filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send('Fichier non trouvé');
    }
  });
});

app.listen(port, () => {
  console.log(`Dashboard disponible sur le port ${port}`);
});

async function startBot() {
  try {
    await bot.telegram.deleteWebhook();
    await bot.launch({ dropPendingUpdates: true });
    console.log('Bot Telegram démarré.');
  } catch (error) {
    console.error('Erreur de lancement du bot :', error);
    process.exit(1);
  }
}

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 
