#!/bin/bash
# Reconstitue le workspace ADJUJA : clone (ou met à jour) les cinq dépôts frères
# de adjuja-infra dans le dossier parent. Les fichiers compose de ce dépôt utilisent
# des chemins relatifs (`context: ../adjuja-backend`), donc les dépôts DOIVENT être
# frères pour que les builds fonctionnent.
#
# Usage : ./scripts/clone.sh   (depuis adjuja-infra/, ou depuis n'importe où)
set -e

# Racine du workspace = parent de adjuja-infra, quel que soit l'endroit d'appel
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# TODO: renseigner l'organisation une fois les dépôts distants créés.
# Aucun remote n'existe au 2026-09-10, la découpe a été faite en local uniquement.
BASE_URL="${ADJUJA_GIT_BASE:-git@github.com:VOTRE-ORG}"

if [[ "$BASE_URL" == *"VOTRE-ORG"* ]]; then
  echo "❌ BASE_URL n'est pas configuré."
  echo "   Les dépôts distants n'existent pas encore. Une fois créés :"
  echo "     export ADJUJA_GIT_BASE=git@github.com:votre-org"
  echo "   ou éditez BASE_URL dans ce script."
  exit 1
fi

REPOS=(
  adjuja-backend
  adjuja-frontend
  adjuja-watcher
  adjuja-notification
  adjuja-docs
)

echo "🚀 Workspace ADJUJA dans $ROOT_DIR"
echo "====================================================="

for repo in "${REPOS[@]}"; do
  local_dir="$ROOT_DIR/$repo"
  repo_url="$BASE_URL/$repo.git"

  echo "🔍 $repo"

  if [ -d "$local_dir/.git" ]; then
    echo "🔄 déjà présent, mise à jour"
    (cd "$local_dir" && git pull --rebase)
  else
    if git ls-remote "$repo_url" &> /dev/null; then
      echo "📥 clone dans $local_dir"
      git clone "$repo_url" "$local_dir"
    else
      echo "❌ dépôt introuvable ou inaccessible : $repo_url"
      echo "-----------------------------------------------------"
      continue
    fi
  fi
  echo "-----------------------------------------------------"
done

echo "🎉 Terminé. Prochaine étape : cp .env.example .env puis remplir les variables."
