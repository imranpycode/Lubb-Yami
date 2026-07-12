import React, { useState } from 'react';
import './index.css';
import PredictionApp from '../framingham_risk_explorer.jsx';
import ImportFeature from './ImportFeature.jsx';

/* ================================================================
   ABOUT PAGE
   ================================================================ */
function AboutPage() {
  return (
    <div className="page" id="about-page">
      {/* Hero Section */}
      <div className="about-hero">
        <div>
          <div className="section-badge">
            <span>🧬</span> About This Project
          </div>
          <h1 className="page-hero-title">
            Framingham Heart Disease<br />Risk Explorer
          </h1>
          <p className="page-subtitle">
            An AI-powered cardiovascular risk assessment tool trained on the iconic
            Framingham Heart Study dataset — one of the longest-running and most
            influential studies in medical history.
          </p>
        </div>

        <div className="about-visual">
          <div className="heart-ring ring-3" />
          <div className="heart-ring ring-2" />
          <div className="heart-ring ring-1" />
          <img className="heart-display" src="/logo_cropped.png?v=3" alt="LUBB YAMI" />
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        {[
          { value: '4,434', label: 'Training Samples' },
          { value: 'RBF SVM', label: 'Model Type' },
          { value: '12', label: 'Risk Features' },
          { value: '10-yr', label: 'CHD Horizon' },
        ].map((s, i) => (
          <div className="stat-chip" key={i}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="divider" />

      {/* Warning Disclaimer */}
      <div className="alert-box alert-warning">
        <span className="alert-icon">⚠️</span>
        <div className="alert-content">
          <div className="alert-title">Medical Disclaimer — Please Read</div>
          <div className="alert-text">
            This tool is <strong>NOT a certified medical device</strong> and has <strong>NOT been approved or reviewed by any doctor, physician, or healthcare regulatory body</strong>.
            It is a personal research project built on a trained machine learning model for educational and exploratory purposes only.
            If you experience chest pain, shortness of breath, heart palpitations, or any other cardiac symptoms — <strong>please visit a doctor or go to the nearest emergency room immediately.</strong>
          </div>
        </div>
      </div>

      <div className="alert-box alert-info">
        <span className="alert-icon">🤖</span>
        <div className="alert-content">
          <div className="alert-title">How the Prediction Works</div>
          <div className="alert-text">
            The model can produce accurate risk estimates based on the patterns it learned from the dataset.
            However, accuracy on a dataset does not substitute clinical judgment. Always treat outputs as
            <strong> informational indicators</strong>, not diagnoses.
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Project Details Grid */}
      <h2 style={{
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.4rem',
        marginBottom: '1.2rem', color: 'var(--text-primary)'
      }}>
        Project Details
      </h2>
      <div className="info-grid">
        {[
          {
            icon: '📊', title: 'Dataset',
            text: 'Trained on the Framingham Heart Study dataset — a 70-year landmark study on cardiovascular disease from Framingham, Massachusetts.'
          },
          {
            icon: '🧪', title: 'ML Pipeline',
            text: 'sklearn Pipeline: Median Imputer → Quantile Transformer → Standard Scaler → RBF Support Vector Machine (SVM) classifier.'
          },
          {
            icon: '🎯', title: 'Prediction Target',
            text: 'Predicts 10-year risk of coronary heart disease (CHD) using 12 clinical and lifestyle features.'
          },
          {
            icon: '⚡', title: 'Client-Side Inference',
            text: 'All model parameters are embedded in the browser. No data is sent to any server — your inputs stay private on your device.'
          },
          {
            icon: '🔬', title: 'Feature Engineering',
            text: '12 features including age, sex, smoking, cholesterol, blood pressure, BMI, heart rate, glucose, diabetes, and hypertension.'
          },
          {
            icon: '🛡️', title: 'Not Clinically Validated',
            text: 'This model has not undergone clinical trials or regulatory review. It should never replace professional medical evaluation.'
          },
        ].map((card, i) => (
          <div className="info-card" key={i}>
            <div className="info-card-icon">{card.icon}</div>
            <div className="info-card-title">{card.title}</div>
            <div className="info-card-text">{card.text}</div>
          </div>
        ))}
      </div>

      <div className="divider" />

      {/* How it was built timeline */}
      <h2 style={{
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.4rem',
        marginBottom: '1.5rem', color: 'var(--text-primary)'
      }}>
        How It Was Built
      </h2>
      <div className="glass-card" style={{ padding: '1.8rem 2rem' }}>
        <div className="timeline">
          {[
            {
              label: 'Data Collection',
              desc: 'Sourced the Framingham Heart Study dataset, a publicly available cardiovascular research dataset with over 4,000 patient records.'
            },
            {
              label: 'Preprocessing',
              desc: 'Applied median imputation for missing values, followed by Quantile Transformation to normalize skewed distributions across all 12 features.'
            },
            {
              label: 'Model Training',
              desc: 'Trained an RBF-kernel Support Vector Machine using sklearn. Hyperparameters were tuned via grid search to optimise F1-score on the minority class.'
            },
            {
              label: 'Parameter Extraction',
              desc: 'Extracted all model parameters (support vectors, dual coefficients, intercept, scaler stats) to JSON so inference can run entirely in the browser.'
            },
            {
              label: 'Frontend Deployment',
              desc: 'Built this interactive React app so anyone can explore their risk profile without installing any software or uploading data anywhere.'
            },
          ].map((item, i) => (
            <div className="timeline-item" key={i}>
              <div className="timeline-dot" />
              <div className="timeline-label">{item.label}</div>
              <div className="timeline-desc">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="divider" />

      {/* Final big disclaimer */}
      <div className="glass-card" style={{
        padding: '2rem',
        background: 'linear-gradient(135deg, rgba(220,20,60,0.08), rgba(147,112,219,0.08))',
        borderColor: 'rgba(220,20,60,0.2)'
      }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>🏥</div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: '1.1rem', color: '#ff8fa3', marginBottom: '0.7rem'
            }}>
              Your Health Comes First
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.75 }}>
              No machine learning model, no matter how accurate on test data, can replace the expertise
              of a trained medical professional. If you feel chest pain, tightness, shortness of breath,
              dizziness, or anything that doesn't feel right — <strong style={{ color: '#ff8fa3' }}>please
              do not rely on this tool</strong>. Go see a doctor. Your life is more valuable than any prediction.
            </p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.8rem' }}>
              This project was created for academic and learning purposes only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   PREDICTION PAGE WRAPPER
   ================================================================ */
function PredictionPage() {
  return (
    <div className="page" id="prediction-page">
      <div className="section-badge">
        <span>🔬</span> Risk Assessment
      </div>
      <h1 className="page-hero-title">Heart Disease<br />Risk Prediction</h1>
      <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
        Enter your clinical details below. The model will compute your estimated
        10-year coronary heart disease risk using an RBF SVM trained on the
        Framingham dataset — entirely in your browser.
      </p>

      <div className="alert-box alert-warning" style={{ marginBottom: '2rem' }}>
        <span className="alert-icon">⚠️</span>
        <div className="alert-content">
          <div className="alert-title">Not a Medical Diagnosis</div>
          <div className="alert-text">
            This is an educational tool only. If you experience any cardiac symptoms,
            seek immediate medical attention. Do not use this as a substitute for professional medical advice.
          </div>
        </div>
      </div>

      {/* ── Import Feature ── */}
      <ImportFeature />

      <div className="import-divider">
        <span>or enter details manually</span>
      </div>

      <div id="prediction-root" className="prediction-wrapper">
        <PredictionApp />
      </div>
    </div>
  );
}

/* ================================================================
   ROOT APP — Navigation Controller
   ================================================================ */
export default function App() {
  const [page, setPage] = useState('prediction');

  return (
    <>
      <div className="app-bg" aria-hidden="true" />

      {/* ── Navbar ── */}
      <nav className="navbar" role="navigation" aria-label="Main navigation">
        <div
          className="navbar-brand"
          onClick={() => setPage('prediction')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setPage('prediction')}
          aria-label="Go to home"
        >
          <img src="/logo_cropped.png?v=3" alt="LUBB YAMI Logo" className="navbar-logo" style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '-8px 0' }} />
          <span className="navbar-title">LUBB YAMI</span>
        </div>

        <div className="navbar-links" role="tablist">
          <button
            className={`nav-btn ${page === 'about' ? 'active' : ''}`}
            onClick={() => setPage('about')}
            role="tab"
            aria-selected={page === 'about'}
            id="nav-about"
          >
            About
          </button>
          <button
            className={`nav-btn ${page === 'prediction' ? 'active' : ''}`}
            onClick={() => setPage('prediction')}
            role="tab"
            aria-selected={page === 'prediction'}
            id="nav-prediction"
          >
            Prediction
          </button>
        </div>
      </nav>

      {/* ── Page Content ── */}
      <main>
        {page === 'prediction' ? <PredictionPage /> : <AboutPage />}
      </main>
    </>
  );
}
