"""
PEPPOL-Netzwerk Client für RechnungsWerk.

Sendet und empfängt E-Rechnungen über das PEPPOL-Netzwerk via Access Point (AP).
Voraussetzung: Ein registrierter PEPPOL Access Point Provider (z.B. ecosio, Basware, Storecove).

Dieses Modul ist ein Client-Interface — der tatsächliche PEPPOL-AP wird extern betrieben.
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from enum import Enum

import httpx

logger = logging.getLogger(__name__)


class PEPPOLDocumentType(str, Enum):
    """Unterstützte PEPPOL-Dokumenttypen."""
    INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1"
    CREDIT_NOTE = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1"


@dataclass
class PEPPOLParticipant:
    """PEPPOL-Teilnehmer identifiziert durch Scheme + ID."""
    scheme: str  # z.B. "0088" (EAN/GLN), "0204" (Leitweg-ID DE)
    id: str  # z.B. "4711234567890" oder "991-12345-67"


@dataclass
class PEPPOLMessage:
    """Eine über PEPPOL gesendete/empfangene Nachricht."""
    message_id: str
    sender: PEPPOLParticipant
    receiver: PEPPOLParticipant
    document_type: PEPPOLDocumentType
    xml_content: str
    sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    status: str = "pending"  # pending, sent, delivered, failed
    error: Optional[str] = None


@dataclass
class PEPPOLConfig:
    """Konfiguration für den PEPPOL Access Point."""
    ap_base_url: str = "https://peppol-ap.example.com/api"
    api_key: str = ""
    sender_scheme: str = "0204"  # Leitweg-ID für deutsche Behörden
    sender_id: str = ""
    timeout: int = 30


class PEPPOLClient:
    """
    Client zum Senden und Empfangen von E-Rechnungen über das PEPPOL-Netzwerk.

    Kommuniziert mit einem externen PEPPOL Access Point (AP) via REST API.
    Der AP übernimmt die SMP-Lookup, AS4-Übertragung und Signierung.
    """

    def __init__(self, config: Optional[PEPPOLConfig] = None):
        self.config = config or PEPPOLConfig()
        self._client = httpx.AsyncClient(
            base_url=self.config.ap_base_url,
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/xml",
            },
            timeout=self.config.timeout,
        )

    async def send_invoice(
        self,
        xml_content: str,
        receiver_scheme: str,
        receiver_id: str,
        document_type: PEPPOLDocumentType = PEPPOLDocumentType.INVOICE,
    ) -> PEPPOLMessage:
        """
        Sendet eine E-Rechnung über das PEPPOL-Netzwerk.

        Args:
            xml_content: XRechnung/UBL XML-Inhalt.
            receiver_scheme: PEPPOL Participant Identifier Scheme des Empfängers.
            receiver_id: PEPPOL Participant ID des Empfängers.
            document_type: PEPPOL-Dokumenttyp.

        Returns:
            PEPPOLMessage mit Status-Informationen.
        """
        sender = PEPPOLParticipant(
            scheme=self.config.sender_scheme,
            id=self.config.sender_id,
        )
        receiver = PEPPOLParticipant(scheme=receiver_scheme, id=receiver_id)

        message = PEPPOLMessage(
            message_id="",
            sender=sender,
            receiver=receiver,
            document_type=document_type,
            xml_content=xml_content,
        )

        try:
            response = await self._client.post(
                "/outbox",
                content=xml_content,
                headers={
                    "X-Sender-Scheme": sender.scheme,
                    "X-Sender-ID": sender.id,
                    "X-Receiver-Scheme": receiver.scheme,
                    "X-Receiver-ID": receiver.id,
                    "X-Document-Type": document_type.value,
                },
            )
            response.raise_for_status()

            data = response.json()
            message.message_id = data.get("message_id", "")
            message.status = "sent"
            message.sent_at = datetime.utcnow()

            logger.info(
                "PEPPOL-Nachricht gesendet: %s → %s:%s (ID: %s)",
                sender.id, receiver.scheme, receiver.id, message.message_id,
            )

        except httpx.HTTPStatusError as e:
            message.status = "failed"
            message.error = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            logger.error("PEPPOL-Versand fehlgeschlagen: %s", message.error)

        except httpx.RequestError as e:
            message.status = "failed"
            message.error = f"Verbindungsfehler: {str(e)}"
            logger.error("PEPPOL AP nicht erreichbar: %s", e)

        return message

    async def check_inbox(self) -> list[PEPPOLMessage]:
        """
        Prüft den PEPPOL-Eingang auf neue Rechnungen.

        Returns:
            Liste empfangener PEPPOLMessages.
        """
        messages: list[PEPPOLMessage] = []

        try:
            response = await self._client.get("/inbox")
            response.raise_for_status()

            for item in response.json().get("messages", []):
                msg = PEPPOLMessage(
                    message_id=item.get("id", ""),
                    sender=PEPPOLParticipant(
                        scheme=item.get("sender_scheme", ""),
                        id=item.get("sender_id", ""),
                    ),
                    receiver=PEPPOLParticipant(
                        scheme=self.config.sender_scheme,
                        id=self.config.sender_id,
                    ),
                    document_type=PEPPOLDocumentType.INVOICE,
                    xml_content=item.get("content", ""),
                    received_at=datetime.utcnow(),
                    status="received",
                )
                messages.append(msg)

            logger.info("PEPPOL-Eingang: %d neue Nachrichten", len(messages))

        except httpx.HTTPStatusError as e:
            logger.error("PEPPOL-Eingangs-Abfrage fehlgeschlagen: HTTP %d", e.response.status_code)
        except httpx.RequestError as e:
            logger.error("PEPPOL AP nicht erreichbar: %s", e)

        return messages

    async def lookup_participant(self, scheme: str, participant_id: str) -> dict:
        """
        SMP-Lookup: Prüft ob ein Teilnehmer im PEPPOL-Netzwerk erreichbar ist.

        Returns:
            Dict mit Teilnehmer-Informationen oder leeres Dict.
        """
        try:
            response = await self._client.get(
                "/lookup",
                params={"scheme": scheme, "id": participant_id},
            )
            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError:
            return {}
        except httpx.RequestError:
            return {}

    async def close(self):
        """HTTP-Client schließen."""
        await self._client.aclose()
