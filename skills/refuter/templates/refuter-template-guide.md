## HTML Report Template — Placeholder Reference

This document defines the placeholders the `refuter-report-writer` subagent must fill.

### Header Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{ROLE_LABEL}}` | Human-readable role name | "Product Manager", "Engineer", "QA Team" |
| `{{HEADER_COLOR_START}}` | Gradient start color (hex) | PM: `#6366f1`, DEV: `#059669`, QA: `#d97706` |
| `{{HEADER_COLOR_END}}` | Gradient end color (hex) | PM: `#8b5cf6`, DEV: `#10b981`, QA: `#f59e0b` |
| `{{REPORT_TITLE}}` | Main title | "Refutation Report — Product Manager" |
| `{{REPORT_SUBTITLE}}` | Context line | "Key risks and decisions requiring attention" |
| `{{DATE}}` | ISO date | "2026-06-08" |
| `{{SPEC_DIR}}` | Spec directory path | "specs/" |
| `{{TOTAL_FINDINGS}}` | Count of findings for this role | "7" |

### Summary Card Placeholders

| Placeholder | PM | DEV | QA |
|-------------|-----|-----|-----|
| `{{BLOCKER_COUNT}}` | Count | Count | Count |
| `{{BLOCKER_LABEL}}` | "Launch Risks" | "Fix Before Merge" | "Cannot Verify" |
| `{{WARNING_COUNT}}` | Count | Count | Count |
| `{{WARNING_LABEL}}` | "Needs Attention" | "Tech Debt" | "Coverage Gaps" |
| `{{INFO_COUNT}}` | Count | Count | Count |
| `{{INFO_LABEL}}` | "Nice to Know" | "Improvements" | "Edge Cases" |

### Section Title Placeholders

| Placeholder | PM | DEV | QA |
|-------------|-----|-----|-----|
| `{{SECTION_TITLE_CRITICAL}}` | "Launch Risks" | "Must Fix" | "Cannot Verify" |
| `{{SECTION_TITLE_WARNINGS}}` | "Needs Decision" | "Technical Debt" | "Coverage Gaps" |
| `{{SECTION_TITLE_INFO}}` | "Context & Opportunities" | "Improvement Opportunities" | "Edge Cases to Consider" |

### Finding Block

Each finding in `{{FINDINGS_CRITICAL}}`, `{{FINDINGS_WARNINGS}}`, `{{FINDINGS_INFO}}` must be rendered as:

```html
<div class="finding {severity_class}">
  <div class="finding-header">
    <span class="finding-title">{role_adapted_title}</span>
    <span class="finding-badge {severity_class}">{severity_label}</span>
  </div>
  <span class="finding-dimension">{dimension}</span>
  <dl class="finding-body">
    <dt>{role_specific_field_1_label}</dt>
    <dd>{value}</dd>
    <dt>{role_specific_field_2_label}</dt>
    <dd>{value}</dd>
  </dl>
  <div class="recommendation-box">
    <h4>{recommendation_header}</h4>
    <p>{role_adapted_recommendation}</p>
  </div>
</div>
```

Where `{severity_class}` is: `blocker`, `warning`, or `info`.

### Role-Specific Field Labels

**PM findings show:**
- "Business Impact" (from Impact field)
- "What happened" (from Source, simplified)
- "Decision needed" (Recommendation adapted as question/tradeoff)
- Must not include raw technical internals (file paths, stack traces, API signatures, refactor-only details)

**DEV findings show:**
- "Location" (file:line from Source)
- "Technical Detail" (from Source quote + Counter-reference)
- "Suggested Fix" (Recommendation as code action)
- Must not include business-only prioritization items without concrete technical action

**QA findings show:**
- "Affected Requirement" (from Source)
- "Test Gap" (Impact framed as coverage issue)
- "Test Cases to Add" (Recommendation as test scenarios)
- Must not include implementation-only cleanup that does not alter testability

### Role Filtering and Empty-State Rules

- Filter findings by role relevance before rendering cards.
- If a role has zero relevant findings, still generate the HTML report file.
- For zero-findings reports:
  - Set all counts to `0`.
  - Render empty message in each section:
    - Critical: `No critical findings for this role.`
    - Warnings: `No warnings for this role.`
    - Info: `No additional findings for this role.`
  - Render prioritized actions with one line item:
    - `No prioritized actions for this role.`

### Recommendations Summary

`{{RECOMMENDATIONS_SUMMARY}}` is a prioritized bullet list:

```html
<ol>
  <li><strong>{priority_1_title}</strong> — {one_line_action}</li>
  <li><strong>{priority_2_title}</strong> — {one_line_action}</li>
  ...
</ol>
```

Ordered by severity (BLOCKERs first, then WARNINGs).
