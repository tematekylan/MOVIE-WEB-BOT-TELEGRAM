# 🚀 Déploiement sur Railway.app

## Étapes de déploiement :

### 1. Github (Prérequis)
- Poussez votre code sur GitHub : `git init` → `git add .` → `git commit` → `git push origin main`

### 2. Créer le projet Railway
1. Allez sur https://railway.app/new
2. Cliquez sur **"Deploy from GitHub"**
3. Connectez votre compte GitHub et sélectionnez votre repo
4. Laissez Railway configurer automatiquement

### 3. Ajouter les variables d'environnement
Dans le dashboard Railway :
1. Allez à **Project Settings** → **Variables**
2. Ajoutez ces variables :
   - `BOT_TOKEN` = Votre token Telegram
   - `OWNER_CHAT_ID` = Votre ID de chat
   - `PORT` = 3001
   - `FIREBASE_PROJECT_ID` = Votre ID project Firebase
   - `FIREBASE_PRIVATE_KEY_ID` = Votre key ID
   - `FIREBASE_PRIVATE_KEY` = Votre clé privée (sans les \n, en une seule ligne)
   - `FIREBASE_CLIENT_EMAIL` = Email du service account
   - `FIREBASE_CLIENT_ID` = ID du client

### 4. Déployer
Railway va automatiquement :
- Installer les dépendances (`npm install`)
- Lancer l'app (`npm start`)

## ⚠️ Important - Sécurité
**NE COMMITEZ JAMAIS votre .env file!** Il est déjà dans .gitignore.
Les variables d'environnement sensibles doivent être dans Railway, pas dans le code.

## 🔑 Obtenir votre FIREBASE_PRIVATE_KEY
1. Allez sur https://console.firebase.google.com
2. Paramètres du projet → Comptes de service
3. Générez une nouvelle clé privée (JSON)
4. Copiez la valeur du champ "private_key"
5. Collez-la dans Railway (c'est une clé multi-ligne, Railway gère les \n automatiquement)

## 📊 Vérifier le déploiement
Dans Railway :
- Allez à **Deployments**
- Cliquez sur le déploiement actif
- Vérifiez les logs
- Votre bot est online quand vous voyez : "Bot Telegram démarré"
