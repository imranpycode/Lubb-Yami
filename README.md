# LUBB YAMI

**LUBB YAMI** is an AI-powered cardiovascular risk assessment web application. It predicts a patient's risk of Coronary Heart Disease (CHD) using models trained on the iconic Framingham Heart Study dataset. 

This tool provides a dynamic, user-friendly interface to visualize clinical risk factors and positions the patient's relative risk compared to a cohort of over 4,000 subjects.

## Features

- **Dual-Model Ensemble AI:** Combines a Support Vector Machine (SVM) (for non-linear clinical feature interactions) and Logistic Regression (for stable mathematical extrapolation of extreme ages/profiles) into a robust, averaged prediction pipeline.
- **Interactive UI:** A React/Vite frontend featuring live-updating sliders and toggles for blood pressure, cholesterol, BMI, smoking habits, and more.
- **Batch Processing:** Import CSV or Excel files containing multiple patient profiles to instantly score and categorize them into risk bands, and export the results.
- **Beautiful Visualizations:** Glassmorphism UI, pulsing heartbeat logo animations, and smooth dynamic transitions.

## Tech Stack

- **Frontend:** React, Vite, standard CSS
- **Backend:** Python, Flask
- **Machine Learning:** Scikit-Learn, Pandas (Models: SVC, LogisticRegression)

## Local Development Setup

### 1. Start the Python Backend
The Flask backend serves the prediction API and loads the trained `.pkl` pipelines.

```bash
# Install required Python packages
pip install flask flask-cors pandas scikit-learn numpy

# Start the Flask server (runs on port 5050)
python backend.py
```

### 2. Start the React Frontend
The Vite frontend acts as the user interface and proxies API requests to the Python backend.

```bash
# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```
Navigate to `http://localhost:5173` to use the application.

## API Endpoints
The backend runs on `http://127.0.0.1:5050` and provides:
- `GET /api/health`: Check model readiness.
- `POST /api/predict`: Get probability and percentile for a single patient JSON.
- `POST /api/predict/batch`: Score multiple patients at once.

---
*Disclaimer: This tool provides relative mathematical predictions based on the historical Framingham dataset. It is not intended to replace professional medical diagnosis or clinical judgment.*
