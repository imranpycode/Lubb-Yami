import React, { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

/* ================================================================
   FIELD DEFINITIONS — maps internal key → aliases for fuzzy match
   ================================================================ */
const FIELD_ALIASES = {
  male:          ["male", "sex", "gender", "m/f", "m"],
  age:           ["age", "age (years)", "patient age"],
  cigsPerDay:    ["cigsperday", "cigs per day", "cigs/day", "cigarettes", "cigarettes per day", "smoking", "smokes/day", "smoke"],
  BPMeds:        ["bpmeds", "bp meds", "blood pressure medication", "on bp meds", "bp medication", "antihypertensive"],
  prevalentHyp:  ["prevalenthyp", "hypertension", "hyp", "prevalent hyp", "hypertensive", "htn"],
  diabetes:      ["diabetes", "diabetic", "dm", "type 2 diabetes", "t2dm"],
  totChol:       ["totchol", "total cholesterol", "cholesterol", "chol", "tc"],
  sysBP:         ["sysbp", "systolic bp", "systolic blood pressure", "systolic", "sbp", "sys bp"],
  diaBP:         ["diabp", "diastolic bp", "diastolic blood pressure", "diastolic", "dbp", "dia bp"],
  BMI:           ["bmi", "body mass index", "body-mass index"],
  heartRate:     ["heartrate", "heart rate", "hr", "pulse", "resting hr", "resting heart rate"],
  glucose:       ["glucose", "fasting glucose", "blood glucose", "blood sugar", "fbs"],
};

const FIELD_LABELS = {
  male: "Sex",
  age: "Age",
  cigsPerDay: "Cigs/Day",
  BPMeds: "BP Meds",
  prevalentHyp: "Hypertension",
  diabetes: "Diabetes",
  totChol: "Total Chol",
  sysBP: "Systolic BP",
  diaBP: "Diastolic BP",
  BMI: "BMI",
  heartRate: "Heart Rate",
  glucose: "Glucose",
};

const ALL_KEYS = Object.keys(FIELD_ALIASES);

/* ================================================================
   FUZZY COLUMN MATCHING
   ================================================================ */
function normalise(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchHeader(header) {
  const n = normalise(header);
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (normalise(alias) === n) return key;
    }
  }
  // Partial match fallback
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (n.includes(normalise(alias)) || normalise(alias).includes(n)) return key;
    }
  }
  return null;
}

/* ================================================================
   EXCEL / CSV PARSER
   ================================================================ */
function parseExcel(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rows.length < 2) throw new Error("File has no data rows.");

  const rawHeaders = rows[0];
  const colMap = {}; // key → col index
  rawHeaders.forEach((h, i) => {
    const matched = matchHeader(String(h));
    if (matched && !(matched in colMap)) colMap[matched] = i;
  });

  const matched = Object.keys(colMap);
  const unmatched = ALL_KEYS.filter((k) => !matched.includes(k));

  const patients = rows.slice(1).map((row, rowIdx) => {
    const p = { _rowIdx: rowIdx + 2 };
    ALL_KEYS.forEach((k) => {
      if (colMap[k] !== undefined) {
        const raw = row[colMap[k]];
        p[k] = parsePatientValue(k, raw);
      } else {
        p[k] = getDefault(k);
      }
    });
    return p;
  }).filter((p) => {
    // Filter out completely empty rows
    return ALL_KEYS.some((k) => p[k] !== "" && p[k] !== null && p[k] !== undefined);
  });

  return { patients, matchedColumns: matched, unmatchedColumns: unmatched };
}

/* ================================================================
   PDF PARSER — extract text and attempt to parse table
   ================================================================ */
async function parsePDF(arrayBuffer) {
  // Dynamically import pdfjs to avoid top-level import issues
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let allText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Group items by Y position to reconstruct table rows
    const items = content.items.map((item) => ({
      text: item.str,
      x: Math.round(item.transform[4]),
      y: Math.round(item.transform[5]),
    }));

    // Sort by Y descending (top of page first), then X
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    // Group by Y coordinate (±5px tolerance)
    const lines = [];
    for (const item of items) {
      const existing = lines.find((l) => Math.abs(l.y - item.y) <= 5);
      if (existing) {
        existing.texts.push({ text: item.text, x: item.x });
      } else {
        lines.push({ y: item.y, texts: [{ text: item.text, x: item.x }] });
      }
    }

    for (const line of lines) {
      line.texts.sort((a, b) => a.x - b.x);
      allText += line.texts.map((t) => t.text).join("\t") + "\n";
    }
  }

  // Now parse the extracted text as TSV-like content
  const rows = allText.trim().split("\n").map((l) => l.split("\t").map((c) => c.trim()).filter(Boolean));
  if (rows.length < 2) throw new Error("Could not extract table data from PDF. Ensure the PDF has a text-based (not scanned/image) table.");

  // Find header row — it's the one with the most matched column names
  let bestHeaderIdx = 0;
  let bestScore = 0;
  rows.slice(0, 10).forEach((row, i) => {
    const score = row.filter((h) => matchHeader(h) !== null).length;
    if (score > bestScore) { bestScore = score; bestHeaderIdx = i; }
  });

  if (bestScore === 0) throw new Error("No recognizable column headers found in PDF. Please use column names like: Age, Sex, BMI, Glucose, Systolic BP, etc.");

  const rawHeaders = rows[bestHeaderIdx];
  const colMap = {};
  rawHeaders.forEach((h, i) => {
    const matched = matchHeader(h);
    if (matched && !(matched in colMap)) colMap[matched] = i;
  });

  const matched = Object.keys(colMap);
  const unmatched = ALL_KEYS.filter((k) => !matched.includes(k));

  const patients = rows.slice(bestHeaderIdx + 1).map((row, rowIdx) => {
    const p = { _rowIdx: rowIdx + 1 };
    ALL_KEYS.forEach((k) => {
      if (colMap[k] !== undefined) {
        p[k] = parsePatientValue(k, row[colMap[k]] ?? "");
      } else {
        p[k] = getDefault(k);
      }
    });
    return p;
  }).filter((p) => ALL_KEYS.some((k) => p[k] !== "" && p[k] !== null));

  return { patients, matchedColumns: matched, unmatchedColumns: unmatched };
}

/* ================================================================
   VALUE NORMALISATION
   ================================================================ */
function parsePatientValue(key, raw) {
  if (raw === "" || raw === null || raw === undefined) return getDefault(key);
  const boolKeys = ["male", "BPMeds", "prevalentHyp", "diabetes"];
  if (boolKeys.includes(key)) {
    const s = String(raw).toLowerCase().trim();
    if (["1", "yes", "y", "true", "male", "m"].includes(s)) return 1;
    if (["0", "no", "n", "false", "female", "f"].includes(s)) return 0;
    const n = parseFloat(s);
    return isNaN(n) ? getDefault(key) : (n >= 1 ? 1 : 0);
  }
  const n = parseFloat(String(raw).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? getDefault(key) : n;
}

function getDefault(key) {
  const defaults = {
    male: 1, age: 45, cigsPerDay: 0, BPMeds: 0, prevalentHyp: 0,
    diabetes: 0, totChol: 200, sysBP: 120, diaBP: 80, BMI: 25,
    heartRate: 75, glucose: 85,
  };
  return defaults[key] ?? 0;
}

/* ================================================================
   EXPORT TO EXCEL
   ================================================================ */
function exportToExcel(results) {
  const rows = results.map((r, i) => ({
    "Patient #": i + 1,
    "Age": r.patient.age,
    "Sex": r.patient.male === 1 ? "Male" : "Female",
    "Cigs/Day": r.patient.cigsPerDay,
    "BP Meds": r.patient.BPMeds ? "Yes" : "No",
    "Hypertension": r.patient.prevalentHyp ? "Yes" : "No",
    "Diabetes": r.patient.diabetes ? "Yes" : "No",
    "Total Chol (mg/dL)": r.patient.totChol,
    "Systolic BP (mmHg)": r.patient.sysBP,
    "Diastolic BP (mmHg)": r.patient.diaBP,
    "BMI (kg/m²)": r.patient.BMI,
    "Heart Rate (bpm)": r.patient.heartRate,
    "Glucose (mg/dL)": r.patient.glucose,
    "Percentile": r.percentile.toFixed(1),
    "Risk Band": r.band,
    "Model Score": r.decision.toFixed(4),
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, "Risk Predictions");
  XLSX.writeFile(wb, "lubbyami_predictions.xlsx");
}

/* ================================================================
   BAND UTIL
   ================================================================ */
function bandFor(pct) {
  if (pct < 33) return { label: "Lower Risk", key: "low" };
  if (pct < 66) return { label: "Medium Risk", key: "mid" };
  return { label: "Higher Risk", key: "high" };
}

const BAND_COLORS = {
  low:  { bg: "rgba(56,189,140,0.15)", color: "#34d399", border: "rgba(56,189,140,0.4)" },
  mid:  { bg: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "rgba(251,191,36,0.4)" },
  high: { bg: "rgba(248,113,113,0.15)", color: "#f87171", border: "rgba(248,113,113,0.4)" },
};

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function ImportFeature() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("upload"); // upload | preview | results
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [patients, setPatients] = useState([]);
  const [matchedColumns, setMatchedColumns] = useState([]);
  const [unmatchedColumns, setUnmatchedColumns] = useState([]);
  const [results, setResults] = useState([]);
  const fileRef = useRef();

  const reset = () => {
    setStep("upload");
    setError(null);
    setFileName(null);
    setPatients([]);
    setMatchedColumns([]);
    setUnmatchedColumns([]);
    setResults([]);
    setLoading(false);
  };

  const processFile = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      let parsed;
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext === "pdf") {
        parsed = await parsePDF(buffer);
      } else if (["xlsx", "xls", "csv"].includes(ext)) {
        parsed = parseExcel(buffer);
      } else {
        throw new Error("Unsupported file type. Please upload .xlsx, .csv, or .pdf");
      }
      if (parsed.patients.length === 0) throw new Error("No patient records found in the file.");
      setPatients(parsed.patients);
      setMatchedColumns(parsed.matchedColumns);
      setUnmatchedColumns(parsed.unmatchedColumns);
      setStep("preview");
    } catch (err) {
      setError(err.message || "Failed to parse file.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const runPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/predict/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patients }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      
      const resMapped = data.results.map((r, i) => {
        const bandObj = bandFor(r.percentile);
        return {
          patient: patients[i],
          percentile: r.percentile,
          decision: r.decision_score,
          risk_band: r.risk_band,
          prediction: r.prediction,
          probability: r.probability_chd,
          risk_percent: r.risk_percent,
          band: bandObj.label,
          bandKey: bandObj.key,
        };
      });
      setResults(resMapped);
      setStep("results");
    } catch (err) {
      setError("Prediction failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [patients]);

  const updatePatient = (idx, key, value) => {
    setPatients((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: parsePatientValue(key, value) };
      return next;
    });
  };

  if (!open) {
    return (
      <div className="import-trigger-wrap">
        <button className="import-trigger-btn" onClick={() => setOpen(true)} id="import-patients-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Import Patients from File
          <span className="import-badge">PDF / Excel / CSV</span>
        </button>
      </div>
    );
  }

  return (
    <div className="import-panel" id="import-panel">
      {/* Panel Header */}
      <div className="import-panel-header">
        <div className="import-panel-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Import Patients</span>
          <span className="import-step-pill">
            {step === "upload" ? "Step 1 — Upload" : step === "preview" ? "Step 2 — Review" : "Step 3 — Results"}
          </span>
        </div>
        <div className="import-header-actions">
          {step !== "upload" && (
            <button className="import-ghost-btn" onClick={reset}>
              ← New Import
            </button>
          )}
          <button className="import-close-btn" onClick={() => { setOpen(false); reset(); }} aria-label="Close import panel">✕</button>
        </div>
      </div>

      {/* STEP 1 — UPLOAD */}
      {step === "upload" && (
        <div className="import-upload-area">
          <div
            className={`import-dropzone${dragging ? " dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
            id="import-dropzone"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {loading ? (
              <div className="import-loading">
                <div className="import-spinner" />
                <p>Parsing file…</p>
              </div>
            ) : (
              <>
                <div className="import-dropzone-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </div>
                <p className="import-dropzone-main">Drag & drop your file here</p>
                <p className="import-dropzone-sub">or click to browse</p>
                <div className="import-file-types">
                  <span>.xlsx</span><span>.csv</span><span>.pdf</span>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="import-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Template hint */}
          <div className="import-hint-box">
            <div className="import-hint-title">📋 Expected Column Names</div>
            <div className="import-hint-tags">
              {["Age", "Sex / Male / Gender", "Cigs Per Day", "BP Meds", "Hypertension", "Diabetes",
                "Total Cholesterol", "Systolic BP", "Diastolic BP", "BMI", "Heart Rate", "Glucose"].map((t) => (
                <span key={t} className="import-hint-tag">{t}</span>
              ))}
            </div>
            <p className="import-hint-note">
              Column names are matched flexibly — partial matches and common abbreviations work too.
              Binary fields (sex, diabetes, etc.) accept: 1/0, Yes/No, Male/Female, True/False.
            </p>
          </div>
        </div>
      )}

      {/* STEP 2 — PREVIEW */}
      {step === "preview" && (
        <div className="import-preview-area">
          <div className="import-parse-summary">
            <div className="import-parse-info">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <strong>{patients.length}</strong> patients loaded from <em>{fileName}</em>
            </div>
            {unmatchedColumns.length > 0 && (
              <div className="import-warn-cols">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Not matched (filled with defaults):{" "}
                <span>{unmatchedColumns.map((k) => FIELD_LABELS[k]).join(", ")}</span>
              </div>
            )}
          </div>

          <div className="import-table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th>#</th>
                  {ALL_KEYS.map((k) => (
                    <th key={k} className={!matchedColumns.includes(k) ? "col-default" : ""}>
                      {FIELD_LABELS[k]}
                      {!matchedColumns.includes(k) && <span className="default-badge">default</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patients.slice(0, 50).map((p, i) => (
                  <tr key={i}>
                    <td className="row-num">{i + 1}</td>
                    {ALL_KEYS.map((k) => (
                      <td key={k} className={!matchedColumns.includes(k) ? "col-default" : ""}>
                        {["male","BPMeds","prevalentHyp","diabetes"].includes(k) ? (
                          <select
                            className="import-select"
                            value={p[k]}
                            onChange={(e) => updatePatient(i, k, e.target.value)}
                          >
                            {k === "male"
                              ? <><option value={1}>Male</option><option value={0}>Female</option></>
                              : <><option value={1}>Yes</option><option value={0}>No</option></>
                            }
                          </select>
                        ) : (
                          <input
                            className="import-cell-input"
                            type="number"
                            value={p[k]}
                            onChange={(e) => updatePatient(i, k, e.target.value)}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {patients.length > 50 && (
              <p className="import-truncate-note">Showing first 50 of {patients.length} patients. All will be predicted.</p>
            )}
          </div>

          <div className="import-preview-actions">
            <button className="import-ghost-btn" onClick={reset}>← Back</button>
            <button className="import-run-btn" onClick={runPredictions} id="run-predictions-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Run Predictions ({patients.length} patients)
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — RESULTS */}
      {step === "results" && (
        <div className="import-results-area">
          {/* Summary Cards */}
          <div className="import-result-summary">
            {["low","mid","high"].map((bk) => {
              const count = results.filter((r) => r.bandKey === bk).length;
              const pct = ((count / results.length) * 100).toFixed(0);
              const labels = { low: "Lower Risk", mid: "Medium Risk", high: "Higher Risk" };
              const c = BAND_COLORS[bk];
              return (
                <div key={bk} className="import-summary-card" style={{ borderColor: c.border, background: c.bg }}>
                  <div className="import-summary-count" style={{ color: c.color }}>{count}</div>
                  <div className="import-summary-label">{labels[bk]}</div>
                  <div className="import-summary-pct" style={{ color: c.color }}>{pct}%</div>
                </div>
              );
            })}
          </div>

          {/* Results Table */}
          <div className="import-table-wrap">
            <table className="import-table import-results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Age</th>
                  <th>Sex</th>
                  <th>Sys BP</th>
                  <th>Dia BP</th>
                  <th>Chol</th>
                  <th>BMI</th>
                  <th>Glucose</th>
                  <th>Diabetes</th>
                  <th>Hypert.</th>
                  <th>Percentile</th>
                  <th>Risk Band</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const c = BAND_COLORS[r.bandKey];
                  return (
                    <tr key={i}>
                      <td className="row-num">{i + 1}</td>
                      <td>{r.patient.age}</td>
                      <td>{r.patient.male === 1 ? "M" : "F"}</td>
                      <td>{r.patient.sysBP}</td>
                      <td>{r.patient.diaBP}</td>
                      <td>{r.patient.totChol}</td>
                      <td>{r.patient.BMI}</td>
                      <td>{r.patient.glucose}</td>
                      <td>{r.patient.diabetes ? "Yes" : "No"}</td>
                      <td>{r.patient.prevalentHyp ? "Yes" : "No"}</td>
                      <td>
                        <span className="pct-badge">{r.percentile.toFixed(1)}th</span>
                      </td>
                      <td>
                        <span className="band-pill" style={{ color: c.color, background: c.bg, borderColor: c.border }}>
                          {r.band}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="import-preview-actions">
            <button className="import-ghost-btn" onClick={() => setStep("preview")}>← Back to Preview</button>
            <button className="import-export-btn" onClick={() => exportToExcel(results)} id="export-results-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export Results to Excel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
