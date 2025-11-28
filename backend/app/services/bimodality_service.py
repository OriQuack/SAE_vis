"""
Bimodality detection service using Hartigan's Dip Test and GMM + BIC.
"""
import numpy as np
from typing import Tuple
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class GMMComponent:
    """Single GMM component parameters."""
    mean: float
    variance: float
    weight: float


@dataclass
class BimodalityResult:
    """Raw bimodality detection data - state determined by frontend."""
    dip_pvalue: float                    # p-value from Hartigan's Dip Test
    bic_k1: float                        # BIC for 1-component GMM
    bic_k2: float                        # BIC for 2-component GMM
    gmm_components: Tuple[GMMComponent, GMMComponent]  # 2 components sorted by mean (ascending)
    sample_size: int                     # Number of data points used


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
        """Detect bimodality using Dip Test and GMM + BIC. Returns raw data for frontend state determination."""
        values = np.asarray(values).flatten()
        sample_size = len(values)

        if sample_size < 10:
            # Return default values for insufficient data
            return BimodalityResult(
                dip_pvalue=1.0,
                bic_k1=0.0,
                bic_k2=0.0,
                gmm_components=(
                    GMMComponent(mean=0.0, variance=1.0, weight=1.0),
                    GMMComponent(mean=0.0, variance=1.0, weight=0.0)
                ),
                sample_size=sample_size
            )

        # 1. Hartigan's Dip Test
        _, dip_pvalue = self._run_dip_test(values)

        # 2. GMM + BIC comparison with full component data
        bic_k1, bic_k2, gmm_components = self._run_gmm_bic(values)

        return BimodalityResult(
            dip_pvalue=dip_pvalue,
            bic_k1=bic_k1,
            bic_k2=bic_k2,
            gmm_components=gmm_components,
            sample_size=sample_size
        )

    def _run_dip_test(self, values: np.ndarray) -> Tuple[float, float]:
        """Run Hartigan's Dip Test."""
        try:
            import diptest
            dip_stat, pvalue = diptest.diptest(values)
            return float(dip_stat), float(pvalue)
        except Exception as e:
            logger.warning(f"Dip test failed: {e}")
            return 0.0, 1.0

    def _run_gmm_bic(self, values: np.ndarray) -> Tuple[float, float, Tuple[GMMComponent, GMMComponent]]:
        """Run GMM with 1 and 2 components, return BIC values and component parameters.

        Returns:
            Tuple of (bic_k1, bic_k2, components) where components are sorted by mean (ascending)
        """
        try:
            from sklearn.mixture import GaussianMixture
            X = values.reshape(-1, 1)
            gmm1 = GaussianMixture(n_components=1, random_state=42).fit(X)
            gmm2 = GaussianMixture(n_components=2, random_state=42).fit(X)

            bic_k1 = float(gmm1.bic(X))
            bic_k2 = float(gmm2.bic(X))

            # Extract component parameters and sort by mean (ascending)
            means = gmm2.means_.flatten()
            variances = gmm2.covariances_.flatten()
            weights = gmm2.weights_

            # Sort indices by mean
            sort_idx = np.argsort(means)

            components = tuple(
                GMMComponent(
                    mean=float(means[i]),
                    variance=float(variances[i]),
                    weight=float(weights[i])
                )
                for i in sort_idx
            )

            return bic_k1, bic_k2, components
        except Exception as e:
            logger.warning(f"GMM fitting failed: {e}")
            return 0.0, 0.0, (
                GMMComponent(mean=0.0, variance=1.0, weight=1.0),
                GMMComponent(mean=0.0, variance=1.0, weight=0.0)
            )
