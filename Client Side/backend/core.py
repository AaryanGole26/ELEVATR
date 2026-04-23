import spacy
import os, tempfile
from dotenv import load_dotenv 
from google import genai
import re
import fitz
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.graphics.shapes import Drawing, Rect, String
from datetime import datetime

load_dotenv()
if not os.getenv("GEMINI_API_KEY"):
    # Try parent directory if not found in backend/
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BASE_FONT_PATH = os.path.join(os.getcwd(), 'assets', 'fonts')

# Register essential fonts
pdfmetrics.registerFont(TTFont('Roboto-Regular', os.path.join(BASE_FONT_PATH, 'Roboto-Regular.ttf')))
pdfmetrics.registerFont(TTFont('Roboto-Bold', os.path.join(BASE_FONT_PATH, 'Roboto-Bold.ttf')))
pdfmetrics.registerFont(TTFont('Roboto-Italic', os.path.join(BASE_FONT_PATH, 'Roboto-Italic.ttf')))
pdfmetrics.registerFont(TTFont('Roboto-BoldItalic', os.path.join(BASE_FONT_PATH, 'Roboto-BoldItalic.ttf')))

PDF_THEME = {
    "font_name": "Roboto",
    "primary_color": colors.HexColor("#1a73e8"),
    "secondary_color": colors.HexColor("#34a853"),
    "warning_color": colors.HexColor("#fbbc05"),
    "neutral_color": colors.HexColor("#202124"),
    "background_matched": colors.HexColor("#e6f4ea"),
    "background_missing": colors.HexColor("#fce8e6"),
    "font_size_title": 24,
    "font_size_header": 14,
    "font_size_normal": 11,
    "line_spacing": 14
}

CATEGORY_RULES = {
    "Certification": ["course", "certification", "certificate", "exam"],
    "Project": ["project", "github", "portfolio"],
    "Skill": ["highlight", "resume", "experience", "skills"],
}

# Loading NLP English Model
try:
    nlp = spacy.load("en_core_web_md")
except (OSError, ImportError):
    try:
        import sys, subprocess
        subprocess.check_call([sys.executable, "-m", "spacy", "download", "en_core_web_md"])
        nlp = spacy.load("en_core_web_md")
    except Exception as e:
        raise OSError(f"Could not load or download SpaCy model 'en_core_web_md': {e}")

# Loading Gemini LLM
gemini_api_key = os.getenv("GEMINI_API_KEY")
if not gemini_api_key:
    raise ValueError("GEMINI_API_KEY environment variable not set")
client = genai.Client(api_key=gemini_api_key)

# Temp DB
job_descriptions_db = {
    "Software Developer": """
        We are looking for a Software Developer skilled in Python, Django, REST API, Docker, and Kubernetes.
        Experience in cloud infrastructure, CI/CD pipelines, and relational databases like PostgreSQL is a plus.
    """,
    "Data Scientist": """
        Seeking Data Scientist with strong skills in Python, Machine Learning, Pandas, NumPy, and data visualization.
        Knowledge of TensorFlow, PyTorch, and cloud services like AWS is desirable.
    """,
    "DevOps Engineer": """
        DevOps Engineer needed with expertise in Docker, Kubernetes, Jenkins, Terraform, CI/CD automation, and cloud infrastructure.
        Experience in monitoring tools and scripting (Python/Bash) is essential.
    """,
}

TECH_SKILLS = {
    "python", "django", "flask", "fastapi", "numpy", "pandas", "scipy",
    "matplotlib", "seaborn", "plotly", "tensorflow", "pytorch", "scikit-learn",
    "docker", "kubernetes", "aws", "azure", "gcp", "postgresql", "mysql",
    "mongodb", "sql", "linux", "git", "github", "gitlab", "javascript",
    "typescript", "react", "vue", "angular", "nodejs", "express", "java",
    "spring", "c++", "c#", "php", "ruby", "rails", "swift", "objective-c",
    "go", "rust", "graphql", "rest api", "soap", "redis", "elasticsearch",
    "apache kafka", "rabbitmq", "celery", "jenkins", "circleci", "travisci",
    "terraform", "ansible", "helm", "prometheus", "grafana", "hadoop", "spark",
    "apache airflow", "bigquery", "cloud functions", "lambda", "docker-compose"
}

# Function to get the Job Description from DB
def get_description_from_db(job_role: str) -> str:
    return job_descriptions_db.get(job_role, "No description available for this role.")

# Function to parse resume
def parse_resume(file) -> dict:
    """
    Accepts an UploadFile-like object (has .file) or a simple file path (for local tests).
    Returns {"text": full_text, "skills": [...]} with skills lowercased from TECH_SKILLS.
    """
    # read bytes (supports FastAPI UploadFile or a path string)
    raw_bytes = None
    if hasattr(file, "file"):
        # Uploaded file from FastAPI
        raw_bytes = file.file.read()
    elif isinstance(file, (bytes, bytearray)):
        raw_bytes = file
    else:
        # assume file is a path
        with open(file, "rb") as fh:
            raw_bytes = fh.read()

    text = ""
    try:
        with fitz.open(stream=raw_bytes, filetype="pdf") as doc:
            for page in doc:
                text += page.get_text("text") + "\n"
    except Exception:
        # fallback: try decode bytes
        try:
            text = raw_bytes.decode(errors="ignore")
        except Exception:
            text = ""

    # normalize whitespace
    text_norm = re.sub(r"\s+", " ", text)

    found = set()
    for skill in TECH_SKILLS:
        # word boundary match, case-insensitive
        if re.search(r"\b" + re.escape(skill) + r"\b", text_norm, flags=re.IGNORECASE):
            found.add(skill)  # store lowercase canonical

    return {
        "text": text,
        "skills": sorted(list(found))
    }

# Function to apply NLP on Job Description 
def extract_job_skills(job_description: str) -> list:
    doc = nlp(job_description)
    skills = set()
    COMMON_STOPWORDS = {"software", "developer", "experience", "databases", "pipelines", "knowledge", "service", "engineer"}
    TECH_SKILLS_DICT = {
    "python", "django", "flask", "fastapi", "numpy", "pandas", "scipy",
    "matplotlib", "seaborn", "tensorflow", "keras", "pytorch",
    "jenkins", "docker", "kubernetes", "ansible", "terraform",
    "aws", "azure", "google cloud", "gcp", "oracle cloud",
    "postgresql", "mysql", "mongodb", "sqlite", "redis",
    "graphql", "rest api", "soap api",
    "git", "github", "gitlab", "bitbucket",
    "celery", "rabbitmq",
    "elasticsearch", "logstash", "kibana",
    "apache", "nginx",
    "linux", "ubuntu", "centos",
    "microservices", "ci/cd", "tdd", "bdd",
    "oauth", "jwt", "ssl",
    "object-oriented programming", "oop",
    "multithreading", "asyncio",
    "react", "angular", "vue.js",
    "typescript", "javascript", "java", "c++", "c#", "php", "ruby", "go"
        }

    for token in doc:
        token_lower = token.text.lower()
        if token_lower in TECH_SKILLS_DICT:
            skills.add(token.text)

    for ent in doc.ents:
        if ent.label_ in ["ORG", "PRODUCT", "WORK_OF_ART", "TECHNOLOGY"]:  
            skills.add(ent.text)

    # Fallback: Extract all proper nouns (PROPN) and nouns (NOUN)
    if not skills:
        skills = [token.text for token in doc if token.pos_ in ("PROPN", "NOUN")]
        skills.update(skills)

    skills = [skill for skill in skills if skill.lower() not in COMMON_STOPWORDS]
    return list(set(skills))

# Function to calculate time saved estimate
def calculate_estimated_time_saved(match_info: dict) -> int:
    estimated_time_per_skill_min = 5  
    missing_skills_count = len(match_info.get("missing_skills", []))
    return missing_skills_count * estimated_time_per_skill_min

# Function to normalize skills
def _normalize_skill(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^\w+#.+-]", "", s)
    return s


# Function to calculate ATS compatibility score (independent of skill matching)
def calculate_ats_score(resume_data: dict, job_description: str) -> dict:
    """
    Calculate ATS compatibility score based on resume structure and formatting:
    - Resume structure and section completeness
    - ATS-friendly formatting
    - Keyword density from job description
    - Contact information completeness
    - File format and readability
    """
    resume_text = resume_data.get("text", "").lower()
    job_description_lower = job_description.lower()
    
    # 1. Resume Structure Score (35% weight)
    structure_score = 0
    essential_sections = ["experience", "education", "skills", "summary", "objective", "contact", "phone", "email"]
    for section in essential_sections:
        if section in resume_text:
            structure_score += 12.5  # 100/8 sections = 12.5 each
    
    # 2. ATS-Friendly Formatting Score (25% weight)
    formatting_score = 0
    
    # Check for ATS-friendly elements
    if "•" in resume_text or "-" in resume_text:  # Bullet points
        formatting_score += 20
    if any(word in resume_text for word in ["years", "experience", "worked"]):  # Action words
        formatting_score += 20
    if any(word in resume_text for word in ["bachelor", "master", "degree", "certification"]):  # Education keywords
        formatting_score += 20
    if any(word in resume_text for word in ["developed", "managed", "led", "created", "implemented"]):  # Action verbs
        formatting_score += 20
    if any(char.isdigit() for char in resume_text):  # Quantified achievements
        formatting_score += 20
    
    # 3. Job Description Keyword Density (25% weight)
    # Extract keywords from job description
    job_keywords = []
    important_words = ["experience", "skills", "knowledge", "proficiency", "expertise", "familiarity", "understanding"]
    for word in important_words:
        if word in job_description_lower:
            job_keywords.append(word)
    
    # Add technical terms from job description
    tech_terms = ["python", "javascript", "react", "angular", "vue", "node", "sql", "database", "api", "cloud", "aws", "azure", "docker", "kubernetes"]
    for term in tech_terms:
        if term in job_description_lower:
            job_keywords.append(term)
    
    keyword_matches = sum(1 for keyword in job_keywords if keyword in resume_text)
    keyword_density_score = min(100, (keyword_matches / len(job_keywords)) * 100) if job_keywords else 50
    
    # 4. Contact Information Completeness (15% weight)
    contact_score = 0
    contact_elements = ["email", "phone", "linkedin", "github", "portfolio", "website"]
    for element in contact_elements:
        if element in resume_text:
            contact_score += 16.67  # 100/6 elements = 16.67 each
    
    # Calculate weighted ATS score
    ats_score = (
        structure_score * 0.35 +
        formatting_score * 0.25 +
        keyword_density_score * 0.25 +
        contact_score * 0.15
    )
    
    return {
        "overall_ats_score": round(ats_score, 1),
        "structure_score": round(structure_score, 1),
        "formatting_score": round(formatting_score, 1),
        "keyword_density_score": round(keyword_density_score, 1),
        "contact_score": round(contact_score, 1),
        "ats_grade": get_ats_grade(ats_score),
        "ats_recommendations": generate_ats_recommendations(ats_score, structure_score, formatting_score, keyword_density_score, contact_score)
    }

def get_ats_grade(score: float) -> str:
    """Convert ATS score to letter grade"""
    if score >= 90:
        return "A+"
    elif score >= 85:
        return "A"
    elif score >= 80:
        return "A-"
    elif score >= 75:
        return "B+"
    elif score >= 70:
        return "B"
    elif score >= 65:
        return "B-"
    elif score >= 60:
        return "C+"
    elif score >= 55:
        return "C"
    elif score >= 50:
        return "C-"
    else:
        return "D"

def generate_ats_recommendations(overall_score: float, structure_score: float, formatting_score: float, keyword_score: float, contact_score: float) -> list:
    """Generate specific ATS improvement recommendations"""
    recommendations = []
    
    if structure_score < 70:
        recommendations.append("Add missing essential sections like Summary, Objective, or Contact Information")
        recommendations.append("Ensure all major sections are clearly labeled and properly formatted")
    
    if formatting_score < 70:
        recommendations.append("Use bullet points (•) to organize your experience and achievements")
        recommendations.append("Include action verbs like 'developed', 'managed', 'led', 'created' in your descriptions")
        recommendations.append("Add quantified achievements with specific numbers and metrics")
    
    if keyword_score < 70:
        recommendations.append("Include more keywords from the job description throughout your resume")
        recommendations.append("Use industry-specific terminology and technical terms relevant to the role")
    
    if contact_score < 70:
        recommendations.append("Add complete contact information including email, phone, and LinkedIn profile")
        recommendations.append("Include professional portfolio or GitHub links if applicable")
    
    if overall_score < 70:
        recommendations.append("Use standard section headers (Experience, Education, Skills) for better ATS parsing")
        recommendations.append("Avoid complex formatting, tables, or graphics that ATS systems can't read")
        recommendations.append("Save your resume as a .pdf or .docx file for maximum compatibility")
    
    if not recommendations:
        recommendations.append("Your resume has excellent ATS compatibility! Keep up the great work.")
    
    return recommendations

# Function to analyze skill match
def analyze_skill_match(resume_data: dict, job_skills: list) -> dict:
    resume_skills = resume_data.get("skills") or []
    job_skills = job_skills or []

    resume_map = { _normalize_skill(s): s for s in resume_skills }
    job_map = { _normalize_skill(s): s for s in job_skills }

    matched_norm = set(resume_map.keys()) & set(job_map.keys())
    matched = [resume_map[n] for n in matched_norm]

    missing_norm = set(job_map.keys()) - matched_norm
    missing = [job_map[n] for n in missing_norm]

    match_percentage = 0.0
    if len(job_map) > 0:
        match_percentage = round(len(matched) / len(job_map) * 100, 2)

    return {
        "matched_skills": matched,
        "missing_skills": missing,
        "match_percentage": match_percentage
    }

# Function to get personalised recommendations from LLM
def generate_llm_recommendations(resume_data: dict, job_description: str, match_info: dict) -> str:
    prompt = f"""
    The user wants to apply for the following role:
    {job_description}
    
    Current resume skills:
    {', '.join(resume_data['skills'])}
    
    Matched skills:
    {', '.join(match_info['matched_skills'])}
    
    Missing skills:
    {', '.join(match_info['missing_skills'])}
    
    Generate three practical and market-relevant recommendations to improve the user’s resume and skillset. Focus on bridging missing skills with real-world actions that can be completed within one to three months. Each recommendation should be personalized, realistic, and actionable, including projects, certifications, or ways to highlight experience. Format the recommendations clearly, with each on a separate line, avoiding symbols, extra spaces, or numbering. Use natural, human-friendly language that feels tailored to the individual.

    Example style of output:
    1. Add a personal project using [technology] and publish it on GitHub
    2. Complete the [course or certification name] from platforms like Coursera, Udemy, or LinkedIn Learning
    3. Emphasize [specific experience or skill] in your resume and quantify the impact wherever possible
    """
    try:
        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        return response.text
    except Exception as e:
        print(f"Gemini API Error: {e}")
        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            return """
            Apply for internship or entry-level positions to gain hands-on experience in the industry.
            Build a portfolio of small projects using the missing technologies and showcase them on GitHub.
            Optimize your resume layout to ensure all sections are clearly visible and easy to read for ATS systems.
            """
        return "We're having trouble reaching our AI right now. Please try again in a few minutes."

# Function to format LLM output for UI/PDF
def format_for_ui_and_pdf(match_info: dict, recommendations: str, ats_data: dict = None) -> dict:
    clean_text = recommendations.replace('\r\n', '\n').replace('\r', '\n').strip()
    lines = [re.sub(r'^[\*\-\`\s]*', '', line).strip() for line in clean_text.split('\n') if line.strip()]
    cleaned_lines = [re.sub(r'^\d+\.\s*', '', line) for line in lines]

    result = {
        "match_percentage": match_info["match_percentage"],
        "matched_skills": match_info["matched_skills"],
        "missing_skills": match_info["missing_skills"],
        "recommendations": cleaned_lines,
        "estimated_time_saved_minutes": calculate_estimated_time_saved(match_info)
    }
    
    # Add ATS score data if available
    if ats_data:
        result["ats_score"] = ats_data
    
    return result

# Function to export PDF
def export_to_pdf(formatted_data: dict) -> str:
    pdf_fd, pdf_path = tempfile.mkstemp(suffix=".pdf")
    os.close(pdf_fd)

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    # Define styles
    title_style = ParagraphStyle(
        "TitleStyle",
        fontName="Roboto-Bold",
        fontSize=PDF_THEME['font_size_title'],
        textColor=PDF_THEME['primary_color'],
        alignment=1,
        spaceAfter=15,
        leading=PDF_THEME['line_spacing']
    )

    header_style = ParagraphStyle(
        "HeaderStyle",
        fontName="Roboto-Bold",
        fontSize=PDF_THEME['font_size_header'],
        textColor=PDF_THEME['neutral_color'],
        spaceBefore=12,
        spaceAfter=10,
        leading=16
    )

    normal_style = ParagraphStyle(
        "NormalStyle",
        fontName="Roboto-Regular",
        fontSize=PDF_THEME['font_size_normal'],
        leading=PDF_THEME['line_spacing'],
        textColor=PDF_THEME['neutral_color']
    )

    footer_style = ParagraphStyle(
        "FooterStyle",
        fontName="Roboto-Italic",
        fontSize=9,
        textColor=colors.HexColor("#5f6368"),
        alignment=1,
        spaceBefore=20
    )

    subtitle_style = ParagraphStyle(
    "SubtitleStyle",
    fontName="Roboto-Italic",
    fontSize=9,
    textColor=colors.HexColor("#5f6368"),
    spaceAfter=10
    )

    important_style = ParagraphStyle(
    "ImportantStyle",
    fontName="Roboto-Bold",
    fontSize=12,
    leading=14,
    textColor=PDF_THEME['primary_color'],
    spaceBefore=10,
    spaceAfter=15
    )

    elements = []

    # Cover Title
    elements.append(Paragraph("Resume Optimization Report", title_style))
    elements.append(Paragraph(f"Generated on: {datetime.now().strftime('%Y-%m-%d %I:%M %p')}", subtitle_style))
    elements.append(Spacer(1, 10))

    # Executive Summary
    elements.append(Paragraph("Executive Summary", header_style))
    elements.append(Paragraph(
        "This report compares the candidate’s resume against the target job role, "
        "highlighting matched skills, missing gaps, and actionable recommendations "
        "to improve role fit.",
        normal_style
    ))
    elements.append(Spacer(1, 20))

    # Skill Match Overview + Progress Bar
    elements.append(Paragraph("Skill Match Overview", header_style))
    elements.append(Paragraph(f"Overall Match: <b>{formatted_data['match_percentage']}%</b>", normal_style))
    elements.append(Spacer(1, 12))


    match_pct = formatted_data["match_percentage"]

    # Create an enhanced progress bar
    chart_width = 400
    chart_height = 25
    chart = Drawing(chart_width + 2, chart_height + 30)

    # Background bar (full length) with border
    chart.add(Rect(0, 0, chart_width, chart_height, 
                   fillColor=colors.HexColor("#f5f5f5"), 
                   strokeColor=PDF_THEME['primary_color'], 
                   strokeWidth=1, rx=5, ry=5))

    # Filled bar (match) with gradient effect
    filled_width = chart_width * (match_pct / 100)
    if filled_width > 0:
        chart.add(Rect(1, 1, filled_width - 2, chart_height - 2, 
                       fillColor=PDF_THEME['primary_color'], 
                       strokeColor=None, rx=4, ry=4))

    # Text label above bar with better positioning
    chart.add(String(chart_width / 2, chart_height + 8, f"{match_pct:.1f}% Match", 
                    textAnchor="middle", fontName="Roboto-Bold", 
                    fontSize=12, fillColor=PDF_THEME['primary_color']))

    elements.append(chart)
    elements.append(Spacer(1, 20))
    # Skills Breakdown Table
    elements.append(Paragraph("Skills Breakdown", header_style))
    
    # Format skills with better presentation
    matched_skills_text = ", ".join(formatted_data["matched_skills"]) if formatted_data["matched_skills"] else "None"
    missing_skills_text = ", ".join(formatted_data["missing_skills"]) if formatted_data["missing_skills"] else "None"
    
    table_data = [
        ["✅ Matched Skills", Paragraph(matched_skills_text, normal_style)],
        ["❌ Missing Skills", Paragraph(missing_skills_text, normal_style)]
    ]

    table = Table(table_data, colWidths=[180, 350])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), PDF_THEME['background_matched']),
        ("BACKGROUND", (0, 1), (0, 1), PDF_THEME['background_missing']),
        ("TEXTCOLOR", (0, 0), (-1, -1), PDF_THEME['neutral_color']),
        ("FONTNAME", (0, 0), (-1, -1), "Roboto-Regular"),
        ("FONTSIZE", (0, 0), (-1, -1), PDF_THEME['font_size_normal']),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("BOX", (0, 0), (-1, -1), 1, PDF_THEME['neutral_color']),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, PDF_THEME['neutral_color']),
        ("LEFTPADDING", (0, 0), (-1, -1), 15),
        ("RIGHTPADDING", (0, 0), (-1, -1), 15),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("FONTNAME", (0, 0), (0, -1), "Roboto-Bold"),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 20))

    # Actionable Recommendations
    elements.append(Paragraph("Actionable Recommendations", header_style))
    elements.append(Spacer(1, 10))
    
    for i, rec in enumerate(formatted_data["recommendations"], start=1):
        category = "General"
        color = PDF_THEME['neutral_color']
        icon = "💡"

        rec_lower = rec.lower()
        if any(x in rec_lower for x in CATEGORY_RULES["Certification"]):
            category = "Certification"
            color = PDF_THEME['secondary_color']
            icon = "🎓"
        elif any(x in rec_lower for x in CATEGORY_RULES["Project"]):
            category = "Project"
            color = PDF_THEME['primary_color']
            icon = "🚀"
        elif any(x in rec_lower for x in CATEGORY_RULES["Skill"]):
            category = "Skill"
            color = PDF_THEME['warning_color']
            icon = "⚡"

        # Create a more visually appealing recommendation format
        para_text = f"""
        <para align="left" leftIndent="20">
        <font name="Roboto-Bold" size="12" color="{color}">{icon} {category}</font><br/>
        <font name="Roboto-Regular" size="11" color="{PDF_THEME['neutral_color']}">{rec}</font>
        </para>
        """
        elements.append(Paragraph(para_text, normal_style))
        elements.append(Spacer(1, 12))

    # ATS Score Section (if available)
    if "ats_score" in formatted_data:
        ats_data = formatted_data["ats_score"]
        elements.append(Spacer(1, 20))
        elements.append(Paragraph("ATS Compatibility Analysis", header_style))
        
        # ATS Score Overview
        ats_summary_text = f"""
        <para align="left" leftIndent="20">
        <font name="Roboto-Bold" size="12" color="{PDF_THEME['primary_color']}">🎯 ATS Compatibility Score: <b>{ats_data['overall_ats_score']}%</b> (Grade: {ats_data['ats_grade']})</font><br/>
        <font name="Roboto-Regular" size="11" color="{PDF_THEME['neutral_color']}">
        • Resume Structure: <b>{ats_data['structure_score']}%</b><br/>
        • ATS Formatting: <b>{ats_data['formatting_score']}%</b><br/>
        • Keyword Density: <b>{ats_data['keyword_density_score']}%</b><br/>
        • Contact Information: <b>{ats_data['contact_score']}%</b>
        </font>
        </para>
        """
        elements.append(Paragraph(ats_summary_text, normal_style))
        
        # ATS Recommendations
        if ats_data.get('ats_recommendations'):
            elements.append(Spacer(1, 15))
            elements.append(Paragraph("ATS Optimization Recommendations", header_style))
            for i, rec in enumerate(ats_data['ats_recommendations'], start=1):
                ats_rec_text = f"""
                <para align="left" leftIndent="20">
                <font name="Roboto-Bold" size="11" color="{PDF_THEME['primary_color']}">{i}.</font>
                <font name="Roboto-Regular" size="11" color="{PDF_THEME['neutral_color']}"> {rec}</font>
                </para>
                """
                elements.append(Paragraph(ats_rec_text, normal_style))
                elements.append(Spacer(1, 8))

    # Summary Section
    elements.append(Spacer(1, 20))
    elements.append(Paragraph("Summary", header_style))
    
    # Create a summary box
    summary_text = f"""
    <para align="left" leftIndent="20">
    <font name="Roboto-Bold" size="12" color="{PDF_THEME['primary_color']}">📊 Analysis Results:</font><br/>
    <font name="Roboto-Regular" size="11" color="{PDF_THEME['neutral_color']}">
    • Overall Match: <b>{formatted_data['match_percentage']}%</b><br/>
    • Skills Matched: <b>{len(formatted_data['matched_skills'])}</b> out of <b>{len(formatted_data['matched_skills']) + len(formatted_data['missing_skills'])}</b><br/>
    • Recommendations: <b>{len(formatted_data['recommendations'])}</b> actionable items<br/>
    • Estimated Time Saved: <b>{formatted_data.get('estimated_time_saved_minutes', 0)} minutes</b>
    </font>
    </para>
    """
    elements.append(Paragraph(summary_text, normal_style))
    elements.append(Spacer(1, 20))

    # Footer
    footer = Paragraph(
        "Generated by <b>ELEVATR AI</b> • Empowering Smarter Career Growth • " + 
        datetime.now().strftime('%Y-%m-%d'),
        footer_style
    )
    elements.append(footer)

    doc.build(elements)

    return pdf_path