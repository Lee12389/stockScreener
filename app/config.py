from functools import lru_cache
from pathlib import Path
from typing import List

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', case_sensitive=False)

    app_name: str = Field(default='Angel One AutoTrader', alias='APP_NAME')
    app_env: str = Field(default='dev', alias='APP_ENV')
    host: str = Field(default='127.0.0.1', alias='HOST')
    port: int = Field(default=5015, alias='PORT')
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


def _load_defaults_yaml() -> dict:
    cfg_path = Path(__file__).resolve().parents[1] / 'defaults.yaml'
    if not cfg_path.exists():
        return {}

    try:
        with cfg_path.open('r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
            if isinstance(data, dict):
                return data
    except Exception:
        return {}

    return {}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    # Base order: env vars + .env + code defaults
    settings = Settings()

    # Optional fallback from defaults.yaml; only fills missing values.
    yaml_data = _load_defaults_yaml()
    if not yaml_data:
        return settings

    field_alias_pairs = [
        ('app_name', 'APP_NAME'),
        ('app_env', 'APP_ENV'),
        ('host', 'HOST'),
        ('port', 'PORT'),
        ('secret_key', 'SECRET_KEY'),
        ('allow_live_trades', 'ALLOW_LIVE_TRADES'),
        ('default_mode', 'DEFAULT_MODE'),
        ('max_order_qty', 'MAX_ORDER_QTY'),
        ('max_daily_trades', 'MAX_DAILY_TRADES'),
        ('top_n', 'TOP_N'),
        ('buy_threshold', 'BUY_THRESHOLD'),
        ('sell_threshold', 'SELL_THRESHOLD'),
        ('angel_api_key', 'ANGEL_API_KEY'),
        ('angel_client_code', 'ANGEL_CLIENT_CODE'),
        ('angel_pin', 'ANGEL_PIN'),
        ('angel_totp_secret', 'ANGEL_TOTP_SECRET'),
        ('watchlist', 'WATCHLIST'),
    ]

    for field_name, alias in field_alias_pairs:
        current_value = getattr(settings, field_name)
        default_value = Settings.model_fields[field_name].default

        yaml_value = yaml_data.get(alias, yaml_data.get(field_name))
        if yaml_value is None:
            continue

        # Fill only if the current value is still unset/default.
        if current_value == default_value or current_value == '':
            setattr(settings, field_name, yaml_value)

    return settings
