# Quick Task 260402-j1g: Add Ollama embedding model selection capability - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Task Boundary

Add capability of Ollama to change between LLMs for embedding. User needs to choose/add one during the install.sh run, and after they can add others. Every time we index the database we should choose which LLM to use.

</domain>

<decisions>
## Implementation Decisions

### Model selection at index time
- Use the model configured in project.json as the default
- If user passes `--model <name>` flag to `ia-framework index`, use that model instead
- When `--model` is provided, auto-pull the model if not already available in Ollama (skip pull if already installed), then proceed with indexing
- If no model is configured in project.json at all, always prompt the user interactively to select one
- On any error (model pull failure, embedding failure), log the error clearly in CLI and ask user to try again
- To change the persistent default, user edits project.json

### Install-time model discovery
- During install.sh, run `ollama list` to auto-detect which models are already pulled on the system
- Show the already-pulled models as options to choose from
- Also provide an option to type a custom model name (for models not yet pulled)
- If user picks a custom model not yet pulled, auto-pull it during install
- Save the selected model to project.json config

### Re-indexing on model change
- When the user switches to a different embedding model (via --model flag or config change), detect the mismatch with existing indexed vectors
- Warn the user that existing vectors are incompatible with the new model
- Ask for confirmation: proceed with re-index or abort
- If user confirms, delete the existing Qdrant collection and re-index with the new model
- If user aborts, exit without changes

</decisions>

<specifics>
## Specific Ideas

- The `persistProfile()` function in project-detector already accepts `embeddingProvider` and `embeddingModel` options but nothing passes them -- wire these up during install
- The factory's `DEFAULT_DIMENSIONS` map already covers 3 Ollama models (nomic-embed-text, mxbai-embed-large, all-minilm) -- use this for dimension auto-detection
- For unknown custom models without dimensions in the map, query Ollama's model info endpoint or require the user to specify dimensions
- Error logging should use the existing CLI output patterns, not raw console.log

</specifics>

<canonical_refs>
## Canonical References

No external specs -- requirements fully captured in decisions above

</canonical_refs>
