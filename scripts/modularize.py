"""One-time, behavior-preserving extraction of existing domain modules."""
import ast
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
api = root / 'apps/api/src'
source = (api / 'models.ts').read_text(encoding='utf-8')
sections = re.split(r'/\* ── (.*?) ── \*/', source)
parts = dict(zip(sections[1::2], sections[2::2]))
folder = api / 'models'
folder.mkdir(exist_ok=True)
constants = parts['Constants'].strip()
types = source[source.index('export type UserRole'):]
(folder / 'constants.ts').write_text('import type mongoose from "mongoose";\n' + constants + '\n' + types, encoding='utf-8')
domains = [
 ('organization', 'Organization', ['Organization']),
 ('user', 'User', ['User']),
 ('service', 'ServiceDefinition', ['Service Definition']),
 ('case', 'CaseRecord', ['Timeline Event (sub-document)', 'Comment (sub-document)', 'Case Record']),
 ('incident', 'Incident', ['Incident']),
 ('knowledge', 'KnowledgeArticle', ['Knowledge Article']),
 ('notification', 'Notification', ['Notification']),
 ('attachment', 'Attachment', ['Attachment']),
 ('audit', 'AuditLog', ['Audit Log (append-only)']),
 ('ai-model', 'AIModel', ['AI Model Registry']),
 ('sla-snapshot', 'SLASnapshot', ['SLA Snapshot (for analytics)'])]
exports = ['export * from "./constants.js";']
for filename, name, keys in domains:
    body = '\n'.join(parts[key].strip() for key in keys)
    needed = [key for key in ['USER_ROLES', 'CASE_STATUSES', 'PRIORITIES', 'CHANNELS', 'INCIDENT_STATUSES', 'SEVERITY_LEVELS'] if key in body]
    header = 'import mongoose from "mongoose";\nconst { Schema, model, models } = mongoose;\n'
    if needed:
        header += 'import { ' + ', '.join(needed) + ' } from "./constants.js";\n'
    export = re.search(r'export const ' + name + r' = .*?;', source).group()
    (folder / (filename + '.ts')).write_text(header + '\n' + body + '\n\n' + export + '\n', encoding='utf-8')
    exports.append(f'export {{ {name} }} from "./{filename}.js";')
(folder / 'index.ts').write_text('\n'.join(exports) + '\n', encoding='utf-8')
(api / 'models.ts').write_text('export * from "./models/index.js";\n', encoding='utf-8')

ai = root / 'apps/ai'
source = (ai / 'main.py').read_text(encoding='utf-8')
tree = ast.parse(source)
lines = source.splitlines(keepends=True)
nodes = {}
for node in tree.body:
    name = getattr(node, 'name', None)
    if isinstance(node, ast.Assign):
        name = node.targets[0].id
    if name:
        start = min([node.lineno] + [d.lineno for d in getattr(node, 'decorator_list', [])])
        nodes[name] = ''.join(lines[start-1:node.end_lineno])
training = next(n for n in tree.body if isinstance(n, ast.Assign) and n.targets[0].id == 'TRAINING_EXAMPLES')
(ai / 'data/training_samples.json').write_text(json.dumps(ast.literal_eval(training.value), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(ai / 'models').mkdir(exist_ok=True)
(ai / 'routers').mkdir(exist_ok=True)
(ai / 'models/__init__.py').write_text('', encoding='utf-8')
(ai / 'routers/__init__.py').write_text('', encoding='utf-8')
(ai / 'config.py').write_text('import json\nfrom pathlib import Path\n\n' + nodes['CATEGORY_NAMES'] + '\n\nTRAINING_EXAMPLES = json.loads((Path(__file__).parent / "data/training_samples.json").read_text(encoding="utf-8"))\n', encoding='utf-8')
(ai / 'schemas.py').write_text('from typing import Literal\nfrom pydantic import BaseModel, Field\n\n' + '\n\n'.join(nodes[n] for n in ['TextRequest','SimilarItem','SimilarityRequest','SlaRequest','KnowledgeArticle','KnowledgeRequest']) + '\n', encoding='utf-8')
(ai / 'models/text_utils.py').write_text('import re\n\n' + nodes['summarize'] + '\n\n' + nodes['extract_entities'] + '\n', encoding='utf-8')
(ai / 'models/classifier.py').write_text('from sklearn.feature_extraction.text import TfidfVectorizer\nfrom sklearn.linear_model import LogisticRegression\nfrom sklearn.pipeline import Pipeline\nfrom ..config import TRAINING_EXAMPLES\nfrom .text_utils import summarize, extract_entities\n\n' + nodes['build_classifier'] + '\n\nclassifier = build_classifier()\n\n' + nodes['classify_text'] + '\n', encoding='utf-8')
(ai / 'models/sla_predictor.py').write_text('import numpy as np\nfrom sklearn.linear_model import LogisticRegression\nfrom sklearn.pipeline import Pipeline\nfrom sklearn.preprocessing import StandardScaler\n\n' + nodes['build_sla_model'] + '\n\nsla_model = build_sla_model()\n', encoding='utf-8')
common = 'from fastapi import APIRouter\nfrom ..schemas import *\nfrom ..config import TRAINING_EXAMPLES\nfrom ..models.classifier import classify_text\nfrom ..models.text_utils import summarize\nfrom ..models.sla_predictor import sla_model\nfrom sklearn.feature_extraction.text import TfidfVectorizer\nfrom sklearn.metrics.pairwise import cosine_similarity\nimport numpy as np\n\nrouter = APIRouter()\n\n'
routes = [('health','health'),('classify','classify'),('similarity','similarity'),('sla','predict_sla'),('knowledge','retrieve_knowledge')]
for filename, function in routes:
    (ai / f'routers/{filename}.py').write_text(common + nodes[function].replace('@app.', '@router.') + '\n', encoding='utf-8')
app = 'from fastapi import FastAPI\n' + '\n'.join(f'from .routers.{f} import router as {f}_router' for f,_ in routes) + '\n\n' + nodes['app'] + '\n'
app += '\n'.join(f'app.include_router({f}_router)' for f,_ in routes) + '\n'
(ai / 'app.py').write_text(app, encoding='utf-8')
compat = 'from apps.ai.app import app\nfrom apps.ai.config import TRAINING_EXAMPLES, CATEGORY_NAMES\nfrom apps.ai.schemas import *\nfrom apps.ai.models.classifier import build_classifier, classify_text, classifier\nfrom apps.ai.models.sla_predictor import build_sla_model, sla_model\nfrom apps.ai.models.text_utils import summarize, extract_entities\n'
compat += '\n'.join(f'from apps.ai.routers.{f} import {fn}' for f,fn in routes) + '\n'
(ai / 'main.py').write_text(compat, encoding='utf-8')
print('Extracted API schemas and AI modules; compatibility entry points retained.')
