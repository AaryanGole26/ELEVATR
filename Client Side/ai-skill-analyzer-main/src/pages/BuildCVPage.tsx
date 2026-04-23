import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listTemplates, uploadResume, uploadResumeByPath, generateResume } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useResumeStorage } from "@/hooks/useLocalStorage";

type Mode = "upload" | "manual";

const BuildCVPage = () => {
  const { toast } = useToast();
  const {
    resumeData,
    setResumeData,
    lastUsedTemplate,
    setLastUsedTemplate,
    clearResumeData,
  } = useResumeStorage();

  const [mode, setMode] = useState<Mode>("upload");
  const [templates, setTemplates] = useState<string[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState<"html" | "pdf" | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string>("");
  const [localPath, setLocalPath] = useState<string>("");
  const templateLabel = (t: string) => {
    const name = t.replace(/\.tex$/i, "");
    const map: Record<string,string> = {
      billryan_basic: "Basic",
      billryan_modern: "Modern",
      modern_executive: "Modern Executive",
      classic_professional: "Classic Professional",
      minimal_clean: "Minimal Clean",
      template1: "Executive Maroon",
    };
    return map[name] || name.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  };

  // Website / portfolio extraction + UI state
  const [extractedSite, setExtractedSite] = useState<string>("");
  const [useExtracted, setUseExtracted] = useState<boolean>(false);

  const extractFirstUrlFromText = (text?: string) => {
    if (!text) return "";
    const urlRegex = /(https?:\/\/[^\s,;<>\)"]+|www\.[^\s,;<>\)"]+|[a-zA-Z0-9.-]+\.(?:com|io|dev|app|me|co|org|net)(\/[^\s,;<>\)]*)?)/i;
    const m = urlRegex.exec(text);
    if (!m) return "";
    let found = m[0].trim();
    if (found.startsWith("www.")) found = "https://" + found;
    if (!found.startsWith("http")) found = "https://" + found;
    return found;
  };

  // When resumeData updates (e.g., after upload/parse), try to auto-detect a portfolio/website.
  useEffect(() => {
    try {
      let scanText = "";
      if (resumeData.summary) scanText += " " + resumeData.summary;
      (resumeData.workExperience || []).forEach((w: any) => { scanText += " " + (w.description || "") + " " + (w.company || ""); });
      (resumeData.projects || []).forEach((p: any) => { scanText += " " + (p.url || "") + " " + (p.description || ""); });
      (resumeData.education || []).forEach((e: any) => { scanText += " " + (e.description || ""); });
      (resumeData.certifications || []).forEach((c: any) => { scanText += " " + (c.url || "") + " " + (c.description || ""); });

      const found = extractFirstUrlFromText(scanText);
      setExtractedSite(found);
      // If user has no explicit website field, populate it with the extracted value (but don't overwrite existing).
      const hasWebsite = !!(resumeData.personalInfo && (resumeData.personalInfo.website || resumeData.personalInfo.portfolio));
      if (!hasWebsite && found) {
        setResumeData({
          ...resumeData,
          personalInfo: { ...resumeData.personalInfo, website: found },
        });
        setUseExtracted(true);
      }
    } catch (err) {
      // silent
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeData]);

  const enhanceResume = (data: any) => {
    const clone = JSON.parse(JSON.stringify(data));
    // Skills: dedupe by name, prioritize length
    if (Array.isArray(clone.skills)) {
      const seen = new Set<string>();
      clone.skills = clone.skills.filter((s: any) => {
        const n = (s?.name || s)?.toString().trim().toLowerCase();
        if (!n || seen.has(n)) return false;
        seen.add(n);
        return true;
      });
    }
    const strongVerbs = [
      "Led","Built","Implemented","Optimized","Designed","Automated","Improved","Delivered","Migrated","Refactored","Deployed","Mentored","Analyzed","Architected","Reduced"
    ];
    const normalizeBullets = (text: string) => {
      const lines = String(text || "")
        .split(/\n|\r|•|\u2022|\-|\u2013|\u2014/)
        .map((x) => x.trim())
        .filter(Boolean);
      const bullets = lines.map((x, i) => {
        // Capitalize first letter
        let t = x.charAt(0).toUpperCase() + x.slice(1);
        // Remove trailing period
        t = t.replace(/[.;:,\s]+$/g, "");
        // Add action verb if missing
        const hasVerb = /^(Led|Built|Implemented|Optimized|Designed|Automated|Improved|Delivered|Migrated|Refactored|Deployed|Mentored|Analyzed|Architected|Reduced)\b/i.test(t);
        if (!hasVerb) {
          t = `${strongVerbs[i % strongVerbs.length]} ${t}`;
        }
        // Compact whitespace
        t = t.replace(/\s+/g, " ");
        return t.length > 220 ? t.slice(0, 220) + "…" : t;
      });
      // Keep top 6
      return bullets.slice(0, 6).join("\n");
    };
    // Work items: bulletize and truncate
    if (Array.isArray(clone.workExperience)) {
      clone.workExperience = clone.workExperience.map((w: any) => ({
        ...w,
        description: normalizeBullets(w?.description || "")
      }));
    }
    // Summary: rebuild a concise, impact-focused sentence using top skills
    const topSkills = (clone.skills || []).map((s: any) => s?.name || s).filter(Boolean).slice(0, 6);
    const roleGuess = (clone.workExperience?.[0]?.title || "Engineer").toString();
    const impactPhrases = [
      "deliver measurable outcomes","ship reliable features","optimize performance","automate workflows","improve user experience","scale systems"
    ];
    const impact = impactPhrases[(roleGuess.length + topSkills.length) % impactPhrases.length];
    const synthesized = `Results-driven ${roleGuess} with strengths in ${topSkills.join(", ")}. Proven ability to ${impact}.`;
    clone.summary = String(clone.summary || synthesized).replace(/\s+/g, " ").trim().slice(0, 350);
    return clone;
  };

  useEffect(() => {
    // Clear any previous draft each time this page is freshly mounted
    // so users always start with a clean slate as requested.
    clearResumeData();

    const run = async () => {
      try {
        setLoadingTemplates(true);
        const res = await listTemplates();
        setTemplates(res.templates || []);
      } catch (e: any) {
        toast({ title: "Failed to load templates", description: e?.message ?? String(e), variant: "destructive" });
      } finally {
        setLoadingTemplates(false);
      }
    };
    run();
  }, [toast]);

  useEffect(() => {
    if (lastUsedTemplate && (!resumeData.template || resumeData.template === "")) {
      setResumeData({ ...resumeData, template: lastUsedTemplate });
    }
  }, [lastUsedTemplate]);

  const onUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const res = await uploadResume(file);
      if (res?.parsed) {
        const merged = {
          ...resumeData,
          ...res.parsed,
        };
        setResumeData(merged);
        toast({ title: "Resume uploaded", description: "We extracted what we could. Please review and edit." });
      } else {
        toast({ title: "No data found", description: "Could not parse the file. Please fill manually.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGenerate = async (format: "pdf" | "html") => {
    try {
      setGenerating(format);
      const payload = {
        template: resumeData.template || lastUsedTemplate || templates[0] || "modern.tex",
        data: resumeData.aiEnhancement ? enhanceResume(resumeData) : resumeData,
        format,
      } as const;

      const res = await generateResume(payload);
      if (format === "pdf") {
        const blob = res as Blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "resume.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast({ title: "PDF generated", description: "Your resume has been downloaded." });
      } else {
        setHtmlPreview(String(res));
        toast({ title: "Preview ready", description: "Scroll to see the preview." });
      }
    } catch (e: any) {
      toast({ title: "Generation failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const handlePrintHtml = async () => {
    try {
      let content = htmlPreview;
      if (!content) {
        setGenerating("html");
        const payload = {
          template: resumeData.template || lastUsedTemplate || templates[0] || "modern.tex",
          data: resumeData,
          format: "html" as const,
        };
        const res = await generateResume(payload);
        content = String(res);
        setHtmlPreview(content);
        setGenerating(null);
      }

      const printable = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Resume Preview</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css" crossorigin="anonymous" />
    <style>
      @page { size: A4; margin: 16mm; }
      html, body { height: 100%; }
      body { -webkit-print-color-adjust: exact; color-adjust: exact; }
    </style>
  </head>
  <body>
    ${content}
    <script>
      window.onload = function(){
        setTimeout(function(){
          window.print();
          setTimeout(function(){ window.close(); }, 300);
        }, 300);
      };
    </script>
  </body>
</html>`;

      const w = window.open("", "_blank");
      if (!w) return;
      w.document.open();
      w.document.write(printable);
      w.document.close();
    } catch (e) {
      toast({ title: "Print failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      setGenerating(null);
    }
  };

  const sectionTitle = (title: string) => (
    <h3 className="text-sm font-semibold text-muted-foreground mt-6 mb-2">{title}</h3>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Hero / welcome copy */}
<section className="text-center pt-12 pb-4">   {/* ← increased from pt-2 */}
  {/*badge */}
  <Badge
    variant="secondary"
    className="mb-4 inline-flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-full bg-gradient-to-r from-purple-500/10 to-fuchsia-500/10"
  >
    <Sparkles className="h-4 w-4 text" />
    AI CV Builder
  </Badge>


  <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
    <span className="bg-gradient-to-r from-primary to-fuchsia-500 bg-clip-text text-transparent">
      Craft a Beautiful, ATS-Friendly Resume
    </span>
  </h1>

  <p className="mt-3 text-base md:text-lg text-muted-foreground max-w-3xl mx-auto">
    Use professionally designed templates and guided sections to build a standout CV.
    Upload an existing resume or enter details manually, then preview and export a polished PDF.
  </p>
</section>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Editor</h2>
        <div className="flex items-center gap-3">
          <Select
            value={resumeData.template}
            onValueChange={(val) => {
              setLastUsedTemplate(val);
              setResumeData({ ...resumeData, template: val });
            }}
          >
            
            <SelectContent>
              {(templates || []).map((t) => (
                <SelectItem key={t} value={t}>{t.replace(/\.tex$/i, "")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList>
          <TabsTrigger value="upload">📤 Upload Resume</TabsTrigger>
          <TabsTrigger value="manual">✍️ Manual Entry</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload an existing resume (PDF/DOCX)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template selection for Upload stage */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Template</span>
                <Select
                  value={resumeData.template}
                  onValueChange={(val) => {
                    setLastUsedTemplate(val);
                    setResumeData({ ...resumeData, template: val });
                  }}
                >
                  <SelectTrigger className="w-56" disabled={loadingTemplates}>
                    <SelectValue placeholder={loadingTemplates ? "Loading templates..." : "Select template"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates || []).map((t) => (
                      <SelectItem key={t} value={t}>{templateLabel(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                aria-label="Upload resume file"
                onChange={handleFileChange}
              />
              <Button onClick={onUploadClick} disabled={uploading}>
                {uploading ? "Uploading..." : "Select File"}
              </Button>

              {/* Dev helper: extract via local file path using backend */}
              <div className="flex items-center gap-2 mt-2">
                <Input
                  placeholder="Local file path (e.g., C:\\path\\to\\resume.pdf)"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                />
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (!localPath.trim()) return;
                    setUploading(true);
                    try {
                      const res = await uploadResumeByPath(localPath.trim());
                      if (res?.parsed) {
                        setResumeData({ ...resumeData, ...res.parsed });
                        toast({ title: "Parsed from path", description: "Review extracted details." });
                      } else if (res?.error) {
                        toast({ title: "Path parse error", description: res.error, variant: "destructive" });
                      }
                    } catch (e: any) {
                      toast({ title: "Path parse failed", description: e?.message ?? String(e), variant: "destructive" });
                    } finally {
                      setUploading(false);
                    }
                  }}
                  disabled={uploading}
                >
                  Extract via Local Path
                </Button>
              </div>

              {sectionTitle("Personal Info")}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Name" value={resumeData.personalInfo.name}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, name: e.target.value } })} />
                <Input placeholder="Email" value={resumeData.personalInfo.email}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, email: e.target.value } })} />
                <Input placeholder="Phone" value={resumeData.personalInfo.phone}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, phone: e.target.value } })} />
                <Input placeholder="Location" value={resumeData.personalInfo.location}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, location: e.target.value } })} />
                <Input placeholder="LinkedIn" value={resumeData.personalInfo.linkedin || ""}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, linkedin: e.target.value } })} />
                <Input placeholder="GitHub" value={resumeData.personalInfo.github || ""}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, github: e.target.value } })} />
                <div>
                  <Input
                    placeholder="Website / Portfolio"
                    value={resumeData.personalInfo.website || resumeData.personalInfo.portfolio || ""}
                    onChange={(e) => {
                      setUseExtracted(false);
                      setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, website: e.target.value } });
                    }}
                  />
                  {extractedSite ? (
                    <div className="mt-2 text-sm">
                      
                    </div>
                  ) : null}
                </div>
              </div>

              {sectionTitle("Summary")}
              <Textarea rows={4} placeholder="Professional summary" value={resumeData.summary}
                onChange={(e) => setResumeData({ ...resumeData, summary: e.target.value })} />

              {sectionTitle("Work Experience")}
              <div className="space-y-3">
                {(resumeData.workExperience || []).map((exp, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                    <Input
                      placeholder="Title"
                      value={(exp as any).title || ""}
                      onChange={(e) => {
                        const list = [...resumeData.workExperience];
                        (list[idx] as any) = { ...(list[idx] as any), title: e.target.value };
                        setResumeData({ ...resumeData, workExperience: list });
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Company"
                        value={(exp as any).company || ""}
                        onChange={(e) => {
                          const list = [...resumeData.workExperience];
                          (list[idx] as any) = { ...(list[idx] as any), company: e.target.value };
                          setResumeData({ ...resumeData, workExperience: list });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const list = [...resumeData.workExperience];
                          list.splice(idx, 1);
                          setResumeData({ ...resumeData, workExperience: list });
                        }}
                        aria-label="Remove experience"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="md:col-span-2">
                      <Textarea
                        rows={3}
                        placeholder="Description / achievements"
                        value={(exp as any).description || ""}
                        onChange={(e) => {
                          const list = [...resumeData.workExperience];
                          (list[idx] as any) = { ...(list[idx] as any), description: e.target.value };
                          setResumeData({ ...resumeData, workExperience: list });
                        }}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResumeData({
                    ...resumeData,
                    workExperience: [...(resumeData.workExperience || []), { title: "", company: "", description: "" } as any],
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add experience
                </Button>
              </div>

              {sectionTitle("Education")}
              <div className="space-y-3">
                {(resumeData.education || []).map((edu, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                    <Input
                      placeholder="Degree"
                      value={(edu as any).degree || ""}
                      onChange={(e) => {
                        const list = [...resumeData.education];
                        (list[idx] as any) = { ...(list[idx] as any), degree: e.target.value };
                        setResumeData({ ...resumeData, education: list });
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Institution"
                        value={(edu as any).institution || ""}
                        onChange={(e) => {
                          const list = [...resumeData.education];
                          (list[idx] as any) = { ...(list[idx] as any), institution: e.target.value };
                          setResumeData({ ...resumeData, education: list });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const list = [...resumeData.education];
                          list.splice(idx, 1);
                          setResumeData({ ...resumeData, education: list });
                        }}
                        aria-label="Remove education"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="md:col-span-2">
                      <Textarea
                        rows={2}
                        placeholder="Notes / details"
                        value={(edu as any).description || ""}
                        onChange={(e) => {
                          const list = [...resumeData.education];
                          (list[idx] as any) = { ...(list[idx] as any), description: e.target.value };
                          setResumeData({ ...resumeData, education: list });
                        }}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResumeData({
                    ...resumeData,
                    education: [...(resumeData.education || []), { degree: "", institution: "", description: "" } as any],
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add education
                </Button>
              </div>

              {sectionTitle("Skills")}
              <Input
                placeholder="Comma separated skills e.g. React, TypeScript, AWS"
                value={(resumeData.skills || []).map((s: any) => s.name).join(", ")}
                onChange={(e) => {
                  const names = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setResumeData({
                    ...resumeData,
                    skills: names.map((name) => ({ name, category: "technical", proficiency: "intermediate" })) as any,
                  });
                }}
              />

              {sectionTitle("Projects")}
              <div className="space-y-3">
                {(resumeData.projects || []).map((prj, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                    <Input
                      placeholder="Project name"
                      value={(prj as any).name || ""}
                      onChange={(e) => {
                        const list = [...resumeData.projects];
                        (list[idx] as any) = { ...(list[idx] as any), name: e.target.value };
                        setResumeData({ ...resumeData, projects: list });
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="URL (optional)"
                        value={(prj as any).url || ""}
                        onChange={(e) => {
                          const list = [...resumeData.projects];
                          (list[idx] as any) = { ...(list[idx] as any), url: e.target.value };
                          setResumeData({ ...resumeData, projects: list });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const list = [...resumeData.projects];
                          list.splice(idx, 1);
                          setResumeData({ ...resumeData, projects: list });
                        }}
                        aria-label="Remove project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="md:col-span-2">
                      <Textarea
                        rows={2}
                        placeholder="Description"
                        value={(prj as any).description || ""}
                        onChange={(e) => {
                          const list = [...resumeData.projects];
                          (list[idx] as any) = { ...(list[idx] as any), description: e.target.value };
                          setResumeData({ ...resumeData, projects: list });
                        }}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResumeData({
                    ...resumeData,
                    projects: [...(resumeData.projects || []), { name: "", url: "", description: "" } as any],
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add project
                </Button>
              </div>

              {sectionTitle("Certifications")}
              <div className="space-y-3">
                {(resumeData.certifications || []).map((cert, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                    <Input
                      placeholder="Certification name"
                      value={(cert as any).name || ""}
                      onChange={(e) => {
                        const list = [...resumeData.certifications];
                        (list[idx] as any) = { ...(list[idx] as any), name: e.target.value };
                        setResumeData({ ...resumeData, certifications: list });
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Issuer"
                        value={(cert as any).issuer || ""}
                        onChange={(e) => {
                          const list = [...resumeData.certifications];
                          (list[idx] as any) = { ...(list[idx] as any), issuer: e.target.value };
                          setResumeData({ ...resumeData, certifications: list });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const list = [...resumeData.certifications];
                          list.splice(idx, 1);
                          setResumeData({ ...resumeData, certifications: list });
                        }}
                        aria-label="Remove certification"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResumeData({
                    ...resumeData,
                    certifications: [...(resumeData.certifications || []), { name: "", issuer: "" } as any],
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add certification
                </Button>
              </div>

              <div className="flex gap-3 pt-4 flex-wrap">
                <Button variant="secondary" onClick={() => handleGenerate("html")} disabled={generating !== null}>
                  {generating === "html" ? "Generating..." : "Preview"}
                </Button>
                <Button variant="outline" onClick={handlePrintHtml} disabled={generating !== null}>
                  Download PDF (HTML/KaTeX)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Manual Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template selection for Manual stage */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Template</span>
                <Select
                  value={resumeData.template}
                  onValueChange={(val) => {
                    setLastUsedTemplate(val);
                    setResumeData({ ...resumeData, template: val });
                  }}
                >
                  <SelectTrigger className="w-56" disabled={loadingTemplates}>
                    <SelectValue placeholder={loadingTemplates ? "Loading templates..." : "Select template"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates || []).map((t) => (
                      <SelectItem key={t} value={t}>{templateLabel(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {sectionTitle("Personal Info")}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Name" value={resumeData.personalInfo.name}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, name: e.target.value } })} />
                <Input placeholder="Email" value={resumeData.personalInfo.email}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, email: e.target.value } })} />
                <Input placeholder="Phone" value={resumeData.personalInfo.phone}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, phone: e.target.value } })} />
                <Input placeholder="Location" value={resumeData.personalInfo.location}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, location: e.target.value } })} />
                <Input placeholder="LinkedIn" value={resumeData.personalInfo.linkedin || ""}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, linkedin: e.target.value } })} />
                <Input placeholder="GitHub" value={resumeData.personalInfo.github || ""}
                  onChange={(e) => setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, github: e.target.value } })} />
                <div>
                  <Input
                    placeholder="Website / Portfolio"
                    value={resumeData.personalInfo.website || resumeData.personalInfo.portfolio || ""}
                    onChange={(e) => {
                      setUseExtracted(false);
                      setResumeData({ ...resumeData, personalInfo: { ...resumeData.personalInfo, website: e.target.value } });
                    }}
                  />
                  {extractedSite ? (
                    <div className="mt-2 text-sm">
                      <div>Auto-detected: <a className="underline" href={extractedSite} target="_blank" rel="noreferrer">{extractedSite}</a></div>

                    </div>
                  ) : null}
                </div>
              </div>

              {sectionTitle("Summary")}
              <Textarea rows={4} placeholder="Professional summary" value={resumeData.summary}
                onChange={(e) => setResumeData({ ...resumeData, summary: e.target.value })} />

              {/* Repeat the same sections in manual mode */}
              {sectionTitle("Work Experience")}
              <div className="space-y-3">
                {(resumeData.workExperience || []).map((exp, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                    <Input
                      placeholder="Title"
                      value={(exp as any).title || ""}
                      onChange={(e) => {
                        const list = [...resumeData.workExperience];
                        (list[idx] as any) = { ...(list[idx] as any), title: e.target.value };
                        setResumeData({ ...resumeData, workExperience: list });
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Company"
                        value={(exp as any).company || ""}
                        onChange={(e) => {
                          const list = [...resumeData.workExperience];
                          (list[idx] as any) = { ...(list[idx] as any), company: e.target.value };
                          setResumeData({ ...resumeData, workExperience: list });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const list = [...resumeData.workExperience];
                          list.splice(idx, 1);
                          setResumeData({ ...resumeData, workExperience: list });
                        }}
                        aria-label="Remove experience"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="md:col-span-2">
                      <Textarea
                        rows={3}
                        placeholder="Description / achievements"
                        value={(exp as any).description || ""}
                        onChange={(e) => {
                          const list = [...resumeData.workExperience];
                          (list[idx] as any) = { ...(list[idx] as any), description: e.target.value };
                          setResumeData({ ...resumeData, workExperience: list });
                        }}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResumeData({
                    ...resumeData,
                    workExperience: [...(resumeData.workExperience || []), { title: "", company: "", description: "" } as any],
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add experience
                </Button>
              </div>

              {sectionTitle("Education")}
              <div className="space-y-3">
                {(resumeData.education || []).map((edu, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                    <Input
                      placeholder="Degree"
                      value={(edu as any).degree || ""}
                      onChange={(e) => {
                        const list = [...resumeData.education];
                        (list[idx] as any) = { ...(list[idx] as any), degree: e.target.value };
                        setResumeData({ ...resumeData, education: list });
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Institution"
                        value={(edu as any).institution || ""}
                        onChange={(e) => {
                          const list = [...resumeData.education];
                          (list[idx] as any) = { ...(list[idx] as any), institution: e.target.value };
                          setResumeData({ ...resumeData, education: list });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const list = [...resumeData.education];
                          list.splice(idx, 1);
                          setResumeData({ ...resumeData, education: list });
                        }}
                        aria-label="Remove education"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="md:col-span-2">
                      <Textarea
                        rows={2}
                        placeholder="Notes / details"
                        value={(edu as any).description || ""}
                        onChange={(e) => {
                          const list = [...resumeData.education];
                          (list[idx] as any) = { ...(list[idx] as any), description: e.target.value };
                          setResumeData({ ...resumeData, education: list });
                        }}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResumeData({
                    ...resumeData,
                    education: [...(resumeData.education || []), { degree: "", institution: "", description: "" } as any],
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add education
                </Button>
              </div>

              {sectionTitle("Skills")}
              <Input
                placeholder="Comma separated skills e.g. React, TypeScript, AWS"
                value={(resumeData.skills || []).map((s: any) => s.name).join(", ")}
                onChange={(e) => {
                  const names = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setResumeData({
                    ...resumeData,
                    skills: names.map((name) => ({ name, category: "technical", proficiency: "intermediate" })) as any,
                  });
                }}
              />

              {sectionTitle("Projects")}
              <div className="space-y-3">
                {(resumeData.projects || []).map((prj, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                    <Input
                      placeholder="Project name"
                      value={(prj as any).name || ""}
                      onChange={(e) => {
                        const list = [...resumeData.projects];
                        (list[idx] as any) = { ...(list[idx] as any), name: e.target.value };
                        setResumeData({ ...resumeData, projects: list });
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="URL (optional)"
                        value={(prj as any).url || ""}
                        onChange={(e) => {
                          const list = [...resumeData.projects];
                          (list[idx] as any) = { ...(list[idx] as any), url: e.target.value };
                          setResumeData({ ...resumeData, projects: list });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const list = [...resumeData.projects];
                          list.splice(idx, 1);
                          setResumeData({ ...resumeData, projects: list });
                        }}
                        aria-label="Remove project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="md:col-span-2">
                      <Textarea
                        rows={2}
                        placeholder="Description"
                        value={(prj as any).description || ""}
                        onChange={(e) => {
                          const list = [...resumeData.projects];
                          (list[idx] as any) = { ...(list[idx] as any), description: e.target.value };
                          setResumeData({ ...resumeData, projects: list });
                        }}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResumeData({
                    ...resumeData,
                    projects: [...(resumeData.projects || []), { name: "", url: "", description: "" } as any],
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add project
                </Button>
              </div>

              {sectionTitle("Certifications")}
              <div className="space-y-3">
                {(resumeData.certifications || []).map((cert, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                    <Input
                      placeholder="Certification name"
                      value={(cert as any).name || ""}
                      onChange={(e) => {
                        const list = [...resumeData.certifications];
                        (list[idx] as any) = { ...(list[idx] as any), name: e.target.value };
                        setResumeData({ ...resumeData, certifications: list });
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Issuer"
                        value={(cert as any).issuer || ""}
                        onChange={(e) => {
                          const list = [...resumeData.certifications];
                          (list[idx] as any) = { ...(list[idx] as any), issuer: e.target.value };
                          setResumeData({ ...resumeData, certifications: list });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const list = [...resumeData.certifications];
                          list.splice(idx, 1);
                          setResumeData({ ...resumeData, certifications: list });
                        }}
                        aria-label="Remove certification"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResumeData({
                    ...resumeData,
                    certifications: [...(resumeData.certifications || []), { name: "", issuer: "" } as any],
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add certification
                </Button>
              </div>

              <div className="flex gap-3 pt-4 flex-wrap">
                <Button variant="secondary" onClick={() => handleGenerate("html")} disabled={generating !== null}>
                  {generating === "html" ? "Generating..." : "Preview"}
                </Button>
                <Button variant="outline" onClick={handlePrintHtml} disabled={generating !== null}>
                  Download PDF (HTML/KaTeX)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {htmlPreview && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-hidden">
              <iframe title="preview" srcDoc={htmlPreview} className="w-full h-[600px] bg-white" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BuildCVPage;


