// ============================================================================
// INTERNATIONALIZATION - Korean language toggle for conference demo
// ============================================================================
// When USE_KOREAN is true, descriptive/instructional tooltips and stage
// instructions switch to Korean. Technical English terms (activating examples,
// feature, classifier, SVM, decision boundary, threshold, etc.) are preserved.
// Number/status tooltips (like counts in SelectionBar) remain unchanged.

import type { TagTooltipInfo } from './constants'
import {
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE,
  TAG_CATEGORY_REGENERATION,
  TAG_TOOLTIPS,
  TAG_CATEGORIES,
} from './constants'

/** Toggle: set to true for Korean, false for English */
export const USE_KOREAN = true

/** Returns Korean string when toggle is on, English otherwise */
export function t(en: string, ko: string): string {
  return USE_KOREAN ? ko : en
}

// ============================================================================
// STAGE INSTRUCTIONS
// ============================================================================

const INSTRUCTION_KO: Record<string, string> = {
  [TAG_CATEGORY_FEATURE_SPLITTING]:
    'Q: 한쪽 feature의 activating example 중에 다른 feature의 \n개념과 구분이 안 되는 것이 하나라도 있는가?',
  [TAG_CATEGORY_QUALITY]:
    'Q: Explanation들이 모든 activating example을\n설명하고 있는가?',
  [TAG_CATEGORY_CAUSE]:
    'Q: Explanation들이 일부 내지 전체 activating example을\n설명하지 못하는 원인은 무엇인가?',
  [TAG_CATEGORY_REGENERATION]:
    'Labeling 결과 및 통계 검토',
}

/** Returns Korean instruction for a category ID when toggle is on */
export function getInstruction(categoryId: string): string {
  if (USE_KOREAN) {
    return INSTRUCTION_KO[categoryId] ?? TAG_CATEGORIES[categoryId]?.instruction ?? ''
  }
  return TAG_CATEGORIES[categoryId]?.instruction ?? ''
}

// ============================================================================
// TAG TOOLTIPS
// ============================================================================

const TAG_TOOLTIP_KO: Record<string, Partial<TagTooltipInfo>> = {
  // Stage 1
  [`${TAG_CATEGORY_FEATURE_SPLITTING}:Monosemantic`]: {
    flow: 'Stage 2에서 추가 검토',
    description: '두 feature 사이 개념이 명확히 구분됨, 또는 적어도 하나의 feature에 모든 activating example을 아우르는 특징적인 개념이 없음',
    example: '두 feature 모두 Noisy하지 않다면, 섞인 activating example들을 원래 속했던 feature로 분리할 수 있음'
  },
  [`${TAG_CATEGORY_FEATURE_SPLITTING}:Incoherent Splitting`]: {
    flow: 'Stage 1에서 확정',
    description: '두 feature 모두 각각의 activating example을 아우르는 특징적인 개념을 가지지만 그 사이 경계가 모호함',
    example: '섞인 activating example들을 원래 속했던 feature로 분리할 수 없음',
  },
  // Stage 2
  [`${TAG_CATEGORY_QUALITY}:Well-Explained`]: {
    flow: 'Stage 2에서 확정',
    description: 'Explanation들이 모든 activating example의 의미를 포착하는 경우',
  },
  [`${TAG_CATEGORY_QUALITY}:Need Revision`]: {
    flow: 'Stage 3에서 추가 검토',
    description: 'Explanation들이 모든 activating example을 포착하지 못하는 경우',
  },
  // Stage 3
  [`${TAG_CATEGORY_CAUSE}:Well-Explained`]: {
    description: '낮은 score에도 불구하고 explanation이 충분히 충실한 경우',
  },
  [`${TAG_CATEGORY_CAUSE}:Missed Syntax`]: {
    description: 'Example들이 공유하는 표현 형태적 패턴을 explainer가 설명에서 누락한 경우',
    example: '예: suffix, prefix, 단어/문장 속 위치, 특정 토큰, 반복',
  },
  [`${TAG_CATEGORY_CAUSE}:Missed Context`]: {
    description: 'Example들이 공유하는 의미적, 맥락적 패턴을 explainer가 설명에서 누락한 경우',
    example: '예: 특정 상황, 문맥, 도메인, 토픽, 감정, 톤, 종류, 언어, 문장 성분',
  },
  [`${TAG_CATEGORY_CAUSE}:Noisy Activation`]: {
    description: '일관된 패턴 없이 이질적인 example에 반응',
    example: '예: 무관한 activation 맥락, 공유되는 어휘적·의미적 패턴 없음, polysemantic',
  },
  // Shared
  'Unsure': {
    description: '건너뛰고 나중에 재검토',
  },
}

/** Returns tag tooltip with Korean overrides when toggle is on */
export function getTagTooltip(key: string): TagTooltipInfo | undefined {
  const base = TAG_TOOLTIPS[key]
  if (!base) return undefined
  if (!USE_KOREAN) return base
  const ko = TAG_TOOLTIP_KO[key]
  if (!ko) return base
  return { ...base, ...ko }
}

// ============================================================================
// VERDICT LABELS
// ============================================================================

/** Translates verdict enum to display label */
export function getVerdictLabel(verdict: 'positive' | 'negative' | 'neutral'): string {
  if (!USE_KOREAN) {
    return verdict === 'positive' ? 'Positive' : verdict === 'negative' ? 'Negative' : 'Neutral'
  }
  return verdict === 'positive' ? '긍정' : verdict === 'negative' ? '부정' : '중립'
}

// ============================================================================
// METRIC DESCRIPTIONS (ParallelCoordinates)
// ============================================================================

const METRIC_DESC_KO: Record<string, string> = {
  fracNonzero: 'Text corpus에서 이 feature가 activate되는 빈도 (0 = 비활성, 1 = 항상 활성)',
  consensusScore: '서로 다른 LLM explainer 간 핵심 phrase의 일치도',
  embedding: 'Explanation이 activating vs. non-activating example과 얼마나 의미적으로 일치하는지 (0.5 = random)',
  detection: 'Explanation이 context 수준에서 activating과 non-activating example을 얼마나 잘 구분하는지 (0.5 = random)',
  fuzz: 'Explanation이 example 내에서 activating token과 non-activating token을 얼마나 잘 식별하는지 (0.5 = random)',
}

/** Returns Korean metric description when toggle is on, otherwise the English fallback */
export function getMetricDescription(key: string, englishFallback: string): string {
  if (USE_KOREAN && METRIC_DESC_KO[key]) {
    return METRIC_DESC_KO[key]
  }
  return englishFallback
}
