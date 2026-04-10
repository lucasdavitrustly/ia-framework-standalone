# LLM Chunking Spike Report

**Date:** 2026-04-10T14:26:00.532Z
**Model:** llama3.2:latest (3.2B)
**Context Window:** 131072 tokens
**Files Processed:** 6

## Verdict

**GO** — Latency: PASS (max 49681ms, ceiling 60000ms) | JSON validity: PASS (100.0%, required 100%) | Determinism: PASS (3/3 files identical across 5 runs)

## Hard Criteria Results

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Latency ≤ 60s/file | PASS ✓ | Max: 49681ms |
| 100% Valid JSON | PASS ✓ | 100.0% |
| Deterministic Boundaries | PASS ✓ | 3/3 files identical across 5 runs |

## Latency by File Size

| File | Lines | Category | Duration (ms) | Tokens/sec | Windowed |
|------|-------|----------|---------------|------------|----------|
| adapters/payment-gateway-fifththird-rtp/src/main/java/com/paywithmybank/paypro/fifththird/rtp/application/command/resume/strategy/ResumeEntryReject.java | 50 | small | 4484 | 55.8 | No |
| adapters/payment-gateway-fifththird-rtp/src/main/java/com/paywithmybank/paypro/fifththird/rtp/application/command/resume/strategy/ResumeEntryFailover.java | 51 | small | 3086 | 54.1 | No |
| adapters/payment-gateway-generic-ach/src/test/java/com/paywithmybank/paypro/generic/ach/application/command/process/ProcessReaderImplTest.java | 199 | medium | 46789 | 50.9 | No |
| payment-gateway-server/src/test/acceptance/java/com/paywithmybank/paypro/config/ContextInitializer.java | 197 | medium | 5853 | 51.9 | No |
| adapters/payment-gateway-generic-ach/src/test/java/com/paywithmybank/paypro/generic/ach/application/command/returns/ReturnEntriesHandlerTest.java | 499 | large | 37660 | 43.3 | No |
| payment-gateway-core/src/main/java/com/paywithmybank/paypro/core/entry/EntryCore.java | 536 | large | 49681 | 44.7 | No |

## Determinism Results

### adapters/payment-gateway-fifththird-rtp/src/main/java/com/paywithmybank/paypro/fifththird/rtp/application/command/resume/strategy/ResumeEntryReject.java

- Runs: 5
- Identical: ✓ Yes

### adapters/payment-gateway-generic-ach/src/test/java/com/paywithmybank/paypro/generic/ach/application/command/process/ProcessReaderImplTest.java

- Runs: 5
- Identical: ✓ Yes

### adapters/payment-gateway-generic-ach/src/test/java/com/paywithmybank/paypro/generic/ach/application/command/returns/ReturnEntriesHandlerTest.java

- Runs: 5
- Identical: ✓ Yes

## AST vs LLM Comparison

### adapters/payment-gateway-fifththird-rtp/src/main/java/com/paywithmybank/paypro/fifththird/rtp/application/command/resume/strategy/ResumeEntryReject.java

- AST chunks: 5 | LLM chunks: 1
- Overlap score: 0.7%
- Coverage valid: ✗

**AST Boundaries:**

| Start | End | Type | Name |
|-------|-----|------|------|
| 20 | 47 | class | ResumeEntryReject |
| 26 | 26 | other | - |
| 27 | 27 | other | - |
| 29 | 41 | function | resume |
| 43 | 46 | function | checkStrategy |

**LLM Boundaries:**

| Start | End | Summary |
|-------|-----|---------|
| 1 | 20 | This chunk defines the package and imports necessary classes for the ResumeEntryReject class. |

### adapters/payment-gateway-fifththird-rtp/src/main/java/com/paywithmybank/paypro/fifththird/rtp/application/command/resume/strategy/ResumeEntryFailover.java

- AST chunks: 5 | LLM chunks: 1
- Overlap score: 100.0%
- Coverage valid: ✓

**AST Boundaries:**

| Start | End | Type | Name |
|-------|-----|------|------|
| 21 | 48 | class | ResumeEntryFailover |
| 27 | 27 | other | - |
| 28 | 28 | other | - |
| 30 | 42 | function | resume |
| 44 | 47 | function | checkStrategy |

**LLM Boundaries:**

| Start | End | Summary |
|-------|-----|---------|
| 1 | 50 | This class implements the ResumeEntryStrategy interface and provides a failover strategy for resume commands. It uses an EntryService to update entries and a MetricsAdapter to track metrics. |

### adapters/payment-gateway-generic-ach/src/test/java/com/paywithmybank/paypro/generic/ach/application/command/process/ProcessReaderImplTest.java

- AST chunks: 14 | LLM chunks: 23
- Overlap score: 30.6%
- Coverage valid: ✗

**AST Boundaries:**

| Start | End | Type | Name |
|-------|-----|------|------|
| 17 | 198 | class | ProcessReaderImplTest |
| 19 | 19 | other | - |
| 21 | 22 | other | - |
| 24 | 26 | function | getSampleAchFile |
| 28 | 30 | function | getSampleIatAchFile |
| 32 | 54 | function | shouldReturnProcessEntriesWhenValidAchFileProvided |
| 56 | 69 | function | shouldReturnProcessEntriesWhenValidIatProcessFileIsProvided |
| 71 | 92 | function | shouldReturnEmptyMapWhenAchFileHasNoBatchHeader |
| 94 | 115 | function | shouldReturnEmptyMapWhenAchFileHasNoEntryDetails |
| 117 | 128 | function | shouldReturnAnExceptionWhenFileDoesNotExist |
| 130 | 142 | function | shouldReturnEmptyMapWhenFileIsEmpty |
| 144 | 158 | function | shouldHandleMultipleBatchHeadersWhenProcessingAchFile |
| 160 | 182 | function | shouldTrimIdentificationWhenProcessingEntries |
| 184 | 197 | function | shouldOverwriteEntryWhenDuplicateIdentificationFound |

**LLM Boundaries:**

| Start | End | Summary |
|-------|-----|---------|
| 1 | 20 | Test class for ProcessReaderImpl. Defines a test fixture with a ProcessReaderImpl instance and a temporary directory. |
| 24 | 27 | Method to retrieve a sample ACH file from the test resources directory. |
| 28 | 30 | Method to retrieve a sample IAT ACH file from the test resources directory. |
| 33 | 44 | Test method to verify that process entries are returned when a valid ACH file is provided. Verifies that the map contains two entries and that both entries have valid data. |
| 47 | 54 | Test method to verify that all entries in the result map have valid data, including identification, external identification, and occurred at timestamps. |
| 56 | 57 | Test method to verify that process entries are returned when a valid IAT process file is provided. Verifies that the result map contains one entry with the correct external identification value. |
| 59 | 64 | Test method to verify that an empty map is returned when an ACH file has no batch header. Verifies that the map is empty and that the process entries are not present. |
| 66 | 69 | Test method to verify that an empty map is returned when an ACH file has no entry details. Verifies that the map is empty and that the process entries are not present. |
| 71 | 72 | Test method to verify that a FileNotFoundException is thrown when a non-existent file is provided. Verifies that the exception message contains the correct file path. |
| 74 | 75 | Method to create an empty ACH file with no batch header and write it to a temporary directory. |
| 77 | 80 | Method to remove batch headers from the content of a sample ACH file and write the modified content back to the original file. |
| 82 | 83 | Method to create an empty ACH file with no entry details and write it to a temporary directory. |
| 85 | 86 | Method to remove entry detail records from the content of a sample ACH file and write the modified content back to the original file. |
| 88 | 89 | Test method to verify that an empty map is returned when a file has no batch header. Verifies that the map is empty and that the process entries are not present. |
| 91 | 92 | Test method to verify that an exception is thrown when a non-existent file is provided. Verifies that the exception message contains the correct file path. |
| 93 | 94 | Method to create an empty ACH file and write it to a temporary directory. |
| 96 | 97 | Method to remove entry detail records from the content of a sample ACH file and write the modified content back to the original file. |
| 99 | 100 | Method to create an empty ACH file with batch header only and write it to a temporary directory. |
| 102 | 103 | Method to remove entry detail records from the content of a sample ACH file and write the modified content back to the original file. |
| 105 | 106 | Method to create an empty ACH file with batch header only and write it to a temporary directory. |
| 108 | 109 | Test method to verify that process entries are returned when multiple batch headers are present in the file. Verifies that the map contains two entries and that both entries have valid data. |
| 111 | 112 | Test method to verify that identification is trimmed when processing entries. Verifies that the identification field does not contain leading or trailing spaces. |
| 114 | 115 | Test method to verify that duplicate identifications are overwritten when reading from a file. Verifies that the map uses identification as key and overwrites duplicates. |

### payment-gateway-server/src/test/acceptance/java/com/paywithmybank/paypro/config/ContextInitializer.java

- AST chunks: 21 | LLM chunks: 1
- Overlap score: 0.0%
- Coverage valid: ✗

**AST Boundaries:**

| Start | End | Type | Name |
|-------|-----|------|------|
| 33 | 196 | class | ContextInitializer |
| 36 | 36 | other | - |
| 37 | 37 | other | - |
| 39 | 39 | other | - |
| 40 | 40 | other | - |
| 41 | 41 | other | - |
| 42 | 42 | other | - |
| 43 | 43 | other | - |
| 45 | 45 | other | - |
| 47 | 61 | function | start |
| 63 | 76 | function | afterPaymentGatewayServerContainerStart |
| 78 | 85 | function | purgeQueueMessages |
| 87 | 125 | function | configurePaymentGatewayServerContainer |
| 128 | 140 | function | configureActiveMQContainer |
| 142 | 146 | function | configureRabbitMQContainer |
| 148 | 151 | function | configureSFTPContainer |
| 153 | 159 | function | cleanupSftp |
| 161 | 171 | function | configureWireMockServer |
| 173 | 182 | function | executeMigrations |
| 184 | 191 | function | configurePostgresContainer |
| 193 | 195 | function | getWireMockUrl |

**LLM Boundaries:**

| Start | End | Summary |
|-------|-----|---------|
| 1 | 33 | Import statements for dependencies and libraries. |

### adapters/payment-gateway-generic-ach/src/test/java/com/paywithmybank/paypro/generic/ach/application/command/returns/ReturnEntriesHandlerTest.java

- AST chunks: 25 | LLM chunks: 13
- Overlap score: 42.1%
- Coverage valid: ✗

**AST Boundaries:**

| Start | End | Type | Name |
|-------|-----|------|------|
| 57 | 256 | class | ReturnEntriesHandlerTest$part1 |
| 257 | 456 | class | ReturnEntriesHandlerTest$part2 |
| 457 | 498 | class | ReturnEntriesHandlerTest$part3 |
| 58 | 59 | other | - |
| 60 | 61 | other | - |
| 62 | 63 | other | - |
| 64 | 65 | other | - |
| 66 | 67 | other | - |
| 68 | 69 | other | - |
| 70 | 71 | other | - |
| 72 | 73 | other | - |
| 75 | 76 | other | - |
| 79 | 137 | function | shouldCallUpdateEntriesForEachReturnFile |
| 139 | 179 | function | shouldReturnCorrectResultData |
| 182 | 223 | function | shouldSkipFailedFileAndContinueProcessing |
| 225 | 250 | function | shouldExtractReturnFilePatternName |
| 252 | 271 | function | shouldIgnoreSftpWhenNoReturnFilePatternNameIsProvided |
| 273 | 347 | function | shouldReturnProcessedAndNonProcessedEntries |
| 349 | 408 | function | shouldCallUpdateNOCEntriesWithCorrectData |
| 410 | 454 | function | shouldHoldEntriesWhenReasonIsInRejectionCodes |
| 456 | 459 | function | assertProcessEntryLog |
| 461 | 466 | function | assertReturnEntryLogs |
| 468 | 470 | function | getReturnEntryValue |
| 472 | 474 | function | getReturnEntryKey |
| 476 | 497 | function | getEntryCoreStub |

**LLM Boundaries:**

| Start | End | Summary |
|-------|-----|---------|
| 1 | 26 | Import statements for the test class and dependencies. |
| 27 | 53 | Mocking dependencies for the test class, including PaymentProcessorService, SftpClientService, SftpService, EntryService, ReturnReader, EntryRepository, Config, and ObjectMapper. |
| 54 | 55 | Extending JUnit with MockitoExtension for mocking dependencies. |
| 56 | 80 | Defining the test class ReturnEntriesHandlerTest, which tests the functionality of the ReturnEntriesHandler class. |
| 81 | 83 | Setting up a given scenario for testing: two files to be returned with different reasons and descriptions. |
| 84 | 112 | Testing that the handle method of ReturnEntriesHandler calls updateEntries for each return file, and verifies the expected results. |
| 113 | 121 | Verifying that the returned entries are correct and the not found entries are also correct. |
| 122 | 137 | Testing that the handle method of ReturnEntriesHandler skips failed files and continues processing successful ones. |
| 138 | 149 | Testing that the handle method of ReturnEntriesHandler calls SFTP list files with the correct pattern name when a payment processor has an sftp configuration. |
| 150 | 159 | Testing that the handle method of ReturnEntriesHandler ignores SFTP configurations without return file patterns when no return file pattern is provided. |
| 160 | 177 | Testing that the handle method of ReturnEntriesHandler registers a new Processed entry log for Submitted entries and updates all those entries to returned with respective returned entry logs. |
| 178 | 200 | Testing that the handle method of ReturnEntriesHandler uses correct entry return data when calling updateNOCEntries. |
| 201 | 217 | Testing that the handle method of ReturnEntriesHandler holds entries when the reason is in rejection codes. |

### payment-gateway-core/src/main/java/com/paywithmybank/paypro/core/entry/EntryCore.java

- AST chunks: 52 | LLM chunks: 30
- Overlap score: 55.5%
- Coverage valid: ✗

**AST Boundaries:**

| Start | End | Type | Name |
|-------|-----|------|------|
| 37 | 236 | class | EntryCore$part1 |
| 237 | 436 | class | EntryCore$part2 |
| 437 | 535 | class | EntryCore$part3 |
| 38 | 38 | other | - |
| 39 | 39 | other | - |
| 40 | 40 | other | - |
| 41 | 41 | other | - |
| 42 | 42 | other | - |
| 43 | 43 | other | - |
| 44 | 44 | other | - |
| 45 | 45 | other | - |
| 46 | 46 | other | - |
| 47 | 47 | other | - |
| 48 | 48 | other | - |
| 49 | 49 | other | - |
| 51 | 51 | other | - |
| 53 | 53 | other | - |
| 54 | 54 | other | - |
| 55 | 55 | other | - |
| 56 | 57 | other | - |
| 59 | 63 | function | setIdAndIdentification |
| 65 | 86 | function | authorize |
| 88 | 105 | function | hold |
| 107 | 123 | function | reauthorize |
| 125 | 151 | function | requestFailover |
| 153 | 156 | function | submitting |
| 158 | 172 | function | submitting |
| 174 | 185 | function | submit |
| 187 | 189 | function | process |
| 191 | 214 | function | process |
| 216 | 243 | function | reject |
| 245 | 294 | function | returnEntry |
| 296 | 315 | function | handleRetryReturned |
| 317 | 320 | function | isSettleable |
| 322 | 349 | function | updateGuarantee |
| 351 | 363 | function | notificationAccountChange |
| 365 | 374 | function | isGuaranteed |
| 376 | 381 | function | checkStatus |
| 383 | 386 | function | updateEntry |
| 388 | 396 | function | updateLog |
| 398 | 410 | function | update |
| 412 | 434 | function | update |
| 436 | 442 | function | takeChanges |
| 444 | 448 | function | registerEvent |
| 450 | 454 | function | takeEvents |
| 456 | 458 | function | incrementRecordVersion |
| 460 | 472 | function | cancel |
| 474 | 490 | function | checkBeforeSettlementCutoff |
| 492 | 508 | function | restoreOriginalEntryAmount |
| 510 | 512 | function | disableEvents |
| 514 | 516 | function | enableEvents |
| 518 | 534 | class | UpdateData |

**LLM Boundaries:**

| Start | End | Summary |
|-------|-----|---------|
| 1 | 18 | Package declaration and imports |
| 19 | 25 | Import of Java classes |
| 26 | 33 | Lombok annotations for logging, getters, and all-args constructors |
| 34 | 36 | Logging annotation configuration |
| 37 | 52 | Class declaration and initialization of fields |
| 53 | 54 | Getter for changes list (transient) |
| 55 | 57 | Getter for events list (transient) |
| 58 | 59 | Boolean flag for changed state |
| 60 | 61 | Setter for id and identification fields |
| 62 | 63 | Update method to set id and identification fields |
| 64 | 87 | Authorize method: updates status, fee, and settlement type |
| 88 | 100 | Hold method: updates status and adds hold event |
| 101 | 104 | Reauthorize method: updates status and adds authorized event |
| 105 | 126 | Request failover method: updates status, fee, and adds failover requested event |
| 127 | 130 | Submit method: updates status and adds submit event |
| 131 | 134 | Process method: updates status, fee, and settlement type |
| 135 | 138 | Reject method: updates status and adds rejected event |
| 139 | 242 | Return entry method: updates status, fee, settlement type, and adds returned event |
| 243 | 267 | Handle retry returned method: updates guarantee status and sets settlement cutoff |
| 268 | 280 | Update log method: adds update event to logs list |
| 281 | 294 | Update method: updates status, fee, settlement type, and sets changes list |
| 295 | 306 | Take changes method: returns changes list and clears changes list |
| 307 | 310 | Register event method: adds event to events list if enabled |
| 311 | 314 | Take events method: returns events list and clears events list |
| 315 | 318 | Increment record version method: increments record version field |
| 319 | 322 | Cancel method: updates status, fee, and adds cancel event |
| 323 | 326 | Check before settlement cutoff method: checks if settlement cutoff is set |
| 327 | 330 | Restore original entry amount method: restores original entry amount field |
| 331 | 334 | Disable events method: sets events enabled flag to false |
| 335 | 338 | Enable events method: sets events enabled flag to true |

## Projected Indexing Time

| Codebase Size | Estimated Time |
|---------------|----------------|
| 500 files | ~205 minutes |
| 2,000 files | ~820 minutes |

Based on average 24592ms per file.

## Failed Files

None — all files processed successfully.

---
*Generated by spike/llm-chunking on 2026-04-10T14:26:00.532Z*