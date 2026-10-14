# Virtual Lab (VLab) — machine learning and deep learning for mining geotechnics

The Virtual Lab trains and compares machine-learning and deep-learning models on your own data, entirely in the
browser, and produces a detailed report that can go straight into a manuscript. Nothing is uploaded to a server:
the data, the models and the results stay in your browser (and in your private GitHub repository only if you
turn on sync).

This document has two parts:

1. **[Using the lab, step by step](#part-1--using-the-lab-step-by-step)** — what to do on each screen.
2. **[How it works, step by step](#part-2--how-it-works-step-by-step)** — what the lab does with your data, so you can
   describe it accurately in a Methods section and answer reviewers.

---

## Part 1 — Using the lab, step by step

### Step 0. Prepare the data

- Export your table as **CSV** (comma, semicolon or tab separated; a decimal comma is accepted when the separator is
  a semicolon). One row per sample, one column per variable, with a header row.
- Keep identifying columns that define **groups** — mine, project, site, coalfield, borehole, specimen, batch,
  month. They are not used as inputs, but they decide how the data are split (see Step 3).
- For **time series** (IR/AE monitoring, microseismic sequences, convergence), keep one column that orders the rows
  in time (e.g. `time_s`, load step) and one that identifies each independent series (e.g. `specimen`).
- Empty cells, `NA`, `NaN`, `null` and `-` are read as missing values. Rows without a target value are excluded.

### Step 1. Create an experiment

Open **VLab** in the top bar and either:

- **Upload a CSV**, or
- **Start from a research template**. Each template proposes the target, inputs, grouping and models for a typical
  study, lists what reviewers look for, and can generate a **synthetic demonstration dataset**:

| Template | Topic | Task |
|---|---|---|
| Rockburst intensity classification | Rockburst & ground control | Classification (none / light / moderate / strong) |
| Microseismic event vs. blast discrimination | Microseismic monitoring | Classification |
| Height of the water-conducting fractured zone | Water-conservation mining | Regression |
| UCS of CO2-carbonated fly-ash backfill | Green mining & CO2 mineralisation | Regression |
| Failure precursor recognition from IR and AE sequences | Infrared radiation & acoustic emission | Sequence classification |

> **Synthetic data are for learning the tool only.** Experiments built on them are marked *synthetic* everywhere,
> and the report carries a warning. Never report their numbers as results.

### Step 2. Check the data

The **Data** step shows every column with its type (numeric / categorical), missing values and number of distinct
values, descriptive statistics, and a correlation matrix. Look for wrong types (a numeric column read as text
because of a stray character), many missing values, and suspiciously high correlations with the target.

### Step 3. Set up the task

1. **Task**: classification (a class label) or regression (a number).
2. **Target**: the column to predict.
3. **Inputs (features)**: the columns the model may use. Never include a variable that is measured after the outcome
   or computed from the target — that is leakage.
4. **Split strategy** — the most important choice for credibility:
   - **Grouped** (recommended when samples share a site, project, specimen or batch): whole groups are held out, so
     the model is always tested on sites/specimens it has never seen.
   - **Temporal**: the latest samples are held out and cross-validation moves forward in time (for forecasting).
   - **Random (stratified)**: only when samples are truly independent.
5. **Test fraction** (default 20%) and **number of CV folds** (default 5).
6. **Sequence models** (optional): choose the order column, the series column and the window length; each sample then
   becomes the last *w* rows of one series, labelled by the target at the window end.
7. **Class weighting** for imbalanced classes, and **hyperparameter tuning** (randomised search with *n* iterations,
   nested inside each training fold).
8. **Random seed**: the same seed, data and settings give the same splits and results.

### Step 4. Choose the models

| Family | Models | Engine |
|---|---|---|
| Baseline | Majority class / mean | scikit-learn |
| Linear | Logistic regression / Ridge regression | scikit-learn |
| Instance-based | k-nearest neighbours | scikit-learn |
| Kernel | Support vector machine (RBF) | scikit-learn |
| Tree ensembles | Random forest, Extra trees | scikit-learn |
| Boosting | Histogram gradient boosting, XGBoost, LightGBM | scikit-learn / XGBoost / LightGBM |
| Neural network | MLP (scikit-learn) | scikit-learn |
| Deep learning | DNN; for sequences also 1D-CNN, LSTM, GRU | TensorFlow.js |

Always keep the **baseline**: a model is only useful if it clearly beats it. For deep models you can set the layer
sizes, dropout, learning rate, batch size, maximum epochs and early-stopping patience.

### Step 5. Run

Press **Run experiment**. The first run downloads the Python runtime (about 30 MB, cached afterwards). Progress is
shown per model and fold; you can cancel at any time. Classical and deep models train in parallel in background
workers, so the page stays responsive.

### Step 6. Read the report

The report contains, in order:

1. **Summary** — best model, its cross-validated and test scores, and the key warnings.
2. **Data** — sample size, inputs, class balance or target distribution, preprocessing notes.
3. **Validation design** — the exact split, fold sizes, tuning and seeds.
4. **Model comparison** — every metric as cross-validation mean ± SD, with a chart, and a
   **corrected resampled t-test** of the best model against each other model.
5. **Test-set performance** — every metric with a **95% bootstrap confidence interval**.
6. **Diagnostics** — confusion matrix and ROC curves (classification) or parity and residual plots (regression).
7. **Interpretation** — grouped permutation importance (all models), TreeSHAP (XGBoost, LightGBM) and partial
   dependence of the most important inputs; learning curves of the deep models.
8. **Hyperparameters and environment** — final parameters of every model and the exact library versions.
9. **Warnings** — data-quality and leakage checks (see Part 2, step 9).
10. **Draft Methods and Results text** — written from the numbers, with no AI involved.

### Step 7. Use the results

- **Insert into a manuscript**: the Methods and Results paragraphs and tables go into the section you choose.
- **AI interpretation** (optional): asks your chosen AI model to discuss the results in rock-mechanics terms. It only
  sees the summary numbers and is told not to invent anything.
- **Exports**: full **HTML report** (charts with hover values), **Markdown**, **predictions CSV** (test set, every
  model), the **split file**, and a **Python script** that reproduces the experiment with scikit-learn and Keras on your
  own computer — including SHAP plots — for supplementary material or reviewers.

---

## Part 2 — How it works, step by step

### 1. Reading the data

The CSV is parsed in the browser. A column is numeric when every non-missing value parses as a number; otherwise it is
categorical. The dataset is stored with the experiment in the browser's database (IndexedDB).

### 2. Building the design matrix

- Numeric inputs are used as they are; **missing values are kept** and imputed later, inside each training fold.
- Categorical inputs are **one-hot encoded** (one 0/1 column per category). The category list is taken from the whole
  table, which only reveals which categories exist, not any target information.
- For classification the labels are mapped to class indices; for regression the target must be numeric.
- **Sequences**: rows are grouped by the series column, sorted by the order column, and every run of *w* consecutive
  rows becomes one sample (*w* × channels), labelled by the target of its last row.

### 3. Splitting — once, for every model

The split is computed **once, in the app**, from the seed, and the same index lists are sent to every engine. All
models are therefore trained and tested on exactly the same samples, which is what makes the comparison and the
statistical tests valid.

- **Random**: a stratified hold-out test set, then stratified *k*-fold CV on the rest.
- **Grouped**: a share of the groups is held out; the remaining groups are dealt into *k* folds, so no group is ever in
  both training and validation. Sequence experiments always split by series, because overlapping windows from one
  specimen are nearly identical.
- **Temporal**: the latest samples form the test set; CV is forward-chaining — fold *f* trains only on samples before
  its validation block, never on the future.

### 4. Training the classical models (scikit-learn in Pyodide)

Python 3.14 with scikit-learn 1.8, XGBoost 2.1 and LightGBM 4.6 runs inside the browser (Pyodide, WebAssembly) in a
background worker. For each model and each fold:

1. A pipeline is built: **median imputation → standardisation → model**. Both preprocessing steps are fitted on the
   fold's training data only.
2. With tuning on, a **randomised search** (*n* iterations) runs **inside** the fold's training data, with an inner
   3-fold CV of the same kind (grouped, temporal or stratified). This is **nested cross-validation**: the outer
   validation fold never influences the hyperparameters.
3. The fitted pipeline predicts the fold's validation samples (labels and class probabilities).

Finally the model is refitted on the whole training set (tuned the same way) and predicts the test set.

### 5. Training the deep models (TensorFlow.js)

In a second background worker, for each fold:

1. Missing values are imputed with the fold's training means and inputs are standardised with the fold's training
   mean and SD (regression targets too, transformed back afterwards).
2. 15% of the fold's training data (the latest 15% for temporal splits) is held aside for **early stopping**.
3. The network is trained with Adam; every epoch uses a **seeded shuffle**, all weights use seeded initialisers, and
   the weights of the **best validation epoch are restored** when training stops.
4. The network predicts the fold's validation samples.

Architectures: **DNN** — dense ReLU layers with dropout; **1D-CNN** — two convolution layers (32 and 64 filters),
global average pooling, a dense layer; **LSTM / GRU** — stacked recurrent layers. Outputs are softmax (classes) or
linear (regression).

### 6. Explaining the models

- **Grouped permutation importance** on the test set: the columns that come from one original input (all one-hot
  columns of a category, or all time steps of a channel) are shuffled together, and the drop in the primary score
  (macro-F1 or R²) is recorded over 10 repeats (5 for deep models). The same method is used for every model.
- **TreeSHAP** for XGBoost and LightGBM, from the libraries' built-in exact SHAP values, summarised as mean |SHAP| per
  original input.
- **Partial dependence** of the three most important single-column numeric inputs (classical models): the average
  prediction (or the probability of the last class) as the input varies over its range.

### 7. Scoring — the same code for every engine

Engines return predictions only; the app computes every metric itself:

- **Classification**: accuracy, balanced accuracy, macro precision / recall / F1, Cohen's κ, Matthews correlation
  coefficient (multiclass), macro one-vs-rest ROC-AUC, confusion matrix and ROC curves.
- **Regression**: R², RMSE, MAE, MAPE (only when no observed value is zero).
- **Cross-validation**: every metric per fold, reported as mean ± SD.
- **Test set**: every metric with a **95% percentile bootstrap interval** (1,000 resamples of the test predictions,
  seeded).

### 8. Comparing models

Models are ranked by the CV mean of the primary metric (macro-F1 or R²). The best model is compared with each other
model using the **corrected resampled t-test** (Nadeau & Bengio, 2003), which inflates the variance of the fold
differences by (1/*k* + *n*<sub>test</sub>/*n*<sub>train</sub>) because CV training sets overlap. A difference with
*p* > 0.05 is reported as "not significantly better", and the report warns against claiming superiority.

### 9. Checking for problems

The report warns when:

- the dataset is small (< 100 samples) or has fewer than 10 samples per input column;
- the test set has fewer than 30 samples, or the test score differs from the CV mean by more than 0.15;
- classes are imbalanced (> 3:1), or the rarest class is too small for the number of folds;
- test samples have **feature vectors identical to training samples** (duplicated records);
- a single input correlates with a regression target at |*r*| > 0.95 (possible leakage);
- a random split is used although columns such as *site*, *mine*, *specimen* or *batch* suggest grouped data;
- the best model is not significantly better than the baseline or than other models;
- any model failed (with the error message).

### 10. Writing the report

Methods and Results paragraphs are generated from the configuration and the numbers by fixed templates — no AI — so
every number in them is exactly what was computed. The optional AI interpretation is clearly separated and must be
checked like any other AI text.

### 11. Reproducibility

The report lists the seed, the split, the hyperparameters of every model and the exact versions of Python,
NumPy, SciPy, scikit-learn, XGBoost, LightGBM and TensorFlow.js. The exported Python script embeds the same split
indices and parameters, so the experiment can be re-run outside the browser.

---

## Limitations to state in a paper

- Deep models are trained in TensorFlow.js on the CPU; very large datasets or long sequences are better trained with
  the exported script on a workstation.
- Results of deep models can differ slightly between browsers because of floating-point arithmetic.
- The `shap` package is not available in the browser: SHAP values are computed only for XGBoost and LightGBM here;
  the exported script computes them for any model.
- Permutation importance is computed on the test set and is affected by correlated inputs; interpret groups of
  correlated inputs together.

## References for the Methods section

- Pedregosa F. et al. (2011) Scikit-learn: Machine learning in Python. *Journal of Machine Learning Research* 12:2825–2830.
- Chen T., Guestrin C. (2016) XGBoost: A scalable tree boosting system. *Proceedings of KDD '16*, 785–794. https://doi.org/10.1145/2939672.2939785
- Ke G. et al. (2017) LightGBM: A highly efficient gradient boosting decision tree. *Advances in Neural Information Processing Systems* 30.
- Smilkov D. et al. (2019) TensorFlow.js: Machine learning for the web and beyond. *Proceedings of Machine Learning and Systems* 1.
- Nadeau C., Bengio Y. (2003) Inference for the generalization error. *Machine Learning* 52:239–281. https://doi.org/10.1023/A:1024068626366
- Lundberg S.M. et al. (2020) From local explanations to global understanding with explainable AI for trees. *Nature Machine Intelligence* 2:56–67. https://doi.org/10.1038/s42256-019-0138-9
- Breiman L. (2001) Random forests. *Machine Learning* 45:5–32. https://doi.org/10.1023/A:1010933404324
