from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    cors_origins: str = "http://localhost:5173"
    public_app_url: str = "https://vehimacc.vercel.app"
    # Vacía = API abierta. Con valor, /api pide login (ver app/auth.py).
    app_password: str = ""
    auth_secret: str = ""
    auth_token_days: int = 30

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
