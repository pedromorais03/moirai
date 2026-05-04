import { useState, useEffect, useRef } from "react";
import "./App.css";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

interface Finding {
  file: string;
  type: string;
  id: string;
  title: string;
  severity: Severity;
  description: string;
  message: string;
  resolution: string;
  references: string[];
  status: string;
}

interface Summary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

interface ScanResult {
  summary: Summary;
  findings: Finding[];
}

type ScanStatus = "idle" | "scanning" | "completed" | "failed";
type ScanMode = "file" | "repo";

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; label: string }> = {
  CRITICAL: { color: "#ff2d55", bg: "rgba(255,45,85,0.12)", label: "Critical" },
  HIGH:     { color: "#ff6b35", bg: "rgba(255,107,53,0.12)", label: "High" },
  MEDIUM:   { color: "#ffd60a", bg: "rgba(255,214,10,0.12)", label: "Medium" },
  LOW:      { color: "#30d158", bg: "rgba(48,209,88,0.12)", label: "Low" },
  UNKNOWN:  { color: "#8e8e93", bg: "rgba(142,142,147,0.12)", label: "Unknown" },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.UNKNOWN;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20, fontSize: 11,
      fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}33`,
    }}>
      {cfg.label}
    </span>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12, overflow: "hidden",
      animation: `fadeUp 0.3s ease both`, animationDelay: `${index * 40}ms`,
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", background: "none", border: "none", padding: "14px 18px",
        cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
      }}>
        <SeverityBadge severity={finding.severity} />
        <span style={{ flex: 1, color: "#f0f0f0", fontSize: 14, fontWeight: 500 }}>{finding.title}</span>
        <span style={{ color: "#555", fontSize: 12, fontFamily: "monospace" }}>{finding.id}</span>
        <span style={{ color: "#555", fontSize: 12, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={{ color: "#999", fontSize: 13, marginTop: 12 }}>{finding.description}</p>
          {finding.message && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(255,45,85,0.06)", borderRadius: 8, borderLeft: "3px solid #ff2d55" }}>
              <p style={{ color: "#ccc", fontSize: 13, margin: 0 }}>{finding.message}</p>
            </div>
          )}
          {finding.resolution && (
            <div style={{ marginTop: 10 }}>
              <span style={{ color: "#30d158", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Resolution</span>
              <p style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>{finding.resolution}</p>
            </div>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#555", fontSize: 12 }}>📄 {finding.file}</span>
            <span style={{ color: "#333" }}>·</span>
            <span style={{ color: "#555", fontSize: 12 }}>{finding.type}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<ScanMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<Severity | "ALL">("ALL");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async () => {
    if (!file) return;
    setStatus("scanning"); setResult(null); setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("http://localhost:3000/scan/file", { method: "POST", body: formData });
      const data = await res.json();
      setJobId(data.jobId);
    } catch (e: any) { setError(e.message); setStatus("failed"); }
  };

  const handleRepoScan = async () => {
    if (!repoUrl.trim()) return;
    setStatus("scanning"); setResult(null); setError(null);
    try {
      const res = await fetch("http://localhost:3000/scan/repo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = await res.json();
      setJobId(data.jobId);
    } catch (e: any) { setError(e.message); setStatus("failed"); }
  };

  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3000/scan/${jobId}`);
        const data = await res.json();
        if (data.status === "completed") { setResult(data.result); setStatus("completed"); clearInterval(interval); }
        else if (data.status === "failed") { setError(data.error || "Scan failed"); setStatus("failed"); clearInterval(interval); }
      } catch (e: any) { setError(e.message); setStatus("failed"); clearInterval(interval); }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId]);

  const filteredFindings = result?.findings.filter(
    (f) => filterSeverity === "ALL" || f.severity === filterSeverity
  ) ?? [];

  const reset = () => {
    setFile(null); setRepoUrl(""); setJobId(null);
    setStatus("idle"); setResult(null); setError(null); setFilterSeverity("ALL");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "moirai-report.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    if (!result) return;
    const headers = ["ID", "Severity", "Title", "File", "Type", "Description", "Resolution"];
    const rows = result.findings.map((f) => [
      f.id, f.severity,
      `"${f.title.replace(/"/g, '""')}"`,
      `"${f.file.replace(/"/g, '""')}"`,
      f.type,
      `"${(f.description || "").replace(/"/g, '""')}"`,
      `"${(f.resolution || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "moirai-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = () => {
    if (!result) return;
    const date = new Date().toLocaleString("pt-BR");
    const sColor: Record<string, string> = {
      CRITICAL: "#ff2d55", HIGH: "#ff6b35", MEDIUM: "#ffd60a", LOW: "#30d158", UNKNOWN: "#8e8e93",
    };
    const findingsHTML = result.findings.map((f) => `
      <div style="margin-bottom:16px;padding:14px;border:1px solid #e5e7eb;border-radius:8px;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="background:${sColor[f.severity] ?? '#888'}22;color:${sColor[f.severity] ?? '#888'};border:1px solid ${sColor[f.severity] ?? '#888'}44;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;">${f.severity}</span>
          <strong style="font-size:14px;">${f.title}</strong>
          <span style="margin-left:auto;color:#9ca3af;font-size:12px;font-family:monospace;">${f.id}</span>
        </div>
        ${f.description ? `<p style="color:#6b7280;font-size:13px;margin:0 0 8px;">${f.description}</p>` : ""}
        ${f.message ? `<div style="background:#fff1f2;border-left:3px solid #ff2d55;padding:8px 12px;border-radius:4px;font-size:13px;color:#374151;margin-bottom:8px;">${f.message}</div>` : ""}
        ${f.resolution ? `<p style="font-size:12px;color:#059669;margin:0;"><strong>Resolução:</strong> ${f.resolution}</p>` : ""}
        <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;">📄 ${f.file} · ${f.type}</p>
      </div>
    `).join("");
    const summaryHTML = (["CRITICAL","HIGH","MEDIUM","LOW","UNKNOWN"] as const).map((s) => {
      const count = result.summary[s.toLowerCase() as keyof typeof result.summary];
      return `<div style="padding:10px 16px;border:1px solid ${sColor[s]}44;border-radius:8px;text-align:center;min-width:80px;"><div style="font-size:22px;font-weight:700;color:${sColor[s]};">${count}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:${sColor[s]};">${s}</div></div>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Moirai Report</title><style>body{font-family:'Segoe UI',sans-serif;color:#111;padding:40px;max-width:860px;margin:0 auto;}h1{font-size:28px;margin-bottom:4px;}h2{font-size:16px;font-weight:600;margin:32px 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;}</style></head><body>
      <h1>⚡ Moirai</h1>
      <p style="color:#6b7280;font-size:13px;">Relatório gerado em ${date}</p>
      <h2>Resumo</h2>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">${summaryHTML}</div>
      <p style="color:#6b7280;font-size:13px;">${result.summary.total} findings no total</p>
      <h2>Findings</h2>
      ${result.findings.length === 0 ? '<p style="color:#059669;">Nenhuma misconfiguration detectada.</p>' : findingsHTML}
    </body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    win?.addEventListener("load", () => { win.print(); URL.revokeObjectURL(url); });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#f0f0f0", fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .scan-btn:hover:not(:disabled) { background: #e0263f !important; transform: translateY(-1px); }
        .scan-btn { transition: all 0.15s ease !important; }
        .mode-tab:hover { color: #f0f0f0 !important; }
        .filter-btn:hover { border-color: rgba(255,255,255,0.3) !important; }
        .dl-btn:hover { background: rgba(255,255,255,0.08) !important; border-color: rgba(255,255,255,0.2) !important; transform: translateY(-1px); }
        input:focus { border-color: rgba(255,45,85,0.4) !important; box-shadow: 0 0 0 3px rgba(255,45,85,0.08) !important; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #ff2d55, #ff6b35)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>MOIRAI</span>
          <span style={{ color: "#333", fontSize: 12, marginLeft: 4 }}>// DevSecOps Scanner</span>
        </div>
        {status !== "idle" && (
          <button onClick={reset} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "#888", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
            ↩ New Scan
          </button>
        )}
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>

        {/* Input Panel */}
        {status === "idle" && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>
              Scan for<br />
              <span style={{ background: "linear-gradient(90deg, #ff2d55, #ff6b35)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                misconfigurations.
              </span>
            </h1>
            <p style={{ color: "#555", fontSize: 14, marginBottom: 36 }}>Upload a Dockerfile or IaC file, or point to a Git repository.</p>

            {/* Mode Tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 24, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4, width: "fit-content" }}>
              {(["file", "repo"] as ScanMode[]).map((m) => (
                <button key={m} className="mode-tab" onClick={() => setMode(m)} style={{
                  background: mode === m ? "rgba(255,255,255,0.1)" : "none",
                  border: "none", color: mode === m ? "#f0f0f0" : "#555",
                  padding: "8px 20px", borderRadius: 7, cursor: "pointer",
                  fontSize: 13, fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s ease",
                }}>
                  {m === "file" ? "📄 File Upload" : "🔗 Repository"}
                </button>
              ))}
            </div>

            {mode === "file" ? (
              <div>
                <div onClick={() => fileInputRef.current?.click()} style={{
                  border: `2px dashed ${file ? "#ff2d55" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 14, padding: "40px 24px", textAlign: "center",
                  cursor: "pointer", transition: "all 0.2s ease",
                  background: file ? "rgba(255,45,85,0.04)" : "rgba(255,255,255,0.02)",
                }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
                  <p style={{ color: file ? "#ff2d55" : "#555", fontSize: 14 }}>{file ? `✓ ${file.name}` : "Click to select a file"}</p>
                  <p style={{ color: "#333", fontSize: 12, marginTop: 4 }}>Dockerfile, .tf, .yaml, .json, .bicep...</p>
                  <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
                <button className="scan-btn" onClick={handleFileUpload} disabled={!file} style={{
                  marginTop: 16, width: "100%", padding: "14px",
                  background: file ? "#ff2d55" : "rgba(255,255,255,0.05)",
                  border: "none", borderRadius: 10, color: file ? "#fff" : "#333",
                  fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                  cursor: file ? "pointer" : "not-allowed", letterSpacing: "0.05em",
                }}>
                  RUN SCAN →
                </button>
              </div>
            ) : (
              <div>
                <input type="text" placeholder="https://github.com/org/repo" value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRepoScan()}
                  style={{
                    width: "100%", padding: "14px 16px",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10, color: "#f0f0f0", fontSize: 14, fontFamily: "inherit", outline: "none",
                    transition: "all 0.15s ease",
                  }}
                />
                <button className="scan-btn" onClick={handleRepoScan} disabled={!repoUrl.trim()} style={{
                  marginTop: 12, width: "100%", padding: "14px",
                  background: repoUrl.trim() ? "#ff2d55" : "rgba(255,255,255,0.05)",
                  border: "none", borderRadius: 10, color: repoUrl.trim() ? "#fff" : "#333",
                  fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                  cursor: repoUrl.trim() ? "pointer" : "not-allowed", letterSpacing: "0.05em",
                }}>
                  RUN SCAN →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scanning */}
        {status === "scanning" && (
          <div style={{ textAlign: "center", padding: "80px 0", animation: "fadeUp 0.4s ease both" }}>
            <div style={{ width: 48, height: 48, border: "3px solid rgba(255,45,85,0.2)", borderTopColor: "#ff2d55", borderRadius: "50%", margin: "0 auto 24px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "#555", fontSize: 14, animation: "pulse 2s ease infinite" }}>Scanning for misconfigurations...</p>
            {jobId && <p style={{ color: "#333", fontSize: 12, marginTop: 8 }}>job: {jobId}</p>}
          </div>
        )}

        {/* Error */}
        {status === "failed" && (
          <div style={{ padding: "24px", background: "rgba(255,45,85,0.08)", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 12, animation: "fadeUp 0.4s ease both" }}>
            <p style={{ color: "#ff2d55", fontWeight: 700, marginBottom: 6 }}>Scan failed</p>
            <p style={{ color: "#888", fontSize: 13 }}>{error}</p>
          </div>
        )}

        {/* Results */}
        {status === "completed" && result && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 32 }}>
              {(["critical", "high", "medium", "low", "unknown"] as const).map((sev) => {
                const cfg = SEVERITY_CONFIG[sev.toUpperCase() as Severity];
                const count = result.summary[sev];
                return (
                  <div key={sev} style={{ padding: "14px 12px", background: count > 0 ? cfg.bg : "rgba(255,255,255,0.02)", border: `1px solid ${count > 0 ? cfg.color + "44" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: count > 0 ? cfg.color : "#333", fontFamily: "'Syne', sans-serif" }}>{count}</div>
                    <div style={{ fontSize: 10, color: count > 0 ? cfg.color : "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{cfg.label}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <span style={{ color: "#555", fontSize: 13 }}>
                {result.summary.total === 0 ? "✅ No issues found" : `${filteredFindings.length} of ${result.summary.total} findings`}
              </span>
              {result.summary.total > 0 && (
                <div style={{ display: "flex", gap: 6 }}>
                  {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => (
                    <button key={s} className="filter-btn" onClick={() => setFilterSeverity(s)} style={{
                      background: filterSeverity === s ? "rgba(255,255,255,0.1)" : "none",
                      border: `1px solid ${filterSeverity === s ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)"}`,
                      color: filterSeverity === s ? "#f0f0f0" : "#555",
                      padding: "4px 12px", borderRadius: 20, fontSize: 11,
                      fontFamily: "inherit", cursor: "pointer", fontWeight: 600, transition: "all 0.15s ease",
                    }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {result.summary.total === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "#30d158" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                  <p style={{ fontWeight: 700 }}>All clear!</p>
                  <p style={{ color: "#555", fontSize: 13, marginTop: 4 }}>No misconfigurations detected.</p>
                </div>
              ) : filteredFindings.length === 0 ? (
                <p style={{ color: "#555", fontSize: 13, textAlign: "center", padding: "32px 0" }}>No findings for this severity.</p>
              ) : (
                filteredFindings.map((f, i) => <FindingCard key={`${f.id}-${i}`} finding={f} index={i} />)
              )}
            </div>

            {/* Download Section */}
            <div style={{ marginTop: 32, padding: "20px 24px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14 }}>
              <p style={{ color: "#555", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 14 }}>
                Exportar relatório
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {([
                  { label: "JSON", icon: "{}", fn: downloadJSON, desc: "Dados brutos" },
                  { label: "CSV",  icon: "⊞", fn: downloadCSV,  desc: "Planilha" },
                  { label: "PDF",  icon: "⎙", fn: downloadPDF,  desc: "Relatório imprimível" },
                ] as const).map(({ label, icon, fn, desc }) => (
                  <button
                    key={label}
                    className="dl-btn"
                    onClick={fn}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
                      borderRadius: 10, padding: "10px 18px", cursor: "pointer",
                      fontFamily: "inherit", transition: "all 0.15s ease",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{icon}</span>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ color: "#f0f0f0", fontSize: 13, fontWeight: 700 }}>{label}</div>
                      <div style={{ color: "#555", fontSize: 11 }}>{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}