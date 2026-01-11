Active Learning Sample Selection Strategies

1. Uncertainty-Based Strategies

The most intuitive approach - select samples the model is most uncertain about.
┌──────────────────┬───────────────────────────────────────────────────────────────┐
│      Method      │                          Description                          │
├──────────────────┼───────────────────────────────────────────────────────────────┤
│ Least Confidence │ Select samples with lowest predicted class probability        │
├──────────────────┼───────────────────────────────────────────────────────────────┤
│ Margin Sampling  │ Select samples with smallest margin between top-2 predictions │
├──────────────────┼───────────────────────────────────────────────────────────────┤
│ Entropy Sampling │ Select samples with highest prediction entropy                │
└──────────────────┴───────────────────────────────────────────────────────────────┘
For SVM specifically: Margin sampling selects samples closest to the decision boundary - the https://link.springer.com/chapter/10.1007/978-3-662-44848-9_14 approach provides theoretical justification for this.

Limitation: Can select redundant samples that are all uncertain but similar to each other.

---
2. Diversity-Based Strategies

Ensure selected samples cover the input space well.
┌────────────────────┬─────────────────────────────────────────────────────────────────────┐
│       Method       │                             Description                             │
├────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ CoreSet (k-Center) │ Greedy selection minimizing maximum distance to any unlabeled point │
├────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ Clustering-based   │ Sample from different clusters to ensure coverage                   │
├────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ Random             │ Simple baseline that surprisingly works well in some regimes        │
└────────────────────┴─────────────────────────────────────────────────────────────────────┘
https://arxiv.org/abs/1708.00489 (ICLR 2018): Frames active learning as core-set selection using k-Center greedy algorithm. Finds points that maximize coverage of the embedding space.

Limitation: May select outliers; ignores model uncertainty entirely.

---
3. Hybrid Strategies (SOTA)

https://arxiv.org/abs/1906.03671 (ICLR 2020) - Current gold standard:
- Uses gradient embeddings from the model's last layer
- Gradient magnitude captures uncertainty
- Gradient direction captures semantic content
- Applies k-means++ on these embeddings for diverse selection
- No hyperparameters to tune for uncertainty/diversity tradeoff

How it works:
1. Compute hypothesized loss gradients for unlabeled samples
2. Gradient magnitude = uncertainty, direction = content
3. Run k-means++ seeding on gradient space to get batch

---
4. Query by Committee (Ensemble)

Train multiple models and select samples where they disagree most.

- Vote Entropy: Measure disagreement in predicted labels
- Consensus Entropy: Measure entropy of averaged predictions
- KL Divergence: Compare individual predictions to consensus

Practical implementations include https://www.cs.utexas.edu/~ml/papers/decorate-icml-04.pdf.

---
5. Cold Start Problem (Critical for Your Use Case)

Key insight from https://proceedings.mlr.press/v162/hacohen22a/hacohen22a.pdf:
Low and high budget regimes are qualitatively different and require opposite strategies.

┌───────────────────────────┬──────────────────────────────────┐
│          Budget           │          Best Strategy           │
├───────────────────────────┼──────────────────────────────────┤
│ Low budget (few labels)   │ Select "easy," typical samples   │
├───────────────────────────┼──────────────────────────────────┤
│ High budget (many labels) │ Select "hard," uncertain samples │
└───────────────────────────┴──────────────────────────────────┘
Why uncertainty fails with few labels:
- Models overfit to small training sets
- Predictions become overconfident
- Uncertainty signal is noisy

Solutions for cold start:
1. https://avihu111.github.io/Active-Learning/: Select typical (high-density) samples instead of uncertain ones
2. https://www.sciencedirect.com/science/article/abs/pii/S0020025522011768: Representative sampling without needing initial labels
3. Contrastive learning: Use self-supervised embeddings to find diverse, typical samples

---
6. Recent Advances (2024-2025)

https://arxiv.org/abs/2502.11767 (2025):
- Using LLMs for demonstration selection in few-shot learning
- Strategic sample selection for fine-tuning

https://ieeexplore.ieee.org/document/10667005 (2024):
- Handles mixed in/out-of-distribution data
- Balances "contrastive confidence" and "historical divergence"

https://arxiv.org/html/2506.02011 (2025):
- Adaptive selection based on informativeness relative to entire dataset
- Redundancy reduction using sample-wise similarity

---
Practical Recommendations for Your System

Given your SVM-based tagging workflow:

1. Initial phase (few tags): Use diversity-based selection
- Cluster the embedding space
- Sample representatives from each cluster
- Don't trust uncertainty when you have <10 labels per class
2. After sufficient tags: Switch to uncertainty-based
- Use distance from SVM decision boundary
- Your current margin histogram visualization aligns with this
3. Batch selection: Consider BADGE-style hybrid
- Combine margin distance (uncertainty) with diversity
- Use k-means++ on features weighted by margin distance
4. For your bimodality detection:
- High bimodality = natural clusters exist → diversity sampling may help
- Low bimodality = gradual distribution → margin sampling more appropriate

---
Sources

- https://www.mdpi.com/2227-7390/11/4/820
- https://spj.science.org/doi/10.34133/icomputing.0058
- https://arxiv.org/abs/1906.03671
- https://arxiv.org/abs/1708.00489
- https://proceedings.mlr.press/v162/hacohen22a/hacohen22a.pdf
- https://www.sciencedirect.com/science/article/abs/pii/S0020025522011768
- https://arxiv.org/abs/2502.11767
- https://lilianweng.github.io/posts/2022-02-20-active-learning/