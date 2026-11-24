# OMP Code Mode: intent

Scope: local `codemode.js` extension; OMP 19.1.1 public extension interface. The user chose default on with direct calls still available and approved the native OMP execution boundary.

## Requirements and clauses

- R1: Make Pi-style code-first tool orchestration available in OMP, on after install. **C1:** A fresh OMP process with an active native JavaScript `eval` starts with Code Mode on. While on and eligible, the model receives guidance to batch dependent or parallel calls via `tool.*` and return selected output; the base prompt and ordinary direct tools remain available. **C2:** When Code Mode is off, `eval` is inactive, or its live schema does not accept JavaScript, the model receives no Code Mode guidance. Check C1 and C2 together to distinguish eligibility from a no-op.
- R2: Let the user control it locally. **C3:** `/codemode off` stops the guidance, and `/codemode on` restores it on the next prompt when eligible. `/codemode` reports the setting and availability. Invalid arguments give usage without changing state.
- R3: Reuse OMP's native runtime and approvals. **C4:** From a turn with the extension's guidance and the native `eval` tool, a JavaScript cell batches two native reads and sends derived output, not the raw reads, in model-facing message content. A native-denied nested write does not create its target. This is an integration check against T3, not an independent security guarantee about Eval, host APIs, or OMP's internal status metadata.
- R4: Install only locally when finished. **C5:** After pre-install evidence C1–C4 passes, native default extension discovery finds `/codemode` from a symlink in the user's extension directory pointing to the local repository. Installation order is a delivery procedure, recorded in the receipt.

## Decisions

- D1: Prefer code for orchestration, direct tools for single calls or direct-only workflows; no tool hiding or forced mode.
- D2: Use OMP's native JavaScript `eval`, not an additional JavaScript runtime. The setting is in memory, defaulting to on in a fresh OMP process. The extension is one source file with no dependencies or core patch.

## Trusted boundary

- T1 `applyCodeMode` / OMP `before_agent_start`: OMP composes returned prompt sections for the next turn and keeps ordinary tool definitions. Test: RPC turns with a scripted provider inspecting its effective prompt and tool definitions. User approved.
- T2 `hasJavaScriptEval` / OMP tool metadata: `getActiveTools` reflects current enablement; `getAllTools` supplies the native Eval schema's own argument predicate. Test: RPC turns with Eval excluded and with JS disabled. User approved native tool APIs and unchanged enablement.
- T3 OMP `eval` and `tool.*`: OMP executes the code and enforces its existing outer and nested tool approvals. Test: two native reads, one configured-denied nested write and the resulting provider context. User approved OMP's native execution boundary, including host APIs.
- T4 OMP native discovery: discovers the local symlink in the default user extensions directory. Test: RPC `get_available_commands` without an explicit extension flag after installation. Authorized by the user's local install request.

## Evidence receipt

Implementation: `d4b32e6a10`. OMP 19.1.1. `node --test test/codemode.test.mjs` passed all four pre-install checks. After linking `~/.omp/agent/extensions/codemode.js` to the verified source, `CODEMODE_TEST_INSTALLED=1 node --test test/codemode.test.mjs` passed all five checks.

| Clause | Evidence | Negative control rejected |
| --- | --- | --- |
| C1 | Tested: fresh RPC turn received guidance, base prompt, and direct tool declarations. | Extension omitted: no guidance. |
| C2 | Tested: no guidance with mode off, Eval excluded, or JavaScript disabled. | Omit language check: incorrectly reports availability with JS disabled. |
| C3 | Tested: status, on/off, and invalid arguments in one RPC session. | Ignore `off`: the next turn still receives guidance. |
| C4 | Tested: two native reads yielded a filtered summary; nested write denial was reported and did not create a file. | Change only the isolated fixture's write policy to allow: denial assertion fails. |
| C5 | Tested: the default profile discovered `/codemode` without an explicit extension path. | Run before linking: command absent. |

T1–T4 are trusted host contracts with the integration tests above. Independent spec and implementation reviews found no remaining findings. No CI or publication was configured for this local-only repository.

## Not promised

Pi's QuickJS sandbox, raw-JavaScript tool wire format, `only` mode, branch-persistent storage, Pi model helpers, or control over whether a particular model follows prompt guidance. OMP's Eval already exposes host APIs; this extension is not a security sandbox or a new source of permissions.

## Sources

- [OMP 19.1.1 extension lifecycle and tool metadata](https://github.com/can1357/oh-my-pi/blob/v19.1.1/docs/extensions.md)
- [OMP 19.1.1 Eval runtime and approval bridge](https://github.com/can1357/oh-my-pi/blob/v19.1.1/docs/tools/eval.md)
- [OMP 19.1.1 extension discovery](https://github.com/can1357/oh-my-pi/blob/v19.1.1/docs/extension-loading.md)
- Pi 1.5.0's installed `@earendil-works/pi-coding-agent/docs/codemode.md`.
