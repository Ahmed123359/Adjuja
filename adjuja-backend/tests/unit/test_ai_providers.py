"""Couche de fournisseurs IA : roles, DeepSeek, mode JSON, embeddings.
Spec : context/feature-spec/fournisseurs-ia/00-overview.md. Aucun appel reseau :
les clients des SDK sont remplaces par des doublures qui enregistrent la requete."""

import asyncio
from types import SimpleNamespace

import pytest

from app.config.settings import Settings
from app.providers import embeddings as emb
from app.providers import router
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.deepseek_provider import DeepSeekProvider
from app.providers.mistral_provider import MistralProvider


def _run(coro):
    return asyncio.run(coro)


class _FauxCompletions:
    def __init__(self):
        self.appels = []

    def create(self, **kwargs):
        self.appels.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok": true}'))],
            usage=SimpleNamespace(total_tokens=42),
        )


# ── Roles ───────────────────────────────────────────────────────────────────

def test_parse_role():
    assert router.parse_role("deepseek:deepseek-chat") == router.RoleSpec("deepseek", "deepseek-chat")
    assert router.parse_role(" OpenAI ") == router.RoleSpec("openai", "")
    with pytest.raises(ValueError):
        router.parse_role("")


def test_fournisseur_inconnu_message_clair():
    with pytest.raises(ValueError, match="inconnu"):
        router.api_key_for("fournisseur-imaginaire", Settings())


def test_defauts_inchanges_mistral_partout():
    s = Settings(mistral_api_key="m")
    assert isinstance(router.get_chat("analysis", s), MistralProvider)
    assert router.get_chat("analysis", s).current_model == "mistral-large-latest"
    assert router.get_chat("fast", s).current_model == "mistral-small-latest"
    assert isinstance(router.get_embeddings(s), emb.MistralEmbeddingProvider)


def test_bascule_deepseek_par_une_ligne():
    s = Settings(llm_analysis="deepseek:deepseek-chat", deepseek_api_key="d")
    p = router.get_chat("analysis", s)
    assert isinstance(p, DeepSeekProvider)
    assert p.current_model == "deepseek-chat"
    assert str(p._client.base_url).rstrip("/") == "https://api.deepseek.com"


def test_modele_omis_prend_le_defaut_du_fournisseur():
    s = Settings(llm_fast="deepseek", deepseek_api_key="d")
    assert router.get_chat("fast", s).current_model == "deepseek-chat"


# ── Mode JSON ───────────────────────────────────────────────────────────────

def test_deepseek_requete_json_bien_formee():
    p = DeepSeekProvider(api_key="d", model_name="deepseek-chat")
    faux = _FauxCompletions()
    p._client = SimpleNamespace(chat=SimpleNamespace(completions=faux))
    texte, tokens = _run(p.generate_text("sys json", "user", 500, 0.1, json_mode=True))
    appel = faux.appels[0]
    assert texte == '{"ok": true}' and tokens == 42
    assert appel["model"] == "deepseek-chat"
    assert appel["response_format"] == {"type": "json_object"}
    assert appel["messages"][0] == {"role": "system", "content": "sys json"}


def test_sans_json_mode_aucun_response_format():
    p = DeepSeekProvider(api_key="d")
    faux = _FauxCompletions()
    p._client = SimpleNamespace(chat=SimpleNamespace(completions=faux))
    _run(p.generate_text("s", "u", 100, 0.5))
    assert "response_format" not in faux.appels[0]


def test_anthropic_json_mode_par_consigne():
    p = AnthropicProvider(api_key="a", model_name="claude-x")
    recu = {}

    def create(**kwargs):
        recu.update(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(text="{}")],
                               usage=SimpleNamespace(input_tokens=1, output_tokens=1))

    p._client = SimpleNamespace(messages=SimpleNamespace(create=create))
    _run(p.generate_text("sys", "u", 100, 0.1, json_mode=True))
    assert "JSON" in recu["system"]


# ── Embeddings ──────────────────────────────────────────────────────────────

def test_embeddings_openai_demande_1024_dimensions(monkeypatch):
    recu = {}

    class _FauxAsyncOpenAI:
        def __init__(self, api_key):
            self.embeddings = self

        async def create(self, **kwargs):
            recu.update(kwargs)
            return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 1024) for _ in kwargs["input"]])

    import openai
    monkeypatch.setattr(openai, "AsyncOpenAI", _FauxAsyncOpenAI)
    s = Settings(embeddings="openai:text-embedding-3-small", openai_api_key="o")
    e = router.get_embeddings(s)
    vecs = _run(e.embed(["a", "b"]))
    assert recu["model"] == "text-embedding-3-small" and recu["dimensions"] == 1024
    assert len(vecs) == 2 and e.dimensions == 1024


def test_rag_sans_cle_d_embeddings_n_est_pas_pret():
    from app.services.rag_service import RagService
    e = emb.OpenAIEmbeddingProvider(api_key="", model_name="", dimensions=1024)
    assert RagService(qdrant_url="http://qdrant:6333", embedder=e).is_ready is False


def test_vision_openai_par_defaut_gpt41_mini():
    s = Settings(vision="openai", openai_api_key="o")
    assert router.get_vision(s).provider_name == "openai"
    assert router.get_vision(s)._model_name == "gpt-4.1-mini"


# ── Cible GPT (decision du 2026-09-27 : « tout sur GPT ») ────────────────────

def test_cible_gpt_tous_les_roles():
    from app.providers.openai_provider import OpenAIProvider
    s = Settings(
        llm_analysis="openai:gpt-4.1", llm_fast="openai:gpt-4.1-mini",
        embeddings="openai:text-embedding-3-small", vision="openai:gpt-4.1-mini",
        openai_api_key="o",
    )
    assert isinstance(router.get_chat("analysis", s), OpenAIProvider)
    assert router.get_chat("analysis", s).current_model == "gpt-4.1"
    assert router.get_chat("fast", s).current_model == "gpt-4.1-mini"
    assert isinstance(router.get_embeddings(s), emb.OpenAIEmbeddingProvider)
    assert router.get_vision(s)._model_name == "gpt-4.1-mini"


def test_gpt41_requete_json_avec_temperature():
    from app.providers.openai_provider import OpenAIProvider
    p = OpenAIProvider(api_key="o", model_name="gpt-4.1")
    faux = _FauxCompletions()
    p._client = SimpleNamespace(chat=SimpleNamespace(completions=faux))
    _run(p.generate_text("sys json", "u", 8000, 0.1, json_mode=True))
    a = faux.appels[0]
    assert a["model"] == "gpt-4.1" and a["max_tokens"] == 8000 and a["temperature"] == 0.1
    assert a["response_format"] == {"type": "json_object"}


def test_modele_raisonnement_gpt5_sans_temperature():
    from app.providers.openai_provider import OpenAIProvider
    p = OpenAIProvider(api_key="o", model_name="gpt-5-mini")
    faux = _FauxCompletions()
    p._client = SimpleNamespace(chat=SimpleNamespace(completions=faux))
    _run(p.generate_text("sys json", "u", 3000, 0.1, json_mode=True))
    a = faux.appels[0]
    assert a["max_completion_tokens"] == 3000
    assert "temperature" not in a and "max_tokens" not in a
    assert a["response_format"] == {"type": "json_object"}
