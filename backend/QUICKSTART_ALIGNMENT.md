# ⚡ Quick Start: Explanation Alignment

## 🎯 3분 안에 시작하기

### Step 1: 데이터 전처리 (완료됨 ✅)

```bash
cd backend
python preprocess_explanation_alignment.py --mode exact
```

**출력:** `../data/explanation_alignment/alignment_exact.json` (6.2MB, 824 features)
- Features with matches: 291 / 824 (35%)
- Total matches: 902

### Step 2: 시각화 확인 (10초)

```bash
cd ../frontend
python serve_demo.py
```

### Step 3: 브라우저에서 보기

http://localhost:8081/explanation_alignment_demo.html

---

## 📸 스크린샷 가이드

### 화면 구성

```
┌──────────────────────────────────────────────────────────────┐
│  🔍 Explanation Alignment Visualization                      │
│                                                               │
│  [Exact Matching] [Semantic Similarity]  [Select Feature ▼]  │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │ Features │ │  Total   │ │ Matches  │                     │
│  │   291    │ │   824    │ │   902    │                     │
│  └──────────┘ └──────────┘ └──────────┘                     │
│                                                               │
│  Feature 184                                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Llama:  Function words and prepositions that connect  │ │
│  │         clauses or phrases                              │ │
│  │                                                          │ │
│  │ Qwen:   Common function words and discourse markers    │ │
│  │         that connect ideas                              │ │
│  │                                                          │ │
│  │ OpenAI: High-frequency function words that serve as    │ │
│  │         connective tissue                               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  [← Previous]              1 / 50              [Next →]      │
└──────────────────────────────────────────────────────────────┘
```

**녹색 하이라이트** = 공통 구문

---

## 🎨 하이라이팅 예시

### Exact Mode
```
Llama:  "function words and prepositions"
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ (진한 녹색 - 3개 모두)

Qwen:   "function words and discourse markers"
        ^^^^^^^^^^^^^^^^^^^^^^ (중간 녹색 - 2개)

OpenAI: "function words that serve as"
        ^^^^^^^^^^^^^^ (중간 녹색 - 2개)
```

### Semantic Mode (설치 필요: `pip install sentence-transformers`)
```
Llama:  "function words"        (0.92 유사도)
Qwen:   "grammatical words"     (0.85 유사도)
OpenAI: "high-frequency words"  (0.78 유사도)
```

---

## 💻 명령어 치트시트

```bash
# === 전처리 ===
# Exact (빠름, 이미 완료됨)
python3 preprocess_explanation_alignment.py --mode exact

# Semantic (이미 완료됨)
python3 -m pip install sentence-transformers
python3 preprocess_explanation_alignment.py --mode semantic

# === 시각화 ===
# 데모 서버
cd ../frontend && python3 serve_demo.py

# 또는 기본 서버
python3 -m http.server 8081
```

---

## 📊 출력 파일

```
data/explanation_alignment/
└── alignment_exact.json       (6.2MB for 824 features)
    ├── statistics
    │   ├── total_features: 824
    │   ├── features_with_matches: 291
    │   └── total_matches: 902
    └── results[824]
        └── highlighted_explanations[3]
```

---

## 🔧 파라미터 조정

```bash
# 더 많은 매칭 원하면 (짧은 구문)
--min-ngram 2 --max-ngram 3

# 더 의미있는 매칭 원하면 (긴 구문)
--min-ngram 5 --max-ngram 10

# 3개 모두 공통인 것만
--min-occurrences 3

# Semantic threshold (0.5=느슨, 0.9=엄격)
--threshold 0.8
```

---

## ✅ 체크리스트

- [ ] Python 3.8+ 설치됨
- [ ] `backend/` 폴더에서 전처리 실행
- [ ] `data/explanation_alignment/alignment_exact.json` 생성됨
- [ ] `frontend/serve_demo.py` 실행 중
- [ ] http://localhost:8080/explanation_alignment_demo.html 열림
- [ ] 하이라이트된 텍스트 보임

---

## 🐛 문제 해결

| 문제 | 해결 |
|------|------|
| `alignment_exact.json not found` | 전처리를 먼저 실행하세요 |
| 데모에서 데이터 안 보임 | HTTP 서버 사용 (파일 직접 열기 X) |
| Semantic mode 안 됨 | `pip install sentence-transformers` |

---

## 📚 더 알아보기

- [EXPLANATION_ALIGNMENT_GUIDE.md](../EXPLANATION_ALIGNMENT_GUIDE.md) - 전체 가이드
- [README_explanation_alignment.md](README_explanation_alignment.md) - 기술 문서

**Happy Exploring! 🚀**
