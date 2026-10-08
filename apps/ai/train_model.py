"""Build trusted classifier artifacts outside the request path."""
import argparse
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from apps.ai.models.classifier import VARIANTS, load_or_train

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=VARIANTS, default="word")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "models")
    args = parser.parse_args()
    _, metadata = load_or_train(args.variant, args.output)
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
