from typing import Dict, List, Optional
from io import BytesIO
import os
import subprocess
import tempfile
import re
from fastapi.responses import HTMLResponse, StreamingResponse


def _sanitize_latex(text: str) -> str:
    """Sanitize text for LaTeX by escaping special characters"""
    if not text:
        return ""
    
    # LaTeX special characters that need escaping
    replacements = {
        '\\': r'\textbackslash{}',
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
    }
    
    result = text
    for char, replacement in replacements.items():
        result = result.replace(char, replacement)
    
    return result


def _format_date_range(start: str, end: str) -> str:
    """Format date range consistently"""
    if not start and not end:
        return ""
    
    if not start:
        return end
    
    if not end or end.lower() in ['present', 'current', 'now', '']:
        return f"{start} -- Present"
    
    return f"{start} -- {end}"


def format_work_experience(work_experience: List[Dict]) -> str:
    """Enhanced work experience formatting for LaTeX"""
    if not work_experience:
        return ""
    
    latex = "\\section{Work Experience}\n"
    
    for exp in work_experience:
        title = _sanitize_latex(exp.get('title', ''))
        company = _sanitize_latex(exp.get('company', ''))
        start_date = exp.get('startDate', '')
        end_date = exp.get('endDate', '')
        description = _sanitize_latex(exp.get('description', ''))
        
        # Format header line
        if title and company:
            latex += f"\\textbf{{{title}}} \\hfill {company}\\\\\n"
        elif title:
            latex += f"\\textbf{{{title}}}\\\\\n"
        elif company:
            latex += f"\\textbf{{{company}}}\\\\\n"
        
        # Add date range
        date_range = _format_date_range(start_date, end_date)
        if date_range:
            latex += f"\\textit{{{_sanitize_latex(date_range)}}}\\\\\n"
        
        # Add description
        if description:
            # Split into bullet points if description contains newlines or bullets
            if '\n' in description or '•' in description or '-' in description[:20]:
                lines = [l.strip() for l in description.split('\n') if l.strip()]
                if lines:
                    latex += "\\begin{itemize}\n"
                    for line in lines:  # Show all bullet points
                        # Remove existing bullet points
                        line = re.sub(r'^[•\-\*]\s*', '', line)
                        if line:
                            latex += f"  \\item {line}\n"
                    latex += "\\end{itemize}\n"
            else:
                latex += f"{description}\\\\\n"
        
        latex += "\n"
    
    return latex


def format_education(education: List[Dict]) -> str:
    """Enhanced education formatting for LaTeX"""
    if not education:
        return ""
    
    latex = "\\section{Education}\n"
    
    for edu in education:
        # Handle both old and new format
        degree = _sanitize_latex(edu.get('degree') or edu.get('title', ''))
        institution = _sanitize_latex(edu.get('institution', ''))
        start_date = edu.get('startDate', '')
        end_date = edu.get('endDate', '')
        gpa = edu.get('gpa', '')
        description = _sanitize_latex(edu.get('description', ''))
        
        # Format header
        if degree and institution:
            latex += f"\\textbf{{{degree}}} \\hfill {institution}\\\\\n"
        elif degree:
            latex += f"\\textbf{{{degree}}}\\\\\n"
        elif institution:
            latex += f"\\textbf{{{institution}}}\\\\\n"
        
        # Add date range
        date_range = _format_date_range(start_date, end_date)
        if date_range:
            latex += f"\\textit{{{_sanitize_latex(date_range)}}}"
        
        # Add GPA
        if gpa:
            if date_range:
                latex += f" \\hfill GPA: {_sanitize_latex(gpa)}\\\\\n"
            else:
                latex += f"GPA: {_sanitize_latex(gpa)}\\\\\n"
        elif date_range:
            latex += "\\\\\n"
        
        # Add description if it's different from degree/institution
        if description and description not in [degree, institution]:
            # Truncate description to avoid duplication
            if len(description) > len(degree) + len(institution) + 50:
                latex += f"{description[:300]}\\\\\n"
        
        latex += "\n"
    
    return latex


def format_skills(skills: List[Dict]) -> str:
    """Enhanced skills formatting for LaTeX with categorization"""
    if not skills:
        return ""
    
    # Categorize skills
    technical_skills = []
    soft_skills = []
    
    for skill in skills:
        if isinstance(skill, dict):
            name = skill.get('name', '')
            category = skill.get('category', 'technical').lower()
        else:
            name = str(skill)
            category = 'technical'
        
        if name:
            if category == 'soft':
                soft_skills.append(_sanitize_latex(name))
            else:
                technical_skills.append(_sanitize_latex(name))
    
    latex = "\\section{Skills}\n"
    
    # Format technical skills
    if technical_skills:
        latex += "\\textbf{Technical Skills:} "
        latex += ", ".join(technical_skills)  # Show all skills
        latex += "\\\\\n"
    
    # Format soft skills
    if soft_skills:
        if technical_skills:
            latex += "\\\\\n"
        latex += "\\textbf{Soft Skills:} "
        latex += ", ".join(soft_skills)  # Show all soft skills
        latex += "\\\\\n"
    
    return latex


def format_projects(projects: List[Dict]) -> str:
    """Enhanced projects formatting for LaTeX"""
    if not projects:
        return ""
    
    latex = "\\section{Projects}\n"
    
    for project in projects:
        title = _sanitize_latex(project.get('title') or project.get('name', 'Project'))
        description = _sanitize_latex(project.get('description', ''))
        technologies = project.get('technologies', '')
        url = project.get('url', '')
        
        # Format title with URL if available
        if url:
            latex += f"\\textbf{{{title}}} \\hfill \\href{{{url}}}{{\\small [Link]}}\\\\\n"
        else:
            latex += f"\\textbf{{{title}}}\\\\\n"
        
        # Add technologies
        if technologies:
            latex += f"\\textit{{Technologies: {_sanitize_latex(technologies)}}}\\\\\n"
        
        # Add description
        if description:
            latex += f"{description}\\\\\n"
        
        latex += "\n"
    
    return latex


def format_certifications(certifications: List[Dict]) -> str:
    """Enhanced certifications formatting for LaTeX"""
    if not certifications:
        return ""
    
    latex = "\\section{Certifications}\n"
    
    for cert in certifications:
        name = _sanitize_latex(cert.get('name', 'Certification'))
        issuer = _sanitize_latex(cert.get('issuer', ''))
        date = cert.get('date', '')
        
        latex += f"\\textbf{{{name}}}"
        
        # Add issuer if available
        if issuer:
            latex += f" -- {issuer}"
        
        # Add date if available
        if date:
            latex += f" \\hfill {_sanitize_latex(date)}"
        
        latex += "\\\\\n"
    
    return latex


def format_linkedin_url(linkedin: str) -> str:
    """Format LinkedIn URL for LaTeX with better handling"""
    if not linkedin:
        return ""
    
    # Clean up the URL
    linkedin = linkedin.strip()
    
    if not linkedin:
        return ""
    
    # If it's just a username, construct full URL
    if not linkedin.startswith('http') and '/' not in linkedin:
        linkedin = f"https://www.linkedin.com/in/{linkedin}"
    elif not linkedin.startswith('http'):
        linkedin = f"https://{linkedin}"
    
    # Extract display text (username or 'LinkedIn')
    if 'linkedin.com/in/' in linkedin:
        username = linkedin.split('linkedin.com/in/')[-1].rstrip('/')
        return f"\\href{{{linkedin}}}{{linkedin.com/in/{username}}}"
    else:
        return f"\\href{{{linkedin}}}{{LinkedIn}}"


def format_github_url(github: str) -> str:
    """Format GitHub URL for LaTeX with better handling"""
    if not github:
        return ""
    
    github = github.strip()
    
    if not github:
        return ""
    
    # If it's just a username, construct full URL
    if not github.startswith('http') and '/' not in github:
        github = f"https://www.github.com/{github}"
    elif not github.startswith('http'):
        github = f"https://{github}"
    
    # Extract display text (username or 'GitHub')
    if 'github.com/' in github:
        username = github.split('github.com/')[-1].rstrip('/')
        return f"\\href{{{github}}}{{github.com/{username}}}"
    else:
        return f"\\href{{{github}}}{{GitHub}}"


def format_website_url(website: str) -> str:
    """Format website URL for LaTeX"""
    if not website:
        return ""
    
    website = website.strip()
    
    if not website:
        return ""
    
    if not website.startswith('http'):
        website = f"https://{website}"
    
    # Extract domain for display
    display = website.replace('https://', '').replace('http://', '').rstrip('/')
    
    return f"\\href{{{website}}}{{{display}}}"


def extract_portfolio_link(data: Dict) -> str:
    """Try to extract a website/portfolio link from personalInfo or common text fields.
    Prefer explicit personalInfo.website or personalInfo.portfolio; otherwise scan summary,
    work descriptions, project urls/descriptions and education/certification text for the first URL.
    """
    # check explicit fields first
    p = data.get("personalInfo", {}) or {}
    explicit = (p.get("website") or p.get("portfolio") or p.get("site") or "").strip()
    if explicit:
        return explicit

    # helper regex for common URLs (http/https/www and plain domains)
    url_regex = re.compile(
        r'(https?://[^\s,;<>\)"]+|www\.[^\s,;<>\)"]+|[a-zA-Z0-9.-]+\.(?:com|io|dev|app|me|co|org|net)(/[^\s,;<>\)]*)?)',
        re.IGNORECASE
    )

    # fields to scan
    fields = []
    fields.append(data.get("summary", ""))
    for exp in data.get("workExperience", []) or []:
        fields.append(exp.get("description", "") or "")
    for pr in data.get("projects", []) or []:
        fields.append(pr.get("url", "") or "")
        fields.append(pr.get("description", "") or "")
    for edu in data.get("education", []) or []:
        fields.append(edu.get("description", "") or "")
    for cert in data.get("certifications", []) or []:
        fields.append(cert.get("url", "") or "")
        fields.append(cert.get("description", "") or "")

    for text in fields:
        if not text:
            continue
        m = url_regex.search(str(text))
        if m:
            found = m.group(0)
            # normalize
            if found.startswith("www."):
                found = "https://" + found
            if not found.startswith("http"):
                found = "https://" + found
            return found

    return ""


def substitute_template_variables(template_content: str, data: Dict) -> str:
    """Enhanced template variable substitution with better data handling"""
    p = data.get("personalInfo", {})
    
    # Format contact information
    name = _sanitize_latex(p.get("name", "Your Name"))
    email = p.get("email", "your.email@example.com")
    phone = _sanitize_latex(p.get("phone", "(123) 456-7890"))
    location = _sanitize_latex(p.get("location", "City, State"))
    
    # Try to extract website/portfolio automatically if not provided
    extracted_site = extract_portfolio_link(data)
    raw_website = p.get("website", "") or extracted_site or ""
    # Format URLs (these already include \href commands)
    linkedin_url = format_linkedin_url(p.get("linkedin", ""))
    github_url = format_github_url(p.get("github", ""))
    website_url = format_website_url(raw_website)

    # Format summary
    summary = _sanitize_latex(data.get("summary", ""))
    if not summary:
        summary = "Professional with proven track record of delivering results."
    
    # Basic substitutions
    substitutions = {
        '$name$': name,
        '$email$': email,
        '$phone$': phone,
        '$location$': location,
        '$linkedin$': linkedin_url,
        '$github$': github_url,
        '$website$': website_url,
        '$portfolio$': website_url,  # new placeholder for templates
        '$summary$': summary,
    }
    
    # Format sections
    work_exp = format_work_experience(data.get("workExperience", []))
    education = format_education(data.get("education", []))
    skills = format_skills(data.get("skills", []))
    projects = format_projects(data.get("projects", []))
    certifications = format_certifications(data.get("certifications", []))
    
    # Add section substitutions
    substitutions.update({
        '$work_experience$': work_exp,
        '$education$': education,
        '$skills$': skills,
        '$projects$': projects,
        '$certifications$': certifications,
    })
    
    # Apply substitutions
    result = template_content
    for placeholder, value in substitutions.items():
        result = result.replace(placeholder, value)
    
    return result


def _html_escape(text: str) -> str:
    """HTML escape with None handling"""
    if text is None:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _html_sections_from_data(data: Dict) -> Dict[str, str]:
    """Enhanced HTML section generation with better formatting"""
    
    # Work Experience
    work = []
    for exp in data.get("workExperience", []) or []:
        title = _html_escape(exp.get("title", ""))
        company = _html_escape(exp.get("company", ""))
        start_date = exp.get("startDate", "")
        end_date = exp.get("endDate", "")
        description = _html_escape(exp.get("description", ""))
        
        # Create header
        header_parts = []
        if title:
            header_parts.append(f"<strong>{title}</strong>")
        if company:
            header_parts.append(f"<em>{company}</em>")
        
        header = " at ".join(header_parts) if len(header_parts) == 2 else header_parts[0] if header_parts else "Experience"
        
        # Format date range
        date_range = _format_date_range(start_date, end_date)
        
        # Build item HTML
        item_html = f"<div class='item'>"
        item_html += f"<div class='item-header'><div class='ititle'>{header}</div>"
        if date_range:
            item_html += f"<div class='idate'>{_html_escape(date_range)}</div>"
        item_html += "</div>"
        
        if description:
            # Format description with bullets if it contains newlines
            if '\n' in description or '•' in description:
                lines = [l.strip() for l in description.split('\n') if l.strip()]
                if len(lines) > 1:
                    item_html += "<ul class='desc-list'>"
                    for line in lines:  # Show all bullet points
                        line = re.sub(r'^[•\-\*]\s*', '', line)
                        if line:
                            item_html += f"<li>{line}</li>"
                    item_html += "</ul>"
                else:
                    item_html += f"<div class='ibody'>{description}</div>"
            else:
                item_html += f"<div class='ibody'>{description}</div>"
        
        item_html += "</div>"
        work.append(item_html)
    
    # Education
    education = []
    for edu in data.get("education", []) or []:
        degree = _html_escape(edu.get("degree") or edu.get("title", ""))
        institution = _html_escape(edu.get("institution", ""))
        start_date = edu.get("startDate", "")
        end_date = edu.get("endDate", "")
        gpa = edu.get("gpa", "")
        
        # Create header
        header = degree if degree else "Education"
        if institution:
            if degree:
                header += f" - <em>{institution}</em>"
            else:
                header = f"<em>{institution}</em>"
        
        date_range = _format_date_range(start_date, end_date)
        
        item_html = f"<div class='item'>"
        item_html += f"<div class='item-header'><div class='ititle'>{header}</div>"
        if date_range:
            item_html += f"<div class='idate'>{_html_escape(date_range)}</div>"
        item_html += "</div>"
        
        if gpa:
            item_html += f"<div class='ibody'>GPA: {_html_escape(gpa)}</div>"
        
        item_html += "</div>"
        education.append(item_html)
    
    # Skills with categorization
    skills = []
    tech_skills = []
    soft_skills = []
    
    for sk in data.get("skills", []) or []:
        if isinstance(sk, dict):
            name = _html_escape(sk.get("name", ""))
            category = sk.get("category", "technical").lower()
        else:
            name = _html_escape(str(sk))
            category = "technical"
        
        if name:
            if category == "soft":
                soft_skills.append(name)
            else:
                tech_skills.append(name)
    
    if tech_skills:
        skills.append(f"<div class='skill-category'><strong>Technical:</strong></div>")
        for skill in tech_skills:  # Show all technical skills
            skills.append(f"<span class='skill'>{skill}</span>")
    
    if soft_skills:
        if tech_skills:
            skills.append("<div class='skill-divider'></div>")
        skills.append(f"<div class='skill-category'><strong>Soft Skills:</strong></div>")
        for skill in soft_skills:  # Show all soft skills
            skills.append(f"<span class='skill soft'>{skill}</span>")
    
    # Projects
    projects = []
    for pr in data.get("projects", []) or []:
        title = _html_escape(pr.get("title") or pr.get("name", "Project"))
        description = _html_escape(pr.get("description", ""))
        technologies = _html_escape(pr.get("technologies", ""))
        url = pr.get("url", "")
        
        item_html = "<div class='item'>"
        
        # Title with URL if available
        if url:
            item_html += f"<div class='ititle'><strong>{title}</strong> <a href='{_html_escape(url)}' target='_blank' class='project-link'>[Link]</a></div>"
        else:
            item_html += f"<div class='ititle'><strong>{title}</strong></div>"
        
        # Technologies
        if technologies:
            item_html += f"<div class='tech'><em>Technologies: {technologies}</em></div>"
        
        # Description
        if description:
            item_html += f"<div class='ibody'>{description}</div>"
        
        item_html += "</div>"
        projects.append(item_html)
    
    # Certifications
    certs = []
    for c in data.get("certifications", []) or []:
        name = _html_escape(c.get("name", "Certification"))
        issuer = _html_escape(c.get("issuer", ""))
        date = c.get("date", "")
        
        item_html = "<div class='cert-item'>"
        item_html += f"<div class='cert-name'><strong>{name}</strong></div>"
        
        details = []
        if issuer:
            details.append(issuer)
        if date:
            details.append(_html_escape(date))
        
        if details:
            item_html += f"<div class='cert-details'>{' • '.join(details)}</div>"
        
        item_html += "</div>"
        certs.append(item_html)
    
    return {
        "work": "\n".join(work),
        "education": "\n".join(education),
        "skills": "\n".join(skills),
        "projects": "\n".join(projects),
        "certs": "\n".join(certs),
    }


def render_html_from_data(data: Dict, template: str | None = None) -> HTMLResponse:
    """Enhanced HTML rendering with improved layouts and styling"""
    p = data.get("personalInfo", {})
    name = _html_escape(p.get("name", "Your Name"))
    email = _html_escape(p.get("email", "your.email@example.com"))
    phone = _html_escape(p.get("phone", "(123) 456-7890"))
    location = _html_escape(p.get("location", "City, State"))
    
    # Format URLs
    def _ensure_http(u: str) -> str:
        if not u:
            return ""
        u = u.strip()
        if not u.startswith("http"):
            return "https://" + u
        return u
    
    # LinkedIn
    ln_raw = (p.get("linkedin", "") or "").strip()
    ln = _ensure_http(ln_raw) if ln_raw else ""
    if ln and "linkedin.com" not in ln:
        ln = f"https://www.linkedin.com/in/{ln_raw}"
    ln_html = f'<a href="{_html_escape(ln)}" target="_blank" rel="noopener">LinkedIn</a>' if ln else ""
    
    # GitHub
    gh_raw = (p.get("github", "") or "").strip()
    gh = _ensure_http(gh_raw) if gh_raw else ""
    if gh and "github.com" not in gh:
        gh = f"https://github.com/{gh_raw}"
    gh_html = f'<a href="{_html_escape(gh)}" target="_blank" rel="noopener">GitHub</a>' if gh else ""
    
    # Website / Portfolio: prefer explicit, otherwise try to extract
    extracted_site = extract_portfolio_link(data)
    ws_raw = (p.get("website", "") or p.get("portfolio", "") or extracted_site or "").strip()
    ws = _ensure_http(ws_raw) if ws_raw else ""
    ws_html = f'<a href="{_html_escape(ws)}" target="_blank" rel="noopener">Website</a>' if ws else ""
    
    summary = _html_escape(data.get("summary", "Professional with proven track record of delivering results."))
    
    tname = (template or "billryan_basic").lower()
    sections = _html_sections_from_data(data)

    # Ensure templates can reference portfolio explicitly if needed (example placeholder already added above).
    # The rest of the function remains unchanged and templates will show ws_html where appropriate.

    # Common styles used across templates
    common_styles = """
        .item-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
        .idate { color: #6b7280; font-size: 13px; white-space: nowrap; }
        .desc-list { margin: 8px 0 0 20px; padding: 0; }
        .desc-list li { margin: 4px 0; }
        .tech { color: #6366f1; font-size: 13px; margin: 4px 0; }
        .project-link { color: #4f46e5; text-decoration: none; font-size: 12px; margin-left: 8px; }
        .project-link:hover { text-decoration: underline; }
        .skill-category { margin: 8px 0 4px; font-size: 13px; color: #374151; }
        .skill-divider { height: 8px; }
        .cert-item { margin: 8px 0; }
        .cert-details { color: #6b7280; font-size: 13px; margin-top: 2px; }
    """
    
    # Executive Maroon Template - Professional with Maroon Accent
    if "template1" in tname:
        primary = "#8b0000"
        accent = "#c41e3a"
        html = f"""
<!doctype html>
<html>
  <head>
    <meta charset='utf-8'/>
    <title>Resume - {name}</title>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 48px auto; max-width: 850px; color: #222; line-height: 1.6; padding: 0 24px; }}
      .head {{ text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid {primary}; }}
      .head h1 {{ font-size: 44px; font-weight: 700; color: {primary}; margin-bottom: 8px; letter-spacing: 0.5px; }}
      .contact {{ color: #555; font-size: 14px; margin-top: 10px; }}
      .contact a {{ color: {accent}; text-decoration: none; font-weight: 500; }}
      .contact a:hover {{ text-decoration: underline; }}
      h2 {{ color: #fff; background: {primary}; margin: 28px 0 12px 0; padding: 10px 16px; font-size: 16px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; border-left: 5px solid {accent}; }}
      .summary {{ background: #faf8f6; border-left: 4px solid {accent}; padding: 16px 20px; border-radius: 4px; margin-bottom: 20px; line-height: 1.8; }}
      .item {{ margin: 16px 0; padding-bottom: 0; }}
      .item:not(:last-child) {{ padding-bottom: 16px; border-bottom: 1px solid #e8e8e8; }}
      .ititle {{ font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 15px; }}
      .ibody {{ color: #555; margin-top: 6px; }}
      .skill {{ display: inline-block; margin: 4px 8px 4px 0; padding: 5px 12px; background: {primary}; color: white; border-radius: 3px; font-size: 11px; font-weight: 500; }}
      .skill.soft {{ background: {accent}; }}
      {common_styles}
      @media print {{ body {{ margin: 24px auto; }} }}
    </style>
  </head>
  <body>
    <div class='head'>
      <h1>{name}</h1>
      <div class='contact'>{email} · {phone} · {location}{' · ' + ln_html if ln_html else ''}{' · ' + gh_html if gh_html else ''}{' · ' + ws_html if ws_html else ''}</div>
    </div>
    {f"<h2>Professional Summary</h2><div class='summary'>{summary}</div>" if summary else ''}
    {f"<h2>Work Experience</h2><div>{sections['work']}</div>" if sections['work'] else ''}
    {f"<h2>Education</h2><div>{sections['education']}</div>" if sections['education'] else ''}
    {f"<h2>Skills</h2><div class='skills'>{sections['skills']}</div>" if sections['skills'] else ''}
    {f"<h2>Projects</h2><div>{sections['projects']}</div>" if sections['projects'] else ''}
    {f"<h2>Certifications</h2><div>{sections['certs']}</div>" if sections['certs'] else ''}
  </body>
</html>
"""
        return HTMLResponse(content=html)
    
    # Modern Executive Template - Two Column with Sidebar
    if "modern_executive" in tname:
        primary = "#1f2937"
        accent = "#4f46e5"
        html = f"""
<!doctype html>
<html>
  <head>
    <meta charset='utf-8'/>
    <title>Resume - {name}</title>
    <style>
      :root {{ --primary: {primary}; --accent: {accent}; }}
      * {{ box-sizing: border-box; margin: 0; padding: 0; }}
      body {{ font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; color: #111827; }}
      .container {{ display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }}
      .sidebar {{ background: #111827; color: #e5e7eb; padding: 32px 24px; }}
      .avatar {{ width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, {accent}, #9333ea); margin-bottom: 20px; display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 700; color: white; }}
      .name {{ color: #fff; font-weight: 800; font-size: 24px; line-height: 1.2; margin-bottom: 6px; }}
      .role {{ color: #c7d2fe; font-size: 14px; margin-bottom: 20px; }}
      .side-block {{ margin-top: 28px; }}
      .sb-title {{ font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #9ca3af; margin-bottom: 10px; font-weight: 600; }}
      .contact {{ list-style: none; }}
      .contact li {{ margin: 8px 0; font-size: 13px; color: #e5e7eb; word-break: break-word; }}
      .contact a {{ color: #a5b4fc; text-decoration: none; }}
      .contact a:hover {{ text-decoration: underline; }}
      .skill {{ display: inline-block; margin: 4px 6px 4px 0; padding: 5px 12px; border-radius: 999px; font-size: 11px; background: #1f2937; border: 1px solid #374151; color: #e5e7eb; }}
      .skill.soft {{ background: #2563eb; border-color: #3b82f6; color: #dbeafe; }}
      .content {{ padding: 40px 48px; background: #fff; }}
      h1 {{ font-size: 36px; font-weight: 900; color: var(--primary); margin-bottom: 8px; }}
      .subtitle {{ color: #6b7280; font-size: 15px; margin-bottom: 24px; }}
      h2 {{ margin: 28px 0 12px; font-size: 15px; letter-spacing: .12em; text-transform: uppercase; color: var(--primary); font-weight: 700; border-bottom: 3px solid var(--accent); padding-bottom: 6px; }}
      h2:first-of-type {{ margin-top: 0; }}
      .summary {{ background: #f8fafc; border-left: 4px solid var(--accent); padding: 16px 20px; border-radius: 4px; margin-bottom: 20px; line-height: 1.7; }}
      .item {{ margin: 16px 0; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }}
      .item:last-child {{ border-bottom: none; }}
      .ititle {{ font-weight: 600; color: #111827; font-size: 15px; }}
      .ibody {{ color: #4b5563; margin-top: 6px; line-height: 1.6; }}
      {common_styles}
      @media print {{ 
        .container {{ grid-template-columns: 240px 1fr; }}
        .content {{ padding: 28px 36px; }}
        .sidebar {{ padding: 24px 18px; }}
      }}
    </style>
  </head>
  <body>
    <div class='container'>
      <aside class='sidebar'>
        <div class='avatar'>{name[0] if name and name[0].isalpha() else 'U'}</div>
        <div class='name'>{name}</div>
        <div class='side-block'>
          <div class='sb-title'>Contact</div>
          <ul class='contact'>
            <li>{email}</li>
            <li>{phone}</li>
            <li>{location}</li>
            {f"<li>{ln_html}</li>" if ln_html else ''}
            {f"<li>{gh_html}</li>" if gh_html else ''}
            {f"<li>{ws_html}</li>" if ws_html else ''}
          </ul>
        </div>
        {f"<div class='side-block'><div class='sb-title'>Skills</div><div class='skills-wrap'>{sections['skills']}</div></div>" if sections['skills'] else ''}
        {f"<div class='side-block'><div class='sb-title'>Certifications</div><div>{sections['certs']}</div></div>" if sections['certs'] else ''}
      </aside>
      <main class='content'>
        <h1>{name}</h1>
        <div class='subtitle'>{email} · {phone} · {location}</div>
        {f"<h2>Professional Summary</h2><div class='summary'>{summary}</div>" if summary else ''}
        {f"<h2>Work Experience</h2><div>{sections['work']}</div>" if sections['work'] else ''}
        {f"<h2>Projects</h2><div>{sections['projects']}</div>" if sections['projects'] else ''}
        {f"<h2>Education</h2><div>{sections['education']}</div>" if sections['education'] else ''}
      </main>
    </div>
  </body>
</html>
"""
        return HTMLResponse(content=html)
    
    # Bill Ryan Modern Template
    if "billryan_modern" in tname:
        primary = "#2c3e50"
        accent = "#3498db"
        html = f"""
<!doctype html>
<html>
  <head>
    <meta charset='utf-8'/>
    <title>Resume - {name}</title>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 48px auto; max-width: 850px; color: #333; line-height: 1.6; padding: 0 24px; }}
      .head {{ text-align: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid {primary}; }}
      .head h1 {{ font-size: 42px; font-weight: 700; color: {primary}; margin-bottom: 8px; }}
      .contact {{ color: #555; font-size: 14px; margin-top: 8px; }}
      .contact a {{ color: {accent}; text-decoration: none; }}
      .contact a:hover {{ text-decoration: underline; }}
      h2 {{ color: {primary}; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #d0d7de; font-size: 17px; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; }}
      h2:first-of-type {{ margin-top: 0; }}
      .summary {{ background: #f5f7fb; border-left: 4px solid {accent}; padding: 16px 20px; border-radius: 6px; margin-bottom: 24px; line-height: 1.7; }}
      .skills {{ display: flex; flex-wrap: wrap; gap: 8px; }}
      .skill {{ background: #ecf0f1; padding: 6px 14px; border-radius: 16px; font-size: 12px; color: #2c3e50; font-weight: 500; }}
      .skill.soft {{ background: #dbeafe; color: #1e40af; }}
      .item {{ margin: 16px 0; }}
      .ititle {{ font-weight: 600; color: #111827; margin-bottom: 4px; }}
      .ibody {{ color: #4b5563; margin-top: 6px; }}
      {common_styles}
      @media print {{ body {{ margin: 24px auto; }} }}
    </style>
  </head>
  <body>
    <div class='head'>
      <h1>{name}</h1>
      <div class='contact'>{email} · {phone} · {location}{' · ' + ln_html if ln_html else ''}{' · ' + gh_html if gh_html else ''}{' · ' + ws_html if ws_html else ''}</div>
    </div>
    {f"<h2>Professional Summary</h2><div class='summary'>{summary}</div>" if summary else ''}
    {f"<h2>Work Experience</h2><div>{sections['work']}</div>" if sections['work'] else ''}
    {f"<h2>Education</h2><div>{sections['education']}</div>" if sections['education'] else ''}
    {f"<h2>Skills</h2><div class='skills'>{sections['skills']}</div>" if sections['skills'] else ''}
    {f"<h2>Projects</h2><div>{sections['projects']}</div>" if sections['projects'] else ''}
    {f"<h2>Certifications</h2><div>{sections['certs']}</div>" if sections['certs'] else ''}
  </body>
</html>
"""
        return HTMLResponse(content=html)
    
    # Classic Professional Template
    if "classic_professional" in tname:
        primary = "#0f172a"
        html = f"""
<!doctype html>
<html>
  <head>
    <meta charset='utf-8'/>
    <title>Resume - {name}</title>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      body {{ font-family: Georgia, 'Times New Roman', serif; margin: 40px auto; max-width: 850px; color: #222; line-height: 1.7; padding: 0 24px; }}
      .head {{ text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #cbd5e1; }}
      .head h1 {{ font-size: 40px; font-weight: 700; color: {primary}; margin-bottom: 6px; }}
      .contact {{ color: #444; font-size: 14px; }}
      .contact a {{ color: #334155; text-decoration: none; }}
      .contact a:hover {{ text-decoration: underline; }}
      h2 {{ margin: 28px 0 10px; font-size: 17px; letter-spacing: .04em; text-transform: uppercase; color: {primary}; font-weight: 700; border-bottom: 1px solid #94a3b8; padding-bottom: 6px; }}
      .summary {{ margin-bottom: 20px; text-align: justify; line-height: 1.8; }}
      .item {{ margin: 14px 0; }}
      .ititle {{ font-weight: 600; color: #111827; }}
      .ibody {{ color: #4b5563; margin-top: 6px; }}
      .skill {{ display: inline; margin-right: 8px; }}
      .skill::after {{ content: '·'; margin-left: 8px; color: #94a3b8; }}
      .skill:last-child::after {{ content: ''; }}
      {common_styles}
      @media print {{ body {{ margin: 24px auto; }} }}
    </style>
  </head>
  <body>
    <div class='head'>
      <h1>{name}</h1>
      <div class='contact'>{email} · {phone} · {location}{' · ' + ln_html if ln_html else ''}{' · ' + gh_html if gh_html else ''}{' · ' + ws_html if ws_html else ''}</div>
    </div>
    {f"<h2>Professional Summary</h2><div class='summary'>{summary}</div>" if summary else ''}
    {f"<h2>Work Experience</h2><div>{sections['work']}</div>" if sections['work'] else ''}
    {f"<h2>Education</h2><div>{sections['education']}</div>" if sections['education'] else ''}
    {f"<h2>Skills</h2><div>{sections['skills']}</div>" if sections['skills'] else ''}
    {f"<h2>Projects</h2><div>{sections['projects']}</div>" if sections['projects'] else ''}
    {f"<h2>Certifications</h2><div>{sections['certs']}</div>" if sections['certs'] else ''}
  </body>
</html>
"""
        return HTMLResponse(content=html)
    
    # Minimal Clean Template
    if "minimal_clean" in tname:
        html = f"""
<!doctype html>
<html>
  <head>
    <meta charset='utf-8'/>
    <title>Resume - {name}</title>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      body {{ font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; margin: 56px auto; max-width: 850px; color: #1f2937; line-height: 1.8; padding: 0 24px; }}
      .head {{ margin-bottom: 32px; }}
      .head h1 {{ font-size: 36px; font-weight: 700; color: #111827; margin-bottom: 8px; }}
      .contact {{ color: #6b7280; font-size: 14px; }}
      .contact a {{ color: #4f46e5; text-decoration: none; }}
      .contact a:hover {{ text-decoration: underline; }}
      section {{ margin: 32px 0; }}
      section h2 {{ margin: 0 0 12px; font-size: 16px; letter-spacing: .08em; text-transform: uppercase; color: #111827; font-weight: 700; }}
      .summary {{ line-height: 1.8; color: #374151; }}
      .item {{ margin: 14px 0; }}
      .ititle {{ font-weight: 600; color: #111827; }}
      .ibody {{ color: #6b7280; margin-top: 6px; }}
      .skills .skill {{ display: inline-block; margin: 4px 8px 4px 0; padding: 4px 12px; border: 1px solid #e5e7eb; border-radius: 14px; font-size: 12px; color: #374151; }}
      .skills .skill.soft {{ border-color: #c7d2fe; background: #f5f3ff; color: #5b21b6; }}
      {common_styles}
      @media print {{ body {{ margin: 28px auto; }} }}
    </style>
  </head>
  <body>
    <div class='head'>
      <h1>{name}</h1>
      <div class='contact'>{email} · {phone} · {location}{' · ' + ln_html if ln_html else ''}{' · ' + gh_html if gh_html else ''}{' · ' + ws_html if ws_html else ''}</div>
    </div>
    {f"<section><h2>Professional Summary</h2><div class='summary'>{summary}</div></section>" if summary else ''}
    {f"<section><h2>Work Experience</h2><div>{sections['work']}</div></section>" if sections['work'] else ''}
    {f"<section><h2>Education</h2><div>{sections['education']}</div></section>" if sections['education'] else ''}
    {f"<section class='skills'><h2>Skills</h2><div>{sections['skills']}</div></section>" if sections['skills'] else ''}
    {f"<section><h2>Projects</h2><div>{sections['projects']}</div></section>" if sections['projects'] else ''}
    {f"<section><h2>Certifications</h2><div>{sections['certs']}</div></section>" if sections['certs'] else ''}
  </body>
</html>
"""
        return HTMLResponse(content=html)
    
    # Default: Bill Ryan Basic Template
    html = f"""
<!doctype html>
<html>
  <head>
    <meta charset='utf-8'/>
    <title>Resume - {name}</title>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 48px auto; max-width: 850px; color: #333; line-height: 1.6; padding: 0 24px; }}
      .head {{ text-align: center; margin-bottom: 28px; }}
      .head h1 {{ font-size: 38px; font-weight: 600; color: #223; margin-bottom: 8px; }}
      .contact {{ color: #666; font-size: 14px; }}
      .contact a {{ color: #2c3e50; text-decoration: none; }}
      .contact a:hover {{ text-decoration: underline; }}
      .rule {{ border-top: 2px solid #2c3e50; margin: 24px 0; }}
      h2 {{ margin: 28px 0 12px; font-size: 17px; letter-spacing: .06em; text-transform: uppercase; color: #2c3e50; font-weight: 700; }}
      .summary {{ line-height: 1.7; margin-bottom: 20px; }}
      .skills {{ display: flex; flex-wrap: wrap; gap: 8px; }}
      .skill {{ background: #eef2f7; padding: 6px 14px; border-radius: 16px; font-size: 12px; color: #2c3e50; }}
      .skill.soft {{ background: #dbeafe; color: #1e40af; }}
      .item {{ margin: 14px 0; }}
      .ititle {{ font-weight: 600; color: #111827; margin-bottom: 4px; }}
      .ibody {{ color: #4b5563; margin-top: 6px; }}
      {common_styles}
      @media print {{ body {{ margin: 24px auto; }} }}
    </style>
  </head>
  <body>
    <div class='head'>
      <h1>{name}</h1>
      <div class='contact'>{email} · {phone} · {location}{' · ' + ln_html if ln_html else ''}{' · ' + gh_html if gh_html else ''}{' · ' + ws_html if ws_html else ''}</div>
      <div class='rule'></div>
    </div>
    {f"<h2>Professional Summary</h2><div class='summary'>{summary}</div>" if summary else ''}
    {f"<h2>Work Experience</h2><div>{sections['work']}</div>" if sections['work'] else ''}
    {f"<h2>Education</h2><div>{sections['education']}</div>" if sections['education'] else ''}
    {f"<h2>Skills</h2><div class='skills'>{sections['skills']}</div>" if sections['skills'] else ''}
    {f"<h2>Projects</h2><div>{sections['projects']}</div>" if sections['projects'] else ''}
    {f"<h2>Certifications</h2><div>{sections['certs']}</div>" if sections['certs'] else ''}
  </body>
</html>
"""
    return HTMLResponse(content=html)


def _find_pdflatex_executable() -> Optional[str]:
    """Find pdflatex executable with expanded search"""
    candidates = [
        'pdflatex',
        '/usr/bin/pdflatex',
        '/usr/local/bin/pdflatex',
        '/Library/TeX/texbin/pdflatex',
        os.path.expandvars(r"%ProgramFiles%\MiKTeX\miktex\bin\x64\pdflatex.exe"),
        os.path.expandvars(r"%LocalAppData%\Programs\MiKTeX\miktex\bin\x64\pdflatex.exe"),
        os.path.expandvars(r"%ProgramFiles%\MiKTeX 2.9\miktex\bin\x64\pdflatex.exe"),
        os.path.expanduser("~/Library/TeX/texbin/pdflatex"),
    ]
    
    # First try which/where command
    try:
        result = subprocess.run(['which', 'pdflatex'], capture_output=True, text=True, timeout=5)
        if result.returncode == 0 and result.stdout.strip():
            path = result.stdout.strip()
            if os.path.isfile(path):
                return path
    except Exception:
        pass
    
    # Then check candidates
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    
    return None


def render_pdf_from_template(template_name: str, data: Dict) -> StreamingResponse:
    """Enhanced PDF rendering with better error handling and LaTeX compilation"""
    try:
        # Find template file
        template_paths = [
            os.path.join(os.path.dirname(__file__), "templates", template_name),
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", template_name),
            os.path.join("templates", template_name),
        ]
        
        template_path = None
        for path in template_paths:
            if os.path.exists(path):
                template_path = path
                break
        
        if not template_path:
            print(f"Template not found: {template_name}")
            return render_pdf_placeholder()
        
        # Read template
        try:
            with open(template_path, 'r', encoding='utf-8') as f:
                template_content = f.read()
        except Exception as e:
            print(f"Error reading template: {e}")
            return render_pdf_placeholder()
        
        # Substitute variables
        latex_content = substitute_template_variables(template_content, data)
        
        # Find pdflatex
        pdflatex = _find_pdflatex_executable()
        if not pdflatex:
            print("pdflatex not found")
            return render_pdf_placeholder()
        
        # Create temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            tex_file = os.path.join(temp_dir, "resume.tex")
            pdf_file = os.path.join(temp_dir, "resume.pdf")
            
            # Write LaTeX content
            with open(tex_file, 'w', encoding='utf-8') as f:
                f.write(latex_content)
            
            # Compile LaTeX to PDF (two passes for references)
            compile_args = [
                pdflatex,
                '-interaction=nonstopmode',
                '-halt-on-error',
                '-output-directory', temp_dir,
                tex_file,
            ]
            
            try:
                # First pass
                result1 = subprocess.run(
                    compile_args,
                    capture_output=True,
                    text=True,
                    timeout=60,
                    cwd=temp_dir
                )
                
                # Second pass (for cross-references)
                result2 = subprocess.run(
                    compile_args,
                    capture_output=True,
                    text=True,
                    timeout=60,
                    cwd=temp_dir
                )
                
                # Check if PDF was created
                if os.path.exists(pdf_file):
                    # Verify PDF is valid (has content)
                    if os.path.getsize(pdf_file) > 1000:  # At least 1KB
                        with open(pdf_file, 'rb') as f:
                            pdf_content = f.read()
                        
                        return StreamingResponse(
                            BytesIO(pdf_content),
                            media_type="application/pdf",
                            headers={"Content-Disposition": "attachment; filename=resume.pdf"}
                        )
                
                # If we get here, compilation failed
                print(f"LaTeX compilation failed:")
                print(f"Pass 1 return code: {result1.returncode}")
                print(f"Pass 2 return code: {result2.returncode}")
                if result2.stderr:
                    print(f"Errors: {result2.stderr[:1000]}")
                
                return render_pdf_placeholder()
                
            except subprocess.TimeoutExpired:
                print("LaTeX compilation timeout")
                return render_pdf_placeholder()
            except Exception as e:
                print(f"LaTeX compilation error: {e}")
                return render_pdf_placeholder()
    
    except Exception as e:
        print(f"PDF generation error: {e}")
        import traceback
        traceback.print_exc()
        return render_pdf_placeholder()


def render_pdf_placeholder() -> StreamingResponse:
    """Enhanced PDF placeholder with better formatting"""
    buf = BytesIO()
    
    # Minimal valid PDF with centered text
    pdf_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>
endobj
4 0 obj
<< /Length 280 >>
stream
BT
/F1 24 Tf
72 720 Td
(Resume PDF) Tj
0 -40 Td
/F2 12 Tf
(LaTeX is not available on this system.) Tj
0 -30 Td
(To generate PDF resumes, please install:) Tj
0 -20 Td
(- MiKTeX on Windows) Tj
0 -20 Td
(- MacTeX on macOS) Tj
0 -20 Td
(- TeX Live on Linux) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
6 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000262 00000 n 
0000000593 00000 n 
0000000675 00000 n 
trailer
<< /Size 7 /Root 1 0 R >>
startxref
752
%%EOF
"""
    
    buf.write(pdf_content)
    buf.seek(0)
    
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=resume_placeholder.pdf"}
    )