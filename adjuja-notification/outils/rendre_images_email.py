"""Rend les images de l'email de veille a partir des textures du site.

Pas de 3D ni d'animation dans un email : on precalcule une vraie projection de
la Terre (texture du heros du site, centree sur le Maroc), avec nuages,
eclairage, atmosphere, lune et etoiles. Resultat servi par le frontend :
  adjuja-frontend/public/email/terre.jpg   (bandeau, 1200 x 520, affiche en 600 x 260)
  adjuja-frontend/public/email/lune.png    (pied de l'email, fond transparent)

Usage : python adjuja-notification/outils/rendre_images_email.py
Relancer seulement si les textures ou la mise en scene changent.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RACINE = Path(__file__).resolve().parents[2]
PUBLIC = RACINE / "adjuja-frontend" / "public"
SORTIE = PUBLIC / "email"

L, H = 1200, 520
FOND_HAUT = np.array([10, 16, 48], dtype=float)    # = panneau de l'email (#0A1030) : raccord invisible
FOND_BAS = np.array([5, 8, 24], dtype=float)
LUMIERE = np.array([-0.55, 0.45, 0.70])            # soleil en haut a gauche
LUMIERE /= np.linalg.norm(LUMIERE)


def texture(nom: str) -> np.ndarray:
    return np.asarray(Image.open(PUBLIC / nom).convert("RGB"), dtype=float) / 255


def sphere(taille_px: int, rayon: float, cx: float, cy: float, lat0: float, lon0: float,
           tex: np.ndarray, nuages: np.ndarray | None, largeur: int, hauteur: int):
    """Projection orthographique d'une texture equirectangulaire.
    Retourne (rgb, alpha) sur la toile largeur x hauteur."""
    ys, xs = np.mgrid[0:hauteur, 0:largeur].astype(float)
    x = (xs - cx) / rayon
    y = (cy - ys) / rayon
    r2 = x * x + y * y
    dedans = r2 <= 1.0
    z = np.sqrt(np.clip(1 - r2, 0, 1))

    phi0, lam0 = np.radians(lat0), np.radians(lon0)
    rho = np.sqrt(r2) + 1e-12
    c = np.arcsin(np.clip(rho, 0, 1))
    lat = np.arcsin(np.clip(np.cos(c) * np.sin(phi0) + y * np.sin(c) * np.cos(phi0) / rho, -1, 1))
    lon = lam0 + np.arctan2(x * np.sin(c), rho * np.cos(c) * np.cos(phi0) - y * np.sin(c) * np.sin(phi0))

    th, tw = tex.shape[:2]
    u = ((np.degrees(lon) + 180) % 360) / 360 * (tw - 1)
    v = (90 - np.degrees(lat)) / 180 * (th - 1)
    ui, vi = u.astype(int).clip(0, tw - 1), v.astype(int).clip(0, th - 1)
    couleur = tex[vi, ui]

    if nuages is not None:
        a = nuages[vi, ui].mean(axis=-1, keepdims=True) * 0.85
        couleur = couleur * (1 - a) + a

    normale = np.stack([x, y, z], axis=-1)
    diffuse = np.clip((normale * LUMIERE).sum(-1), 0, 1)
    eclairage = (0.10 + 0.95 * diffuse)[..., None]
    couleur = np.clip(couleur * eclairage, 0, 1)

    alpha = dedans.astype(float)
    return couleur, alpha, z, dedans


def etoiles(fond: np.ndarray, n: int, graine: int) -> np.ndarray:
    rng = np.random.default_rng(graine)
    h, w = fond.shape[:2]
    for _ in range(n):
        yy, xx = rng.integers(0, h), rng.integers(0, w)
        e = rng.uniform(0.25, 1.0)
        fond[yy, xx] = np.maximum(fond[yy, xx], e)
        if e > 0.85 and 1 <= yy < h - 1 and 1 <= xx < w - 1:  # quelques etoiles brillantes
            fond[yy - 1:yy + 2, xx] = np.maximum(fond[yy - 1:yy + 2, xx], e * 0.45)
            fond[yy, xx - 1:xx + 2] = np.maximum(fond[yy, xx - 1:xx + 2], e * 0.45)
    return fond


def bandeau() -> None:
    t = np.linspace(0, 1, H)[:, None, None]
    fond = (FOND_HAUT * (1 - t) + FOND_BAS * t) / 255 * np.ones((H, L, 3))
    fond = etoiles(fond, 420, 7)

    # Terre : grand disque dont seul le haut est visible, comme sur le heros.
    # Vue inclinee (lat0 = -28) pour que le Maroc tombe sur l'arc visible.
    rayon, cx, cy = 1050.0, L * 0.52, H + 700.0
    terre, alpha, z, dedans = sphere(L, rayon, cx, cy, lat0=-28.0, lon0=-7.0,
                                     tex=texture("earth.jpg"), nuages=texture("earth-clouds.jpg"),
                                     largeur=L, hauteur=H)

    # Atmosphere : liseré bleu au bord du disque + halo diffus.
    ys, xs = np.mgrid[0:H, 0:L].astype(float)
    d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / rayon
    bord = np.exp(-((d - 1.0) / 0.012) ** 2)
    halo = np.exp(-np.clip(d - 1.0, 0, None) / 0.035) * (d > 1.0)
    bleu = np.array([0.30, 0.56, 1.0])
    image = fond * (1 - alpha[..., None]) + terre * alpha[..., None]
    # Le limbe s'assombrit (epaisseur d'atmosphere) puis s'eclaire en bleu.
    image = image * (1 - 0.35 * (dedans * (1 - z) ** 3)[..., None])
    image = np.clip(image + bleu * (0.75 * bord + 0.35 * halo)[..., None], 0, 1)

    # Signal sur Rabat : point turquoise (couleur de marque) et ondes, la veille
    # des marches publics marocains vue de l'espace.
    lat_r, lon_r = np.radians(34.02), np.radians(-6.84)
    phi0, lam0 = np.radians(-28.0), np.radians(-7.0)
    px = cx + rayon * np.cos(lat_r) * np.sin(lon_r - lam0)
    py = cy - rayon * (np.cos(phi0) * np.sin(lat_r) - np.sin(phi0) * np.cos(lat_r) * np.cos(lon_r - lam0))
    turquoise = np.array([0.106, 0.788, 0.659])
    dist = np.sqrt((xs - px) ** 2 + (ys - py) ** 2)
    point = np.exp(-(dist / 5.5) ** 2)
    lueur = np.exp(-(dist / 22.0) ** 2) * 0.55
    ondes = sum(np.exp(-((dist - r) / 1.6) ** 2) * (0.55 - 0.13 * i) for i, r in enumerate((20, 36, 54)))
    intensite = np.clip(point + lueur + ondes, 0, 1)[..., None]
    image = image * (1 - intensite) + np.clip(turquoise * 0.35 + intensite * turquoise + point[..., None] * 0.6, 0, 1) * intensite

    # Lune, en haut a droite, eclairee du meme cote que la Terre.
    lune, a_lune, _, _ = sphere(L, 46.0, L * 0.83, 105.0, lat0=5, lon0=20,
                                tex=texture("moon.jpg"), nuages=None, largeur=L, hauteur=H)
    lune = np.clip(lune * np.array([0.93, 0.95, 1.0]) * 1.1, 0, 1)
    image = image * (1 - a_lune[..., None]) + lune * a_lune[..., None]

    # Fondu en bas vers la couleur du panneau : la Terre se dissout dans l'email
    # comme sur le heros du site, au lieu d'une coupure nette.
    fondu = np.clip((np.arange(H) - (H - 150)) / 150, 0, 1)[:, None, None] ** 1.6
    panneau = FOND_HAUT / 255
    image = image * (1 - fondu) + panneau * fondu

    img = Image.fromarray((image * 255).astype(np.uint8))
    # Lissage leger des bords de sphere (le rendu point a point crenele).
    img = img.filter(ImageFilter.SMOOTH)
    SORTIE.mkdir(exist_ok=True)
    img.save(SORTIE / "terre.jpg", quality=86, optimize=True, progressive=True)
    print("terre.jpg", img.size, (SORTIE / "terre.jpg").stat().st_size // 1024, "Ko")


def lune_seule() -> None:
    n = 200
    lune, alpha, _, _ = sphere(n, 92.0, n / 2, n / 2, lat0=5, lon0=20,
                               tex=texture("moon.jpg"), nuages=None, largeur=n, hauteur=n)
    lune = np.clip(lune * np.array([0.93, 0.95, 1.0]) * 1.1, 0, 1)
    rgba = np.dstack([lune, alpha])
    img = Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").filter(ImageFilter.SMOOTH)
    img.save(SORTIE / "lune.png", optimize=True)
    print("lune.png", img.size, (SORTIE / "lune.png").stat().st_size // 1024, "Ko")


if __name__ == "__main__":
    bandeau()
    lune_seule()
