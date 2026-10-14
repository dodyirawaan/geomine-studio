// Python training script run by Pyodide. It receives the design matrix and the exact folds from TypeScript and returns
// predictions plus explanations; all metrics are computed afterwards in TypeScript so every engine is scored alike.
export const TRAIN_PY = String.raw`
import json, time, warnings
import numpy as np
warnings.filterwarnings("ignore")

from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.svm import SVC, SVR
from sklearn.ensemble import (RandomForestClassifier, RandomForestRegressor, ExtraTreesClassifier,
                              ExtraTreesRegressor, HistGradientBoostingClassifier, HistGradientBoostingRegressor)
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, KFold, GroupKFold, TimeSeriesSplit
from sklearn.inspection import partial_dependence
from sklearn.metrics import f1_score, r2_score
from sklearn.utils.class_weight import compute_sample_weight
from scipy.stats import loguniform, randint, uniform
import sklearn

P = json.loads(payload)
TASK = P["task"]
CLF = TASK == "classification"
SEED = int(P["seed"])
X = np.array([[np.nan if v is None else v for v in row] for row in P["X"]], dtype=float)
y = np.array(P["y"], dtype=int if CLF else float)
K = int(P["n_classes"]) if CLF else 0
TRAIN = np.array(P["train"], dtype=int)
TEST = np.array(P["test"], dtype=int)
FOLDS = [np.array(f, dtype=int) for f in P["folds"]]
FOLD_TRAIN = [np.array(f, dtype=int) for f in P["fold_train"]]
GROUPS = np.array(P["groups"]) if P.get("groups") is not None else None
SPLIT = P["split_kind"]
CW = "balanced" if (CLF and P["class_weight"]) else None
TUNE = P["tuning"]["enabled"]
N_ITER = int(P["tuning"]["iterations"])
SOURCES = P["feature_source"]
NAMES = P["feature_names"]

def say(msg):
    try:
        report_progress(msg)
    except Exception:
        pass

def score(yt, yp):
    return f1_score(yt, yp, average="macro") if CLF else r2_score(yt, yp)

def spec(mid):
    """Estimator, search space (keys without the 'model__' prefix) and whether it takes sample weights."""
    if mid == "dummy":
        return (DummyClassifier(strategy="most_frequent") if CLF else DummyRegressor()), {}, False
    if mid == "linear":
        if CLF:
            return LogisticRegression(max_iter=3000, class_weight=CW), {"C": loguniform(1e-3, 1e2)}, False
        return Ridge(), {"alpha": loguniform(1e-3, 1e3)}, False
    if mid == "knn":
        e = KNeighborsClassifier() if CLF else KNeighborsRegressor()
        return e, {"n_neighbors": randint(3, 31), "weights": ["uniform", "distance"]}, False
    if mid == "svm":
        if CLF:
            return SVC(probability=True, class_weight=CW, random_state=SEED), {"C": loguniform(1e-2, 1e3), "gamma": loguniform(1e-4, 1)}, False
        return SVR(), {"C": loguniform(1e-2, 1e3), "gamma": loguniform(1e-4, 1), "epsilon": loguniform(1e-3, 1)}, False
    if mid in ("rf", "et"):
        if CLF:
            cls = RandomForestClassifier if mid == "rf" else ExtraTreesClassifier
            e = cls(n_estimators=300, class_weight=CW, random_state=SEED, n_jobs=1)
        else:
            cls = RandomForestRegressor if mid == "rf" else ExtraTreesRegressor
            e = cls(n_estimators=300, random_state=SEED, n_jobs=1)
        return e, {"max_depth": [None, 4, 6, 8, 12, 16], "min_samples_leaf": randint(1, 11), "max_features": ["sqrt", 0.5, 1.0]}, False
    if mid == "hgb":
        e = HistGradientBoostingClassifier(class_weight=CW, random_state=SEED) if CLF else HistGradientBoostingRegressor(random_state=SEED)
        return e, {"learning_rate": loguniform(0.01, 0.3), "max_leaf_nodes": randint(8, 64), "min_samples_leaf": randint(5, 41), "l2_regularization": loguniform(1e-4, 10)}, False
    if mid == "xgb":
        import xgboost as xgb
        e = (xgb.XGBClassifier if CLF else xgb.XGBRegressor)(n_estimators=300, tree_method="hist", random_state=SEED, n_jobs=1, verbosity=0)
        return e, {"learning_rate": loguniform(0.01, 0.3), "max_depth": randint(2, 9), "subsample": uniform(0.6, 0.4), "colsample_bytree": uniform(0.6, 0.4), "min_child_weight": loguniform(0.5, 10), "reg_lambda": loguniform(1e-3, 10)}, CLF and CW is not None
    if mid == "lgbm":
        import lightgbm as lgb
        e = lgb.LGBMClassifier(n_estimators=300, class_weight=CW, random_state=SEED, n_jobs=1, verbose=-1) if CLF else lgb.LGBMRegressor(n_estimators=300, random_state=SEED, n_jobs=1, verbose=-1)
        return e, {"num_leaves": randint(8, 64), "learning_rate": loguniform(0.01, 0.3), "min_child_samples": randint(5, 41), "subsample": uniform(0.6, 0.4), "subsample_freq": [1], "colsample_bytree": uniform(0.6, 0.4), "reg_lambda": loguniform(1e-3, 10)}, False
    if mid == "mlp_sk":
        e = (MLPClassifier if CLF else MLPRegressor)(hidden_layer_sizes=(64, 32), max_iter=2000, early_stopping=True, random_state=SEED)
        return e, {"alpha": loguniform(1e-5, 1e-1), "learning_rate_init": loguniform(1e-4, 1e-2), "hidden_layer_sizes": [(32,), (64,), (64, 32), (128, 64)]}, False
    raise ValueError("Unknown model " + mid)

def inner_cv(idx):
    n = len(idx)
    if SPLIT == "group" and GROUPS is not None:
        return GroupKFold(n_splits=max(2, min(3, len(set(GROUPS[idx].tolist())))))
    if SPLIT == "time":
        return TimeSeriesSplit(n_splits=3)
    if CLF:
        return StratifiedKFold(n_splits=3, shuffle=True, random_state=SEED)
    return KFold(n_splits=3, shuffle=True, random_state=SEED)

def fit(mid, idx):
    est, space, weighted = spec(mid)
    pipe = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()), ("model", est)])
    fit_kw = {"model__sample_weight": compute_sample_weight("balanced", y[idx])} if weighted else {}
    if TUNE and space:
        search = RandomizedSearchCV(pipe, {"model__" + k: v for k, v in space.items()}, n_iter=N_ITER, cv=inner_cv(idx),
                                    scoring="f1_macro" if CLF else "r2", random_state=SEED, n_jobs=1, error_score=np.nan, refit=True)
        kw = dict(fit_kw)
        if SPLIT == "group" and GROUPS is not None:
            kw["groups"] = GROUPS[idx]
        search.fit(X[idx], y[idx], **kw)
        best = {k.replace("model__", ""): (v if isinstance(v, (int, float, str, type(None))) else str(v)) for k, v in search.best_params_.items()}
        return search.best_estimator_, best
    pipe.fit(X[idx], y[idx], **fit_kw)
    return pipe, {}

def proba_full(model, Xs):
    if not CLF or not hasattr(model, "predict_proba"):
        return None
    p = model.predict_proba(Xs)
    out = np.zeros((len(Xs), K))
    out[:, model.classes_.astype(int)] = p
    return out

def predict(model, Xs):
    p = model.predict(Xs)
    return p.astype(int) if CLF else p.astype(float)

def grouped_importance(model, Xt, yt, repeats=10):
    rng = np.random.default_rng(SEED)
    base = score(yt, predict(model, Xt))
    groups = list(dict.fromkeys(SOURCES))
    mean, std = [], []
    for g in groups:
        cols = [i for i, s in enumerate(SOURCES) if s == g]
        drops = []
        for _ in range(repeats):
            Xp = Xt.copy()
            perm = rng.permutation(len(Xt))
            Xp[:, cols] = Xt[perm][:, cols]
            drops.append(base - score(yt, predict(model, Xp)))
        mean.append(float(np.mean(drops)))
        std.append(float(np.std(drops)))
    return groups, mean, std

def tree_shap(mid, model, Xt):
    """Mean |SHAP| per original feature from the boosters' built-in TreeSHAP."""
    Z = model[:-1].transform(Xt)
    est = model[-1]
    if mid == "xgb":
        import xgboost as xgb
        c = est.get_booster().predict(xgb.DMatrix(Z), pred_contribs=True)
    elif mid == "lgbm":
        c = est.predict(Z, pred_contrib=True)
        if CLF and K > 2:
            c = c.reshape(len(Z), K, -1)
    else:
        return None
    c = np.abs(np.asarray(c))
    if c.ndim == 3:
        c = c.mean(axis=1)
    c = c[:, :-1].mean(axis=0)
    groups = list(dict.fromkeys(SOURCES))
    return [float(sum(c[i] for i, s in enumerate(SOURCES) if s == g)) for g in groups]

def pdp(model, groups, importance):
    """Partial dependence of the three most important single-column numeric features."""
    out = []
    order = np.argsort(importance)[::-1]
    for gi in order:
        g = groups[gi]
        cols = [i for i, s in enumerate(SOURCES) if s == g]
        if len(cols) != 1 or NAMES[cols[0]] != g:
            continue
        try:
            r = partial_dependence(model, X[TRAIN], [cols[0]], grid_resolution=20, kind="average")
            avg = np.asarray(r["average"])
            yv = avg[-1] if avg.ndim == 2 else avg
            out.append({"feature": g, "x": [float(v) for v in r["grid_values"][0]], "y": [float(v) for v in np.ravel(yv)]})
        except Exception:
            pass
        if len(out) == 3:
            break
    return out

results = []
for mi, mid in enumerate(P["models"]):
    name = P["model_names"][mi]
    t0 = time.time()
    try:
        cv, fold_params = [], []
        for f, (tr, va) in enumerate(zip(FOLD_TRAIN, FOLDS)):
            say(f"{name}: fold {f + 1}/{len(FOLDS)}" + (" (tuning)" if TUNE else ""))
            m, bp = fit(mid, tr)
            pr = proba_full(m, X[va])
            cv.append({"pred": predict(m, X[va]).tolist(), "proba": None if pr is None else pr.tolist()})
            fold_params.append(bp)
        say(f"{name}: final model on all training data")
        m, bp = fit(mid, TRAIN)
        pt = proba_full(m, X[TEST])
        say(f"{name}: explanations")
        groups, imp_mean, imp_std = grouped_importance(m, X[TEST], y[TEST])
        shap = None
        if mid in ("xgb", "lgbm"):
            try:
                shap = tree_shap(mid, m, X[TEST])
            except Exception:
                shap = None
        est_params = {k: (v if isinstance(v, (int, float, str, bool, type(None))) else str(v)) for k, v in m[-1].get_params().items()}
        results.append({
            "id": mid, "name": name, "engine": "sklearn", "cv": cv,
            "test": predict(m, X[TEST]).tolist(), "testProba": None if pt is None else pt.tolist(),
            "importanceFeatures": groups, "importance": {"mean": imp_mean, "std": imp_std}, "shap": shap,
            "pdp": pdp(m, groups, imp_mean) if mid != "dummy" else [],
            "params": {**est_params, **bp}, "foldParams": fold_params, "fitSeconds": time.time() - t0,
        })
    except Exception as e:
        results.append({"id": mid, "name": name, "engine": "sklearn", "cv": [], "test": [], "params": {}, "fitSeconds": time.time() - t0, "error": f"{type(e).__name__}: {e}"})

versions = {"python": __import__("sys").version.split()[0], "numpy": np.__version__, "scikit-learn": sklearn.__version__, "scipy": __import__("scipy").__version__}
for pkg in ("xgboost", "lightgbm"):
    try:
        versions[pkg] = __import__(pkg).__version__
    except Exception:
        pass
def clean(o):
    """JSON-safe copy: NaN/inf become null, numpy scalars become Python numbers."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.generic):
        o = o.item()
    if isinstance(o, float) and not np.isfinite(o):
        return None
    if isinstance(o, (int, float, str, bool)) or o is None:
        return o
    return str(o)

json.dumps(clean({"models": results, "versions": versions}))
`
