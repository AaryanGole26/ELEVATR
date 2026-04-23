"""
Job Link Extractor Module

Extracts job title and description from job listing URLs using a multi-layer strategy:
1. RapidAPI JSearch API (primary method - safe, structured data)
2. Selenium Dynamic Page Rendering (headless Chrome for JS-heavy sites)
3. BeautifulSoup Static HTML Parsing (lightweight fallback)

This module safely extracts job data without being rate-limited or IP-banned.
"""

import os
import re
import time
import random
import requests
from typing import Dict, Optional, Tuple
from urllib.parse import urlparse
from io import BytesIO

# Optional dependencies
try:
    from bs4 import BeautifulSoup
    HAS_BEAUTIFULSOUP = True
except ImportError:
    HAS_BEAUTIFULSOUP = False

try:
    from PyPDF2 import PdfReader
    HAS_PDFPYTHON = True
except ImportError:
    HAS_PDFPYTHON = False

try:
    import docx
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

# Selenium (optional — Layer 2)
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.chrome.service import Service as ChromeService
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    HAS_SELENIUM = True
except ImportError:
    HAS_SELENIUM = False

try:
    from webdriver_manager.chrome import ChromeDriverManager
    HAS_WEBDRIVER_MANAGER = True
except ImportError:
    HAS_WEBDRIVER_MANAGER = False


# ============================================================================
# BLOCKED SITES DETECTION
# ============================================================================

BLOCKED_SITES = {
    "linkedin.com": (
        "LinkedIn blocks automated extraction. "
        "Please copy-paste the job description directly from the LinkedIn job posting."
    ),
    "glassdoor.": (
        "Glassdoor may block automated extraction. "
        "Please paste the job description directly."
    ),
}


def _is_blocked_site(url: str) -> Optional[str]:
    """Return a warning message if the URL is a blocked/restricted site, else None."""
    url_lower = url.lower()
    for domain, message in BLOCKED_SITES.items():
        if domain in url_lower:
            return message
    return None


# ============================================================================
# LAYER 1 — RAPIDAPI JSEARCH (Primary Method)
# ============================================================================

def extract_job_from_api(url: str, api_key: Optional[str] = None) -> Optional[Dict[str, str]]:
    """
    Extract job title and description using RapidAPI JSearch.
    
    This is the PRIMARY method because:
    - Returns structured, clean data (JSON)
    - Safe (no HTML parsing, no bot detection)
    - Avoids IP bans and rate limiting
    - Works across LinkedIn, Indeed, Glassdoor, Naukri, etc.
    
    Args:
        url: Job listing URL
        api_key: RapidAPI key (defaults to env var RAPIDAPI_KEY)
        
    Returns:
        Dict with 'job_title' and 'job_description', or None if API fails
    """
    if not api_key:
        api_key = os.getenv("RAPIDAPI_KEY", "").strip()
    
    if not api_key:
        print("[api-extract] No RapidAPI key configured, skipping API method")
        return None
    
    # Extract job ID from common job board URLs
    job_id = _extract_job_id(url)
    if not job_id:
        print(f"[api-extract] Could not extract job ID from URL: {url}")
        return None
    
    # Prepare RapidAPI request
    api_url = "https://jsearch.p.rapidapi.com/jobs-details"
    headers = {
        "x-rapidapi-key": api_key,
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
    }
    params = {
        "job_id": job_id,
    }
    
    try:
        print(f"[api-extract] Calling RapidAPI JSearch for job_id={job_id}")
        resp = requests.get(api_url, headers=headers, params=params, timeout=10)
        
        if resp.status_code != 200:
            print(f"[api-extract] JSearch API error: {resp.status_code} {resp.text[:200]}")
            return None
        
        data = resp.json()
        
        # Extract from API response
        if data.get("data") and len(data["data"]) > 0:
            job = data["data"][0]
            job_title = job.get("job_title", "").strip()
            job_description = job.get("job_description", "").strip()
            
            if job_title and job_description:
                print(f"[api-extract] Successfully extracted: {job_title[:50]}")
                return {
                    "job_title": job_title,
                    "job_description": job_description,
                }
        
        print("[api-extract] No job data in API response")
        return None
        
    except requests.exceptions.Timeout:
        print("[api-extract] RapidAPI request timeout")
        return None
    except requests.exceptions.RequestException as e:
        print(f"[api-extract] RapidAPI request error: {e}")
        return None
    except (ValueError, KeyError) as e:
        print(f"[api-extract] Error parsing API response: {e}")
        return None


def _extract_job_id(url: str) -> Optional[str]:
    """
    Extract job ID from common job board URLs.
    
    Supports:
    - Indeed: /jobs?jk=XXXXXXXXXX or /viewjob?jk=XXXXXXXXXX
    - Glassdoor: /job-listing/XXXXXXXXXX
    - Naukri: /job-XXXXXXXXXX-something
    - Generic: Extract numeric/alphanum ID from URL
    """
    url_lower = url.lower()
    
    # Indeed
    if "indeed.com" in url_lower:
        match = re.search(r'[?&]jk=([a-zA-Z0-9]+)', url)
        if match:
            return match.group(1)
    
    # Glassdoor
    if "glassdoor" in url_lower:
        match = re.search(r'/job-listing/(\d+)', url)
        if match:
            return match.group(1)
    
    # Naukri
    if "naukri.com" in url_lower:
        match = re.search(r'/job-(\d+)-', url)
        if match:
            return match.group(1)
    
    # Generic: last numeric segment (at least 6 digits)
    match = re.search(r'/(\d{6,})', url)
    if match:
        return match.group(1)
    
    return None


# ============================================================================
# LAYER 2 — SELENIUM DYNAMIC PAGE RENDERING
# ============================================================================

def extract_via_selenium(url: str) -> Optional[Dict[str, str]]:
    """
    Layer 2: Use headless Chrome via Selenium to render JS-heavy pages.
    
    Workflow:
    1. Open job link in headless browser
    2. Wait for DOM to load (with realistic delay)
    3. Capture rendered HTML
    4. Pass HTML to BeautifulSoup for parsing
    
    Security:
    - Single page fetch only (no crawling)
    - Random delay (2-4 seconds) to avoid bot detection
    - Realistic user-agent header
    - Headless mode to avoid UI overhead
    """
    if not HAS_SELENIUM:
        print("[selenium] Selenium not installed, skipping Layer 2")
        return None
    
    if not HAS_BEAUTIFULSOUP:
        print("[selenium] BeautifulSoup not installed, cannot parse Selenium output")
        return None
    
    driver = None
    try:
        # Add realistic delay before request (2-4 seconds)
        delay = random.uniform(2.0, 4.0)
        print(f"[selenium] Waiting {delay:.1f}s before fetching (anti-bot delay)...")
        time.sleep(delay)
        
        # Configure headless Chrome
        chrome_options = ChromeOptions()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--disable-infobars")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument(
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        # Disable automation flags to reduce bot detection
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option("useAutomationExtension", False)
        
        # Create driver
        if HAS_WEBDRIVER_MANAGER:
            print("[selenium] Using webdriver-manager to get ChromeDriver...")
            service = ChromeService(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
        else:
            print("[selenium] Using system ChromeDriver...")
            driver = webdriver.Chrome(options=chrome_options)
        
        # Set page load timeout
        driver.set_page_load_timeout(20)
        
        print(f"[selenium] Loading page: {url[:80]}...")
        driver.get(url)
        
        # Wait for body to be present (basic check that page loaded)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        
        # Additional wait for dynamic content to render
        time.sleep(2)
        
        # Get the rendered HTML
        rendered_html = driver.page_source
        
        if not rendered_html or len(rendered_html) < 500:
            print("[selenium] Page source too small, likely blocked or empty")
            return None
        
        print(f"[selenium] Got {len(rendered_html)} chars of rendered HTML")
        
        # Parse with BeautifulSoup
        return _parse_html_with_bs4(rendered_html, url)
        
    except Exception as e:
        print(f"[selenium] Error: {e}")
        return None
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


# ============================================================================
# LAYER 3 — BEAUTIFULSOUP STATIC HTML PARSING
# ============================================================================

def extract_job_from_html(url: str) -> Optional[Dict[str, str]]:
    """
    Layer 3 fallback: Fetch static HTML with requests + parse with BeautifulSoup.
    
    Used when:
    - RapidAPI key not configured or API fails
    - Selenium not installed or fails
    - Custom job listing pages with static HTML
    """
    if not HAS_BEAUTIFULSOUP:
        print("[html-extract] BeautifulSoup not installed, skipping HTML fallback")
        return None
    
    # Fetch page
    html = _fetch_html(url)
    if not html:
        return None
    
    return _parse_html_with_bs4(html, url)


def _fetch_html(url: str, timeout: int = 10) -> Optional[str]:
    """Fetch HTML from URL with retry logic and user agent spoofing."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
    }
    
    try:
        print(f"[html-fetch] Fetching {url[:80]}...")
        resp = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
        
        if resp.status_code != 200:
            print(f"[html-fetch] HTTP {resp.status_code}")
            return None
        
        # Check if page requires JS or login
        text_lower = resp.text.lower()
        if ("please enable javascript" in text_lower or 
            len(resp.text) < 500):
            print("[html-fetch] Page requires JS or returned minimal content")
            return None
        
        return resp.text
        
    except requests.exceptions.Timeout:
        print("[html-fetch] Request timeout")
        return None
    except requests.exceptions.RequestException as e:
        print(f"[html-fetch] Request error: {e}")
        return None


def _parse_html_with_bs4(html: str, url: str) -> Optional[Dict[str, str]]:
    """
    Parse HTML content with BeautifulSoup to extract job title and description.
    
    Uses robust selectors for common job board layouts including:
    - Indeed, Naukri, and generic job boards
    - Standard HTML semantic elements
    """
    if not HAS_BEAUTIFULSOUP:
        return None
    
    soup = BeautifulSoup(html, "html.parser")
    
    # Remove script and style elements first
    for tag in soup(["script", "style", "noscript", "iframe"]):
        tag.decompose()
    
    url_lower = url.lower()
    
    # Extract job title
    job_title = _extract_title_from_soup(soup, url_lower)
    if not job_title:
        print(f"[bs4-parse] Title extraction failed for {url_lower[:50]}")
    
    # Extract job description
    job_description = _extract_description_from_soup(soup, url_lower)
    if not job_description:
        print(f"[bs4-parse] Description extraction failed for {url_lower[:50]}")
    
    if job_title and job_description:
        print(f"[bs4-parse] Successfully parsed: {job_title[:50]}")
        return {
            "job_title": job_title,
            "job_description": job_description,
        }
    
    # Partial success — return what we have
    if job_description and not job_title:
        print("[bs4-parse] Got description but no title")
        return {
            "job_title": "",
            "job_description": job_description,
        }
    
    print("[bs4-parse] Could not parse job title and description from HTML")
    return None


def _extract_title_from_soup(soup, url_lower: str) -> Optional[str]:
    """Extract job title from soup using common selectors."""
    selectors = [
        # Indeed specific
        "[data-testid='jobTitle']",             # Indeed job title
        ".jobsearch-JobTitle",                  # Indeed class
        ".icl-Heading--h1",                     # Indeed heading
        
        # Naukri specific
        ".jd-header-title",                     # Naukri title
        "h1.jd-header-title",                   # Naukri h1 title
        
        # LinkedIn / Glassdoor (may work if page rendered via Selenium)
        ".topcard__title",                      # LinkedIn topcard
        ".top-card-layout__title",              # LinkedIn alt
        "[data-test='job-title']",              # Glassdoor
        "[data-test-id='job-title']",           # Glassdoor alt
        
        # Generic & common
        "h1",                                   # Generic h1
        ".job-title", ".jobtitle",              # Standard class names
        ".vacancy-title", ".title",             # Other variants
        ".job-header h1",                       # Nested h1
        "[role='heading'][aria-level='1']",     # ARIA heading
    ]
    
    for selector in selectors:
        try:
            element = soup.select_one(selector)
            if element:
                text = element.get_text(strip=True)
                if text and len(text) > 5 and len(text) < 200:
                    return text
        except Exception:
            continue
    
    return None


def _extract_description_from_soup(soup, url_lower: str) -> Optional[str]:
    """Extract job description from soup using targeted selectors and noise removal."""

    # ── Step 1: Remove common noise containers before extracting ──
    # These are page widgets / sidebars / footers that pollute the extracted text
    noise_selectors = [
        # Navigation, header, footer
        "header", "footer", "nav",
        "[role='navigation']", "[role='banner']", "[role='contentinfo']",

        # Naukri noise
        ".similar-jobs", ".other-jobs", ".srp-jobtuple",        # similar/recommended jobs
        ".company-info", ".about-company",                      # company section
        ".salary-insights", ".salary-estimate",                 # salary widgets
        ".review-container", ".reviews", ".review-card",        # reviews
        ".benefits", ".benefits-container",                     # benefits
        ".apply-btn-container", ".apply-button-wrapper",        # apply buttons
        "[class*='SimilarJobs']", "[class*='similarJobs']",
        "[class*='OtherJobs']",
        "[class*='CompanyInfo']", "[class*='companyInfo']",
        "[class*='SalaryInsight']", "[class*='salaryInsight']",
        "[class*='ReviewCard']", "[class*='reviewCard']",
        "[class*='Benefits']",
        "[class*='RolesFrom']",
        ".naukri-footer", "#footer",

        # Indeed noise
        ".jobsearch-CompanyInfoContainer",
        ".jobsearch-CompanyReview",
        ".jobsearch-RecommendedJobs",
        ".mosaic-afterApply-content",
        ".jobsearch-ViewJobLayout-footer",
        "[class*='CompanyInfo']",
        "[class*='SimilarJobs']",

        # Generic noise
        "[class*='related-jobs']", "[class*='relatedJobs']",
        "[class*='recommended']", "[class*='Recommended']",
        "[class*='sidebar']", "[class*='Sidebar']",
        "[class*='footer']", "[class*='Footer']",
        "[class*='popup']", "[class*='modal']",
        "[class*='cookie']", "[class*='Cookie']",
        "[class*='advertisement']", "[class*='ad-']",
    ]

    for selector in noise_selectors:
        try:
            for el in soup.select(selector):
                el.decompose()
        except Exception:
            continue

    # ── Step 2: Try targeted selectors in order of specificity ──
    selectors = [
        # Indeed specific (most precise first)
        "#jobDescriptionText",                 # Indeed description ID
        "[data-testid='jobDescription']",      # Indeed data-testid
        ".jobsearch-JobComponent-description", # Indeed class
        ".jobDescriptionContent",              # Indeed content

        # Naukri specific (precise containers for the JD text)
        "section.job-desc .dang-inner-html",   # Naukri JD inner HTML
        ".job-desc .dang-inner-html",          # Naukri alt
        "section.job-desc",                    # Naukri JD section
        ".jd-desc",                            # Naukri JD desc
        ".job-desc",                           # Naukri general

        # LinkedIn / Glassdoor (via Selenium)
        "div[class*='show-more-less-html']",   # LinkedIn
        ".description__text",                  # LinkedIn

        # Generic (broader selectors as fallback)
        "div[class*='jobDescription']",
        "div[id*='description']",
        "div[class*='job-description']",
        ".job-description", ".jobdescription",
        "section[class*='description']",
        "div[class*='description']",
        ".vacancy-text",
        "div[class*='job-content']",
        "article",
        "main",
    ]

    for selector in selectors:
        try:
            element = soup.select_one(selector)
            if element:
                text = element.get_text(separator="\n", strip=True)
                if text and len(text) > 100:
                    cleaned = _clean_extracted_description(text)
                    if cleaned and len(cleaned) > 80:
                        return cleaned
        except Exception:
            continue

    return None


def _clean_extracted_description(text: str) -> str:
    """Post-extraction cleanup: truncate at stop-markers, then remove noise lines."""

    # ── Stop markers: truncate everything after these lines ──
    # These mark the END of the actual job description on Naukri/Indeed pages
    stop_markers = [
        "key skills",
        "skills highlighted with",
        "about company",
        "about the company",
        "company info",
        "similar jobs",
        "jobs you might be interested in",
        "roles from top companies",
        "people also viewed",
        "recommended jobs",
        "more jobs from",
        "beware of imposters",
        "naukri.com does not promise",
        "register to unlock",
        "services you might",
        "salary insights",
        "compare salary",
        "benefits & perks",
        "reviews",
        "read all",
        "compare salaries",
    ]

    # ── Noise patterns: individual lines matching these are dropped ──
    noise_patterns = [
        # Action buttons
        r"^register to apply",
        r"^login to apply",
        r"^apply now",
        r"^apply$",
        r"^save$",
        r"^share$",
        r"^report this job",

        # Ratings/reviews
        r"^\d+\.\d+\s*$",
        r"^\d+\s*reviews?$",
        r"^\d+\.\d+\s+\d+\s*reviews?",
        r"^read more$",

        # Metadata
        r"^posted\s*:?\s*$",
        r"^applicants\s*:?\s*$",
        r"^applicants\s*:\s*\d",
        r"^posted\s*:\s*\d",
        r"^\d+\+$",
        r"^not disclosed",

        # Salary widgets
        r"^powered by",
        r"^avg\.?\s*salary",
        r"^min\s+\d",
        r"^max\s+\d",
        r"^\d+ users reported",

        # Nav / breadcrumbs
        r"^home\s*$",
        r"^home\s*>",
        r"^jobs in\s",

        # Ad / upsell
        r"^know more$",
        r"^resume display",
        r"^increase your profile",
        r"^get a featured profile",
        r"^may include paid",

        # Company boilerplate
        r"^address\s*:",
        r"fraudsters may ask",
    ]

    lines = text.split("\n")
    cleaned = []

    for line in lines:
        line = re.sub(r'\s+', ' ', line).strip()
        if not line:
            continue
        line_lower = line.lower().strip()

        # ── Check stop markers: truncate everything from here on ──
        hit_stop = False
        for marker in stop_markers:
            if line_lower.startswith(marker) or line_lower == marker:
                hit_stop = True
                break
        if hit_stop:
            break

        # ── Skip noise pattern matches ──
        is_noise = False
        for pattern in noise_patterns:
            if re.search(pattern, line_lower):
                is_noise = True
                break
        if is_noise:
            continue

        # Skip very short lines (button text, labels)
        if len(line) <= 3:
            continue

        # Skip date stamps like "2d ago", "22 Days Ago"
        if re.match(r'^\d+\s*d(ays?)?\s*ago$', line_lower):
            continue

        # Skip salary ranges like "₹4L - ₹9L" or "7-10 Lacs P.A."
        if re.match(r'^[₹$€£]?\s*\d+[\.\d]*\s*[LlKkMm]?\s*[-–]\s*[₹$€£]?\s*\d+', line):
            continue
        if re.match(r'^\d+[-–]\d+\s*lacs?\s', line_lower):
            continue
        if re.match(r'^\d+\s*lacs?\s', line_lower):
            continue

        # Skip "Hiring for one of these companies"
        if "hiring for one of these" in line_lower:
            continue

        cleaned.append(line)

    return "\n".join(cleaned)


# ============================================================================
# PUBLIC API
# ============================================================================

def extract_job_data(url: str, api_key: Optional[str] = None) -> Dict[str, str]:
    """
    Extract job title and description from a URL.
    
    Multi-layer strategy:
    1. Check for blocked sites (LinkedIn, Glassdoor → user warning)
    2. Layer 1: RapidAPI JSearch (safe, clean, structured)
    3. Layer 2: Selenium headless Chrome (JS-rendered pages)
    4. Layer 3: BeautifulSoup static HTML parsing
    5. Return error if all layers fail
    
    Args:
        url: Job listing URL
        api_key: Optional RapidAPI key (defaults to env var)
        
    Returns:
        {
            "job_title": "...",
            "job_description": "...",
            "source": "api|selenium|html|error",
            "error": "..." // only if source == "error"
        }
    """
    if not url or not url.strip():
        return {
            "job_title": "",
            "job_description": "",
            "source": "error",
            "error": "No URL provided",
        }
    
    url = url.strip()
    
    # Normalize URL
    if url.startswith("www."):
        url = "https://" + url
    if not url.startswith("http"):
        url = "https://" + url
    
    # Check for blocked / restricted sites
    blocked_msg = _is_blocked_site(url)
    if blocked_msg:
        return {
            "job_title": "",
            "job_description": "",
            "source": "error",
            "error": blocked_msg,
        }
    
    # ── Layer 1: RapidAPI JSearch ──
    api_result = extract_job_from_api(url, api_key)
    if api_result:
        return {
            **api_result,
            "source": "api",
        }
    
    # ── Layer 2: Selenium (headless Chrome) ──
    selenium_result = extract_via_selenium(url)
    if selenium_result:
        return {
            **selenium_result,
            "source": "selenium",
        }
    
    # ── Layer 3: Static HTML parsing ──
    html_result = extract_job_from_html(url)
    if html_result:
        return {
            **html_result,
            "source": "html",
        }
    
    # All layers failed
    return {
        "job_title": "",
        "job_description": "",
        "source": "error",
        "error": (
            "Unable to extract job details automatically. "
            "Please paste the job description manually."
        ),
    }


# ============================================================================
# BACKWARD-COMPATIBLE WRAPPER
# ============================================================================

def fetch_job_description_from_url(url: str, api_key: Optional[str] = None) -> str:
    """
    Backward-compatible function that returns only the job description text.
    Used by existing /analyze-resume endpoint.
    """
    result = extract_job_data(url, api_key)
    
    if result.get("source") == "error":
        return ""
    
    return result.get("job_description", "")
