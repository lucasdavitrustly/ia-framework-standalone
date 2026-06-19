<!--
  Capture report template for /mcp-bench-run and /mcp-bench-baseline.
  The YAML front-matter is machine-parsable (read by /mcp-bench-judge).
  The body is human-readable and contains the full model response so it can be
  judged later. Substitute every {{PLACEHOLDER}}. For baseline runs, the mcp.*
  fields are all 0 and mcp_enabled is false.
-->

---

prompt_slug: {{PROMPT_SLUG}}
prompt: {{PROMPT_QUOTED}}
model: {{MODEL}}
provider: {{PROVIDER}}
temperature: {{TEMPERATURE}}
mcp_enabled: {{MCP_ENABLED}}
timestamp: {{TIMESTAMP_ISO}}
latency_ms_total: {{LATENCY_MS_TOTAL}}
mcp:
tool_calls: {{MCP_TOOL_CALLS}}
input_tokens: {{MCP_INPUT_TOKENS}}
output_tokens: {{MCP_OUTPUT_TOKENS}}
avg_duration_ms: {{MCP_AVG_DURATION_MS}}
tokens:
session_input: {{SESSION_INPUT_TOKENS}}
session_output: {{SESSION_OUTPUT_TOKENS}}
cost_usd: {{COST_USD}}
cost_basis: "model-pricing.json@v1"

---

# mcp-bench report — {{PROMPT_SLUG}} ({{MCP_LABEL}})

**Prompt:** {{PROMPT_PLAIN}}

**Mode:** {{MCP_LABEL}} · **Model:** {{MODEL}} · **Captured:** {{TIMESTAMP_ISO}}

## Metrics

| Metric                | Value                      |
| --------------------- | -------------------------- |
| Total latency         | {{LATENCY_MS_TOTAL}} ms    |
| MCP tool calls        | {{MCP_TOOL_CALLS}}         |
| MCP input tokens      | {{MCP_INPUT_TOKENS}}       |
| MCP output tokens     | {{MCP_OUTPUT_TOKENS}}      |
| MCP avg tool duration | {{MCP_AVG_DURATION_MS}} ms |
| Session input tokens  | {{SESSION_INPUT_TOKENS}}   |
| Session output tokens | {{SESSION_OUTPUT_TOKENS}}  |
| Estimated cost        | {{COST_USD}} USD           |

## Response

{{RESPONSE_BODY}}

---LLM-IDENTITY---
Model: {{MODEL}}
Provider: {{PROVIDER}}
Temperature: {{TEMPERATURE}}
---END-IDENTITY---
