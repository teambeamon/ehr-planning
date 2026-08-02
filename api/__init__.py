"""
API package init
Exports the FastAPI app for Vercel Serverless Functions
"""

# Import app from the main module
from .index import app

# This makes app available at package level
__all__ = ['app']
