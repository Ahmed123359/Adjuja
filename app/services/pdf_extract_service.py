import base64
import logging
import fitz  # pymupdf
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# Un PDF est considéré scanné si le texte embarqué est inférieur à ce seuil moyen.
_SCAN_THRESHOLD_CHARS_PER_PAGE = 50
# Résolution de rendu pour les PDFs scannés (DPI). 150 = bon compromis qualité/taille.
_RENDER_DPI = 150


class PdfExtractResult:
    def __init__(self, text: str, method: str, pages: int, is_scanned: bool):
        self.text       = text
        self.method     = method
        self.pages      = pages
        self.is_scanned = is_scanned


class PdfExtractService:
    """
    Extrait le texte d'un AO au format PDF en deux phases :

    Phase 1 — pymupdf :
        Tente d'extraire le texte embarqué directement.
        Rapide, 0 token LLM consommé.
        Couvre ~95% des AOs (vrais PDFs avec texte).

    Phase 2 — OpenAI GPT-4o vision (fallback) :
        Activée si le PDF est scanné (texte embarqué < 50 car/page en moyenne).
        Rend chaque page en PNG (150 DPI) puis envoie à GPT-4o vision pour transcription.
    """

    def __init__(self, openai_api_key: str):
        self._openai_key = openai_api_key

    async def extract(self, pdf_bytes: bytes) -> PdfExtractResult:
        """
        Point d'entrée principal.

        Args:
            pdf_bytes: Contenu brut du fichier PDF.

        Returns:
            PdfExtractResult avec le texte extrait et les métadonnées.

        Raises:
            ValueError: Si le PDF est scanné mais qu'aucune clé OpenAI n'est disponible.
            RuntimeError: Si pymupdf ne peut pas ouvrir le fichier.
        """
        # Phase 1 : extraction texte embarqué
        text, n_pages, avg_chars = self._extract_embedded(pdf_bytes)
        is_scanned = avg_chars < _SCAN_THRESHOLD_CHARS_PER_PAGE

        logger.info(
            "PDF reçu — pages=%d avg_chars/page=%.0f scanned=%s",
            n_pages, avg_chars, is_scanned,
        )

        if not is_scanned:
            return PdfExtractResult(
                text=text, method="pymupdf", pages=n_pages, is_scanned=False,
            )

        # Phase 2 : OCR via GPT-4o vision
        if not self._openai_key:
            raise ValueError(
                "PDF scanné détecté mais OPENAI_API_KEY est manquante. "
                "Configurez la clé dans votre .env pour activer l'OCR."
            )

        logger.info("PDF scanné → fallback GPT-4o vision")
        images    = self._render_pages(pdf_bytes)
        ocr_text  = await self._ocr_with_gpt4o(images)

        return PdfExtractResult(
            text=ocr_text, method="gpt4o_vision", pages=n_pages, is_scanned=True,
        )

    # ── Helpers privés ────────────────────────────────────────────────────

    def _extract_embedded(self, pdf_bytes: bytes) -> tuple[str, int, float]:
        """Extrait le texte embarqué via pymupdf. Retourne (texte, nb_pages, avg_chars/page)."""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_text = [page.get_text("text") for page in doc]
        n_pages    = len(doc)
        doc.close()

        full_text = "\n\n".join(pages_text)
        avg_chars = len(full_text.strip()) / n_pages if n_pages > 0 else 0
        return full_text, n_pages, avg_chars

    def _render_pages(self, pdf_bytes: bytes) -> list[bytes]:
        """Rend chaque page du PDF en PNG bytes à _RENDER_DPI."""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        mat = fitz.Matrix(_RENDER_DPI / 72, _RENDER_DPI / 72)
        images = [
            page.get_pixmap(matrix=mat, colorspace=fitz.csRGB).tobytes("png")
            for page in doc
        ]
        doc.close()
        return images

    async def _ocr_with_gpt4o(self, page_images: list[bytes]) -> str:
        """Envoie les pages PNG à GPT-4o vision et retourne le texte transcrit."""
        client = AsyncOpenAI(api_key=self._openai_key)

        content: list[dict] = []
        for i, img_bytes in enumerate(page_images, start=1):
            b64 = base64.standard_b64encode(img_bytes).decode()
            content.append({"type": "text", "text": f"--- Page {i} ---"})
            content.append({
                "type":      "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"},
            })

        content.append({
            "type": "text",
            "text": (
                "Extrais tout le texte de ces pages de document officiel (appel d'offres), "
                "en conservant fidèlement la structure : titres, numérotation, listes, tableaux. "
                "Ne résume pas, retranscris intégralement."
            ),
        })

        response = await client.chat.completions.create(
            model="gpt-4o",
            max_tokens=4096,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an OCR (Optical Character Recognition) assistant. "
                        "Your sole task is to accurately transcribe all visible text from document images. "
                        "Always transcribe the full text exactly as it appears, preserving structure, "
                        "numbering, and formatting. Never summarize or refuse — just transcribe."
                    ),
                },
                {"role": "user", "content": content},
            ],
        )

        return response.choices[0].message.content or ""
