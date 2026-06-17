# Output Format Guide — tab.format-spec

Este documento descreve o formato de output que o comando `tab.format-spec` gera.
O texto gerado serve como INPUT para o comando `speckit.specify`.

## Estrutura

```
ISSUE: {key}
TITLE: {título}
PRIORITY: {P0-P4}
EPIC: {link ou N/A}
COMPONENTS: {csv}
LABELS: {csv}
FIX_VERSION: {versão}

---

PROBLEM:
{texto}

IMPACT:
{texto}

---

FUNCTIONAL_REQUIREMENTS:
- RF-01: {texto}
- RF-02: {texto}

NON_FUNCTIONAL_REQUIREMENTS:
- RNF-01 [Performance]: {texto}
- RNF-02 [Security]: {texto}

---

ACCEPTANCE_CRITERIA:
- AC-01: Given {x}, When {y}, Then {z}
- AC-02: Given {x}, When {y}, Then {z}

---

CODEBASE_CONTEXT:
- {path}: {relevância}

EXISTING_PATTERNS:
- {padrão}

DEPENDENCIES:
- {dep}: {uso}

---

TECHNICAL_RECOMMENDATION:
{texto com abordagem, trade-offs, riscos}

REFERENCES:
- [Context7] {lib}: {info}
- [Codebase] {path}: {info}
- [External] {link}: {info}

---

OPEN_QUESTIONS:
- {pergunta ou assumption}
```

## Regras

1. Formato é TEXTO PLANO — não markdown
2. Separadores são `---` entre seções
3. Cada field label termina com `:` e valor na mesma linha ou linhas seguintes
4. Listas usam `- ` como prefixo
5. Campos sem informação: "N/A" ou "A ser determinado"
6. Gherkin obrigatório em ACCEPTANCE_CRITERIA
