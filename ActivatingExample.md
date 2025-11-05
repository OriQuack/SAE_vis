 Comprehensive Implementation Plan: Activation Example Display with Highlighting

 Overview

 Implement activation example visualization in both DecoderSimilarityTable and main TablePanel, showing
 token-level activation highlighting with similarity-based borders. Uses existing parquet data for efficient
 retrieval.

 ---
 Phase 1: Backend - New API Endpoint (Priority: HIGH)

 1.1 Update Data Service (backend/app/services/data_service.py)

 Add lazy loading for activation data:
 class DataService:
     def __init__(self):
         # Existing
         self._df_lazy = pl.scan_parquet("features.parquet")

         # NEW: Add activation data sources
         self._activation_examples = pl.scan_parquet("activation_examples.parquet")
         self._activation_similarity = pl.scan_parquet("activation_example_similarity.parquet")

 Add method to fetch activation examples (Lines ~210):
 def get_activation_examples(self, feature_ids: List[int]) -> Dict[int, Dict]:
     """
     Fetch activation examples with similarity metrics for features.
     Returns top example per quantile with token positions and similarities.
     
     Performance: Batch fetch 10-100x faster than individual queries
     """
     # Load similarity metrics (2.2 MB file, 16K rows)
     similarity_df = self._activation_similarity.filter(
         pl.col("feature_id").is_in(feature_ids)
     ).collect()

     # Extract sampled prompt_ids per feature (8 per feature, 2 per quantile)
     prompt_ids_by_feature = {}
     for row in similarity_df.iter_rows(named=True):
         prompt_ids_by_feature[row["feature_id"]] = {
             "prompt_ids": row["prompt_ids_analyzed"],  # List[8]
             "semantic_sim": row["avg_pairwise_semantic_similarity"],
             "jaccard_sims": row["ngram_jaccard_similarity"],  # [2g, 3g, 4g]
             "quantile_boundaries": row["quantile_boundaries"]  # [q1, q2, q3]
         }

     # Batch fetch activation examples (avoids N individual queries)
     all_prompt_ids = set()
     for data in prompt_ids_by_feature.values():
         all_prompt_ids.update(data["prompt_ids"])

     examples_df = self._activation_examples.filter(
         pl.col("prompt_id").is_in(list(all_prompt_ids))
     ).collect()

     # Organize by feature_id → quantile → example
     result = {}
     for feature_id, data in prompt_ids_by_feature.items():
         # Group 8 prompts into 4 quantiles (2 per quantile)
         # Take first example from each quantile for default view
         quantile_examples = self._organize_by_quantile(
             examples_df.filter(pl.col("feature_id") == feature_id),
             data["quantile_boundaries"]
         )

         result[feature_id] = {
             "quantile_examples": quantile_examples,  # 4 quantiles
             "semantic_similarity": float(data["semantic_sim"]),
             "max_jaccard": float(max(data["jaccard_sims"])),
             "pattern_type": self._compute_pattern_type(
                 data["semantic_sim"],
                 max(data["jaccard_sims"])
             )
         }

     return result

 def _compute_pattern_type(self, semantic_sim: float, max_jaccard: float) -> str:
     """Categorize based on 0.3 threshold"""
     has_semantic = semantic_sim > 0.3
     has_lexical = max_jaccard > 0.3

     if has_semantic and has_lexical:
         # Use higher value to determine type
         return "Semantic" if semantic_sim > max_jaccard else "Lexical"
     elif has_semantic:
         return "Semantic"
     elif has_lexical:
         return "Lexical"
     else:
         return "None"

 1.2 Create New API Endpoint (backend/app/api/activation_examples.py - NEW FILE)

 from fastapi import APIRouter, HTTPException
 from pydantic import BaseModel
 from typing import List, Dict

 router = APIRouter()

 class ActivationExamplesRequest(BaseModel):
     feature_ids: List[int]  # Batch request

 class ActivationExamplesResponse(BaseModel):
     examples: Dict[int, Dict]  # feature_id → data

 @router.post("/api/activation-examples")
 async def get_activation_examples(request: ActivationExamplesRequest):
     """
     Fetch activation examples with highlighting metadata.
     
     Returns for each feature:
     - 4 quantile examples (Q1, Q2, Q3, Q4)
     - Token strings and activation values
     - Max activation position per example
     - Semantic and Jaccard similarity scores
     - Pattern type (None/Semantic/Lexical)
     """
     try:
         data_service = get_data_service()
         examples = data_service.get_activation_examples(request.feature_ids)
         return ActivationExamplesResponse(examples=examples)
     except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

 Performance Optimization:
 - Batch fetching: Load all needed prompt_ids in one query (10-100x faster)
 - Lazy evaluation: Only materialized when feature selected
 - Small data: 2.2 MB similarity file + subset of 257 MB examples file

 ---
 Phase 2: Frontend Types & API Client

 2.1 Update Types (frontend/src/types.ts)

 // Add to FeatureTableRow interface
 export interface FeatureTableRow {
   feature_id: number
   decoder_similarity?: Array<{...}>
   explainers: Record<string, ExplainerScoreData>

   // NEW: Activation examples (lazy loaded)
   activation_examples?: ActivationExamples
 }

 export interface ActivationExamples {
   quantile_examples: QuantileExample[]  // 4 quantiles
   semantic_similarity: number           // 0-1
   max_jaccard: number                  // 0-1
   pattern_type: 'None' | 'Semantic' | 'Lexical'
 }

 export interface QuantileExample {
   quantile_index: number               // 0-3 (Q1-Q4)
   prompt_id: number
   prompt_tokens: string[]              // All tokens (127)
   activation_pairs: Array<{
     token_position: number
     activation_value: number
   }>
   max_activation: number
   max_activation_position: number      // Where to center highlighting
 }

 // For token rendering with activation strength
 export interface ActivationToken {
   text: string
   position: number
   activation_value?: number            // If activated
   is_max?: boolean                    // Is this the max activation token?
 }

 2.2 Update API Client (frontend/src/api.ts)

 export async function getActivationExamples(
   featureIds: number[]
 ): Promise<Record<number, ActivationExamples>> {
   const response = await apiClient.post('/api/activation-examples', {
     feature_ids: featureIds
   })
   return response.data.examples
 }

 ---
 Phase 3: Frontend Utilities for Token Highlighting

 3.1 Create Utility Functions (frontend/src/lib/activation-utils.ts - NEW FILE)

 import { scaleLinear } from 'd3-scale'

 /**
  * Extract N-token window around max activation position
  */
 export function extractTokenWindow(
   tokens: string[],
   centerPos: number,
   windowSize: number
 ): { tokens: string[], startIndex: number, endIndex: number } {
   const halfWindow = Math.floor(windowSize / 2)
   const startIndex = Math.max(0, centerPos - halfWindow)
   const endIndex = Math.min(tokens.length, centerPos + halfWindow)

   return {
     tokens: tokens.slice(startIndex, endIndex),
     startIndex,
     endIndex
   }
 }

 /**
  * Build activation token array with highlighting metadata
  */
 export function buildActivationTokens(
   example: QuantileExample,
   windowSize: number = 10
 ): ActivationToken[] {
   const { tokens, startIndex, endIndex } = extractTokenWindow(
     example.prompt_tokens,
     example.max_activation_position,
     windowSize
   )

   // Create lookup map for activation values
   const activationMap = new Map<number, number>()
   example.activation_pairs.forEach(pair => {
     activationMap.set(pair.token_position, pair.activation_value)
   })

   // Build token array with activation metadata
   return tokens.map((text, relativeIdx) => {
     const absolutePos = startIndex + relativeIdx
     return {
       text,
       position: absolutePos,
       activation_value: activationMap.get(absolutePos),
       is_max: absolutePos === example.max_activation_position
     }
   })
 }

 /**
  * Get background color based on activation strength
  * Uses orange gradient: white (0) → light orange (0.5) → full orange (1.0)
  */
 export function getActivationColor(
   activationValue: number,
   maxActivation: number
 ): string {
   const normalized = activationValue / maxActivation  // 0-1 scale

   const colorScale = scaleLinear<string>()
     .domain([0, 0.5, 1])
     .range(['#ffffff', '#fed7aa', '#fb923c'])  // white → light orange → orange

   return colorScale(normalized)
 }

 /**
  * Get border style based on cross-example similarity
  */
 export function getBorderStyle(
   semanticSim: number,
   maxJaccard: number
 ): { color: string, width: string, style: string } {
   // High similarity → stronger border
   if (semanticSim > 0.7) {
     return { color: '#10b981', width: '3px', style: 'solid' }  // Green
   } else if (maxJaccard > 0.5) {
     return { color: '#3b82f6', width: '3px', style: 'solid' }  // Blue
   } else if (semanticSim > 0.3 || maxJaccard > 0.3) {
     return { color: '#8b5cf6', width: '2px', style: 'solid' }  // Purple
   } else {
     return { color: '#d1d5db', width: '1px', style: 'solid' }  // Gray
   }
 }

 /**
  * Format tokens with ellipsis (like explanation display)
  */
 export function formatTokensWithEllipsis(
   tokens: ActivationToken[],
   maxLength: number = 50
 ): { displayTokens: ActivationToken[], hasEllipsis: boolean } {
   const joined = tokens.map(t => t.text).join('')

   if (joined.length <= maxLength) {
     return { displayTokens: tokens, hasEllipsis: false }
   }

   // Truncate and add ellipsis
   let currentLength = 0
   const displayTokens: ActivationToken[] = []

   for (const token of tokens) {
     if (currentLength + token.text.length > maxLength - 3) {
       break
     }
     displayTokens.push(token)
     currentLength += token.text.length
   }

   return { displayTokens, hasEllipsis: true }
 }

 ---
 Phase 4: Frontend Components

 4.1 Create Activation Display Component (frontend/src/components/ActivationExample.tsx - NEW FILE)

 import React, { useState } from 'react'
 import { ActivationExamples, QuantileExample } from '../types'
 import {
   buildActivationTokens,
   getActivationColor,
   getBorderStyle,
   formatTokensWithEllipsis
 } from '../lib/activation-utils'
 import '../styles/ActivationExample.css'

 interface ActivationExampleProps {
   examples: ActivationExamples
   compact?: boolean  // Show 10-token or full 32-token
 }

 const ActivationExample: React.FC<ActivationExampleProps> = ({
   examples,
   compact = true
 }) => {
   const [hoveredQuantile, setHoveredQuantile] = useState<number | null>(null)

   const borderStyle = getBorderStyle(
     examples.semantic_similarity,
     examples.max_jaccard
   )

   return (
     <div className="activation-example">
       {/* Compact view: First example from each quantile, 10 tokens */}
       {compact && (
         <div className="activation-example__compact">
           {examples.quantile_examples.map((example, idx) => {
             const tokens = buildActivationTokens(example, 10)
             const { displayTokens, hasEllipsis } = formatTokensWithEllipsis(tokens)

             return (
               <div
                 key={idx}
                 className="activation-example__quantile"
                 style={{
                   border: `${borderStyle.width} ${borderStyle.style} ${borderStyle.color}`
                 }}
                 onMouseEnter={() => setHoveredQuantile(idx)}
                 onMouseLeave={() => setHoveredQuantile(null)}
               >
                 {displayTokens.map((token, tokenIdx) => (
                   <span
                     key={tokenIdx}
                     className={`activation-token ${token.is_max ? 'activation-token--max' : ''}`}
                     style={{
                       backgroundColor: token.activation_value
                         ? getActivationColor(token.activation_value, example.max_activation)
                         : 'transparent'
                     }}
                     title={token.activation_value?.toFixed(3) || 'No activation'}
                   >
                     {token.text}
                   </span>
                 ))}
                 {hasEllipsis && <span className="activation-example__ellipsis">...</span>}
               </div>
             )
           })}
         </div>
       )}

       {/* Hover popover: 32-token context for hovered quantile */}
       {hoveredQuantile !== null && (
         <div className="activation-example__popover">
           <div className="activation-example__popover-header">
             Quantile {hoveredQuantile + 1} (32-token context)
           </div>
           {(() => {
             const example = examples.quantile_examples[hoveredQuantile]
             const tokens = buildActivationTokens(example, 32)

             return (
               <div className="activation-example__popover-content">
                 {tokens.map((token, idx) => (
                   <span
                     key={idx}
                     className={`activation-token ${token.is_max ? 'activation-token--max' : ''}`}
                     style={{
                       backgroundColor: token.activation_value
                         ? getActivationColor(token.activation_value, example.max_activation)
                         : 'transparent'
                     }}
                   >
                     {token.text}
                   </span>
                 ))}
               </div>
             )
           })()}
         </div>
       )}
     </div>
   )
 }

 export default ActivationExample

 4.2 Add CSS Styling (frontend/src/styles/ActivationExample.css - NEW FILE)

 .activation-example {
   position: relative;
   font-family: 'Courier New', monospace;
   font-size: 11px;
   line-height: 1.4;
 }

 .activation-example__compact {
   display: flex;
   flex-direction: column;
   gap: 4px;
 }

 .activation-example__quantile {
   padding: 4px 6px;
   border-radius: 3px;
   background: white;
   transition: all 0.2s ease;
 }

 .activation-example__quantile:hover {
   box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
   z-index: 1;
 }

 .activation-token {
   padding: 1px 2px;
   border-radius: 2px;
   transition: background-color 0.15s ease;
 }

 .activation-token--max {
   font-weight: 700;
   border-bottom: 2px solid #dc2626;
 }

 .activation-example__ellipsis {
   color: #9ca3af;
   margin-left: 2px;
 }

 /* Hover popover (32-token view) */
 .activation-example__popover {
   position: absolute;
   top: 100%;
   left: 0;
   margin-top: 8px;
   background: white;
   border: 1px solid #e5e7eb;
   border-radius: 6px;
   box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
   z-index: 100;
   max-width: 600px;
   padding: 12px;
 }

 .activation-example__popover-header {
   font-size: 12px;
   font-weight: 600;
   color: #374151;
   margin-bottom: 8px;
   border-bottom: 1px solid #e5e7eb;
   padding-bottom: 4px;
 }

 .activation-example__popover-content {
   line-height: 1.6;
 }

 ---
 Phase 5: Integration into Tables

 5.1 Update DecoderSimilarityTable

 Fetch activation data when stage loads:
 // In DecoderSimilarityTable.tsx, after stageRows computation
 useEffect(() => {
   if (!stageContext || !tableData) return

   // Extract all feature IDs in this stage
   const featureIds = stageRows.map(row => row.feature_id)

   // Fetch activation examples
   getActivationExamples(featureIds).then(examples => {
     // Store in component state or add to rows
     setActivationData(examples)
   })
 }, [stageRows, stageContext, tableData])

 Render in table:
 <td className="table-panel__cell decoder-stage-table__cell--activation">
   {activationData[similar.feature_id] ? (
     <ActivationExample
       examples={activationData[similar.feature_id]}
       compact={true}
     />
   ) : (
     <span className="table-panel__placeholder">—</span>
   )}
 </td>

 5.2 Update Main TablePanel

 Similar pattern in TablePanel.tsx (line ~882):
 {/* Activation Example column - NOW POPULATED */}
 <td
   className="table-panel__cell"
   rowSpan={validExplainerIds.length}
 >
   {activationData[featureRow.feature_id] ? (
     <ActivationExample
       examples={activationData[featureRow.feature_id]}
       compact={true}
     />
   ) : (
     <span className="table-panel__placeholder">Loading...</span>
   )}
 </td>

 5.3 Update Type Column in DecoderSimilarityTable

 Replace "None" placeholder:
 <td className="table-panel__cell decoder-stage-table__cell--type">
   <span className="decoder-stage-table__type-badge">
     {activationData[similar.feature_id]?.pattern_type || 'None'}
   </span>
 </td>

 ---
 Phase 6: Performance Optimizations

 6.1 Lazy Loading Strategy

 // Only fetch activation examples when:
 // 1. Table is scrolled to that row (intersection observer)
 // 2. Feature is expanded
 // 3. User hovers over activation column

 const observerRef = useRef<IntersectionObserver>()

 useEffect(() => {
   observerRef.current = new IntersectionObserver(
     (entries) => {
       entries.forEach(entry => {
         if (entry.isIntersecting) {
           const featureId = entry.target.getAttribute('data-feature-id')
           fetchActivationExample(featureId)
         }
       })
     },
     { rootMargin: '100px' }  // Preload when close to viewport
   )
 }, [])

 6.2 Caching Strategy

 // Global cache in Zustand store
 interface AppState {
   activationExamplesCache: Record<number, ActivationExamples>

   fetchActivationExamples: (featureIds: number[]) => Promise<void>
 }

 // In store implementation:
 fetchActivationExamples: async (featureIds) => {
   // Check cache first
   const uncached = featureIds.filter(id => !get().activationExamplesCache[id])

   if (uncached.length === 0) return  // All cached

   // Batch fetch only uncached
   const examples = await api.getActivationExamples(uncached)

   // Update cache
   set(state => ({
     activationExamplesCache: {
       ...state.activationExamplesCache,
       ...examples
     }
   }))
 }

 6.3 Backend Query Optimization

 # In DataService._organize_by_quantile()
 def _organize_by_quantile(self, examples_df, quantile_boundaries):
     """
     Use vectorized operations instead of loops
     Polars is 10-100x faster than pandas for this
     """
     # Add quantile label column using when().then() expressions
     df = examples_df.with_columns([
         pl.when(pl.col("max_activation") <= quantile_boundaries[0])
           .then(pl.lit(0))
           .when(pl.col("max_activation") <= quantile_boundaries[1])
           .then(pl.lit(1))
           .when(pl.col("max_activation") <= quantile_boundaries[2])
           .then(pl.lit(2))
           .otherwise(pl.lit(3))
           .alias("quantile")
     ])

     # Group by quantile and take first example
     result = []
     for q in range(4):
         example = df.filter(pl.col("quantile") == q).head(1)
         if len(example) > 0:
             result.append(example.to_dict())

     return result

 ---
 Performance Expectations

 Data Size

 - Per feature: ~5-10 KB (4 quantiles × ~1 KB per example)
 - 100 features visible: ~500 KB - 1 MB data transfer
 - With caching: Only fetch once per feature

 Response Times

 - Backend query: ~50-100ms (batch of 100 features)
 - Frontend render: ~20-50ms per row
 - Hover popover: Instant (already loaded)

 Optimization Impact

 - Lazy loading: Only load visible rows (70% reduction)
 - Batch fetching: 10-100x faster than individual queries
 - Caching: Instant on revisit (100% speedup)
 - Polars vectorization: 10x faster than Python loops

 ---
 Testing Strategy

 Unit Tests

 1. Backend: Test _compute_pattern_type() with threshold edge cases
 2. Backend: Test _organize_by_quantile() with various quantile distributions
 3. Frontend: Test extractTokenWindow() boundary conditions
 4. Frontend: Test getActivationColor() gradient accuracy

 Integration Tests

 1. Fetch activation examples for 100 features (batch)
 2. Render table with activation examples
 3. Hover to show 32-token popover
 4. Verify border colors match similarity thresholds

 Performance Tests

 1. Measure backend response time for 1, 10, 100, 1000 features
 2. Measure frontend render time for different table sizes
 3. Monitor memory usage with 10K cached examples

 ---
 Implementation Order

 1. Backend foundation (2-3 hours)
   - Update DataService with activation data loading
   - Implement get_activation_examples() method
   - Create new API endpoint
   - Test with curl/Postman
 2. Frontend utilities (1-2 hours)
   - Create activation-utils.ts
   - Implement token extraction and coloring functions
   - Test utility functions in isolation
 3. ActivationExample component (2-3 hours)
   - Build component with compact/expanded views
   - Add hover popover logic
   - Style with CSS
 4. DecoderSimilarityTable integration (1-2 hours)
   - Add activation data fetching
   - Integrate ActivationExample component
   - Update Type column with pattern_type
 5. Main TablePanel integration (1-2 hours)
   - Similar pattern as DecoderSimilarityTable
   - Update column 7 (currently empty)
   - Test with different feature sets
 6. Performance optimization (2-3 hours)
   - Add lazy loading with IntersectionObserver
   - Implement caching in Zustand
   - Optimize backend queries with Polars
 7. Testing & refinement (1-2 hours)
   - Unit tests for critical functions
   - Integration testing
   - Performance profiling

 Total estimated time: 10-16 hours

 ---
 Risk Mitigation

 Potential Issues

 1. Large data transfer: 257 MB activation_examples.parquet
   - Mitigation: Lazy scan with Polars, only fetch needed prompts
 2. Slow rendering: 100+ features with complex highlighting
   - Mitigation: React.memo, virtualization, lazy loading
 3. Border logic confusion: Cross-example similarity interpretation
   - Mitigation: Clear tooltips, visual legend
 4. Type categorization edge cases: semantic=0.3, jaccard=0.3
   - Mitigation: Clear tie-breaking logic (use higher value)

 Fallback Plan

 If performance is insufficient:
 - Phase 1: Implement only for DecoderSimilarityTable (smaller dataset)
 - Phase 2: Add to main TablePanel with pagination
 - Phase 3: Optimize backend with pre-computed token windows