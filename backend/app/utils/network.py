"""
Shared network-security utilities.

Provides SSRF validation for any feature that connects to user-supplied URLs
(webhooks, IMAP hosts, OAuth callbacks, etc.).
"""
import ipaddress
import logging
import socket
from typing import Optional, Set
from urllib.parse import urlparse

from fastapi import HTTPException

logger = logging.getLogger(__name__)

_DEFAULT_ALLOWED_SCHEMES = {"https", "http"}


def validate_url_no_ssrf(
    url: str,
    *,
    allowed_ports: Optional[Set[int]] = None,
    allowed_schemes: Optional[Set[int]] = None,
    label: str = "URL",
) -> None:
    """
    Validate that *url* does not point to an internal / private network address.

    Resolves the hostname via DNS and checks every returned IP against a
    blocklist (private, reserved, loopback, link-local, multicast,
    unspecified).  This guards against SSRF in features that make outbound
    connections to user-supplied destinations.

    Args:
        url:             The URL to validate.
        allowed_ports:   Optional set of allowed TCP ports.  ``None`` = any port.
        allowed_schemes: Optional set of allowed schemes.  Defaults to ``{"https", "http"}``.
        label:           Human-readable label used in error messages (e.g. "Webhook-URL").

    Raises:
        HTTPException(400) on validation failure.
    """
    schemes = allowed_schemes or _DEFAULT_ALLOWED_SCHEMES

    # --- Parse URL ---
    parsed = urlparse(url)

    if parsed.scheme not in schemes:
        raise HTTPException(
            status_code=400,
            detail=f"{label}: Schema '{parsed.scheme}' nicht erlaubt. Erlaubt: {sorted(schemes)}",
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(
            status_code=400,
            detail=f"{label}: Hostname fehlt.",
        )

    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    if allowed_ports is not None and port not in allowed_ports:
        raise HTTPException(
            status_code=400,
            detail=f"{label}: Port {port} nicht erlaubt. Erlaubt: {sorted(allowed_ports)}",
        )

    # --- DNS resolution: check *all* returned IPs ---
    try:
        addr_infos = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise HTTPException(
            status_code=400,
            detail=f"{label}: Hostname konnte nicht aufgelöst werden: {hostname}",
        )

    if not addr_infos:
        raise HTTPException(
            status_code=400,
            detail=f"{label}: Keine DNS-Ergebnisse für Hostname: {hostname}",
        )

    for _family, _type, _proto, _canonname, sockaddr in addr_infos:
        ip = ipaddress.ip_address(sockaddr[0])

        if (
            ip.is_private
            or ip.is_reserved
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_unspecified
        ):
            logger.warning(
                "SSRF blocked | label=%s | url=%s | resolved_ip=%s",
                label,
                url,
                ip,
            )
            raise HTTPException(
                status_code=400,
                detail=f"{label}: Verbindung zu internen/privaten Adressen ist nicht erlaubt.",
            )


def validate_host_no_ssrf(
    host: str,
    port: int,
    *,
    allowed_ports: Optional[Set[int]] = None,
    label: str = "Host",
) -> None:
    """
    Validate a bare *host:port* pair (no scheme).

    Convenience wrapper around :func:`validate_url_no_ssrf` for protocols
    like IMAP where you have host + port instead of a full URL.
    """
    if allowed_ports is not None and port not in allowed_ports:
        raise HTTPException(
            status_code=400,
            detail=f"{label}: Port {port} nicht erlaubt. Erlaubt: {sorted(allowed_ports)}",
        )

    # Build a synthetic URL so we can reuse the DNS-resolution logic.
    # Scheme doesn't matter here — we only need the hostname resolved.
    synthetic_url = f"https://{host}:{port}/"
    validate_url_no_ssrf(
        synthetic_url,
        allowed_ports={port} if allowed_ports is None else allowed_ports,
        label=label,
    )
