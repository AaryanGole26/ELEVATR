import { redirect } from "next/navigation";

/** The analyzer and builder share one page. This keeps existing links working. */
export default function ResumeBuilderPage() {
  redirect("/resume-tools");
}
