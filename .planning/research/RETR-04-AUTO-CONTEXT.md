# Research: RETR-04 Auto-Context Injection

**Date:** 2026-04-02
**Phase:** 10 — Advanced Retrieval & Workflow Integration
**Requirement:** RETR-04 — Auto-context mode prepends relevant codebase context to prompts automatically

## Verdict

**Deferred to v2.** No viable auto-injection mechanism exists in OpenCode today. Tool-based approach (RETR-02) is the practical alternative and is more token-efficient.

## Research Findings

### MCP Resources — NOT VIABLE

| Aspect | Finding |
|--------|---------|
| MCP Spec | Resources are "application-driven" — the host application decides how/when to include them. Spec says clients *could* implement auto-inclusion but this is explicitly optional. |
| OpenCode | Zero mention of Resources in docs. Only tools are exposed to the LLM: *"MCP tools are automatically available to the LLM alongside built-in tools."* |
| Conclusion | Even if OpenCode added resource support, inclusion is client-driven, not guaranteed. |

### MCP Prompts — NOT VIABLE

| Aspect | Finding |
|--------|---------|
| MCP Spec | Prompts are "user-controlled" — *"exposed from servers to clients with the intention of the user being able to explicitly select them."* Shown as slash commands in spec examples. |
| OpenCode | No mention of MCP prompts. OpenCode has its own commands system (markdown files), independent of MCP. |
| Conclusion | Wrong primitive for auto-context. User must explicitly select prompts. |

### OpenCode-Specific Mechanisms — NOT VIABLE (for dynamic content)

| Mechanism | Auto? | Dynamic? | Notes |
|-----------|-------|----------|-------|
| AGENTS.md / Rules | Yes | No | Always included. Static text only. |
| `instructions` config | Yes | No | Array of file paths/URLs. Static content. |
| Agent Skills | No | Yes | Model must explicitly call skill(). |
| Custom Tools | No | Yes | Model must call them. Fully supported. |
| Plugins | Partial | Yes | Hooks for tool.execute.before/after, session.compacting, message.updated. **No prompt.before or message.prepare hook.** |

### MCP Specification Architecture

| Primitive | Control | Who Decides | Auto-injectable? |
|-----------|---------|-------------|-----------------|
| Resources | Application-driven | The host app | Possible per spec, but OpenCode doesn't implement |
| Prompts | User-controlled | The human user | No — requires explicit action |
| Tools | Model-controlled | The LLM | Yes — LLM decides to call |

## Why Tool-Based Is Better for Tokens

The tool-based approach actually has better token efficiency than auto-injection because:
- Context is only retrieved when the model thinks it's needed
- The model can craft specific queries rather than getting a generic context dump
- No wasted tokens on irrelevant context for simple questions

## What Would Need to Change for v2

In priority order:

1. **Shortest path:** OpenCode adds a `prompt.before` plugin hook. ia-framework creates a plugin that calls Qdrant, retrieves relevant chunks, and injects them as system context before every LLM call. ~20 lines of plugin code.

2. **Medium path:** OpenCode implements MCP Resource support with the spec's `annotations.priority` field, and auto-includes high-priority resources. ia-framework serves indexed context as resources.

3. **Longest path:** MCP spec adds a server-push context primitive. Unlikely near-term.

## Sources

- OpenCode docs: intro, config, MCP servers, rules, agents, skills, custom tools, plugins
- MCP SDK TypeScript docs (Context7)
- MCP specification: modelcontextprotocol.io — resources, prompts pages
