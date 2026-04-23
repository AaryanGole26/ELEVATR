import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Target,
  Brain,
  FileText,
  ArrowLeft,
  Share2,
  Lightbulb,
  Star,
  Trophy,
  Zap,
  BarChart3,
  Award,
  TrendingDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { exportPdf } from '@/lib/api';

const ResultsPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const techCourses: Record<string, { level: 'Beginner' | 'Intermediate'; url: string }> = {
    "python": {
      level: "Beginner",
      url: "https://www.coursera.org/specializations/python"
    },
    "django": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/django-web-framework"
    },
    "flask": {
      level: "Beginner",
      url: "https://www.udemy.com/topic/flask/free/"
    },
    "fastapi": {
      level: "Beginner",
      url: "https://www.youtube.com/watch?v=Lu8lXXlstvM"
    },
    "numpy": {
      level: "Beginner",
      url: "https://www.udemy.com/course/python-introduction-to-data-science/?utm_source=bing&utm_medium=udemyads&utm_campaign=BG-Search_Keyword_Beta_Prof_la.EN_cc.India&campaigntype=Search&portfolio=Bing-India&language=EN&product=Course&test=&audience=Keyword&topic=NumPy&priority=Beta&utm_content=deal4584&utm_term=_._ag_1326013411672412_._ad__._kw_NumPy+Course_._de_c_._dm__._pl__._ti_kwd-82876968999735%3Aaud-822298023%3Aloc-90_._li_155679_._pd__._&matchtype=e&msclkid=a1feee1f99f01b85189d86dab100b460&couponCode=PMNVD2025"
    },
    "pandas": {
      level: "Beginner",
      url: "https://www.udemy.com/course/python-introduction-to-data-science/?utm_source=bing&utm_medium=udemyads&utm_campaign=BG-Search_Keyword_Beta_Prof_la.EN_cc.India&campaigntype=Search&portfolio=Bing-India&language=EN&product=Course&test=&audience=Keyword&topic=NumPy&priority=Beta&utm_content=deal4584&utm_term=_._ag_1326013411672412_._ad__._kw_NumPy+Course_._de_c_._dm__._pl__._ti_kwd-82876968999735%3Aaud-822298023%3Aloc-90_._li_155679_._pd__._&matchtype=e&msclkid=a1feee1f99f01b85189d86dab100b460&couponCode=PMNVD2025"
    },
    "scipy": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/python-introduction-to-data-science/?utm_source=bing&utm_medium=udemyads&utm_campaign=BG-Search_Keyword_Beta_Prof_la.EN_cc.India&campaigntype=Search&portfolio=Bing-India&language=EN&product=Course&test=&audience=Keyword&topic=NumPy&priority=Beta&utm_content=deal4584&utm_term=_._ag_1326013411672412_._ad__._kw_NumPy+Course_._de_c_._dm__._pl__._ti_kwd-82876968999735%3Aaud-822298023%3Aloc-90_._li_155679_._pd__._&matchtype=e&msclkid=a1feee1f99f01b85189d86dab100b460&couponCode=PMNVD2025"
    },
    "matplotlib": {
      level: "Beginner",
      url: "https://www.udemy.com/course/python-introduction-to-data-science/?utm_source=bing&utm_medium=udemyads&utm_campaign=BG-Search_Keyword_Beta_Prof_la.EN_cc.India&campaigntype=Search&portfolio=Bing-India&language=EN&product=Course&test=&audience=Keyword&topic=NumPy&priority=Beta&utm_content=deal4584&utm_term=_._ag_1326013411672412_._ad__._kw_NumPy+Course_._de_c_._dm__._pl__._ti_kwd-82876968999735%3Aaud-822298023%3Aloc-90_._li_155679_._pd__._&matchtype=e&msclkid=a1feee1f99f01b85189d86dab100b460&couponCode=PMNVD2025"
    },
    "seaborn": {
      level: "Beginner",
      url: "https://www.udemy.com/course/python-introduction-to-data-science/?utm_source=bing&utm_medium=udemyads&utm_campaign=BG-Search_Keyword_Beta_Prof_la.EN_cc.India&campaigntype=Search&portfolio=Bing-India&language=EN&product=Course&test=&audience=Keyword&topic=NumPy&priority=Beta&utm_content=deal4584&utm_term=_._ag_1326013411672412_._ad__._kw_NumPy+Course_._de_c_._dm__._pl__._ti_kwd-82876968999735%3Aaud-822298023%3Aloc-90_._li_155679_._pd__._&matchtype=e&msclkid=a1feee1f99f01b85189d86dab100b460&couponCode=PMNVD2025"
    },
    "tensorflow": {
      level: "Intermediate",
      url: "https://www.coursera.org/specializations/tensorflow-in-practice"
    },
    "keras": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/introduction-to-deep-learning-with-keras"
    },
    "pytorch": {
      level: "Intermediate",
      url: "https://www.upgrad.com/machine-learning-ai-pgd-iiitb-lpv1/?ad_device=c&ad_network=o&ad_creative=79783521813324&ad_keyword_matchtype=p&ad_clickID=ff46081ebcf71322622660db96fda747&msclkid=ff46081ebcf71322622660db96fda747&utm_source=bing&utm_medium=cpc&utm_campaign=IND_ACQ_WEB_BI_NBSEARCH_DV_IIITB_EML_HIT_ROI&utm_term=deep%20learning%20courses&utm_content=PerformingKws"
    },
    "jenkins": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/jenkins-for-beginners"
    },
    "docker": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/packt-docker-for-the-absolute-beginner-hands-on-rxori"
    },
    "kubernetes": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/kubernetes-for-absolute-beginners"
    },
    "ansible": {
      level: "Intermediate",
      url: "https://www.coursera.org/learn/packt-ansible-and-ansible-playbooks-for-automation-t9h7v"
    },
    "terraform": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/terraform-beginner-to-advanced/?utm_source=bing&utm_medium=udemyads&utm_campaign=BG-Search_Keyword_Beta_Prof_la.EN_cc.India&campaigntype=Search&portfolio=Bing-India&language=EN&product=Course&test=&audience=Keyword&topic=HashiCorp_Certified%3A_Terraform_Associate&priority=Beta&utm_content=deal4584&utm_term=_._ag_1323814388455850_._ad__._kw_Terraform+Beginner_._de_c_._dm__._pl__._ti_kwd-82739519403477%3Aloc-90_._li_155679_._pd__._&matchtype=p&msclkid=723f079fb9fb109fd2e56f5a937941c1"
    },
    "aws": {
      level: "Beginner",
      url: "https://www.coursera.org/specializations/aws-fundamentals"
    },
    "azure": {
      level: "Beginner",
      url: "https://www.udemy.com/topic/microsoft-az-900/"
    },
    "google cloud": {
      level: "Beginner",
      url: "https://cloud.google.com/learn/training"
    },
    "gcp": {
      level: "Beginner",
      url: "https://cloud.google.com/learn/training"
    },
    "oracle cloud": {
      level: "Beginner",
      url: "https://learn.oracle.com/education"
    },
    "postgresql": {
      level: "Beginner",
      url: "https://www.coursera.org/specializations/postgresql-for-everybody"
    },
    "mysql": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/database-structures-and-management-with-mysql"
    },
    "mongodb": {
      level: "Beginner",
      url: "https://learn.mongodb.com/courses"
    },
    "sqlite": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/sql-foundations"
    },
    "redis": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/learn-redis-step-by-step/?utm_source=bing&utm_medium=udemyads&utm_campaign=BG-Search_DSA_Beta_Prof_la.EN_cc.India&campaigntype=Search&portfolio=Bing-India&language=EN&product=Course&test=&audience=DSA&topic=&priority=Beta&utm_content=deal4584&utm_term=_._ag_1327112923136029_._ad__._kw_IT+en_._de_c_._dm__._pl__._ti_dat-2334744222699522%3Aloc-90_._li_155679_._pd__._&matchtype=b&msclkid=89dcf4a6151616700f599c633fe4c892&couponCode=PMNVD2025"
    },
    "graphql": {
      level: "Beginner",
      url: "https://www.coursera.org/specializations/graphql-mastery-from-fundamentals-to-production"
    },
    "rest api": {
      level: "Beginner",
      url: "https://www.udemy.com/course/api-with-postman-for-absolute-beginners/?couponCode=PMNVD2025"
    },
    "soap api": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/soap-web-services-mastering-api-design-and-implementation/"
    },
    "git": {
      level: "Beginner",
      url: "https://www.udemy.com/course/git-and-github-crash-course-creating-a-repository-from-scratch/"
    },
    "github": {
      level: "Beginner",
      url: "https://www.udemy.com/course/git-and-github-crash-course-creating-a-repository-from-scratch/"
    },
    "gitlab": {
      level: "Intermediate",
      url: "https://www.coursera.org/learn/complete-git-with-gitlab-and-bitbucket"
    },
    "bitbucket": {
      level: "Intermediate",
      url: "https://www.coursera.org/learn/complete-git-with-gitlab-and-bitbucket"
    },
    "celery": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/django-celery-mastery/?couponCode=PMNVD2025"
    },
    "rabbitmq": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/rabbitmqmasterclass/"
    },
    "elasticsearch": {
      level: "Beginner",
      url: "https://www.edx.org/learn/nosql/the-university-of-michigan-database-architecture-scale-and-nosql-with-elasticsearch?index=product&queryId=7e6bb674a4119b6447333c51a1b4a316&position=1"
    },
    "logstash": {
      level: "Intermediate",
      url: "https://www.udemy.com/topic/logstash/"
    },
    "kibana": {
      level: "Beginner",
      url: "https://www.udemy.com/topic/kibana/"
    },
    "apache": {
      level: "Beginner",
      url: "https://www.udemy.com/topic/apache-web-server/"
    },
    "nginx": {
      level: "Beginner",
      url: "https://www.udemy.com/course/nginx-crash-course/"
    },
    "linux": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/packt-a-beginners-guide-to-linux-z2e2k"
    },
    "ubuntu": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/packt-a-beginners-guide-to-linux-z2e2k"
    },
    "centos": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/packt-a-beginners-guide-to-linux-z2e2k"
    },
    "microservices": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/microservices-with-spring-boot-and-spring-cloud/"
    },
    "ci/cd": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/continuous-integration-and-continuous-delivery-ci-cd"
    },
    "tdd": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/tdd-fundamentals-in-typescript/"
    },
    "bdd": {
      level: "Intermediate",
      url: "https://www.udemy.com/topic/bdd/"
    },
    "oauth": {
      level: "Intermediate",
      url: "https://www.coursera.org/learn/packt-backend-development-and-api-creation-w2u4y"
    },
    "jwt": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/spring-security-zero-to-master/?utm_source=adwords&utm_medium=udemyads&utm_campaign=Search_DSA_Beta_Prof_la.EN_cc.India_Subs&campaigntype=Search&portfolio=India&language=EN&product=Subs&test=&audience=DSA&topic=&priority=Beta&utm_content=deal4584&utm_term=_._ag_185390584313_._ad_769665429119_._kw__._de_c_._dm__._pl__._ti_dsa-2436670172539_._li_9062237_._pd__._&matchtype=&gad_source=1&gad_campaignid=22900574867&gbraid=0AAAAADROdO0F94GKbcEGmIME-29mnprAi&gclid=Cj0KCQjwrJTGBhCbARIsANFBfgsV4mOrADwKcbORGVDIejxfOpxDhg8K__1C89CrTbuVbZmqrIp4fp4aAu58EALw_wcB&couponCode=PMNVD2025"
    },
    "ssl": {
      level: "Beginner",
      url: "https://sl-courses.iiitb.ac.in/advanced-executive-program-cyber-security?utm_source=google&utm_medium=cpc&utm_term=cyber%20security%20certification&utm_content=19592622120-142749540462-746367824092&utm_device=c&utm_campaign=Search-TechCluster-Cyber-CCyber-PG-IIITB-IN-Main-AllDevice-IIITBDomain-adgroup-Cyber-Certification&gad_source=1&gad_campaignid=19592622120&gbraid=0AAAAADt9AXOSBfRTOR62EKQKh1DuZAJLf&gclid=Cj0KCQjwrJTGBhCbARIsANFBfgvquPBTeOhfGKrc14MYcqATRW7GmAFnPhqTjM45RwwmvSf3lsGqDjMaAgIiEALw_wcB"
    },
    "object-oriented programming": {
      level: "Beginner",
      url: "https://www.coursera.org/specializations/object-oriented-programming-s12n"
    },
    "oop": {
      level: "Beginner",
      url: "https://www.coursera.org/specializations/object-oriented-programming-s12n"
    },
    "multithreading": {
      level: "Intermediate",
      url: "https://www.udemy.com/course/complete-guide-to-python-multithreading-and-multiprocessing/?utm_source=adwords&utm_medium=udemyads&utm_campaign=Search_DSA_Alpha_Prof_la.EN_cc.India_Subs&campaigntype=Search&portfolio=India&language=EN&product=Subs&test=&audience=DSA&topic=Python&priority=Alpha&utm_content=deal4584&utm_term=_._ag_185390583313_._ad_769665429044_._kw__._de_c_._dm__._pl__._ti_dsa-1652644802545_._li_9062237_._pd__._&matchtype=&gad_source=1&gad_campaignid=22900574864&gbraid=0AAAAADROdO2ELMNHqgXswMQFnXwdWezl7&gclid=Cj0KCQjwrJTGBhCbARIsANFBfgvyi0V0S646mrjZsJNYooPchyNm0sHXBmvSF56oQNuFYejHBdvwYtUaAtKMEALw_wcB&couponCode=PMNVD2025"
    },
    "asyncio": {
      level: "Intermediate",
      url: "https://www.coursera.org/learn/packt-concurrent-and-parallel-programming-in-python-um1n1"
    },
    "react": {
      level: "Beginner",
      url: "https://www.udemy.com/course/react-the-complete-guide-incl-redux/"
    },
    "angular": {
      level: "Beginner",
      url: "https://www.udemy.com/course/complete-angular-14-course-learn-frontend-development/?utm_source=adwords&utm_medium=udemyads&utm_campaign=Search_DSA_Alpha_Prof_la.EN_cc.India_Subs&campaigntype=Search&portfolio=India&language=EN&product=Subs&test=&audience=DSA&topic=Angular&priority=Alpha&utm_content=deal4584&utm_term=_._ag_185390583113_._ad_769665429035_._kw__._de_c_._dm__._pl__._ti_dsa-2436670445179_._li_9062237_._pd__._&matchtype=&gad_source=1&gad_campaignid=22900574864&gbraid=0AAAAADROdO2ELMNHqgXswMQFnXwdWezl7&gclid=Cj0KCQjwrJTGBhCbARIsANFBfguEO_lQskuBkZx9MAG5w1jy__z8_vzD72xAp7Pg5_G9qyxTwChHyNAaAh_BEALw_wcB&couponCode=PMNVD2025"
    },
    "vue.js": {
      level: "Beginner",
      url: "https://www.udemy.com/course/vuejs-2-the-complete-guide/"
    },
    "typescript": {
      level: "Beginner",
      url: "https://www.udemy.com/course/typescript-developer-course-beginner-to-expert/?utm_source=adwords&utm_medium=udemyads&utm_campaign=Search_DSA_Beta_Prof_la.EN_cc.India_Subs&campaigntype=Search&portfolio=India&language=EN&product=Subs&test=&audience=DSA&topic=&priority=Beta&utm_content=deal4584&utm_term=_._ag_185390585033_._ad_769665429293_._kw__._de_c_._dm__._pl__._ti_dsa-2436670172859_._li_9062237_._pd__._&matchtype=&gad_source=1&gad_campaignid=22900574867&gbraid=0AAAAADROdO0F94GKbcEGmIME-29mnprAi&gclid=Cj0KCQjwrJTGBhCbARIsANFBfguJfQLdsQTjnjWqEm65o_BvD6UXuFNvHLJVLbt4-Gx68iTW0HY8HrkaArBvEALw_wcB&couponCode=PMNVD2025"
    },
    "javascript": {
      level: "Beginner",
      url: "https://www.coursera.org/specializations/javascript-beginner"
    },
    "java": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/java-introduction"
    },
    "c++": {
      level: "Beginner",
      url: "https://www.coursera.org/learn/programming-with-c-plus-plus"
    },
    "c#": {
      level: "Beginner",
      url: "https://www.udemy.com/topic/c-sharp/"
    },
    "php": {
      level: "Beginner",
      url: "https://www.udemy.com/course/php-mastery-course-from-basics-to-advanced/?utm_source=adwords&utm_medium=udemyads&utm_campaign=Search_DSA_Beta_Prof_la.EN_cc.India_Subs&campaigntype=Search&portfolio=India&language=EN&product=Subs&test=&audience=DSA&topic=&priority=Beta&utm_content=deal4584&utm_term=_._ag_185390584313_._ad_769665429116_._kw__._de_c_._dm__._pl__._ti_dsa-2436670172539_._li_9062237_._pd__._&matchtype=&gad_source=1&gad_campaignid=22900574867&gbraid=0AAAAADROdO0F94GKbcEGmIME-29mnprAi&gclid=Cj0KCQjwrJTGBhCbARIsANFBfguYKHA93rJUQv-q83OheVUbLKJXPjJ6xx3uDN0XnZb9RQAfvlZQDEcaAqdeEALw_wcB&couponCode=PMNVD2025"
    },
    "ruby": {
      level: "Beginner",
      url: "https://www.udemy.com/course/the-complete-ruby-on-rails-developer-course/"
    },
    "go": {
      level: "Beginner",
      url: "https://www.coursera.org/specializations/go-programming-language"
    }
  };

  useEffect(() => {
    if (!location.state || !location.state.result) {
      toast({
        title: 'No data found',
        description: 'Redirecting to upload page.',
        variant: 'destructive',
      });
      setTimeout(() => navigate('/upload'), 2000);
      return;
    }

    const fetchedResult = location.state.result;

    // Preprocess for dummy realistic values
    const matched_skills = fetchedResult.matched_skills || [];
    const missing_skills = fetchedResult.missing_skills || [];
    const match_percentage = fetchedResult.match_percentage ?? Math.round((matched_skills.length / (matched_skills.length + missing_skills.length)) * 100);
    const timeSaved = fetchedResult.timeSaved ?? `${Math.floor(Math.random() * 30 + 10)} mins`;

    // Dummy overallScore based on existing data
    const overallScore = fetchedResult.overallScore ?? {
      Experience: Math.min(match_percentage + 10, 100),
      Skills: match_percentage,
      Certifications: Math.min(match_percentage - 5, 100),
      Education: Math.min(match_percentage + 5, 100),
    };

    const recommendations = fetchedResult.recommendations && fetchedResult.recommendations.length > 0
      ? fetchedResult.recommendations
      : [
        'Update your resume with measurable achievements for each role.',
        'Consider learning advanced skills relevant to the job description.',
        'Highlight certifications and courses that align with this role.',
        'Ensure your LinkedIn profile matches your resume keywords.',
      ];

    // Process ATS score data (independent of match score)
    const atsScore = fetchedResult.ats_score || {
      overall_ats_score: Math.floor(Math.random() * 30) + 60, // Random score between 60-90
      structure_score: Math.floor(Math.random() * 20) + 70,
      formatting_score: Math.floor(Math.random() * 25) + 65,
      keyword_density_score: Math.floor(Math.random() * 30) + 60,
      contact_score: Math.floor(Math.random() * 20) + 70,
      ats_grade: 'B+',
      ats_recommendations: [
        'Add missing essential sections like Summary or Objective',
        'Use bullet points to organize your experience and achievements',
        'Include more keywords from the job description throughout your resume',
        'Add complete contact information including email and phone'
      ]
    };

    setResult({
      ...fetchedResult,
      matched_skills,
      missing_skills,
      match_percentage,
      timeSaved,
      overallScore,
      recommendations,
      atsScore,
    });
  }, [location.state, navigate, toast]);

  const handleExportPDF = async () => {
    if (!result) return;
    setIsExporting(true);
    try {
      // Use the API abstraction for PDF export
      const pdfBlob = await exportPdf();

      // Create download link for the PDF blob
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ELEVATR_Analysis_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Report exported!',
        description: 'Your resume analysis report has been downloaded.',
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Export failed',
        description: 'Something went wrong while exporting the report.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = () => {
    toast({
      title: "Sharing functionality",
      description: "Share feature will be available soon!",
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-error';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-success';
    if (score >= 60) return 'bg-warning';
    return 'bg-error';
  };

  if (!result) return null;

  return (
    <div className="min-h-screen pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Link to="/upload">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Upload
              </Button>
            </Link>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="mb-2">
                <Trophy className="h-4 w-4 mr-2" />
                Analysis Complete
              </Badge>
              <h1 className="text-4xl font-bold mb-2">Resume Analysis Results</h1>
              <p className="text-muted-foreground">
                Generated on {new Date().toLocaleDateString()}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Share Results
              </Button>
              <Button
                variant="gradient"
                onClick={handleExportPDF}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export PDF Report
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="card-elevated border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Match Score</p>
                  <p className={`text-3xl font-bold ${getScoreColor(result.match_percentage)}`}>
                    {result.match_percentage}%
                  </p>
                </div>
                <div className={`p-3 rounded-full ${getScoreBg(result.match_percentage)}/10`}>
                  <Target className={`h-6 w-6 ${getScoreColor(result.match_percentage)}`} />
                </div>
              </div>
              <div className="mt-4">
                <Progress value={result.match_percentage} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Time Saved</p>
                  <p className="text-3xl font-bold text-primary">{result.estimated_time_saved_minutes}</p>
                </div>
                <div className="p-3 rounded-full bg-primary/10">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                vs manual optimization
              </p>
            </CardContent>
          </Card>

          <Card className="card-elevated border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Skills Matched</p>
                  <p className="text-3xl font-bold text-success">{result.matched_skills.length}</p>
                </div>
                <div className="p-3 rounded-full bg-success/10">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                out of {result.matched_skills.length + result.missing_skills.length} required
              </p>
            </CardContent>
          </Card>

          <Card className="card-elevated border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Missing Skills</p>
                  <p className="text-3xl font-bold text-warning">{result.missing_skills.length}</p>
                </div>
                <div className="p-3 rounded-full bg-warning/10">
                  <AlertTriangle className="h-6 w-6 text-warning" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                opportunities for growth
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ATS Score Analysis */}
        <Card className="card-elevated border-0 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-primary" />
              ATS Compatibility Score
            </CardTitle>
            <CardDescription>
              How well your resume format and structure performs with Applicant Tracking Systems (separate from skill matching)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Overall ATS Score */}
              <div className="lg:col-span-1">
                <div className="text-center p-6 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg">
                  <div className="flex items-center justify-center mb-4">
                    <Award className="h-12 w-12 text-primary" />
                  </div>
                  <div className="text-4xl font-bold text-primary mb-2">
                    {result.atsScore.overall_ats_score}%
                  </div>
                  <div className="text-2xl font-semibold text-muted-foreground mb-2">
                    Grade: {result.atsScore.ats_grade}
                  </div>
                  <Badge 
                    variant={result.atsScore.overall_ats_score >= 80 ? "default" : result.atsScore.overall_ats_score >= 60 ? "secondary" : "destructive"}
                    className="text-sm"
                  >
                    {result.atsScore.overall_ats_score >= 80 ? "Excellent" : result.atsScore.overall_ats_score >= 60 ? "Good" : "Needs Improvement"}
                  </Badge>
                </div>
              </div>

              {/* ATS Score Breakdown */}
              <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Resume Structure</span>
                      <span className="text-sm font-bold">{result.atsScore.structure_score}%</span>
                    </div>
                    <Progress value={result.atsScore.structure_score} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">ATS Formatting</span>
                      <span className="text-sm font-bold">{result.atsScore.formatting_score}%</span>
                    </div>
                    <Progress value={result.atsScore.formatting_score} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Keyword Density</span>
                      <span className="text-sm font-bold">{result.atsScore.keyword_density_score}%</span>
                    </div>
                    <Progress value={result.atsScore.keyword_density_score} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Contact Info</span>
                      <span className="text-sm font-bold">{result.atsScore.contact_score}%</span>
                    </div>
                    <Progress value={result.atsScore.contact_score} className="h-2" />
                  </div>
                </div>
              </div>
            </div>

            {/* ATS Recommendations */}
            <div className="mt-6">
              <h4 className="text-lg font-semibold mb-3 flex items-center">
                <TrendingUp className="h-4 w-4 mr-2 text-primary" />
                ATS Optimization Tips
              </h4>
              <div className="grid md:grid-cols-2 gap-3">
                {result.atsScore.ats_recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-muted/30 rounded-lg">
                    <div className="flex-shrink-0 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-relaxed">{recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Skills Analysis */}
          <div className="lg:col-span-2 space-y-8">
            {/* Matched Skills */}
            <Card className="card-elevated border-0">
              <CardHeader>
                <CardTitle className="flex items-center text-success">
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Matched Skills ({result.matched_skills.length})
                </CardTitle>
                <CardDescription>
                  Skills from your resume that match the job requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  {result.matched_skills.map((skill, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-success-light rounded-lg">
                      <div className="flex items-center">
                        <CheckCircle2 className="h-4 w-4 text-success mr-3" />
                        <div>
                          <p className="font-medium">{skill}</p>
                          <p className="text-xs text-muted-foreground">Proficiency: Intermediate</p>
                        </div>
                      </div>
                      <Badge
                        variant={skill.importance === 'High' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        Medium
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Missing Skills */}
            <Card className="card-elevated border-0">
              <CardHeader>
                <CardTitle className="flex items-center text-warning">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Skills to Develop ({result.missing_skills.length})
                </CardTitle>
                <CardDescription>
                  Skills mentioned in the job description that could strengthen your profile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {result.missing_skills.map((skill, index) => {
                    const courseInfo = techCourses[skill];

                    return (
                      <div key={index} className="flex items-center justify-between p-3 bg-warning-light rounded-lg">
                        <div className="flex items-center">
                          <AlertTriangle className="h-4 w-4 text-warning mr-3" />

                          {courseInfo ? (
                            <a
                              href={courseInfo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-primary hover:underline"
                            >
                              {skill}
                            </a>
                          ) : (
                            <p className="font-medium">{skill}</p>
                          )}

                          <p className="text-xs text-muted-foreground ml-2">
                            Current: Beginner
                          </p>
                        </div>

                        <Badge variant="secondary" className="text-xs">
                          High
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Overall Scores */}
            <Card className="card-elevated border-0">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="h-5 w-5 mr-2 text-primary" />
                  Overall Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(result.overallScore).map(([category, score]) => {
                  const numericScore = typeof score === 'number' ? Number(score.toFixed(1)) : 0;
                  return (
                    <div key={category}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium capitalize">{category}</span>
                        <span className={`text-sm font-bold ${getScoreColor(numericScore)}`}>
                          {numericScore}%
                        </span>
                      </div>
                      <Progress value={numericScore} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="card-elevated border-0">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-primary" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  View Detailed Report
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Track Progress
                </Button>
                <Link to="/upload" className="block">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Target className="h-4 w-4 mr-2" />
                    Analyze Another Role
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recommendations */}
        <Card className="card-elevated border-0 mt-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Lightbulb className="h-5 w-5 mr-2 text-primary" />
              Personalized Recommendations
            </CardTitle>
            <CardDescription>
              AI-generated insights to improve your chances of landing this role
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {result.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start space-x-3 p-4 bg-muted/30 rounded-lg">
                  <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-relaxed">{recommendation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Next Steps CTA */}
        <Card className="card-elevated border-0 mt-8 bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardContent className="p-8 text-center">
            <h3 className="text-2xl font-bold mb-4">Ready to Build Your Resume?</h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Create a professional resume with our resume builder or analyze another position.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/upload">
                <Button variant="gradient" size="lg">
                  <Target className="h-5 w-5 mr-2" />
                  Analyze New Position
                </Button>
              </Link>
              <Link to="/buildcv">
                <Button variant="outline" size="lg">
                  <Star className="h-5 w-5 mr-2" />
                  Build Resume
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResultsPage;