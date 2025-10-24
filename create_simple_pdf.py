#!/usr/bin/env python3
"""
Create a simple PDF with selectable text for testing HR Suite uploads.
This script creates a PDF that should work with the text extraction system.
"""

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

def create_test_pdf():
    # Create a new PDF
    filename = "test_warning_letter.pdf"
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter
    
    # Set font
    c.setFont("Helvetica", 12)
    
    # Title
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, "Employee Warning Letter")
    
    # Company info
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 80, "Acme Corporation")
    c.drawString(50, height - 95, "123 Business Street")
    c.drawString(50, height - 110, "San Francisco, CA 94105")
    
    # Date
    from datetime import datetime
    c.drawString(50, height - 140, f"Date: {datetime.now().strftime('%B %d, %Y')}")
    
    # Employee info
    c.drawString(50, height - 170, "To: John Doe")
    c.drawString(50, height - 185, "Employee ID: 12345")
    c.drawString(50, height - 200, "Department: Operations")
    
    # Warning content
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, height - 230, "RE: Written Warning - Safety Protocol Violation")
    
    c.setFont("Helvetica", 10)
    y_position = height - 260
    
    warning_text = [
        "Dear Mr. Doe,",
        "",
        "This letter serves as a written warning regarding your violation of company",
        "safety protocols.",
        "",
        "On [Date], you were observed not wearing the required Personal Protective",
        "Equipment (PPE) while working in the chemical handling area. This constitutes",
        "a serious violation of our safety policies and California Occupational Safety",
        "and Health Administration (Cal/OSHA) regulations.",
        "",
        "Specifically, you violated:",
        "• Cal. Lab. Code § 6400 - General duty to provide safe workplace",
        "• Cal. Code Regs. Tit. 8 § 3380 - Personal Protective Equipment requirements",
        "",
        "This is your first written warning. Future violations may result in further",
        "disciplinary action, up to and including termination.",
        "",
        "You are required to:",
        "1. Review the company safety manual",
        "2. Complete additional safety training", 
        "3. Sign this acknowledgment",
        "",
        "Please contact HR if you have any questions.",
        "",
        "Sincerely,",
        "HR Department"
    ]
    
    for line in warning_text:
        if y_position < 50:  # Start new page if needed
            c.showPage()
            y_position = height - 50
        c.drawString(50, y_position, line)
        y_position -= 15
    
    # Save the PDF
    c.save()
    print(f"✅ PDF created successfully: {filename}")
    print("This PDF contains selectable text and should work with the HR Suite upload system.")

if __name__ == "__main__":
    try:
        create_test_pdf()
    except ImportError:
        print("❌ ReportLab not installed. Install with: pip install reportlab")
        print("Alternatively, use the HTML version: open create_test_pdf.html")
    except Exception as e:
        print(f"❌ Error creating PDF: {e}")
