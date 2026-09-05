# Research and evidence limits

Primary sources reviewed for guidance available through **2026-08-31**. These sources describe
specific experiments, software or vendor practices; none certifies this skill. No benchmark was
reproduced here. Dates identify the cited revision or article, not necessarily first publication.

## Verification and uncertainty research

| Primary source | Version / date | What it establishes and what it does not |
| --- | --- | --- |
| [Chain-of-Verification](https://arxiv.org/abs/2309.11495v2) | v2, 2023-09-25 | Draft an answer, generate verification questions, answer those questions independently, then revise. External retrieval is not intrinsic to the paper's method. The source-checking prompts in this skill are local adaptations. |
| [HaluEval 2.0](https://arxiv.org/html/2401.03205v1) | v1, 2024-01-06 | Evaluates 8,770 questions. GPT-4 judges extracted statements jointly, since isolated judgments can miss their relationships; human validation samples 1,000 questions. It does not evaluate this skill's generic verification prompts. |
| [Semantic entropy](https://www.nature.com/articles/s41586-024-07421-0) | 2024-06-19 | Groups sampled answers by meaning and estimates entropy to detect confabulations. It does not catch every systematic error. Asking for two answers is not the paper's estimator, and agreement is not proof. |
| [UQLM](https://arxiv.org/abs/2507.06196v2) / [official repository](https://github.com/cvs-health/uqlm) | v2, 2026-01-26 | Provides response-level uncertainty scorers, including black-box, white-box, judge and ensemble approaches. It does not calibrate a prompt's verbal HIGH/MEDIUM/LOW labels. |
| [Counterfactual probing, Yijun Feng](https://arxiv.org/html/2508.01862v1) | v1, 2025-08-03 | Uses factual, temporal, quantitative and logical probe types with confidence comparison and scoring. Simply considering an alternative is a local review technique, not an implementation of the algorithm. |
| [FactCheckmate](https://arxiv.org/abs/2410.02899v2) / [Findings of EMNLP](https://aclanthology.org/2025.findings-emnlp.663/) | v2, 2025-06-24; Findings 2025 | Trains a classifier over pre-decoding hidden states and intervenes in hidden states. This requires model access beyond ordinary coding-agent prompts; it does not validate a source-search/revision workflow. |

Do not transfer a paper's percentage improvement to this skill or another model. UQLM was
previously linked here to `2403.04696`, which is a different paper, and an incorrect repository;
those citations and the token-level-only description were corrected. Verbal confidence remains a
communication aid unless calibration has actually been measured.

## Coding-agent context and harness evidence

| Primary source | Version / date | Applicable lesson and limit |
| --- | --- | --- |
| [Evaluating AGENTS.md / CTXbench](https://arxiv.org/html/2602.11988v2) | v2, 2026-06-23 | Context files did not generally improve task resolution and increased average inference cost in the evaluated Python tasks. File length had no significant relationship with success. The study does not justify a universal byte ceiling or establish security performance. |
| [New rules of context engineering](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) | 2026-07-24 | Reassess overlapping generic rules and unnecessary scaffolding as models change. Anthropic's prompt-reduction result concerns Claude 5 and its internal evaluation; it does not justify deleting operator-specific requirements. |
| [Maximizing Claude Code sessions](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions) | 2026-08-14 | Inspect actually loaded context and bound noisy output. Caching separates token volume from billed cost; measure the actual host and workload. |
| [How we contain Claude](https://www.anthropic.com/engineering/how-we-contain-claude) | 2026-05-25 | Tools, persistent memory and subagent outputs can carry malicious instructions. Preserve provenance and enforce permissions in the host; prompt instructions alone do not establish resistance. |
| [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 2026-01-09 | Evaluate outcomes and traces over repeated isolated trials. A lexical validator or instruction-quality score does not prove that citations were checked or that an answer is correct. |
| [Multi-agent scaling](https://arxiv.org/abs/2607.27942v1) | v1, 2026-07-30 | A two-model terminal-task study found performance peaked at intermediate complexity, with consistency challenges. It neither sets a universal agent count nor validates a particular reviewer/adjudicator prompt. |

## Applying the evidence

The [main protocol](../SKILL.md) owns the operational instructions. The
[prompt patterns](prompt-patterns.md) are optional local adaptations, not replicas of the papers.
Prefer a direct source check for a routine claim. Add retrieval, independent review or a measured
uncertainty estimator only when the task and available capabilities justify it.

Evaluate changes on the target model, harness and workload. Record factual support, task success,
abstention quality, unauthorized actions, unnecessary approval requests, latency and cost as relevant.
A guard pass establishes only its documented pattern checks; inspect the underlying evidence.
