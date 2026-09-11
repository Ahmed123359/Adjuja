# adjuja-notification

Microservice de notifications (FastAPI, port 8002)

Envoi des digests AO par email (Resend), architecture Factory + Adapter extensible à WhatsApp et SMS.

Ce dépôt est un morceau du workspace ADJUJA. La vue d'ensemble (architecture, stack,
configuration, lancement de la stack complète) vit dans **`adjuja-infra/README.md`**,
qui est le point d'entrée du projet.

## Place dans le workspace

Ce dépôt doit être cloné **frère** des autres (`adjuja-infra/scripts/clone.sh` s'en
charge) : les fichiers compose de `adjuja-infra` buildent avec
`context: ../adjuja-notification`.

## Lancer

Le plus simple passe par le compose de `adjuja-infra` :

```bash
cd ../adjuja-infra
docker compose -f docker-compose.dev.yml up
```

En autonome depuis ce dépôt : voir adjuja-infra/docker-compose.dev.yml
