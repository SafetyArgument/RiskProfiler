import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  FileText, 
  AlertTriangle, 
  Table as TableIcon, 
  Image as ImageIcon, 
  Loader2, 
  ChevronRight, 
  CheckCircle2,
  ExternalLink,
  Info,
  Printer,
  Download,
  Sun,
  Moon
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/src/lib/utils";
import rehypeRaw from "rehype-raw";
import { runBasicResearch, ResearchParams, StepResult } from "@/src/lib/gemini";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { saveAs } from "file-saver";

const STEPS = [
  { id: 1, name: "Search Standards", icon: Search },
  { id: 2, name: "Guidelines & Codes", icon: FileText },
  { id: 3, name: "Hazards & Mitigations", icon: AlertTriangle },
  { id: 4, name: "Risk Profile Table", icon: TableIcon },
];

export default function App() {
  const [darkMode, setDarkMode] = useState(true); // Default to dark
  const [params, setParams] = useState<ResearchParams>({
    title: "",
    jurisdiction: "",
    application: "",
    context: "",
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);
  const [isSearching, setIsSearching] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<StepResult[]>([]);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingXLS, setIsExportingXLS] = useState(false);
  const resultsEndRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const toggleStep = (stepId: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  // const scrollToBottom = () => {
  //   resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  // };

  // useEffect(() => {
  //   scrollToBottom();
  // }, [results]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!params.title || !params.jurisdiction || !params.application || !params.context) {
      setError("Please fill in all fields.");
      return;
    }

    setError(null);
    setIsSearching(true);
    setCurrentStep(1);
    setResults([]);
    setExpandedSteps(new Set()); // All collapsed by default

    try {
      await runBasicResearch(params, (result) => {
        setResults((prev) => [...prev, result]);
        setCurrentStep(result.step);
        // We keep it collapsed as per user request: "default state of each state report is collapsed"
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during research.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleExportPDF = async () => {
    if (results.length === 0) return;
    setIsExporting(true);
    
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yOffset = 20;

      const addWrappedText = (text: string, fontSize = 10, isBold = false, isItalic = false, color = [20, 20, 20]) => {
        const fontStyle = isBold && isItalic ? "bolditalic" : isBold ? "bold" : isItalic ? "italic" : "normal";
        doc.setFont("helvetica", fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(color[0], color[1], color[2]);
        
        // Clean markdown artifacts
        const cleanText = text
          .replace(/\*\*/g, "")
          .replace(/\*/g, "")
          .replace(/### /g, "")
          .replace(/## /g, "")
          .replace(/# /g, "")
          .trim();

        const lines = doc.splitTextToSize(cleanText, pageWidth - (margin * 2));
        
        lines.forEach((line: string) => {
          if (yOffset > 280) {
            doc.addPage();
            yOffset = 20;
          }
          doc.text(line, margin, yOffset);
          yOffset += fontSize * 0.5;
        });
        yOffset += 2;
      };

      // Title Page
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.text("Safety Argument", margin, yOffset);
      yOffset += 12;
      doc.setFontSize(18);
      doc.text("Basic Research Risk Profile Report", margin, yOffset);
      yOffset += 15;
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("PROJECT DETAILS", margin, yOffset);
      yOffset += 8;

      const details = [
        { label: "Title:", value: params.title },
        { label: "Jurisdiction:", value: params.jurisdiction },
        { label: "Application:", value: params.application },
        { label: "Context:", value: params.context },
      ];

      details.forEach(detail => {
        doc.setFont("helvetica", "bold");
        doc.text(detail.label, margin, yOffset);
        doc.setFont("helvetica", "normal");
        const valLines = doc.splitTextToSize(detail.value, pageWidth - margin - 50);
        doc.text(valLines, margin + 35, yOffset);
        yOffset += (valLines.length * 5) + 2;
      });
      
      yOffset += 5;
      doc.setDrawColor(20, 20, 20);
      doc.line(margin, yOffset, pageWidth - margin, yOffset);
      yOffset += 15;

      for (const result of results) {
        if (yOffset > 250) {
          doc.addPage();
          yOffset = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(`Step ${result.step}: ${STEPS[result.step - 1].name}`, margin, yOffset);
        yOffset += 10;

        const lines = result.content.split("\n");
        let tableRows: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          if (line.startsWith("|")) {
            tableRows.push(line);
            // If next line is not a table line or it's the last line, render the table
            if (i === lines.length - 1 || !lines[i+1].trim().startsWith("|")) {
              const rows = tableRows.filter(r => !r.includes("---"));
              if (rows.length > 1) {
                const head = [rows[0].split("|").map(s => s.trim().replace(/\*\*/g, "").replace(/\*/g, "")).filter(s => s !== "")];
                const body = rows.slice(1).map(row => 
                  row.split("|").map(s => s.trim()
                    .replace(/<br\s*\/?>/gi, "\n")
                    .replace(/\*\*/g, "")
                    .replace(/\*/g, "")
                  ).filter(s => s !== "")
                );

                autoTable(doc, {
                  head,
                  body,
                  startY: yOffset,
                  margin: { left: margin, right: margin },
                  styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', font: 'helvetica' },
                  headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold' },
                  alternateRowStyles: { fillColor: [245, 245, 245] },
                  didDrawPage: (data: any) => {
                    yOffset = data.cursor.y;
                  }
                });
                yOffset = (doc as any).lastAutoTable.finalY + 10;
              }
              tableRows = [];
            }
          } else if (line) {
            // Regular text parsing
            if (line.startsWith("### ")) {
              addWrappedText(line, 12, true);
            } else if (line.startsWith("## ")) {
              addWrappedText(line, 14, true);
            } else if (line.startsWith("# ")) {
              addWrappedText(line, 16, true);
            } else if (line.startsWith("* ") || line.startsWith("- ")) {
              addWrappedText("• " + line.substring(2), 10, false);
            } else {
              addWrappedText(line, 10, false);
            }
          } else {
            yOffset += 3;
          }
        }

        if (result.step === 4 && result.groundingMetadata?.groundingChunks) {
          if (yOffset > 240) {
            doc.addPage();
            yOffset = 20;
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text("BIBLIOGRAPHY (ISO 690)", margin, yOffset);
          yOffset += 8;
          
          doc.setFontSize(8);
          result.groundingMetadata.groundingChunks.forEach((chunk: any, i: number) => {
            if (chunk.web) {
              const ref = `[${i + 1}] ${chunk.web.title}. [online]. Available from: ${chunk.web.uri}`;
              const lines = doc.splitTextToSize(ref, pageWidth - (margin * 2));
              
              lines.forEach((line: string) => {
                if (yOffset > 280) {
                  doc.addPage();
                  yOffset = 20;
                }
                
                doc.setFont("helvetica", "normal");
                doc.setTextColor(20, 20, 20);
                
                // If the line contains the URI, we need to handle the link
                if (line.includes(chunk.web.uri)) {
                  const parts = line.split(chunk.web.uri);
                  doc.text(parts[0], margin, yOffset);
                  const xOffset = doc.getTextWidth(parts[0]);
                  
                  doc.setTextColor(0, 0, 255);
                  doc.setFont("helvetica", "italic");
                  doc.text(chunk.web.uri, margin + xOffset, yOffset);
                  
                  // Add the link - using a slightly larger area for better hit detection
                  doc.link(margin + xOffset, yOffset - 4, doc.getTextWidth(chunk.web.uri), 5, { url: chunk.web.uri });
                  
                  if (parts[1]) {
                    const xOffsetAfter = xOffset + doc.getTextWidth(chunk.web.uri);
                    doc.setTextColor(20, 20, 20);
                    doc.setFont("helvetica", "normal");
                    doc.text(parts[1], margin + xOffsetAfter, yOffset);
                  }
                } else {
                  doc.text(line, margin, yOffset);
                }
                yOffset += 4;
              });
              yOffset += 2;
            }
          });
          yOffset += 10;
        }
      }

      // Disclaimer
      if (yOffset > 250) {
        doc.addPage();
        yOffset = 20;
      }
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yOffset, pageWidth - margin, yOffset);
      yOffset += 10;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      const disclaimer = "DISCLAIMER: This report is generated by an AI-powered basic research tool. Safety Argument provides this information for guidance purposes only and does not guarantee the accuracy, completeness, or regulatory compliance of the findings. Users are responsible for verifying all standards, hazards, and mitigations with qualified professionals and official regulatory bodies. Safety Argument shall not be liable for any decisions made or actions taken based on this report.";
      const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - (margin * 2));
      doc.text(disclaimerLines, margin, yOffset);

      doc.save(`${params.title.replace(/\s+/g, "_")}_Safety_Argument_Report.pdf`);
    } catch (err) {
      console.error("PDF Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportWord = async () => {
    if (results.length === 0) return;
    setIsExportingXLS(true);
    
    try {
      const children: (Paragraph | Table)[] = [
        new Paragraph({ text: "Safety Argument", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "Basic Research Risk Profile Report", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: "PROJECT DETAILS", heading: HeadingLevel.HEADING_3 }),
        new Paragraph({ text: `Title: ${params.title}` }),
        new Paragraph({ text: `City/State: ${params.jurisdiction}` }),
        new Paragraph({ text: `Application: ${params.application}` }),
        new Paragraph({ text: `Context: ${params.context}` }),
        new Paragraph({ text: "" }),
      ];

      for (const result of results) {
        children.push(new Paragraph({ text: `Step ${result.step}: ${STEPS[result.step - 1].name}`, heading: HeadingLevel.HEADING_3 }));
        
        const lines = result.content.split("\n");
        let tableRows: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith("|")) {
            tableRows.push(line);
            if (i === lines.length - 1 || !lines[i+1].trim().startsWith("|")) {
              const rows = tableRows.filter(r => !r.includes("---"));
              if (rows.length > 0) {
                const table = new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: rows.map(row => new TableRow({
                    children: row.split("|").filter(s => s.trim() !== "").map(cell => new TableCell({
                      children: [new Paragraph({ text: cell.trim().replace(/<br\s*\/?>/gi, "\n").replace(/\*\*/g, "").replace(/\*/g, "") })]
                    }))
                  }))
                });
                children.push(table);
                children.push(new Paragraph({ text: "" }));
              }
              tableRows = [];
            }
          } else if (line) {
            let heading: any = undefined;
            let text = line;
            let bullet = undefined;
            
            if (line.startsWith("### ")) { heading = HeadingLevel.HEADING_3; text = line.replace("### ", ""); }
            else if (line.startsWith("## ")) { heading = HeadingLevel.HEADING_2; text = line.replace("## ", ""); }
            else if (line.startsWith("# ")) { heading = HeadingLevel.HEADING_1; text = line.replace("# ", ""); }
            else if (line.startsWith("* ") || line.startsWith("- ")) { bullet = { level: 0 }; text = line.substring(2); }
            
            children.push(new Paragraph({ 
              text: text.replace(/\*\*/g, "").replace(/\*/g, ""), 
              heading, 
              bullet 
            }));
          }
        }
        children.push(new Paragraph({ text: "" }));
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children: children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${params.title.replace(/\s+/g, "_")}_Safety_Argument_Report.docx`);
    } catch (err) {
      console.error("Word Export failed:", err);
    } finally {
      setIsExportingXLS(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-foreground selection:text-background transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-border p-6 flex justify-between items-center bg-background/80 backdrop-blur-md sticky top-0 z-50 transition-colors duration-300">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-background flex items-center justify-center rounded-lg transition-colors duration-300 border border-border">
            <img 
              src={darkMode ? `${import.meta.env.BASE_URL}Logo_bw.jpg` : `${import.meta.env.BASE_URL}Logo_wb.jpg`} 
              alt="Logo" 
              className="w-8 h-8 object-contain"
            />
          </div>
          <div>
            <h1 className="font-sans font-extrabold text-xl tracking-tight leading-none uppercase">Safety Argument</h1>
            <p className="text-[10px] uppercase tracking-widest opacity-50 mt-1 font-mono">Basic Research Risk Profiler</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleDarkMode} 
            className="p-2 rounded-full hover:bg-secondary transition-colors duration-300 mr-2"
            aria-label="Toggle Dark Mode"
          >
            {darkMode ? <Sun className="w-5 h-5 text-accent" /> : <Moon className="w-5 h-5 text-accent" />}
          </button>

          {results.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-xs font-mono uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50"
              >
                {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
                <span>Export PDF</span>
              </button>
              <button
                onClick={handleExportWord}
                disabled={isExportingXLS}
                className="flex items-center gap-2 px-4 py-2 bg-background border border-border text-foreground rounded-lg text-xs font-mono uppercase tracking-widest hover:bg-secondary transition-all disabled:opacity-50"
              >
                {isExportingXLS ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                <span>Export Word</span>
              </button>
            </div>
          )}
          {isSearching && (
            <div className="flex items-center gap-2 px-3 py-1 bg-foreground text-background rounded-full text-xs font-mono animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Step {currentStep}/4</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Horizontal Progress Bar */}
        <div className="flex gap-2 h-1 w-full max-w-4xl mx-auto">
          {[1, 2, 3, 4].map((stepId) => {
            const isCompleted = results.some((r) => r.step === stepId);
            const isActive = currentStep === stepId;
            return (
              <div 
                key={stepId}
                className={cn(
                  "flex-1 rounded-lg transition-all duration-500",
                  isCompleted ? "bg-foreground" : isActive ? "bg-foreground animate-pulse" : "bg-border"
                )}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8 items-start">
          {/* Sidebar: Form */}
          <aside className="space-y-8 lg:sticky lg:top-24">
            <section className="bg-background border border-border p-8 rounded-lg">
              <div className="flex items-center gap-2 mb-8 border-b border-border pb-4 group relative">
                <h2 className="font-sans font-bold uppercase tracking-widest text-sm">Research Parameters</h2>
                <div className="relative group">
                  <Info className="w-4 h-4 opacity-40 cursor-help hover:opacity-100 transition-opacity" />
                  <div className="absolute left-full ml-4 top-0 w-64 p-4 bg-foreground text-background text-[10px] leading-relaxed rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] shadow-2xl border border-border/10">
                    Ensure to use only those key words which relate to your intended area of interest without adjacent concerns, narrow it by limiting context to minimum relevant.
                  </div>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 flex-1">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-40 font-mono">Project Title</label>
                  <input
                    type="text"
                    value={params.title}
                    onChange={(e) => setParams({ ...params, title: e.target.value })}
                    placeholder="e.g. Smart City Infrastructure"
                    className="w-full bg-secondary border border-border p-4 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground transition-all text-foreground"
                    disabled={isSearching}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-40 font-mono">City/State</label>
                  <input
                    type="text"
                    value={params.jurisdiction}
                    onChange={(e) => setParams({ ...params, jurisdiction: e.target.value })}
                    placeholder="e.g. European Union"
                    className="w-full bg-secondary border border-border p-4 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground transition-all text-foreground"
                    disabled={isSearching}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-40 font-mono">Application</label>
                  <input
                    type="text"
                    value={params.application}
                    onChange={(e) => setParams({ ...params, application: e.target.value })}
                    placeholder="e.g. Autonomous Delivery Drones"
                    className="w-full bg-secondary border border-border p-4 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground transition-all text-foreground"
                    disabled={isSearching}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-40 font-mono">Context</label>
                  <textarea
                    value={params.context}
                    onChange={(e) => setParams({ ...params, context: e.target.value })}
                    placeholder="e.g. Urban residential areas with high pedestrian density"
                    className="w-full bg-secondary border border-border p-4 text-sm min-h-[150px] rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground transition-all text-foreground resize-none"
                    disabled={isSearching}
                  />
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-[10px] uppercase tracking-wider font-mono flex items-center gap-3 rounded-lg">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSearching}
                  className={cn(
                    "w-full py-5 bg-accent text-background font-mono text-xs uppercase tracking-[0.2em] font-bold rounded-lg transition-all flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.98]",
                    isSearching && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Start Basic Research
                    </>
                  )}
                </button>
              </form>
            </section>
          </aside>

        {/* Main Content: Results */}
        <section className="space-y-8 min-h-[80vh]">
          {results.length === 0 && !isSearching && (
            <div className="h-full flex flex-col items-center justify-center text-center p-24 border border-dashed border-border rounded-lg bg-background transition-colors duration-300">
              <div className="w-24 h-24 bg-background flex items-center justify-center rounded-2xl border border-border mb-8 shadow-sm transition-colors duration-300">
                <img 
                  src={darkMode ? `${import.meta.env.BASE_URL}Logo_bw.jpg` : `${import.meta.env.BASE_URL}Logo_wb.jpg`} 
                  alt="Logo" 
                  className="w-16 h-16 object-contain"
                />
              </div>
              <h3 className="font-sans font-bold uppercase tracking-[0.2em] text-2xl opacity-30">Safety Argument</h3>
              <p className="text-xs opacity-40 max-w-sm mt-4 font-mono leading-relaxed uppercase tracking-wider">Enter project details to generate a basic risk profile and regulatory report.</p>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {results.map((result) => {
              const isExpanded = expandedSteps.has(result.step);
              return (
                <motion.div
                  key={result.step}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-background border border-border rounded-lg overflow-hidden"
                >
                  <button 
                    onClick={() => toggleStep(result.step)}
                    className="w-full bg-foreground text-background p-6 flex justify-between items-center hover:opacity-95 transition-all duration-300"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-[10px] font-bold opacity-40">0{result.step}</span>
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold">{STEPS[result.step - 1].name}</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
                    </div>
                  </button>

                  <motion.div
                    initial={false}
                    animate={{ height: isExpanded ? "auto" : "80px" }}
                    className="overflow-hidden relative"
                  >
                    <div className="p-10">
                      {result.step === 4 && result.groundingMetadata && isExpanded && (
                        <div className="mb-8 p-6 bg-secondary border-l-2 border-foreground space-y-4 rounded-r-lg">
                          <p className="text-[10px] uppercase tracking-[0.2em] font-bold font-mono opacity-40">Verified Sources & Bibliography</p>
                          <div className="flex flex-wrap gap-3">
                            {result.groundingMetadata.groundingChunks?.map((chunk: any, i: number) => (
                              chunk.web && (
                                <a 
                                  key={i}
                                  href={chunk.web.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-background border border-border text-[10px] font-mono uppercase tracking-wider hover:bg-foreground hover:text-background transition-all rounded-lg"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {chunk.web.title || "Source"}
                                </a>
                              )
                            ))}
                          </div>
                        </div>
                      )}

                      <div className={cn(
                        "prose prose-sm max-w-none prose-headings:font-bold prose-headings:uppercase prose-headings:tracking-widest prose-p:leading-relaxed prose-li:leading-relaxed",
                        !isExpanded && "line-clamp-2 opacity-30"
                      )}>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]} 
                          rehypePlugins={[rehypeRaw]}
                        >
                          {result.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                    
                    {!isExpanded && (
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />
                    )}
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {isSearching && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-16 flex flex-col items-center justify-center gap-6 text-foreground/20"
            >
              <Loader2 className="w-10 h-10 animate-spin" />
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] font-bold">Synthesizing Step {currentStep}...</p>
            </motion.div>
          )}

          <div ref={resultsEndRef} />
        </section>
      </div>
    </main>

      {/* Footer */}
      <footer className="border-t border-border p-12 mt-24 bg-secondary/30">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-30 font-mono">
              © 2026 Safety Argument
            </p>
            <div className="flex gap-8">
              <a href="https://blog.safetyassurance.au" target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-30 hover:opacity-100 transition-opacity font-mono">Blog</a>
              <a href="https://www.safetyargument.com.au" target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-30 hover:opacity-100 transition-opacity font-mono">Website</a>
            </div>
          </div>
          
          <div className="pt-8 border-t border-border/50">
            <p className="text-[9px] leading-loose opacity-30 font-sans max-w-5xl uppercase tracking-wider">
              <span className="font-extrabold">Disclaimer:</span> This tool is provided by Safety Argument for basic research and guidance purposes only. The information generated is powered by artificial intelligence and may contain inaccuracies or omissions. Safety Argument does not guarantee regulatory compliance or technical accuracy of the results. Users are strictly advised to consult with qualified safety professionals and legal experts before implementing any findings. Safety Argument assumes no liability for damages, losses, or legal consequences arising from the use of this tool or reliance on its generated reports.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
