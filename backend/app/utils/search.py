def sanitize_search(term: str) -> str:
    """Quita lo que rompe un filtro or_() de PostgREST: comas, paréntesis y comodines."""
    cleaned = (
        term.replace(",", " ")
        .replace("(", " ")
        .replace(")", " ")
        .replace("%", "")
        .replace("_", " ")
    )
    return " ".join(cleaned.split())
