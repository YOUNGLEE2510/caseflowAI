import json
import os
import subprocess
import sys
from pathlib import Path
from apps.ai.models.classifier import classifier_pipeline
from apps.ai.models.text_utils import extract_entities


def test_rental_demo_taxonomy_and_training():
    examples = json.loads((Path(__file__).resolve().parents[1] / "data" / "rental_demo.json").read_text(encoding="utf-8"))
    assert set(examples) == {"water", "electrical", "internet", "appliances", "access_security", "general_support"}
    texts = [text for rows in examples.values() for text in rows]
    labels = [label for label, rows in examples.items() for _ in rows]
    assert len(texts) == len(set(texts)) == 60
    model = classifier_pipeline().fit(texts, labels)
    assert model.predict(["Bồn cầu bị tắc và nước trào ra sàn"])[0] == "water"
    assert model.predict(["Wifi không kết nối được internet"])[0] == "internet"


def test_rental_entities_are_hints_not_authorization():
    assert extract_entities("Nước yếu ở căn A301 tại TOWER-A")["unitCode"] == "A301"
    assert extract_entities("Nước yếu ở căn A301 tại TOWER-A")["propertyCode"] == "TOWER-A"

def test_rental_profile_configuration_in_fresh_process():
    result = subprocess.run([sys.executable, "-c",
        "from apps.ai.config import CATEGORY_NAMES,TRAINING_EXAMPLES; assert set(CATEGORY_NAMES)==set(TRAINING_EXAMPLES); assert 'water' in CATEGORY_NAMES; assert 'academic_records' not in CATEGORY_NAMES"],
        env={**os.environ, "DOMAIN_PROFILE": "rental"}, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
