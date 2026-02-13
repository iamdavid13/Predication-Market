import traceback, sys
try:
    import main
    print('import OK')
except Exception:
    traceback.print_exc()
    sys.exit(1)
