# MASSIVE vi-VN baseline run

Run date: 2026-09-10 (Asia/Saigon).

Source: [Amazon Science MASSIVE](https://huggingface.co/datasets/AmazonScience/massive), CC BY 4.0. See the downloaded publisher dataset card for attribution. This is an external Vietnamese intent benchmark, not CaseFlow case-routing evaluation.

Original rows: 16,521. After exact Unicode-normalized deduplication: 10,784 train, 1,969 validation, 2,928 test. Evaluation splits take precedence over training when texts repeat. Near-duplicate and annotation-conflict review remain limitations.

Compared fixed baselines: word TF-IDF + LinearSVC, word TF-IDF + LogisticRegression, character TF-IDF + LogisticRegression. Selection uses validation macro-F1, not test scores.

Selected: character TF-IDF + LogisticRegression.

- Test accuracy: 0.8299180327868853.
- Test macro-F1: 0.781029154670616.
- Full per-class precision/recall/F1, confusion matrix and incorrect source IDs: `artifacts/open-data/massive-vi/benchmark.json`.
- Raw checksums and dataset-card revision: `artifacts/open-data/massive-vi/manifest.json`.
- Verification: 13 AI tests passed.

These scores do not establish CaseFlow accuracy or an improvement over the deployed classifier. The production model and MongoDB were not changed. A model artifact was not deployed. Compare candidates on a separately annotated CaseFlow corpus before promotion.
