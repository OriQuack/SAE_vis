"""
Show raw (pre-normalization) distributions for each highlight score component
and annotate the elbow/knee point on each.
"""

import numpy as np
import polars as pl
import matplotlib.pyplot as plt
from kneed import KneeLocator

PARQUET = "data/output/activation_highlights.parquet"

CONTEXT_PERCENTILE = 75      # Top 25% for context components


def flatten_column(df: pl.DataFrame, col: str) -> np.ndarray:
    """Explode a list column and return flat numpy array, dropping nulls."""
    return df.select(pl.col(col).explode()).drop_nulls().to_numpy().ravel()


def extract_nested_field(df: pl.DataFrame, list_col: str, field: str) -> np.ndarray:
    """Extract a numeric field from a list-of-structs column using Polars native ops."""
    return (
        df.select(pl.col(list_col).explode().struct.field(field))
        .drop_nulls()
        .to_numpy()
        .ravel()
    )


def find_elbow(values: np.ndarray) -> float:
    """Find elbow on the sorted descending curve of values."""
    sorted_vals = np.sort(values)[::-1]
    n = len(sorted_vals)
    if n > 10_000:
        idx = np.linspace(0, n - 1, 10_000, dtype=int)
        sorted_vals = sorted_vals[idx]
    x = np.arange(len(sorted_vals))
    kl = KneeLocator(x, sorted_vals, curve="convex", direction="decreasing")
    if kl.knee is not None:
        return float(sorted_vals[kl.knee])
    return float("nan")


def main():
    print("Loading parquet...")
    df = pl.read_parquet(PARQUET)
    print(f"  {df.shape[0]:,} rows, {df.shape[1]} columns")
    print(f"  columns: {df.columns}\n")

    all_names = []
    all_arrays = []

    # Per-token context scores
    for col in ["c_discriminative", "c_token_idf"]:
        if col in df.columns:
            all_names.append(col)
            all_arrays.append(flatten_column(df, col))

    # disc * idf product
    if "c_discriminative" in df.columns and "c_token_idf" in df.columns:
        disc = flatten_column(df, "c_discriminative")
        idf = flatten_column(df, "c_token_idf")
        min_len = min(len(disc), len(idf))
        all_names.append("disc × idf")
        all_arrays.append(disc[:min_len] * idf[:min_len])

    # Span set avg_sim (from context_span_sets)
    if "context_span_sets" in df.columns:
        sims = extract_nested_field(df, "context_span_sets", "avg_sim")
        if len(sims) > 0:
            all_names.append("span avg_sim")
            all_arrays.append(sims)

    # Centroid span scores (from context_centroid_spans)
    if "context_centroid_spans" in df.columns:
        scores = extract_nested_field(df, "context_centroid_spans", "score")
        if len(scores) > 0:
            all_names.append("centroid score")
            all_arrays.append(scores)

    # Syntax ngram jaccard (from syntax_ngram_sets)
    if "syntax_ngram_sets" in df.columns:
        jaccards = extract_nested_field(df, "syntax_ngram_sets", "jaccard")
        if len(jaccards) > 0:
            all_names.append("ngram jaccard")
            all_arrays.append(jaccards)

    # Dep/AST relation rates
    for col, label in [("syntax_dep_sets", "dep rate"), ("syntax_ast_sets", "ast rate")]:
        if col in df.columns:
            rates = extract_nested_field(df, col, "rate")
            if len(rates) > 0:
                all_names.append(label)
                all_arrays.append(rates)

    if not all_names:
        print("No data to plot!")
        return

    # Compute elbows and thresholds
    elbows = {}
    thresholds = {}
    for name, arr in zip(all_names, all_arrays):
        elbow = find_elbow(arr)
        elbows[name] = elbow
        thr = float(np.percentile(arr, CONTEXT_PERCENTILE))
        thresholds[name] = thr
        pct_above = (arr > thr).sum() / len(arr) * 100
        print(f"{name:20s}  n={len(arr):>10,}  elbow={elbow:.4f}  p75={thr:.4f}  ({pct_above:.1f}% above)")

    # Plot
    ncols = 3
    nrows = (len(all_names) + ncols - 1) // ncols
    fig, axes = plt.subplots(nrows, ncols, figsize=(6 * ncols, 3.5 * nrows))
    axes = np.array(axes).ravel()

    for i, (name, arr) in enumerate(zip(all_names, all_arrays)):
        ax = axes[i]
        if "ngram" in name or "rate" in name:
            clipped = arr
            lo, hi = arr.min(), arr.max()
        else:
            lo, hi = np.percentile(arr, [0.5, 99.5])
            clipped = arr[(arr >= lo) & (arr <= hi)]
        counts, _, _ = ax.hist(clipped, bins=100, color="#4e79a7", edgecolor="none", alpha=0.8)
        elbow = elbows[name]
        if not np.isnan(elbow) and lo <= elbow <= hi:
            ax.axvline(elbow, color="#e15759", lw=1.5, ls="--", label=f"elbow={elbow:.4f}")
        thr = thresholds[name]
        if lo <= thr <= hi:
            pct = (arr > thr).sum() / len(arr) * 100
            ax.axvline(thr, color="#2ca02c", lw=2, ls="-", label=f"p75={thr:.4f} ({pct:.0f}%↑)")
        ax.legend(fontsize=7, loc="upper right")
        sorted_counts = np.sort(counts)[::-1]
        if len(sorted_counts) > 1 and sorted_counts[0] > 5 * sorted_counts[1]:
            ax.set_ylim(0, sorted_counts[1] * 1.3)
        ax.set_title(name, fontsize=10, fontweight="bold")
        ax.set_ylabel("count")
        ax.tick_params(labelsize=8)

    for j in range(len(all_names), len(axes)):
        axes[j].set_visible(False)

    fig.suptitle("Highlight Score Distributions — Elbow (red) vs P75 (green)", fontsize=13, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.96))

    out = "highlight_distributions.png"
    fig.savefig(out, dpi=150)
    print(f"\nSaved → {out}")
    plt.show()


if __name__ == "__main__":
    main()
