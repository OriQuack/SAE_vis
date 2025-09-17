#!/usr/bin/env python3
"""
Startup script for SAE Feature Visualization API

This script provides a convenient way to start the FastAPI server
with proper logging configuration and environment setup.

Usage:
    python start.py [--host HOST] [--port PORT] [--reload] [--log-level LEVEL]

Example:
    python start.py --host 0.0.0.0 --port 8000 --reload --log-level info
"""

import uvicorn
import argparse
import logging
import sys
from pathlib import Path

def setup_logging(log_level: str = "info"):
    """Setup logging configuration"""
    numeric_level = getattr(logging, log_level.upper(), None)
    if not isinstance(numeric_level, int):
        raise ValueError(f'Invalid log level: {log_level}')

    logging.basicConfig(
        level=numeric_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
        ]
    )

def check_data_files():
    """Check if required data files exist"""
    data_path = Path("/home/dohyun/interface/data")
    master_file = data_path / "master" / "feature_analysis.parquet"

    if not master_file.exists():
        print(f"⚠️  Warning: Master data file not found at {master_file}")
        print("   The API will not function properly without this file.")
        print("   Please ensure your data preprocessing is complete.")
        return False
    else:
        print(f"✅ Found master data file: {master_file}")
        return True

def main():
    parser = argparse.ArgumentParser(description="Start SAE Feature Visualization API")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    parser.add_argument("--log-level", default="info", choices=["debug", "info", "warning", "error"],
                       help="Log level")

    args = parser.parse_args()

    # Setup logging
    setup_logging(args.log_level)

    # Check data files
    print("🔍 Checking data files...")
    data_ready = check_data_files()

    if not data_ready:
        response = input("\nData files not found. Continue anyway? (y/N): ")
        if response.lower() != 'y':
            print("Exiting...")
            sys.exit(1)

    print(f"\n🚀 Starting SAE Feature Visualization API...")
    print(f"   Host: {args.host}")
    print(f"   Port: {args.port}")
    print(f"   Reload: {args.reload}")
    print(f"   Log level: {args.log_level}")
    print(f"\n📖 API docs will be available at: http://{args.host}:{args.port}/docs")
    print(f"📊 Health check: http://{args.host}:{args.port}/health")

    try:
        uvicorn.run(
            "app.main:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
            log_level=args.log_level.lower(),
            access_log=True
        )
    except KeyboardInterrupt:
        print("\n👋 Shutting down gracefully...")
    except Exception as e:
        print(f"\n❌ Failed to start server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()