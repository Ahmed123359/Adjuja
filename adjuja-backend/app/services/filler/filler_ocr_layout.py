"""
Lecture Tesseract avec mise en page, palier 2 du remplissage (2026-09-27).

Spec : context/feature-spec/fournisseurs-ia/ (remplissage par paliers).

Le texte brut de Tesseract melangeait les colonnes et perdait la structure :
d'ou les mauvais resultats du remplissage par OCR. Ici on demande a Tesseract
sa sortie TSV (un mot par ligne, avec son bloc, son paragraphe, sa ligne et
sa confiance) et on reconstruit la page bloc par bloc : un paragraphe par
bloc visuel, les retours a la ligne conserves. Les pointilles et soulignes des
champs a remplir restent visibles, ce dont le modele a besoin.

La confiance moyenne des mots sert de garde : en dessous du seuil, le scan est
juge trop mauvais pour ce palier et la page part au modele de vision.
"""

from __future__ import annotations

import csv
import io
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

LANGUE = "fra"
TIMEOUT_PAGE_S = 120
PARALLELE = max(1, min(4, (os.cpu_count() or 2) - 1))

# Seuils du palier 2. En dessous, lecture par le modele de vision (palier 3).
CONFIANCE_MIN = 70.0
MOTS_MIN = 40


@dataclass
class LectureOcr:
    texte: str
    confiance: float   # moyenne des mots reconnus, 0-100
    mots: int

    @property
    def fiable(self) -> bool:
        return self.mots >= MOTS_MIN and self.confiance >= CONFIANCE_MIN


def _tsv(png: bytes) -> list[dict[str, str]]:
    env = {**os.environ, "OMP_THREAD_LIMIT": "1"}
    res = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", LANGUE, "--psm", "3", "tsv"],
        input=png, capture_output=True, timeout=TIMEOUT_PAGE_S, env=env, check=False,
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode("utf-8", "replace")[:300])
    lecteur = csv.DictReader(io.StringIO(res.stdout.decode("utf-8", "replace")), delimiter="\t",
                             quoting=csv.QUOTE_NONE)
    return list(lecteur)


def reconstruire_page(lignes_tsv: list[dict[str, str]]) -> tuple[str, list[float]]:
    """Texte de la page, un paragraphe par bloc/paragraphe Tesseract, et la
    liste des confiances des mots. Fonction pure (testee)."""
    paragraphes: dict[tuple[int, int], dict[int, list[str]]] = {}
    confiances: list[float] = []
    for l in lignes_tsv:
        mot = (l.get("text") or "").strip()
        if not mot or l.get("level") != "5":
            continue
        try:
            conf = float(l.get("conf", "-1"))
        except ValueError:
            conf = -1
        if conf >= 0:
            confiances.append(conf)
        cle = (int(l["block_num"]), int(l["par_num"]))
        paragraphes.setdefault(cle, {}).setdefault(int(l["line_num"]), []).append(mot)
    blocs = []
    for cle in sorted(paragraphes):
        lignes = paragraphes[cle]
        blocs.append("\n".join(" ".join(lignes[n]) for n in sorted(lignes)))
    return "\n\n".join(blocs), confiances


def lire_pages(images: list[Any]) -> LectureOcr:
    """Images PIL -> texte structure et confiance moyenne."""
    def une(img: Any) -> tuple[str, list[float]]:
        buf = io.BytesIO()
        img.convert("L").save(buf, format="PNG")
        return reconstruire_page(_tsv(buf.getvalue()))

    with ThreadPoolExecutor(max_workers=PARALLELE) as pool:
        pages = list(pool.map(une, images))
    confs = [c for _, cs in pages for c in cs]
    texte = "\n\n".join(f"--- page {i} ---\n{t}" for i, (t, _) in enumerate(pages, 1))
    return LectureOcr(texte=texte, confiance=(sum(confs) / len(confs)) if confs else 0.0, mots=len(confs))
