# Per-method MCP discovery: intent

Sections through “Automatic discovery” record earlier versions; see “Finder-only cutover” for the current behavior.

Scope: one `mcp_find` tool in the locally installed `omp-codemode` extension. OMP 19.1.1, unchanged config and execution path. User approved OMP's enabled-tool registry and native schema serialization as the discovery boundary, and one existing read-only Business Central operation for Rex verification.

- R1 / C1: Find enabled MCP tools by exact registered `mcp__` name or by case-insensitive keywords, optionally scoped to an original MCP server name or its unambiguous underscore alias. Favor matches in the method name over description-only matches. Unknown exact names, unmatched words, and unknown or ambiguous server aliases yield `matches: []`. Return one match by default and reject blank queries and limits outside 1–3. Only enabled tools with both `mcpServerName` and `mcpToolName` metadata are eligible.
- R2 / C2: A hit returns its registered name for `tool[name](args)` in Eval, server and original method name, and OMP's serialized argument schema. A schema over 4,096 characters is explicitly omitted with a pointer to native namespace help; never emit a partial schema. Each description is at most 240 characters including the truncation marker. The discovery tool invokes no MCP methods and leaves enabled tool names unchanged. Configuration and native call approvals are out of the change scope.
- R3 / C3: `/codemode off` removes guidance from the next eligible prompt; `/codemode on` restores it. In the isolated fixture, a discovered allowed name executes through native Eval and a discovered denied name produces the native policy denial without reaching the server. In fresh Rex sessions, compare focused discovery against native namespace help: both must identify the same registered Business Central time-zone method; report their observed output sizes without generalizing. Then call only the authorized read through native Eval.

## Trusted boundary

- T1 `omp.getActiveTools()` reports enabled names including Eval-bound MCP tools; `omp.getAllTools()` supplies live registry schemas and `mcpServerName` / `mcpToolName` metadata. Exercised with the synthetic catalog and its disabled method in the real OMP runtime, plus the live lookup in Rex. User approved.
- T2 `toolWireSchema` (OMP's `@oh-my-pi/pi-ai`) serializes the registered input schema. Tested with a required string and an enum in a synthetic server schema. User approved.
- T3 Native `tool[name]` uses existing OMP execution/approval gates. Tested with a fixture write-to-log observation, not a claim about the JavaScript sandbox. User approved.

## Evidence receipt

- C1, C2, C3 (tested): `CODEMODE_TEST_INSTALLED=1 node --test test/codemode.test.mjs` passed 6/6 on OMP 19.1.1. It covers exact lookup, server scope and aliases, disabled and non-MCP tools, name ranking, default and explicit limits, empty matches, input validation, schema size and shape, no server invocations during discovery, native allowed/denied calls, and the existing toggle.
- Negative controls: removing the enabled filter, name ranking, result cap, schema cap, or alias matching each caused the focused integration test to fail at the relevant assertion.
- C3 (tested, Rex): three fresh local Splash/Qwen3.6 sessions compared `mcp_find` with reading `help://eval/businesscentral_admin`, then ran the discovered read-only Business Central time-zone method through native Eval. Both discovery routes identified `mcp__businesscentral_admin_get_time_zones_for_update_settings`; Eval confirmed it returned a time-zone list. No Business Central write was permitted.
- Observed discovery comparison: 22,573 → 276 tool-result bytes (−98.8%), and 29,618 → 24,100 total reported tokens (−18.6%, cached input included). The paired runs used a temporary overlay allowing complete help output and disabling Spotlight result shaping; the production configuration was not changed.

Not promised: a fuzzy semantic retriever, full schema docs for oversized methods, permission discovery from MCP descriptions, or universal savings. Descriptions and schemas are server-controlled result data.

## Automatic discovery

Historical: superseded by the finder-only cutover below.

- R4 / C4: For OMP `before_agent_start` events with reason `prompt`, add a rule to call `mcp_find` first for unknown MCP method names or arguments, skip lookup when both are known, and use full namespace help only as a fallback. Include the rule only with Code Mode on, native JavaScript Eval, `mcp_find`, and at least one enabled native MCP method. The prompt hook itself dispatches no tools.
- T4: The previously approved OMP `before_agent_start` hook delivers prompt guidance and `getActiveTools()` lists the enabled names, including Eval-bound native MCP names. No new execution boundary.
- C4 (tested): `CODEMODE_TEST_INSTALLED=1 node --test test/codemode.test.mjs` passed 8/8. The positive fixture asserts lookup, skip, and fallback rules and no prompt-time tool execution. The toggle, disabled finder, and empty-catalog cases suppress the rule; the existing tests also cover missing Eval and disabled JS. Removing the finder check in an isolated copy failed the disabled-finder assertion.
- Real model sample (tested in Rex): asked for the registered Business Central time-zone method without naming a discovery tool. In a fresh local Splash/Qwen3.6 session, `mcp_find` was the only tool call and the response named `mcp__businesscentral_admin_get_time_zones_for_update_settings`. The method was not executed. Model compliance in other turns is not promised.

## Finder-only cutover

- R5 / C5: Keep `mcp_find` as the sole extension capability. Its model-facing description advises one lookup for an unknown MCP signature, and falling back to native namespace help instead of repeating the lookup if the match or schema is unusable. Known signatures need no lookup. Remove `/codemode` and generic prompt injection; leave native Eval, MCP namespaces, and approval policy alone. This is advice, not runtime enforcement.
- R6 / C6: In a fresh default-profile Rex session, OMP discovers the `mcp-find.js` symlink without an explicit extension flag. For a natural Business Central time-zone lookup, the model's only tool call is `mcp_find`, and its answer names `mcp__businesscentral_admin_get_time_zones_for_update_settings` without executing it.
- Trusted boundary: the previously approved OMP tool registration, metadata and Eval dispatch remain. Removing the prompt hook and slash registration shrinks the extension's authority. Native extension discovery loads the local symlink.
- C5 (tested at `4d5eec5148`): `node --test test/mcp-find.test.mjs` passed both isolated RPC scenarios, including the separate once/skip/fallback checks and the fixture's native Eval allow/deny. Removing the once advice in a scratch copy failed its corresponding assertion.
- C6 (tested at `4d5eec5148`): the default-profile RPC check passed with `MCP_FIND_TEST_INSTALLED=1` and `--test-name-pattern='default profile'`. `mcp.evalNamespaces` still reads `true`. Two fresh Rex sessions with local Qwen3.6 used one `mcp_find` call each, no fallback and no server operation, to identify the real time-zone and app-update methods (23,880 and 23,901 total tokens respectively). These are two samples, not a guaranteed routing or cost claim.
