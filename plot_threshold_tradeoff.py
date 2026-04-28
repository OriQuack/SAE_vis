#!/usr/bin/env python3
"""Plot the features-with-clusters vs intra-cluster similarity trade-off."""

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

thresholds_sim = [0.70, 0.65, 0.60, 0.55, 0.50, 0.45, 0.40, 0.35, 0.30]
coverage_pct  = [23.7, 38.0, 53.5, 68.2, 80.7, 89.9, 96.0, 99.1, 99.8]
intra_sim     = [0.7672, 0.7244, 0.6851, 0.6449, 0.6022, 0.5594, 0.5179, 0.4843, 0.4647]

fig, ax1 = plt.subplots(figsize=(8, 4.5))

c1 = "#4e79a7"
c2 = "#f28e2b"

# Features with clusters (left axis)
ln1 = ax1.plot(thresholds_sim, coverage_pct, "o-", color=c1, linewidth=2, markersize=7,
               label="Features with Clusters (%) \u2191", zorder=3)
ax1.set_xlabel("Agglomerative Threshold (cosine similarity)", fontsize=11)
ax1.set_ylabel("Features with Clusters (%)", color=c1, fontsize=11)
ax1.tick_params(axis="y", labelcolor=c1)
ax1.set_ylim(0, 110)

# Intra-cluster similarity (right axis)
ax2 = ax1.twinx()
ln2 = ax2.plot(thresholds_sim, intra_sim, "s--", color=c2, linewidth=2, markersize=7,
               label="Intra-Cluster Similarity \u2191", zorder=3)
ax2.set_ylabel("Mean Intra-Cluster Cosine Similarity", color=c2, fontsize=11, labelpad=15)
ax2.tick_params(axis="y", labelcolor=c2)
ax2.set_ylim(0.35, 0.85)

# Current threshold marker
ax1.axvline(x=0.50, color="#888888", linestyle=":", linewidth=1.5, alpha=0.7)  # 0.50 similarity = 0.50 distance

# Combined legend
lns = ln1 + ln2
labs = [str(l.get_label()) for l in lns]
ax1.legend(lns, labs, loc="center left", fontsize=9, framealpha=0.9)

ax1.xaxis.set_major_locator(mticker.MultipleLocator(0.05))
ax1.grid(axis="x", alpha=0.3)
ax1.set_title("Agglomerative Threshold Trade-off", fontsize=12, pad=10)

fig.tight_layout()
fig.savefig("threshold_tradeoff.png", dpi=180, bbox_inches="tight")
print("Saved threshold_tradeoff.png")
