# Explanation Alignment Preprocessing

여러 LLM explanation 간의 공통 구문을 찾아 시각화하기 위한 데이터 전처리 스크립트입니다.

## 📋 개요

SAE feature에 대해 3개의 LLM (Llama, Qwen, OpenAI)이 생성한 explanation 간의 공통 부분을 찾습니다:

- **Exact Matching**: N-gram 기반 정확한 문구 매칭
- **Semantic Similarity**: 임베딩 기반 의미적 유사 구문 매칭

## 🚀 사용법

### 1. 기본 실행 (Exact Matching)

```bash
cd backend
python3 preprocess_explanation_alignment.py --mode exact
```

### 2. Semantic Similarity (임베딩 설치 필요)

```bash
# 먼저 sentence-transformers 설치
python3 -m pip install sentence-transformers

# Semantic mode 실행 (전체 824 features)
python3 preprocess_explanation_alignment.py --mode semantic --threshold 0.7
```

### 3. 전체 옵션

```bash
python preprocess_explanation_alignment.py \
  --mode exact \
  --input-dir ../data/detailed_json/google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120 \
  --output-dir ../data/explanation_alignment \
  --min-ngram 3 \
  --max-ngram 5 \
  --min-occurrences 2 \
  --sample 100
```

## 📊 파라미터 설명

### 공통 파라미터
- `--mode`: `exact` (n-gram) 또는 `semantic` (임베딩)
- `--input-dir`: Feature JSON 파일이 있는 폴더 경로
- `--output-dir`: 처리된 데이터 저장 경로 (기본값: `../data/explanation_alignment`)
- `--sample`: 처리할 feature 개수 (테스트용, None이면 전체)

### Exact Matching 파라미터
- `--min-ngram`: 최소 n-gram 크기 (기본값: 3)
- `--max-ngram`: 최대 n-gram 크기 (기본값: 5)
- `--min-occurrences`: 최소 출현 횟수 (기본값: 2 = 2개 이상 LLM에서 공통)

### Semantic Similarity 파라미터
- `--threshold`: 유사도 임계값 (기본값: 0.7 = 70% 유사)
- `--chunk-method`: `sentence` (문장 단위) 또는 `phrase` (구 단위, 기본값)

## 📁 출력 형식

출력 파일: `data/explanation_alignment/alignment_{mode}.json`

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
      "llm_explainers": [
        "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4",
        "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8",
        "openai/gpt-oss-20b"
      ],
      "highlighted_explanations": [
        [
          {"text": "word", "highlight": false},
          {
            "text": "common phrase",
            "highlight": true,
            "color": "#2E7D32",
            "shared_with": [0, 1, 2],
            "match_type": "exact",
            "ngram_length": 2
          },
          ...
        ],
        ...
      ],
      "metadata": {
        "total_common_ngrams": 5,
        "longest_match": 5,
        "common_ngrams_list": [...]
      }
    },
    ...
  ]
}
```

## 🎨 시각화 데모

처리된 데이터를 확인하려면 간단한 HTML 데모를 사용하세요:

```bash
# 파일 경로: frontend/explanation_alignment_demo.html
# 브라우저에서 열기
open frontend/explanation_alignment_demo.html
# 또는
python -m http.server 8080
# 그리고 http://localhost:8080/frontend/explanation_alignment_demo.html 접속
```

### 데모 기능
- ✅ Exact / Semantic 모드 전환
- ✅ Feature 선택 (드롭다운)
- ✅ 색상 코딩된 하이라이팅
  - **진한 녹색 (#2E7D32)**: 3개 모두 공통 / 고유사도 (0.9+)
  - **중간 녹색 (#66BB6A)**: 2개 공통 / 중유사도 (0.8-0.9)
  - **연한 녹색 (#AED581)**: 저유사도 (0.7-0.8)
- ✅ 호버 툴팁 (상세 정보)
- ✅ 통계 대시보드
- ✅ 이전/다음 네비게이션

## 🔍 예시 출력

### Exact Matching 결과 (Feature 0)
```
Llama:   "... a question or explanation about a process ..."
Qwen:    "... a question or explanation about a method ..."
OpenAI:  "... introduces a question ..."

공통 구문: "a question or explanation about" (5-gram, 2개 LLM 공유)
```

### Semantic Similarity 결과
```
Llama:   "function words and prepositions"
Qwen:    "grammatical function words"
OpenAI:  "high-frequency function words"

의미적 유사 구문: similarity 0.85+ (같은 개념을 다르게 표현)
```

## 📈 성능

- **Exact Matching**: 매우 빠름 (~2,000 features/sec)
- **Semantic Similarity**: 느림 (~10-20 features/sec, GPU 사용 시 더 빠름)

## 🔧 의존성

### 필수
- Python 3.8+
- numpy
- tqdm

### 선택 (Semantic mode용)
```bash
pip install sentence-transformers
```

## 💡 활용 방안

1. **LLM Explanation 일관성 분석**: 여러 LLM이 얼마나 유사한 설명을 생성하는지 정량화
2. **Feature 해석 검증**: 3개 LLM이 모두 동의하는 핵심 개념 추출
3. **LLM 비교 연구**: 각 LLM의 설명 스타일과 용어 선택 차이 분석
4. **Interactive Visualization**: 프론트엔드 컴포넌트로 통합하여 사용자가 직접 탐색

## 📝 참고사항

- **데이터 경로**: 입력 데이터는 `data/detailed_json/...` 폴더에 있어야 합니다
- **Feature 개수**: Feature ID는 0-999 범위이지만, 실제로는 824개 feature만 존재합니다
- **Feature 구조**: 각 feature는 정확히 3개의 explanation을 가져야 합니다 (Llama, Qwen, OpenAI)
  - ⚠️ Feature 224는 2개만 있어서 경고가 발생합니다 (정상)
- **메모리**: Semantic mode는 임베딩 모델을 메모리에 로드하므로 ~500MB RAM 필요
- **시스템 통합**: 이 스크립트는 독립적으로 실행되며 FastAPI 백엔드와 분리되어 있습니다
- **Python 버전**: `python3` 명령어 사용 (pyenv 환경)

## 🐛 문제 해결

### "sentence-transformers not installed" 경고
```bash
python3 -m pip install sentence-transformers
```

### 출력 파일이 생성되지 않음
- 입력 폴더 경로 확인: `--input-dir` 옵션
- Feature JSON 파일 존재 확인: `ls data/detailed_json/.../feature_*.json`

### 메모리 부족 오류
- `--sample` 옵션으로 작은 배치로 나누어 처리
- Semantic mode 대신 Exact mode 사용

## 🔧 최근 버그 수정 (2025-10-18)

### **수정된 Semantic Similarity 색상 로직**

**문제**: 그룹을 시작한 LLM의 chunk가 항상 유사도 1.0으로 저장되어 진한 녹색으로 표시됨 (불공정)

**수정**: 시작 chunk도 매칭된 다른 chunk들과의 평균 유사도를 계산하여 공정하게 색상 배정

**예시 (Feature 105)**:
```
수정 전:
  Llama "formatting": 진한 녹색 (#2E7D32) - 유사도 1.0 ❌
  Qwen "formatting in code": 중간 녹색 (#66BB6A) - 유사도 0.815

수정 후:
  Llama "formatting": 중간 녹색 (#66BB6A) - 유사도 0.815 ✅
  Qwen "formatting in code": 중간 녹색 (#66BB6A) - 유사도 0.815 ✅
```

이제 매칭된 chunk들이 동일한 색상을 가지므로 더 직관적입니다!

### **알려진 제한사항**

- **Chunk 분할 시 구분자 제거**: 쉼표와 접속사로 분할하면 해당 기호가 제거됩니다
  - 예: `"formatting, often"` → `["formatting", "often"]` (쉼표 사라짐)
  - HTML에서는 공백으로 연결되므로 가독성은 유지됩니다

## 📚 추가 개선 아이디어

- [ ] Stopword 필터링 옵션
- [ ] 다양한 임베딩 모델 지원 (BERT, RoBERTa, etc.)
- [ ] Batch processing for large datasets
- [ ] Export to HTML/PDF with highlighted text
- [ ] Cross-feature aggregation statistics
- [x] ~~Semantic similarity 색상 버그 수정~~ (2025-10-18 완료)
