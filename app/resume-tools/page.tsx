import { ArrowUpRight, FileSearch, Sparkles } from "lucide-react";
import { getClientSideFrontendRoute } from "@/shared/client-side";

const TOOLS = [
  {
    title: "Resume analyzer",
    description: "Score your resume against a job description, see missing skills, and get specific recommendations.",
    href: getClientSideFrontendRoute("/upload"),
    Icon: FileSearch,
    action: "Analyze my resume"
  },
  {
    title: "Resume builder",
    description: "Start from a professional template or import an existing resume, then export a polished, ATS-ready PDF.",
    href: getClientSideFrontendRoute("/buildcv"),
    Icon: Sparkles,
    action: "Build my resume"
  }
];

export default function ResumeToolsPage() {
  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1>Resume tools</h1>
          <p className="page-subtitle">Strengthen your resume before you apply. No sign-in needed. Each tool opens in a new tab.</p>
        </div>
      </div>
      <div className="grid grid-2">
        {TOOLS.map(({ title, description, href, Icon, action }) => (
          <a key={title} href={href} target="_blank" rel="noreferrer" className="card card-link">
            <span className="icon-tile mb"><Icon size={18} aria-hidden="true" /></span>
            <h2>{title}</h2>
            <p className="page-subtitle mb">{description}</p>
            <span className="btn btn-secondary">{action} <ArrowUpRight size={15} aria-hidden="true" /></span>
          </a>
        ))}
      </div>
    </div>
  );
}
