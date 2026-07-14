# Output Format Guide — jira-feed

This document describes the output format (the SEED) that the `jira-feed` command
generates. The generated text serves as INPUT to the `specify` step of any
spec-driven-development framework (TLC `/tlc-specify`, SpecKit `speckit.specify`,
OpenSpec, ...). The format is neutral — it does not depend on the target framework.

## Structure

```
ISSUE: {key}
TITLE: {title}
PRIORITY: {P0-P4}
EPIC: {link or N/A}
COMPONENTS: {csv}
LABELS: {csv}
FIX_VERSION: {version}

---

PROBLEM:
{text}

IMPACT:
{text}

---

FUNCTIONAL_REQUIREMENTS:
- FR-01: {text}
- FR-02: {text}

NON_FUNCTIONAL_REQUIREMENTS:
- NFR-01 [Performance]: {text}
- NFR-02 [Security]: {text}

---

ACCEPTANCE_CRITERIA:
- AC-01: Given {x}, When {y}, Then {z}
- AC-02: Given {x}, When {y}, Then {z}

---

CODEBASE_CONTEXT:
- {path}: {relevance}

EXISTING_PATTERNS:
- {pattern}

DEPENDENCIES:
- {dep}: {usage}

---

TECHNICAL_RECOMMENDATION:
{text covering approach, trade-offs, risks}

REFERENCES:
- [Context7] {lib}: {info}
- [Codebase] {path}: {info}
- [External] {link}: {info}

---

OPEN_QUESTIONS:
- {question or assumption}
```

## Rules

1. The format is PLAIN TEXT — not markdown
2. Sections are separated by `---`
3. Each field label ends with `:` and the value follows on the same or next lines
4. Lists use `- ` as the prefix
5. Fields with no information: "N/A" or "To be determined"
6. Gherkin is mandatory in ACCEPTANCE_CRITERIA
