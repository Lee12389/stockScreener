from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', case_sensitive=False)

    app_name: str = Field(default='Angel One AutoTrader', alias='APP_NAME')
    app_env: str = Field(default='dev', alias='APP_ENV')
    host: str = Field(default='127.0.0.1', alias='HOST')
    port: int = Field(default=8000, alias='PORT')
    secret_key: str = Field(default='change-me', alias='SECRET_KEY')

    allow_live_trades: bool = Field(default=False, alias='ALLOW_LIVE_TRADES')
    default_mode: str = Field(default='paper', alias='DEFAULT_MODE')
    max_order_qty: int = Field(default=5, alias='MAX_ORDER_QTY')
    max_daily_trades: int = Field(default=15, alias='MAX_DAILY_TRADES')

    top_n: int = Field(default=10, alias='TOP_N')
    buy_threshold: float = Field(default=2.0, alias='BUY_THRESHOLD')
    sell_threshold: float = Field(default=-2.0, alias='SELL_THRESHOLD')

    angel_api_key: str = Field(default='', alias='ANGEL_API_KEY')
    angel_client_code: str = Field(default='', alias='ANGEL_CLIENT_CODE')
    angel_pin: str = Field(default='', alias='ANGEL_PIN')
    angel_totp_secret: str = Field(default='', alias='ANGEL_TOTP_SECRET')

    watchlist: str = Field(default='SBIN-EQ,RELIANCE-EQ,INFY-EQ', alias='WATCHLIST')

    @property
    def watchlist_symbols(self) -> List[str]:
        return [s.strip() for s in self.watchlist.split(',') if s.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
