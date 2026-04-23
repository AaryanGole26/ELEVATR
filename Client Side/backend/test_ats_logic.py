#!/usr/bin/env python3
"""
Test script to demonstrate ATS score calculation logic
This shows how the ATS compatibility score is calculated independently from skill matching
"""

def calculate_ats_score_demo(resume_text, job_description):
    """
    Demo version of ATS score calculation (without external dependencies)
    """
    resume_text = resume_text.lower()
    job_description_lower = job_description.lower()
    
    print("=== ATS SCORE CALCULATION DEMO ===")
    print(f"Resume text: {resume_text[:100]}...")
    print(f"Job description: {job_description_lower[:100]}...")
    print()
    
    # 1. Resume Structure Score (35% weight)
    print("1. RESUME STRUCTURE SCORE (35% weight):")
    structure_score = 0
    essential_sections = ["experience", "education", "skills", "summary", "objective", "contact", "phone", "email"]
    
    for section in essential_sections:
        if section in resume_text:
            structure_score += 12.5
            print(f"   ✓ Found '{section}' section (+12.5 points)")
        else:
            print(f"   ✗ Missing '{section}' section")
    
    print(f"   Structure Score: {structure_score}/100")
    print()
    
    # 2. ATS-Friendly Formatting Score (25% weight)
    print("2. ATS-FRIENDLY FORMATTING SCORE (25% weight):")
    formatting_score = 0
    
    # Check for bullet points
    if "•" in resume_text or "-" in resume_text:
        formatting_score += 20
        print("   ✓ Found bullet points (+20 points)")
    else:
        print("   ✗ No bullet points found")
    
    # Check for action words
    action_words = ["years", "experience", "worked"]
    if any(word in resume_text for word in action_words):
        formatting_score += 20
        print("   ✓ Found action words (+20 points)")
    else:
        print("   ✗ No action words found")
    
    # Check for education keywords
    education_keywords = ["bachelor", "master", "degree", "certification"]
    if any(word in resume_text for word in education_keywords):
        formatting_score += 20
        print("   ✓ Found education keywords (+20 points)")
    else:
        print("   ✗ No education keywords found")
    
    # Check for action verbs
    action_verbs = ["developed", "managed", "led", "created", "implemented"]
    if any(word in resume_text for word in action_verbs):
        formatting_score += 20
        print("   ✓ Found action verbs (+20 points)")
    else:
        print("   ✗ No action verbs found")
    
    # Check for quantified achievements
    if any(char.isdigit() for char in resume_text):
        formatting_score += 20
        print("   ✓ Found quantified achievements (+20 points)")
    else:
        print("   ✗ No quantified achievements found")
    
    print(f"   Formatting Score: {formatting_score}/100")
    print()
    
    # 3. Job Description Keyword Density (25% weight)
    print("3. KEYWORD DENSITY SCORE (25% weight):")
    job_keywords = []
    
    # Extract important words from job description
    important_words = ["experience", "skills", "knowledge", "proficiency", "expertise", "familiarity", "understanding"]
    for word in important_words:
        if word in job_description_lower:
            job_keywords.append(word)
    
    # Add technical terms
    tech_terms = ["python", "javascript", "react", "angular", "vue", "node", "sql", "database", "api", "cloud", "aws", "azure", "docker", "kubernetes"]
    for term in tech_terms:
        if term in job_description_lower:
            job_keywords.append(term)
    
    print(f"   Keywords to match: {job_keywords}")
    
    keyword_matches = sum(1 for keyword in job_keywords if keyword in resume_text)
    keyword_density_score = min(100, (keyword_matches / len(job_keywords)) * 100) if job_keywords else 50
    
    print(f"   Matched keywords: {keyword_matches}/{len(job_keywords)}")
    print(f"   Keyword Density Score: {keyword_density_score}/100")
    print()
    
    # 4. Contact Information Completeness (15% weight)
    print("4. CONTACT INFORMATION SCORE (15% weight):")
    contact_score = 0
    contact_elements = ["email", "phone", "linkedin", "github", "portfolio", "website"]
    
    for element in contact_elements:
        if element in resume_text:
            contact_score += 16.67
            print(f"   ✓ Found '{element}' (+16.67 points)")
        else:
            print(f"   ✗ Missing '{element}'")
    
    print(f"   Contact Score: {contact_score}/100")
    print()
    
    # Calculate weighted ATS score
    ats_score = (
        structure_score * 0.35 +
        formatting_score * 0.25 +
        keyword_density_score * 0.25 +
        contact_score * 0.15
    )
    
    print("=== FINAL ATS SCORE CALCULATION ===")
    print(f"Structure Score: {structure_score} × 0.35 = {structure_score * 0.35:.1f}")
    print(f"Formatting Score: {formatting_score} × 0.25 = {formatting_score * 0.25:.1f}")
    print(f"Keyword Density: {keyword_density_score} × 0.25 = {keyword_density_score * 0.25:.1f}")
    print(f"Contact Score: {contact_score} × 0.15 = {contact_score * 0.15:.1f}")
    print(f"TOTAL ATS SCORE: {ats_score:.1f}%")
    
    # Grade calculation
    if ats_score >= 90:
        grade = "A+"
    elif ats_score >= 85:
        grade = "A"
    elif ats_score >= 80:
        grade = "A-"
    elif ats_score >= 75:
        grade = "B+"
    elif ats_score >= 70:
        grade = "B"
    elif ats_score >= 65:
        grade = "B-"
    elif ats_score >= 60:
        grade = "C+"
    elif ats_score >= 55:
        grade = "C"
    elif ats_score >= 50:
        grade = "C-"
    else:
        grade = "D"
    
    print(f"ATS GRADE: {grade}")
    
    return {
        "overall_ats_score": round(ats_score, 1),
        "structure_score": round(structure_score, 1),
        "formatting_score": round(formatting_score, 1),
        "keyword_density_score": round(keyword_density_score, 1),
        "contact_score": round(contact_score, 1),
        "ats_grade": grade
    }

# Test with sample data
if __name__ == "__main__":
    print("Testing ATS Score Calculation Logic")
    print("=" * 50)
    
    # Sample resume text
    sample_resume = """
    John Doe
    Email: john.doe@email.com
    Phone: (555) 123-4567
    
    SUMMARY
    Experienced software developer with 5 years of experience in Python, JavaScript, and React.
    
    EXPERIENCE
    • Developed web applications using Python and Django
    • Managed a team of 3 developers
    • Led implementation of new features
    • Created REST APIs for mobile applications
    
    EDUCATION
    Bachelor's Degree in Computer Science
    Master's Degree in Software Engineering
    
    SKILLS
    Python, JavaScript, React, Node.js, SQL, AWS, Docker
    """
    
    # Sample job description
    sample_job = """
    We are looking for a Senior Software Developer with experience in Python, JavaScript, and React.
    The ideal candidate should have knowledge of cloud technologies like AWS and Docker.
    Proficiency in database management and API development is required.
    """
    
    result = calculate_ats_score_demo(sample_resume, sample_job)
    
    print("\n" + "=" * 50)
    print("SUMMARY:")
    print(f"Overall ATS Score: {result['overall_ats_score']}%")
    print(f"Grade: {result['ats_grade']}")
    print(f"Structure: {result['structure_score']}%")
    print(f"Formatting: {result['formatting_score']}%")
    print(f"Keywords: {result['keyword_density_score']}%")
    print(f"Contact: {result['contact_score']}%")
