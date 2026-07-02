"""
Seed ABI Consulting company profile from Dossier AO HAFID documents.
Run: python seed_company_profile.py
"""
import json
import uuid
import psycopg2
from datetime import datetime, timezone

DB_URL = "postgresql://offria:offria_dev@postgres:5432/offria"

PROFILE = {
    "nom_entreprise": "ABI CONSULTING SARL",
    "ice":            "002579010000023",
    "rc":             "144103",
    "if_fiscal":      "",
    "cnss":           "",
    "capital_social": "30 000,00 MAD",
    "rib":            "181810212111738847000536",
    "forme_juridique": "SARL",
    "adresse":        "N° 33, Immeuble F, Résidence Al ALAWAILE, Angle Avenue Hassan II et BD Ghazza",
    "ville":          "Temara",
    "telephone":      "+212 6 61 39 64 13",
    "email":          "hafidlaadimi2003@gmail.com",
    "gerant_nom":     "Ben Hammou",
    "gerant_prenom":  "Ahmed",
    "gerant_cin":     "",
    "secteur":        "Cabinet d'études, de formations et de conseils",
    "extra": {
        "expertises": [
            "Suivi & évaluation et gestion de connaissance",
            "Entrepreneuriat et développement des PME",
            "Gestion financière et comptabilité",
            "Développement des organisations professionnelles",
            "Marketing digital et e-commerce",
            "Chaînes de valeurs et systèmes de marché",
            "Gestion de projets de développement",
            "Agriculture et agroalimentaires",
            "Développement rural",
            "Système d'Information Géographique (SIG)",
            "Formation et renforcement des capacités",
        ],
        "moyens_humains": {
            "ingenieurs": 4,
            "cadres_superieurs": 1,
            "techniciens": 6,
            "pool_specialistes": 10,
            "reseau_experts": 30,
            "personnel_non_permanent": 40,
        },
        "moyens_materiels": [
            "4 véhicules (Dacia Duster, Opel Astra, Dacia Logan, BMW X3)",
            "4 ordinateurs de bureau (HP, Dell)",
            "6 ordinateurs portables (HP Elitebook Pro, Dell, MacBook Pro)",
            "4 imprimantes/scanners couleur",
            "2 vidéoprojecteurs EPSON",
        ],
        "references": [
            {
                "client": "GIZ-Maroc et CRI-DT",
                "mission": "Renforcement des capacités des femmes productrices - Projet Womena",
                "annee": "2025",
                "montant_mad": 550152,
            },
            {
                "client": "Agence Urbaine de Rabat-Salé",
                "mission": "Mise en place d'un Système d'Information Géographique Fédérateur (SIG)",
                "annee": "2025",
                "montant_mad": 606000,
            },
            {
                "client": "FAO-Maroc",
                "mission": "Enquête d'évaluation sécurité alimentaire agriculteurs Al Haouz",
                "annee": "2024",
                "montant_mad": 864000,
            },
            {
                "client": "ONCA (DRCA Fès-Meknès)",
                "mission": "Formations conseillers programme revitalisation territoires ruraux",
                "annee": "2024",
                "montant_mad": 513600,
            },
            {
                "client": "ONCA (DRCA Fès-Meknès)",
                "mission": "Organisation sessions de formation agriculteurs Fès-Meknès",
                "annee": "2024-2025",
                "montant_mad": 1339800,
            },
            {
                "client": "OIT-Maroc",
                "mission": "Enquête annuelle auprès des bénéficiaires du projet ProAgro",
                "annee": "2024",
                "montant_mad": 463440,
            },
            {
                "client": "OIT-Mauritanie",
                "mission": "Analyse participative chaînes de valeurs - Hodh El Chargui, Darnaim, Trarza",
                "annee": "2024",
                "montant_mad": 466000,
            },
            {
                "client": "GIZ-Maroc",
                "mission": "Digitalisation des TPE-PE-Coopératives secteur tourisme",
                "annee": "2024-2025",
                "montant_mad": 588380,
            },
            {
                "client": "SMIT",
                "mission": "Incubation et accompagnement projets FORSA - Région Drâa Tafilalet",
                "annee": "2023-2024",
                "montant_mad": 695647,
            },
            {
                "client": "OIT-Maroc",
                "mission": "Renforcement des capacités des coopératives agricoles en e-commerce",
                "annee": "2023",
                "montant_mad": 1489000,
            },
            {
                "client": "GIZ-Maroc",
                "mission": "Diagnostic et accompagnement unités de valorisation produits agricoles",
                "annee": "2023",
                "montant_mad": 1035088,
            },
            {
                "client": "Action Contre la Faim (ACF) - Mauritanie",
                "mission": "Étude des chaînes de valeur et créneaux porteurs d'emploi",
                "annee": "2025",
                "montant_mad": 302000,
            },
            {
                "client": "Enabel - Agence belge de développement",
                "mission": "Étude de capitalisation des bonnes pratiques du projet PAGIE",
                "annee": "2023",
                "montant_mad": 270000,
            },
            {
                "client": "Expertise France",
                "mission": "Conception Système de Suivi, Évaluation et Apprentissage - Programme SABIL",
                "annee": "2023",
                "montant_mad": 360000,
            },
            {
                "client": "GIZ-Maroc",
                "mission": "Partenariat formations courte durée - Dispositif PEJ III",
                "annee": "2024",
                "montant_mad": 1196427,
            },
        ],
    },
}

STAFF = [
    {
        "nom": "El Khamlichi",
        "prenom": "Ahmed",
        "poste": "Chef de mission",
        "specialite": "Agroéconomie et développement rural",
        "diplome": "Ingénieur d'État en Agroéconomie",
        "annees_experience": 12,
    },
    {
        "nom": "Boutaleb",
        "prenom": "Youssef",
        "poste": "Expert senior",
        "specialite": "Ingénierie de développement",
        "diplome": "Ingénieur d'État en Ingénierie de développement",
        "annees_experience": 12,
    },
    {
        "nom": "Ait Hammou",
        "prenom": "Fatima",
        "poste": "Expert senior",
        "specialite": "Production animale",
        "diplome": "Ingénieur d'État en Production animale",
        "annees_experience": 15,
    },
    {
        "nom": "Rachidi",
        "prenom": "Mohammed",
        "poste": "Expert",
        "specialite": "Techniques de productions agricoles",
        "diplome": "Ingénieur d'État en Techniques de productions agricoles",
        "annees_experience": 12,
    },
    {
        "nom": "Benali",
        "prenom": "Karim",
        "poste": "Expert SIG",
        "specialite": "Environnement, géomatique et SIG",
        "diplome": "Master en Géomatique",
        "annees_experience": 5,
    },
]


def main() -> None:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Find user org_id by email
    cur.execute("SELECT id, org_id, email FROM users WHERE email = %s LIMIT 1", ("hafidlaadimi@gmail.com",))
    row = cur.fetchone()
    if not row:
        cur.execute("SELECT id, org_id, email FROM users ORDER BY created_at ASC LIMIT 5")
        users = cur.fetchall()
        print("User not found. Available users:")
        for u in users:
            print(f"  id={u[0]}  org_id={u[1]}  email={u[2]}")
        conn.close()
        return

    user_id, org_id, email = row
    # If org_id is NULL, use user id as org_id (single-user org)
    if org_id is None:
        org_id = user_id
    print(f"Found user: {email}  org_id={org_id}")

    # Upsert company profile
    now = datetime.now(timezone.utc).isoformat()
    profile_id = str(uuid.uuid4())
    extra_json = json.dumps(PROFILE["extra"], ensure_ascii=False)

    cur.execute("""
        INSERT INTO company_profiles (
            id, org_id, nom_entreprise, ice, rc, if_fiscal, cnss,
            capital_social, rib, forme_juridique, adresse, ville,
            telephone, email, gerant_nom, gerant_prenom, gerant_cin,
            secteur, extra, created_at, updated_at
        ) VALUES (
            %(id)s, %(org_id)s, %(nom_entreprise)s, %(ice)s, %(rc)s, %(if_fiscal)s, %(cnss)s,
            %(capital_social)s, %(rib)s, %(forme_juridique)s, %(adresse)s, %(ville)s,
            %(telephone)s, %(email)s, %(gerant_nom)s, %(gerant_prenom)s, %(gerant_cin)s,
            %(secteur)s, %(extra)s::jsonb, %(now)s, %(now)s
        )
        ON CONFLICT (org_id) DO UPDATE SET
            nom_entreprise  = EXCLUDED.nom_entreprise,
            ice             = EXCLUDED.ice,
            rc              = EXCLUDED.rc,
            capital_social  = EXCLUDED.capital_social,
            rib             = EXCLUDED.rib,
            forme_juridique = EXCLUDED.forme_juridique,
            adresse         = EXCLUDED.adresse,
            ville           = EXCLUDED.ville,
            telephone       = EXCLUDED.telephone,
            email           = EXCLUDED.email,
            gerant_nom      = EXCLUDED.gerant_nom,
            gerant_prenom   = EXCLUDED.gerant_prenom,
            secteur         = EXCLUDED.secteur,
            extra           = EXCLUDED.extra,
            updated_at      = %(now)s
    """, {**PROFILE, "id": profile_id, "org_id": org_id, "extra": extra_json, "now": now})

    print("Company profile upserted.")

    # Seed staff CVs
    cur.execute("SELECT COUNT(*) FROM staff_cvs WHERE org_id = %s", (org_id,))
    existing = cur.fetchone()[0]
    if existing > 0:
        print(f"Staff CVs already exist ({existing} entries) — skipping staff seed.")
    else:
        for s in STAFF:
            cur.execute("""
                INSERT INTO staff_cvs (
                    id, org_id, nom, prenom, poste, specialite, diplome,
                    annees_experience, actif, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
            """, (
                str(uuid.uuid4()), org_id, s["nom"], s["prenom"], s["poste"],
                s["specialite"], s["diplome"], s["annees_experience"],
                now, now,
            ))
        print(f"Seeded {len(STAFF)} staff CVs.")

    conn.commit()
    cur.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
