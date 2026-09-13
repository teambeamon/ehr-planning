"""
Handler for Vercel Serverless Functions
Main entry point for Vercel Serverless Functions
"""
from .index import app

# Vercel Serverless Functions requires the app to be exported at module level
# This makes the FastAPI app accessible to Vercel's runtime
app = app

