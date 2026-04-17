from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # --- Elasticsearch ---
    ELASTIC_HOST: str = "localhost"
    ELASTIC_PORT: int = 9200
    @property
    def ELASTIC_URL(self) -> str:
        return f"http://{self.ELASTIC_HOST}:{self.ELASTIC_PORT}"

    # --- Redis ---
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    
    # SMTP (Brevo)
    MAIL_USERNAME: str = "a71bbb001@smtp-brevo.com"
    MAIL_PASSWORD: str = "bskb1rTNoOlMq6s"
    MAIL_FROM: str = "a71bbb001@smtp-brevo.com"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp-relay.brevo.com"
    MAIL_FROM_NAME: str = "Barbershop App"
    
    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_BUCKET: str = "images"

    # Frontend Settings
    FRONTEND_URL: str = "http://localhost:3000"

    # Gemini (RAG chatbot)
    GEMINI_API_KEY: str = ""
    GEMINI_API_KEY_2: str = ""
    GEMINI_API_KEY_3: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
