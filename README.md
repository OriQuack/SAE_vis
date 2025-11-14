# SAE Feature Visualization Platform

Interactive visualization platform for exploring Sparse Autoencoder (SAE) feature explanations across multiple LLM models.

## Prerequisites

- **Python 3.8+** with pip
- **Node.js 16+** with npm

## Running the Demo

### 1. Start Backend Server

Open a terminal and run:

```bash
cd backend
pip install -r requirements.txt
python start.py
```

Backend will start at http://localhost:8003

### 2. Start Frontend Server

Open a **new terminal** and run:

```bash
cd frontend
npm install
npm run dev
```

Frontend will start at http://localhost:3003

### 3. Open Application

Visit **http://localhost:3003** in your browser.

---

**For detailed documentation**, see `CLAUDE.md` in the root directory.
