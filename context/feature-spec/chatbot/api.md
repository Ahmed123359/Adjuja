# Chatbot knowledge base -- api.md

Read `00-overview.md` in this folder and `context/architecture-context.md` before
starting.

## Decisions locked before coding (confirmed with user, 2026-08-18/19)

- No new `rag-etl` microservice. It was scaffolded (`app/api/routes/rag_routes.py`
  proxies `POST /rag/index` to `RAG_ETL_URL`, which defaults empty and does not
  correspond to any service in either docker-compose file) but never built, for a
  reason that no longer applies here: the corpus is exactly 3 documents, not a
  growing folder needing continuous automated indexing. A one-off script is the
  right size for this. Reconsider only if the corpus becomes a real ongoing pipeline
  (more decrees, circulaires, recurring updates).
- Everything indexes into the existing shared collection `offria_kb` (module
  constant `_COLLECTION` in `rag_service.py`), not a new collection and not the
  per-org `offria_kb_{org_id}` collections `index_document()` already writes to.
  Procurement law and platform documentation are identical for every org.
- Chunk by structural boundary, not paragraph. `index_document()`'s existing
  paragraph-splitter (`text.split("\n\n")`) is fine for freeform company docs, wrong
  for law and for the platform guide: a chunk must be a complete Article (legal
  citability, "selon l'Article 25...") or a complete `##` feature section.
- One RAG pipeline for both procurement law and "help understand ADJUJA," not
  RAG-for-law plus a separately-maintained static system-prompt block. User's own
  framing: "the assistant should know what every detail in the platform is."

## Bug found, not invented: two disconnected RAG paths

`RagService.index_document()` (called from `company_documents_routes.py`,
`staff_cvs_routes.py`, `ao_tasks.py`) writes into `offria_kb_{org_id}`.
`RagService.retrieve_for_section()` / `retrieve_for_ot_section()` (used by offer
generation, and by `ChatService._retrieve_rag` today) read from `offria_kb`, no
org suffix. Nothing written via the first path is ever reachable through the
second. Confirmed by reading both methods directly, not assumed. Out of scope to
reconcile properly in this pass -- company-doc indexing already works for its own
purpose (offer generation reads real company docs today, that part is not broken).
Left as a note for whoever next touches `index_document()`.

## `ChatService._retrieve_rag` is also wrong today, separately

`chat_service.py` calls `retrieve_for_section(section_title="References
similaires", ao_context=question)`, which filters to `doc_type=["references"]`
only -- a filter designed for offer generation's "references similaires" section,
meaningless for open conversational Q&A. Once `reglementation`/`plateforme`
content is indexed, this call would never surface it: wrong filter, not missing
data.

**Fix**: new method on `RagService`, no section-based filter:

```python
async def retrieve_for_chat(self, question: str) -> tuple[str, list[str]]:
    """Unfiltered top-k search across all doc_types. Vector similarity alone decides
    relevance -- a law question naturally scores high against reglementation chunks,
    a "nos certifications" question against certifications chunks, no hardcoded
    category needed."""
    if not self.is_ready:
        return "", []
    vector = await self._embed(question)
    results = await self._client.search(
        collection_name=_COLLECTION,
        query_vector=vector,
        limit=_N_CANDIDATES,
        with_payload=True,
    )
    if not results:
        return "", []
    results = self._rerank(results, _RERANK_TOP_K)
    lines = ["---", "## CONTEXTE DOCUMENTAIRE", ""]
    sources = []
    for r in results:
        payload = r.payload or {}
        label = DOCUMENT_TYPES.get(payload.get("doc_type", ""), "")
        doc_name = payload.get("doc_name", "")
        sources.append(f"{label}  {doc_name}" if label else doc_name)
        lines.append(f"**[{label}  {doc_name}]**")
        lines.append(payload.get("content", ""))
        lines.append("")
    return "\n".join(lines), sources
```

`chat_service.py::_retrieve_rag` becomes a one-line call to this instead of
`retrieve_for_section("References similaires", ...)`. No `query_filter` argument
to `_client.search` (versus `retrieve_for_section`'s `Filter(should=[...])`), that
is the entire fix.

## `DOCUMENT_TYPES` additions

`rag_service.py`, extend the existing dict:

```python
DOCUMENT_TYPES: dict[str, str] = {
    "references":     "References et realisations",
    "templates":       "Modeles de reponses AO",
    "certifications": "Certifications et qualifications",
    "company":        "Presentation entreprise",
    "resources":      "Moyens humains et materiels",
    "reglementation": "Reglementation des marches publics",   # new
    "plateforme":     "Guide de la plateforme ADJUJA",         # new
}
```

No change to `_SECTION_TYPE_MAP`/`_OT_SECTION_TYPE_MAP` -- offer generation does not
need to pull regulatory text or platform-help content into a note methodologique
section.

## Ingestion script

New file at repo root, `ingest_knowledge_base.py`, same placement precedent as the
existing `seed_company_profile.py` (one-off, run manually, not a route, not a
Celery task, not part of any container's default command, per
`code-standards.md`'s file-organization rule for maintenance scripts).

```python
"""
Run once (and again whenever a source document changes):
    python ingest_knowledge_base.py

Requires QDRANT_URL and MISTRAL_API_KEY in the environment (same RagService
config as the running app). Requires tesseract-ocr-fra + poppler-utils, both
already in the app's Docker image -- run inside the api container if those
aren't installed on the host:
    docker compose exec api python ingest_knowledge_base.py
"""
import re
import docx
import pytesseract
from pdf2image import convert_from_path

from app.services.rag_service import RagService
from app.config.settings import get_settings

ARTICLE_BOUNDARY = re.compile(r"(?=ARTICLE\s+\d+|Article\s+(?:\d+|premier)\s*:?)")


def extract_decree_pdf(path: str) -> str:
    """decret_des_marches_publics: vector-drawn text, 0 chars via normal PDF text
    extraction (confirmed: PyMuPDF get_text() returns empty, get_drawings() returns
    ~1100 paths/page -- every glyph is a curve, not a text object or a raster scan).
    Render each page to an image and OCR it, same tool chain already used for
    scanned-page detection in app/services/filler/filler_page_detector.py."""
    images = convert_from_path(path, dpi=200)
    return "\n\n".join(pytesseract.image_to_string(img, lang="fra") for img in images)


def extract_docx(path: str) -> str:
    d = docx.Document(path)
    return "\n\n".join(p.text for p in d.paragraphs if p.text.strip())


def chunk_by_article(text: str, doc_name: str) -> list[tuple[str, str]]:
    """OCR text is noisy (accents, line breaks mid-word), best-effort split --
    verify chunk count against the real article count after running, not assumed
    correct (14 for interets moratoires, ~110+ across the decree's chapters)."""
    parts = [p.strip() for p in ARTICLE_BOUNDARY.split(text) if len(p.strip()) > 50]
    return [(p, doc_name) for p in parts]


def chunk_by_heading(text: str, doc_name: str) -> list[tuple[str, str]]:
    """guide_plateforme_adjuja.md: split on '## ' headings, one chunk per feature
    section, matches how the file was deliberately written."""
    parts = re.split(r"(?=^## )", text, flags=re.MULTILINE)
    return [(p.strip(), doc_name) for p in parts if len(p.strip()) > 50]


async def main():
    settings = get_settings()
    rag = RagService(qdrant_url=settings.qdrant_url, mistral_api_key=settings.mistral_api_key)

    sources = [
        ("hafid-taches-docs/chatbot/decret_des_marches_publics_version_francais.pdf",
         extract_decree_pdf, chunk_by_article,
         "Decret n2-22-431 relatif aux marches publics", "reglementation"),
        ("hafid-taches-docs/chatbot/2-16-344+interets+moratoires.pdf.docx",
         extract_docx, chunk_by_article,
         "Decret n2-16-344, delais de paiement et interets moratoires", "reglementation"),
        ("hafid-taches-docs/chatbot/guide_plateforme_adjuja.md",
         lambda p: open(p, encoding="utf-8").read(), chunk_by_heading,
         "Guide de la plateforme ADJUJA", "plateforme"),
    ]

    for path, extract, chunker, doc_name, doc_type in sources:
        chunks = chunker(extract(path), doc_name)
        print(f"{doc_name}: {len(chunks)} chunks")
        for i, (chunk_text, _) in enumerate(chunks):
            await rag.index_document(
                org_id="global",  # placeholder, see Open Questions
                text=chunk_text,
                metadata={"doc_name": doc_name, "doc_type": doc_type},
                doc_id=f"{doc_type}_{i}",
            )
```

**This script does not compile as-is against `index_document()`'s real signature**:
`index_document()` always writes to `offria_kb_{org_id}`, hardcodes
`doc_type="note_metho"` in its payload, and chunks by blank-line paragraph
internally -- none of which fit this feature's Decisions above (global `offria_kb`,
real `doc_type`, pre-chunked input). Two real options, not resolved here:

1. Add a `collection_override`/`doc_type_override` parameter to `index_document()`
   so this script can reuse it, accepting its internal paragraph-chunker still runs
   (harmless given one already-chunked article/section as input).
2. Write a small standalone indexing helper in the ingestion script itself (embed +
   upsert directly against `self._client`, bypassing `index_document()` entirely),
   since this script's needs diverge enough from `index_document()`'s actual
   contract that reusing it may cause more confusion than it saves.

Flagged rather than silently picked -- see Open Questions.

## Routes

None new. `GET /api/v1/rag/status` and `POST /api/v1/chat` already exist and are
sufficient once the above is fixed.

## Check when done

- `RagService.retrieve_for_chat("quel est le delai de paiement ?")` returns a
  non-empty context block once the decree is indexed.
- `chat_service.py` no longer calls `retrieve_for_section("References
  similaires", ...)`.
- The ingestion script, run once, prints a non-zero chunk count for all three
  sources.

## Open Questions

- `index_document()` reuse vs. standalone indexing in the ingestion script: not
  decided, see above. Whoever implements this picks one and notes why in
  `progress-tracker.md`, does not silently patch around the mismatch.
- Article-boundary regex chunking on OCR'd text is a best-effort, not a guaranteed-
  correct split (OCR noise, multi-line article headers, footnote markers like the
  `(1)` seen in the interets-moratoires document). Verify actual chunk count and
  spot-check a few chunks' content after running the script.
- `org_id="global"` placeholder in the script sketch above depends on Open
  Question 1's resolution -- not a real value to ship as-is.
- OCR quality on the 88-page decree at 200 DPI is unverified past page 0 (only
  page 0 was visually confirmed legible this session). Spot-check several pages
  across the document before trusting the extracted text, per
  `context/ai-workflow-rules.md`'s "verify in real conditions" discipline.
