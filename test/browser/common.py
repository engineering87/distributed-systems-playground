"""Shared setup for the browser suites: where the application is, and where to put artifacts."""
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
INDEX = os.environ.get('DSP_INDEX', str(ROOT / 'index.html'))
URL = INDEX if INDEX.startswith('http') else 'file://' + INDEX
OUT = pathlib.Path(os.environ.get('DSP_OUT', ROOT / 'test' / 'browser' / 'out'))
OUT.mkdir(parents=True, exist_ok=True)
