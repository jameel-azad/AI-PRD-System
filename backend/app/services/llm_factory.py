
from app.core.config import settings


def get_llm(temperature: float = 0.3):
    """Return a LangChain chat model configured via settings.LANGGRAPH_LLM."""
    provider = settings.LANGGRAPH_LLM.lower()

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.OPENAI_CHAT_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=temperature,
        )

    if provider == "claude":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=settings.ANTHROPIC_MODEL,
            api_key=settings.ANTHROPIC_API_KEY,
            temperature=temperature,
        )

    # Gemini — commented out, switch LANGGRAPH_LLM to "openai" or "claude"
    # if provider == "gemini":
    #     from langchain_google_genai import ChatGoogleGenerativeAI
    #     return ChatGoogleGenerativeAI(
    #         model=settings.GEMINI_MODEL,
    #         google_api_key=settings.GEMINI_API_KEY,
    #         temperature=temperature,
    #     )

    raise ValueError(
        f"Unknown LANGGRAPH_LLM provider '{provider}'. "
        "Set LANGGRAPH_LLM to 'openai' or 'claude' in .env."
    )
