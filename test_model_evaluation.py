"""
Model Evaluation & Feature Importance Test Script.

Reads exported tagging results JSON, loads the same parquet data the backend uses,
trains SVM/RF/MLP models with the same hyperparameters and weighting, and reports
feature importance for each model across all 3 stages.

Usage:
    python test_model_evaluation.py
"""

import os
import json
import numpy as np
import polars as pl
from pathlib import Path
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance

# ---------------------------------------------------------------------------
# Import backend modules (no relative imports in these two files)
# ---------------------------------------------------------------------------
import importlib.util

_SERVICES_DIR = os.path.join(os.path.dirname(__file__), "backend", "app", "services")


def _import_module(name: str):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_SERVICES_DIR, f"{name}.py"))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


_dc = _import_module("data_constants")
SVM_FEATURE_METRICS = _dc.SVM_FEATURE_METRICS
SVM_PAIR_INTRA_METRICS = _dc.SVM_PAIR_INTRA_METRICS
SVM_PAIR_INTER_METRICS = _dc.SVM_PAIR_INTER_METRICS
CLICK_WEIGHT = _dc.CLICK_WEIGHT
THRESHOLD_WEIGHT = _dc.THRESHOLD_WEIGHT
CAUSE_CATEGORIES = _dc.CAUSE_CATEGORIES

_mlp = _import_module("pytorch_mlp")
WeightedMLPClassifier = _mlp.WeightedMLPClassifier


def compute_balanced_sample_weights(y: np.ndarray, sample_weights: np.ndarray) -> np.ndarray:
    """Balance sample weights by weighted class mass (mirrors svm_utils.py)."""
    classes = np.unique(y)
    n_classes = len(classes)
    total_mass = np.sum(sample_weights)
    balanced = sample_weights.copy()
    for c in classes:
        mask = (y == c)
        class_mass = np.sum(sample_weights[mask])
        if class_mass > 0:
            balanced[mask] *= total_mass / (n_classes * class_mass)
    return balanced

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent
JSON_PATH = PROJECT_ROOT / "tagging-results-2026-03-13.json"
SVM_FEATURE_PARQUET = PROJECT_ROOT / "data" / "output" / "svm_feature_metrics.parquet"
SVM_PAIR_PARQUET = PROJECT_ROOT / "data" / "output" / "svm_pair_metrics.parquet"


def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def load_feature_metrics() -> pl.DataFrame:
    """Load svm_feature_metrics.parquet and compute log_frac_nonzero."""
    df = pl.read_parquet(SVM_FEATURE_PARQUET)
    df = df.with_columns([
        (pl.col("frac_nonzero") + 1e-8).log().alias("log_frac_nonzero")
    ])
    # Fill nulls
    for metric in SVM_FEATURE_METRICS:
        if metric in df.columns:
            df = df.with_columns(pl.col(metric).fill_null(0.0))
        else:
            df = df.with_columns(pl.lit(0.0).alias(metric))
    return df


def load_pair_metrics() -> pl.DataFrame:
    """Load svm_pair_metrics.parquet."""
    return pl.read_parquet(SVM_PAIR_PARQUET)


# ---------------------------------------------------------------------------
# Model Training Helpers
# ---------------------------------------------------------------------------

def train_svm(X_train, y_train, sample_weights, multiclass=False):
    """Train SVM matching backend hyperparameters."""
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)
    balanced_weights = compute_balanced_sample_weights(y_train, sample_weights)

    if multiclass:
        model = SVC(kernel='rbf', C=1.0, gamma='scale', decision_function_shape='ovr')
    else:
        model = SVC(kernel='rbf', C=1.0, gamma='scale', probability=False)

    model.fit(X_scaled, y_train, sample_weight=balanced_weights)
    return model, scaler


def train_rf(X_train, y_train, sample_weights):
    """Train Random Forest matching backend hyperparameters."""
    n_samples = len(y_train)
    n_estimators = max(50, min(300, n_samples * 2))
    max_depth = min(5, max(2, int(np.log2(n_samples + 1))))
    balanced_weights = compute_balanced_sample_weights(y_train, sample_weights)

    rf = RandomForestClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        random_state=42,
        n_jobs=-1
    )
    rf.fit(X_train, y_train, sample_weight=balanced_weights)
    return rf


def train_mlp(X_train, y_train, sample_weights):
    """Train MLP matching backend hyperparameters."""
    mlp = WeightedMLPClassifier(
        hidden_layer_sizes=(32, 16),
        alpha=0.01,
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.2,
        n_iter_no_change=10,
        random_state=42
    )
    mlp.fit(X_train, y_train, sample_weight=sample_weights)
    return mlp


# ---------------------------------------------------------------------------
# Importance Reporting
# ---------------------------------------------------------------------------

def print_importance_table(feature_names, importances, title):
    """Print feature importances sorted descending."""
    indices = np.argsort(importances)[::-1]
    print(f"\n  {title}")
    print(f"  {'Feature':<35} {'Importance':>12}")
    print(f"  {'-'*35} {'-'*12}")
    for idx in indices:
        print(f"  {feature_names[idx]:<35} {importances[idx]:>12.4f}")


def _mlp_accuracy_scorer(model, X, y):
    """Custom scorer for WeightedMLPClassifier (no .score method)."""
    preds = model.predict(X)
    return np.mean(preds == y)


def compute_permutation_importance(model, X, y, feature_names, title, n_repeats=10):
    """Compute and print permutation importance."""
    scoring = _mlp_accuracy_scorer if isinstance(model, WeightedMLPClassifier) else None
    result = permutation_importance(model, X, y, scoring=scoring,
                                    n_repeats=n_repeats, random_state=42, n_jobs=-1)
    print_importance_table(feature_names, result.importances_mean, title)
    return result.importances_mean


# ---------------------------------------------------------------------------
# Stage 2: Binary Classification (14D)
# ---------------------------------------------------------------------------

def run_stage2(data: dict, feature_df: pl.DataFrame):
    print("\n" + "=" * 70)
    print("STAGE 2: Explanation Adequacy (Binary Classification, 14D)")
    print("=" * 70)

    s2 = data["stage2_quality"]

    # Build labels: wellExplained=1 (selected), needRevision=0 (rejected)
    ids_labels_weights = []
    for fid in s2["wellExplained"]["manual"]:
        ids_labels_weights.append((fid, 1, CLICK_WEIGHT))
    for fid in s2["wellExplained"]["auto"]:
        ids_labels_weights.append((fid, 1, THRESHOLD_WEIGHT))
    for fid in s2["needRevision"]["manual"]:
        ids_labels_weights.append((fid, 0, CLICK_WEIGHT))
    for fid in s2["needRevision"]["auto"]:
        ids_labels_weights.append((fid, 0, THRESHOLD_WEIGHT))

    all_ids = [x[0] for x in ids_labels_weights]
    all_labels = np.array([x[1] for x in ids_labels_weights])
    all_weights = np.array([x[2] for x in ids_labels_weights], dtype=np.float64)

    # Get feature vectors
    df_filtered = feature_df.filter(pl.col("feature_id").is_in(all_ids))
    fid_to_idx = {int(r): i for i, r in enumerate(df_filtered["feature_id"].to_list())}

    valid_mask = [fid in fid_to_idx for fid in all_ids]
    valid_indices = [fid_to_idx[fid] for fid, v in zip(all_ids, valid_mask) if v]
    y = all_labels[valid_mask]
    w = all_weights[valid_mask]

    metrics_matrix = np.column_stack([
        df_filtered[metric].to_numpy() for metric in SVM_FEATURE_METRICS
    ])
    X = metrics_matrix[valid_indices]

    n_pos = int(np.sum(y == 1))
    n_neg = int(np.sum(y == 0))
    print(f"\nTraining: {len(y)} samples ({n_pos} wellExplained, {n_neg} needRevision), {X.shape[1]} features")
    print(f"  Click-weighted: {int(np.sum(w == CLICK_WEIGHT))}, Threshold-weighted: {int(np.sum(w == THRESHOLD_WEIGHT))}")

    feature_names = list(SVM_FEATURE_METRICS)

    # SVM
    print("\n--- SVM (RBF, C=1.0, gamma=scale) ---")
    svm_model, svm_scaler = train_svm(X, y, w)
    X_scaled = svm_scaler.transform(X)
    print(f"  Support vectors: {svm_model.n_support_} (total: {svm_model.n_support_.sum()})")
    compute_permutation_importance(svm_model, X_scaled, y, feature_names,
                                   "SVM Permutation Importance")

    # RF
    print("\n--- Random Forest ---")
    rf_model = train_rf(X_scaled, y, w)
    n_estimators = rf_model.n_estimators
    max_depth = rf_model.max_depth
    print(f"  n_estimators={n_estimators}, max_depth={max_depth}")
    print_importance_table(feature_names, rf_model.feature_importances_,
                          "RF Feature Importances (Gini)")
    compute_permutation_importance(rf_model, X_scaled, y, feature_names,
                                   "RF Permutation Importance")

    # MLP
    print("\n--- MLP (PyTorch, hidden=(32,16), alpha=0.01) ---")
    mlp_model = train_mlp(X_scaled, y, w)
    print(f"  Iterations: {mlp_model.n_iter_}")
    compute_permutation_importance(mlp_model, X_scaled, y, feature_names,
                                   "MLP Permutation Importance")


# ---------------------------------------------------------------------------
# Stage 3: Multi-class Classification (14D)
# ---------------------------------------------------------------------------

def run_stage3(data: dict, feature_df: pl.DataFrame):
    print("\n" + "=" * 70)
    print("STAGE 3: Failure Attribution (Multi-class Classification, 14D)")
    print("=" * 70)

    s3 = data["stage3_cause"]

    # Label mapping: JSON tag -> CAUSE_CATEGORIES index
    tag_to_label = {
        "missedSyntax": CAUSE_CATEGORIES.index("missed-N-gram"),       # 1
        "missedContext": CAUSE_CATEGORIES.index("missed-context"),      # 2
        "noisyActivation": CAUSE_CATEGORIES.index("noisy-activation"),  # 0
    }

    ids_labels_weights = []
    for tag, label in tag_to_label.items():
        for fid in s3[tag]["manual"]:
            ids_labels_weights.append((fid, label, CLICK_WEIGHT))
        for fid in s3[tag]["auto"]:
            ids_labels_weights.append((fid, label, THRESHOLD_WEIGHT))

    all_ids = [x[0] for x in ids_labels_weights]
    all_labels = np.array([x[1] for x in ids_labels_weights])
    all_weights = np.array([x[2] for x in ids_labels_weights], dtype=np.float64)

    # Get feature vectors
    df_filtered = feature_df.filter(pl.col("feature_id").is_in(all_ids))
    fid_to_idx = {int(r): i for i, r in enumerate(df_filtered["feature_id"].to_list())}

    valid_mask = [fid in fid_to_idx for fid in all_ids]
    valid_indices = [fid_to_idx[fid] for fid, v in zip(all_ids, valid_mask) if v]
    y = all_labels[valid_mask]
    w = all_weights[valid_mask]

    metrics_matrix = np.column_stack([
        df_filtered[metric].to_numpy() for metric in SVM_FEATURE_METRICS
    ])
    X = metrics_matrix[valid_indices]

    print(f"\nTraining: {len(y)} samples, {X.shape[1]} features")
    for i, cat in enumerate(CAUSE_CATEGORIES):
        count = int(np.sum(y == i))
        print(f"  {cat}: {count}")
    print(f"  Click-weighted: {int(np.sum(w == CLICK_WEIGHT))}, Threshold-weighted: {int(np.sum(w == THRESHOLD_WEIGHT))}")

    feature_names = list(SVM_FEATURE_METRICS)

    # SVM (multi-class OvO with OvR-shaped output)
    print("\n--- SVM (RBF, C=1.0, gamma=scale, OvO+OvR) ---")
    svm_model, svm_scaler = train_svm(X, y, w, multiclass=True)
    X_scaled = svm_scaler.transform(X)
    print(f"  Support vectors per class: {svm_model.n_support_} (total: {svm_model.n_support_.sum()})")
    print(f"  Classes: {svm_model.classes_}")
    compute_permutation_importance(svm_model, X_scaled, y, feature_names,
                                   "SVM Permutation Importance")

    # RF
    print("\n--- Random Forest ---")
    rf_model = train_rf(X_scaled, y, w)
    print(f"  n_estimators={rf_model.n_estimators}, max_depth={rf_model.max_depth}")
    print_importance_table(feature_names, rf_model.feature_importances_,
                          "RF Feature Importances (Gini)")
    compute_permutation_importance(rf_model, X_scaled, y, feature_names,
                                   "RF Permutation Importance")

    # MLP
    print("\n--- MLP (PyTorch, hidden=(32,16), alpha=0.01) ---")
    mlp_model = train_mlp(X_scaled, y, w)
    print(f"  Iterations: {mlp_model.n_iter_}")
    compute_permutation_importance(mlp_model, X_scaled, y, feature_names,
                                   "MLP Permutation Importance")


# ---------------------------------------------------------------------------
# Stage 1: Binary Pair Classification (12D)
# ---------------------------------------------------------------------------

def run_stage1(data: dict, feature_df: pl.DataFrame, pair_df: pl.DataFrame):
    print("\n" + "=" * 70)
    print("STAGE 1: Structural Soundness (Binary Pair Classification, 12D)")
    print("=" * 70)

    s1 = data["stage1_featureSplitting"]

    def parse_pairs(flat_ids):
        """Parse consecutive feature IDs into pairs: [a1,b1,a2,b2,...] -> [(a1,b1),(a2,b2),...]"""
        pairs = []
        for i in range(0, len(flat_ids) - 1, 2):
            pairs.append((flat_ids[i], flat_ids[i + 1]))
        return pairs

    # Build pairs with labels: monosemantic=1 (selected), incoherentSplitting=0 (rejected)
    pair_label_weight = []
    for a, b in parse_pairs(s1["monosemantic"]["manual"]):
        pair_label_weight.append((a, b, 1, CLICK_WEIGHT))
    for a, b in parse_pairs(s1["monosemantic"]["auto"]):
        pair_label_weight.append((a, b, 1, THRESHOLD_WEIGHT))
    for a, b in parse_pairs(s1["incoherentSplitting"]["manual"]):
        pair_label_weight.append((a, b, 0, CLICK_WEIGHT))
    for a, b in parse_pairs(s1["incoherentSplitting"]["auto"]):
        pair_label_weight.append((a, b, 0, THRESHOLD_WEIGHT))

    # Collect all unique feature IDs
    all_feature_ids = set()
    for a, b, _, _ in pair_label_weight:
        all_feature_ids.add(a)
        all_feature_ids.add(b)

    # Load intra-feature metrics (4D per feature)
    intra_df = feature_df.filter(
        pl.col("feature_id").is_in(list(all_feature_ids))
    ).select(["feature_id"] + list(SVM_PAIR_INTRA_METRICS))

    # Fill nulls
    for metric in SVM_PAIR_INTRA_METRICS:
        if metric in intra_df.columns:
            intra_df = intra_df.with_columns(pl.col(metric).fill_null(0.0))

    fid_to_idx = {int(r): i for i, r in enumerate(intra_df["feature_id"].to_list())}
    intra_matrix = np.column_stack([
        intra_df[metric].to_numpy() for metric in SVM_PAIR_INTRA_METRICS
    ])

    # Load inter-feature pair metrics
    pair_metrics_dict = {}
    for row in pair_df.iter_rows(named=True):
        pk = f"{row['feature_a']}-{row['feature_b']}"
        pair_metrics_dict[pk] = (
            float(row.get('inter_ngram_jaccard', 0.0) or 0.0),
            float(row.get('inter_semantic_sim', 0.0) or 0.0),
            float(row.get('decoder_sim', 0.0) or 0.0),
            float(row.get('feature_correlation', 0.0) or 0.0),
        )

    # Build 12D pair vectors
    X_list = []
    y_list = []
    w_list = []
    skipped = 0
    for a, b, label, weight in pair_label_weight:
        if a not in fid_to_idx or b not in fid_to_idx:
            skipped += 1
            continue

        a_vec = intra_matrix[fid_to_idx[a]]
        b_vec = intra_matrix[fid_to_idx[b]]

        pair_sum = a_vec + b_vec          # 4D
        pair_diff = np.abs(a_vec - b_vec)  # 4D

        # Inter-feature metrics (canonical key: smaller ID first)
        pk = f"{min(a, b)}-{max(a, b)}"
        inter = pair_metrics_dict.get(pk, (0.0, 0.0, 0.0, 0.0))

        # 12D: [A+B(4) | |A-B|(4) | inter_ngram | inter_semantic | decoder_sim | correlation]
        pair_vec = np.concatenate([pair_sum, pair_diff, np.array(inter)])
        X_list.append(pair_vec)
        y_list.append(label)
        w_list.append(weight)

    X = np.array(X_list)
    y = np.array(y_list)
    w = np.array(w_list, dtype=np.float64)

    n_pos = int(np.sum(y == 1))
    n_neg = int(np.sum(y == 0))
    print(f"\nTraining: {len(y)} pairs ({n_pos} monosemantic, {n_neg} incoherentSplitting), {X.shape[1]} features")
    if skipped > 0:
        print(f"  Skipped {skipped} pairs (missing feature metrics)")
    print(f"  Click-weighted: {int(np.sum(w == CLICK_WEIGHT))}, Threshold-weighted: {int(np.sum(w == THRESHOLD_WEIGHT))}")

    # Feature names for 12D pair vectors
    intra_names = list(SVM_PAIR_INTRA_METRICS)
    feature_names = (
        [f"{m}_sum" for m in intra_names] +
        [f"{m}_diff" for m in intra_names] +
        list(SVM_PAIR_INTER_METRICS)
    )

    # SVM
    print("\n--- SVM (RBF, C=1.0, gamma=scale) ---")
    svm_model, svm_scaler = train_svm(X, y, w)
    X_scaled = svm_scaler.transform(X)
    print(f"  Support vectors: {svm_model.n_support_} (total: {svm_model.n_support_.sum()})")
    compute_permutation_importance(svm_model, X_scaled, y, feature_names,
                                   "SVM Permutation Importance")

    # RF
    print("\n--- Random Forest ---")
    rf_model = train_rf(X_scaled, y, w)
    print(f"  n_estimators={rf_model.n_estimators}, max_depth={rf_model.max_depth}")
    print_importance_table(feature_names, rf_model.feature_importances_,
                          "RF Feature Importances (Gini)")
    compute_permutation_importance(rf_model, X_scaled, y, feature_names,
                                   "RF Permutation Importance")

    # MLP
    print("\n--- MLP (PyTorch, hidden=(32,16), alpha=0.01) ---")
    mlp_model = train_mlp(X_scaled, y, w)
    print(f"  Iterations: {mlp_model.n_iter_}")
    compute_permutation_importance(mlp_model, X_scaled, y, feature_names,
                                   "MLP Permutation Importance")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Loading data...")
    data = load_json(JSON_PATH)
    feature_df = load_feature_metrics()
    pair_df = load_pair_metrics()
    print(f"  Feature metrics: {len(feature_df)} features, {len(SVM_FEATURE_METRICS)} metrics")
    print(f"  Pair metrics: {len(pair_df)} pairs")
    print(f"  JSON exported at: {data['exportedAt']}")

    run_stage1(data, feature_df, pair_df)
    run_stage2(data, feature_df)
    run_stage3(data, feature_df)

    print("\n" + "=" * 70)
    print("Done.")
    print("=" * 70)


if __name__ == "__main__":
    main()
