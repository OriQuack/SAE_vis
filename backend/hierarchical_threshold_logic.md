
1. System Architecture Overview

The hierarchical threshold system is a sophisticated multi-level configuration management system that allows precise control over
feature classification thresholds at different levels of granularity. It operates on a 4-tier priority hierarchy:

1. Individual Node Overrides (Highest Priority)
2. Parent Group Overrides
3. Feature/Condition Groups
4. Global Thresholds (Fallback)

2. HierarchicalThresholds Structure Analysis

Core Components (backend/app/models/common.py:100-213):

class HierarchicalThresholds(BaseModel):
  global_thresholds: Thresholds                                    # Base defaults
  feature_splitting_groups: Optional[Dict[str, float]]             # By condition
  semantic_distance_groups: Optional[Dict[str, float]]             # By splitting parent
  score_agreement_groups: Optional[Dict[str, Dict[str, float]]]    # By semantic parent
  individual_node_groups: Optional[Dict[str, Dict[str, float]]]    # Individual overrides

Hierarchy Levels Explained:

1. Global Thresholds: Default values used when no overrides exist
2. Feature Splitting Groups: Thresholds by condition (e.g., "high_confidence")
3. Semantic Distance Groups: Thresholds grouped by splitting parent (e.g., "split_true", "split_false")
4. Score Agreement Groups: Thresholds grouped by semantic distance parent (e.g., "split_true_semdist_high")
5. Individual Node Groups: Specific overrides for individual nodes (highest priority)

3. Data Flow Pipeline

Complete Request Processing Flow:

API Request → Validation → Threshold Resolution → Feature Classification → Response
    ↓              ↓              ↓                     ↓                ↓
SankeyRequest → Auto-Convert → Priority Lookup → Apply Thresholds → SankeyData

Detailed Step Analysis:

Step 1: API Request Reception (backend/app/models/requests.py:22-84)

class SankeyRequest(BaseModel):
  filters: Filters
  thresholds: Thresholds                                    # Legacy format
  nodeThresholds: Optional[Dict[str, Dict[str, float]]]     # Legacy overrides
  hierarchicalThresholds: Optional[HierarchicalThresholds] # New system

Step 2: Auto-Conversion Validator (backend/app/models/requests.py:41-84)

The system maintains backward compatibility through an intelligent validator:

@validator('hierarchicalThresholds', pre=True, always=True)
def set_hierarchical_thresholds(cls, v, values):
  if v is None and 'thresholds' in values:
      # Convert legacy format to hierarchical
      hierarchical = HierarchicalThresholds(global_thresholds=values['thresholds'])

      if node_thresholds := values.get('nodeThresholds'):
          # Parse legacy node structure and convert to hierarchical groups
          semantic_distance_groups = {}
          score_agreement_groups = {}

          # Node ID parsing logic extracts parent relationships
          for node_id, metrics in node_thresholds.items():
              if "_semdist_" in node_id and "_agree_" not in node_id:
                  splitting_parent = node_id.split("_semdist_")[0]  # "split_true"
                  semantic_distance_groups[splitting_parent] = metrics["semdist_mean"]

Key Insight: Legacy nodeThresholds are automatically parsed and converted to the appropriate hierarchical groups based on node ID
naming conventions.

Step 3: Threshold Resolution Logic (backend/app/models/common.py:164-213)

Three specialized resolution methods handle different threshold types:

A. Feature Splitting Thresholds:
def get_feature_splitting_threshold(self, condition: str = "default") -> float:
  if self.feature_splitting_groups and condition in self.feature_splitting_groups:
      return self.feature_splitting_groups[condition]
  return self.global_thresholds.feature_splitting

B. Semantic Distance Thresholds (Node ID parsing):
def get_semdist_threshold_for_node(self, node_id: str) -> float:
  # Priority 1: Individual node override
  if individual_override_exists:
      return individual_override_value

  # Priority 2: Parent group override
  if "_semdist_" in node_id:
      splitting_parent = node_id.split("_semdist_")[0]  # Extract "split_true"
      if splitting_parent in self.semantic_distance_groups:
          return self.semantic_distance_groups[splitting_parent]

  # Priority 3: Global fallback
  return self.global_thresholds.semdist_mean

C. Score Thresholds (Multi-metric resolution):
def get_score_thresholds_for_node(self, node_id: str) -> Dict[str, float]:
  result = {  # Start with global defaults
      "score_fuzz": self.global_thresholds.score_fuzz,
      "score_simulation": self.global_thresholds.score_simulation,
      "score_detection": self.global_thresholds.score_detection
  }

  # Apply parent group overrides
  if "_agree_" in node_id:
      semantic_parent = "_".join(node_id.split("_")[:-2])  # Remove "_agree_X"
      if semantic_parent in self.score_agreement_groups:
          result.update(self.score_agreement_groups[semantic_parent])

  # Apply individual node overrides (highest priority)
  if individual_overrides_exist:
      result.update(individual_overrides)

  return result

4. Node ID Naming Convention System

The hierarchical system uses structured node naming to determine parent relationships:

Root Level:              "root"
Feature Splitting:       "split_true", "split_false"
Semantic Distance:       "split_true_semdist_high", "split_false_semdist_low"
Score Agreement:         "split_true_semdist_high_agree_all", "split_false_semdist_low_agree_partial"

Parent Extraction Logic:
- Semantic Distance Node: "split_true_semdist_high" → Parent: "split_true"
- Score Agreement Node: "split_true_semdist_high_agree_all" → Parent: "split_true_semdist_high"

5. Feature Classification Integration

Threshold Application (backend/app/services/feature_classifier.py):

The resolved thresholds are applied during feature classification:

def classify_with_hierarchical_thresholds(features_df, hierarchical_thresholds):
  for node_id in get_all_nodes():
      # Get resolved thresholds for this specific node
      semdist_threshold = hierarchical_thresholds.get_semdist_threshold_for_node(node_id)
      score_thresholds = hierarchical_thresholds.get_score_thresholds_for_node(node_id)

      # Apply node-specific thresholds to features
      classify_features_for_node(features_df, node_id, semdist_threshold, score_thresholds)

6. API Endpoint Integration

Comparison Endpoint Example (backend/app/api/endpoints/comparison.py:89-104):

async def get_comparison_data(request: ComparisonRequest):
  # Extract resolved thresholds from hierarchical system
  left_thresholds = {
      "semdist_mean": left_config.hierarchicalThresholds.global_thresholds.semdist_mean,
      "score_fuzz": left_config.hierarchicalThresholds.global_thresholds.score_fuzz,
      "score_detection": left_config.hierarchicalThresholds.global_thresholds.score_detection,
      "score_simulation": left_config.hierarchicalThresholds.global_thresholds.score_simulation
  }

  # Pass to data service for processing
  return await data_service.get_comparison_data(
      left_filters=left_config.filters,
      left_thresholds=left_thresholds,
      right_filters=right_config.filters,
      right_thresholds=right_thresholds
  )

7. Key Benefits of Hierarchical System

1. Flexibility: Different threshold strategies for different node types
2. Maintainability: Clear priority hierarchy prevents conflicts
3. Backward Compatibility: Legacy nodeThresholds automatically converted
4. Scalability: Supports complex multi-level feature classification
5. Type Safety: Full Pydantic validation throughout the system

8. Frontend Integration Points

Current Frontend Support (frontend/src/types.ts:17-23):
export interface Thresholds {
feature_splitting: number
semdist_mean: number
score_fuzz: number      // Individual score threshold
score_detection: number // Individual score threshold
score_simulation: number // Individual score threshold (-1 to 1)
}

Future Enhancement: Frontend could be extended to support hierarchical threshold configuration through advanced UI controls.

9. System Strengths

- Priority-Based Resolution: Clear precedence rules prevent ambiguity
- Automatic Legacy Conversion: Seamless migration path from old system
- Node-Specific Control: Fine-grained threshold management per node
- Extensible Architecture: Easy to add new threshold group types
- Complete Type Safety: Full Pydantic validation and TypeScript integration

This hierarchical threshold system represents a sophisticated configuration management solution that balances flexibility,
maintainability, and backward compatibility while providing the precision needed for advanced SAE feature analysis workflows.