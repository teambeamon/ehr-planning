"""
Handler for Vercel Serverless Functions
Exports the FastAPI app from index.py
"""
from .index import app

# Explicit export for Vercel Serverless Functions
app = app
