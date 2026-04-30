# Plan 30-03 Summary — Integration Tests via parseFile()

## Status: COMPLETE

## Commit

`192f368` — test(ast-parser): add integration tests for decorator/annotation preservation (Plan 30-03)

## What Was Done

Added a `describe('decorator and annotation preservation')` block to
`packages/ast-parser/src/chunker.test.ts` with 5 integration tests exercising
the full `parseFile()` pipeline:

1. **Java @Transactional + @CacheEvict on method** — verifies both annotations
   appear in the `function` chunk content for `updateOrder`.
2. **Java @Aspect class → single aspect chunk** — verifies `AuditAspect` produces
   exactly one chunk with `chunkType === 'aspect'`, containing `@Aspect` and
   `@Before`.
3. **Java regular @Service class is not treated as aspect** — verifies
   `PaymentService` gets `chunkType === 'class'`, not `'aspect'`.
4. **TypeScript @Injectable() in class chunk** — verifies `UserService` class
   chunk content includes the `@Injectable` decorator.
5. **TypeScript @Get() in method sub-chunk** — verifies `findOne` function chunk
   content includes the `@Get` decorator.

Also fixed a pre-existing test bug: `toBe('Base')` → `toBe('BaseService')` for
the "extracts superclass and interfaces from class extends + implements" test at
`chunker.test.ts:816`.

## Test Results

- 75 tests pass (4 test files)
- 0 failures
