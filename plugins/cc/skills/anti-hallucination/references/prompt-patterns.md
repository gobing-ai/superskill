# Prompt Patterns for Anti-Hallucination

Research-backed prompt engineering patterns for detection, mitigation, and workflow. Based on 16 validated sources with 2,500+ citations.

> **Research Foundation**: CoVe (727+ citations), Nature 2024 (1,017+ citations), HaluEval 2.0 (226+ citations), UQLM (115+ citations). See `anti-hallucination-research.md` for complete source details.

## Detection Patterns

### CoVe (Chain-of-Verification)

**Source**: [Dhuliawala et al. 2023](https://arxiv.org/abs/2309.11495) (Meta AI, 727+ citations)

**Use for**: Complex factual queries, multi-part answers

```
Answer this question. Then:
1. List all factual claims in your answer
2. For each claim, verify it independently with sources
3. Revise your answer removing unverified claims

Question: {query}
```

**How it works**:
1. Model drafts initial response
2. Model plans verification questions
3. Model independently verifies each claim
4. Model generates final verified answer

### Self-Consistency Check

**Source**: [ANAH-v2](https://arxiv.org/abs/2407.04693), [Nature 2024](https://www.nature.com/articles/s41586-024-07421-0)

**Use for**: Detecting hallucination via inconsistency

```
Generate 3 different answers to this question.
Identify which claims appear consistently across ALL answers.
Inconsistent claims = potential hallucination.

Question: {query}
```

**Detection principle**: Genuine knowledge shows consistency across multiple generations; hallucinated content shows variation.

### Uncertainty Prompting

**Source**: [UQLM](https://arxiv.org/abs/2403.04696) (115+ citations)

**Use for**: Forcing explicit confidence expression

```
Answer with confidence level (HIGH/MEDIUM/LOW) for EACH claim.
Format: "Claim [X]: {content} (Confidence: HIGH)"

Question: {query}
```

**Benefit**: Makes uncertainty explicit rather than implied.

## Mitigation Patterns

### RAG Grounding

**Sources**: [AWS Bedrock](https://aws.amazon.com/blogs/machine-learning/reducing-hallucinations-in-large-language-models-with-custom-intervention-using-amazon-bedrock-agents/), [Comprehensive Survey 2024](https://arxiv.org/abs/2401.01313) (650+ citations)

**Use for**: Forcing context-based answers

```
Answer using ONLY this context. Say "I don't know from context" if not available.

Context: {retrieved_docs}
Question: {query}

For each sentence: [Source: context line X]
```

**Key principles**:
- Model cannot use outside knowledge
- Each claim must cite specific context
- "I don't know" is acceptable answer

### Chain-of-Thought with Verification

**Source**: [CoVe](https://arxiv.org/abs/2309.11495)

**Use for**: Stepwise reasoning with verification

```
Think step-by-step. After EACH step:
1. State the step
2. Verify the factual basis
3. Note if uncertain

Question: {query}
```

**Why it works**: Breaks complex reasoning into verifiable chunks.

### Few-Shot Verification

**Source**: [HaluEval 2.0](https://arxiv.org/pdf/2401.03205) (226+ citations)

**Use for**: Teaching verification by example

```
Examples:
✓ VERIFIED: "Python 3.11 added Self type" (PEP 673, official docs)
✗ UNVERIFIED: "Python recently added X feature" (no source cited)

Now answer with verification: {query}
```

**Teaching principle**: Show both good and bad examples before requesting output.

### Forced Attribution

**Sources**: [Voiceflow](https://www.voiceflow.com/blog/prevent-llm-hallucinations), [Lakera.ai](https://www.lakera.ai/blog/guide-to-hallucinations-in-large-language-models)

**Use for**: Requiring source for every claim

```
For EACH factual claim, provide:
- Claim: {statement}
- Source: {URL or reference}
- Confidence: HIGH/MEDIUM/LOW

Claims without sources = flagged as unverified.
```

**Detection method**: Claims without sources are automatically flagged.

## Workflow Patterns

### Verify-Before-Generate Protocol

**Sources**: [CoVe](https://arxiv.org/abs/2309.11495), [Comprehensive Survey 2025](https://arxiv.org/abs/2510.06265)

**Use for**: Complete verification pipeline

```
Query → Context Retrieval → Draft → Extract Claims → Verify Each → Revise → Final
                            ↓         ↓           ↓
                        What did     Is it       Source?
                        I claim?    true?
```

**Implementation**:
1. User submits query
2. System retrieves relevant context (RAG)
3. Model generates initial draft
4. Model extracts factual claims from draft
5. Model verifies each claim against context
6. Model revises answer removing unverified claims
7. System outputs final verified answer

### Iterative Refinement

**Source**: [ANAH-v2](https://arxiv.org/abs/2407.04693) (21+ citations)

**Use for**: Self-critique loop

```
1. Generate answer
2. Self-criticize: "What might be wrong?"
3. Refine based on critique
4. Repeat 2-3 times
```

**Effectiveness**: Each iteration improves factual accuracy by 5-10%.

### Multi-Agent Verification

**Source**: [AWS Bedrock Agents](https://aws.amazon.com/blogs/machine-learning/reducing-hallucinations-in-large-language-models-with-custom-intervention-using-amazon-bedrock-agents/)

**Use for**: Critical applications requiring maximum reliability

```
Agent 1: Generate answer
Agent 2: Extract factual claims
Agent 3: Verify each claim (with search)
Agent 4: Judge overall veracity
Agent 5: Intervene if hallucination detected
```

**Use cases**: Medical, legal, financial applications.

## Advanced Patterns

### Temperature Reduction

**Source**: [Lakera.ai](https://www.lakera.ai/blog/guide-to-hallucinations-in-large-language-models)

**Use for**: More deterministic outputs

```
Set temperature=0 or temperature=0.1 for factual queries
Higher temperatures (0.7-1.0) increase creativity but also hallucination risk
```

### Contextual Grounding Check

**Source**: [AWS Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-contextual-grounding-check.html)

**Use for**: Ensuring answers stay in context

```
Answer the question using ONLY the following context.
For each sentence in your answer, cite which part of the context supports it.
```

### Counterfactual Probing

**Source**: [Feng et al. 2025](https://arxiv.org/abs/2508.01862)

**Use for**: Testing robustness of knowledge

```
Generate a plausible alternative to this claim: "{claim}"
Does your confidence change? If yes, original claim may be unverified.
```

**Detection principle**: Genuine knowledge is robust to perturbations; hallucinated content shows inconsistent confidence.

## Pattern Selection Guide

| Situation | Best Pattern | Alternative |
|-----------|-------------|-------------|
| Complex factual query | CoVe | Self-Consistency |
| Need code examples | RAG + searchCode | Few-Shot |
| Recent information | WebSearch + verification | Temperature reduction |
| High-stakes output | Multi-Agent | Iterative Refinement |
| Teaching model | Few-Shot Verification | CoVe |
| Quick detection | Uncertainty Prompting | Self-Consistency |

## Combination Strategies

### For Maximum Reliability

```
1. RAG Grounding (context constraint)
2. Chain-of-Thought with Verification (stepwise checking)
3. CoVe (independent verification)
4. Uncertainty Prompting (confidence scoring)
5. Iterative Refinement (2-3 rounds)
```

### For Speed

```
1. RAG Grounding
2. Uncertainty Prompting
```

### For Teaching

```
1. Few-Shot Verification (show examples)
2. Chain-of-Thought with Verification (demonstrate reasoning)
```

## See Also

- `../SKILL.md` - Main protocol
- `anti-hallucination-research.md` - Complete research sources
- `tool-usage-guide.md` - MCP tool usage examples
- `guard-implementation.md` - Guard hook integration
