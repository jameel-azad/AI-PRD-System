from app.core.config import settings


def get_llm(temperature: float = 0.0):
    """Return a LangChain chat model configured via settings.LANGGRAPH_LLM."""
    provider = settings.LANGGRAPH_LLM.lower()
    if provider == "claude":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=settings.ANTHROPIC_MODEL,
            api_key=settings.ANTHROPIC_API_KEY,
            temperature=temperature,
        )
    # default: gemini
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        model=settings.GEMINI_MODEL,
        google_api_key=settings.GEMINI_API_KEY,
        temperature=temperature,
    )
