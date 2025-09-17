# SAE Feature Visualization API

A high-performance FastAPI backend for visualizing Sparse Autoencoder (SAE) feature explanation reliability. This API powers an interactive data visualization interface for the EuroVIS conference submission.

## Overview

This API provides endpoints for:
- **Filter Options**: Get available filter values for UI controls
- **Histogram Data**: Generate distribution visualizations for threshold setting
- **Sankey Diagrams**: Multi-stage feature flow visualization
- **Comparison Data**: Alluvial diagrams comparing different configurations (Phase 2)
- **Feature Details**: Individual feature information for debugging

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Verify Data Files

Ensure your data preprocessing is complete and the master Parquet file exists:
```bash
ls -la /home/dohyun/interface/data/master/feature_analysis.parquet
```

### 3. Start the Server

**Development mode (with auto-reload):**
```bash
python start.py --reload --log-level debug
```

**Production mode:**
```bash
python start.py --host 0.0.0.0 --port 8000
```

### 4. Access the API

- **Interactive docs**: http://localhost:8000/docs
- **Health check**: http://localhost:8000/health
- **ReDoc docs**: http://localhost:8000/redoc

## API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/filter-options` | Get available filter values |
| POST | `/api/histogram-data` | Generate histogram for threshold setting |
| POST | `/api/sankey-data` | Generate Sankey diagram data |
| POST | `/api/comparison-data` | Generate alluvial comparison data |
| GET | `/api/feature/{id}` | Get individual feature details |

### Example Requests

**Get filter options:**
```bash
curl -X GET "http://localhost:8000/api/filter-options"
```

**Get histogram data:**
```bash
curl -X POST "http://localhost:8000/api/histogram-data" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "sae_id": ["gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120"]
    },
    "metric": "semdist_mean",
    "bins": 20
  }'
```

**Generate Sankey data:**
```bash
curl -X POST "http://localhost:8000/api/sankey-data" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "sae_id": ["gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120"],
      "explanation_method": ["quantiles"]
    },
    "thresholds": {
      "semdist_mean": 0.15,
      "score_high": 0.8
    }
  }'
```

## Data Processing Pipeline

The API processes data through multiple stages:

### Stage 1: Feature Splitting
- Divides features based on `feature_splitting` boolean
- Creates "True" and "False" categories

### Stage 2: Semantic Distance
- Classifies features as "High" or "Low" semantic distance
- Uses user-defined `semdist_mean` threshold

### Stage 3: Score Agreement
- Groups features into 4 categories based on score agreement:
  - **All 3 High**: All scores (fuzz, simulation, detection) ≥ threshold
  - **2 of 3 High**: Exactly 2 scores ≥ threshold
  - **1 of 3 High**: Exactly 1 score ≥ threshold
  - **All 3 Low**: All scores < threshold

## Performance Features

- **Polars**: High-performance columnar data processing
- **Lazy Evaluation**: Efficient query planning and execution
- **Caching**: Filter options and histogram data cached for speed
- **Async**: Non-blocking I/O for concurrent requests

## Development

### Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI application
│   ├── api/
│   │   ├── __init__.py      # API router setup
│   │   └── endpoints/       # Individual endpoint modules
│   ├── models/              # Pydantic models
│   │   ├── requests.py      # Request schemas
│   │   ├── responses.py     # Response schemas
│   │   └── common.py        # Shared models
│   └── services/
│       └── data_service.py  # Core data processing
├── docs/
│   └── api_specification.md # Complete API documentation
├── requirements.txt         # Dependencies
├── start.py                # Startup script
└── README.md               # This file
```

### Adding New Endpoints

1. Create endpoint module in `app/api/endpoints/`
2. Add router import to `app/api/__init__.py`
3. Add request/response models if needed
4. Update API documentation

### Testing

**Manual testing with curl:**
```bash
# Test health check
curl http://localhost:8000/health

# Test filter options
curl http://localhost:8000/api/filter-options
```

**Using Python requests:**
```python
import requests

# Test the API
response = requests.get("http://localhost:8000/api/filter-options")
print(response.json())
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {
      "field_name": "additional_context"
    }
  }
}
```

### Common Error Codes

- `INVALID_FILTERS`: Invalid filter values
- `INVALID_THRESHOLDS`: Threshold values out of range
- `INSUFFICIENT_DATA`: No data after filtering
- `FEATURE_NOT_FOUND`: Requested feature doesn't exist
- `SERVICE_UNAVAILABLE`: Data service not ready
- `INTERNAL_ERROR`: Unexpected server error

## Data Requirements

The API expects the following data structure:

### Master Parquet File
- **Location**: `/home/dohyun/interface/data/master/feature_analysis.parquet`
- **Schema**: See `docs/api_specification.md` for complete schema

### Detailed JSON Files
- **Location**: `/home/dohyun/interface/data/detailed_json/`
- **Format**: Individual feature detail files (referenced by `details_path`)

## Monitoring

### Health Check
```bash
curl http://localhost:8000/health
```

Response indicates:
- API server status
- Data service connection status

### Logs

The API provides structured logging:
- Request/response logging
- Error tracking with stack traces
- Performance metrics
- Data service status

## Configuration

### Environment Variables

Currently no environment variables are required, but you may want to set:

```bash
export LOG_LEVEL=debug
export API_HOST=0.0.0.0
export API_PORT=8000
```

### CORS

The API is configured to allow requests from:
- `http://localhost:3000` (React dev server)
- `http://localhost:5173` (Vite dev server)

## Performance Tuning

### For Large Datasets

If working with datasets >50k rows:

1. **Increase worker processes**:
   ```bash
   uvicorn app.main:app --workers 4
   ```

2. **Tune Polars settings**:
   ```python
   import polars as pl
   pl.Config.set_streaming_chunk_size(10000)
   ```

3. **Add database indexing** (if migrating from Parquet):
   - Index on filter columns
   - Index on feature_id for lookups

## Future Enhancements

- [ ] Implement comparison data generation (Phase 2)
- [ ] Add request rate limiting
- [ ] Add API key authentication
- [ ] Add response caching with Redis
- [ ] Add database backend option
- [ ] Add batch processing for large requests

## Contributing

1. Follow PEP 8 style guidelines
2. Add type hints to all functions
3. Include docstrings for public methods
4. Add error handling for edge cases
5. Update API documentation for new features