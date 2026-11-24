# Native MCP Code Mode: intent

Scope: enable OMP 19.1.1's supported `mcp.evalNamespaces` setting in the default local profile after isolated verification. Keep the OMP binary, built-in tool presentation, approval policy, MCP server definitions, and existing Code Mode extension unchanged. The operator chose the native path and approved the native registry/approval contract.

- R1 **C1:** With command mounting disabled to measure complete schemas, a fresh session with namespaces off presents `mcp__roster_fetch_rows` and its peers to the model. With namespaces on and Eval selected, the initial provider request instead keeps Eval and Read but omits those direct MCP tools and `releaseArchiveLookupKey`. A model request for `help://eval/roster` yields the omitted `releaseArchiveLookupKey` declaration for `search_archive_1`. This is tested while the existing extension is explicitly loaded.
- R2 **C2:** A native namespace script calls `roster.fetch_rows` once per region (`alpha`, `bravo`), extracts the confirmed slots, and returns `73,19` without `RAW_ROSTER_ROW` appearing in any wire request. In the isolated profile, `tools.approval.mcp__roster_deny_probe=deny` produces the policy denial with no server log entry; setting the fixture's probe policy to `allow` must reach the server and leave a log entry. No real MCP account, interactive approval dialog or transport error path is exercised.
- R3 **C3:** Measure a one-turn `READY` request with namespaces both ways, with command mounting both off and at the actual default (`true`). Separately compare two valid end-to-end answers `73,19` over two synthetic MCP calls: direct MCP calls exposing results versus one explicit namespace Eval filtering results. Use the same loopback Qwen3.6 model, fresh OMP processes, count every reported input (including cache reads/writes) and output token of the measured user turn, check usage reconciles, and report the actual tool routes. This is an illustrative measurement, not a general savings guarantee.
- R4 **C4:** After isolated checks, write `mcp.evalNamespaces=true` in the default local profile. Verify a new OMP process reads `true`, compare before/after setting fields, and document rollback. Verify setting/reset in an isolated profile; do not roll back the real profile after deployment just to test it.

## Trusted boundary

- T1 OMP session projection and MCP namespace help generation: [SessionTools](https://github.com/can1357/oh-my-pi/blob/v19.1.1/packages/coding-agent/src/session/session-tools.ts) and [namespace catalog](https://github.com/can1357/oh-my-pi/blob/v19.1.1/packages/coding-agent/src/mcp/eval-namespaces.ts). Integration check C1. Approved through the choice of native OMP presentation.
- T2 OMP namespace invocation uses the native Eval bridge and MCP tool's own policy. Integration check C2. Operator explicitly approved this boundary, not a new sandbox.
- T3 OMP reports the local model's usage per model response. Check that prompt and output totals reconcile and that each measured turn reaches a correct answer. Integration measurement C3.
- T4 OMP's config CLI writes the native setting and a new process reads it. Integration check C4.

Not promised: a QuickJS sandbox, Pi's all-tool `only` mode, per-method discovery across every server, or token savings with every model/roster. MCP server instructions are distinct from per-method schemas. Built-in OMP command mounting already defers many MCP schemas; compare it separately from a baseline exposing individual MCP tools.

## Evidence receipt

OMP `19.1.1`, local Splash `Qwen3.6-35B-A3B`, 11 fresh print-mode sessions run in Rex with `node probe.mjs` in a disposable profile. Only the loopback model and synthetic stdio MCP server were used.

| Clause | Label | Evidence |
| --- | --- | --- |
| C1 | Tested | With mounting off, direct MCP methods went from 26 to 0 on the first request, the unused archive schema was absent, and Read/Eval remained declared. Reading `help://eval/roster` surfaced the expected named method and argument. With default mounting, neither first request had direct MCP methods. |
| C2 | Tested | Both Eval trials reached the server for `alpha` and `bravo`, returned `73,19`, and sent no raw fixture rows to the model. Policy denial produced `POLICY_DENY` and no fixture call; the isolated allow control reached the server and was logged. |
| C3 | Tested | First-request input: 12,809 → 4,654 tokens with mounting off (−63.7%); 6,337 → 4,542 with default mounting (−28.3%). Two direct results versus one explicitly scripted, filtered namespace Eval: 30,229 → 9,791 total tokens per session on average (−67.6%, two trials per route). These are different execution strategies, not savings from the setting alone. Usage includes cached input. |
| C4 | Tested | CLI set/get/reset passed in the isolated profile before rollout. On the default profile, the reported config diff contained only the new namespace setting and its CLI metadata; a new process reads `true`. The supported rollback is `omp config reset mcp.evalNamespaces`. |

No native code was patched and no third-party extension was installed. The [QuickJS extension](https://github.com/Zpankz/omp-codemode) requires a patch to OMP 18.12.6, and [provider-neutral Code Mode](https://github.com/can1357/oh-my-pi/pull/15634) was unmerged at verification.
