import pytest
from app.providers.provider_factory import ProviderFactory
from app.providers.openai_provider import OpenAIProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.mistral_provider import MistralProvider


class TestProviderFactory:

    def test_create_openai(self):
        provider = ProviderFactory.create("openai", api_key="sk-test", model_name="gpt-4o")
        assert isinstance(provider, OpenAIProvider)
        assert provider.provider_name == "openai"

    def test_create_anthropic(self):
        provider = ProviderFactory.create("anthropic", api_key="sk-ant-test")
        assert isinstance(provider, AnthropicProvider)
        assert provider.provider_name == "anthropic"

    def test_create_mistral(self):
        provider = ProviderFactory.create("mistral", api_key="test-key")
        assert isinstance(provider, MistralProvider)
        assert provider.provider_name == "mistral"

    def test_create_provider_inconnu_leve_erreur(self):
        with pytest.raises(ValueError, match="Provider 'grok' inconnu"):
            ProviderFactory.create("grok", api_key="test")

    def test_get_supported_providers(self):
        providers = ProviderFactory.get_supported_providers()
        assert "openai" in providers
        assert "anthropic" in providers
        assert "mistral" in providers

    def test_get_all_models_retourne_liste(self):
        models = ProviderFactory.get_all_models()
        assert len(models) > 0
        providers_dans_models = {m.provider for m in models}
        assert "openai" in providers_dans_models
        assert "anthropic" in providers_dans_models
        assert "mistral" in providers_dans_models

    def test_chaque_provider_a_un_modele_defaut(self):
        models = ProviderFactory.get_all_models()
        defauts = [m for m in models if m.defaut]
        providers_avec_defaut = {m.provider for m in defauts}
        assert "openai" in providers_avec_defaut
        assert "anthropic" in providers_avec_defaut
        assert "mistral" in providers_avec_defaut
