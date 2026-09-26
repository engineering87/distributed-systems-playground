"""Shared setup for the browser suites: where the application is, and where to put artifacts."""
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
INDEX = os.environ.get('DSP_INDEX', str(ROOT / 'index.html'))
URL = INDEX if INDEX.startswith('http') else 'file://' + INDEX
OUT = pathlib.Path(os.environ.get('DSP_OUT', ROOT / 'test' / 'browser' / 'out'))
OUT.mkdir(parents=True, exist_ok=True)

# chromium, firefox or webkit; the suites use launcher(playwright) instead of naming one
BROWSER = os.environ.get('DSP_BROWSER', 'chromium')


def context_args(**kwargs):
    """Context options, minus the ones the chosen browser refuses.

    Firefox does not support isMobile; dropping it leaves the viewport and the touch
    support, which is what the suites actually exercise.
    """
    if BROWSER == 'firefox':
        kwargs.pop('is_mobile', None)
    return kwargs


def launcher(pw):
    """The browser type chosen by DSP_BROWSER, for `await launcher(p).launch()`."""
    if BROWSER not in ('chromium', 'firefox', 'webkit'):
        raise SystemExit('DSP_BROWSER must be chromium, firefox or webkit, not ' + BROWSER)
    return getattr(pw, BROWSER)
