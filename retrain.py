import pandas as pd
import numpy as np
import pickle
import json
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import QuantileTransformer, StandardScaler
from sklearn.svm import SVC
from sklearn.linear_model import LogisticRegression
import warnings

warnings.filterwarnings("ignore")

# 1. Load Data
df = pd.read_csv('framingham.csv')

features = [
    "male", "age", "cigsPerDay", "BPMeds", "prevalentHyp",
    "diabetes", "totChol", "sysBP", "diaBP", "BMI", "heartRate", "glucose"
]
target = "TenYearCHD"

df = df.dropna(subset=[target])
X = df[features]
y = df[target]

# 2. Build Pipelines
print("Training Logistic Regression...")
lr_pipeline = Pipeline([
    ('imputer', SimpleImputer(strategy='median')),
    ('qt', QuantileTransformer(output_distribution='normal', n_quantiles=1000, random_state=42)),
    ('scalar', StandardScaler()),
    ('model', LogisticRegression(max_iter=1000, random_state=42))
])
lr_pipeline.fit(X, y)

print("Training Support Vector Machine...")
svm_pipeline = Pipeline([
    ('imputer', SimpleImputer(strategy='median')),
    ('qt', QuantileTransformer(output_distribution='normal', n_quantiles=1000, random_state=42)),
    ('scalar', StandardScaler()),
    ('model', SVC(C=0.1, gamma='scale', kernel='rbf', probability=True, random_state=42))
])
svm_pipeline.fit(X, y)

# 3. Compute Averaged Probabilities for LUT
print("Computing ensemble probabilities...")
# index 1 is probability of CHD (Class 1)
lr_probs = lr_pipeline.predict_proba(X)[:, 1]
svm_probs = svm_pipeline.predict_proba(X)[:, 1]

# Average probabilities
ensemble_probs = (lr_probs + svm_probs) / 2.0
sorted_probs = np.sort(ensemble_probs).tolist()

# Downsample lookup table slightly to keep it small (e.g. 1000 points)
if len(sorted_probs) > 1000:
    indices = np.linspace(0, len(sorted_probs)-1, 1000).astype(int)
    sorted_probs = [sorted_probs[i] for i in indices]

# 4. Save Models and LUT
print("Saving models and LUT...")
with open('lr_pipeline.pkl', 'wb') as f:
    pickle.dump(lr_pipeline, f)

with open('svm_pipeline.pkl', 'wb') as f:
    pickle.dump(svm_pipeline, f)

with open('percentile_lut.json', 'w') as f:
    json.dump(sorted_probs, f)

print("Done!")
