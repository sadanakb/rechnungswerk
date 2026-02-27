"""
Centralised rate-limiter instance.

Defined here (not in main.py) to avoid circular imports:
  main.py  ->  routers/auth.py  ->  rate_limiter.py  <-  main.py  (OK)
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
