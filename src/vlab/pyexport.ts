// Reproducibility package: the exact design matrix with its split, and a Python script that re-runs the experiment
// with scikit-learn / XGBoost / LightGBM / Keras and adds SHAP for every model.
import { prepare } from './data'
import type { ExperimentResult } from './evaluate'
import { makeSplits } from './splits'
import type { ExperimentConfig, Table } from './types'

/** Design matrix as used in the browser, with `_set` (train/test) and `_fold` (validation fold, or "base"). */
export function designMatrixCsv(table: Table, c: ExperimentConfig): string {
  const p = prepare(table, c)
  const ti = c.timeColumn ? table.columns.findIndex((x) => x.name === c.timeColumn) : c.sequence ? table.columns.findIndex((x) => x.name === c.sequence!.orderColumn) : -1
  const s = makeSplits(p, c, ti >= 0 ? p.sourceRow.map((r) => Number(table.rows[r][ti])) : undefined)
  const fold = new Map<number, string>()
  s.train.forEach((i) => fold.set(i, 'base'))
  s.folds.forEach((f, k) => f.forEach((i) => fold.set(i, String(k))))
  const testSet = new Set(s.test)
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const head = [...p.featureNames, '_target', '_group', '_set', '_fold', '_source_row']
  const rows = p.X.map((x, i) => [
    ...x.map((v) => (v == null ? '' : String(v))),
    c.task === 'classification' ? p.classes[p.y[i]] : String(p.y[i]),
    p.groups ? String(p.groups[i]) : '',
    testSet.has(i) ? 'test' : 'train',
    testSet.has(i) ? '' : fold.get(i) ?? 'base',
    String(p.sourceRow[i] + 2),
  ])
  return [head.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
}

const PY_CLASSES: Record<string, [string, string, string]> = {
  dummy: ['from sklearn.dummy import DummyClassifier, DummyRegressor', 'DummyClassifier', 'DummyRegressor'],
  linear: ['from sklearn.linear_model import LogisticRegression, Ridge', 'LogisticRegression', 'Ridge'],
  knn: ['from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor', 'KNeighborsClassifier', 'KNeighborsRegressor'],
  svm: ['from sklearn.svm import SVC, SVR', 'SVC', 'SVR'],
  rf: ['from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor', 'RandomForestClassifier', 'RandomForestRegressor'],
  et: ['from sklearn.ensemble import ExtraTreesClassifier, ExtraTreesRegressor', 'ExtraTreesClassifier', 'ExtraTreesRegressor'],
  hgb: ['from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor', 'HistGradientBoostingClassifier', 'HistGradientBoostingRegressor'],
  xgb: ['from xgboost import XGBClassifier, XGBRegressor', 'XGBClassifier', 'XGBRegressor'],
  lgbm: ['from lightgbm import LGBMClassifier, LGBMRegressor', 'LGBMClassifier', 'LGBMRegressor'],
  mlp_sk: ['from sklearn.neural_network import MLPClassifier, MLPRegressor', 'MLPClassifier', 'MLPRegressor'],
}

export function pythonScript(name: string, c: ExperimentConfig, r: ExperimentResult, csvName: string): string {
  const clf = c.task === 'classification'
  const sk = r.models.filter((m) => m.engine === 'sklearn' && !m.error)
  const tf = r.models.filter((m) => m.engine === 'tfjs' && !m.error)
  const imports = [...new Set(sk.map((m) => PY_CLASSES[m.id]?.[0]).filter(Boolean))].join('\n')
  const params = Object.fromEntries(sk.map((m) => [m.id, m.params]))
  const ctor = sk.map((m) => `    "${m.id}": (${PY_CLASSES[m.id][clf ? 1 : 2]}, ${JSON.stringify(m.name)}),`).join('\n')
  return `"""
Reproduces the GeoMine Studio virtual-lab experiment "${name}".

Inputs : ${csvName} — the exact design matrix used in the browser, with the split in columns _set and _fold.
Outputs: metrics printed to the console, predictions_test.csv, and SHAP summary plots (shap_<model>.png).

  pip install numpy pandas scikit-learn scipy matplotlib shap${sk.some((m) => m.id === 'xgb') ? ' xgboost' : ''}${sk.some((m) => m.id === 'lgbm') ? ' lightgbm' : ''}${tf.length ? ' tensorflow' : ''}
  python ${name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.py

Browser versions: ${r.engines.map((e) => Object.entries(e.versions).map(([k, v]) => `${k} ${v}`).join(', ')).join('; ')}.
Small numerical differences against the browser run are expected across library versions and hardware.
"""
import json
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, f1_score, cohen_kappa_score,
                             matthews_corrcoef, roc_auc_score, r2_score, mean_squared_error, mean_absolute_error)
${imports}

SEED = ${c.seed}
TASK = "${c.task}"
SPLIT_KIND = "${c.sequence ? (c.split.kind === 'time' ? 'time' : 'group') : c.split.kind}"
SEQUENCE_SHAPE = ${r.data.sequenceShape ? `(${r.data.sequenceShape[0]}, ${r.data.sequenceShape[1]})` : 'None'}
# Final hyperparameters of each model in the browser run (tuned values where tuning was enabled).
PARAMS = json.loads(${JSON.stringify(JSON.stringify(params))})

df = pd.read_csv("${csvName}")
meta = ["_target", "_group", "_set", "_fold", "_source_row"]
features = [c for c in df.columns if c not in meta]
X = df[features].to_numpy(dtype=float)
${clf ? `classes = ${JSON.stringify(r.data.classes)}
y = df["_target"].astype(str).map({c: i for i, c in enumerate(classes)}).to_numpy()` : `y = df["_target"].to_numpy(dtype=float)`}
train = np.where(df["_set"] == "train")[0]
test = np.where(df["_set"] == "test")[0]
fold_of = df["_fold"].astype(str)
k = int(max(int(f) for f in fold_of[train] if f not in ("base", "nan"))) + 1
folds = [np.where(fold_of == str(f))[0] for f in range(k)]
if SPLIT_KIND == "time":
    # Forward chaining: fold f trains on the first block ("base") and the folds before it, never on later samples.
    before = lambda f: np.array([i for i in train if fold_of[i] == "base" or (fold_of[i] != "nan" and int(fold_of[i]) < f)])
    fold_train = [before(f) for f in range(k)]
else:
    fold_train = [np.setdiff1d(train, folds[f]) for f in range(k)]

def scores(yt, yp, proba=None):
    if TASK == "classification":
        s = {"accuracy": accuracy_score(yt, yp), "balanced_accuracy": balanced_accuracy_score(yt, yp),
             "f1_macro": f1_score(yt, yp, average="macro"), "kappa": cohen_kappa_score(yt, yp), "mcc": matthews_corrcoef(yt, yp)}
        if proba is not None and len(np.unique(yt)) > 1:
            try:
                s["roc_auc"] = roc_auc_score(yt, proba if proba.shape[1] > 2 else proba[:, 1], multi_class="ovr", average="macro", labels=list(range(proba.shape[1])))
            except ValueError:
                pass
        return s
    return {"r2": r2_score(yt, yp), "rmse": mean_squared_error(yt, yp) ** 0.5, "mae": mean_absolute_error(yt, yp)}

MODELS = {
${ctor}
}

# JSON does not distinguish 1.0 from 1; these parameters mean a fraction or a rate when given as floats.
FLOAT_PARAMS = {"max_features", "max_samples", "subsample", "colsample_bytree", "learning_rate", "learning_rate_init", "alpha", "C",
                "gamma", "epsilon", "l2_regularization", "reg_lambda", "reg_alpha", "min_child_weight", "ccp_alpha",
                "min_impurity_decrease", "min_weight_fraction_leaf", "tol"}

def make(mid):
    cls, _ = MODELS[mid]
    defaults = cls().get_params()
    p = {}
    for k, v in PARAMS[mid].items():
        if k not in defaults or (v is None and defaults[k] is not None):
            continue
        if k in FLOAT_PARAMS and isinstance(v, int) and not isinstance(v, bool):
            v = float(v)
        p[k] = v
    if isinstance(p.get("hidden_layer_sizes"), str):
        p["hidden_layer_sizes"] = tuple(int(v) for v in p["hidden_layer_sizes"].strip("()[] ").split(",") if v.strip())
    return Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()), ("model", cls(**p))])

predictions = pd.DataFrame({"source_row": df["_source_row"].iloc[test].to_numpy(), "observed": y[test]})
for mid, (_, name) in MODELS.items():
    cv = []
    for tr, va in zip(fold_train, folds):
        m = make(mid).fit(X[tr], y[tr])
        cv.append(scores(y[va], m.predict(X[va]), m.predict_proba(X[va]) if hasattr(m, "predict_proba") and TASK == "classification" and len(np.unique(y[tr])) == len(np.unique(y)) else None))
    m = make(mid).fit(X[train], y[train])
    pred = m.predict(X[test])
    predictions["pred_" + mid] = pred
    cv_df = pd.DataFrame(cv)
    print(f"\\n{name}")
    print("  CV  :", ", ".join(f"{c} {cv_df[c].mean():.3f} ± {cv_df[c].std():.3f}" for c in cv_df.columns))
    print("  test:", ", ".join(f"{c} {v:.3f}" for c, v in scores(y[test], pred, m.predict_proba(X[test]) if hasattr(m, "predict_proba") and TASK == "classification" else None).items()))
    try:
        import shap, matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        Z = m[:-1].transform(X[test])
        explainer = shap.Explainer(m[-1].predict, Z, feature_names=features) if mid not in ("rf", "et", "xgb", "lgbm") else shap.TreeExplainer(m[-1])
        sv = explainer(Z) if mid not in ("rf", "et", "xgb", "lgbm") else explainer(Z, check_additivity=False)
        shap.summary_plot(sv, Z, feature_names=features, show=False)
        plt.tight_layout(); plt.savefig(f"shap_{mid}.png", dpi=300); plt.close()
    except Exception as e:
        print("  (SHAP skipped:", e, ")")

predictions.to_csv("predictions_test.csv", index=False)
${tf.length ? kerasSection(c, r, tf.map((m) => m.id)) : ''}`
}

function kerasSection(c: ExperimentConfig, r: ExperimentResult, ids: string[]): string {
  const clf = c.task === 'classification'
  return `
# ---------------------------------------------------------------------------
# Deep models (Keras equivalents of the TensorFlow.js networks used in the browser)
# ---------------------------------------------------------------------------
import tensorflow as tf
tf.keras.utils.set_random_seed(SEED)

def build(arch, n_in):
    L = tf.keras.layers
    seq = SEQUENCE_SHAPE
    model = tf.keras.Sequential()
    if arch == "dnn":
        model.add(L.Input((n_in,)))
        for u in ${JSON.stringify(c.dl.hidden)}:
            model.add(L.Dense(u, activation="relu"))
            ${c.dl.dropout > 0 ? `model.add(L.Dropout(${c.dl.dropout}))` : 'pass'}
    elif arch == "cnn1d":
        model.add(L.Input(seq))
        model.add(L.Conv1D(32, min(3, seq[0]), padding="same", activation="relu"))
        model.add(L.Conv1D(64, min(3, seq[0]), padding="same", activation="relu"))
        model.add(L.GlobalAveragePooling1D())
        model.add(L.Dense(${c.dl.hidden[0] ?? 32}, activation="relu"))
        ${c.dl.dropout > 0 ? `model.add(L.Dropout(${c.dl.dropout}))` : 'pass'}
    else:
        model.add(L.Input(seq))
        units = ${JSON.stringify(c.dl.hidden.length ? c.dl.hidden : [32])}
        for i, u in enumerate(units):
            model.add((L.LSTM if arch == "lstm" else L.GRU)(u, return_sequences=i < len(units) - 1))
        ${c.dl.dropout > 0 ? `model.add(L.Dropout(${c.dl.dropout}))` : 'pass'}
    model.add(L.Dense(${clf ? r.data.classes.length : 1}, activation="${clf ? 'softmax' : 'linear'}"))
    model.compile(optimizer=tf.keras.optimizers.Adam(${c.dl.learningRate}), loss="${clf ? 'sparse_categorical_crossentropy' : 'mse'}")
    return model

def fit_predict(arch, tr, te):
    imp = SimpleImputer(strategy="mean").fit(X[tr]); sc = StandardScaler().fit(imp.transform(X[tr]))
    f = lambda idx: sc.transform(imp.transform(X[idx]))
    Xtr, Xte = f(tr), f(te)
    if SEQUENCE_SHAPE:
        Xtr, Xte = Xtr.reshape(-1, *SEQUENCE_SHAPE), Xte.reshape(-1, *SEQUENCE_SHAPE)
    ytr = y[tr]${clf ? '' : '\n    mu, sd = ytr.mean(), ytr.std() or 1.0\n    ytr = (ytr - mu) / sd'}
    model = build(arch, X.shape[1])
    stop = tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=${c.dl.patience}, restore_best_weights=True)
    model.fit(Xtr, ytr, validation_split=0.15, epochs=${c.dl.epochs}, batch_size=${c.dl.batchSize}, callbacks=[stop], verbose=0)
    out = model.predict(Xte, verbose=0)
    return ${clf ? 'out.argmax(axis=1), out' : 'out[:, 0] * sd + mu, None'}

for arch in ${JSON.stringify(ids)}:
    cv = [scores(y[va], *fit_predict(arch, tr, va)) for tr, va in zip(fold_train, folds)]
    pred, proba = fit_predict(arch, train, test)
    cv_df = pd.DataFrame(cv)
    print(f"\\n{arch}")
    print("  CV  :", ", ".join(f"{c} {cv_df[c].mean():.3f} ± {cv_df[c].std():.3f}" for c in cv_df.columns))
    print("  test:", ", ".join(f"{c} {v:.3f}" for c, v in scores(y[test], pred, proba).items()))
`
}
