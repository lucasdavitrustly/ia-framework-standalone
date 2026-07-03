# Contract: opencode.jsonc Trustly Provider Output

This contract defines the exact JSON structure the installer produces in `~/.config/opencode/opencode.jsonc` for the Trustly-Claude provider section.

## Expected Output (Trustly provider block)

```json
{
  "Trustly-Claude": {
    "options": {
      "baseURL": "https://gateway.prd.devtools.trustly.cloud",
      "apiKey": "<user-provided-token-or-empty-string>"
    },
    "models": {
      "bedrock-claude-sonnet-4-6": {
        "name": "Claude Sonnet 4.6 (Trustly Bedrock)"
      },
      "bedrock-claude-opus-4-8": {
        "name": "Claude Opus 4.8 (Trustly Bedrock)"
      },
      "bedrock-claude-haiku-4-5": {
        "name": "Claude Haiku 4.5 (Trustly Bedrock)"
      }
    }
  }
}
```

## Integration Point

This block is merged into the `provider` key of `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "Trustly-Claude": { /* ... as above ... */ }
  },
  "mcp": { /* ... existing MCPs ... */ }
}
```

## Invariants

1. The `baseURL` is always exactly `https://gateway.prd.devtools.trustly.cloud`
2. The `apiKey` is always a string (never `null`, never omitted)
3. All three models are always present (never partial)
4. The provider key is always `Trustly-Claude` (exact casing, hyphenated)
5. Existing content in the file is preserved (merge semantics)
