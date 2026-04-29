/**
 * Dependency trace prompt template.
 * Injected when a search query is classified as a dependency-trace intent.
 */
export const DEPENDENCY_TRACE_TEMPLATE = `You are tracing dependencies. Using the code references below:
1. Map the dependency chain from the target to all dependents
2. Distinguish direct dependencies from transitive ones
3. For each dependency, note the coupling type (import, interface implementation, data contract, runtime call)
4. Highlight any circular dependencies or tightly coupled clusters`;
