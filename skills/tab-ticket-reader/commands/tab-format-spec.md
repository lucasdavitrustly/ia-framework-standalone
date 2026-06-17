---
name: tab.format-spec
description: >
  Transforma um ticket JIRA em input estruturado para speckit.specify.
  Obtém dados do ticket via MCP JIRA, analisa codebase via ia-framework,
  pesquisa docs via Context7, e gera texto resumido pronto para o speckit.specify.
argument-hint: "<ISSUE-KEY>"
tools:
  read: true
  bash: true
  glob: true
  grep: true
  agent: true
  question: true
  webfetch: true
  websearch: true
---

<objective>
Transformar um ticket JIRA em texto estruturado que serve de INPUT para o comando speckit.specify.

O output NÃO é a spec final — é o resumo técnico formatado que alimenta o speckit.specify.

Argumento obrigatório: `$ARGUMENTS` = JIRA issue key (ex: DEV-12345)
</objective>

<process>
## Fluxo de Execução

### 1. Obter dados do JIRA

Use o MCP JIRA para buscar o ticket `$ARGUMENTS`. Extraia:
- Summary (título)
- Description (descrição completa)
- Acceptance Criteria (critérios de aceite)
- Labels, Components, Fix Version
- Epic Link, Linked Issues
- Priority, Story Points
- Comments relevantes do time

Se o MCP JIRA não estiver disponível, informe o usuário e pare.

### 2. Analisar o Codebase

Prioridade de ferramentas:
1. `mcp_ia-framework_search_codebase_hybrid` — busca híbrida BM25 + semântica
2. `mcp_ia-framework_search_codebase` — semântica pura
3. `mcp_ia-framework_get_file` — arquivo específico
4. grep/glob/read nativos — fallback universal

Busque:
- Módulos/arquivos relacionados ao domínio do ticket
- Padrões de implementação existentes (como problemas similares foram resolvidos)
- Dependências e integrações relevantes

### 3. Pesquisa Profunda (State of the Art)

Use o MCP Context7:
1. `resolve-library-id` → identificar libs/frameworks mencionados no ticket
2. `query-docs` → best practices e padrões atualizados

Complementar com web search para:
- Padrões arquiteturais aplicáveis
- Standards e RFCs relevantes

### 4. Clarificar com o Owner (se necessário)

Se existirem ambiguidades CRÍTICAS que impedem a geração do input:
- Use `question` tool (max 3 perguntas focadas)
- Se indisponível, documente as ambiguidades no output

### 5. Gerar Output (Input para speckit.specify)

O output final deve seguir EXATAMENTE o formato abaixo — este texto será consumido
pelo comando `speckit.specify` para gerar a especificação técnica completa.
</process>

<output-format>
## Formato do Output

```
ISSUE: {ISSUE-KEY}
TITLE: {título do ticket}
PRIORITY: {P0-P4}
EPIC: {epic link ou "N/A"}
COMPONENTS: {lista separada por vírgula}
LABELS: {lista separada por vírgula}
FIX_VERSION: {versão alvo}

---

PROBLEM:
{Descrição objetiva do problema a resolver, sintetizada a partir do JIRA + contexto do codebase}

IMPACT:
{Quem é afetado, qual o impacto de não resolver}

---

FUNCTIONAL_REQUIREMENTS:
- {RF-01}: {requisito derivado do ticket}
- {RF-02}: {requisito derivado do ticket}

NON_FUNCTIONAL_REQUIREMENTS:
- {RNF-01} [Performance]: {critério mensurável}
- {RNF-02} [Security]: {critério}
- {RNF-03} [Observability]: {critério}

---

ACCEPTANCE_CRITERIA:
- AC-01: Given {pré-condição}, When {ação}, Then {resultado}
- AC-02: Given {pré-condição}, When {ação}, Then {resultado}

---

CODEBASE_CONTEXT:
- {path/to/file.ts}: {relevância — o que faz, por que importa}
- {path/to/module/}: {relevância}

EXISTING_PATTERNS:
- {Padrão identificado no código que pode ser reutilizado}

DEPENDENCIES:
- {Dependência existente}: {como será usada}
- {Dependência nova sugerida}: {justificativa baseada na pesquisa}

---

TECHNICAL_RECOMMENDATION:
{Abordagem recomendada baseada na pesquisa Context7 + análise do codebase.
 Inclua: padrão sugerido, trade-offs identificados, riscos.}

REFERENCES:
- [Context7] {lib/framework}: {trecho relevante}
- [Codebase] {path}: {descrição}
- [External] {link ou RFC}: {resumo}

---

OPEN_QUESTIONS:
- {Pergunta não respondida ou assumption feita}
- {Ambiguidade identificada}
```
</output-format>

<constraints>
## Regras

1. NUNCA gere código — apenas o input textual para speckit.specify
2. SEMPRE cite fontes (Context7 docs, codebase paths, JIRA links)
3. Escreva na mesma língua do ticket JIRA (PT-BR ou EN)
4. Se um campo não tem informação disponível, use "N/A" ou "A ser determinado"
5. Priorize `ia-framework` sobre bash para busca no codebase
6. Critérios de aceite DEVEM usar formato Gherkin (Given/When/Then)
7. O output é TEXTO PLANO estruturado — não markdown formatado
8. Máximo 3 perguntas ao owner via question tool
</constraints>
