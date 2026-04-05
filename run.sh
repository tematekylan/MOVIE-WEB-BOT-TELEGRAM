#!/bin/bash
# Vérifie que le fichier .env existe
if [ ! -f .env ]; then
  echo "⚠️  Fichier .env manquant!"
  echo "Copiez .env.example -> .env et complétez les valeurs"
  cp .env.example .env
  echo "✅ .env créé. Veuillez éditer les valeurs."
else
  echo "✅ .env trouvé"
fi

# Vérifie si dotenv est installé
if [ ! -d node_modules ]; then
  echo "Installations des dépendances..."
  npm install
fi

echo "🚀 Démarrage du bot..."
npm start
