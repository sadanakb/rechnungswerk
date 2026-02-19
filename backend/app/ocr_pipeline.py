"""
OCR Pipeline for invoice text extraction and field parsing
"""
import pytesseract
from pdf2image import convert_from_path
from PIL import Image
import cv2
import numpy as np
import re
from datetime import datetime
from typing import Dict, Optional, List, Tuple
from app.config import settings


class OCRPipeline:
    """OCR text extraction and field parsing"""
    
    def __init__(self):
        self.tesseract_lang = settings.tesseract_lang
        self.dpi = settings.ocr_dpi
    
    def preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Preprocess image for better OCR results:
        - Convert to grayscale
        - Denoise
        - Increase contrast
        - Deskew
        """
        # Convert PIL Image to OpenCV format
        img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        # Grayscale
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        # Denoise
        denoised = cv2.fastNlMeansDenoising(gray, h=10)
        
        # Increase contrast (CLAHE)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        contrasted = clahe.apply(denoised)
        
        # Thresholding
        _, binary = cv2.threshold(contrasted, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Convert back to PIL
        return Image.fromarray(binary)
    
    def extract_text_from_pdf(self, pdf_path: str) -> Tuple[str, float]:
        """
        Extract text from PDF using Tesseract OCR
        
        Returns:
            (extracted_text, confidence_score)
        """
        try:
            # Convert PDF to images (first page only for now)
            images = convert_from_path(pdf_path, dpi=self.dpi, first_page=1, last_page=1)
            
            if not images:
                return "", 0.0
            
            # Preprocess first page
            preprocessed = self.preprocess_image(images[0])
            
            # Extract text with confidence data
            ocr_data = pytesseract.image_to_data(
                preprocessed,
                lang=self.tesseract_lang,
                output_type=pytesseract.Output.DICT
            )
            
            # Calculate average confidence
            confidences = [int(conf) for conf in ocr_data['conf'] if int(conf) > 0]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0
            
            # Extract full text
            text = pytesseract.image_to_string(preprocessed, lang=self.tesseract_lang)
            
            return text, avg_confidence
            
        except Exception as e:
            print(f"OCR extraction error: {e}")
            return "", 0.0
    
    def extract_invoice_fields(self, text: str) -> Dict:
        """
        Extract invoice fields using regex patterns
        
        Fields to extract:
        - Invoice number (Rechnungsnummer)
        - Invoice date (Rechnungsdatum)
        - Due date (Fälligkeitsdatum)
        - Seller name, VAT ID, address
        - Buyer name, VAT ID, address
        - Net amount, tax, gross amount
        """
        fields = {}
        
        # Invoice Number
        invoice_num_patterns = [
            r'Rechnungsnummer[:\s]+(\S+)',
            r'Rechnung[:\s]+Nr\.?\s*(\S+)',
            r'Invoice\s+Number[:\s]+(\S+)',
            r'RE-\d+',
            r'\d{4,8}'  # Fallback: any 4-8 digit number
        ]
        fields['invoice_number'] = self._extract_first_match(text, invoice_num_patterns)
        
        # Invoice Date
        date_patterns = [
            r'Rechnungsdatum[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})',
            r'Datum[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})',
            r'(\d{1,2}\.\d{1,2}\.\d{4})',  # dd.mm.yyyy
            r'(\d{4}-\d{2}-\d{2})'  # yyyy-mm-dd
        ]
        invoice_date_str = self._extract_first_match(text, date_patterns)
        fields['invoice_date'] = self._parse_date(invoice_date_str)
        
        # Due Date
        due_date_patterns = [
            r'Fälligkeitsdatum[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})',
            r'Zahlbar\s+bis[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})',
            r'Due\s+Date[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})'
        ]
        due_date_str = self._extract_first_match(text, due_date_patterns)
        fields['due_date'] = self._parse_date(due_date_str)
        
        # VAT IDs (German format: DE123456789)
        vat_pattern = r'(DE\d{9})'
        vat_ids = re.findall(vat_pattern, text)
        fields['seller_vat_id'] = vat_ids[0] if len(vat_ids) > 0 else None
        fields['buyer_vat_id'] = vat_ids[1] if len(vat_ids) > 1 else None
        
        # Amounts
        amount_patterns = [
            r'Nettobetrag[:\s]+([\d.,]+)\s*€?',
            r'Summe\s+Netto[:\s]+([\d.,]+)\s*€?',
            r'Net\s+Amount[:\s]+([\d.,]+)\s*€?'
        ]
        net_amount_str = self._extract_first_match(text, amount_patterns)
        fields['net_amount'] = self._parse_amount(net_amount_str)
        
        tax_patterns = [
            r'(?:MwSt|USt|VAT)[:\s]+([\d.,]+)\s*€?',
            r'(?:19|7)%\s+MwSt[:\s]+([\d.,]+)\s*€?'
        ]
        tax_amount_str = self._extract_first_match(text, tax_patterns)
        fields['tax_amount'] = self._parse_amount(tax_amount_str)
        
        gross_patterns = [
            r'Gesamtbetrag[:\s]+([\d.,]+)\s*€?',
            r'Bruttobetrag[:\s]+([\d.,]+)\s*€?',
            r'Total[:\s]+([\d.,]+)\s*€?',
            r'Endbetrag[:\s]+([\d.,]+)\s*€?'
        ]
        gross_amount_str = self._extract_first_match(text, gross_patterns)
        fields['gross_amount'] = self._parse_amount(gross_amount_str)
        
        # Tax Rate
        tax_rate_pattern = r'(?:MwSt|USt|VAT)\s+(\d{1,2})%'
        tax_rate_str = self._extract_first_match(text, [tax_rate_pattern])
        fields['tax_rate'] = float(tax_rate_str) if tax_rate_str else 19.0
        
        # Company Names (heuristic: first capitalized multi-word phrases)
        company_pattern = r'([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){1,3})'
        companies = re.findall(company_pattern, text)
        fields['seller_name'] = companies[0] if len(companies) > 0 else None
        fields['buyer_name'] = companies[1] if len(companies) > 1 else None
        
        return fields
    
    def _extract_first_match(self, text: str, patterns: List[str]) -> Optional[str]:
        """Try multiple regex patterns, return first match"""
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1) if match.lastindex else match.group(0)
        return None
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        """Parse date string to ISO format (YYYY-MM-DD)"""
        if not date_str:
            return None
        
        try:
            # Try dd.mm.yyyy
            if '.' in date_str:
                dt = datetime.strptime(date_str, '%d.%m.%Y')
                return dt.strftime('%Y-%m-%d')
            # Try yyyy-mm-dd
            elif '-' in date_str:
                dt = datetime.strptime(date_str, '%Y-%m-%d')
                return dt.strftime('%Y-%m-%d')
        except ValueError:
            pass
        
        return None
    
    def _parse_amount(self, amount_str: Optional[str]) -> Optional[float]:
        """Parse amount string to float"""
        if not amount_str:
            return None
        
        try:
            # Remove thousands separators and convert comma to dot
            cleaned = amount_str.replace('.', '').replace(',', '.').strip()
            return float(cleaned)
        except ValueError:
            return None
