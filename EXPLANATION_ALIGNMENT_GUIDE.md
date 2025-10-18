# 🔍 Explanation Alignment 시각화 가이드

LLM explanation 간 공통 구문을 찾아 시각화하는 완전한 파이프라인입니다.

## 📋 목차
1. [빠른 시작](#빠른-시작)
2. [데이터 전처리](#데이터-전처리)
3. [시각화 데모](#시각화-데모)
4. [고급 사용법](#고급-사용법)

---

## 🚀 빠른 시작

### Step 1: 데이터 전처리

```bash
# 데이터는 이미 전처리되어 있습니다! ✅
# data/explanation_alignment/alignment_exact.json (6.2MB)
# data/explanation_alignment/alignment_semantic.json (3.4MB)
```

### Step 2: 시각화 확인

```bash
cd frontend

# 데모 서버 실행
python3 serve_demo.py

# 브라우저에서 열기
# http://localhost:8081/explanation_alignment_demo.html
```

끝! 🎉

---

## 📊 데이터 전처리

### Exact Matching (N-gram 기반)

**특징:**
- ✅ 매우 빠름 (~2,000 features/sec)
- ✅ 정확한 문구 매칭
- ✅ 추가 라이브러리 불필요
- ❌ 표현이 다르면 감지 못함

**예시:**
```
Llama:  "function words and prepositions"
Qwen:   "function words and prepositions"  ← 매칭됨!
OpenAI: "grammatical function words"       ← 매칭 안 됨
```

**실행 명령:**
```bash
# 전체 824 features 처리 (이미 완료됨 ✅)
python3 preprocess_explanation_alignment.py --mode exact

# 파라미터 조정 (재처리 시)
python3 preprocess_explanation_alignment.py \
  --mode exact \
  --min-ngram 3 \     # 최소 3단어 구문
  --max-ngram 7 \     # 최대 7단어 구문
  --min-occurrences 2 # 2개 이상 LLM에서 공통
```

---

### Semantic Similarity (임베딩 기반)

**특징:**
- ✅ 의미적으로 유사한 구문 감지
- ✅ 표현이 달라도 매칭 가능
- ✅ 유사도 점수 제공
- ❌ 느림 (~10-20 features/sec)
- ❌ sentence-transformers 설치 필요

**예시:**
```
Llama:  "function words and prepositions"
Qwen:   "grammatical function words"       ← 매칭됨! (similarity: 0.85)
OpenAI: "high-frequency grammatical words" ← 매칭됨! (similarity: 0.78)
```

**실행 명령:**
```bash
# 1. 먼저 라이브러리 설치
python3 -m pip install sentence-transformers

# 2. Semantic matching 실행 (전체 824 features, 이미 완료됨 ✅)
python3 preprocess_explanation_alignment.py \
  --mode semantic \
  --threshold 0.7   # 70% 이상 유사도

# 3. Threshold 조정 실험 (재처리 시)
# 0.7 = 느슨한 매칭 (더 많은 매칭)
# 0.8 = 중간
# 0.9 = 엄격한 매칭 (매우 유사한 것만)
python3 preprocess_explanation_alignment.py \
  --mode semantic \
  --threshold 0.8
```

---

## 🎨 시각화 데모

### 방법 1: 간단한 HTTP 서버

```bash
cd frontend
python serve_demo.py

# 브라우저에서 열기:
# http://localhost:8081/explanation_alignment_demo.html
```

### 방법 2: Python 기본 서버

```bash
cd frontend
python -m http.server 8081

# 브라우저에서 열기:
# http://localhost:8081/explanation_alignment_demo.html
```

### 방법 3: 직접 파일 열기

```bash
# macOS
open frontend/explanation_alignment_demo.html

# Linux
xdg-open frontend/explanation_alignment_demo.html

# Windows
start frontend/explanation_alignment_demo.html
```

---

## 🎯 데모 사용법

### 주요 기능

1. **모드 전환**
   - "Exact Matching" 버튼: N-gram 기반 정확한 매칭
   - "Semantic Similarity" 버튼: 임베딩 기반 의미적 유사도

2. **Feature 선택**
   - 드롭다운 메뉴에서 Feature ID 선택
   - Previous/Next 버튼으로 탐색

3. **색상 코딩**
   - **진한 녹색**: 3개 모두 공통 / 매우 높은 유사도 (0.9+)
   - **중간 녹색**: 2개 공통 / 높은 유사도 (0.8-0.9)
   - **연한 녹색**: 중간 유사도 (0.7-0.8)

4. **상세 정보**
   - 하이라이트된 텍스트에 마우스 올리기
   - 툴팁으로 공유 LLM 수, 유사도 점수 확인

5. **통계 대시보드**
   - Features with Matches: 매칭이 있는 feature 개수
   - Total Features: 전체 처리된 feature 개수
   - Total Matches: 전체 매칭 개수

---

## 🔧 고급 사용법

### 1. 대량 처리

전체 824개 feature 처리:

```bash
# Exact matching (빠름 - 약 1분)
python preprocess_explanation_alignment.py --mode exact

# Semantic matching (느림 - 약 10-30분, GPU 있으면 더 빠름)
python preprocess_explanation_alignment.py --mode semantic
```

### 2. 배치 처리

메모리 절약을 위해 배치로 나누어 처리:

```bash
# 처음 100개
python preprocess_explanation_alignment.py --mode exact --sample 100
mv data/explanation_alignment/alignment_exact.json \
   data/explanation_alignment/alignment_exact_batch1.json

# 다음 100개 (코드 수정 필요)
# TODO: 배치 offset 파라미터 추가
```

### 3. 커스텀 파라미터 튜닝

**Exact matching 최적화:**

```bash
# 짧은 구문만 (더 많은 매칭)
python preprocess_explanation_alignment.py \
  --mode exact \
  --min-ngram 2 \
  --max-ngram 3

# 긴 구문만 (더 의미있는 매칭)
python preprocess_explanation_alignment.py \
  --mode exact \
  --min-ngram 5 \
  --max-ngram 10

# 3개 모두 공통인 것만
python preprocess_explanation_alignment.py \
  --mode exact \
  --min-occurrences 3
```

**Semantic matching 최적화:**

```bash
# 느슨한 매칭 (더 많은 결과)
python preprocess_explanation_alignment.py \
  --mode semantic \
  --threshold 0.6

# 엄격한 매칭 (고품질만)
python preprocess_explanation_alignment.py \
  --mode semantic \
  --threshold 0.85

# 문장 단위로 매칭
python preprocess_explanation_alignment.py \
  --mode semantic \
  --chunk-method sentence
```

### 4. 출력 데이터 구조

```json
{
  "statistics": {
    "total_features": 50,
    "mode": "exact",
    "features_with_matches": 20,
    "total_matches": 93
  },
  "results": [
    {
      "feature_id": 0,
      "alignment_mode": "exact",
      "llm_explainers": ["Llama", "Qwen", "OpenAI"],
      "highlighted_explanations": [
        [
          {"text": "normal word", "highlight": false},
          {
            "text": "common phrase here",
            "highlight": true,
            "color": "#2E7D32",
            "shared_with": [0, 1, 2],
            "match_type": "exact",
            "ngram_length": 3
          }
        ]
      ],
      "metadata": {
        "total_common_ngrams": 5,
        "longest_match": 5
      }
    }
  ]
}
```

---

## 📈 성능 벤치마크

| Mode | Features/sec | 824 features 소요 시간 | GPU 필요 |
|------|--------------|----------------------|----------|
| Exact | ~2,000 | ~0.5초 | ❌ |
| Semantic (CPU) | ~10-20 | ~40-80초 | ❌ |
| Semantic (GPU) | ~100+ | ~8초 | ✅ |

---

## 💡 활용 예시

### 1. LLM 일관성 분석

```python
# alignment_exact.json 로드 후
import json

with open('data/explanation_alignment/alignment_exact.json') as f:
    data = json.load(f)

# 3개 모두 공통인 구문 추출
all_common = []
for feature in data['results']:
    for exp in feature['highlighted_explanations']:
        for seg in exp:
            if seg.get('highlight') and len(seg.get('shared_with', [])) == 3:
                all_common.append(seg['text'])

print(f"3개 LLM 모두 동의하는 구문: {len(all_common)}개")
print(all_common[:10])  # 상위 10개
```

### 2. Feature별 일관성 점수

```python
# 각 feature의 일관성 점수 계산
consistency_scores = {}

for feature in data['results']:
    feature_id = feature['feature_id']
    total_words = 0
    matched_words = 0

    for exp in feature['highlighted_explanations']:
        for seg in exp:
            words = len(seg['text'].split())
            total_words += words
            if seg.get('highlight'):
                matched_words += words

    consistency_scores[feature_id] = matched_words / total_words if total_words > 0 else 0

# 가장 일관성 높은 feature
top_features = sorted(consistency_scores.items(), key=lambda x: x[1], reverse=True)[:10]
print("가장 일관성 높은 features:", top_features)
```

### 3. LLM별 용어 선택 패턴

```python
# 각 LLM이 독특하게 사용하는 용어 추출
llm_unique_terms = {0: [], 1: [], 2: []}

for feature in data['results']:
    for exp_idx, exp in enumerate(feature['highlighted_explanations']):
        for seg in exp:
            if not seg.get('highlight'):
                # 하이라이트 안 된 = 독특한 표현
                llm_unique_terms[exp_idx].append(seg['text'])

print("Llama 독특한 용어:", set(llm_unique_terms[0])[:20])
print("Qwen 독특한 용어:", set(llm_unique_terms[1])[:20])
print("OpenAI 독특한 용어:", set(llm_unique_terms[2])[:20])
```

---

## 🐛 문제 해결

### Q: "sentence-transformers not installed" 경고

**A:** Semantic mode를 사용하려면 설치 필요:
```bash
pip install sentence-transformers
```

### Q: 데모 페이지에서 데이터가 안 보임

**A:** 다음을 확인하세요:
1. 전처리를 실행했는가?
   ```bash
   ls data/explanation_alignment/alignment_*.json
   ```
2. HTTP 서버를 사용했는가? (파일 직접 열기는 CORS 에러 발생 가능)
   ```bash
   python serve_demo.py
   ```

### Q: 메모리 부족 오류

**A:** 샘플 크기를 줄이세요:
```bash
python preprocess_explanation_alignment.py --mode semantic --sample 20
```

### Q: Semantic mode가 너무 느림

**A:**
1. GPU 사용 (CUDA 설치)
2. 또는 Exact mode 사용
3. 또는 샘플 크기 축소

---

## 📚 다음 단계

- [ ] **API 통합**: FastAPI endpoint로 만들기
- [ ] **React 컴포넌트**: 메인 앱에 통합
- [ ] **실시간 처리**: 사용자가 threshold 조정 시 즉시 재계산
- [ ] **Export 기능**: 하이라이트된 텍스트 PDF/HTML로 저장
- [ ] **Cross-feature 분석**: 전체 feature에 걸친 통계

---

## 📞 도움말

문제가 있으면:
1. [README_explanation_alignment.md](backend/README_explanation_alignment.md) 확인
2. 데이터 경로와 파일 존재 확인
3. Python 버전 확인 (3.8+)

---

**만든 날짜**: 2025-10-18
**버전**: 1.0.0
**상태**: ✅ 프로토타입 완성
