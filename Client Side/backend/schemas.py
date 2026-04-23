from typing import Any, List, Optional
from pydantic import BaseModel


class PersonalInfo(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None


class ResumeData(BaseModel):
    personalInfo: PersonalInfo
    summary: str = ""
    education: List[Any] = []
    workExperience: List[Any] = []
    projects: List[Any] = []
    skills: List[Any] = []
    certifications: List[Any] = []
    template: str = "modern.tex"
    aiEnhancement: bool = False


class GenerateResumeRequest(BaseModel):
    template: str
    data: ResumeData
    format: str  # "pdf" | "html"


