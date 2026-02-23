"""
Automatische Rechnungskategorisierung mit KI-Unterstützung.

Verwendet Ollama (qwen2.5:14b) lokal, um Rechnungen nach SKR03/SKR04
Sachkonten zu kategorisieren. Bei Nicht-Verfügbarkeit von Ollama wird
auf ein regelbasiertes Keyword-Matching zurückgegriffen.
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Ollama-Konfiguration
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "qwen2.5:14b"
OLLAMA_GENERATE_URL = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_TIMEOUT = 30.0


# SKR03/SKR04 Kontenrahmen-Mapping für gängige Kategorien
SKR_MAPPING: list[dict] = [
    {
        "category": "Büromaterial",
        "skr03": "4930",
        "skr04": "6815",
        "keywords": [
            "büromaterial", "bürobedarf", "papier", "toner", "druckerpatrone",
            "kugelschreiber", "ordner", "hefter", "stifte", "kopierpapier",
            "briefumschlag", "schreibwaren", "büroartikel",
        ],
    },
    {
        "category": "IT/Software",
        "skr03": "4964",
        "skr04": "6830",
        "keywords": [
            "software", "lizenz", "saas", "cloud", "hosting", "domain",
            "server", "it-service", "datenbank", "programmierung", "app",
            "microsoft", "adobe", "google workspace", "aws", "azure",
            "antivirus", "backup", "it-support", "hardware",
        ],
    },
    {
        "category": "Beratung",
        "skr03": "4900",
        "skr04": "6300",
        "keywords": [
            "beratung", "consulting", "steuerberater", "rechtsanwalt",
            "wirtschaftsprüfer", "unternehmensberatung", "coaching",
            "gutachten", "honorar", "rechtsberatung", "steuerberatung",
            "anwalt", "notar", "kanzlei",
        ],
    },
    {
        "category": "Miete",
        "skr03": "4210",
        "skr04": "6310",
        "keywords": [
            "miete", "mietvertrag", "büromiete", "pacht", "raummiete",
            "gewerbemiete", "nebenkosten", "kaltmiete", "warmmiete",
            "mietnebenkosten", "stellplatz",
        ],
    },
    {
        "category": "Werbung",
        "skr03": "4600",
        "skr04": "6600",
        "keywords": [
            "werbung", "marketing", "anzeige", "flyer", "broschüre",
            "google ads", "facebook ads", "social media", "seo", "sem",
            "werbekampagne", "plakat", "banner", "sponsoring",
            "visitenkarten", "werbemittel", "messe",
        ],
    },
    {
        "category": "Porto",
        "skr03": "4910",
        "skr04": "6800",
        "keywords": [
            "porto", "briefmarke", "versand", "paket", "dhl", "hermes",
            "dpd", "ups", "fedex", "kurier", "postgebühr", "frankierung",
            "einschreiben", "deutsche post",
        ],
    },
    {
        "category": "Telefon/Internet",
        "skr03": "4920",
        "skr04": "6805",
        "keywords": [
            "telefon", "internet", "mobilfunk", "festnetz", "telekom",
            "vodafone", "o2", "1&1", "dsl", "glasfaser", "provider",
            "telefonanlage", "flatrate", "sim-karte", "handy",
        ],
    },
    {
        "category": "Versicherung",
        "skr03": "4360",
        "skr04": "6400",
        "keywords": [
            "versicherung", "haftpflicht", "betriebshaftpflicht",
            "rechtsschutz", "gebäudeversicherung", "inhaltsversicherung",
            "cyberversicherung", "berufshaftpflicht", "kfz-versicherung",
            "prämie", "police", "allianz", "axa", "ergo",
        ],
    },
    {
        "category": "Reisekosten",
        "skr03": "4660",
        "skr04": "6650",
        "keywords": [
            "reisekosten", "hotel", "übernachtung", "flug", "bahn",
            "deutsche bahn", "db ticket", "mietwagen", "taxi",
            "dienstreise", "verpflegungsmehraufwand", "reisekostenabrechnung",
            "parkgebühr", "tankquittung",
        ],
    },
    {
        "category": "Fahrzeugkosten",
        "skr03": "4520",
        "skr04": "6520",
        "keywords": [
            "fahrzeug", "kfz", "tanken", "benzin", "diesel", "werkstatt",
            "inspektion", "tüv", "leasing", "kfz-steuer", "autowäsche",
            "reifen", "ölwechsel", "kfz-reparatur", "autohaus",
        ],
    },
    {
        "category": "Reparaturen",
        "skr03": "4805",
        "skr04": "6470",
        "keywords": [
            "reparatur", "instandhaltung", "wartung", "instandsetzung",
            "renovierung", "handwerker", "sanitär", "elektriker",
            "malerarbeiten", "gebäudeinstandhaltung", "montage",
        ],
    },
    {
        "category": "Wareneingang",
        "skr03": "3400",
        "skr04": "5400",
        "keywords": [
            "wareneingang", "waren", "rohstoffe", "material",
            "handelswaren", "einkauf", "beschaffung", "lieferung",
            "wareneinkauf", "vorräte", "lagerware", "zubehör",
        ],
    },
    {
        "category": "Fremdleistungen",
        "skr03": "3100",
        "skr04": "5900",
        "keywords": [
            "fremdleistung", "subunternehmer", "dienstleistung",
            "outsourcing", "freelancer", "agentur", "auftragsarbeit",
            "werkvertrag", "lohnarbeit", "externe leistung",
        ],
    },
]


class InvoiceCategorizer:
    """Kategorisiert Rechnungen automatisch und ordnet SKR03/SKR04-Konten zu.

    Nutzt primär Ollama (qwen2.5:14b) für die Analyse. Bei Nicht-Verfügbarkeit
    wird ein regelbasierter Keyword-Matching-Algorithmus als Fallback eingesetzt.
    """

    def __init__(
        self,
        ollama_url: str = OLLAMA_GENERATE_URL,
        model: str = OLLAMA_MODEL,
        timeout: float = OLLAMA_TIMEOUT,
    ) -> None:
        """Initialisiert den Kategorisierer.

        Args:
            ollama_url: URL des Ollama-Generate-Endpoints.
            model: Name des Ollama-Modells.
            timeout: Timeout für Ollama-Anfragen in Sekunden.
        """
        self.ollama_url = ollama_url
        self.model = model
        self.timeout = timeout

    # ------------------------------------------------------------------
    # Öffentliche API
    # ------------------------------------------------------------------

    async def categorize(self, invoice_data: dict) -> dict:
        """Kategorisiert eine Rechnung und liefert SKR03/SKR04-Konten.

        Args:
            invoice_data: Dictionary mit Rechnungsfeldern. Erwartet mindestens
                eines der Felder: seller_name, line_items, description.

        Returns:
            Dictionary mit:
                - category (str): Erkannte Kategorie
                - skr03_account (str): SKR03-Kontonummer
                - skr04_account (str): SKR04-Kontonummer
                - confidence (float): Konfidenz 0.0–1.0
                - reasoning (str): Begründung der Zuordnung
        """
        # Beschreibungstext aus verschiedenen Quellen zusammensetzen
        description = self._build_description(invoice_data)
        amount = self._extract_amount(invoice_data)

        # Versuch 1: Ollama KI-Kategorisierung
        try:
            result = await self._categorize_with_ollama(description, amount, invoice_data)
            if result and result.get("category"):
                logger.info(
                    "Ollama-Kategorisierung erfolgreich: %s (Konfidenz: %.2f)",
                    result["category"],
                    result["confidence"],
                )
                return result
        except Exception as exc:
            logger.warning("Ollama nicht verfügbar, Fallback auf Keyword-Matching: %s", exc)

        # Versuch 2: Keyword-basiertes Fallback
        result = self._categorize_by_keywords(description, amount)
        logger.info(
            "Keyword-Kategorisierung: %s (Konfidenz: %.2f)",
            result["category"],
            result["confidence"],
        )
        return result

    async def suggest_accounts(self, description: str, amount: float) -> list[dict]:
        """Schlägt passende Sachkonten für eine Beschreibung vor.

        Args:
            description: Beschreibungstext der Rechnung/Position.
            amount: Rechnungsbetrag (netto).

        Returns:
            Liste von Vorschlägen, sortiert nach Konfidenz (absteigend).
            Jeder Eintrag enthält:
                - category (str)
                - skr03_account (str)
                - skr04_account (str)
                - confidence (float)
                - reasoning (str)
        """
        suggestions: list[dict] = []

        # Versuch über Ollama
        try:
            ollama_result = await self._suggest_with_ollama(description, amount)
            if ollama_result:
                suggestions.extend(ollama_result)
        except Exception as exc:
            logger.warning("Ollama-Vorschläge nicht verfügbar: %s", exc)

        # Keyword-basierte Vorschläge ergänzen
        keyword_suggestions = self._suggest_by_keywords(description, amount)

        # Bereits vorhandene Kategorien nicht doppelt einfügen
        existing_categories = {s["category"] for s in suggestions}
        for kw_suggestion in keyword_suggestions:
            if kw_suggestion["category"] not in existing_categories:
                suggestions.append(kw_suggestion)

        # Nach Konfidenz sortieren
        suggestions.sort(key=lambda x: x["confidence"], reverse=True)

        return suggestions

    # ------------------------------------------------------------------
    # Ollama-Integration
    # ------------------------------------------------------------------

    async def _categorize_with_ollama(
        self,
        description: str,
        amount: float,
        invoice_data: dict,
    ) -> Optional[dict]:
        """Kategorisiert über Ollama mit strukturiertem JSON-Output."""
        categories_info = "\n".join(
            f"- {m['category']}: SKR03={m['skr03']}, SKR04={m['skr04']}"
            for m in SKR_MAPPING
        )

        prompt = f"""Du bist ein Buchhaltungsexperte für deutsche Unternehmen.
Analysiere die folgende Rechnungsbeschreibung und ordne sie einer Kategorie zu.

Rechnungsinformationen:
- Beschreibung: {description}
- Betrag (netto): {amount:.2f} EUR
- Lieferant: {invoice_data.get('seller_name', 'Unbekannt')}

Verfügbare Kategorien mit SKR-Konten:
{categories_info}

Antworte ausschließlich im JSON-Format:
{{
    "category": "Kategoriename",
    "skr03_account": "Kontonummer",
    "skr04_account": "Kontonummer",
    "confidence": 0.0 bis 1.0,
    "reasoning": "Kurze Begründung auf Deutsch"
}}"""

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                self.ollama_url,
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                },
            )
            response.raise_for_status()

        data = response.json()
        raw_response = data.get("response", "")

        # JSON aus der Antwort parsen
        import json
        try:
            result = json.loads(raw_response)
        except json.JSONDecodeError:
            logger.warning("Ollama-Antwort konnte nicht als JSON geparst werden: %s", raw_response[:200])
            return None

        # Validierung der Pflichtfelder
        if not all(k in result for k in ("category", "skr03_account", "skr04_account")):
            logger.warning("Ollama-Antwort unvollständig: %s", result)
            return None

        # Konfidenz sicherstellen
        confidence = result.get("confidence", 0.5)
        if not isinstance(confidence, (int, float)):
            confidence = 0.5
        confidence = max(0.0, min(1.0, float(confidence)))

        return {
            "category": str(result["category"]),
            "skr03_account": str(result["skr03_account"]),
            "skr04_account": str(result["skr04_account"]),
            "confidence": confidence,
            "reasoning": str(result.get("reasoning", "KI-basierte Zuordnung")),
        }

    async def _suggest_with_ollama(
        self,
        description: str,
        amount: float,
    ) -> Optional[list[dict]]:
        """Holt mehrere Kontenvorschläge von Ollama."""
        categories_info = "\n".join(
            f"- {m['category']}: SKR03={m['skr03']}, SKR04={m['skr04']}"
            for m in SKR_MAPPING
        )

        prompt = f"""Du bist ein Buchhaltungsexperte für deutsche Unternehmen.
Für die folgende Rechnungsbeschreibung schlage die 3 wahrscheinlichsten
Sachkonten-Zuordnungen vor.

Beschreibung: {description}
Betrag (netto): {amount:.2f} EUR

Verfügbare Kategorien:
{categories_info}

Antworte ausschließlich im JSON-Format:
{{
    "suggestions": [
        {{
            "category": "Kategoriename",
            "skr03_account": "Kontonummer",
            "skr04_account": "Kontonummer",
            "confidence": 0.0 bis 1.0,
            "reasoning": "Kurze Begründung"
        }}
    ]
}}"""

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                self.ollama_url,
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                },
            )
            response.raise_for_status()

        data = response.json()
        raw_response = data.get("response", "")

        import json
        try:
            result = json.loads(raw_response)
        except json.JSONDecodeError:
            logger.warning("Ollama-Vorschläge konnten nicht geparst werden: %s", raw_response[:200])
            return None

        raw_suggestions = result.get("suggestions", [])
        if not isinstance(raw_suggestions, list):
            return None

        validated: list[dict] = []
        for s in raw_suggestions:
            if all(k in s for k in ("category", "skr03_account", "skr04_account")):
                conf = s.get("confidence", 0.5)
                if not isinstance(conf, (int, float)):
                    conf = 0.5
                validated.append({
                    "category": str(s["category"]),
                    "skr03_account": str(s["skr03_account"]),
                    "skr04_account": str(s["skr04_account"]),
                    "confidence": max(0.0, min(1.0, float(conf))),
                    "reasoning": str(s.get("reasoning", "KI-Vorschlag")),
                })

        return validated if validated else None

    # ------------------------------------------------------------------
    # Keyword-basiertes Fallback
    # ------------------------------------------------------------------

    def _categorize_by_keywords(self, description: str, amount: float) -> dict:
        """Regelbasierte Kategorisierung über Schlüsselwort-Abgleich."""
        text_lower = description.lower()
        best_match: Optional[dict] = None
        best_score = 0

        for mapping in SKR_MAPPING:
            score = sum(1 for kw in mapping["keywords"] if kw in text_lower)
            if score > best_score:
                best_score = score
                best_match = mapping

        if best_match and best_score > 0:
            # Konfidenz: mehr Treffer = höhere Konfidenz, max. 0.85 für Keyword-Matching
            confidence = min(0.85, 0.3 + (best_score * 0.15))
            return {
                "category": best_match["category"],
                "skr03_account": best_match["skr03"],
                "skr04_account": best_match["skr04"],
                "confidence": round(confidence, 2),
                "reasoning": f"Keyword-Matching: {best_score} Schlüsselwort-Treffer in Beschreibung",
            }

        # Keine Kategorie erkannt
        return {
            "category": "Sonstige Aufwendungen",
            "skr03_account": "4900",
            "skr04_account": "6300",
            "confidence": 0.1,
            "reasoning": "Keine passende Kategorie erkannt — Standardkonto zugewiesen",
        }

    def _suggest_by_keywords(self, description: str, amount: float) -> list[dict]:
        """Gibt alle Kategorien mit mindestens einem Keyword-Treffer zurück."""
        text_lower = description.lower()
        suggestions: list[dict] = []

        for mapping in SKR_MAPPING:
            score = sum(1 for kw in mapping["keywords"] if kw in text_lower)
            if score > 0:
                confidence = min(0.85, 0.3 + (score * 0.15))
                suggestions.append({
                    "category": mapping["category"],
                    "skr03_account": mapping["skr03"],
                    "skr04_account": mapping["skr04"],
                    "confidence": round(confidence, 2),
                    "reasoning": f"Keyword-Matching: {score} Treffer",
                })

        suggestions.sort(key=lambda x: x["confidence"], reverse=True)
        return suggestions

    # ------------------------------------------------------------------
    # Hilfsmethoden
    # ------------------------------------------------------------------

    @staticmethod
    def _build_description(invoice_data: dict) -> str:
        """Baut einen zusammenhängenden Beschreibungstext aus Rechnungsdaten."""
        parts: list[str] = []

        # Lieferantenname
        if invoice_data.get("seller_name"):
            parts.append(invoice_data["seller_name"])

        # Positionsbeschreibungen
        line_items = invoice_data.get("line_items") or []
        if isinstance(line_items, list):
            for item in line_items:
                if isinstance(item, dict) and item.get("description"):
                    parts.append(item["description"])

        # Freitext-Beschreibung
        if invoice_data.get("description"):
            parts.append(invoice_data["description"])

        # Rechnungsnummer kann auch Hinweise enthalten
        if invoice_data.get("invoice_number"):
            parts.append(invoice_data["invoice_number"])

        return " | ".join(parts) if parts else "Keine Beschreibung verfügbar"

    @staticmethod
    def _extract_amount(invoice_data: dict) -> float:
        """Extrahiert den Nettobetrag aus Rechnungsdaten."""
        for key in ("net_amount", "gross_amount", "amount"):
            val = invoice_data.get(key)
            if val is not None:
                try:
                    return float(val)
                except (TypeError, ValueError):
                    continue
        return 0.0
