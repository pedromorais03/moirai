import { useState, useEffect, useRef } from "react";
import "./App.css";

type Severity   = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
type ScanStatus = "idle" | "scanning" | "completed" | "failed";
type ScanMode   = "file" | "repo" | "image" | "secrets" | "compare" | "history";

interface Finding  { file:string; type:string; id:string; title:string; severity:Severity; description:string; message:string; resolution:string; references:string[]; status:string; 
  causeMetadata?: { StartLine?: number; EndLine?: number; Code?: { Lines?: { Number: number; Content: string; IsCause: boolean }[] } } | null;
}
interface Summary  { total:number; critical:number; high:number; medium:number; low:number; unknown:number; }
interface ScanResult  { summary:Summary; findings:Finding[]; score?:number; }
interface CompareResult { summary:{ before:Summary; after:Summary; new:number; fixed:number; persisted:number }; new:Finding[]; fixed:Finding[]; persisted:Finding[]; }
interface HistoryRow  { id:number; job_id:string; type:string; target:string; score:number; summary:Summary; scanned_at:string; }

const SEV: Record<Severity,{color:string;bg:string;label:string}> = {
  CRITICAL:{ color:"#ff2d55", bg:"rgba(255,45,85,0.12)",   label:"Critical" },
  HIGH:    { color:"#ff6b35", bg:"rgba(255,107,53,0.12)",  label:"High"     },
  MEDIUM:  { color:"#ffd60a", bg:"rgba(255,214,10,0.12)",  label:"Medium"   },
  LOW:     { color:"#30d158", bg:"rgba(48,209,88,0.12)",   label:"Low"      },
  UNKNOWN: { color:"#8e8e93", bg:"rgba(142,142,147,0.12)", label:"Unknown"  },
};
const SEV_ORDER: Record<Severity,number> = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3, UNKNOWN:4 };

function scoreColor(s:number){ return s>=90?"#30d158":s>=70?"#34c759":s>=50?"#ffd60a":s>=25?"#ff6b35":"#ff2d55"; }
function scoreLabel(s:number){ return s>=90?"Excelente":s>=70?"Bom":s>=50?"Regular":s>=25?"Ruim":"Crítico"; }

function ScoreGauge({ score }:{ score:number }) {
  const c = scoreColor(score);
  const r = 36, cx = 44, cy = 44, stroke = 8;
  const circ = 2 * Math.PI * r;
  const dash  = (score / 100) * circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
      <svg width={88} height={88} viewBox="0 0 88 88">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} style={{ transition:"stroke-dasharray 0.6s ease" }}/>
        <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" fill={c} fontSize={18} fontWeight={800} fontFamily="'Syne',sans-serif">{score}</text>
      </svg>
      <span style={{ color:c, fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em" }}>{scoreLabel(score)}</span>
    </div>
  );
}

function SeverityBadge({ severity }:{ severity:Severity }) {
  const c = SEV[severity] ?? SEV.UNKNOWN;
  return <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:c.color, background:c.bg, border:`1px solid ${c.color}33` }}>{c.label}</span>;
}

function FindingCard({ finding, index, tag }:{ finding:Finding; index:number; tag?:{ label:string; color:string } }) {
  const [open, setOpen] = useState(false);
  const isSecret = finding.type === "secret";
  return (
    <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${isSecret?"rgba(255,45,85,0.2)":"rgba(255,255,255,0.07)"}`, borderRadius:12, overflow:"hidden", animation:"fadeUp 0.3s ease both", animationDelay:`${index*35}ms` }}>
      <button onClick={() => setOpen(!open)} style={{ width:"100%", background:"none", border:"none", padding:"14px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, textAlign:"left" }}>
        {isSecret && <span style={{ fontSize:14 }}>🔑</span>}
        {tag && <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:tag.color, background:`${tag.color}18`, border:`1px solid ${tag.color}44`, padding:"2px 8px", borderRadius:20 }}>{tag.label}</span>}
        <SeverityBadge severity={finding.severity} />
        <span style={{ flex:1, color:"#f0f0f0", fontSize:14, fontWeight:500 }}>{finding.title}</span>
        <span style={{ color:"#555", fontSize:12, fontFamily:"monospace" }}>{finding.id}</span>
        <span style={{ color:"#555", fontSize:12, marginLeft:8 }}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{ padding:"0 18px 16px", borderTop:"1px solid rgba(255,255,255,0.05)" }}>
          <p style={{ color:"#999", fontSize:13, marginTop:12 }}>{finding.description}</p>
          {finding.message && <div style={{ marginTop:10, padding:"10px 14px", background:"rgba(255,45,85,0.06)", borderRadius:8, borderLeft:"3px solid #ff2d55" }}><p style={{ color:"#ccc", fontSize:13, margin:0, fontFamily:"monospace", wordBreak:"break-all" }}>{finding.message}</p></div>}
          {finding.resolution && <div style={{ marginTop:10 }}><span style={{ color:"#30d158", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>Resolução</span><p style={{ color:"#aaa", fontSize:13, marginTop:4 }}>{finding.resolution}</p></div>}
          <div style={{ marginTop:8, display:"flex", gap:8, flexWrap:"wrap" }}>
            <span style={{ color:"#555", fontSize:12 }}>📄 {finding.file}</span>
            <span style={{ color:"#333" }}>·</span>
            <span style={{ color:"#555", fontSize:12 }}>{finding.type}</span>
            {finding.causeMetadata?.StartLine && (
              <span style={{ color:"#555", fontSize:12 }}>
                · linha {finding.causeMetadata.StartLine}
                {finding.causeMetadata.EndLine && finding.causeMetadata.EndLine !== finding.causeMetadata.StartLine
                  ? `–${finding.causeMetadata.EndLine}`
                  : ""}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IgnoreFileInput({ value, onChange }:{ value:File|null; onChange:(f:File|null)=>void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginTop:12 }}>
      <button onClick={() => ref.current?.click()} style={{ background:"none", border:"1px dashed rgba(255,255,255,0.1)", borderRadius:8, padding:"8px 14px", cursor:"pointer", color:value?"#ffd60a":"#444", fontSize:12, fontFamily:"inherit", display:"flex", alignItems:"center", gap:8 }}>
        <span>🚫</span><span>{value?`✓ ${value.name}`:"Adicionar .trivyignore (opcional)"}</span>
        {value && <span onClick={(e)=>{ e.stopPropagation(); onChange(null); }} style={{ color:"#555", marginLeft:4 }}>✕</span>}
      </button>
      <input ref={ref} type="file" style={{ display:"none" }} accept=".trivyignore,.txt" onChange={(e)=>onChange(e.target.files?.[0]||null)} />
    </div>
  );
}

const API = "http://localhost:3000/scan";

export default function App() {
  const [mode, setMode]           = useState<ScanMode>("file");
  const [file, setFile]           = useState<File|null>(null);
  const [repoUrl, setRepoUrl]     = useState("");
  const [imageName, setImageName] = useState("");
  const [ignoreFile, setIgnoreFile] = useState<File|null>(null);
  const [secretsMode, setSecretsMode] = useState<"file"|"repo">("file");
  const [secretsFile, setSecretsFile] = useState<File|null>(null);
  const [secretsRepo, setSecretsRepo] = useState("");

  // Compare
  const [cmpMode1, setCmpMode1] = useState<"file"|"repo"|"image">("file");
  const [cmpFile1, setCmpFile1] = useState<File|null>(null);
  const [cmpUrl1,  setCmpUrl1]  = useState("");
  const [cmpImg1,  setCmpImg1]  = useState("");
  const [cmpMode2, setCmpMode2] = useState<"file"|"repo"|"image">("file");
  const [cmpFile2, setCmpFile2] = useState<File|null>(null);
  const [cmpUrl2,  setCmpUrl2]  = useState("");
  const [cmpImg2,  setCmpImg2]  = useState("");

  const [jobId,         setJobId]         = useState<string|null>(null);
  const [status,        setStatus]        = useState<ScanStatus>("idle");
  const [result,        setResult]        = useState<ScanResult|null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult|null>(null);
  const [error,         setError]         = useState<string|null>(null);
  const [filterSev,     setFilterSev]     = useState<Severity|"ALL">("ALL");
  const [history,       setHistory]       = useState<HistoryRow[]>([]);
  const [historyLoading,setHistoryLoading]= useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Helpers ────────────────────────────────────────────────────────────
  async function submitJob(fd: FormData, endpoint:string) {
    setStatus("scanning"); setResult(null); setCompareResult(null); setError(null);
    try {
      const res  = await fetch(`${API}/${endpoint}`, { method:"POST", body:fd });
      const data = await res.json();
      setJobId(data.jobId);
    } catch(e:any){ setError(e.message); setStatus("failed"); }
  }
  async function submitJSON(body:object, endpoint:string) {
    setStatus("scanning"); setResult(null); setCompareResult(null); setError(null);
    try {
      const res  = await fetch(`${API}/${endpoint}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
      const data = await res.json();
      setJobId(data.jobId);
    } catch(e:any){ setError(e.message); setStatus("failed"); }
  }
  async function runOneScan(m:"file"|"repo"|"image", f:File|null, url:string, img:string): Promise<string> {
    const fd = new FormData();
    const ep = m==="file"?"file":m==="repo"?"repo":"image";
    if(m==="file"){ if(!f) throw new Error("Arquivo não selecionado"); fd.append("file",f); }
    if(m==="repo") fd.append("repoUrl",url);
    if(m==="image") fd.append("imageName",img);
    const res = await fetch(`${API}/${ep}`,{method:"POST",body:fd});
    return (await res.json()).jobId;
  }
  async function waitJob(jid:string) {
    return new Promise<void>((ok,fail) => {
      const iv = setInterval(async()=>{
        const d = await (await fetch(`${API}/${jid}`)).json();
        if(d.status==="completed"){ clearInterval(iv); ok(); }
        if(d.status==="failed")   { clearInterval(iv); fail(new Error(d.error)); }
      },2000);
    });
  }

  // ── Scan handlers ──────────────────────────────────────────────────────
  const handleFile = async() => {
    if(!file) return;
    const fd=new FormData(); fd.append("file",file);
    if(ignoreFile) fd.append("ignoreFile",ignoreFile);
    await submitJob(fd,"file");
  };
  const handleRepo = async() => {
    if(!repoUrl.trim()) return;
    const fd=new FormData(); fd.append("repoUrl",repoUrl);
    if(ignoreFile) fd.append("ignoreFile",ignoreFile);
    await submitJob(fd,"repo");
  };
  const handleImage = async() => {
    if(!imageName.trim()) return;
    const fd=new FormData(); fd.append("imageName",imageName);
    if(ignoreFile) fd.append("ignoreFile",ignoreFile);
    await submitJob(fd,"image");
  };
  const handleSecrets = async() => {
    if(secretsMode==="file"){
      if(!secretsFile) return;
      const fd=new FormData(); fd.append("file",secretsFile);
      await submitJob(fd,"secrets/file");
    } else {
      if(!secretsRepo.trim()) return;
      const fd=new FormData(); fd.append("repoUrl",secretsRepo);
      await submitJob(fd,"secrets/repo");
    }
  };
  const handleCompare = async() => {
    setStatus("scanning"); setResult(null); setCompareResult(null); setError(null);
    try {
      const [j1,j2] = await Promise.all([
        runOneScan(cmpMode1,cmpFile1,cmpUrl1,cmpImg1),
        runOneScan(cmpMode2,cmpFile2,cmpUrl2,cmpImg2),
      ]);
      await Promise.all([waitJob(j1),waitJob(j2)]);
      await submitJSON({beforeJobId:j1,afterJobId:j2},"compare");
    } catch(e:any){ setError(e.message); setStatus("failed"); }
  };

  // ── Polling ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!jobId || status!=="scanning") return;
    const iv = setInterval(async()=>{
      try {
        const d = await (await fetch(`${API}/${jobId}`)).json();
        if(d.status==="completed"){
          if(d.result?.summary?.before) setCompareResult(d.result as CompareResult);
          else setResult(d.result as ScanResult);
          setStatus("completed"); clearInterval(iv);
        } else if(d.status==="failed"){ setError(d.error||"Scan failed"); setStatus("failed"); clearInterval(iv); }
      } catch(e:any){ setError(e.message); setStatus("failed"); clearInterval(iv); }
    },2000);
    return ()=>clearInterval(iv);
  },[jobId,status]);

  // ── History ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(mode!=="history") return;
    setHistoryLoading(true);
    fetch(`${API}/history`).then(r=>r.json()).then(d=>{ setHistory(d.scans||[]); setHistoryLoading(false); }).catch(()=>setHistoryLoading(false));
  },[mode]);

  // ── Derived ────────────────────────────────────────────────────────────
  const filtered = (result?.findings??[])
    .filter(f=>filterSev==="ALL"||f.severity===filterSev)
    .sort((a,b)=>(SEV_ORDER[a.severity]??99)-(SEV_ORDER[b.severity]??99));

  const reset = ()=>{
    setFile(null); setRepoUrl(""); setImageName(""); setIgnoreFile(null);
    setSecretsFile(null); setSecretsRepo("");
    setJobId(null); setStatus("idle"); setResult(null); setCompareResult(null); setError(null); setFilterSev("ALL");
    if(fileInputRef.current) fileInputRef.current.value="";
  };

  // ── Downloads ──────────────────────────────────────────────────────────
  const dl=(content:string,name:string,type:string)=>{ const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement("a"); a.href=u; a.download=name; a.click(); URL.revokeObjectURL(u); };
  const downloadJSON=()=>{ if(!result) return; dl(JSON.stringify(result,null,2),"moirai-report.json","application/json"); };
  const downloadCSV=()=>{
    if(!result) return;
    const h=["ID","Severity","Title","File","Type","Description","Resolution"];
    const rows=result.findings.map(f=>[f.id,f.severity,`"${f.title.replace(/"/g,'""')}"`,`"${f.file.replace(/"/g,'""')}"`,f.type,`"${(f.description||"").replace(/"/g,'""')}"`,`"${(f.resolution||"").replace(/"/g,'""')}"`]);
    dl([h.join(","),...rows.map(r=>r.join(","))].join("\n"),"moirai-report.csv","text/csv");
  };
  const downloadPDF=()=>{
    if(!result) return;
    const sc:Record<string,string>={CRITICAL:"#ff2d55",HIGH:"#ff6b35",MEDIUM:"#ffd60a",LOW:"#30d158",UNKNOWN:"#8e8e93"};
    const fH=result.findings.map(f=>`<div style="margin-bottom:16px;padding:14px;border:1px solid #e5e7eb;border-radius:8px;page-break-inside:avoid;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><span style="background:${sc[f.severity]}22;color:${sc[f.severity]};border:1px solid ${sc[f.severity]}44;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;">${f.severity}</span><strong>${f.title}</strong><span style="margin-left:auto;color:#9ca3af;font-size:12px;font-family:monospace;">${f.id}</span></div>${f.description?`<p style="color:#6b7280;font-size:13px;margin:0 0 8px;">${f.description}</p>`:""}${f.message?`<div style="background:#fff1f2;border-left:3px solid #ff2d55;padding:8px 12px;border-radius:4px;font-size:13px;margin-bottom:8px;">${f.message}</div>`:""}${f.resolution?`<p style="font-size:12px;color:#059669;margin:0;"><strong>Resolução:</strong> ${f.resolution}</p>`:""}<p style="font-size:11px;color:#9ca3af;margin:6px 0 0;">📄 ${f.file} · ${f.type}</p></div>`).join("");
    const sH=(["CRITICAL","HIGH","MEDIUM","LOW","UNKNOWN"] as Severity[]).map(s=>`<div style="padding:10px 16px;border:1px solid ${sc[s]}44;border-radius:8px;text-align:center;min-width:80px;"><div style="font-size:22px;font-weight:700;color:${sc[s]};">${result.summary[s.toLowerCase() as keyof Summary]}</div><div style="font-size:10px;text-transform:uppercase;color:${sc[s]};">${s}</div></div>`).join("");
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Moirai Report</title><style>body{font-family:'Segoe UI',sans-serif;color:#111;padding:40px;max-width:860px;margin:0 auto;}h1{font-size:28px;}h2{font-size:16px;font-weight:600;margin:32px 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;}</style></head><body><h1>⚡ Moirai</h1><p style="color:#6b7280;font-size:13px;">Gerado em ${new Date().toLocaleString("pt-BR")} · Score: ${result.score??"-"}/100</p><h2>Resumo</h2><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">${sH}</div><h2>Findings</h2>${result.findings.length===0?'<p style="color:#059669;">Nenhuma misconfiguration.</p>':fH}</body></html>`;
    const b=new Blob([html],{type:"text/html"}),u=URL.createObjectURL(b),w=window.open(u,"_blank");
    w?.addEventListener("load",()=>{ w.print(); URL.revokeObjectURL(u); });
  };

  // ── Sub-components ─────────────────────────────────────────────────────
  function SubTabs({ value, onChange }:{ value:"file"|"repo"|"image"; onChange:(v:"file"|"repo"|"image")=>void }) {
    return (
      <div style={{ display:"flex", gap:0, background:"rgba(255,255,255,0.04)", borderRadius:8, padding:3, width:"fit-content", marginBottom:12 }}>
        {([{id:"file",l:"Arquivo"},{id:"repo",l:"Repo"},{id:"image",l:"Imagem"}] as const).map(t=>(
          <button key={t.id} onClick={()=>onChange(t.id)} style={{ background:value===t.id?"rgba(255,255,255,0.1)":"none", border:"none", color:value===t.id?"#f0f0f0":"#555", padding:"6px 14px", borderRadius:6, cursor:"pointer", fontSize:12, fontFamily:"inherit", fontWeight:600, transition:"all 0.15s ease" }}>{t.l}</button>
        ))}
      </div>
    );
  }
  function ScanInput({ m,setM,f,setF,url,setUrl,img,setImg,label }:any) {
    const r=useRef<HTMLInputElement>(null);
    return (
      <div>
        <p style={{ color:"#555", fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>{label}</p>
        <SubTabs value={m} onChange={setM} />
        {m==="file" && <div onClick={()=>r.current?.click()} style={{ border:`2px dashed ${f?"#ff2d55":"rgba(255,255,255,0.1)"}`, borderRadius:10, padding:"20px", textAlign:"center", cursor:"pointer", background:f?"rgba(255,45,85,0.04)":"rgba(255,255,255,0.02)" }}><p style={{ color:f?"#ff2d55":"#555", fontSize:13 }}>{f?`✓ ${f.name}`:"Clique para selecionar"}</p><input ref={r} type="file" style={{ display:"none" }} onChange={(e)=>setF(e.target.files?.[0]||null)} /></div>}
        {m==="repo"  && <input type="text" placeholder="https://github.com/org/repo" value={url} onChange={(e)=>setUrl(e.target.value)} style={{ width:"100%", padding:"10px 14px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:"#f0f0f0", fontSize:13, fontFamily:"inherit", outline:"none" }} />}
        {m==="image" && <input type="text" placeholder="nginx:latest" value={img} onChange={(e)=>setImg(e.target.value)} style={{ width:"100%", padding:"10px 14px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:"#f0f0f0", fontSize:13, fontFamily:"inherit", outline:"none" }} />}
      </div>
    );
  }

  const TABS = [
    {id:"file"   ,label:"Arquivo"   ,icon:"📄"},
    {id:"repo"   ,label:"Repositório",icon:"🔗"},
    {id:"image"  ,label:"Imagem"    ,icon:"🐳"},
    {id:"secrets",label:"Secrets"   ,icon:"🔑"},
    {id:"compare",label:"Comparar"  ,icon:"⚖️"},
    {id:"history",label:"Histórico" ,icon:"📊"},
  ] as const;

  const canSubmit = mode==="file"?!!file:mode==="repo"?!!repoUrl.trim():mode==="image"?!!imageName.trim():mode==="secrets"?(secretsMode==="file"?!!secretsFile:!!secretsRepo.trim()):true;

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0f", color:"#f0f0f0", fontFamily:"'IBM Plex Mono',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#111}::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .scan-btn:hover:not(:disabled){background:#e0263f!important;transform:translateY(-1px)}
        .scan-btn,.dl-btn,.tab-btn,.filter-btn{transition:all 0.15s ease!important}
        .dl-btn:hover{background:rgba(255,255,255,0.08)!important;border-color:rgba(255,255,255,0.2)!important;transform:translateY(-1px)}
        .tab-btn:hover,.filter-btn:hover{color:#f0f0f0!important}
        input:focus{border-color:rgba(255,45,85,0.4)!important;box-shadow:0 0 0 3px rgba(255,45,85,0.08)!important}
        .hist-row:hover{background:rgba(255,255,255,0.05)!important}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"20px 40px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:32, height:32, background:"linear-gradient(135deg,#ff2d55,#ff6b35)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚡</div>
          <span style={{ fontFamily:"'Poppins',sans-serif", fontSize:20, fontWeight:800, letterSpacing:"-0.02em" }}>MOIRAI</span>
          <span style={{ color:"#333", fontSize:12, marginLeft:4 }}>//DevSecOps Scanner</span>
        </div>
        {status!=="idle" && mode!=="history" && <button onClick={reset} style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", color:"#888", padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>↩ Novo Scan</button>}
      </div>

      <div style={{ maxWidth:860, margin:"0 auto", padding:"40px 24px" }}>

        {/* ── IDLE ── */}
        {(status==="idle" || mode==="history") && (
          <div style={{ animation:"fadeUp 0.4s ease both" }}>
            {mode!=="history" && (
              <>
                <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:34, fontWeight:800, letterSpacing:"-0.03em", marginBottom:8 }}>
                  Scan for<br/>
                  <span style={{ background:"linear-gradient(90deg,#ff2d55,#ff6b35)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>misconfigurations.</span>
                </h1>
                <p style={{ color:"#555", fontSize:14, marginBottom:32 }}>Dockerfile, IaC, imagens Docker, secrets — detecte riscos antes da produção.</p>
              </>
            )}

            {/* Tabs */}
            <div style={{ display:"flex", gap:0, marginBottom:28, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:4, width:"fit-content", flexWrap:"wrap" }}>
              {TABS.map(t=>(
                <button key={t.id} className="tab-btn" onClick={()=>{ setMode(t.id); if(t.id!=="history") reset(); }} style={{ background:mode===t.id?"rgba(255,255,255,0.1)":"none", border:"none", color:mode===t.id?"#f0f0f0":"#555", padding:"8px 16px", borderRadius:7, cursor:"pointer", fontSize:12, fontFamily:"inherit", fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                  <span>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>

            {/* ── History tab ── */}
            {mode==="history" && (
              <div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                  <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800 }}>Histórico de Scans</h2>
                  <button onClick={()=>{ setHistoryLoading(true); fetch(`${API}/history`).then(r=>r.json()).then(d=>{ setHistory(d.scans||[]); setHistoryLoading(false); }); }} style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", color:"#888", padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>↻ Atualizar</button>
                </div>
                {historyLoading ? (
                  <div style={{ textAlign:"center", padding:"48px 0" }}><div style={{ width:32, height:32, border:"3px solid rgba(255,45,85,0.2)", borderTopColor:"#ff2d55", borderRadius:"50%", margin:"0 auto", animation:"spin 0.8s linear infinite" }}/></div>
                ) : history.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"48px 0", color:"#333" }}><p style={{ fontSize:32, marginBottom:12 }}>📭</p><p>Nenhum scan salvo ainda.</p></div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {/* Header */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 100px 120px", gap:12, padding:"8px 16px", color:"#444", fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                      <span>Target</span><span>Tipo</span><span style={{ textAlign:"center" }}>Score</span><span style={{ textAlign:"right" }}>Data</span>
                    </div>
                    {history.map(row=>(
                      <div key={row.id} className="hist-row" style={{ display:"grid", gridTemplateColumns:"1fr 80px 100px 120px", gap:12, padding:"14px 16px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, alignItems:"center", transition:"all 0.15s ease", cursor:"default" }}>
                        <div>
                          <p style={{ color:"#f0f0f0", fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{row.target}</p>
                          <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
                            {(["critical","high","medium","low"] as const).filter(k=>row.summary[k]>0).map(k=>(
                              <span key={k} style={{ color:SEV[k.toUpperCase() as Severity].color, fontSize:11 }}>{row.summary[k]} {k}</span>
                            ))}
                            {row.summary.total===0 && <span style={{ color:"#30d158", fontSize:11 }}>✓ limpo</span>}
                          </div>
                        </div>
                        <span style={{ color:"#555", fontSize:12, background:"rgba(255,255,255,0.05)", padding:"2px 8px", borderRadius:6, textAlign:"center" }}>{row.type}</span>
                        <div style={{ display:"flex", justifyContent:"center" }}>
                          <div style={{ textAlign:"center" }}>
                            <span style={{ color:scoreColor(row.score), fontSize:18, fontWeight:800, fontFamily:"'Syne',sans-serif" }}>{row.score}</span>
                            <p style={{ color:scoreColor(row.score), fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>{scoreLabel(row.score)}</p>
                          </div>
                        </div>
                        <p style={{ color:"#444", fontSize:11, textAlign:"right" }}>{new Date(row.scanned_at).toLocaleString("pt-BR")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Scan modes ── */}
            {mode==="file" && status==="idle" && (
              <div>
                <div onClick={()=>fileInputRef.current?.click()} style={{ border:`2px dashed ${file?"#ff2d55":"rgba(255,255,255,0.1)"}`, borderRadius:14, padding:"40px 24px", textAlign:"center", cursor:"pointer", background:file?"rgba(255,45,85,0.04)":"rgba(255,255,255,0.02)", transition:"all 0.2s ease" }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>📁</div>
                  <p style={{ color:file?"#ff2d55":"#555", fontSize:14 }}>{file?`✓ ${file.name}`:"Clique para selecionar um arquivo"}</p>
                  <p style={{ color:"#333", fontSize:12, marginTop:4 }}>Dockerfile, .tf, .yaml, .json, .bicep...</p>
                  <input ref={fileInputRef} type="file" style={{ display:"none" }} onChange={(e)=>setFile(e.target.files?.[0]||null)} />
                </div>
                <IgnoreFileInput value={ignoreFile} onChange={setIgnoreFile} />
              </div>
            )}
            {mode==="repo" && status==="idle" && (
              <div>
                <input type="text" placeholder="https://github.com/org/repo" value={repoUrl} onChange={(e)=>setRepoUrl(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&handleRepo()} style={{ width:"100%", padding:"14px 16px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"#f0f0f0", fontSize:14, fontFamily:"inherit", outline:"none" }} />
                <IgnoreFileInput value={ignoreFile} onChange={setIgnoreFile} />
              </div>
            )}
            {mode==="image" && status==="idle" && (
              <div>
                <input type="text" placeholder="nginx:latest, python:3.11-slim..." value={imageName} onChange={(e)=>setImageName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&handleImage()} style={{ width:"100%", padding:"14px 16px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"#f0f0f0", fontSize:14, fontFamily:"inherit", outline:"none" }} />
                <p style={{ color:"#444", fontSize:12, marginTop:8 }}>Escaneia CVEs de pacotes + misconfigurations da imagem.</p>
                <IgnoreFileInput value={ignoreFile} onChange={setIgnoreFile} />
              </div>
            )}
            {mode==="secrets" && status==="idle" && (
              <div>
                <div style={{ display:"flex", gap:0, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:4, width:"fit-content", marginBottom:20 }}>
                  {([{id:"file",l:"📄 Arquivo"},{id:"repo",l:"🔗 Repositório"}] as const).map(t=>(
                    <button key={t.id} className="tab-btn" onClick={()=>setSecretsMode(t.id)} style={{ background:secretsMode===t.id?"rgba(255,255,255,0.1)":"none", border:"none", color:secretsMode===t.id?"#f0f0f0":"#555", padding:"8px 18px", borderRadius:7, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:600 }}>{t.l}</button>
                  ))}
                </div>
                <div style={{ padding:"14px 18px", background:"rgba(255,45,85,0.06)", border:"1px solid rgba(255,45,85,0.15)", borderRadius:10, marginBottom:16, display:"flex", gap:10, alignItems:"flex-start" }}>
                  <span style={{ fontSize:18 }}>⚠️</span>
                  <p style={{ color:"#ff8fa3", fontSize:13 }}>Detecta chaves de API, tokens, senhas e outros segredos expostos no código. Os valores encontrados são <strong>mascarados</strong> no relatório.</p>
                </div>
                {secretsMode==="file" ? (
                  <div onClick={()=>{ const r=document.createElement("input"); r.type="file"; r.onchange=(e:any)=>setSecretsFile(e.target.files?.[0]||null); r.click(); }} style={{ border:`2px dashed ${secretsFile?"#ff2d55":"rgba(255,255,255,0.1)"}`, borderRadius:14, padding:"32px 24px", textAlign:"center", cursor:"pointer", background:secretsFile?"rgba(255,45,85,0.04)":"rgba(255,255,255,0.02)" }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>🔑</div>
                    <p style={{ color:secretsFile?"#ff2d55":"#555", fontSize:14 }}>{secretsFile?`✓ ${secretsFile.name}`:"Clique para selecionar"}</p>
                  </div>
                ) : (
                  <input type="text" placeholder="https://github.com/org/repo" value={secretsRepo} onChange={(e)=>setSecretsRepo(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&handleSecrets()} style={{ width:"100%", padding:"14px 16px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"#f0f0f0", fontSize:14, fontFamily:"inherit", outline:"none" }} />
                )}
              </div>
            )}
            {mode==="compare" && status==="idle" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div style={{ padding:"16px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12 }}>
                  <ScanInput m={cmpMode1} setM={setCmpMode1} f={cmpFile1} setF={setCmpFile1} url={cmpUrl1} setUrl={setCmpUrl1} img={cmpImg1} setImg={setCmpImg1} label="Antes (baseline)" />
                </div>
                <div style={{ padding:"16px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12 }}>
                  <ScanInput m={cmpMode2} setM={setCmpMode2} f={cmpFile2} setF={setCmpFile2} url={cmpUrl2} setUrl={setCmpUrl2} img={cmpImg2} setImg={setCmpImg2} label="Depois (novo)" />
                </div>
              </div>
            )}

            {mode!=="history" && status==="idle" && (
              <button className="scan-btn" disabled={!canSubmit}
                onClick={mode==="file"?handleFile:mode==="repo"?handleRepo:mode==="image"?handleImage:mode==="secrets"?handleSecrets:handleCompare}
                style={{ marginTop:16, width:"100%", padding:"14px", background:canSubmit?"#ff2d55":"rgba(255,255,255,0.05)", border:"none", borderRadius:10, color:canSubmit?"#fff":"#333", fontSize:14, fontWeight:700, fontFamily:"inherit", cursor:canSubmit?"pointer":"not-allowed", letterSpacing:"0.05em" }}>
                {mode==="compare"?"COMPARAR SCANS →":mode==="secrets"?"SCAN DE SECRETS →":"RUN SCAN →"}
              </button>
            )}
          </div>
        )}

        {/* ── SCANNING ── */}
        {status==="scanning" && (
          <div style={{ textAlign:"center", padding:"80px 0", animation:"fadeUp 0.4s ease both" }}>
            <div style={{ width:48, height:48, border:"3px solid rgba(255,45,85,0.2)", borderTopColor:"#ff2d55", borderRadius:"50%", margin:"0 auto 24px", animation:"spin 0.8s linear infinite" }}/>
            <p style={{ color:"#555", fontSize:14, animation:"pulse 2s ease infinite" }}>
              {mode==="secrets"?"Procurando secrets no código...":mode==="image"?"Baixando e analisando imagem...":mode==="compare"?"Rodando os dois scans...":"Escaneando misconfigurations..."}
            </p>
            {jobId && <p style={{ color:"#333", fontSize:12, marginTop:8 }}>job: {jobId}</p>}
          </div>
        )}

        {/* ── ERROR ── */}
        {status==="failed" && (
          <div style={{ padding:"24px", background:"rgba(255,45,85,0.08)", border:"1px solid rgba(255,45,85,0.2)", borderRadius:12, animation:"fadeUp 0.4s ease both" }}>
            <p style={{ color:"#ff2d55", fontWeight:700, marginBottom:6 }}>Scan falhou</p>
            <p style={{ color:"#888", fontSize:13 }}>{error}</p>
          </div>
        )}

        {/* ── RESULTS ── */}
        {status==="completed" && result && (
          <div style={{ animation:"fadeUp 0.4s ease both" }}>
            {/* Score + Summary */}
            <div style={{ display:"flex", gap:16, alignItems:"center", marginBottom:28, padding:"20px 24px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14 }}>
              {result.score !== undefined && <ScoreGauge score={result.score} />}
              <div style={{ flex:1 }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
                  {(["critical","high","medium","low","unknown"] as const).map(sev=>{
                    const cfg=SEV[sev.toUpperCase() as Severity]; const count=result.summary[sev];
                    return <div key={sev} style={{ padding:"10px 8px", background:count>0?cfg.bg:"rgba(255,255,255,0.02)", border:`1px solid ${count>0?cfg.color+"44":"rgba(255,255,255,0.06)"}`, borderRadius:8, textAlign:"center" }}>
                      <div style={{ fontSize:18, fontWeight:700, color:count>0?cfg.color:"#333", fontFamily:"'Syne',sans-serif" }}>{count}</div>
                      <div style={{ fontSize:9, color:count>0?cfg.color:"#444", textTransform:"uppercase", letterSpacing:"0.1em", marginTop:2 }}>{cfg.label}</div>
                    </div>;
                  })}
                </div>
              </div>
            </div>

            {/* Filter */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
              <span style={{ color:"#555", fontSize:13 }}>{result.summary.total===0?"✅ Nenhum problema":`${filtered.length} de ${result.summary.total} findings`}</span>
              {result.summary.total>0 && (
                <div style={{ display:"flex", gap:6 }}>
                  {(["ALL","CRITICAL","HIGH","MEDIUM","LOW"] as const).map(s=>(
                    <button key={s} className="filter-btn" onClick={()=>setFilterSev(s)} style={{ background:filterSev===s?"rgba(255,255,255,0.1)":"none", border:`1px solid ${filterSev===s?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.07)"}`, color:filterSev===s?"#f0f0f0":"#555", padding:"4px 12px", borderRadius:20, fontSize:11, fontFamily:"inherit", cursor:"pointer", fontWeight:600 }}>{s}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Findings */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {result.summary.total===0
                ?<div style={{ textAlign:"center", padding:"48px 0", color:"#30d158" }}><div style={{ fontSize:40, marginBottom:12 }}>✓</div><p style={{ fontWeight:700 }}>Tudo limpo!</p><p style={{ color:"#555", fontSize:13, marginTop:4 }}>Nenhuma misconfiguration detectada.</p></div>
                :filtered.length===0?<p style={{ color:"#555", fontSize:13, textAlign:"center", padding:"32px 0" }}>Nenhum finding para essa severidade.</p>
                :filtered.map((f,i)=><FindingCard key={`${f.id}-${i}`} finding={f} index={i} />)
              }
            </div>

            {/* Downloads */}
            <div style={{ marginTop:28, padding:"20px 24px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14 }}>
              <p style={{ color:"#555", fontSize:12, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:600, marginBottom:14 }}>Exportar relatório</p>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                {([{label:"JSON",icon:"{}",fn:downloadJSON,desc:"Dados brutos"},{label:"CSV",icon:"⊞",fn:downloadCSV,desc:"Planilha"},{label:"PDF",icon:"⎙",fn:downloadPDF,desc:"Imprimível"}] as const).map(({label,icon,fn,desc})=>(
                  <button key={label} className="dl-btn" onClick={fn} style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, padding:"10px 18px", cursor:"pointer", fontFamily:"inherit" }}>
                    <span style={{ fontSize:16 }}>{icon}</span>
                    <div><div style={{ color:"#f0f0f0", fontSize:13, fontWeight:700 }}>{label}</div><div style={{ color:"#555", fontSize:11 }}>{desc}</div></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── COMPARE RESULTS ── */}
        {status==="completed" && compareResult && (
          <div style={{ animation:"fadeUp 0.4s ease both" }}>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, marginBottom:20 }}>Resultado da Comparação</h2>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
              {[{label:"Novos",count:compareResult.summary.new,color:"#ff2d55",icon:"↑"},{label:"Corrigidos",count:compareResult.summary.fixed,color:"#30d158",icon:"↓"},{label:"Persistindo",count:compareResult.summary.persisted,color:"#ffd60a",icon:"→"}].map(({label,count,color,icon})=>(
                <div key={label} style={{ padding:"18px 16px", background:`${color}0f`, border:`1px solid ${color}33`, borderRadius:12, textAlign:"center" }}>
                  <div style={{ fontSize:28, fontWeight:800, color, fontFamily:"'Syne',sans-serif" }}>{icon} {count}</div>
                  <div style={{ fontSize:11, color, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:4 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
              {([["Antes",compareResult.summary.before],["Depois",compareResult.summary.after]] as const).map(([label,s])=>(
                <div key={label} style={{ padding:"14px 16px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10 }}>
                  <p style={{ color:"#555", fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>{label} — {s.total} findings</p>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {(["critical","high","medium","low"] as const).filter(k=>s[k]>0).map(k=><span key={k} style={{ color:SEV[k.toUpperCase() as Severity].color, fontSize:12, fontWeight:700 }}>{s[k]} {k}</span>)}
                    {s.total===0 && <span style={{ color:"#30d158", fontSize:12 }}>✓ limpo</span>}
                  </div>
                </div>
              ))}
            </div>
            {[{key:"new",label:"Novos findings",color:"#ff2d55",items:compareResult.new},{key:"fixed",label:"Findings corrigidos",color:"#30d158",items:compareResult.fixed},{key:"persisted",label:"Findings persistindo",color:"#ffd60a",items:compareResult.persisted}].map(({key,label,color,items})=>items.length>0&&(
              <div key={key} style={{ marginBottom:24 }}>
                <p style={{ color, fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>{label} ({items.length})</p>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {[...items].sort((a,b)=>(SEV_ORDER[a.severity]??99)-(SEV_ORDER[b.severity]??99)).map((f,i)=>(
                    <FindingCard key={`${key}-${f.id}-${i}`} finding={f} index={i} tag={{label:key==="new"?"NOVO":key==="fixed"?"CORRIGIDO":"PERSISTE",color}} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}