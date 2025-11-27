"""
Bimodality detection service using Hartigan's Dip Test and GMM + BIC.
"""
import numpy as np
from typing import Tuple
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class BimodalityResult:
    """Minimal bimodality detection result."""
    state: str          # "bimodal", "unimodal", "likely_bimodal", "likely_unimodal", "insufficient_data"
    dip_pvalue: float   # p-value from Hartigan's Dip Test
    gmm_better_k: int   # 1 or 2 (which GMM fits better)
    gmm_weights: Tuple[float, float]  # Component weights from 2-component GMM (sorted descending)


class BimodalityService:
    """Service for detecting bimodality in distributions."""

    def __init__(self, dip_alpha: float = 0.05, min_component_weight: float = 0.1):
        """
        Initialize bimodality service.

        Args:
            dip_alpha: Significance level for dip test (default 0.05)
            min_component_weight: Minimum weight for each GMM component to consider k=2 (default 0.1)
        """
        self.dip_alpha = dip_alpha
        self.min_component_weight = min_component_weight

    def detect_bimodality(self, values: np.ndarray) -> BimodalityResult:
        """Detect bimodality using Dip Test and GMM + BIC."""
        values = np.asarray(values).flatten()

        if len(values) < 10:
            return BimodalityResult(state="insufficient_data", dip_pvalue=1.0, gmm_better_k=1, gmm_weights=(1.0, 0.0))

        # 1. Hartigan's Dip Test
        _, dip_pvalue = self._run_dip_test(values)
        dip_bimodal = dip_pvalue < self.dip_alpha

        # 2. GMM + BIC comparison (also returns weights)
        gmm_better_k, gmm_weights = self._run_gmm_bic(values)
        gmm_bimodal = gmm_better_k == 2

        # Determine state (5 detailed states)
        if dip_bimodal and gmm_bimodal:
            state = "bimodal"
        elif not dip_bimodal and not gmm_bimodal:
            state = "unimodal"
        elif not dip_bimodal and gmm_bimodal:
            state = "likely_bimodal"
        else:  # dip_bimodal and not gmm_bimodal
            state = "likely_unimodal"

        return BimodalityResult(state=state, dip_pvalue=dip_pvalue, gmm_better_k=gmm_better_k, gmm_weights=gmm_weights)

    def _run_dip_test(self, values: np.ndarray) -> Tuple[float, float]:
        """Run Hartigan's Dip Test."""
        try:
            import diptest
            dip_stat, pvalue = diptest.diptest(values)
            return float(dip_stat), float(pvalue)
        except Exception as e:
            logger.warning(f"Dip test failed: {e}")
            return 0.0, 1.0

    def _run_gmm_bic(self, values: np.ndarray) -> Tuple[int, Tuple[float, float]]:
        """Run GMM with 1 and 2 components, return which k fits better and weights.

        k=2 is only preferred if:
        1. BIC(k=2) < BIC(k=1)
        2. Both components have weight >= min_component_weight (default 10%)

        This prevents k=2 being chosen when there's one dominant mode with a small tail.

        Returns:
            Tuple of (k, weights) where weights are sorted descending (larger first)
        """
        try:
            from sklearn.mixture import GaussianMixture
            X = values.reshape(-1, 1)
            gmm1 = GaussianMixture(n_components=1, random_state=42).fit(X)
            gmm2 = GaussianMixture(n_components=2, random_state=42).fit(X)

            # Get weights sorted descending (larger component first)
            weights = tuple(sorted(gmm2.weights_, reverse=True))

            # Check if k=2 has better BIC
            if gmm2.bic(X) >= gmm1.bic(X):
                return 1, weights

            # Check if both components are substantial (weight balance)
            min_weight = min(gmm2.weights_)
            if min_weight < self.min_component_weight:
                return 1, weights

            return 2, weights
        except Exception:
            return 1, (1.0, 0.0)
