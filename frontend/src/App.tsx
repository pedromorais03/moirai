import { useState, useEffect } from "react";

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const handleFileUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("http://localhost:3000/scan/file", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    setJobId(data.jobId);
  };

  const handleRepoScan = async () => {
    const res = await fetch("http://localhost:3000/scan/repo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl })
    });

    const data = await res.json();
    setJobId(data.jobId);
  };

  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      const res = await fetch(`http://localhost:3000/scan/${jobId}`);
      const data = await res.json();

      if (data.status === "completed") {
        setResult(data.result);
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Scanner DevSecOps</h1>

      <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
      <button onClick={handleFileUpload}>Scan File</button>

      <br /><br />

      <input
        type="text"
        placeholder="Repo URL"
        value={repoUrl}
        onChange={e => setRepoUrl(e.target.value)}
      />
      <button onClick={handleRepoScan}>Scan Repo</button>

      <h2>Job: {jobId}</h2>

      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}

export default App;