#!/usr/bin/env python3
"""
Simple HTTP server for the explanation alignment demo

Usage:
    python serve_demo.py

Then open: http://localhost:8081/explanation_alignment_demo.html
"""

import http.server
import socketserver
import os
from pathlib import Path

PORT = 8081

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # CORS headers to allow loading data files
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def serve():
    # Change to frontend directory
    frontend_dir = Path(__file__).parent
    os.chdir(frontend_dir)

    print(f"""
╔═══════════════════════════════════════════════════════════════════╗
║  Explanation Alignment Demo Server                                ║
╚═══════════════════════════════════════════════════════════════════╝

🚀 Server starting on http://localhost:{PORT}

📂 Serving from: {frontend_dir}

🔗 Open in your browser:
   http://localhost:{PORT}/explanation_alignment_demo.html

📊 Data files:
   - Exact matching: ../data/explanation_alignment/alignment_exact.json
   - Semantic similarity: ../data/explanation_alignment/alignment_semantic.json

💡 Tips:
   - Toggle between Exact and Semantic modes
   - Hover over highlighted text to see details
   - Use the dropdown to select different features
   - Use Previous/Next buttons to navigate

Press Ctrl+C to stop the server
""")

    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n👋 Server stopped.")

if __name__ == "__main__":
    serve()
